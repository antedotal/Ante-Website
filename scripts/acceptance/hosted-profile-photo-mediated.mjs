// Durable source-only protocol for mediated hosted acceptance. Imports perform no I/O.
import { constants } from 'node:fs';
import { open, mkdir, readdir, readFile, lstat, unlink } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { hostname, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PROJECT, validateCredentials } from './hosted-account-jwt.mjs';
import { TABLES } from './hosted-account-jwt-sql.mjs';
import { RUN_CAPS, CLEANUP_CAPS, DIRECT_VIEWS, MATRIX_KEYS, photoEnvelope, PHOTO_CASES } from './hosted-profile-photo-mediated-protocol.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{64}$/;
const COMMIT=/^[0-9a-f]{40}$/;
const LABELS=['A','B','C'];
const PIN_KEYS=['websiteCommit','backendCommit','adapterSha256','releaseSha256','catalog','ordinaryBundleSha256','acceptanceBundleSha256','origin','deploymentId','cacheReceiptSha256','quiescenceReceiptSha256'];
const STATE_KEYS=['version','project','runId','startedAt','pins','stage','outcome','cleanupComplete','cleanupStartedAt','uncertainWebsite','uncertainAt','fixtures','objects','absenceProbeAssetId','friendship','clear','revision','preparation','baseline','after','admissionRows','scenarioIndex','assertions','directObservations','failures','counters','observed','intents','settlement'];
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
const need=(ok,code)=>{if(!ok)throw Error(code);};
const timestamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const bound=(a,b)=>a===null||a===b;
const persisted=(a,b)=>a===null||JSON.stringify(a)===JSON.stringify(b);
const prefix=(a,b)=>a.length<=b.length&&a.every((v,i)=>JSON.stringify(v)===JSON.stringify(b[i]));
// Descriptor identity is stable across JSON object key order.
const descriptorIdentity=d=>JSON.stringify(Object.entries(d).sort(([a],[b])=>a.localeCompare(b)));
const zero=caps=>Object.fromEntries(Object.keys(caps).map(k=>[k,0]));
const stages={prepared:['preflight','run','cleanup','cleanup_blocked'],preflight:['run','cleanup','cleanup_blocked'],run:['cleanup','cleanup_blocked'],cleanup:['cleanup_blocked','complete'],cleanup_blocked:['cleanup','complete'],complete:[]};
const fixtureStages={planned:['create_intent'],create_intent:['created','create_uncertain'],create_uncertain:['created'],created:['profile_removed','auth_delete_intent'],profile_removed:['auth_delete_intent'],auth_delete_intent:['cleaned'],cleaned:[]};
const objectStages={planned:['reserve_intent'],reserve_intent:['reserved','reserve_uncertain'],reserve_uncertain:['reserved'],reserved:['bind_intent'],bind_intent:['bound','bind_uncertain'],bind_uncertain:['bound'],bound:['prepare_intent'],prepare_intent:['prepared','prepare_uncertain'],prepare_uncertain:['prepared'],prepared:['upload_intent'],upload_intent:['verified','upload_uncertain'],upload_uncertain:['verified'],verified:['publish_intent','delete_intent'],publish_intent:['published','publish_uncertain'],publish_uncertain:['published'],published:['delete_intent'],delete_intent:['deleted'],deleted:[]};
const friendStages={planned:['insert_intent'],insert_intent:['accepted','insert_uncertain'],insert_uncertain:['accepted'],accepted:['reject_intent','delete_intent'],reject_intent:['rejected','reject_uncertain'],reject_uncertain:['rejected'],rejected:['restore_intent','delete_intent'],restore_intent:['accepted_again','restore_uncertain'],restore_uncertain:['accepted_again'],accepted_again:['delete_intent'],delete_intent:['deleted'],deleted:[]};
const clearStages={planned:['intent'],intent:['completed','uncertain'],uncertain:['completed'],completed:[]};
const preparationStages={planned:['intent'],intent:['complete','uncertain'],uncertain:['complete'],complete:[]};
const advance=(a,b,graph)=>a===b||graph[a]?.includes(b);

/** @typedef {{websiteCommit:string,backendCommit:string,adapterSha256:string,releaseSha256:string,catalog:string,ordinaryBundleSha256:string,acceptanceBundleSha256:string,origin:string,deploymentId:string,cacheReceiptSha256:string,quiescenceReceiptSha256:string}} MediatedPins */
/** @typedef {{label:'A'|'B'|'C',email:string,id:string|null,createdAt:string|null,stage:string,createAttempts:number,deleteAttempts:number}} MediatedFixture */
/** @typedef {{label:'G1'|'G2',operationId:string,assetId:string|null,key:string|null,leaseEpoch:number|null,sha256:string|null,byteCount:number|null,mime:'image/png',stage:string,uploadAttempts:number,deleteAttempts:number}} MediatedObject */
/** @typedef {{visitorDigest:string|null,userDigests:(string|null)[],intentId:string,stage:'planned'|'intent'|'complete'|'uncertain'}} MediatedPreparation */
/** @typedef {{seq:number,phase:'run'|'cleanup'|'recovery',epochId:string|null,descriptor:import('./hosted-profile-photo-mediated-protocol.mjs').DispatchDescriptor,delta:Record<string,number>}} MediatedIntent */
/** @typedef {{descriptor:import('./hosted-profile-photo-mediated-protocol.mjs').DispatchDescriptor,status:number,result:'denied'|'empty_list',capability?:'capability_unverified'}} DirectObservation */
/** @typedef {{version:3,project:string,runId:string,startedAt:string,pins:MediatedPins,stage:string,outcome:'pending'|'phase_one_http_passed'|'failed',cleanupComplete:boolean,cleanupStartedAt:string|null,uncertainWebsite:boolean,uncertainAt:string|null,fixtures:MediatedFixture[],objects:MediatedObject[],absenceProbeAssetId:string,friendship:{id:string,stage:string},clear:{operationId:string,stage:string},revision:number,preparation:MediatedPreparation,baseline:null|Array<{table:string,count:number,digest:string}>,after:null|Array<{table:string,count:number,digest:string}>,admissionRows:Array<{id:string,digest:string,createdAt:string}>,scenarioIndex:number,assertions:Array<{caseId:number,passed:boolean}>,directObservations:DirectObservation[],failures:string[],counters:{run:Record<string,number>,cleanup:Record<string,number>,recoveries:Array<{id:string,startedAt:string,counts:Record<string,number>}>},observed:{run:Record<string,number>,cleanup:Record<string,number>,recovery:Record<string,number>},intents:MediatedIntent[],settlement:null|{sha256:string,run_id:string,origin:string,deployment_id:string,closed_to_test_traffic:true,website_calls_settled:true,admission_writes_settled:true,issued_at:string}} MediatedState */

function validatePins(p){
  need(exact(p,PIN_KEYS),'pin_shape');
  need(COMMIT.test(p.websiteCommit)&&COMMIT.test(p.backendCommit),'pin_commit');
  for(const k of PIN_KEYS.filter(k=>k.endsWith('Sha256')||k==='catalog'))need(SHA.test(p[k]),'pin_sha');
  need(/^https:\/\/[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(p.origin)&&p.origin==='https://'+new URL(p.origin).host,'pin_origin');
  need(typeof p.deploymentId==='string'&&/^[a-zA-Z0-9._:-]{1,120}$/.test(p.deploymentId),'pin_deployment');
}

/** Construct fixed identities and operation UUIDs before any provider call. */
export function newMediatedState(runId,pins){
  need(UUID.test(runId),'run_id');validatePins(pins);
  const state={version:3,project:PROJECT,runId,startedAt:new Date().toISOString(),pins:structuredClone(pins),stage:'prepared',outcome:'pending',cleanupComplete:false,cleanupStartedAt:null,uncertainWebsite:false,uncertainAt:null,
    fixtures:LABELS.map(label=>({label,email:`ante-mediated-${runId}-${label.toLowerCase()}@example.invalid`,id:null,createdAt:null,stage:'planned',createAttempts:0,deleteAttempts:0})),
    objects:['G1','G2'].map(label=>({label,operationId:randomUUID(),assetId:null,key:null,leaseEpoch:null,sha256:null,byteCount:null,mime:'image/png',stage:'planned',uploadAttempts:0,deleteAttempts:0})),
    absenceProbeAssetId:randomUUID(),friendship:{id:randomUUID(),stage:'planned'},clear:{operationId:randomUUID(),stage:'planned'},revision:0,
    preparation:{visitorDigest:null,userDigests:[null,null,null],intentId:randomUUID(),stage:'planned'},baseline:null,after:null,admissionRows:[],scenarioIndex:0,assertions:[],directObservations:[],failures:[],
    counters:{run:zero(RUN_CAPS),cleanup:zero(CLEANUP_CAPS),recoveries:[]},observed:{run:zero(RUN_CAPS),cleanup:zero(CLEANUP_CAPS),recovery:zero(CLEANUP_CAPS)},intents:[],settlement:null};
  validateMediatedState(state);return state;
}

function validateFingerprint(rows){
  if(rows===null)return;
  need(Array.isArray(rows)&&rows.length===22&&TABLES.length===22,'fingerprint_size');
  need(rows.every((r,i)=>exact(r,['table','count','digest'])&&r.table===TABLES[i]&&Number.isSafeInteger(r.count)&&r.count>=0&&SHA.test(r.digest)),'fingerprint_rows');
  need(new Set(rows.map(r=>r.table)).size===22,'fingerprint_unique');
}
function counts(value,caps){
  need(exact(value,Object.keys(caps)),'counter_shape');
  for(const [k,cap] of Object.entries(caps))need(Number.isSafeInteger(value[k])&&value[k]>=0&&value[k]<=cap,'counter_cap');
}
function validateDescriptor(d){
  need(d!==null&&typeof d==='object'&&!Array.isArray(d),'descriptor');
  const label=LABELS.includes(d.label),generation=['G1','G2'].includes(d.label);
  if(d.kind==='photo')need(exact(d,['kind','caseId'])&&Number.isInteger(d.caseId)&&d.caseId>=1&&d.caseId<=24,'descriptor');
  else if(d.kind==='directMatrix')need(exact(d,['kind','matrixId','keyLabel','actor','view'])&&Number.isInteger(d.matrixId)&&d.matrixId>=1&&d.matrixId<=11&&MATRIX_KEYS[d.matrixId-1]===d.keyLabel&&['A','B','C','N'].includes(d.actor)&&DIRECT_VIEWS.some(x=>x.id===d.view),'descriptor');
  else if(['authProbe','preparation','dataClear'].includes(d.kind))need(exact(d,['kind']),'descriptor');
  else if(d.kind==='cli')need(exact(d,['kind','slot'])&&Number.isInteger(d.slot)&&d.slot>=1&&d.slot<=41,'descriptor');
  else if(d.kind==='dataBoundary')need(exact(d,['kind','slot'])&&Number.isInteger(d.slot)&&d.slot>=1&&d.slot<=4,'descriptor');
  else if(['authCreate','authLogin','authDelete'].includes(d.kind))need(exact(d,['kind','label'])&&label,'descriptor');
  else if(d.kind==='authGetUser')need(exact(d,['kind','label','slot'])&&label&&(d.slot===1||d.label==='A'&&d.slot===2),'descriptor');
  else if(d.kind==='dataOperation')need(exact(d,['kind','label','slot'])&&generation&&Number.isInteger(d.slot)&&d.slot>=1&&d.slot<=4,'descriptor');
  else if(d.kind==='dataExposure')need(exact(d,['kind','label','actor'])&&['absence','G1','G2'].includes(d.label)&&['A','B','C','N'].includes(d.actor),'descriptor');
  else if(['storageUpload','storageReadback','storageWarm','storageOwnership','storageDelete','storageAbsence'].includes(d.kind))need(exact(d,['kind','label'])&&generation,'descriptor');
  else throw Error('descriptor');
}
function delta(d){
  if(d.kind==='photo')return photoEnvelope(d.caseId);
  if(d.kind==='preparation')return {preparation:1};
  if(d.kind==='cli')return {cli:1};
  if(d.kind.startsWith('auth'))return {directAuth:1};
  if(d.kind.startsWith('data'))return {directData:1};
  return {directStorage:1};
}

/** Reject extra fields and invalid partial identities before they become durable. */
export function validateMediatedState(s){
  need(exact(s,STATE_KEYS)&&s.version===3&&s.project===PROJECT&&UUID.test(s.runId)&&timestamp(s.startedAt),'journal_shape');validatePins(s.pins);
  need(Object.hasOwn(stages,s.stage)&&['pending','phase_one_http_passed','failed'].includes(s.outcome)&&typeof s.cleanupComplete==='boolean'&&typeof s.uncertainWebsite==='boolean','journal_stage');
  need(s.cleanupComplete===(s.stage==='complete'),'journal_completion');
  need(s.cleanupStartedAt===null||timestamp(s.cleanupStartedAt)&&new Date(s.cleanupStartedAt).toISOString()===s.cleanupStartedAt&&Date.parse(s.cleanupStartedAt)>=Date.parse(s.startedAt),'cleanup_start');
  need(s.cleanupStartedAt!==null||Object.values(s.counters.cleanup).every(n=>n===0),'cleanup_start');
  need(s.uncertainWebsite?timestamp(s.uncertainAt)&&Date.parse(s.uncertainAt)>=Date.parse(s.startedAt):s.uncertainAt===null,'journal_uncertainty');
  need(Array.isArray(s.fixtures)&&s.fixtures.length===3,'journal_fixtures');
  for(let i=0;i<3;i++){
    const f=s.fixtures[i],label=LABELS[i];
    need(exact(f,['label','email','id','createdAt','stage','createAttempts','deleteAttempts'])&&f.label===label&&f.email===`ante-mediated-${s.runId}-${label.toLowerCase()}@example.invalid`&&(f.id===null||UUID.test(f.id))&&(f.createdAt===null||timestamp(f.createdAt))&&(!f.createdAt||f.id!==null)&&Object.hasOwn(fixtureStages,f.stage)&&Number.isInteger(f.createAttempts)&&f.createAttempts>=0&&f.createAttempts<=1&&Number.isInteger(f.deleteAttempts)&&f.deleteAttempts>=0&&f.deleteAttempts<=1,'journal_fixture');
    need(!['created','profile_removed','auth_delete_intent','cleaned'].includes(f.stage)||(f.id!==null&&f.createdAt!==null),'journal_fixture_identity');
  }
  need(new Set(s.fixtures.map(f=>f.id).filter(Boolean)).size===s.fixtures.filter(f=>f.id).length,'journal_fixture_identity');
  need(Array.isArray(s.objects)&&s.objects.length===2&&UUID.test(s.absenceProbeAssetId),'journal_objects');
  for(let i=0;i<2;i++){
    const o=s.objects[i];
    need(exact(o,['label','operationId','assetId','key','leaseEpoch','sha256','byteCount','mime','stage','uploadAttempts','deleteAttempts'])&&o.label===`G${i+1}`&&UUID.test(o.operationId)&&(o.assetId===null||UUID.test(o.assetId))&&(o.key===null||o.key===`${s.fixtures[0].id}/${o.assetId}`)&&(!o.key||o.assetId!==null)&&(o.leaseEpoch===null||Number.isSafeInteger(o.leaseEpoch)&&o.leaseEpoch>0)&&(o.sha256===null||SHA.test(o.sha256))&&(o.byteCount===null||Number.isInteger(o.byteCount)&&o.byteCount>0&&o.byteCount<=4096)&&o.mime==='image/png'&&Object.hasOwn(objectStages,o.stage)&&Number.isInteger(o.uploadAttempts)&&o.uploadAttempts>=0&&o.uploadAttempts<=1&&Number.isInteger(o.deleteAttempts)&&o.deleteAttempts>=0&&o.deleteAttempts<=1,'journal_object');
    need(!['reserved','bind_intent','bound','prepare_intent','prepared','upload_intent','upload_uncertain','verified','publish_intent','publish_uncertain','published','delete_intent','deleted'].includes(o.stage)||(o.assetId!==null&&o.key!==null&&o.leaseEpoch!==null),'journal_object_identity');
    need(!['upload_intent','upload_uncertain','verified','publish_intent','publish_uncertain','published','delete_intent','deleted'].includes(o.stage)||(o.sha256!==null&&o.byteCount!==null),'journal_object_input');
  }
  const assets=s.objects.map(o=>o.assetId).filter(Boolean);need(new Set(assets).size===assets.length&&!assets.includes(s.absenceProbeAssetId),'journal_asset_identity');
  need(new Set([...s.objects.map(x=>x.operationId),s.absenceProbeAssetId,s.friendship.id,s.clear.operationId,s.preparation.intentId]).size===6,'journal_identity');
  need(exact(s.friendship,['id','stage'])&&UUID.test(s.friendship.id)&&Object.hasOwn(friendStages,s.friendship.stage)&&exact(s.clear,['operationId','stage'])&&UUID.test(s.clear.operationId)&&Object.hasOwn(clearStages,s.clear.stage)&&Number.isInteger(s.revision)&&s.revision>=0&&s.revision<=3,'journal_authority');
  if(s.revision>=1)need(['published','delete_intent','deleted'].includes(s.objects[0].stage),'journal_revision');
  if(s.revision>=2)need(['published','delete_intent','deleted'].includes(s.objects[1].stage),'journal_revision');
  if(s.revision===3)need(s.clear.stage==='completed','journal_revision');
  need(exact(s.preparation,['visitorDigest','userDigests','intentId','stage'])&&UUID.test(s.preparation.intentId)&&['planned','intent','complete','uncertain'].includes(s.preparation.stage)&&Array.isArray(s.preparation.userDigests)&&s.preparation.userDigests.length===3&&[s.preparation.visitorDigest,...s.preparation.userDigests].every(d=>d===null||SHA.test(d)),'journal_preparation');
  const ds=[s.preparation.visitorDigest,...s.preparation.userDigests].filter(Boolean);need(new Set(ds).size===ds.length&&(s.preparation.stage!=='complete'||ds.length===4),'journal_preparation');
  validateFingerprint(s.baseline);validateFingerprint(s.after);
  need(Array.isArray(s.admissionRows)&&s.admissionRows.length<=24*32&&s.admissionRows.every(r=>exact(r,['id','digest','createdAt'])&&typeof r.id==='string'&&/^[1-9][0-9]{0,18}$/.test(r.id)&&BigInt(r.id)<=9223372036854775807n&&ds.includes(r.digest)&&timestamp(r.createdAt))&&new Set(s.admissionRows.map(r=>r.id)).size===s.admissionRows.length,'journal_admissions');
  need(Number.isInteger(s.scenarioIndex)&&s.scenarioIndex>=0&&s.scenarioIndex<=24&&Array.isArray(s.assertions)&&s.assertions.length<=24&&s.assertions.every(a=>exact(a,['caseId','passed'])&&Number.isInteger(a.caseId)&&a.caseId>=1&&a.caseId<=24&&typeof a.passed==='boolean')&&Array.isArray(s.failures)&&s.failures.length<=50&&s.failures.every(f=>typeof f==='string'&&/^[a-z0-9_]{1,80}$/.test(f)),'journal_assertions');
  need(exact(s.counters,['run','cleanup','recoveries'])&&Array.isArray(s.counters.recoveries)&&s.counters.recoveries.length<=1,'journal_counters');counts(s.counters.run,RUN_CAPS);counts(s.counters.cleanup,CLEANUP_CAPS);
  for(const e of s.counters.recoveries)need(exact(e,['id','startedAt','counts'])&&UUID.test(e.id)&&timestamp(e.startedAt)&&(counts(e.counts,CLEANUP_CAPS),true),'journal_recovery');
  if(s.uncertainWebsite&&s.counters.recoveries.length)need(Date.parse(s.counters.recoveries[0].startedAt)>=Date.parse(s.uncertainAt),'recovery_before_uncertainty');
  need(exact(s.observed,['run','cleanup','recovery']),'observed_shape');
  for(const [phase,caps,reserved] of [['run',RUN_CAPS,s.counters.run],['cleanup',CLEANUP_CAPS,s.counters.cleanup],['recovery',CLEANUP_CAPS,s.counters.recoveries[0]?.counts??zero(CLEANUP_CAPS)]]){
    counts(s.observed[phase],caps);
    for(const k of Object.keys(caps))need(s.observed[phase][k]<=reserved[k],'observed_reservation');
  }
  need(Array.isArray(s.intents)&&s.intents.length<=1213+29,'journal_intents');
  const totals={run:zero(RUN_CAPS),cleanup:zero(CLEANUP_CAPS),recovery:zero(CLEANUP_CAPS)};const identities=new Set();
  s.intents.forEach((i,n)=>{
    need(exact(i,['seq','phase','epochId','descriptor','delta'])&&i.seq===n+1&&['run','cleanup','recovery'].includes(i.phase)&&i.epochId===(i.phase==='recovery'?s.counters.recoveries[0]?.id??null:null),'journal_intent');
    validateDescriptor(i.descriptor);need(exact(i.delta,Object.keys(delta(i.descriptor)))&&Object.entries(delta(i.descriptor)).every(([k,v])=>i.delta[k]===v),'journal_envelope');
    const identity=`${i.phase}:${descriptorIdentity(i.descriptor)}`;need(!identities.has(identity),'duplicate_intent');identities.add(identity);
    for(const [k,v] of Object.entries(i.delta)){need(Object.hasOwn(totals[i.phase],k),'phase_counter');totals[i.phase][k]+=v;}
  });
  need(JSON.stringify(totals.run)===JSON.stringify(s.counters.run)&&JSON.stringify(totals.cleanup)===JSON.stringify(s.counters.cleanup)&&JSON.stringify(totals.recovery)===JSON.stringify(s.counters.recoveries[0]?.counts??zero(CLEANUP_CAPS)),'journal_counter_envelope');
  validateDirectObservations(s,identities);
  if(s.settlement!==null){
    const r=s.settlement;
    need(exact(r,['sha256','run_id','origin','deployment_id','closed_to_test_traffic','website_calls_settled','admission_writes_settled','issued_at'])&&SHA.test(r.sha256)&&r.run_id===s.runId&&r.origin===s.pins.origin&&r.deployment_id===s.pins.deploymentId&&r.closed_to_test_traffic===true&&r.website_calls_settled===true&&r.admission_writes_settled===true&&timestamp(r.issued_at)&&s.uncertainWebsite&&Date.parse(r.issued_at)>Date.parse(s.uncertainAt)&&s.counters.recoveries.length===1,'journal_settlement');
  }
  need(!s.cleanupComplete||!s.uncertainWebsite||s.settlement!==null,'settlement_required');
}

/** Retain only checked, reserved direct outcomes; fixed descriptor domains make exact counts exhaustive. */
function validateDirectObservations(s,intents){
  need(Array.isArray(s.directObservations)&&s.directObservations.length<=324,'direct_observations');
  const seen=new Set();let matrix=0,data=0;
  for(const row of s.directObservations){
    const d=row?.descriptor;validateDescriptor(d);
    const storage=d.kind==='directMatrix',render=storage&&d.view.startsWith('render-');
    need(storage||d.kind==='dataExposure'||d.kind==='dataBoundary','direct_observation_descriptor');
    need(exact(row,render?['descriptor','status','result','capability']:['descriptor','status','result'])&&(!render||row.capability==='capability_unverified'),'direct_observation_shape');
    need(row.result==='denied'&&[400,401,403,404,406].includes(row.status)||row.result==='empty_list'&&row.status===200&&storage&&d.view==='list','direct_observation_result');
    const identity=descriptorIdentity(d);
    need(intents.has(`run:${identity}`)&&!seen.has(identity),'direct_observation_intent');seen.add(identity);
    if(storage)matrix++;else data++;
  }
  need(matrix<=s.observed.run.directStorage&&data<=s.observed.run.directData,'direct_observation_count');
  if(s.outcome==='phase_one_http_passed')need(matrix===308&&data===16,'direct_observations_incomplete');
}

/** Validation bounds each distinct row to the 308 matrix and 16 Data descriptors before acceptance. */
function requireDirectObservations(s){
  validateMediatedState(s);
  need(s.directObservations.filter(r=>r.descriptor.kind==='directMatrix').length===308&&s.directObservations.filter(r=>r.descriptor.kind!=='directMatrix').length===16,'direct_observations_incomplete');
}

/** Compare consecutive fsynced snapshots; successful reconciliation may bind null once only. */
export function validateMediatedHistory(old,next){
  validateMediatedState(old);validateMediatedState(next);
  need(old.runId===next.runId&&old.startedAt===next.startedAt&&bound(old.cleanupStartedAt,next.cleanupStartedAt)&&JSON.stringify(old.pins)===JSON.stringify(next.pins)&&advance(old.stage,next.stage,stages)&&(!old.cleanupComplete||next.cleanupComplete)&&(!old.uncertainWebsite||next.uncertainWebsite)&&bound(old.uncertainAt,next.uncertainAt)&&(old.outcome==='pending'||old.outcome===next.outcome)&&old.revision<=next.revision&&next.revision<=old.revision+1&&old.scenarioIndex<=next.scenarioIndex&&prefix(old.intents,next.intents)&&prefix(old.assertions,next.assertions)&&prefix(old.directObservations,next.directObservations)&&prefix(old.failures,next.failures)&&prefix(old.admissionRows,next.admissionRows)&&persisted(old.baseline,next.baseline)&&persisted(old.after,next.after)&&persisted(old.settlement,next.settlement),'journal_history');
  for(let n=0;n<3;n++){const a=old.fixtures[n],b=next.fixtures[n];need(bound(a.id,b.id)&&bound(a.createdAt,b.createdAt)&&advance(a.stage,b.stage,fixtureStages)&&b.createAttempts>=a.createAttempts&&b.deleteAttempts>=a.deleteAttempts,'journal_history');}
  for(let n=0;n<2;n++){const a=old.objects[n],b=next.objects[n];need(a.operationId===b.operationId&&bound(a.assetId,b.assetId)&&bound(a.key,b.key)&&bound(a.leaseEpoch,b.leaseEpoch)&&bound(a.sha256,b.sha256)&&bound(a.byteCount,b.byteCount)&&advance(a.stage,b.stage,objectStages)&&b.uploadAttempts>=a.uploadAttempts&&b.deleteAttempts>=a.deleteAttempts,'journal_history');}
  need(old.absenceProbeAssetId===next.absenceProbeAssetId&&old.friendship.id===next.friendship.id&&advance(old.friendship.stage,next.friendship.stage,friendStages)&&old.clear.operationId===next.clear.operationId&&advance(old.clear.stage,next.clear.stage,clearStages)&&old.preparation.intentId===next.preparation.intentId&&advance(old.preparation.stage,next.preparation.stage,preparationStages)&&bound(old.preparation.visitorDigest,next.preparation.visitorDigest)&&old.preparation.userDigests.every((d,i)=>bound(d,next.preparation.userDigests[i])),'journal_history');
  for(const phase of ['run','cleanup'])for(const k of Object.keys(old.counters[phase]))need(next.counters[phase][k]>=old.counters[phase][k],'journal_history');
  for(const phase of ['run','cleanup','recovery'])for(const k of Object.keys(old.observed[phase]))need(next.observed[phase][k]>=old.observed[phase][k],'journal_history');
  const before=old.counters.recoveries,after=next.counters.recoveries;need(after.length>=before.length&&after.length<=before.length+1,'journal_history');
  if(before.length){need(before[0].id===after[0].id&&before[0].startedAt===after[0].startedAt,'journal_history');for(const k of Object.keys(CLEANUP_CAPS))need(after[0].counts[k]>=before[0].counts[k],'journal_history');}
  if(after.length>before.length)need(Object.values(after[0].counts).every(n=>n===0)&&old.stage==='cleanup_blocked','journal_history');
}

async function syncDir(dir){const f=await open(dir,'r');try{await f.sync();}finally{await f.close();}}
async function privateFile(path){const st=await lstat(path);need(st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&st.uid===process.getuid(),'private_file');}
async function load(dir,runId){const path=join(dir,`${runId}.jsonl`);await privateFile(path);const raw=await readFile(path,'utf8');need(raw.endsWith('\n'),'journal_torn_tail');const snapshots=raw.trim().split('\n').map(JSON.parse);snapshots.forEach(validateMediatedState);for(let i=1;i<snapshots.length;i++)validateMediatedHistory(snapshots[i-1],snapshots[i]);need(snapshots.every(s=>s.runId===runId),'journal_identity');return {path,state:snapshots.at(-1)};}

/** Own one private lock and append-only fsynced journal. */
export class MediatedJournal{
  static async lock(dir,recoverLock=false){
    await mkdir(dir,{recursive:true,mode:0o700});const st=await lstat(dir);need(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&st.uid===process.getuid(),'journal_directory');
    const path=join(dir,'mediated.lock');let f;
    try{f=await open(path,'wx',0o600);}catch{
      if(!recoverLock)throw Error('journal_lock');await privateFile(path);const prior=JSON.parse(await readFile(path,'utf8'));
      need(exact(prior,['pid','host'])&&prior.host===hostname()&&Number.isInteger(prior.pid)&&prior.pid>0,'journal_lock');
      try{process.kill(prior.pid,0);throw Error('journal_lock');}catch(error){if(error.code!=='ESRCH')throw Error('journal_lock');}
      await unlink(path);await syncDir(dir);f=await open(path,'wx',0o600);
    }
    await f.writeFile(JSON.stringify({pid:process.pid,host:hostname()}));await f.sync();await f.close();await syncDir(dir);return path;
  }
  static async create(dir,state){
    validateMediatedState(state);const lock=await this.lock(dir);
    try{
      for(const name of await readdir(dir))if(name.endsWith('.jsonl'))need((await load(dir,name.slice(0,-6))).state.cleanupComplete,'unresolved_journal');
      const path=join(dir,`${state.runId}.jsonl`),file=await open(path,'wx',0o600);const j=new MediatedJournal(dir,path,lock,file,state);
      await j.append(state);await syncDir(dir);return j;
    }catch(e){await unlink(lock);await syncDir(dir);throw e;}
  }
  static async resume(dir,runId,recoverLock=false){
    need(UUID.test(runId),'run_id');const lock=await this.lock(dir,recoverLock);
    try{const {path,state}=await load(dir,runId);return new MediatedJournal(dir,path,lock,await open(path,constants.O_APPEND|constants.O_WRONLY|constants.O_NOFOLLOW),state);}catch(e){await unlink(lock);await syncDir(dir);throw e;}
  }
  constructor(dir,path,lock,file,state){Object.assign(this,{dir,path,lock,file,state:structuredClone(state),persisted:structuredClone(state)});}
  async append(next){validateMediatedState(next);validateMediatedHistory(this.persisted,next);await this.file.write(`${JSON.stringify(next)}\n`);await this.file.sync();this.state=structuredClone(next);this.persisted=structuredClone(next);}
  async mutate(fn){const next=structuredClone(this.state);fn(next);await this.append(next);}
  async close(){if(!this.file)return;await this.file.close();this.file=null;await unlink(this.lock);await syncDir(this.dir);}
}

/** Persist the one-attempt descriptor and full envelope before a transport/query dispatch. */
export async function reserveDispatch(j,phase,descriptor){
  validateDescriptor(descriptor);need(['run','cleanup','recovery'].includes(phase),'phase');need(j.state.stage!=='complete'&&(phase!=='run'||!['cleanup','cleanup_blocked'].includes(j.state.stage)),'phase_closed');
  const runKinds=['photo','directMatrix','authProbe','authCreate','authLogin','authGetUser','dataOperation','dataClear','dataExposure','dataBoundary','storageUpload','storageReadback','storageWarm','preparation','cli'];
  const cleanupKinds=['authDelete','storageOwnership','storageDelete','storageAbsence','cli'];
  need((phase==='run'?runKinds:cleanupKinds).includes(descriptor.kind),'phase_descriptor');
  need(phase==='run'||descriptor.kind!=='cli'||descriptor.slot<=20,'phase_descriptor');
  need(phase!=='cleanup'||j.state.cleanupStartedAt!==null,'cleanup_start');
  const d=delta(descriptor),caps=phase==='run'?RUN_CAPS:CLEANUP_CAPS;
  need(Object.keys(d).every(k=>Object.hasOwn(caps,k)),'phase_descriptor');
  const epoch=phase==='recovery'?j.state.counters.recoveries[0]:null;need(phase!=='recovery'||epoch,'recovery_epoch');
  const sequence=j.state.intents.length+1;
  await j.mutate(s=>{
    const counts=phase==='run'?s.counters.run:phase==='cleanup'?s.counters.cleanup:s.counters.recoveries[0].counts;
    for(const [k,v] of Object.entries(d)){need(counts[k]+v<=caps[k],'request_cap');counts[k]+=v;}
    s.intents.push({seq:sequence,phase,epochId:epoch?.id??null,descriptor:structuredClone(descriptor),delta:d});
  });
  return sequence;
}

/** Fixed orchestration. Every failure enters cleanup; neither failure class hides the other. */
export async function runMediatedAcceptance(j,port){
 let assertionError=null,cleanupError=null;
 try{
  await port.preflight();await j.mutate(s=>{s.stage='run';});
  for(const label of LABELS)await port.createIdentity(label);
  await port.prepareDigests();await port.friend('insert');
  await port.directMatrix(1);await port.exposure('absence');
  await port.createGeneration('G1');await port.publish('G1');await port.exposure('G1');await port.directMatrix(2);
  for(let id=1;id<=10;id++)await port.photoCase(id);
  await port.createGeneration('G2');await port.photoCase(11);await port.photoCase(12);
  await port.publish('G2');await port.exposure('G2');await port.directMatrix(3);await port.directMatrix(4);await port.directMatrix(5);
  for(let id=13;id<=16;id++)await port.photoCase(id);
  await port.friend('reject');await port.directMatrix(6);await port.directMatrix(7);
  for(let id=17;id<=19;id++)await port.photoCase(id);
  await port.friend('restore');await port.directMatrix(8);await port.directMatrix(9);await port.photoCase(20);
  await port.clear();await port.directMatrix(10);await port.directMatrix(11);
  for(let id=21;id<=24;id++)await port.photoCase(id);
  await port.finish();
  requireDirectObservations(j.state);
  need(j.state.assertions.length===24&&j.state.scenarioIndex===24&&Object.entries(RUN_CAPS).every(([k,v])=>j.state.counters.run[k]===v),'scenario_incomplete');
 }catch{assertionError='assertion_failed';await j.mutate(s=>{s.outcome='failed';s.failures.push(assertionError);});}
 try{await port.cleanup();need(j.state.cleanupComplete&&j.state.baseline!==null&&JSON.stringify(j.state.baseline)===JSON.stringify(j.state.after),'cleanup_incomplete');}
 catch{cleanupError='cleanup_blocked';await j.mutate(s=>{s.stage='cleanup_blocked';s.outcome='failed';if(!s.failures.includes(cleanupError))s.failures.push(cleanupError);});}
 if(assertionError||cleanupError)throw new AggregateError([assertionError,cleanupError].filter(Boolean).map(code=>Error(code)),'mediated_acceptance_failed');
 await j.mutate(s=>{s.outcome='phase_one_http_passed';});
 return mediatedReceipt(j.state);
}

/** Public receipts contain no fixture IDs, tokens, provider bodies or implied stronger acceptance. */
export function mediatedReceipt(s){
 validateMediatedState(s);
 return {version:2,execution:'not_attested',outcome:s.outcome,cleanup:s.cleanupComplete?'complete':'not_complete',preservation:s.baseline!==null&&JSON.stringify(s.after)===JSON.stringify(s.baseline)?'matched':'not_verified',pins:s.pins,
  observedHttpCases:s.assertions.map(a=>({caseId:a.caseId,passed:a.passed,expected:PHOTO_CASES[a.caseId-1].expected,bytesAndCacheVerified:a.passed})),directObservations:structuredClone(s.directObservations),reserved:structuredClone(s.counters),observed:structuredClone(s.observed),failures:[...s.failures],
  operatorAttestations:{cacheReceiptSha256:s.pins.cacheReceiptSha256,quiescenceReceiptSha256:s.pins.quiescenceReceiptSha256,settlementSha256:s.settlement?.sha256??null,verification:'operator_supplied'},
  remainingGates:{phase_traces:'not_accepted',controlled_races:'not_accepted',real_browser:'not_accepted',runtime_resources:'not_accepted',profile_deletion_transitions:'not_accepted',overall_acceptance:'not_accepted'}};
}

/** Reconstruct the exact preparation body from once-bound durable identities, without duplicated authority. */
export function mediatedPreparationIntent(s){
 validateMediatedState(s);need(s.fixtures.every(f=>f.stage==='created'&&f.id)&&new Set(s.fixtures.map(f=>f.id)).size===3,'preparation_identities');
 const body=JSON.stringify({run_id:s.runId,fixture_ids:s.fixtures.map(f=>f.id)});
 return {body,sha256:createHash('sha256').update(body).digest('hex')};
}

// Operator input files are read only on explicit CLI invocation, using owner-only/no-follow checks.
async function readPrivate(path){
 need(typeof path==='string'&&path.length>0,'private_file');const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const st=await file.stat();need(st.isFile()&&(st.mode&0o077)===0&&st.uid===process.getuid()&&st.size<=65536,'private_file');return await file.readFile();}finally{await file.close();}
}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const parsePrivate=async path=>{try{return JSON.parse((await readPrivate(path)).toString('utf8'));}catch{throw Error('private_json');}};
const receiptBase=['run_id','origin','deployment_id','issued_at'];
/** Validate and hash raw receipt bytes; pins alone never substitute for the supplied attestation. */
export async function loadMediatedReceipt(path,kind,s,now=Date.now()){
 const bytes=await readPrivate(path);let r;try{r=JSON.parse(bytes.toString('utf8'));}catch{throw Error('receipt_json');}
 const extra=kind==='cache'?['website_commit','backend_commit','ordinary_bundle_sha256','acceptance_bundle_sha256','release_sha256','catalog','installed_configuration_verified','profile_photo_cache_bypass']:kind==='quiescence'?['exclusive_fixture_ingress','profile_admission_producers_stopped','other_admission_producers_stopped']:kind==='settlement'?['closed_to_test_traffic','website_calls_settled','admission_writes_settled']:null;
 need(extra&&exact(r,[...receiptBase,...extra]),'receipt_shape');need(r.run_id===s.runId&&r.origin===s.pins.origin&&r.deployment_id===s.pins.deploymentId&&timestamp(r.issued_at)&&Date.parse(r.issued_at)<=now,'receipt_binding');
 if(kind==='cache'){
  for(const [field,pin] of [['website_commit','websiteCommit'],['backend_commit','backendCommit'],['ordinary_bundle_sha256','ordinaryBundleSha256'],['acceptance_bundle_sha256','acceptanceBundleSha256'],['release_sha256','releaseSha256'],['catalog','catalog']])need(r[field]===s.pins[pin],'receipt_binding');
  need(r.installed_configuration_verified===true&&r.profile_photo_cache_bypass===true,'receipt_attestation');
 }else for(const key of extra)need(r[key]===true,'receipt_attestation');
 const sha256=digest(bytes);if(kind!=='settlement')need(sha256===s.pins[kind==='cache'?'cacheReceiptSha256':'quiescenceReceiptSha256'],'receipt_hash');
 else need(s.uncertainWebsite&&Date.parse(r.issued_at)>Date.parse(s.uncertainAt),'receipt_settlement');
 return {...r,sha256};
}

/** Strict CLI vocabulary. No fallback pins, ambient credentials, deployments or scenario continuation. */
export function parseMediatedArgs(argv){
 const [mode='preflight',...args]=argv;need(['preflight','run','cleanup'].includes(mode),'mode');const values={mode};
 const booleans=['reviewed','recover-lock'],names=['pins','run-id','state-dir','public-key-file','secret-key-file','operator-token-file','cache-receipt','quiescence-receipt','settlement-receipt','ordinary-bundle','acceptance-bundle'];
 for(let i=0;i<args.length;i++){need(args[i].startsWith('--'),'flag');const name=args[i].slice(2);need((booleans.includes(name)||names.includes(name))&&!Object.hasOwn(values,name),'flag');if(booleans.includes(name))values[name]=true;else{need(args[i+1]&&!args[i+1].startsWith('--'),'flag_value');values[name]=args[++i];}}
 need(mode==='run'?values.reviewed===true:!values.reviewed,'reviewed');need(mode==='cleanup'||!values['recover-lock']&&!values['settlement-receipt'],'cleanup_flags');
 for(const name of ['pins','run-id','public-key-file','secret-key-file','cache-receipt','quiescence-receipt','ordinary-bundle','acceptance-bundle'])need(typeof values[name]==='string','required_flag');
 need(UUID.test(values['run-id'])&&(mode!=='run'||values['operator-token-file']),'run_id');return values;
}

/** Local source/file pins are verified before constructing any actual provider port. */
export async function loadMediatedInputs(args,s){
 const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),backend=resolve(root,'../Ante');
 const command=promisify(execFile),env={...process.env};delete env.GIT_DIR;delete env.GIT_WORK_TREE;
 const head=(await command('git',['-C',root,'rev-parse','HEAD'],{timeout:5000,maxBuffer:4096,env})).stdout.trim();need(head===s.pins.websiteCommit,'website_pin');
 const release=await readFile(join(backend,'supabase/releases/profile-photo-mediated-readers/postconditions.sql'));need(digest(release)===s.pins.releaseSha256,'release_pin');
 for(const [flag,pin] of [['ordinary-bundle','ordinaryBundleSha256'],['acceptance-bundle','acceptanceBundleSha256']]){const st=await lstat(args[flag]);need(st.isFile()&&!st.isSymbolicLink(),'bundle_file');need(digest(await readFile(args[flag]))===s.pins[pin],'bundle_pin');}
 const {importReviewedAdapter}=await import('./hosted-profile-photo-readers.mjs');
 const adapter=await importReviewedAdapter({catalog:s.pins.catalog,backendCommit:s.pins.backendCommit,adapterSha256:s.pins.adapterSha256});
 await loadMediatedReceipt(args['cache-receipt'],'cache',s);await loadMediatedReceipt(args['quiescence-receipt'],'quiescence',s);
 const credentials=validateCredentials({publicKey:(await readPrivate(args['public-key-file'])).toString('utf8').trim(),secretKey:(await readPrivate(args['secret-key-file'])).toString('utf8').trim()});
 const operatorToken=args.mode==='run'?(await readPrivate(args['operator-token-file'])).toString('utf8').trim():undefined;need(args.mode!=='run'||SHA.test(operatorToken),'operator_token');
 const quiescenceReceipt=args['settlement-receipt']?await loadMediatedReceipt(args['settlement-receipt'],'settlement',s):null;
 return {credentials,operatorToken,postconditions:release.toString('utf8'),adapter:async()=>adapter,quiescenceReceipt};
}

/** A crashed dispatch may have settled remotely; never infer rollback from an absent assertion. */
async function markMediatedInterrupted(j,clock=Date.now){
 need(!j.state.cleanupComplete&&j.state.counters.recoveries.length===0,'recovery_unavailable');
 await j.mutate(s=>{s.stage='cleanup_blocked';s.outcome='failed';s.cleanupStartedAt??=new Date(clock()).toISOString();
  if(s.intents.some(i=>i.phase==='run'&&i.descriptor.kind==='photo'&&!s.assertions.some(a=>a.caseId===i.descriptor.caseId))){s.uncertainWebsite=true;s.uncertainAt??=new Date(clock()).toISOString();}
 });
}
/** Mint exactly one explicit recovery epoch, retaining every prior attempt and failure. */
export async function prepareMediatedRecovery(j,clock=Date.now){
 await markMediatedInterrupted(j,clock);
 await j.mutate(s=>{s.counters.recoveries.push({id:randomUUID(),startedAt:new Date(clock()).toISOString(),counts:zero(CLEANUP_CAPS)});});
}

/** Explicit entry point: this is the only path that loads operator files and actual provider adapters. */
export async function main(argv=process.argv.slice(2)){
 const args=parseMediatedArgs(argv),pins=await parsePrivate(args.pins);validatePins(pins);
 const {stateDirectory,dbQuery,inspectConfig}=await import('./hosted-account-jwt.mjs');
 const base=await stateDirectory(args['state-dir']??join(homedir(),'.local/state/ante-acceptance/hosted-profile-photo-mediated'));
 let j;
 try{
  if(args.mode==='cleanup'){j=await MediatedJournal.resume(base,args['run-id'],args['recover-lock']===true);need(JSON.stringify(j.state.pins)===JSON.stringify(pins),'pin_changed');need(!j.state.cleanupComplete&&j.state.counters.recoveries.length===0,'recovery_unavailable');await markMediatedInterrupted(j);}
  const state=j?.state??newMediatedState(args['run-id'],pins),input=await loadMediatedInputs(args,state);
  if(!j)j=await MediatedJournal.create(args.mode==='preflight'?join(base,'preflights',randomUUID()):base,state);
  const {makeMediatedPort}=await import('./hosted-profile-photo-mediated-port.mjs');const port=makeMediatedPort(j,input.credentials,{...input,query:dbQuery,inspectConfig,recovery:args.mode==='cleanup'});
  if(args.mode==='cleanup'){need(!j.state.uncertainWebsite||input.quiescenceReceipt!==null,'settlement_required');await prepareMediatedRecovery(j);await port.cleanup();}
  else if(args.mode==='run')await runMediatedAcceptance(j,port);
  else {await port.preflight();console.log(JSON.stringify({mode:'preflight',providerMutations:0,preflight:'passed',execution:'explicit_cli',reserved:j.state.counters.run,remainingGates:mediatedReceipt(j.state).remainingGates}));return;}
  console.log(JSON.stringify({...mediatedReceipt(j.state),execution:'explicit_cli'}));
 }catch{if(j)console.error(JSON.stringify({...mediatedReceipt(j.state),execution:'explicit_cli'}));throw Error('mediated_cli_failed');}
 finally{if(j)await j.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({outcome:'failed',reason:'mediated_cli_failed',overall_acceptance:'not_accepted'}));process.exitCode=1;});
