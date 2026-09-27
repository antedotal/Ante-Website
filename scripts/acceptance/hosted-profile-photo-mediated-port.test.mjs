// Synthetic end-to-end ports exercise the real fixed sequence and durable journal without network I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, chmod, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { newMediatedState, validateMediatedState, validateMediatedHistory } from './hosted-profile-photo-mediated.mjs';
import { TABLES } from './hosted-account-jwt-sql.mjs';
import { PHOTO_CASES, RUN_CAPS, CLEANUP_CAPS, MATRIX_KEYS } from './hosted-profile-photo-mediated-protocol.mjs';
import { syntheticReaderBytes } from './hosted-profile-photo-readers.mjs';
import { cookieHeader, sessionCookies } from './hosted-profile-photo-mediated-cookies.mjs';
const portModule=()=>import('./hosted-profile-photo-mediated-port.mjs');
const mainModule=()=>import('./hosted-profile-photo-mediated.mjs');
const hash=b=>createHash('sha256').update(b).digest('hex');
const sha='a'.repeat(64),commit='b'.repeat(40),origin='https://ante.test';
const pins={websiteCommit:commit,backendCommit:commit,adapterSha256:sha,releaseSha256:sha,catalog:sha,ordinaryBundleSha256:sha,acceptanceBundleSha256:sha,origin,deploymentId:'synthetic-deployment',cacheReceiptSha256:sha,quiescenceReceiptSha256:sha};
const credentials={publicKey:'sb_publishable_synthetic_public',secretKey:'sb_secret_synthetic_private'};
const fullSession=id=>({access_token:`exact.${id.replaceAll('-','')}.token`,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'test@example.invalid',app_metadata:{provider:'email'},user_metadata:{}}});
const cacheHeaders={'cache-control':'private, no-store','cdn-cache-control':'no-store','cloudflare-cdn-cache-control':'no-store',pragma:'no-cache',expires:'0',vary:'Cookie'};
const json=(v={},status=200,headers={})=>Response.json(v,{status,headers});
async function setup(fault=''){
 const {makeMediatedPort,POSTCONDITIONS}=await portModule();
 const state=newMediatedState(randomUUID(),pins),calls=[],snapshots=[];
 const j={state,async mutate(fn){const n=structuredClone(this.state);fn(n);validateMediatedState(n);validateMediatedHistory(this.state,n);this.state=n;snapshots.push(structuredClone(n));}};
 const users=new Map(),objects=new Map(),operations=new Map();let friends=[],heads=[],profiles=[],admissions=[],now=Date.parse(state.startedAt),metadataRemoved=false;
 const baseline=TABLES.map(table=>({table,count:0,digest:sha}));
 const inventory=()=>({auth:[...users.values()],profiles,friends,heads,operations:[...operations.values()],objects:[...objects.keys()].map(name=>({name,bucket_id:'profile-photos',owner:null,owner_id:null})),protected:0});
 const query=async(statement,{slot,phase,write}={})=>{
  calls.push({kind:'cli',slot,phase,write,statement});
  assert.ok(j.state.intents.some(i=>i.phase===phase&&i.descriptor.kind==='cli'&&i.descriptor.slot===slot));
  if(phase==='run'){
   if(slot===1||slot===41)return [{digest:pins.catalog}];
   if(slot===2)return [...POSTCONDITIONS].map(name=>({name,pass:fault==='postconditions'?false:true}));
   if(slot===3)return [{objects:0,heads:0,operations:0,multipart:0,parts:0,admissions:0}];
   if(slot===4)return [0,0,0].map(count=>({count}));
   if(slot===5)return baseline;
   if(slot>=8&&slot<=10){const label='ABC'[slot-8],u=users.get(label);return [{auth:u?[u]:[],profiles:profiles.filter(p=>p.id===u?.id),protected:0,privateRows:0,references:0}];}
   if(slot===11)return admissions;
   if([12,15,16].includes(slot)){const status=slot===15?'rejected':'accepted';friends=[{id:j.state.friendship.id,friend_1:j.state.fixtures[0].id,friend_2:j.state.fixtures[1].id,status}];return [];}
   if(slot===13||slot===14){const v=inventory();if(fault==='unknown_operation'&&slot===14)v.operations.push({operation_id:randomUUID()});return [v];}
   if(slot>=17&&slot<=40){if(fault==='new_digest'&&slot===17)return [{id:'9223372036854775807',digest:'f'.repeat(64),createdAt:j.state.startedAt}];return admissions;}
  }else{
   if(fault==='cleanup'&&slot===1)throw Error('synthetic cleanup failure');
   if(slot===1||slot===19)return [{digest:pins.catalog}];
   if(slot>=2&&slot<=4||slot>=11&&slot<=16){const label='ABC'[slot<=4?slot-2:Math.floor((slot-11)/2)],u=users.get(label);return [{auth:u?[u]:[],profiles:profiles.filter(p=>p.id===u?.id),protected:0,privateRows:0,references:metadataRemoved?0:0}];}
   if([5,7,8,20].includes(slot))return [{...inventory(),...(slot===20?{admissions:admissions.length}:{})}];
   if(slot===6){profiles=[];friends=[];heads=[];operations.clear();metadataRemoved=true;return [{remaining:0}];}
   if(slot===9||slot===17)return admissions;
   if(slot===10){admissions=[];return [{remaining:0}];}
   if(slot===18)return baseline;
  }
  throw Error(`unknown test SQL slot ${slot}`);
 };
 const fetchImpl=async(url,init)=>{
  const d=j.state.intents.at(-1).descriptor,phase=j.state.intents.at(-1).phase;calls.push({...d,phase,url,method:init.method,headers:new Headers(init.headers),body:init.body});
  if(d.kind==='authProbe')return json({},404);
  if(d.kind==='authCreate'){const f=j.state.fixtures.find(f=>f.label===d.label),u={id:randomUUID(),email:f.email,marker:j.state.runId,created_at:j.state.startedAt};users.set(d.label,u);profiles.push({id:u.id,email:u.email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null});return json(u);}
  if(d.kind==='authLogin')return json(fullSession(users.get(d.label).id));
  if(d.kind==='authGetUser')return json({id:fault==='refresh_identity'&&d.slot===2?randomUUID():users.get(d.label).id});
  if(d.kind==='authDelete'){users.delete(d.label);return json({});}
  if(d.kind==='preparation'){if(fault==='preparation')return json({},404);return json({version:1,run_id:j.state.runId,visitor_digest:'a'.repeat(64),user_digests:['b','c','d'].map(c=>c.repeat(64))},200,cacheHeaders);}
  if(d.kind==='dataOperation'){
   const o=j.state.objects.find(o=>o.label===d.label),index=d.label==='G1'?0:1;
   if(d.slot===1){const id=randomUUID(),r={code:'OK',kind:'upload',state:'reserved',owner_id:j.state.fixtures[0].id,operation_id:o.operationId,asset_id:id,object_key:`${j.state.fixtures[0].id}/${id}`,lease_epoch:1,lease_until:new Date(now+120000).toISOString(),expected_revision:index,input_sha256:null,normalized_sha256:null,transform_version:null,mime:null,width:null,height:null,byte_count:null,result_revision:null};operations.set(o.operationId,{...r});heads=[{owner_id:r.owner_id,revision:index,current_asset_id:index?j.state.objects[0].assetId:null}];return json(r);}
   const op=operations.get(o.operationId);if(fault==='lease'&&d.slot===2)return json({code:'EXPIRED_LEASE'});
   if(d.slot===2&&fault==='bind_identity')return json({code:'OK',owner_id:randomUUID()});
   if(d.slot===2){op.input_sha256=o.sha256;op.transform_version='synthetic-mediated-reader-v1';return json({...op,input_sha256:`\\x${o.sha256}`});}
   if(d.slot===3){Object.assign(op,{state:'prepared',normalized_sha256:o.sha256,mime:o.mime,width:1,height:1,byte_count:o.byteCount});return json({...op,input_sha256:`\\x${o.sha256}`,normalized_sha256:`\\x${o.sha256}`});}
   Object.assign(op,{state:'completed',result_revision:index+1});heads=[{owner_id:op.owner_id,revision:index+1,current_asset_id:o.assetId}];return json({code:'OK',asset_id:o.assetId,object_key:o.key,revision:index+1});
  }
  if(d.kind==='storageUpload'){const o=j.state.objects.find(o=>o.label===d.label);objects.set(o.key,syntheticReaderBytes(d.label));return json({Key:o.key});}
  if(['storageReadback','storageWarm','storageOwnership','storageAbsence'].includes(d.kind)){const o=j.state.objects.find(o=>o.label===d.label);return objects.has(o.key)?new Response(objects.get(o.key),{headers:{'content-type':'image/png'}}):json({code:'NoSuchKey'},404);}
  if(d.kind==='storageDelete'){objects.delete(j.state.objects.find(o=>o.label===d.label).key);return json({});}
  if(d.kind==='directMatrix'){if(fault==='warm_leak'&&d.matrixId===2)return new Response(syntheticReaderBytes('G1'),{headers:{'content-type':'image/png'}});return d.view==='list'?json([]):json({message:'denied'},fault==='render_generic_400'&&d.view.startsWith('render-')?400:403);}
  if(d.kind==='dataExposure'||d.kind==='dataBoundary')return json({message:'denied'},403);
  if(d.kind==='photo'){
   if(fault==='lost_photo'&&d.caseId===1)throw Error('lost completion');
   if(fault==='run_timeout'&&d.caseId===1)now+=900001;
   const c=PHOTO_CASES[d.caseId-1],headers={...cacheHeaders};if(fault==='photo_cache'&&d.caseId===1)headers['cache-control']='public';
   if(d.caseId===10){const session={...fullSession(j.state.fixtures[0].id),access_token:'exact.updated.token'};const jar=sessionCookies(session,origin);for(const part of cookieHeader(jar,origin).split('; '))headers['set-cookie']=`${part}; Path=/; Secure; SameSite=Lax`;if(fault==='refresh_cookie')delete headers['set-cookie'];}
   return typeof c.expected==='number'?json({error:c.expected===401?'Authentication required':'Photo not found'},c.expected,headers):new Response(syntheticReaderBytes(c.expected),{headers:{...headers,'content-type':'image/png'}});
  }
  if(d.kind==='dataClear'){const op={owner_id:j.state.fixtures[0].id,operation_id:j.state.clear.operationId,kind:'delete',expected_revision:2,state:'completed',result_revision:3};for(const k of ['asset_id','object_key','lease_epoch','input_sha256','normalized_sha256','transform_version','mime','width','height','byte_count'])op[k]=null;operations.set(op.operation_id,op);heads=[{owner_id:op.owner_id,revision:3,current_asset_id:null}];return json({code:'OK',revision:3,current_asset_id:null});}
  throw Error('unknown test HTTP');
 };
 const {createMediatedHttp}=await import('./hosted-profile-photo-mediated-http.mjs');
 const realAdapter=await import('/Users/daniel/.codex/worktrees/ante-web-first-foundation/Ante/supabase/functions/_shared/profilePhotoAssetStore.ts');
 const port=makeMediatedPort(j,credentials,{http:opts=>createMediatedHttp({...opts,operatorToken:'e'.repeat(64),fetchImpl,clock:{now:()=>performance.now(),wall:()=>now}}),query,inspectConfig:async()=>{calls.push({kind:'config'});return true;},adapter:async subset=>{assert.deepEqual(Object.keys(subset).sort(),['adapterSha256','backendCommit','catalog']);return realAdapter;},clock:()=>now,postconditions:'synthetic approved SQL'});
 return {j,port,calls,snapshots};
}

test('exports fixed integration without provider side effects',async()=>{assert.equal(typeof(await portModule().catch(()=>({}))).makeMediatedPort,'function');assert.equal(typeof(await mainModule()).runMediatedAcceptance,'function');});
test('complete fixed scenario reserves 1184 plus 29, all cases, matrices and exact replay URLs',async()=>{
 const x=await setup(),{runMediatedAcceptance,mediatedReceipt}=await mainModule();await runMediatedAcceptance(x.j,x.port);
 assert.deepEqual(x.j.state.counters.run,RUN_CAPS);assert.deepEqual(x.j.state.counters.cleanup,CLEANUP_CAPS);
 assert.equal(x.j.state.revision,3);assert.equal(x.j.state.cleanupComplete,true);
 const photos=x.calls.filter(c=>c.kind==='photo');assert.deepEqual(photos.map(c=>c.caseId),Array.from({length:24},(_,i)=>i+1));assert.equal(new Set(photos.map(c=>c.url)).size,1);
 const matrices=x.calls.filter(c=>c.kind==='directMatrix');assert.equal(matrices.length,308);
 for(let i=1;i<=11;i++){const rows=matrices.filter(c=>c.matrixId===i);assert.equal(rows.length,28);assert.ok(rows.every(c=>c.keyLabel===MATRIX_KEYS[i-1]));}
 for(const label of ['G1','G2'])assert.equal(new Set(matrices.filter(c=>c.keyLabel===label&&c.view==='authenticated').map(c=>c.url)).size,1);
 assert.equal(x.calls.filter(c=>['dataExposure','dataBoundary'].includes(c.kind)).length,16);
 assert.equal(x.calls.filter(c=>c.kind==='cli'&&c.phase==='run').length,39);assert.equal(x.calls.filter(c=>c.kind==='config').length,1);
 const firstUpload=x.calls.findIndex(c=>c.kind==='storageUpload');assert.ok(x.calls.slice(0,firstUpload).filter(c=>c.kind==='directMatrix').length===28);assert.equal(x.calls.slice(0,firstUpload).filter(c=>['dataExposure','dataBoundary'].includes(c.kind)).length,8);
 const prep=x.snapshots.findIndex(s=>s.preparation.stage==='complete'),photo=x.snapshots.findIndex(s=>s.counters.run.website>0);assert.ok(prep>=0&&prep<photo);assert.ok(x.snapshots[prep].fixtures.every(f=>f.stage==='created'));assert.equal(new Set([x.snapshots[prep].preparation.visitorDigest,...x.snapshots[prep].preparation.userDigests]).size,4);
 assert.ok(x.snapshots.some(s=>s.scenarioIndex===12&&s.objects[1].stage==='verified'&&s.revision===1));
 const receipt=mediatedReceipt(x.j.state);assert.equal(receipt.execution,'not_attested');assert.ok(Object.values(receipt.remainingGates).every(v=>v==='not_accepted'));assert.ok(!JSON.stringify(receipt).includes(x.j.state.fixtures[0].id));
});
for(const fault of ['preparation','refresh_identity','refresh_cookie','lease','new_digest','run_timeout','cleanup','unknown_operation','lost_photo','warm_leak','photo_cache','postconditions','bind_identity'])test(`failure ${fault} stops sequence and attempts bounded cleanup`,async()=>{
 const x=await setup(fault),{runMediatedAcceptance,mediatedReceipt}=await mainModule();await assert.rejects(runMediatedAcceptance(x.j,x.port));
 assert.equal(x.j.state.outcome,'failed');assert.ok(x.calls.some(c=>c.phase==='cleanup'));
 for(const [key,cap] of Object.entries(RUN_CAPS))assert.ok(x.j.state.counters.run[key]<=cap);
 for(const [key,cap] of Object.entries(CLEANUP_CAPS))assert.ok(x.j.state.counters.cleanup[key]<=cap);
 assert.ok(Object.values(mediatedReceipt(x.j.state).remainingGates).every(v=>v==='not_accepted'));
 if(fault==='warm_leak'){assert.equal(x.calls.filter(c=>c.kind==='directMatrix'&&c.matrixId===2).length,1);assert.equal(x.calls.filter(c=>c.kind==='photo').length,0);}
 if(fault==='lost_photo'){assert.equal(x.j.state.uncertainWebsite,true);assert.equal(x.j.state.cleanupComplete,false);}
 if(fault==='bind_identity')assert.equal(x.calls.filter(c=>c.kind==='dataOperation'&&c.slot===3).length,0);
 if(fault==='preparation')assert.equal(x.j.state.fixtures.filter(f=>f.stage==='cleaned').length,3);
});
test('CLI rejects unknown operations and flags before constructing providers',async()=>{
 const {main}=await mainModule();for(const argv of [['deploy'],['run'],['preflight','--wat'],['cleanup','--reviewed']])await assert.rejects(main(argv));
});
test('ordinary entry/config never import preparation wrapper',async()=>{
 for(const file of ['worker-entry.mjs','wrangler.jsonc'])assert.doesNotMatch(await readFile(new URL(`../../${file}`,import.meta.url),'utf8'),/mediated-preparation|__ante_acceptance|ANTE_ACCEPTANCE_/);
});

// These negative cases target response acceptance, not the synthetic provider's implementation.
test('website status, full bytes, fixed denial bodies and every cache assertion fail closed',async()=>{
 const {assertPhotoResponse}=await portModule();
 const good={status:200,headers:new Headers({...cacheHeaders,'content-type':'image/png'}),bytes:syntheticReaderBytes('G1')};
 assertPhotoResponse(good,'G1');
 for(const name of Object.keys(cacheHeaders)){const headers=new Headers(good.headers);headers.delete(name);assert.throws(()=>assertPhotoResponse({...good,headers},'G1'));}
 for(const name of ['etag','last-modified','accept-ranges','content-range','age','cf-cache-status']){const headers=new Headers(good.headers);headers.set(name,'unexpected');assert.throws(()=>assertPhotoResponse({...good,headers},'G1'));}
 for(const status of [206,304,401,404,429,503])assert.throws(()=>assertPhotoResponse({...good,status},'G1'));
 assert.throws(()=>assertPhotoResponse({...good,bytes:syntheticReaderBytes('G2')},'G1'));
 for(const status of [401,404]){const r={status,headers:new Headers({...cacheHeaders,'content-type':'application/json'}),bytes:Buffer.from(JSON.stringify({error:status===401?'Authentication required':'Photo not found'}))};assertPhotoResponse(r,status);assert.throws(()=>assertPhotoResponse({...r,bytes:Buffer.from('{}')},status));}
});
test('preparation body and hash reconstruct from durable identities and reject unbound or duplicate users',async()=>{
 const {mediatedPreparationIntent}=await mainModule(),x=await setup();
 assert.throws(()=>mediatedPreparationIntent(x.j.state));await x.port.preflight();for(const label of ['A','B','C'])await x.port.createIdentity(label);
 const before=mediatedPreparationIntent(x.j.state),reload=JSON.parse(JSON.stringify(x.j.state));assert.deepEqual(mediatedPreparationIntent(reload),before);
 assert.equal(before.body,JSON.stringify({run_id:reload.runId,fixture_ids:reload.fixtures.map(f=>f.id)}));assert.equal(before.sha256,hash(before.body));
 await x.port.prepareDigests();assert.equal(x.calls.find(c=>c.kind==='preparation').body,before.body);
 const bad=structuredClone(reload);bad.fixtures[1].id=bad.fixtures[0].id;assert.throws(()=>mediatedPreparationIntent(bad));
});
test('preflight is only seven read-only CLI reservations and one Auth probe; no preparation or fixture mutation',async()=>{
 const x=await setup();await x.port.preflight();assert.equal(x.j.state.counters.run.cli,7);assert.equal(x.j.state.counters.run.directAuth,1);
 assert.ok(x.calls.every(c=>c.kind==='cli'&&!c.write||c.kind==='authProbe'||c.kind==='config'));assert.equal(x.j.state.preparation.stage,'planned');
});

async function operatorInputs(){
 const dir=await mkdtemp(join(tmpdir(),'mediated-input-')),root='/Users/daniel/.codex/worktrees/ante-web-first-foundation',exec=promisify(execFile);
 const p={...pins,websiteCommit:(await exec('git',['-C',`${root}/Ante-Website`,'rev-parse','HEAD'])).stdout.trim(),backendCommit:(await exec('git',['-C',`${root}/Ante`,'rev-parse','HEAD'])).stdout.trim(),adapterSha256:hash(await readFile(`${root}/Ante/supabase/functions/_shared/profilePhotoAssetStore.ts`)),releaseSha256:hash(await readFile(`${root}/Ante/supabase/releases/profile-photo-mediated-readers/postconditions.sql`)),ordinaryBundleSha256:hash('synthetic ordinary'),acceptanceBundleSha256:hash('synthetic acceptance')};
 const s=newMediatedState(randomUUID(),p),base={run_id:s.runId,origin, deployment_id:p.deploymentId,issued_at:new Date(Date.now()-1000).toISOString()};
 const cache={...base,website_commit:p.websiteCommit,backend_commit:p.backendCommit,ordinary_bundle_sha256:p.ordinaryBundleSha256,acceptance_bundle_sha256:p.acceptanceBundleSha256,release_sha256:p.releaseSha256,catalog:p.catalog,installed_configuration_verified:true,profile_photo_cache_bypass:true};
 const quiet={...base,exclusive_fixture_ingress:true,profile_admission_producers_stopped:true,other_admission_producers_stopped:true};
 const files={'cache-receipt':JSON.stringify(cache),'quiescence-receipt':JSON.stringify(quiet),'public-key-file':credentials.publicKey,'secret-key-file':credentials.secretKey,'operator-token-file':'e'.repeat(64),'ordinary-bundle':'synthetic ordinary','acceptance-bundle':'synthetic acceptance'};
 const args={mode:'run'};for(const [name,value] of Object.entries(files)){args[name]=join(dir,name);await writeFile(args[name],value,{mode:0o600});}
 s.pins.cacheReceiptSha256=hash(files['cache-receipt']);s.pins.quiescenceReceiptSha256=hash(files['quiescence-receipt']);
 return {dir,s,args,cache};
}
test('operator files verify actual source pins and bundle hashes using synthetic credentials only',async()=>{
 const x=await operatorInputs(),{loadMediatedInputs}=await mainModule();try{
  const inputs=await loadMediatedInputs(x.args,x.s);assert.equal(inputs.credentials.secretKey,credentials.secretKey);assert.equal(typeof(await inputs.adapter()).storePreparedProfilePhoto,'function');
  for(const key of ['websiteCommit','backendCommit','adapterSha256','releaseSha256','ordinaryBundleSha256','acceptanceBundleSha256']){const s=structuredClone(x.s);s.pins[key]='0'.repeat(key.endsWith('Commit')?40:64);await assert.rejects(loadMediatedInputs(x.args,s));}
  await writeFile(x.args['cache-receipt'],JSON.stringify({...x.cache,profile_photo_cache_bypass:false}));await assert.rejects(loadMediatedInputs(x.args,x.s));
 }finally{await rm(x.dir,{recursive:true,force:true});}
});
test('receipt files reject changed hashes, foreign binding, extra fields, symlinks and public modes',async()=>{
 const x=await operatorInputs(),{loadMediatedReceipt}=await mainModule();try{
  await loadMediatedReceipt(x.args['cache-receipt'],'cache',x.s);
  for(const patch of [{run_id:randomUUID()},{origin:'https://foreign.test'},{deployment_id:'other'},{unexpected:true},{profile_photo_cache_bypass:false},{issued_at:new Date(Date.now()+60000).toISOString()}]){
   const raw=JSON.stringify({...x.cache,...patch});await writeFile(x.args['cache-receipt'],raw);const s=structuredClone(x.s);s.pins.cacheReceiptSha256=hash(raw);await assert.rejects(loadMediatedReceipt(x.args['cache-receipt'],'cache',s));
  }
  await writeFile(x.args['cache-receipt'],JSON.stringify(x.cache)+' ');await assert.rejects(loadMediatedReceipt(x.args['cache-receipt'],'cache',x.s));
  await writeFile(x.args['cache-receipt'],JSON.stringify(x.cache));await chmod(x.args['cache-receipt'],0o644);await assert.rejects(loadMediatedReceipt(x.args['cache-receipt'],'cache',x.s));await chmod(x.args['cache-receipt'],0o600);
  const link=join(x.dir,'link');await symlink(x.args['cache-receipt'],link);await assert.rejects(loadMediatedReceipt(link,'cache',x.s));
 }finally{await rm(x.dir,{recursive:true,force:true});}
});
test('uncertain settlement must be later, exact and bound; SHA hashes the original file bytes',async()=>{
 const x=await operatorInputs(),{loadMediatedReceipt}=await mainModule();try{
  x.s.uncertainWebsite=true;x.s.uncertainAt=x.s.startedAt;
  const r={run_id:x.s.runId,origin,deployment_id:x.s.pins.deploymentId,closed_to_test_traffic:true,website_calls_settled:true,admission_writes_settled:true,issued_at:new Date(Date.parse(x.s.startedAt)+1).toISOString()},path=join(x.dir,'settlement');
  await writeFile(path,JSON.stringify(r),{mode:0o600});assert.equal((await loadMediatedReceipt(path,'settlement',x.s,Date.parse(r.issued_at))).sha256,hash(JSON.stringify(r)));
  await writeFile(path,JSON.stringify({...r,issued_at:x.s.uncertainAt}));await assert.rejects(loadMediatedReceipt(path,'settlement',x.s));
 }finally{await rm(x.dir,{recursive:true,force:true});}
});
test('fresh subprocess imports neither read credentials nor start HTTP/provider commands',async()=>{
 const exec=promisify(execFile),script=`import https from 'node:https'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; https.request=()=>{throw Error('network on import')}; cp.execFile=()=>{throw Error('process on import')}; globalThis.fetch=()=>{throw Error('fetch on import')}; syncBuiltinESMExports(); await import('./scripts/acceptance/hosted-profile-photo-mediated.mjs'); await import('./scripts/acceptance/hosted-profile-photo-mediated-port.mjs');`;
 await exec(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../..',import.meta.url),timeout:5000,env:{...process.env,ANTE_ACCEPTANCE_OPERATOR_TOKEN_FILE:'/does-not-exist'}});
});
test('explicit recovery marks a crashed unfinished website dispatch uncertain before one immutable recovery epoch',async()=>{
 const {prepareMediatedRecovery,reserveDispatch}=await mainModule(),x=await setup();await x.port.preflight();for(const label of ['A','B','C'])await x.port.createIdentity(label);await x.port.prepareDigests();await x.j.mutate(s=>{s.stage='run';});await reserveDispatch(x.j,'run',{kind:'photo',caseId:1});
 await prepareMediatedRecovery(x.j);assert.equal(x.j.state.uncertainWebsite,true);assert.equal(x.j.state.outcome,'failed');assert.equal(x.j.state.counters.recoveries.length,1);assert.ok(x.j.state.cleanupStartedAt);assert.equal(x.j.state.stage,'cleanup_blocked');
 await assert.rejects(prepareMediatedRecovery(x.j));
});

test('retains all safe direct outcomes through journal reconstruction and receipt generation',async()=>{
 const {runMediatedAcceptance,mediatedReceipt,MediatedJournal}=await mainModule(),x=await setup('render_generic_400');await runMediatedAcceptance(x.j,x.port);
 assert.equal(x.j.state.directObservations?.length,324);
 const matrix=x.j.state.directObservations.filter(r=>r.descriptor.kind==='directMatrix'),data=x.j.state.directObservations.filter(r=>r.descriptor.kind!=='directMatrix');
 assert.equal(matrix.length,308);assert.equal(data.length,16);
 assert.equal(matrix.filter(r=>r.result==='empty_list'&&r.status===200).length,44);
 assert.equal(matrix.filter(r=>r.capability==='capability_unverified'&&r.result==='denied'&&r.status===400).length,88);
 assert.ok(data.every(r=>r.status===403&&r.result==='denied'&&!Object.hasOwn(r,'capability')));
 for(const row of matrix.filter(r=>r.descriptor.view.startsWith('render-')))assert.deepEqual(Object.keys(row).sort(),['capability','descriptor','result','status']);
 const safe=JSON.stringify(x.j.state.directObservations);for(const forbidden of [origin,'https://',x.j.state.fixtures[0].id,'message',JSON.stringify({message:'denied'})])assert.ok(!safe.includes(forbidden));
 const dir=await mkdtemp(join(tmpdir(),'mediated-evidence-'));let saved;
 try{saved=await MediatedJournal.create(dir,x.j.state);await saved.close();saved=await MediatedJournal.resume(dir,x.j.state.runId);assert.deepEqual(mediatedReceipt(saved.state).directObservations,x.j.state.directObservations);}finally{await saved?.close();await rm(dir,{recursive:true,force:true});}
 for(const action of [s=>s.directObservations.pop(),s=>s.directObservations.splice(0,1),s=>s.directObservations.splice(s.directObservations.findIndex(r=>r.descriptor.kind==='dataExposure'),1),s=>s.directObservations.push(structuredClone(s.directObservations[0]))]){const bad=structuredClone(x.j.state);action(bad);assert.throws(()=>validateMediatedState(bad));assert.throws(()=>mediatedReceipt(bad));}
});
test('phase-one assertion rejects omitted evidence despite complete request counters',async()=>{
 const {runMediatedAcceptance}=await mainModule(),x=await setup();
 // Suppress only successful observation persistence to simulate a broken injected port.
 const mutate=x.j.mutate.bind(x.j);x.j.mutate=async fn=>{const before=x.j.state.directObservations?.length;await mutate(fn);if(x.j.state.directObservations?.length>before)x.j.state.directObservations=[];};
 await assert.rejects(runMediatedAcceptance(x.j,x.port));assert.equal(x.j.state.outcome,'failed');assert.equal(x.j.state.counters.run.directStorage,314);
});
