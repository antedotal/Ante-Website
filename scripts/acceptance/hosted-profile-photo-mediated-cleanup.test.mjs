// Transport tests use the actual journal validation and dispatch reservation, with provider I/O replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newMediatedState, validateMediatedHistory, reserveDispatch } from './hosted-profile-photo-mediated.mjs';
import { TABLES } from './hosted-account-jwt-sql.mjs';
import { cleanupMediated } from './hosted-profile-photo-mediated-cleanup.mjs';
const pins={websiteCommit:'a'.repeat(40),backendCommit:'b'.repeat(40),adapterSha256:'c'.repeat(64),releaseSha256:'d'.repeat(64),catalog:'e'.repeat(64),ordinaryBundleSha256:'f'.repeat(64),acceptanceBundleSha256:'1'.repeat(64),origin:'https://fixture.example.invalid',deploymentId:'local',cacheReceiptSha256:'2'.repeat(64),quiescenceReceiptSha256:'3'.repeat(64)};
const empty=()=>({auth:[],profiles:[],friends:[],heads:[],operations:[],objects:[],protected:0});
function harness(){
 const s=newMediatedState(randomUUID(),pins);s.baseline=TABLES.map(table=>({table,count:0,digest:'a'.repeat(64)}));const calls=[];
 const j={state:s,async mutate(fn){const next=structuredClone(this.state);fn(next);validateMediatedHistory(this.state,next);this.state=next;}};
 const sql=async(_statement,{slot})=>{calls.push(slot);assert.ok(j.state.cleanupStartedAt);if([1,19].includes(slot))return [{digest:pins.catalog}];if([2,3,4,11,12,13,14,15,16].includes(slot))return [{auth:[],profiles:[],protected:0,privateRows:0,references:0}];if([5,7,8,20].includes(slot))return [{...empty(),...(slot===20?{admissions:0}:{})}];if(slot===18)return structuredClone(s.baseline);return [];};
 const http={async dispatch(d,phase){await reserveDispatch(j,phase,d);throw Error('unexpected_http');}};
 return {j,sql,http,calls};
}
test('cleanup binds a durable epoch before dispatch and verifies all 22 fingerprints',async()=>{const h=harness();await cleanupMediated(h.j,h);assert.equal(h.j.state.cleanupComplete,true);assert.equal(h.j.state.after.length,22);assert.ok(h.j.state.counters.cleanup.cli<=20);});
test('website timeout permanently blocks completion until bound recovery settlement',async()=>{const h=harness();h.j.state.uncertainWebsite=true;h.j.state.uncertainAt=h.j.state.startedAt;await assert.rejects(cleanupMediated(h.j,h));assert.equal(h.j.state.stage,'cleanup_blocked');assert.equal(h.j.state.cleanupComplete,false);assert.ok(!h.calls.includes(10));});
test('every CLI crash boundary retains journal authority without repeating a descriptor',async()=>{const successful=harness();await cleanupMediated(successful.j,successful);for(const slot of successful.calls.filter(n=>n!==10)){const h=harness();const q=h.sql;h.sql=async(s,o)=>{if(o.slot===slot)throw Error('lost_reply');return q(s,o);};await assert.rejects(cleanupMediated(h.j,h));assert.equal(h.j.state.stage,'cleanup_blocked');const before=h.j.state.counters.cleanup.cli;await assert.rejects(cleanupMediated(h.j,h));assert.equal(h.j.state.counters.cleanup.cli,before);assert.ok(before<=20);}});

// The provider double has only the fixed SQL slot and HTTP descriptor vocabulary. It models
// committed rows independently from journal acknowledgement so before/after crash cases differ.
import { createHash } from 'node:crypto';
import { syntheticReaderBytes } from './hosted-profile-photo-readers.mjs';
function fullHarness({count=3,generations=2,clear=true}={}){
 const h=harness(),s=h.j.state;for(let i=0;i<count;i++)Object.assign(s.fixtures[i],{id:randomUUID(),createdAt:s.startedAt,stage:'created',createAttempts:1});
 const fixtures=structuredClone(s.fixtures.filter(f=>f.id));const alive=new Set(fixtures.map(f=>f.id));let metadata=true;
 const objects=new Set();const operations=[];
 for(let i=0;i<generations;i++){
  const o=s.objects[i],bytes=syntheticReaderBytes(o.label);Object.assign(o,{assetId:randomUUID(),leaseEpoch:1,sha256:createHash('sha256').update(bytes).digest('hex'),byteCount:bytes.length,stage:'published',uploadAttempts:1});o.key=`${s.fixtures[0].id}/${o.assetId}`;objects.add(o.label);
  operations.push({owner_id:s.fixtures[0].id,operation_id:o.operationId,kind:'upload',expected_revision:i,state:'completed',result_revision:i+1,asset_id:o.assetId,object_key:o.key,lease_epoch:1,input_sha256:o.sha256,normalized_sha256:o.sha256,transform_version:'synthetic-mediated-reader-v1',mime:'image/png',width:1,height:1,byte_count:o.byteCount});
 }s.revision=generations;
 if(clear&&generations===2){s.clear.stage='completed';s.revision=3;operations.push({owner_id:s.fixtures[0].id,operation_id:s.clear.operationId,kind:'delete',expected_revision:2,state:'completed',result_revision:3,asset_id:null,object_key:null,lease_epoch:null,input_sha256:null,normalized_sha256:null,transform_version:null,mime:null,width:null,height:null,byte_count:null});}
 if(count===3)s.friendship.stage='accepted';
 const auth=f=>({id:f.id,email:f.email,marker:s.runId,created_at:f.createdAt});const profile=f=>({id:f.id,email:f.email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null});
 const inventory=()=>({auth:fixtures.filter(f=>alive.has(f.id)).map(auth),profiles:metadata?fixtures.map(profile):[],friends:metadata&&count===3?[{id:s.friendship.id,friend_1:s.fixtures[0].id,friend_2:s.fixtures[1].id,status:'accepted'}]:[],heads:metadata&&generations?[{owner_id:s.fixtures[0].id,revision:clear&&generations===2?3:generations,current_asset_id:clear&&generations===2?null:s.objects[generations-1].assetId}]:[],operations:metadata?structuredClone(operations):[],objects:s.objects.filter(o=>objects.has(o.label)).map(o=>({name:o.key,bucket_id:'profile-photos',owner:null,owner_id:null})),protected:0});
 const q=h.sql;h.sql=async(statement,options)=>{const {slot}=options;
  if([5,7,8,20].includes(slot)){h.calls.push(slot);return [{...inventory(),...(slot===20?{admissions:0}:{})}];}
  if(slot===6){h.calls.push(slot);metadata=false;return [{remaining:0}];}
  if(slot>=2&&slot<=4||slot>=11&&slot<=16){h.calls.push(slot);const index=slot<=4?slot-2:Math.floor((slot-11)/2),f=fixtures[index];return [{auth:f&&alive.has(f.id)?[auth(f)]:[],profiles:f&&metadata?[profile(f)]:[],protected:0,privateRows:0,references:metadata&&generations?1:0}];}
  return q(statement,options);
 };
 h.http={async dispatch(d,phase){await reserveDispatch(h.j,phase,d);h.calls.push(`${d.kind}:${d.label}`);
  if(d.kind==='authDelete'){alive.delete(fixtures.find(f=>f.label===d.label).id);return {status:204,bytes:new Uint8Array(),headers:new Headers()};}
  if(d.kind==='storageDelete'){objects.delete(d.label);return {status:200,bytes:new TextEncoder().encode('{}'),headers:new Headers({'content-type':'application/json'})};}
  assert.ok(['storageOwnership','storageAbsence'].includes(d.kind));
  return objects.has(d.label)?{status:200,bytes:syntheticReaderBytes(d.label),headers:new Headers({'content-type':'image/png'})}:{status:404,bytes:new TextEncoder().encode('{"code":"NoSuchKey"}'),headers:new Headers({'content-type':'application/json'})};
 }};
 return Object.assign(h,{objects,operations,fixtures,alive,inventory});
}
test('full two-generation clear cleanup uses exactly 3 Auth, 6 Storage and 20 CLI and preserves authority',async()=>{
 const h=fullHarness();await cleanupMediated(h.j,h);assert.deepEqual(h.j.state.counters.cleanup,{directAuth:3,directStorage:6,cli:20});assert.ok(h.j.state.fixtures.every(f=>f.stage==='cleaned'));assert.ok(h.j.state.objects.every(o=>o.stage==='deleted'));assert.equal(h.j.state.revision,3);assert.equal(h.j.state.cleanupComplete,true);
});
test('partial one and two-user cleanup uses one generalized metadata teardown',async()=>{for(const count of [1,2]){const h=fullHarness({count,generations:0,clear:false});await cleanupMediated(h.j,h);assert.equal(h.j.state.cleanupComplete,true);assert.equal(h.calls.filter(x=>x===6).length,1);assert.equal(h.j.state.counters.cleanup.directAuth,count);}});
test('lost Storage and Auth delete acknowledgements reconcile absence without repeated deletion',async()=>{for(const kind of ['storageDelete','authDelete']){const h=fullHarness(),dispatch=h.http.dispatch;h.http.dispatch=async(d,p)=>{const r=await dispatch(d,p);if(d.kind===kind)throw Error('lost_reply');return r;};await cleanupMediated(h.j,h);assert.equal(h.j.state.cleanupComplete,true);for(const label of kind==='storageDelete'?['G1','G2']:['A','B','C'])assert.equal(h.calls.filter(x=>x===`${kind}:${label}`).length,1);}});
test('all 29 dispatch crash boundaries keep ceilings, journal and one attempt per descriptor',async()=>{
 const base=fullHarness();await cleanupMediated(base.j,base);assert.equal(base.calls.length,29);
 for(const boundary of base.calls){const h=fullHarness(),q=h.sql,dispatch=h.http.dispatch;
  h.sql=async(s,o)=>{if(o.slot===boundary)throw Error('lost_sql');return q(s,o);};h.http.dispatch=async(d,p)=>{if(`${d.kind}:${d.label}`===boundary){await reserveDispatch(h.j,p,d);throw Error('lost_http');}return dispatch(d,p);};
  await cleanupMediated(h.j,h).catch(()=>{});assert.ok(h.j.state.counters.cleanup.directAuth<=3);assert.ok(h.j.state.counters.cleanup.directStorage<=6);assert.ok(h.j.state.counters.cleanup.cli<=20);assert.ok(['complete','cleanup_blocked'].includes(h.j.state.stage));const count=h.j.state.intents.length;await cleanupMediated(h.j,h).catch(()=>{});assert.equal(h.j.state.intents.length,count);assert.ok(h.j.state.objects.every(o=>o.stage!=='blocked'));
 }
});
test('uncertain missing upload blocks metadata but leaves original entity authority intact',async()=>{
 const h=fullHarness({generations:1,clear:false});h.j.state.objects[0].stage='upload_uncertain';h.j.state.revision=0;Object.assign(h.operations[0],{state:'prepared',result_revision:null});h.objects.delete('G1');const q=h.sql;h.sql=async(s,o)=>{const rows=await q(s,o);if(o.slot===5)Object.assign(rows[0].heads[0],{revision:0,current_asset_id:null});return rows;};await assert.rejects(cleanupMediated(h.j,h));assert.ok(h.calls.includes('storageOwnership:G1'));assert.equal(h.j.state.objects[0].stage,'upload_uncertain');assert.ok(!h.calls.includes(6));assert.equal(h.alive.size,3);
});
test('pre-existing fingerprint drift remains blocked even when every owned entity is absent',async()=>{const h=harness(),q=h.sql;h.sql=async(s,o)=>{const rows=await q(s,o);if(o.slot===18)rows[21].digest='b'.repeat(64);return rows;};await assert.rejects(cleanupMediated(h.j,h));assert.equal(h.j.state.after,null);assert.equal(h.j.state.stage,'cleanup_blocked');});

test('bound later recovery settlement permits completion while preserving permanent website uncertainty',async()=>{
 const h=harness();h.j.state.uncertainWebsite=true;h.j.state.uncertainAt=h.j.state.startedAt;await assert.rejects(cleanupMediated(h.j,h));
 await h.j.mutate(n=>{n.counters.recoveries.push({id:randomUUID(),startedAt:new Date().toISOString(),counts:{directAuth:0,directStorage:0,cli:0}});});
 const issued=new Date(Date.parse(h.j.state.uncertainAt)+1).toISOString();const receipt={sha256:'f'.repeat(64),run_id:h.j.state.runId,origin:pins.origin,deployment_id:pins.deploymentId,closed_to_test_traffic:true,website_calls_settled:true,admission_writes_settled:true,issued_at:issued};
 await assert.rejects(cleanupMediated(h.j,{...h,quiescenceReceipt:{...receipt,run_id:randomUUID()}},'recovery'));assert.equal(h.j.state.counters.recoveries[0].counts.cli,0);
 await cleanupMediated(h.j,{...h,quiescenceReceipt:receipt},'recovery');assert.equal(h.j.state.cleanupComplete,true);assert.equal(h.j.state.uncertainWebsite,true);assert.deepEqual(h.j.state.settlement,receipt);
});
test('partial Auth failure still finishes independently owned users and retains failed user identity',async()=>{const h=fullHarness(),dispatch=h.http.dispatch;const id=h.j.state.fixtures[0].id;h.http.dispatch=async(d,p)=>{if(d.kind==='authDelete'&&d.label==='A'){await reserveDispatch(h.j,p,d);throw Error('unavailable');}return dispatch(d,p);};await assert.rejects(cleanupMediated(h.j,h));assert.equal(h.j.state.fixtures[0].stage,'auth_delete_intent');assert.equal(h.j.state.fixtures[0].id,id);assert.ok(h.j.state.fixtures.slice(1).every(f=>f.stage==='cleaned'));});
test('expired durable cleanup epoch does not extend itself or make provider calls',async()=>{const h=harness();h.j.state.startedAt=new Date(Date.now()-600000).toISOString();h.j.state.cleanupStartedAt=h.j.state.startedAt;const start=h.j.state.cleanupStartedAt;await assert.rejects(cleanupMediated(h.j,h));assert.equal(h.calls.length,0);assert.equal(h.j.state.cleanupStartedAt,start);});

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediatedJournal } from './hosted-profile-photo-mediated.mjs';
test('real private journal retains a failed reserved query and refuses replay after reconstruction',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'ante-mediated-cleanup-'));t.after(()=>rm(dir,{recursive:true,force:true}));const s=harness().j.state;const j=await MediatedJournal.create(dir,s);const path=j.path;
 await assert.rejects(cleanupMediated(j,{sql:async()=>{throw Error('lost_sql');},http:{dispatch(){throw Error('unexpected_http');}}}));await j.close();const raw=await readFile(path,'utf8');assert.ok(raw.endsWith('\n'));assert.equal(JSON.parse(raw.trim().split('\n').at(-1)).stage,'cleanup_blocked');
 const resumed=await MediatedJournal.resume(dir,s.runId);try{await assert.rejects(cleanupMediated(resumed,{sql:async()=>{throw Error('unexpected_query');},http:{}}),/epoch_used/);assert.equal(resumed.state.counters.cleanup.cli,1);}finally{await resumed.close();}
});

test('final owned-state inventory rejects an admission arriving after the deletion verification',async()=>{const h=harness(),q=h.sql;h.sql=async(s,o)=>{const rows=await q(s,o);if(o.slot===20)rows[0].admissions=1;return rows;};await assert.rejects(cleanupMediated(h.j,h));assert.equal(h.j.state.stage,'cleanup_blocked');});

// Recovery must distinguish a cleanup deletion intent from a run assertion about friendship state.
test('explicit recovery tears down an exact accepted friendship after slot 6 did not commit',async()=>{
 const h=fullHarness(),query=h.sql;let fail=true;
 h.sql=async(s,o)=>{if(o.slot===6&&fail)throw Error('lock_timeout_before_commit');return query(s,o);};
 await assert.rejects(cleanupMediated(h.j,h));assert.equal(h.j.state.friendship.stage,'delete_intent');assert.equal(h.inventory().friends[0].status,'accepted');assert.equal(h.alive.size,3);
 const initial=h.j.state.intents.length;await assert.rejects(cleanupMediated(h.j,h),/epoch_used/);assert.equal(h.j.state.intents.length,initial);
 await h.j.mutate(n=>{n.counters.recoveries.push({id:randomUUID(),startedAt:new Date().toISOString(),counts:{directAuth:0,directStorage:0,cli:0}});});fail=false;
 await cleanupMediated(h.j,h,'recovery');assert.equal(h.j.state.cleanupComplete,true);assert.equal(h.alive.size,0);assert.equal(h.j.state.friendship.stage,'deleted');
 for(const phase of ['cleanup','recovery'])assert.equal(h.j.state.intents.filter(i=>i.phase===phase&&i.descriptor.kind==='cli'&&i.descriptor.slot===6).length,1);
 assert.deepEqual(h.j.state.counters.recoveries[0].counts,{directAuth:3,directStorage:6,cli:20});
});

// Keep the journal timestamp and the simulated authoritative row separate, including submilliseconds.
function timestampHarness(){
 const h=fullHarness(),at=new Date(Date.parse(h.j.state.startedAt)+1000).toISOString().replace(/\.\d{3}Z$/,'.123456Z');
 h.j.state.fixtures[0].createdAt=at;h.fixtures[0].createdAt=at;return {h,at};
}
test('one-microsecond Auth timestamp change at final inspection prevents initial Auth deletion',async()=>{
 const {h,at}=timestampHarness(),query=h.sql;h.sql=async(s,o)=>{const rows=await query(s,o);if(o.slot===11)rows[0].auth[0].created_at=at.replace('.123456Z','.123457Z');return rows;};
 await assert.rejects(cleanupMediated(h.j,h));assert.ok(!h.calls.includes('authDelete:A'));assert.equal(h.j.state.fixtures[0].createdAt,at);assert.equal(h.j.state.fixtures[0].stage,'profile_removed');assert.equal(h.alive.size,1);
});
test('one-microsecond Auth timestamp change blocks recovery when metadata is already absent',async()=>{
 const {h,at}=timestampHarness(),query=h.sql;h.sql=async(s,o)=>{if(o.slot===11)throw Error('lost_final_inspection');return query(s,o);};await assert.rejects(cleanupMediated(h.j,h));assert.equal(h.inventory().profiles.length,0);assert.equal(h.alive.size,1);
 h.sql=query;h.fixtures[0].createdAt=at.replace('.123456Z','.123457Z');await h.j.mutate(n=>{n.counters.recoveries.push({id:randomUUID(),startedAt:new Date().toISOString(),counts:{directAuth:0,directStorage:0,cli:0}});});
 await assert.rejects(cleanupMediated(h.j,h,'recovery'));assert.ok(!h.calls.includes('authDelete:A'));assert.equal(h.j.state.fixtures[0].createdAt,at);assert.equal(h.alive.size,1);
});
test('Auth timestamp equality accepts equivalent timezone and fractional precision encodings',async()=>{
 for(const precision of ['microseconds','milliseconds','seconds']){
  const {h,at}=timestampHarness();const canonical=precision==='microseconds'?at:precision==='milliseconds'?at.replace('.123456Z','.123Z'):at.replace('.123456Z','Z');h.j.state.fixtures[0].createdAt=canonical;h.fixtures[0].createdAt=canonical;
  const localHour=new Date(Date.parse(canonical)+10*60*60*1000).toISOString().slice(0,19);const fraction=precision==='microseconds'?'123456':precision==='milliseconds'?'123000':'000000';const equivalent=`${localHour}.${fraction}+10:00`;
  const query=h.sql;h.sql=async(s,o)=>{const rows=await query(s,o);if(o.slot===11)rows[0].auth[0].created_at=equivalent;return rows;};await cleanupMediated(h.j,h);assert.equal(h.j.state.cleanupComplete,true);assert.equal(h.j.state.fixtures[0].createdAt,canonical);
 }
});
