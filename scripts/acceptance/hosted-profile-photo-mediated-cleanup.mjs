// Crash-safe fixed-slot cleanup. Imported modules do not read credentials or dispatch providers.
import { createHash } from 'node:crypto';
import { reserveDispatch, validateMediatedState } from './hosted-profile-photo-mediated.mjs';
import { catalogSql, preservationSql } from './hosted-account-jwt-sql.mjs';
import { mediatedInventorySql, mediatedFixtureSql, mediatedTeardownSql, mediatedAdmissionsSql, mediatedAdmissionLimits } from './hosted-profile-photo-mediated-sql.mjs';
import { syntheticReaderBytes } from './hosted-profile-photo-readers.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const epoch=(s,phase)=>phase==='cleanup'?s.cleanupStartedAt:s.counters.recoveries[0]?.startedAt;
const attempted=(s,phase,kind,label)=>s.intents.some(i=>i.phase===phase&&i.descriptor.kind===kind&&(label===undefined||i.descriptor.label===label));
const teardownAttempted=s=>s.intents.some(i=>i.phase!=='run'&&i.descriptor.kind==='cli'&&i.descriptor.slot===6);
const metadataAbsent=v=>['profiles','friends','heads','operations'].every(k=>v[k].length===0);
const empty=v=>metadataAbsent(v)&&v.auth.length===0&&v.objects.length===0&&v.protected===0&&v.admissions===0;
// PostgreSQL Auth timestamps carry up to six fractional digits. Parse only the whole-second
// timezone instant with Date, then retain the fraction as integer microseconds for ownership.
function authTimestamp(value){
 const parts=typeof value==='string'&&/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
 need(parts,'auth_ownership');const seconds=Date.parse(parts[1]+parts[3]);need(Number.isFinite(seconds),'auth_ownership');
 return BigInt(seconds)*1000n+BigInt((parts[2]??'').padEnd(6,'0'));
}
function checkAuth(s,f,u){
 need(u&&u.email===f.email&&u.marker===s.runId&&(!f.id||u.id===f.id),'auth_ownership');
 const created=authTimestamp(u.created_at),started=authTimestamp(s.startedAt);
 need((!f.createdAt||created===authTimestamp(f.createdAt))&&created>=started&&created<=started+300000000n,'auth_ownership');
}
function checkProfiles(s,rows){for(const p of rows){const f=s.fixtures.find(f=>f.id===p.id);need(f&&p.email===f.email&&p.waitlist_status==='standard'&&p.stripe_customer_id===null&&p.avatar_url===null,'profile_ownership');}}
function checkInventory(s,v){
 need(v&&['auth','profiles','friends','heads','operations','objects'].every(k=>Array.isArray(v[k]))&&v.protected===0,'protected_references');
 for(const u of v.auth){const f=s.fixtures.find(f=>f.id===u.id);need(f,'foreign_auth');checkAuth(s,f,u);}checkProfiles(s,v.profiles);
 for(const f of s.fixtures.filter(f=>f.id&&f.stage!=='cleaned'))need(v.auth.some(u=>u.id===f.id)||f.stage==='auth_delete_intent','missing_auth');
 for(const row of v.friends)need(row.id===s.friendship.id&&row.friend_1===s.fixtures[0].id&&row.friend_2===s.fixtures[1].id&&['accepted','rejected'].includes(row.status),'foreign_friend');
 for(const row of v.objects){const o=s.objects.find(o=>o.key===row.name);need(o&&o.uploadAttempts>0&&row.bucket_id==='profile-photos'&&(row.owner===null||row.owner===s.fixtures[0].id)&&(row.owner_id===null||row.owner_id===s.fixtures[0].id),'foreign_object');}
}
const missing=r=>{if(![400,404].includes(r.status))return false;try{const b=JSON.parse(new TextDecoder().decode(r.bytes));return b?.code==='NoSuchKey'||String(b?.statusCode)==='404'&&b?.message==='Object not found';}catch{return false;}};
function objectReply(o,r){if(missing(r))return false;need(r.status===200&&r.headers.get('content-type')?.split(';')[0].trim()==='image/png'&&r.bytes.length===o.byteCount&&hash(r.bytes)===o.sha256,'object_manifest');return true;}

/** Only named cleanup slots choose SQL. Callers inject raw dbQuery(statement,{write}); they cannot supply SQL. */
export function createMediatedCleanupSql(j,query,phase='cleanup',clock=Date.now){
 need(['cleanup','recovery'].includes(phase)&&typeof query==='function','cleanup_phase');
 return async slot=>{
  const s=j.state;validateMediatedState(s);const start=epoch(s,phase);need(start&&clock()>=Date.parse(start)&&clock()-Date.parse(start)<300000,'phase_deadline');
  let statement,write=false;
  if(slot===1||slot===19)statement=catalogSql;
  else if(slot>=2&&slot<=4)statement=mediatedFixtureSql(s,'ABC'[slot-2]);
  else if([5,7,8].includes(slot))statement=mediatedInventorySql(s);
  else if(slot===20)statement=`SELECT owned.*, (SELECT count(*)::int FROM website_callback_private.admissions) AS admissions FROM (${mediatedInventorySql(s)}) owned`;
  else if(slot===6){statement=mediatedTeardownSql(s);write=true;}
  else if([9,17].includes(slot))statement=mediatedAdmissionsSql(s,'inspect');
  else if(slot===10){statement=mediatedAdmissionsSql(s,'delete');write=true;}
  else if(slot>=11&&slot<=16)statement=mediatedFixtureSql(s,'ABC'[Math.floor((slot-11)/2)]);
  else if(slot===18)statement=preservationSql();
  else throw Error('cleanup_slot');
  await reserveDispatch(j,phase,{kind:'cli',slot});need(clock()-Date.parse(start)<300000,'phase_deadline');
  const rows=await query(statement,{write,slot,phase});need(Array.isArray(rows),'sql_reply');
  await j.mutate(n=>{n.observed[phase].cli++;});return rows;
 };
}

/** Persist exact observed admissions; missing old rows are expected expiry, changed IDs are never adopted. */
export async function reconcileMediatedAdmissions(j,rows,end){
 const s=j.state;validateMediatedState(s);need(s.baseline?.find(r=>r.table==='website_callback_private.admissions')?.count===0,'admission_baseline');
 const limits=mediatedAdmissionLimits(s),known=new Map(s.admissionRows.map(r=>[r.id,r]));
 const seen=new Set();
 for(const r of rows){need(r&&Object.keys(r).sort().join(',')==='createdAt,digest,id'&&typeof r.id==='string'&&/^[1-9][0-9]{0,18}$/.test(r.id)&&BigInt(r.id)<=9223372036854775807n&&!seen.has(r.id)&&limits.has(r.digest)&&Number.isFinite(Date.parse(r.createdAt))&&Date.parse(r.createdAt)>=Date.parse(s.startedAt)&&Date.parse(r.createdAt)<=Date.parse(end),'admission_unknown');seen.add(r.id);const old=known.get(r.id);need(!old||old.digest===r.digest&&old.createdAt===r.createdAt,'admission_changed');known.set(r.id,r);}
 for(const [digest,limit] of limits)need([...known.values()].filter(r=>r.digest===digest).length<=limit,'admission_count');
 await j.mutate(n=>{for(const r of rows)if(!n.admissionRows.some(k=>k.id===r.id))n.admissionRows.push(r);});
}

/** Reconcile each acknowledged/lost authority transition without reissuing a mutation. */
async function reconcileAuthority(j,v){
 const s=j.state,owner=s.fixtures[0].id,seen=new Set();let revision=0,current=null;
 for(let index=0;index<2;index++){
  const o=j.state.objects[index],ops=v.operations.filter(r=>r.operation_id===o.operationId);need(ops.length<=1,'authority_duplicate');
  if(!ops.length){need(o.stage==='planned','authority_uncertain');continue;}
  const op=ops[0],bytes=syntheticReaderBytes(o.label),sha=hash(bytes);seen.add(op.operation_id);
  need(o.stage!=='planned'&&op.owner_id===owner&&op.kind==='upload'&&Number(op.expected_revision)===index&&op.object_key===`${owner}/${op.asset_id}`&&Number.isSafeInteger(Number(op.lease_epoch))&&Number(op.lease_epoch)>0&&['reserved','prepared','completed'].includes(op.state),'authority_mismatch');
  need((!o.assetId||o.assetId===op.asset_id)&&(!o.key||o.key===op.object_key)&&(!o.leaseEpoch||o.leaseEpoch===Number(op.lease_epoch))&&(!o.sha256||o.sha256===sha)&&(!o.byteCount||o.byteCount===bytes.length),'authority_mismatch');
  const bound=op.input_sha256!==null;
  need(bound?op.input_sha256===sha&&op.transform_version==='synthetic-mediated-reader-v1':op.transform_version===null,'authority_manifest');
  if(op.state==='reserved')need(op.result_revision===null&&op.normalized_sha256===null&&op.mime===null&&op.width===null&&op.height===null&&op.byte_count===null,'authority_manifest');
  else need(bound&&op.normalized_sha256===sha&&op.mime==='image/png'&&Number(op.width)===1&&Number(op.height)===1&&Number(op.byte_count)===bytes.length&&(op.state==='completed'?Number(op.result_revision)===index+1:op.result_revision===null),'authority_manifest');
  if(['reserve_intent','reserve_uncertain'].includes(o.stage)){need(op.state==='reserved'&&!bound,'authority_mismatch');await j.mutate(n=>{Object.assign(n.objects[index],{assetId:op.asset_id,key:op.object_key,leaseEpoch:Number(op.lease_epoch),sha256:sha,byteCount:bytes.length,stage:'reserved'});});}
  else if(['bind_intent','bind_uncertain'].includes(o.stage)){need(op.state==='reserved','authority_mismatch');if(bound)await j.mutate(n=>{n.objects[index].stage='bound';});}
  else if(['prepare_intent','prepare_uncertain'].includes(o.stage)){need(bound&&op.state!=='completed','authority_mismatch');if(op.state==='prepared')await j.mutate(n=>{n.objects[index].stage='prepared';});}
  else if(['publish_intent','publish_uncertain'].includes(o.stage)){need(op.state==='completed','authority_uncertain');await j.mutate(n=>{n.objects[index].stage='published';n.revision=index+1;});}
  else need(op.state===(['published','delete_intent','deleted'].includes(o.stage)?'completed':['reserved','bound'].includes(o.stage)?'reserved':'prepared')&&(o.stage!=='bound'||bound)&&(o.stage!=='reserved'||!bound),'authority_mismatch');
  if(op.state==='completed'){revision=index+1;current=op.asset_id;}
 }
 const clear=v.operations.filter(r=>r.operation_id===s.clear.operationId);need(clear.length<=1,'authority_duplicate');
 if(clear.length){const op=clear[0];seen.add(op.operation_id);need(j.state.clear.stage!=='planned'&&op.owner_id===owner&&op.kind==='delete'&&Number(op.expected_revision)===2&&op.state==='completed'&&Number(op.result_revision)===3&&['asset_id','object_key','lease_epoch','input_sha256','normalized_sha256','transform_version','mime','width','height','byte_count'].every(k=>op[k]===null),'authority_clear');if(j.state.clear.stage!=='completed')await j.mutate(n=>{n.clear.stage='completed';n.revision=3;});revision=3;current=null;}
 else need(s.clear.stage==='planned','authority_uncertain');
 need(seen.size===v.operations.length&&v.heads.length===(seen.size?1:0),'authority_unknown');if(v.heads.length)need(v.heads[0].owner_id===owner&&Number(v.heads[0].revision)===revision&&v.heads[0].current_asset_id===current,'authority_head');need(j.state.revision===revision,'authority_revision');
 if(v.friends.length){need(v.friends.length===1,'friend_duplicate');const status=v.friends[0].status,stage=j.state.friendship.stage;
  if(['insert_intent','insert_uncertain'].includes(stage)){need(status==='accepted','friend_authority');await j.mutate(n=>{n.friendship.stage='accepted';});}
  else if(['reject_intent','reject_uncertain'].includes(stage)&&status==='rejected')await j.mutate(n=>{n.friendship.stage='rejected';});
  else if(['restore_intent','restore_uncertain'].includes(stage)&&status==='accepted')await j.mutate(n=>{n.friendship.stage='accepted_again';});
  // A failed cleanup transaction may leave either owned status after durable delete intent.
  // checkInventory already verifies the exact friendship ID and participants; run stages stay strict.
  else if(stage==='delete_intent')need(['accepted','rejected'].includes(status),'friend_authority');
  else need((['accepted','accepted_again','reject_intent','reject_uncertain'].includes(stage)?'accepted':'rejected')===status,'friend_authority');
 }else need(s.friendship.stage==='planned','friend_uncertain');
}

/** Cleanup reserves at most 3 Auth + 6 Storage + 20 CLI calls; errors never reset an epoch. */
export async function cleanupMediated(j,{sql,http,quiescenceReceipt=null,clock=Date.now},phase='cleanup'){
 validateMediatedState(j.state);need(['cleanup','recovery'].includes(phase),'cleanup_phase');
 if(j.state.cleanupComplete)return;
 // A restart cannot silently mint a new epoch or replay any first-slot dispatch.
 need(!j.state.intents.some(i=>i.phase===phase&&i.descriptor.kind==='cli'&&i.descriptor.slot===1),'cleanup_epoch_used');
 await j.mutate(n=>{n.stage='cleanup';if(phase==='cleanup')n.cleanupStartedAt??=new Date(clock()).toISOString();if(quiescenceReceipt){need(phase==='recovery','settlement_recovery');n.settlement=structuredClone(quiescenceReceipt);}});
 const query=createMediatedCleanupSql(j,sql,phase,clock),errors=[];
 const attempt=async fn=>{try{return await fn();}catch{errors.push('cleanup_branch_failed');return null;}};
 const one=async slot=>{const rows=await query(slot);need(rows.length===1,'sql_shape');return rows[0];};
 try{
  need((await one(1)).digest===j.state.pins.catalog,'catalog_drift');
  for(let i=0;i<3;i++)await attempt(async()=>{
   const f=j.state.fixtures[i],r=await one(i+2);need(Array.isArray(r.auth)&&Array.isArray(r.profiles),'fixture_shape');need(r.auth.length<=1,'auth_collision');
   if(!r.auth.length){need(!r.profiles.length,'orphan_profile');if(f.stage==='planned'||f.stage==='cleaned')return;need(f.stage==='auth_delete_intent'&&f.deleteAttempts===1,'create_uncertain');await j.mutate(n=>{n.fixtures[i].stage='cleaned';});return;}
   need(f.stage!=='planned'&&f.stage!=='cleaned','auth_unexpected');checkAuth(j.state,f,r.auth[0]);
   if(['create_intent','create_uncertain'].includes(f.stage)){need(r.profiles.length===1,'created_profile');await j.mutate(n=>{Object.assign(n.fixtures[i],{id:r.auth[0].id,createdAt:r.auth[0].created_at,stage:'created'});});}
   checkProfiles(j.state,r.profiles);
  });
  let metadataSafe=false;const reads=new Map(),absent=new Set();
  await attempt(async()=>{
   const v=await one(5);checkInventory(j.state,v);
   const gone=metadataAbsent(v);if(!gone)await reconcileAuthority(j,v);else need(j.state.fixtures.every(f=>!f.id||f.stage==='cleaned')||teardownAttempted(j.state),'metadata_unexplained');
   for(let i=0;i<2;i++){
    const o=j.state.objects[i];if(!o.key)continue;const row=v.objects.find(r=>r.name===o.key);
    if(o.uploadAttempts===0){need(!row,'object_unexpected');continue;}
    const present=objectReply(o,await http.dispatch({kind:'storageOwnership',label:o.label},phase));need(present===!!row,'storage_inventory');
    if(!present){need(['delete_intent','deleted'].includes(o.stage)&&o.deleteAttempts===1,'upload_uncertain');absent.add(o.label);continue;}
    need(o.stage!=='deleted','object_reappeared');reads.set(o.label,true);
    if(['upload_intent','upload_uncertain'].includes(o.stage))await j.mutate(n=>{n.objects[i].stage='verified';});
   }
   if(!gone){
    // Persist entity intent before SQL; slot 6 itself is the durable teardown intent.
    if(['accepted','rejected','accepted_again'].includes(j.state.friendship.stage))await j.mutate(n=>{n.friendship.stage='delete_intent';});
    try{await query(6);}catch{/* SQL timeout remains uncertain until the fixed post-metadata inventory. */}
   }
   const post=await one(7);checkInventory(j.state,post);need(metadataAbsent(post),'metadata_remaining');
   await j.mutate(n=>{for(const f of n.fixtures)if(f.stage==='created')f.stage='profile_removed';if(n.friendship.stage==='delete_intent')n.friendship.stage='deleted';});metadataSafe=true;
  });
  if(metadataSafe){
   for(let i=0;i<2;i++)await attempt(async()=>{
    const o=j.state.objects[i];if(!o.key||!o.uploadAttempts||absent.has(o.label))return;need(reads.has(o.label),'object_unverified');
    await j.mutate(n=>{n.objects[i].stage='delete_intent';n.objects[i].deleteAttempts=1;});
    need(!attempted(j.state,phase,'storageDelete',o.label),'delete_repeated');
    try{await http.dispatch({kind:'storageDelete',label:o.label},phase);}catch{/* Absence is checked independently after a lost delete acknowledgement. */}
    need(missing(await http.dispatch({kind:'storageAbsence',label:o.label},phase)),'object_delete_unconfirmed');absent.add(o.label);
   });
   const post=await attempt(async()=>{const v=await one(8);checkInventory(j.state,v);need(metadataAbsent(v)&&v.objects.length===0,'objects_remaining');return v;});
   if(post){
    for(let i=0;i<2;i++)if(absent.has(j.state.objects[i].label)&&j.state.objects[i].stage==='delete_intent')await j.mutate(n=>{n.objects[i].stage='deleted';});
    for(let i=0;i<3;i++)await attempt(async()=>{
     const f=j.state.fixtures[i];if(!f.id||f.stage==='cleaned')return;const r=await one(11+i*2);need(r.auth.length===1&&r.profiles.length===0&&r.protected===0&&r.privateRows===0&&r.references===0,'auth_references');checkAuth(j.state,f,r.auth[0]);
     await j.mutate(n=>{n.fixtures[i].stage='auth_delete_intent';n.fixtures[i].deleteAttempts=1;});
     try{await http.dispatch({kind:'authDelete',label:f.label},phase);}catch{/* The exact following SQL inspection reconciles a lost delete reply. */}
     const after=await one(12+i*2);need(after.auth.length===0&&after.profiles.length===0&&after.protected===0&&after.privateRows===0&&after.references===0,'auth_delete_unconfirmed');await j.mutate(n=>{n.fixtures[i].stage='cleaned';});
    });
   }
  }
  await attempt(async()=>{
   need(!j.state.uncertainWebsite||phase==='recovery'&&j.state.settlement!==null,'settlement_required');
   const rows=await query(9);await reconcileMediatedAdmissions(j,rows,j.state.settlement?.issued_at??j.state.cleanupStartedAt);
   try{await query(10);}catch{/* The fixed verify slot decides whether the exact deletion committed. */}
   need((await query(17)).length===0,'admissions_remaining');
  });
  const after=await query(18);need(j.state.baseline!==null&&JSON.stringify(after)===JSON.stringify(j.state.baseline),'preservation_drift');await j.mutate(n=>{n.after=after;});
  need((await one(19)).digest===j.state.pins.catalog,'catalog_drift');need(empty(await one(20)),'final_inventory');need(errors.length===0,'cleanup_incomplete');
  await j.mutate(n=>{n.cleanupComplete=true;n.stage='complete';});
 }catch{
  await j.mutate(n=>{n.stage='cleanup_blocked';if(!n.failures.includes('cleanup_blocked'))n.failures.push('cleanup_blocked');});throw Error('cleanup_blocked');
 }
}
