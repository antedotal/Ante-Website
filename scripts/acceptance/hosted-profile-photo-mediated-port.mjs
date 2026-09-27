// Fixed run operations; provider construction is explicit and all secrets stay in private closures.
import { randomBytes, createHash } from 'node:crypto';
import { ORIGIN, validateCredentials, reconcileCreate } from './hosted-account-jwt.mjs';
import { catalogSql, preservationSql, collisionSql } from './hosted-account-jwt-sql.mjs';
import { syntheticReaderBytes } from './hosted-profile-photo-readers.mjs';
import { reserveDispatch, validateMediatedState, mediatedPreparationIntent } from './hosted-profile-photo-mediated.mjs';
import { PHOTO_CASES, MATRIX_KEYS, directMatrix } from './hosted-profile-photo-mediated-protocol.mjs';
import { mediatedFixtureSql, mediatedInventorySql, mediatedFriendSql, mediatedAdmissionsSql } from './hosted-profile-photo-mediated-sql.mjs';
import { cleanupMediated, reconcileMediatedAdmissions } from './hosted-profile-photo-mediated-cleanup.mjs';
import { createMediatedHttp } from './hosted-profile-photo-mediated-http.mjs';
import { sessionCookies, sessionFromCookies, cookieHeader } from './hosted-profile-photo-mediated-cookies.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const json=r=>{try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(r.bytes));}catch{throw Error('provider_json');}};
const ok=r=>{need(r.status===200,'provider_status');return json(r);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const POSTCONDITIONS=Object.freeze(['manifest_shape_owner','manifest_exact_execute_acl','private_schema_table_grants','exact_resolver_and_helper_definitions_acls','exact_seven_rpc_definitions_acls','safe_ordinary_roles','resolver_grant','private_helper','safe_function_shapes','operation_scoped_policy','storage_policy_inventory','operation_helper_shape','private_bucket','service_rpc_grants']);
const EMPTY_SQL="SELECT (SELECT count(*)::int FROM storage.objects WHERE bucket_id='profile-photos') AS objects,(SELECT count(*)::int FROM profile_asset_private.heads) AS heads,(SELECT count(*)::int FROM profile_asset_private.operations) AS operations,(SELECT count(*)::int FROM storage.s3_multipart_uploads WHERE bucket_id='profile-photos') AS multipart,(SELECT count(*)::int FROM storage.s3_multipart_uploads_parts WHERE bucket_id='profile-photos') AS parts,(SELECT count(*)::int FROM website_callback_private.admissions) AS admissions";
const CACHE={'cache-control':'private, no-store','cdn-cache-control':'no-store','cloudflare-cdn-cache-control':'no-store',pragma:'no-cache',expires:'0'};

/** Validate no-store policy on both success and denial; cache evidence must never be bypassed. */
export function assertPhotoResponse(r,expected){
 for(const [name,value] of Object.entries(CACHE))need(r.headers.get(name)===value,'photo_cache');
 need(r.headers.get('vary')?.split(',').some(v=>v.trim().toLowerCase()==='cookie'),'photo_cache');
 for(const name of ['etag','last-modified','accept-ranges','content-range','age','x-cache','x-cache-hits','x-served-by','cf-cache-status'])need(!r.headers.has(name),'photo_cache');
 if(typeof expected==='number')need(r.status===expected&&r.headers.get('content-type')?.split(';')[0]==='application/json'&&exact(json(r),['error'])&&json(r).error===(expected===401?'Authentication required':'Photo not found'),'photo_denial');
 else {const bytes=syntheticReaderBytes(expected);need(r.status===200&&r.headers.get('content-type')?.split(';')[0]==='image/png'&&Buffer.from(r.bytes).equals(Buffer.from(bytes)),'photo_bytes');}
}
function deny(r,list=false){
 const body=json(r);need(!/signedurl|signed_url|https?:\/\/|data:image|iVBORw0KGgo/i.test(JSON.stringify(body)),'direct_leak');
 const empty=list&&r.status===200&&Array.isArray(body)&&body.length===0;
 need(empty||[400,401,403,404,406].includes(r.status),'direct_denial');
 return {status:r.status,result:empty?'empty_list':'denied'};
}
function imageReply(r,o){need(r.status===200&&r.headers.get('content-type')?.split(';')[0]==='image/png'&&r.bytes.length===o.byteCount&&hash(r.bytes)===o.sha256,'object_manifest');}

/** The run owns 41 fixed CLI slots; cleanup receives the raw query, never this wrapper. */
export function makeMediatedPort(j,credentials,{http=createMediatedHttp,query,inspectConfig,adapter,clock=Date.now,postconditions,operatorToken,quiescenceReceipt=null,recovery=false}={}){
 const keys=validateCredentials(credentials),sessions={},cookieJars={},leaseEnds=new Map();
 need(typeof query==='function'&&typeof inspectConfig==='function'&&typeof adapter==='function'&&typeof postconditions==='string','port_configuration');
 const transport=typeof http==='function'?http({journal:j,credentials:keys,sessions,cookieJars,origin:j.state.pins.origin,operatorToken}):http;
 need(typeof transport?.dispatch==='function','port_configuration');
 const send=d=>transport.dispatch(d,'run');
 // Append the safe outcome only after the existing response assertion succeeds; never retain provider bodies.
 async function observeDirect(descriptor){
  const result=deny(await send(descriptor),descriptor.kind==='directMatrix'&&descriptor.view==='list');
  const row={descriptor,...result};
  // A denial (including generic 400) does not prove whether the render capability exists.
  if(descriptor.kind==='directMatrix'&&descriptor.view.startsWith('render-'))row.capability='capability_unverified';
  await j.mutate(s=>{s.directObservations.push(row);});
 }
 const checkTime=()=>need(clock()>=Date.parse(j.state.startedAt)&&clock()-Date.parse(j.state.startedAt)<900000,'phase_deadline');
 async function sql(slot,statement,write=false){checkTime();await reserveDispatch(j,'run',{kind:'cli',slot});checkTime();const rows=await query(statement,{slot,phase:'run',write});need(Array.isArray(rows),'sql_reply');await j.mutate(s=>{s.observed.run.cli++;});return rows;}
 const one=async(slot,statement)=>{const rows=await sql(slot,statement);need(rows.length===1,'sql_shape');return rows[0];};
 const object=label=>{need(['G1','G2'].includes(label),'generation');return j.state.objects[label==='G1'?0:1];};
 const objectStage=(label,stage,patch={})=>j.mutate(s=>Object.assign(s.objects[label==='G1'?0:1],patch,{stage}));
 const lease=label=>{checkTime();need(clock()<leaseEnds.get(label),'lease_expired');};
 async function operation(label,slot,intent,complete){
  lease(label);await objectStage(label,intent);const result=ok(await send({kind:'dataOperation',label,slot}));need(result.code==='OK','operation_receipt');
  if(slot===2){const o=object(label);need(result.owner_id===j.state.fixtures[0].id&&result.operation_id===o.operationId&&result.asset_id===o.assetId&&result.object_key===o.key&&result.kind==='upload'&&result.state==='reserved'&&result.lease_epoch===o.leaseEpoch&&result.input_sha256===`\\x${o.sha256}`&&result.transform_version==='synthetic-mediated-reader-v1','bind_receipt');}
  if(complete)await objectStage(label,complete);return result;
 }
 async function guardedGeneration(label){
  const s=j.state,v=await one(label==='G1'?13:14,mediatedInventorySql(s));
  need(v&&['auth','profiles','friends','heads','operations','objects'].every(k=>Array.isArray(v[k]))&&v.protected===0,'generation_inventory');
  need(v.auth.length===3&&v.profiles.length===3&&v.friends.length===1,'generation_ownership');
  for(const f of s.fixtures){const u=v.auth.filter(u=>u.id===f.id),p=v.profiles.filter(p=>p.id===f.id);need(u.length===1&&u[0].email===f.email&&u[0].marker===s.runId&&u[0].created_at===f.createdAt&&p.length===1&&p[0].email===f.email&&p[0].waitlist_status==='standard'&&p[0].stripe_customer_id===null&&p[0].avatar_url===null,'generation_ownership');}
  const friend=v.friends[0];need(friend.id===s.friendship.id&&friend.friend_1===s.fixtures[0].id&&friend.friend_2===s.fixtures[1].id&&friend.status==='accepted','generation_friend');
  const prior=label==='G1'?[]:[s.objects[0]];need(v.operations.length===prior.length&&v.objects.length===prior.length&&v.heads.length===prior.length,'generation_authority');
  for(const o of prior){const op=v.operations.find(r=>r.operation_id===o.operationId),obj=v.objects.find(r=>r.name===o.key),head=v.heads[0];need(op&&op.owner_id===s.fixtures[0].id&&op.asset_id===o.assetId&&op.object_key===o.key&&op.kind==='upload'&&op.state==='completed'&&Number(op.expected_revision)===0&&Number(op.result_revision)===1&&Number(op.lease_epoch)===o.leaseEpoch&&op.input_sha256===o.sha256&&op.normalized_sha256===o.sha256&&op.transform_version==='synthetic-mediated-reader-v1'&&op.mime===o.mime&&op.width===1&&op.height===1&&op.byte_count===o.byteCount&&obj&&obj.bucket_id==='profile-photos'&&(obj.owner===null||obj.owner===s.fixtures[0].id)&&(obj.owner_id===null||obj.owner_id===s.fixtures[0].id)&&head.owner_id===s.fixtures[0].id&&Number(head.revision)===1&&head.current_asset_id===o.assetId,'generation_authority');}
 }
 return {
  async preflight(){
   need((await one(1,catalogSql)).digest===j.state.pins.catalog,'catalog_drift');
   const checks=await sql(2,postconditions);need(checks.length===14&&new Set(checks.map(c=>c.name)).size===14&&checks.every(c=>exact(c,['name','pass'])&&POSTCONDITIONS.includes(c.name)&&c.pass===true),'mediated_postconditions');
   const empty=await one(3,EMPTY_SQL);need(exact(empty,['objects','heads','operations','multipart','parts','admissions'])&&Object.values(empty).every(v=>v===0),'nonempty_inventory');
   const collisions=await sql(4,collisionSql(j.state.fixtures));need(collisions.length===3&&collisions.every(r=>r.count===0),'fixture_collision');
   const baseline=await sql(5,preservationSql());need(baseline.find(r=>r.table==='website_callback_private.admissions')?.count===0,'admission_baseline');await j.mutate(s=>{s.baseline=baseline;s.stage='preflight';});
   // inspectConfig makes two fixed read-only invocations; reserve both before entering it.
   checkTime();await reserveDispatch(j,'run',{kind:'cli',slot:6});await reserveDispatch(j,'run',{kind:'cli',slot:7});checkTime();need(await inspectConfig()===true,'auth_config');await j.mutate(s=>{s.observed.run.cli+=2;});
   need((await send({kind:'authProbe'})).status===404,'admin_probe');return {catalog:j.state.pins.catalog,baseline};
  },
  async createIdentity(label){
   need(['A','B','C'].includes(label),'fixture_label');const index='ABC'.indexOf(label);need(j.state.fixtures[index].stage==='planned','identity_repeat');
   sessions[label]={password:randomBytes(36).toString('base64url'),session:null};
   await j.mutate(s=>Object.assign(s.fixtures[index],{stage:'create_intent',createAttempts:1}));let ack=null;
   try{ack=json(await send({kind:'authCreate',label}));}catch{/* Exact SQL reconciles the one creation, never reissues it. */}
   const row=await one(8+index,mediatedFixtureSql(j.state,label));need(row.protected===0&&row.privateRows===0&&row.references===0&&Array.isArray(row.auth)&&Array.isArray(row.profiles),'identity_references');
   const f=reconcileCreate(j.state.fixtures[index],row.auth,j.state.runId,j.state.startedAt);need(!ack||ack.id===f.id,'identity_ack');
   need(row.profiles.length===1&&row.profiles[0].id===f.id&&row.profiles[0].email===f.email&&row.profiles[0].waitlist_status==='standard'&&row.profiles[0].stripe_customer_id===null&&row.profiles[0].avatar_url===null,'identity_profile');
   await j.mutate(s=>{s.fixtures[index]=f;});
   const session=ok(await send({kind:'authLogin',label}));need(session.user?.id===f.id,'login_identity');cookieJars[label]=sessionCookies(session,j.state.pins.origin);sessions[label].session=session;
   need(ok(await send({kind:'authGetUser',label,slot:1})).id===f.id,'auth_identity');
  },
  async prepareDigests(){
   need(j.state.fixtures.every(f=>f.stage==='created')&&new Set(j.state.fixtures.map(f=>f.id)).size===3,'preparation_identities');
   mediatedPreparationIntent(j.state);await j.mutate(s=>{s.preparation.stage='intent';});
   const r=await send({kind:'preparation'}),p=ok(r);need(exact(p,['version','run_id','visitor_digest','user_digests'])&&p.version===1&&p.run_id===j.state.runId&&Array.isArray(p.user_digests)&&p.user_digests.length===3,'preparation_reply');
   for(const [name,value] of Object.entries(CACHE))need(r.headers.get(name)===value,'preparation_cache');
   need(!r.headers.has('set-cookie')&&!r.headers.has('etag')&&!r.headers.has('last-modified'),'preparation_cache');
   await j.mutate(s=>{Object.assign(s.preparation,{visitorDigest:p.visitor_digest,userDigests:p.user_digests,stage:'complete'});});
   need((await sql(11,mediatedAdmissionsSql(j.state,'inspect'))).length===0,'preparation_admissions');
  },
  async createGeneration(label){
   await guardedGeneration(label);const index=label==='G1'?0:1,bytes=syntheticReaderBytes(label);
   await objectStage(label,'reserve_intent');const r=ok(await send({kind:'dataOperation',label,slot:1})),o=object(label);
   need(r.code==='OK'&&r.kind==='upload'&&r.state==='reserved'&&r.owner_id===j.state.fixtures[0].id&&r.operation_id===o.operationId&&uuid.test(r.asset_id)&&r.object_key===`${r.owner_id}/${r.asset_id}`&&Number(r.expected_revision)===index&&Number.isSafeInteger(r.lease_epoch)&&r.lease_epoch>0&&Number.isFinite(Date.parse(r.lease_until))&&Date.parse(r.lease_until)>clock(),'reserve_receipt');
   leaseEnds.set(label,Math.min(Date.parse(r.lease_until),clock()+120000));
   await objectStage(label,'reserved',{assetId:r.asset_id,key:r.object_key,leaseEpoch:r.lease_epoch,sha256:hash(bytes),byteCount:bytes.length});
   await operation(label,2,'bind_intent','bound');const prepared=await operation(label,3,'prepare_intent');
   need(prepared.kind==='upload'&&prepared.state==='prepared'&&prepared.owner_id===r.owner_id&&prepared.operation_id===o.operationId&&prepared.asset_id===r.asset_id&&prepared.object_key===r.object_key&&prepared.normalized_sha256===`\\x${hash(bytes)}`&&prepared.input_sha256===`\\x${hash(bytes)}`&&prepared.mime==='image/png'&&prepared.byte_count===bytes.length&&prepared.width===1&&prepared.height===1&&prepared.transform_version==='synthetic-mediated-reader-v1','prepare_receipt');
   await objectStage(label,'prepared');lease(label);
   const p=j.state.pins,{storePreparedProfilePhoto}=await adapter({catalog:p.catalog,backendCommit:p.backendCommit,adapterSha256:p.adapterSha256});
   lease(label);await objectStage(label,'upload_intent',{uploadAttempts:1});let upload=false,read=false;
   const fetcher=async(url,init)=>{lease(label);const target=new URL(url),current=object(label);need(target.origin===ORIGIN&&!target.search&&!target.hash,'adapter_boundary');
    let kind;if(init.method==='POST'){need(!upload&&!read&&target.pathname===`/storage/v1/object/profile-photos/${current.key}`&&init.body instanceof Uint8Array&&hash(init.body)===current.sha256,'adapter_boundary');upload=true;kind='storageUpload';}
    else{need(init.method==='GET'&&upload&&!read&&target.pathname===`/storage/v1/object/authenticated/profile-photos/${current.key}`,'adapter_boundary');read=true;kind='storageReadback';}
    const response=await send({kind,label});if(kind==='storageReadback')imageReply(response,current);return new Response(response.bytes,{status:response.status,headers:response.headers});
   };
   const result=await storePreparedProfilePhoto({prepared,bytes,projectUrl:ORIGIN,credential:keys.secretKey,fetcher});need(result.status==='verified'&&upload&&read,'upload_uncertain');await objectStage(label,'verified');
  },
  async publish(label){const r=await operation(label,4,'publish_intent'),o=object(label),revision=label==='G1'?1:2;need(r.asset_id===o.assetId&&r.object_key===o.key&&Number(r.revision)===revision,'publish_receipt');await j.mutate(s=>{s.objects[revision-1].stage='published';s.revision=revision;});imageReply(await send({kind:'storageWarm',label}),object(label));},
  async friend(action){const map={insert:[12,'insert_intent','accepted'],reject:[15,'reject_intent','rejected'],restore:[16,'restore_intent','accepted_again']};need(Object.hasOwn(map,action),'friend_action');const [slot,intent,complete]=map[action];await j.mutate(s=>{s.friendship.stage=intent;});await sql(slot,mediatedFriendSql(j.state,action),true);await j.mutate(s=>{s.friendship.stage=complete;});},
  async photoCase(caseId){
   need(caseId===j.state.scenarioIndex+1,'scenario_order');const row=PHOTO_CASES[caseId-1];need(row,'photo_case');let before;
   if(caseId===10)before=cookieHeader(cookieJars.A,j.state.pins.origin);
   const r=await send({kind:'photo',caseId});
   assertPhotoResponse(r,row.expected);
   if(caseId===10){need(r.headers.getSetCookie().length>0&&cookieHeader(cookieJars.A,j.state.pins.origin)!==before,'refresh_cookies');const updated=await sessionFromCookies(cookieJars.A);need(updated.access_token!==sessions.A.session.access_token&&updated.user.id===j.state.fixtures[0].id,'refresh_identity');need(ok(await send({kind:'authGetUser',label:'A',slot:2})).id===j.state.fixtures[0].id,'refresh_identity');}
   await reconcileMediatedAdmissions(j,await sql(16+caseId,mediatedAdmissionsSql(j.state,'inspect')),new Date(clock()).toISOString());
   await j.mutate(s=>{s.scenarioIndex=caseId;s.assertions.push({caseId,passed:true});});
  },
  async directMatrix(matrixId){const keyLabel=MATRIX_KEYS[matrixId-1];need(keyLabel,'matrix_id');for(const d of directMatrix(keyLabel))await observeDirect({kind:'directMatrix',matrixId,...d});},
  async exposure(label){need(['absence','G1','G2'].includes(label),'exposure_label');for(const actor of ['A','B','C','N'])await observeDirect({kind:'dataExposure',label,actor});if(label==='absence')for(const slot of [1,2,3,4])await observeDirect({kind:'dataBoundary',slot});},
  async clear(){await j.mutate(s=>{s.clear.stage='intent';});const r=ok(await send({kind:'dataClear'}));need(r.code==='OK'&&Number(r.revision)===3&&r.current_asset_id===null,'clear_receipt');await j.mutate(s=>{s.clear.stage='completed';s.revision=3;});},
  async finish(){need((await one(41,catalogSql)).digest===j.state.pins.catalog,'catalog_drift');validateMediatedState(j.state);},
  cleanup:()=>cleanupMediated(j,{sql:query,http:transport,quiescenceReceipt,clock},recovery?'recovery':'cleanup'),
 };
}
