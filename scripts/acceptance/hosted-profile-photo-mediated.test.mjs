import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, lstat, appendFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { RUN_CAPS, CLEANUP_CAPS, PHOTO_CASES, DIRECT_VIEWS, MATRIX_KEYS, directMatrix, photoEnvelope } from './hosted-profile-photo-mediated-protocol.mjs';
import { newMediatedState, validateMediatedState, validateMediatedHistory, MediatedJournal, reserveDispatch } from './hosted-profile-photo-mediated.mjs';
import { TABLES } from './hosted-account-jwt-sql.mjs';

const sha='a'.repeat(64), commit='b'.repeat(40);
const pins={websiteCommit:commit,backendCommit:commit,adapterSha256:sha,releaseSha256:sha,catalog:sha,ordinaryBundleSha256:sha,acceptanceBundleSha256:sha,origin:'https://photos.example.invalid',deploymentId:'deployment-1',cacheReceiptSha256:sha,quiescenceReceiptSha256:sha};
const make=()=>newMediatedState(randomUUID(),pins);
const copy=x=>structuredClone(x);

test('ledger_is_1184_plus_29',()=>{
  assert.deepEqual(RUN_CAPS,{directAuth:11,directData:25,directStorage:314,preparation:1,website:24,workerAuth:624,workerData:120,workerStorage:24,cli:41});
  assert.deepEqual(CLEANUP_CAPS,{directAuth:3,directStorage:6,cli:20});
  assert.equal(Object.values(RUN_CAPS).reduce((a,b)=>a+b,0),1184);
  assert.equal(Object.values(CLEANUP_CAPS).reduce((a,b)=>a+b,0),29);
});
test('matrix_is_11_by_28',()=>{
  assert.deepEqual(DIRECT_VIEWS.map(x=>x.id),['object','authenticated','public','render-auth','render-public','sign','list']);
  assert.equal(DIRECT_VIEWS.length,7);
  const matrix=directMatrix('absence');
  assert.equal(matrix.length,28);
  assert.equal(new Set(matrix.map(x=>`${x.actor}:${x.view}`)).size,28);
  assert.ok(Object.isFrozen(matrix)&&matrix.every(Object.isFrozen));
  assert.throws(()=>directMatrix('../foreign'));
  assert.deepEqual(MATRIX_KEYS,['absence','G1','G2','G1','G2','G1','G2','G1','G2','G1','G2']);
});
test('website_envelopes_are_624_120_24',()=>{
  assert.equal(PHOTO_CASES.length,24);
  assert.deepEqual(PHOTO_CASES.map(x=>x.expected),['G1','G1','G1','G1',404,401,'G1','G1','G1','G1','G1','G1','G2','G2',404,401,404,404,'G2','G2',404,404,404,401]);
  assert.ok(PHOTO_CASES.every(Object.isFrozen));
  assert.equal(new Set(PHOTO_CASES.map(x=>x.id)).size,24);
  assert.deepEqual(photoEnvelope(10),{website:1,workerAuth:26,workerData:5,workerStorage:1});
  assert.throws(()=>photoEnvelope(25));
});
test('journal_rejects_rebound_ids_digests_and_counter_rollback',()=>{
  const before=make();validateMediatedState(before);
  for(const field of ['runId','pins']){const after=copy(before);after[field]=field==='runId'?randomUUID():{...pins,origin:'https://else.example.invalid'};assert.throws(()=>validateMediatedHistory(before,after));}
  const bound=copy(before);bound.fixtures[0].id=randomUUID();validateMediatedHistory(before,bound);
  const rebound=copy(bound);rebound.fixtures[0].id=randomUUID();assert.throws(()=>validateMediatedHistory(bound,rebound));
  const digested=copy(before);digested.preparation.visitorDigest=sha;validateMediatedHistory(before,digested);
  const redigest=copy(digested);redigest.preparation.visitorDigest='b'.repeat(64);assert.throws(()=>validateMediatedHistory(digested,redigest));
  const counted=copy(before);counted.counters.run.cli=1;counted.intents.push({seq:1,phase:'run',epochId:null,descriptor:{kind:'cli',slot:1},delta:{cli:1}});validateMediatedHistory(before,counted);
  const rollback=copy(counted);rollback.counters.run.cli=0;assert.throws(()=>validateMediatedHistory(counted,rollback));
  const observedTooMany=copy(before);assert.ok(observedTooMany.observed,'observed counters must be durable');observedTooMany.observed.run.cli=1;assert.throws(()=>validateMediatedState(observedTooMany));
  const duplicate=copy(before);duplicate.baseline=TABLES.map(table=>({table,count:0,digest:sha}));duplicate.baseline[1].table=duplicate.baseline[0].table;assert.throws(()=>validateMediatedState(duplicate));
  const secret=copy(before);secret.accessToken='secret';assert.throws(()=>validateMediatedState(secret));
  const partial=copy(before);partial.fixtures[0].createdAt=new Date().toISOString();assert.throws(()=>validateMediatedState(partial));
  const empty=copy(before);empty.fixtures[0].id='';assert.throws(()=>validateMediatedState(empty));
  const falseCreated=copy(before);falseCreated.fixtures[0].stage='created';assert.throws(()=>validateMediatedState(falseCreated));
  const falseReserved=copy(before);falseReserved.objects[0].stage='reserved';assert.throws(()=>validateMediatedState(falseReserved));
  const sameUser=copy(before);sameUser.fixtures[0].id=randomUUID();sameUser.fixtures[1].id=sameUser.fixtures[0].id;assert.throws(()=>validateMediatedState(sameUser));
  const providerTime=copy(before);providerTime.fixtures[0].id=randomUUID();providerTime.fixtures[0].createdAt='2026-09-27T12:34:56.123456+00:00';providerTime.fixtures[0].stage='created';validateMediatedState(providerTime);
  const falseRevision=copy(before);falseRevision.revision=2;assert.throws(()=>validateMediatedState(falseRevision));
  const falseCompletion=copy(before);falseCompletion.cleanupComplete=true;assert.throws(()=>validateMediatedState(falseCompletion));
  const regressedPrep=copy(before);regressedPrep.preparation.stage='complete';regressedPrep.preparation.visitorDigest=sha;regressedPrep.preparation.userDigests=['b'.repeat(64),'c'.repeat(64),'d'.repeat(64)];validateMediatedState(regressedPrep);
  const prepRollback=copy(regressedPrep);prepRollback.preparation.stage='planned';assert.throws(()=>validateMediatedHistory(regressedPrep,prepRollback));
});
test('fsync_precedes_dispatch_and_lost_dispatch_never_reclaims_capacity',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-mediated-'));await import('node:fs/promises').then(x=>x.chmod(dir,0o700));
  const j=await MediatedJournal.create(dir,make());
  try{
    let called=0;const dispatch=async()=>{const raw=await readFile(j.path,'utf8');assert.equal(JSON.parse(raw.trim().split('\n').at(-1)).counters.run.website,1);called++;throw Error('lost_ack');};
    const sequence=await reserveDispatch(j,'run',{kind:'photo',caseId:1});assert.equal(sequence,1);
    await assert.rejects(dispatch(),/lost_ack/);assert.equal(called,1);
    assert.equal(j.state.counters.run.website,1);assert.equal(j.state.counters.run.workerAuth,26);
    assert.equal(j.state.intents.length,1);assert.throws(()=>validateMediatedHistory(j.state,{...j.state,intents:[]}));
    await assert.rejects(reserveDispatch(j,'run',{kind:'photo',caseId:1}));
    assert.equal((await lstat(j.path)).mode&0o777,0o600);assert.equal((await lstat(dir)).mode&0o777,0o700);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});
test('unresolved_journal_blocks_run_and_torn_tail_blocks_resume',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-mediated-'));await import('node:fs/promises').then(x=>x.chmod(dir,0o700));
  const first=await MediatedJournal.create(dir,make());const runId=first.state.runId;await first.close();
  try{
    await assert.rejects(MediatedJournal.create(dir,make()),/unresolved_journal/);
    await appendFile(join(dir,`${runId}.jsonl`),'broken');
    await assert.rejects(MediatedJournal.resume(dir,runId),/journal_torn_tail/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('recovery_adds_epoch_without_reset',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-mediated-'));await import('node:fs/promises').then(x=>x.chmod(dir,0o700));
  const j=await MediatedJournal.create(dir,make());
  try{
    await j.mutate(s=>{s.cleanupStartedAt??=s.startedAt;});
    await reserveDispatch(j,'cleanup',{kind:'authDelete',label:'A'});
    await j.mutate(s=>{s.stage='cleanup_blocked';s.uncertainWebsite=true;s.uncertainAt=new Date().toISOString();});
    const before=copy(j.state);
    await j.mutate(s=>{s.counters.recoveries.push({id:randomUUID(),counts:{...CLEANUP_CAPS,directAuth:0,directStorage:0,cli:0},startedAt:new Date().toISOString()});});
    assert.equal(j.state.counters.cleanup.directAuth,1);
    assert.equal(j.state.counters.recoveries.length,1);
    assert.equal(j.state.counters.recoveries[0].counts.directAuth,0);
    const rollback=copy(j.state);rollback.counters.cleanup.directAuth=0;assert.throws(()=>validateMediatedHistory(before,rollback));
    await assert.rejects(reserveDispatch(j,'run',{kind:'photo',caseId:1}));
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});
test('matrix_stage_key_and_attempt_identity_are_fixed',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-mediated-'));await chmod(dir,0o700);
  const j=await MediatedJournal.create(dir,make());
  try{
    const d={kind:'directMatrix',matrixId:1,...directMatrix('absence')[0]};
    assert.equal(await reserveDispatch(j,'run',d),1);
    await assert.rejects(reserveDispatch(j,'run',d),/duplicate_intent/);
    await assert.rejects(reserveDispatch(j,'run',{...d,keyLabel:'G1'}),/descriptor/);
    assert.equal(j.state.counters.run.directStorage,1);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});
test('descriptor_key_order_cannot_reserve_a_second_attempt',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-mediated-'));await chmod(dir,0o700);
  const j=await MediatedJournal.create(dir,make());
  try{
    await reserveDispatch(j,'run',{kind:'authCreate',label:'A'});
    await assert.rejects(reserveDispatch(j,'run',{label:'A',kind:'authCreate'}),/duplicate_intent/);
    await reserveDispatch(j,'run',{kind:'photo',caseId:1});
    await assert.rejects(reserveDispatch(j,'run',{caseId:1,kind:'photo'}),/duplicate_intent/);
    await reserveDispatch(j,'run',{kind:'directMatrix',matrixId:1,keyLabel:'absence',actor:'A',view:'object'});
    await assert.rejects(reserveDispatch(j,'run',{view:'object',actor:'A',keyLabel:'absence',matrixId:1,kind:'directMatrix'}),/duplicate_intent/);
    assert.equal(j.state.intents.length,3);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});
test('uncertain_website_completion_requires_subsequent_bound_recovery_settlement',()=>{
  const before=make();before.stage='cleanup_blocked';before.uncertainWebsite=true;before.uncertainAt=new Date(Date.parse(before.startedAt)+1000).toISOString();
  validateMediatedState(before);
  const unfinished=copy(before);unfinished.stage='complete';unfinished.cleanupComplete=true;
  assert.throws(()=>validateMediatedHistory(before,unfinished));
  const receipt={sha256:sha,run_id:before.runId,origin:before.pins.origin,deployment_id:before.pins.deploymentId,closed_to_test_traffic:true,website_calls_settled:true,admission_writes_settled:true,issued_at:new Date(Date.parse(before.uncertainAt)+1000).toISOString()};
  const noEpoch=copy(unfinished);noEpoch.settlement=receipt;assert.throws(()=>validateMediatedState(noEpoch));
  const settled=copy(noEpoch);settled.counters.recoveries.push({id:randomUUID(),startedAt:new Date(Date.parse(before.uncertainAt)+500).toISOString(),counts:{directAuth:0,directStorage:0,cli:0}});
  const earlyRecovery=copy(settled);earlyRecovery.counters.recoveries[0].startedAt=before.startedAt;assert.throws(()=>validateMediatedState(earlyRecovery));
  for(const patch of [{run_id:randomUUID()},{origin:'https://other.example.invalid'},{deployment_id:'other'},{issued_at:before.uncertainAt},{admission_writes_settled:false}]){
    const invalid=copy(settled);invalid.settlement={...receipt,...patch};assert.throws(()=>validateMediatedState(invalid));
  }
  validateMediatedHistory(before,settled);
  const rebound=copy(settled);rebound.uncertainAt=new Date(Date.parse(before.uncertainAt)+2000).toISOString();assert.throws(()=>validateMediatedHistory(settled,rebound));
});
test('blocked_partial_acknowledgments_keep_authority_context_and_reconcile',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-mediated-'));await chmod(dir,0o700);
  const j=await MediatedJournal.create(dir,make());
  try{
    await j.mutate(s=>{s.stage='cleanup';s.fixtures[0].stage='create_intent';s.objects[0].stage='reserve_intent';s.friendship.stage='insert_intent';s.clear.stage='intent';});
    await j.mutate(s=>{s.stage='cleanup_blocked';s.fixtures[0].stage='create_uncertain';s.objects[0].stage='reserve_uncertain';s.friendship.stage='insert_uncertain';s.clear.stage='uncertain';});
    const blocked=copy(j.state);assert.equal(blocked.objects[0].stage,'reserve_uncertain');
    await j.mutate(s=>{s.counters.recoveries.push({id:randomUUID(),startedAt:new Date().toISOString(),counts:{directAuth:0,directStorage:0,cli:0}});});
    await reserveDispatch(j,'recovery',{kind:'cli',slot:1});
    await assert.rejects(reserveDispatch(j,'recovery',{kind:'authCreate',label:'A'}),/phase_descriptor/);
    await assert.rejects(reserveDispatch(j,'recovery',{kind:'dataOperation',label:'G1',slot:1}),/phase_descriptor/);
    await j.mutate(s=>{s.stage='cleanup';s.fixtures[0].stage='created';s.fixtures[0].id=randomUUID();s.fixtures[0].createdAt=new Date().toISOString();s.objects[0].stage='reserved';s.objects[0].assetId=randomUUID();s.objects[0].key=`${s.fixtures[0].id}/${s.objects[0].assetId}`;s.objects[0].leaseEpoch=1;s.friendship.stage='accepted';s.clear.stage='completed';});
    assert.equal(j.state.fixtures[0].stage,'created');assert.equal(j.state.objects[0].stage,'reserved');assert.equal(j.state.friendship.stage,'accepted');assert.equal(j.state.clear.stage,'completed');
    const raw=await readFile(j.path,'utf8');assert.ok(raw.trim().split('\n').some(line=>JSON.parse(line).stage==='cleanup_blocked'));
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});
test('recovery_epoch_start_time_cannot_move',()=>{
  const before=make();before.stage='cleanup_blocked';before.counters.recoveries.push({id:randomUUID(),startedAt:'2026-09-27T00:00:00.000Z',counts:{directAuth:0,directStorage:0,cli:0}});
  validateMediatedState(before);
  for(const startedAt of ['2026-09-28T00:00:00.000Z','2026-09-26T00:00:00.000Z']){
    const after=copy(before);after.counters.recoveries[0].startedAt=startedAt;assert.throws(()=>validateMediatedHistory(before,after));
  }
});
test('all_run_budgets_are_reserved_with_no_network_dispatch',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-mediated-'));await chmod(dir,0o700);
  const j=await MediatedJournal.create(dir,make());let external=0;
  const dispatch=async descriptor=>{const seq=await reserveDispatch(j,'run',descriptor);external++;return seq;};
  try{
    await dispatch({kind:'authProbe'});
    for(const label of ['A','B','C']){await dispatch({kind:'authCreate',label});await dispatch({kind:'authLogin',label});await dispatch({kind:'authGetUser',label,slot:1});}
    await dispatch({kind:'authGetUser',label:'A',slot:2});
    for(const label of ['G1','G2'])for(let slot=1;slot<=4;slot++)await dispatch({kind:'dataOperation',label,slot});
    await dispatch({kind:'dataClear'});
    for(const label of ['absence','G1','G2'])for(const actor of ['A','B','C','N'])await dispatch({kind:'dataExposure',label,actor});
    for(let slot=1;slot<=4;slot++)await dispatch({kind:'dataBoundary',slot});
    for(let matrixId=1;matrixId<=11;matrixId++)for(const descriptor of directMatrix(MATRIX_KEYS[matrixId-1]))await dispatch({kind:'directMatrix',matrixId,...descriptor});
    for(const label of ['G1','G2'])for(const kind of ['storageUpload','storageReadback','storageWarm'])await dispatch({kind,label});
    await dispatch({kind:'preparation'});
    for(let caseId=1;caseId<=24;caseId++)await dispatch({kind:'photo',caseId});
    for(let slot=1;slot<=41;slot++)await dispatch({kind:'cli',slot});
    assert.deepEqual(j.state.counters.run,RUN_CAPS);
    assert.equal(Object.values(j.state.counters.run).reduce((a,b)=>a+b,0),1184);
    assert.equal(external,416);
    await assert.rejects(dispatch({kind:'cli',slot:42}));
    assert.equal(j.state.counters.run.cli,41);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});
test('one_attempt_operations_and_cleanup_phase_reject_replay',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-mediated-'));await chmod(dir,0o700);
  const j=await MediatedJournal.create(dir,make());
  try{
    await reserveDispatch(j,'run',{kind:'authCreate',label:'A'});
    await assert.rejects(reserveDispatch(j,'run',{kind:'authCreate',label:'A',slot:2}),/descriptor/);
    await assert.rejects(reserveDispatch(j,'cleanup',{kind:'authCreate',label:'B'}),/phase_descriptor/);
    await j.mutate(s=>{s.cleanupStartedAt??=s.startedAt;});
    await reserveDispatch(j,'cleanup',{kind:'authDelete',label:'A'});
    await assert.rejects(reserveDispatch(j,'cleanup',{kind:'authDelete',label:'A',slot:2}),/descriptor/);
    assert.equal(j.state.counters.run.directAuth,1);
    assert.equal(j.state.counters.cleanup.directAuth,1);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});
test('cleanup_reserves_29_without_borrowing_from_run',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-mediated-'));await chmod(dir,0o700);
  const j=await MediatedJournal.create(dir,make());
  try{
    await j.mutate(s=>{s.cleanupStartedAt??=s.startedAt;});
    for(const label of ['A','B','C'])await reserveDispatch(j,'cleanup',{kind:'authDelete',label});
    for(const label of ['G1','G2'])for(const kind of ['storageOwnership','storageDelete','storageAbsence'])await reserveDispatch(j,'cleanup',{kind,label});
    for(let slot=1;slot<=20;slot++)await reserveDispatch(j,'cleanup',{kind:'cli',slot});
    assert.deepEqual(j.state.counters.cleanup,CLEANUP_CAPS);
    assert.equal(Object.values(j.state.counters.cleanup).reduce((a,b)=>a+b,0),29);
    assert.deepEqual(j.state.counters.run,Object.fromEntries(Object.keys(RUN_CAPS).map(k=>[k,0])));
    await assert.rejects(reserveDispatch(j,'cleanup',{kind:'cli',slot:21}),/phase_descriptor/);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});
test('stale_lock_needs_explicit_recovery',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-mediated-'));await chmod(dir,0o700);
  const j=await MediatedJournal.create(dir,make());const runId=j.state.runId;await j.close();
  const { hostname }=await import('node:os');
  const lock=join(dir,'mediated.lock');await writeFile(lock,JSON.stringify({pid:2147483647,host:hostname()}),{mode:0o600});
  try{await assert.rejects(MediatedJournal.resume(dir,runId),/journal_lock/);const recovered=await MediatedJournal.resume(dir,runId,true);await recovered.close();}
  finally{await rm(dir,{recursive:true,force:true});}
});
test('safe_imports_open_no_credentials_or_network',()=>{
const script=`import fs from 'node:fs';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
const forbidden=()=>{throw Error('import_io');};
const sensitive=path=>/(?:^|\\/)(?:\\.env(?:\\..*)?|credentials(?:\\..*)?|secrets(?:\\..*)?)$/i.test(String(path));
const readFileSync=fs.readFileSync,openSync=fs.openSync,readFile=fs.promises.readFile,open=fs.promises.open;
fs.readFileSync=(path,...args)=>{if(sensitive(path))forbidden();return readFileSync(path,...args);};
fs.openSync=(path,...args)=>{if(sensitive(path))forbidden();return openSync(path,...args);};
fs.promises.readFile=(path,...args)=>{if(sensitive(path))forbidden();return readFile(path,...args);};
fs.promises.open=(path,...args)=>{if(sensitive(path))forbidden();return open(path,...args);};
syncBuiltinESMExports();net.Socket.prototype.connect=forbidden;globalThis.fetch=forbidden;
await import('./scripts/acceptance/hosted-profile-photo-mediated-protocol.mjs');
await import('./scripts/acceptance/hosted-profile-photo-mediated.mjs');`;
  const result=spawnSync(process.execPath,['--input-type=module','--eval',script],{cwd:process.cwd(),env:{PATH:process.env.PATH,HOME:'/nonexistent'},encoding:'utf8',timeout:3000});
  assert.equal(result.status,0,result.stderr);
});

test('cleanup clock must be durably bound once before any cleanup reservation',async()=>{
  const state=make();const j={state,async mutate(fn){const next=copy(this.state);fn(next);validateMediatedHistory(this.state,next);this.state=next;}};
  await assert.rejects(reserveDispatch(j,'cleanup',{kind:'cli',slot:1}),/cleanup_start/);
  const started=copy(state);started.cleanupStartedAt=state.startedAt;validateMediatedHistory(state,started);
  const moved=copy(started);moved.cleanupStartedAt=new Date(Date.parse(state.startedAt)+1).toISOString();assert.throws(()=>validateMediatedHistory(started,moved));
  const removed=copy(started);removed.cleanupStartedAt=null;assert.throws(()=>validateMediatedHistory(started,removed));
  const early=copy(state);early.cleanupStartedAt=new Date(Date.parse(state.startedAt)-1).toISOString();assert.throws(()=>validateMediatedState(early));
  j.state=started;await reserveDispatch(j,'cleanup',{kind:'cli',slot:1});const missing=copy(j.state);missing.cleanupStartedAt=null;assert.throws(()=>validateMediatedState(missing));
});

test('admission IDs preserve canonical PostgreSQL bigint precision and cannot rebind',()=>{
 const s=make();s.preparation.visitorDigest=sha;
 for(const id of ['1','9007199254740993','9223372036854775807']){const next=copy(s);next.admissionRows=[{id,digest:sha,createdAt:s.startedAt}];validateMediatedState(next);const changed=copy(next);changed.admissionRows[0].id='2';assert.throws(()=>validateMediatedHistory(next,changed));}
 for(const id of ['0','-1','01','9223372036854775808',randomUUID(),1]){const next=copy(s);next.admissionRows=[{id,digest:sha,createdAt:s.startedAt}];assert.throws(()=>validateMediatedState(next));}
});
