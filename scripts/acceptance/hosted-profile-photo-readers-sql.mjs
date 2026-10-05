// SQL is constructed only from validated journal identities and checked again inside each transaction.
import { catalogSql, literal } from './hosted-account-jwt-sql.mjs';
import { validateReaderState } from './hosted-profile-photo-readers.mjs';

const uuid=v=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v??''))throw Error('sql_uuid');return `${literal(v)}::uuid`;};
const q=v=>literal(v);
const owned=s=>s.fixtures.filter(f=>f.id);
const catalog=s=>`IF (SELECT digest FROM (${catalogSql}) reviewed_catalog) IS DISTINCT FROM ${q(s.pins.catalog)} THEN RAISE EXCEPTION 'reader catalog drift'; END IF;`;
const ownership=s=>owned(s).map(f=>`IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=${uuid(f.id)} AND email=${q(f.email)} AND raw_app_meta_data->>'acceptance_run'=${q(s.runId)} AND created_at=${q(f.createdAt)}::timestamptz AND created_at BETWEEN ${q(s.startedAt)}::timestamptz AND ${q(s.startedAt)}::timestamptz+interval '5 minutes') THEN RAISE EXCEPTION 'reader ownership mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=${uuid(f.id)} AND (email IS DISTINCT FROM ${q(f.email)} OR waitlist_status IS DISTINCT FROM 'standard' OR stripe_customer_id IS NOT NULL OR avatar_url IS NOT NULL)) THEN RAISE EXCEPTION 'reader profile ownership mismatch'; END IF;`).join('\n');
const profilePresence=s=>owned(s).map(f=>`IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=${uuid(f.id)} AND email=${q(f.email)} AND waitlist_status='standard' AND stripe_customer_id IS NULL AND avatar_url IS NULL) THEN RAISE EXCEPTION 'reader profile ownership mismatch'; END IF;`).join('\n');
const profileIds=s=>owned(s).map(f=>uuid(f.id)).join(',');
const owner=s=>uuid(s.fixtures[0].id);
const lockSql=s=>`PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('profile_asset:' || ${owner(s)}::text,0));
 PERFORM 1 FROM auth.users WHERE id IN (${profileIds(s)}) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.profiles WHERE id IN (${profileIds(s)}) ORDER BY id FOR UPDATE;`;

// The friend row is the only fixture friendship; every transition checks exact participants and status.
export function friendMutationSql(s,action) {
  validateReaderState(s);if(!['insert','reject','restore'].includes(action)||owned(s).length!==3)throw Error('friend_boundary');
  const [a,b,c]=s.fixtures.map(f=>uuid(f.id)),id=uuid(s.friendship.id);
  const mutation=action==='insert'
    ? `IF EXISTS(SELECT 1 FROM public."friend pairs" WHERE id=${id} OR friend_1 IN (${a},${b},${c}) OR friend_2 IN (${a},${b},${c})) THEN RAISE EXCEPTION 'reader friendship collision'; END IF;
       INSERT INTO public."friend pairs"(id,friend_1,friend_2,status) VALUES(${id},${a},${b},'accepted');`
    : `UPDATE public."friend pairs" SET status='${action==='reject'?'rejected':'accepted'}' WHERE id=${id} AND friend_1=${a} AND friend_2=${b} AND status='${action==='reject'?'accepted':'rejected'}';
       IF NOT FOUND THEN RAISE EXCEPTION 'reader friendship mismatch'; END IF;`;
  return `DO $reader_friend$ BEGIN ${catalog(s)} ${lockSql(s)} ${ownership(s)} ${profilePresence(s)} ${mutation} END $reader_friend$`;
}

// Teardown locks in publication order, rejects all nonfixture refs and removes only exact run-owned rows.
export function teardownSql(s) {
  validateReaderState(s);if(!s.fixtures[0].id)throw Error('teardown_owner');
  const ids=profileIds(s),a=owner(s),friend=uuid(s.friendship.id);
  const expectedOps=s.objects.slice(1).filter(o=>o.assetId).map((o,i)=>({op:o.operationId,asset:o.assetId,key:o.key,lease:o.leaseEpoch,hash:o.sha256,count:o.byteCount,mime:o.mime,revision:i,completed:o.stage==='published',reserved:['reserved','bound'].includes(o.stage),bound:o.stage==='bound'}));
  if(s.clear.stage==='completed')expectedOps.push({op:s.clear.operationId,asset:null,key:null,lease:null,hash:null,count:null,mime:null,revision:2,completed:true,reserved:false,bound:false});
  const opGuard=`IF (SELECT count(*) FROM profile_asset_private.operations WHERE owner_id=${a})<>${expectedOps.length} THEN RAISE EXCEPTION 'reader unexpected operation'; END IF;\n`+
    expectedOps.map(o=>`IF NOT EXISTS(SELECT 1 FROM profile_asset_private.operations WHERE owner_id=${a} AND operation_id=${uuid(o.op)} AND kind=${q(o.asset?'upload':'delete')} AND expected_revision=${o.revision} AND state=${q(o.completed?'completed':o.reserved?'reserved':'prepared')} AND result_revision IS NOT DISTINCT FROM ${o.completed?o.revision+1:'NULL::bigint'} AND asset_id IS NOT DISTINCT FROM ${o.asset?uuid(o.asset):'NULL::uuid'} AND object_key IS NOT DISTINCT FROM ${o.key?q(o.key):'NULL::text'} AND lease_epoch IS NOT DISTINCT FROM ${o.lease??'NULL::bigint'}${o.hash?o.reserved?` AND normalized_sha256 IS NULL AND mime IS NULL AND byte_count IS NULL AND encode(input_sha256,'hex') IS NOT DISTINCT FROM ${o.bound?q(o.hash):'NULL::text'} AND transform_version IS NOT DISTINCT FROM ${o.bound?q('synthetic-reader-fixture-v1'):'NULL::text'}`:` AND encode(input_sha256,'hex')=${q(o.hash)} AND transform_version=${q('synthetic-reader-fixture-v1')} AND encode(normalized_sha256,'hex')=${q(o.hash)} AND mime=${q(o.mime)} AND width=1 AND height=1 AND byte_count=${o.count}`:''}) THEN RAISE EXCEPTION 'reader operation mismatch'; END IF;`).join('\n');
  const keys=s.objects.filter(o=>o.key&&o.stage!=='deleted').map(o=>q(o.key));
  const expectedCurrent=s.clear.stage==='completed'?null:[...s.objects.slice(1)].reverse().find(o=>o.stage==='published')?.assetId??null;
  const ownerTexts=owned(s).map(f=>q(f.id)).join(','),ownedNames=owned(s).map(f=>`name LIKE ${q(f.id+'/%')}`).join(' OR '),multipartNames=owned(s).map(f=>`key LIKE ${q(f.id+'/%')}`).join(' OR ');
  const keyGuard=`IF EXISTS(SELECT 1 FROM storage.objects WHERE (owner IN (${ids}) OR owner_id IN (${ownerTexts}) OR ${ownedNames}) AND (bucket_id<>'profile-photos' OR name NOT IN (${keys.length?keys.join(','):"''"}))) THEN RAISE EXCEPTION 'reader unexpected object'; END IF;`;
  const protectedRefs=`(SELECT count(*) FROM public.tasks WHERE user_id IN (${ids}))+(SELECT count(*) FROM public."tasks to verify" WHERE "sent by" IN (${ids}))+(SELECT count(*) FROM public.payment_methods WHERE user_id IN (${ids}))+(SELECT count(*) FROM public.payment_holds WHERE user_id IN (${ids}))+(SELECT count(*) FROM public.notifications WHERE user_id IN (${ids}) OR related_user_id IN (${ids}))+(SELECT count(*) FROM profile_name_private.owner_limits WHERE owner_id IN (${ids}))+(SELECT count(*) FROM ante_presets_private.owner_presets WHERE owner_id IN (${ids}))+(SELECT count(*) FROM storage.s3_multipart_uploads WHERE owner_id IN (${ownerTexts}) OR ${multipartNames})+(SELECT count(*) FROM storage.s3_multipart_uploads_parts WHERE owner_id IN (${ownerTexts}) OR ${multipartNames})+(SELECT count(*) FROM storage.buckets WHERE owner IN (${ids}) OR owner_id IN (${ownerTexts}))`;
  return `DO $reader_teardown$ BEGIN
    ${catalog(s)} ${lockSql(s)} ${ownership(s)}
    IF (${protectedRefs})<>0 THEN RAISE EXCEPTION 'reader protected references'; END IF;
    IF EXISTS(SELECT 1 FROM public."friend pairs" WHERE (friend_1 IN (${ids}) OR friend_2 IN (${ids})) AND (id<>${friend} OR friend_1<>${a} OR friend_2<>${uuid(s.fixtures[1].id)} OR status NOT IN ('accepted','rejected'))) THEN RAISE EXCEPTION 'reader foreign friendship'; END IF;
    PERFORM 1 FROM public."friend pairs" WHERE id=${friend} FOR UPDATE;
    PERFORM 1 FROM profile_asset_private.heads WHERE owner_id=${a} FOR UPDATE;
    PERFORM 1 FROM profile_asset_private.operations WHERE owner_id=${a} ORDER BY operation_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM profile_asset_private.heads WHERE owner_id<>${a} AND owner_id IN (${ids})) THEN RAISE EXCEPTION 'reader foreign head'; END IF;
    ${opGuard}
    IF (SELECT count(*) FROM profile_asset_private.heads WHERE owner_id=${a})<>${expectedOps.length?1:0} THEN RAISE EXCEPTION 'reader head mismatch'; END IF;
    IF EXISTS(SELECT 1 FROM profile_asset_private.heads WHERE owner_id=${a} AND (revision<>${s.revision} OR current_asset_id IS DISTINCT FROM ${expectedCurrent?uuid(expectedCurrent):'NULL::uuid'})) THEN RAISE EXCEPTION 'reader head mismatch'; END IF;
    ${keyGuard}
    DELETE FROM public."friend pairs" WHERE id=${friend} AND friend_1=${a} AND friend_2=${uuid(s.fixtures[1].id)};
    DELETE FROM public.profiles WHERE id IN (${ids});
    IF EXISTS(SELECT 1 FROM public.profiles WHERE id IN (${ids})) THEN RAISE EXCEPTION 'reader profile remains'; END IF;
    DELETE FROM profile_asset_private.heads WHERE owner_id=${a};
    DELETE FROM profile_asset_private.operations WHERE owner_id=${a};
  END $reader_teardown$; SELECT (SELECT count(*)::int FROM public.profiles WHERE id IN (${ids})) AS remaining`;
}

// The inventory query scopes Auth/profile/friend/asset/Storage rows to exact fixture IDs and owner prefix.
export function readerInventorySql(s) {
  validateReaderState(s);const fs=owned(s);if(fs.length===0)throw Error('inventory_empty');
  const ids=profileIds(s),emails=fs.map(f=>q(f.email)).join(','),a=s.fixtures[0].id;
  const ownerTexts=fs.map(f=>q(f.id)).join(','),ownedNames=fs.map(f=>`name LIKE ${q(f.id+'/%')}`).join(' OR '),multipartNames=fs.map(f=>`key LIKE ${q(f.id+'/%')}`).join(' OR '),keys=s.objects.filter(o=>o.key&&o.stage!=='deleted').map(o=>q(o.key));
  return `SELECT
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',id::text,'email',email,'marker',raw_app_meta_data->>'acceptance_run','created_at',created_at::text)) FROM auth.users WHERE id IN (${ids}) OR lower(email) IN (${emails})), '[]'::jsonb) AS auth,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',id::text,'email',email,'waitlist_status',waitlist_status,'stripe_customer_id',stripe_customer_id,'avatar_url',avatar_url)) FROM public.profiles WHERE id IN (${ids}) OR lower(email) IN (${emails})), '[]'::jsonb) AS profiles,
    coalesce((SELECT jsonb_agg(to_jsonb(f)) FROM public."friend pairs" f WHERE friend_1 IN (${ids}) OR friend_2 IN (${ids})), '[]'::jsonb) AS friends,
    coalesce((SELECT jsonb_agg(to_jsonb(h)) FROM profile_asset_private.heads h WHERE owner_id IN (${ids})), '[]'::jsonb) AS heads,
    coalesce((SELECT jsonb_agg(jsonb_build_object('owner_id',owner_id::text,'operation_id',operation_id::text,'kind',kind,'expected_revision',expected_revision,'state',state,'asset_id',asset_id::text,'object_key',object_key,'lease_epoch',lease_epoch,'input_sha256',encode(input_sha256,'hex'),'normalized_sha256',encode(normalized_sha256,'hex'),'transform_version',transform_version,'mime',mime,'width',width,'height',height,'byte_count',byte_count,'result_revision',result_revision)) FROM profile_asset_private.operations o WHERE owner_id IN (${ids})), '[]'::jsonb) AS operations,
    coalesce((SELECT jsonb_agg(jsonb_build_object('name',name)) FROM storage.objects WHERE bucket_id='profile-photos' AND name LIKE ${q(a+'/%')}), '[]'::jsonb) AS objects,
    ((SELECT count(*) FROM public.tasks WHERE user_id IN (${ids}))+(SELECT count(*) FROM public."tasks to verify" WHERE "sent by" IN (${ids}))+(SELECT count(*) FROM public.payment_methods WHERE user_id IN (${ids}))+(SELECT count(*) FROM public.payment_holds WHERE user_id IN (${ids}))+(SELECT count(*) FROM public.notifications WHERE user_id IN (${ids}) OR related_user_id IN (${ids}))+(SELECT count(*) FROM profile_name_private.owner_limits WHERE owner_id IN (${ids}))+(SELECT count(*) FROM ante_presets_private.owner_presets WHERE owner_id IN (${ids}))+(SELECT count(*) FROM storage.s3_multipart_uploads WHERE owner_id IN (${ownerTexts}) OR ${multipartNames})+(SELECT count(*) FROM storage.s3_multipart_uploads_parts WHERE owner_id IN (${ownerTexts}) OR ${multipartNames})+(SELECT count(*) FROM storage.buckets WHERE owner IN (${ids}) OR owner_id IN (${ownerTexts}))+(SELECT count(*) FROM storage.objects WHERE (owner IN (${ids}) OR owner_id IN (${ownerTexts}) OR ${ownedNames}) AND (bucket_id<>'profile-photos' OR name NOT IN (${keys.length?keys.join(','):"''"}))))::int AS protected`;
}
