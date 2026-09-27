// Fixed SQL vocabulary. Every literal comes from the exact-shape mediated journal.
import { catalogSql, literal as q } from './hosted-account-jwt-sql.mjs';
import { validateMediatedState } from './hosted-profile-photo-mediated.mjs';
import { PHOTO_CASES } from './hosted-profile-photo-mediated-protocol.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const uid=v=>v===null?'NULL::uuid':`${q(v)}::uuid`;
const ids=s=>s.fixtures.filter(f=>f.id).map(f=>uid(f.id)).join(',')||'NULL::uuid';
const scope=s=>`SELECT id FROM (VALUES ${s.fixtures.map(f=>'('+uid(f.id)+')').join(',')}) bound(id) WHERE id IS NOT NULL UNION SELECT id FROM auth.users WHERE id IN (${ids(s)}) OR lower(email) IN (${s.fixtures.map(f=>q(f.email)).join(',')}) UNION SELECT id FROM public.profiles WHERE id IN (${ids(s)}) OR lower(email) IN (${s.fixtures.map(f=>q(f.email)).join(',')})`;
const catalog=s=>`IF (SELECT digest FROM (${catalogSql}) c) IS DISTINCT FROM ${q(s.pins.catalog)} THEN RAISE EXCEPTION 'mediated catalog drift'; END IF;`;
const refs=(target,privateOnly=false)=>{
 const regular=[['public.tasks','user_id'],['public."tasks to verify"','"sent by"'],['public.payment_methods','user_id'],['public.payment_holds','user_id']].map(([t,k])=>`(SELECT count(*) FROM ${t} WHERE ${k} IN (${target}))`);
 const priv=['profile_name_private.owner_limits','ante_presets_private.owner_presets'].map(t=>`(SELECT count(*) FROM ${t} WHERE owner_id IN (${target}))`);
 if(privateOnly)return priv.join('+');
 return [...regular,...priv,`(SELECT count(*) FROM public.notifications WHERE user_id IN (${target}) OR related_user_id IN (${target}))`,...['storage.s3_multipart_uploads','storage.s3_multipart_uploads_parts'].map(t=>`(SELECT count(*) FROM ${t} WHERE owner_id IN (SELECT id::text FROM (${target}) x) OR EXISTS(SELECT 1 FROM (${target}) x WHERE x.id::text=ANY(string_to_array(key,'/'))))`),`(SELECT count(*) FROM storage.buckets WHERE owner IN (${target}) OR owner_id IN (SELECT id::text FROM (${target}) x))`].join('+');
};
const storageScope=target=>`(owner IN (${target}) OR owner_id IN (SELECT id::text FROM (${target}) x) OR EXISTS(SELECT 1 FROM (${target}) x WHERE x.id::text=ANY(string_to_array(name,'/'))))`;
const aggregate=(source,expression='to_jsonb(r)')=>`coalesce((SELECT jsonb_agg(${expression}) FROM ${source}), '[]'::jsonb)`;
const authFields="jsonb_build_object('id',id::text,'email',email,'marker',raw_app_meta_data->>'acceptance_run','created_at',to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'))";
const profileFields="jsonb_build_object('id',id::text,'email',email,'waitlist_status',waitlist_status,'stripe_customer_id',stripe_customer_id,'avatar_url',avatar_url)";

/** Unrestricted inventory includes foreign ownership references, not caller-RLS-filtered rows. */
export function mediatedInventorySql(s){
 validateMediatedState(s);const target=scope(s),keys=s.objects.filter(o=>o.key).map(o=>q(o.key)).join(',')||"''";
 return `SELECT ${aggregate(`auth.users r WHERE id IN (${target})`,authFields)} AS auth,
 ${aggregate(`public.profiles r WHERE id IN (${target})`,profileFields)} AS profiles,
 ${aggregate(`public."friend pairs" r WHERE friend_1 IN (${target}) OR friend_2 IN (${target})`)} AS friends,
 ${aggregate(`profile_asset_private.heads r WHERE owner_id IN (${target})`)} AS heads,
 ${aggregate(`profile_asset_private.operations r WHERE owner_id IN (${target})`,"to_jsonb(r) || jsonb_build_object('input_sha256',encode(input_sha256,'hex'),'normalized_sha256',encode(normalized_sha256,'hex'))")} AS operations,
 ${aggregate(`storage.objects r WHERE ${storageScope(target)} OR (bucket_id='profile-photos' AND name IN (${keys}))`,"jsonb_build_object('name',name,'bucket_id',bucket_id,'owner',owner,'owner_id',owner_id)")} AS objects,
 (${refs(target)})::int AS protected`;
}

/** One fixed CLI slot supplies creation reconciliation and the complete final Auth-delete reference proof. */
export function mediatedFixtureSql(s,label){
 validateMediatedState(s);need(['A','B','C'].includes(label),'fixture_label');const f=s.fixtures.find(f=>f.label===label),target=`SELECT ${uid(f.id)} AS id WHERE ${uid(f.id)} IS NOT NULL UNION SELECT id FROM auth.users WHERE id=${uid(f.id)} OR lower(email)=${q(f.email)} UNION SELECT id FROM public.profiles WHERE id=${uid(f.id)} OR lower(email)=${q(f.email)}`;
 const extra=[`(SELECT count(*) FROM public."friend pairs" WHERE friend_1 IN (${target}) OR friend_2 IN (${target}))`,...['heads','operations'].map(t=>`(SELECT count(*) FROM profile_asset_private.${t} WHERE owner_id IN (${target}))`),`(SELECT count(*) FROM storage.objects WHERE ${storageScope(target)})`];
 return `SELECT ${aggregate(`auth.users r WHERE id IN (${target})`,authFields)} AS auth, ${aggregate(`public.profiles r WHERE id IN (${target})`,profileFields)} AS profiles, (${refs(target)})::int AS protected, (${refs(target,true)})::int AS "privateRows", (${extra.join('+')})::int AS references`;
}
const locks=s=>`${s.fixtures[0].id?`PERFORM pg_advisory_xact_lock(hashtextextended('profile_asset:'||${q(s.fixtures[0].id)},0));`:''}
 PERFORM 1 FROM auth.users WHERE id IN (${ids(s)}) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM public.profiles WHERE id IN (${ids(s)}) ORDER BY id FOR UPDATE;`;
const ownership=s=>s.fixtures.filter(f=>f.id&&f.stage!=='cleaned').map(f=>`IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=${uid(f.id)} AND email=${q(f.email)} AND raw_app_meta_data->>'acceptance_run'=${q(s.runId)} AND created_at=${q(f.createdAt)}::timestamptz AND created_at BETWEEN ${q(s.startedAt)}::timestamptz AND ${q(s.startedAt)}::timestamptz+interval '5 minutes') THEN RAISE EXCEPTION 'mediated ownership mismatch'; END IF;
 ${f.stage==='created'?`IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=${uid(f.id)}) THEN RAISE EXCEPTION 'mediated missing created profile'; END IF;`:''}
 IF EXISTS(SELECT 1 FROM public.profiles WHERE id=${uid(f.id)} AND (email IS DISTINCT FROM ${q(f.email)} OR waitlist_status IS DISTINCT FROM 'standard' OR stripe_customer_id IS NOT NULL OR avatar_url IS NOT NULL)) THEN RAISE EXCEPTION 'mediated profile ownership mismatch'; END IF;`).join('\n');

/** Friendship transitions require exactly owned participants and the previous committed status. */
export function mediatedFriendSql(s,action){
 validateMediatedState(s);need(['insert','reject','restore'].includes(action)&&s.fixtures.every(f=>f.id),'friend_boundary');const [a,b]=s.fixtures.map(f=>uid(f.id)),friend=uid(s.friendship.id);
 const mutation=action==='insert'?`IF EXISTS(SELECT 1 FROM public."friend pairs" WHERE id=${friend} OR friend_1 IN (${ids(s)}) OR friend_2 IN (${ids(s)})) THEN RAISE EXCEPTION 'friend collision'; END IF; INSERT INTO public."friend pairs"(id,friend_1,friend_2,status) VALUES (${friend},${a},${b},'accepted');`:`UPDATE public."friend pairs" SET status='${action==='reject'?'rejected':'accepted'}' WHERE id=${friend} AND friend_1=${a} AND friend_2=${b} AND status='${action==='reject'?'accepted':'rejected'}'; IF NOT FOUND THEN RAISE EXCEPTION 'friend mismatch'; END IF;`;
 return `DO $mediated$ BEGIN ${catalog(s)} ${locks(s)} ${ownership(s)} IF (SELECT count(*) FROM public.profiles WHERE id IN (${ids(s)}))<>3 THEN RAISE EXCEPTION 'missing profiles'; END IF; ${mutation} END $mediated$`;
}

/** Match all authority fields, including NULL manifest fields on reserved and clear operations. */
function operationPredicate(s,o,index){
 const completed=['published','delete_intent','deleted'].includes(o.stage),reserved=['reserved','bound','bind_intent','bind_uncertain','prepare_intent','prepare_uncertain'].includes(o.stage),bound=['bound','prepare_intent','prepare_uncertain'].includes(o.stage);
 const fields={owner_id:s.fixtures[0].id,operation_id:o.operationId,kind:'upload',expected_revision:index,state:completed?'completed':reserved?'reserved':'prepared',result_revision:completed?index+1:null,asset_id:o.assetId,object_key:o.key,lease_epoch:o.leaseEpoch,input_sha256:reserved&&!bound?null:o.sha256,normalized_sha256:reserved?null:o.sha256,transform_version:reserved&&!bound?null:'synthetic-mediated-reader-v1',mime:reserved?null:o.mime,width:reserved?null:1,height:reserved?null:1,byte_count:reserved?null:o.byteCount};
 return `r @> ${q(JSON.stringify(fields))}::jsonb`;
}

/** Teardown is one transaction for partial or complete fixtures, in publication lock order. */
export function mediatedTeardownSql(s){
 validateMediatedState(s);const a=uid(s.fixtures[0].id),b=uid(s.fixtures[1].id),expected=s.objects.map((o,i)=>({o,i})).filter(({o})=>o.assetId),hasClear=s.clear.stage==='completed';
 need(s.objects.every(o=>!['reserve_intent','reserve_uncertain','publish_intent','publish_uncertain','upload_intent','upload_uncertain'].includes(o.stage))&&!['intent','uncertain'].includes(s.clear.stage),'authority_uncertain');
 const current=hasClear?null:[...s.objects].reverse().find(o=>['published','delete_intent','deleted'].includes(o.stage))?.assetId??null;
 const opChecks=expected.map(({o,i})=>`IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'operations') r WHERE ${operationPredicate(s,o,i)}) THEN RAISE EXCEPTION 'mediated operation mismatch'; END IF;`).join('\n');
 const clear={owner_id:s.fixtures[0].id,operation_id:s.clear.operationId,kind:'delete',expected_revision:2,state:'completed',result_revision:3,asset_id:null,object_key:null,lease_epoch:null,input_sha256:null,normalized_sha256:null,transform_version:null,mime:null,width:null,height:null,byte_count:null};
 const keys=s.objects.filter(o=>o.key&&o.uploadAttempts>0&&o.stage!=='deleted').map(o=>q(o.key)).join(',')||"''";
 return `DO $mediated$ DECLARE v jsonb; BEGIN ${catalog(s)} ${locks(s)} ${ownership(s)}
 PERFORM 1 FROM public."friend pairs" WHERE friend_1 IN (${ids(s)}) OR friend_2 IN (${ids(s)}) ORDER BY id FOR UPDATE;
 PERFORM 1 FROM profile_asset_private.heads WHERE owner_id IN (${ids(s)}) ORDER BY owner_id FOR UPDATE;
 PERFORM 1 FROM profile_asset_private.operations WHERE owner_id IN (${ids(s)}) ORDER BY operation_id FOR UPDATE;
 SELECT to_jsonb(r) INTO v FROM (${mediatedInventorySql(s)}) r;
 IF (v->>'protected')::int<>0 THEN RAISE EXCEPTION 'mediated protected references'; END IF;
 IF EXISTS(SELECT 1 FROM public."friend pairs" WHERE (friend_1 IN (${ids(s)}) OR friend_2 IN (${ids(s)})) AND (id<>${uid(s.friendship.id)} OR friend_1 IS DISTINCT FROM ${a} OR friend_2 IS DISTINCT FROM ${b} OR status NOT IN ('accepted','rejected'))) THEN RAISE EXCEPTION 'mediated foreign friendship'; END IF;
 IF jsonb_array_length(v->'operations')<>${expected.length+(hasClear?1:0)} THEN RAISE EXCEPTION 'mediated unexpected operation'; END IF; ${opChecks}
 ${hasClear?`IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v->'operations') r WHERE r @> ${q(JSON.stringify(clear))}::jsonb) THEN RAISE EXCEPTION 'mediated clear mismatch'; END IF;`:''}
 IF jsonb_array_length(v->'heads')<>${expected.length||hasClear?1:0} OR EXISTS(SELECT 1 FROM profile_asset_private.heads WHERE owner_id IN (${ids(s)}) AND (owner_id IS DISTINCT FROM ${a} OR revision<>${s.revision} OR current_asset_id IS DISTINCT FROM ${uid(current)})) THEN RAISE EXCEPTION 'mediated head mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v->'objects') r WHERE r->>'bucket_id'<>'profile-photos' OR r->>'name' NOT IN (${keys}) OR (r->>'owner' IS NOT NULL AND r->>'owner' IS DISTINCT FROM ${q(s.fixtures[0].id??'')}) OR (r->>'owner_id' IS NOT NULL AND r->>'owner_id' IS DISTINCT FROM ${q(s.fixtures[0].id??'')})) THEN RAISE EXCEPTION 'mediated unexpected object'; END IF;
 DELETE FROM public."friend pairs" WHERE id=${uid(s.friendship.id)} AND friend_1=${a} AND friend_2=${b};
 DELETE FROM public.profiles WHERE id IN (${ids(s)});
 DELETE FROM profile_asset_private.heads WHERE owner_id=${a};
 DELETE FROM profile_asset_private.operations WHERE owner_id=${a};
 END $mediated$; SELECT (SELECT count(*) FROM public.profiles WHERE id IN (${ids(s)}))::int AS remaining`;
}

/** Admission scope is derived from reserved website cases, never from newly discovered digests. */
export function mediatedAdmissionLimits(s){
 validateMediatedState(s);const result=new Map();const p=s.preparation;if(p.visitorDigest)result.set(p.visitorDigest,0);p.userDigests.forEach(d=>{if(d)result.set(d,0);});
 for(const intent of s.intents.filter(i=>i.phase==='run'&&i.descriptor.kind==='photo')){const c=PHOTO_CASES[intent.descriptor.caseId-1];if(p.visitorDigest)result.set(p.visitorDigest,result.get(p.visitorDigest)+1);if(c.actor!=='N'){const d=p.userDigests['ABC'.indexOf(c.actor)];if(d)result.set(d,result.get(d)+1);}}
 return result;
}

/** Read every admission row; exact deletion repeats interval, count and immutable-row checks under digest locks. */
export function mediatedAdmissionsSql(s,action){
 validateMediatedState(s);need(['inspect','delete'].includes(action),'admission_action');
 const inspect=`SELECT id::text AS id,visitor_hash AS digest,to_char(admitted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt" FROM website_callback_private.admissions ORDER BY id`;
 if(action==='inspect')return inspect;
 need(s.baseline?.find(r=>r.table==='website_callback_private.admissions')?.count===0,'admission_baseline');need(!s.uncertainWebsite||s.settlement!==null,'settlement_required');
 const limits=mediatedAdmissionLimits(s),digests=[...limits.keys()].sort(),end=s.settlement?.issued_at??s.cleanupStartedAt;need(end,'admission_interval');
 const rows=s.admissionRows.map(r=>`(${q(r.id)}::bigint,${q(r.digest)},${q(r.createdAt)}::timestamptz)`).join(',');const known=rows?`VALUES ${rows}`:'SELECT NULL::bigint,NULL::text,NULL::timestamptz WHERE false';
 return `DO $mediated$ BEGIN ${catalog(s)}
 ${digests.map(d=>`PERFORM pg_advisory_xact_lock(hashtextextended(${q(d)},0));`).join('\n')}
 IF EXISTS(SELECT 1 FROM website_callback_private.admissions a WHERE NOT EXISTS(SELECT 1 FROM (${known}) AS k(id,digest,at) WHERE a.id=k.id AND a.visitor_hash=k.digest AND a.admitted_at=k.at)) THEN RAISE EXCEPTION 'mediated unknown or changed admission'; END IF;
 IF EXISTS(SELECT 1 FROM website_callback_private.admissions WHERE visitor_hash NOT IN (${digests.map(q).join(',')||"''"}) OR admitted_at<${q(s.startedAt)}::timestamptz OR admitted_at>${q(end)}::timestamptz) THEN RAISE EXCEPTION 'mediated admission interval'; END IF;
 ${[...limits].map(([d,n])=>`IF (SELECT count(*) FROM (${known}) k(id,digest,at) WHERE digest=${q(d)})>${n} THEN RAISE EXCEPTION 'mediated admission count'; END IF;`).join('\n')}
 DELETE FROM website_callback_private.admissions a USING (${known}) k(id,digest,at) WHERE a.id=k.id AND a.visitor_hash=k.digest AND a.admitted_at=k.at;
 END $mediated$; SELECT count(*)::int AS remaining FROM website_callback_private.admissions`;
}
