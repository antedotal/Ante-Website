// Only the exact fixture profile DELETE is a SQL mutation. All other SQL is read-only.
export const TABLES=['ante_presets_private.owner_presets','profile_asset_private.heads','profile_asset_private.operations','profile_name_private.owner_limits','public.friend pairs','public.notifications','public.payment_holds','public.payment_methods','public.profiles','public.task verification information','public.tasks','public.tasks to verify','public.waitlist','storage.buckets','storage.buckets_analytics','storage.buckets_vectors','storage.migrations','storage.objects','storage.s3_multipart_uploads','storage.s3_multipart_uploads_parts','storage.vector_indexes','website_callback_private.admissions'];
export function literal(s) { if(typeof s!=='string'||s.includes('\0'))throw Error('sql_literal');return `'${s.replaceAll("'","''")}'`; }
const ident=s=>`"${s.replaceAll('"','""')}"`;
const table=t=>t.split('.').map(ident).join('.');
const uuid=s=>{if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s))throw Error('sql_uuid');return `${literal(s)}::uuid`;};
const schemaFilter="(n.nspname IN ('public','auth','storage') OR n.nspname LIKE '%\\_private')";
// Ordered metadata only: includes every FK from ANY schema to Auth/profiles, function bodies,
// defaults, triggers, grants, role inheritance and policies. Never reads Auth record secrets.
export const catalogSql=`WITH scoped AS (SELECT n.oid FROM pg_namespace n WHERE ${schemaFilter}), metadata AS (
 SELECT 'namespace:'||n.nspname AS key, jsonb_build_array(n.nspowner,n.nspacl)::text AS value FROM pg_namespace n WHERE n.oid IN (SELECT oid FROM scoped)
 UNION ALL SELECT 'relation:'||n.nspname||'.'||c.relname,jsonb_build_array(c.relkind,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.oid IN (SELECT oid FROM scoped) AND c.relkind IN ('r','p','v','m','S')
 UNION ALL SELECT 'column:'||n.nspname||'.'||c.relname||'.'||a.attname,jsonb_build_array(a.attnum,a.atttypid,a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid))::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.oid IN (SELECT oid FROM scoped) AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'constraint:'||c.conrelid::regclass::text||'.'||c.conname,pg_get_constraintdef(c.oid) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.oid IN (SELECT oid FROM scoped) OR c.confrelid IN ('auth.users'::regclass,'public.profiles'::regclass)
 UNION ALL SELECT 'function:'||n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_array(pg_get_functiondef(p.oid),p.proowner,p.proacl)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.oid IN (SELECT oid FROM scoped) AND p.prokind IN ('f','p')
 UNION ALL SELECT 'trigger:'||t.tgrelid::regclass::text||'.'||t.tgname,jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled,pg_get_functiondef(t.tgfoid))::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.oid IN (SELECT oid FROM scoped) AND NOT t.tgisinternal
 UNION ALL SELECT 'policy:'||p.schemaname||'.'||p.tablename||'.'||p.policyname,to_jsonb(p)::text FROM pg_policies p
 UNION ALL SELECT 'role:'||r.rolname,jsonb_build_array(r.rolsuper,r.rolinherit,r.rolbypassrls,r.rolconfig)::text FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','postgres','supabase_auth_admin')
 UNION ALL SELECT 'membership:'||roleid::regrole::text||':'||member::regrole::text,jsonb_build_array(admin_option,inherit_option,set_option)::text FROM pg_auth_members
) SELECT encode(sha256(convert_to(string_agg(key||'='||value,E'\\n' ORDER BY key COLLATE "C",value COLLATE "C"),'UTF8')),'hex') AS digest FROM metadata`;
export const grantSql=`SELECT
 (SELECT count(*)=7 AND bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('profile_photo_state_v1','reserve_profile_photo_v1','bind_profile_photo_input_v1','prepare_profile_photo_v1','publish_profile_photo_v1','replay_profile_photo_v1','clear_profile_photo_v1')) AS photo_denied,
 (SELECT count(*)=4 AND bool_and(NOT has_function_privilege('anon',p.oid,'EXECUTE') AND has_function_privilege('authenticated',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('get_my_profile_name','set_my_profile_name','get_my_ante_presets','set_my_ante_presets')) AS account_grants,
 NOT has_column_privilege('authenticated','public.profiles','full_name','UPDATE') AND NOT has_column_privilege('authenticated','public.profiles','email','UPDATE') AND NOT has_column_privilege('authenticated','public.profiles','updated_at','UPDATE') AS direct_denied`;
export function preservationSql() {
  return TABLES.map(t=>`SELECT ${literal(t)} AS "table", count(*)::int AS count, encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\\n' ORDER BY to_jsonb(r)::text COLLATE "C"),''),'UTF8')),'hex') AS digest FROM ${table(t)} r`).join('\nUNION ALL\n')+' ORDER BY 1';
}
export function collisionSql(fixtures) {
  return fixtures.map(f=>`SELECT ((SELECT count(*) FROM auth.users WHERE lower(email)=lower(${literal(f.email)}))+(SELECT count(*) FROM public.profiles WHERE lower(email)=lower(${literal(f.email)}))+(SELECT count(*) FROM public.waitlist WHERE lower(email)=lower(${literal(f.email)})))::int AS count`).join(' UNION ALL ');
}
export function reconcileSql(f) {
  return `SELECT id::text,email,created_at,raw_app_meta_data->>'acceptance_run' AS marker FROM auth.users WHERE lower(email)=lower(${literal(f.email)}) LIMIT 2`;
}
export function fixtureSql(f,runId,startedAt,expectedCatalog=null) {
  const id=uuid(f.id);uuid(runId);
  if(!Number.isFinite(Date.parse(startedAt))||!Number.isFinite(Date.parse(f.createdAt)))throw Error('sql_timestamp');
  const ownership=`id=${id} AND email=${literal(f.email)} AND raw_app_meta_data->>'acceptance_run'=${literal(runId)} AND created_at=${literal(f.createdAt)}::timestamptz AND created_at>=${literal(startedAt)}::timestamptz AND created_at<=${literal(startedAt)}::timestamptz+interval '5 minutes'`;
  const protectedChecks=[
    ['public.tasks',`user_id=${id}`],['public.tasks to verify',`"sent by"=${id}`],['public.friend pairs',`friend_1=${id} OR friend_2=${id}`],['public.payment_methods',`user_id=${id}`],['public.payment_holds',`user_id=${id}`],['public.notifications',`user_id=${id} OR related_user_id=${id}`],['profile_asset_private.heads',`owner_id=${id}`],['profile_asset_private.operations',`owner_id=${id}`],
    ['storage.objects',`owner=${id} OR owner_id=${literal(f.id)} OR ${literal(f.id)}=ANY(string_to_array(name,'/'))`],
    ['storage.s3_multipart_uploads',`owner_id=${literal(f.id)} OR ${literal(f.id)}=ANY(string_to_array(key,'/'))`],
    ['storage.s3_multipart_uploads_parts',`owner_id=${literal(f.id)} OR ${literal(f.id)}=ANY(string_to_array(key,'/'))`],
    ['storage.buckets',`owner=${id} OR owner_id=${literal(f.id)}`],
  ];
  const protectedCount=protectedChecks.map(([t,where])=>`(SELECT count(*) FROM ${table(t)} WHERE ${where})`).join('+');
  const privateRows=`(SELECT count(*) FROM profile_name_private.owner_limits WHERE owner_id=${id})+(SELECT count(*) FROM ante_presets_private.owner_presets WHERE owner_id=${id})`;
  const profileOk=`NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=${id} AND (email IS DISTINCT FROM ${literal(f.email)} OR waitlist_status IS DISTINCT FROM 'standard' OR stripe_customer_id IS NOT NULL OR avatar_url IS NOT NULL))`;
  return {inspect:`SELECT (NOT EXISTS(SELECT 1 FROM auth.users WHERE id=${id} AND (${ownership}) IS NOT TRUE) AND ${profileOk}) AS owned, (SELECT count(*)::int FROM auth.users WHERE id=${id}) AS auth, (SELECT count(*)::int FROM public.profiles WHERE id=${id}) AS profile, (${protectedCount})::int AS protected, (${privateRows})::int AS "privateRows"`,
    remove:`DO $guarded_cleanup$ BEGIN
      IF ${(expectedCatalog&&/^[a-f0-9]{64}$/.test(expectedCatalog))?`(SELECT digest FROM (${catalogSql}) pinned) IS DISTINCT FROM ${literal(expectedCatalog)}`:'true'} THEN RAISE EXCEPTION 'catalog drift or missing pin'; END IF;
      PERFORM 1 FROM auth.users WHERE id=${id} FOR UPDATE;
      IF NOT EXISTS(SELECT 1 FROM auth.users WHERE ${ownership}) THEN RAISE EXCEPTION 'fixture ownership mismatch'; END IF;
      PERFORM 1 FROM public.profiles WHERE id=${id} FOR UPDATE;
      IF NOT (${profileOk}) THEN RAISE EXCEPTION 'profile ownership mismatch'; END IF;
      IF (${protectedCount})<>0 THEN RAISE EXCEPTION 'protected fixture references'; END IF;
      DELETE FROM public.profiles WHERE id=${id} AND email=${literal(f.email)} AND waitlist_status='standard';
      IF EXISTS(SELECT 1 FROM public.profiles WHERE id=${id}) THEN RAISE EXCEPTION 'profile remains'; END IF;
    END $guarded_cleanup$; SELECT count(*)::int AS remaining FROM public.profiles WHERE id=${id}`,
    quota:`SELECT count(*)::int AS count, encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\\n' ORDER BY to_jsonb(r)::text),''),'UTF8')),'hex') AS digest FROM profile_name_private.owner_limits r WHERE owner_id=${id}`};
}
