// Durable source-only protocol for mediated hosted acceptance. Imports perform no I/O.
import { constants } from 'node:fs';
import { open, mkdir, readdir, readFile, lstat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { PROJECT } from './hosted-account-jwt.mjs';
import { TABLES } from './hosted-account-jwt-sql.mjs';
import { RUN_CAPS, CLEANUP_CAPS, DIRECT_VIEWS, MATRIX_KEYS, photoEnvelope } from './hosted-profile-photo-mediated-protocol.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{64}$/;
const COMMIT=/^[0-9a-f]{40}$/;
const LABELS=['A','B','C'];
const PIN_KEYS=['websiteCommit','backendCommit','adapterSha256','releaseSha256','catalog','ordinaryBundleSha256','acceptanceBundleSha256','origin','deploymentId','cacheReceiptSha256','quiescenceReceiptSha256'];
const STATE_KEYS=['version','project','runId','startedAt','pins','stage','outcome','cleanupComplete','uncertainWebsite','uncertainAt','fixtures','objects','absenceProbeAssetId','friendship','clear','revision','preparation','baseline','after','admissionRows','scenarioIndex','assertions','failures','counters','observed','intents','settlement'];
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
const need=(ok,code)=>{if(!ok)throw Error(code);};
const timestamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const bound=(a,b)=>a===null||a===b;
const persisted=(a,b)=>a===null||JSON.stringify(a)===JSON.stringify(b);
const prefix=(a,b)=>a.length<=b.length&&a.every((v,i)=>JSON.stringify(v)===JSON.stringify(b[i]));
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
/** @typedef {{version:2,project:string,runId:string,startedAt:string,pins:MediatedPins,stage:string,outcome:'pending'|'phase_one_http_passed'|'failed',cleanupComplete:boolean,uncertainWebsite:boolean,uncertainAt:string|null,fixtures:MediatedFixture[],objects:MediatedObject[],absenceProbeAssetId:string,friendship:{id:string,stage:string},clear:{operationId:string,stage:string},revision:number,preparation:MediatedPreparation,baseline:null|Array<{table:string,count:number,digest:string}>,after:null|Array<{table:string,count:number,digest:string}>,admissionRows:Array<{id:string,digest:string,createdAt:string}>,scenarioIndex:number,assertions:Array<{caseId:number,passed:boolean}>,failures:string[],counters:{run:Record<string,number>,cleanup:Record<string,number>,recoveries:Array<{id:string,startedAt:string,counts:Record<string,number>}>},observed:{run:Record<string,number>,cleanup:Record<string,number>,recovery:Record<string,number>},intents:MediatedIntent[],settlement:null|{sha256:string,run_id:string,origin:string,deployment_id:string,closed_to_test_traffic:true,website_calls_settled:true,admission_writes_settled:true,issued_at:string}} MediatedState */

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
  const state={version:2,project:PROJECT,runId,startedAt:new Date().toISOString(),pins:structuredClone(pins),stage:'prepared',outcome:'pending',cleanupComplete:false,uncertainWebsite:false,uncertainAt:null,
    fixtures:LABELS.map(label=>({label,email:`ante-mediated-${runId}-${label.toLowerCase()}@example.invalid`,id:null,createdAt:null,stage:'planned',createAttempts:0,deleteAttempts:0})),
    objects:['G1','G2'].map(label=>({label,operationId:randomUUID(),assetId:null,key:null,leaseEpoch:null,sha256:null,byteCount:null,mime:'image/png',stage:'planned',uploadAttempts:0,deleteAttempts:0})),
    absenceProbeAssetId:randomUUID(),friendship:{id:randomUUID(),stage:'planned'},clear:{operationId:randomUUID(),stage:'planned'},revision:0,
    preparation:{visitorDigest:null,userDigests:[null,null,null],intentId:randomUUID(),stage:'planned'},baseline:null,after:null,admissionRows:[],scenarioIndex:0,assertions:[],failures:[],
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
  need(exact(s,STATE_KEYS)&&s.version===2&&s.project===PROJECT&&UUID.test(s.runId)&&timestamp(s.startedAt),'journal_shape');validatePins(s.pins);
  need(Object.hasOwn(stages,s.stage)&&['pending','phase_one_http_passed','failed'].includes(s.outcome)&&typeof s.cleanupComplete==='boolean'&&typeof s.uncertainWebsite==='boolean','journal_stage');
  need(s.cleanupComplete===(s.stage==='complete'),'journal_completion');
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
  need(Array.isArray(s.admissionRows)&&s.admissionRows.length<=24*32&&s.admissionRows.every(r=>exact(r,['id','digest','createdAt'])&&UUID.test(r.id)&&ds.includes(r.digest)&&timestamp(r.createdAt))&&new Set(s.admissionRows.map(r=>r.id)).size===s.admissionRows.length,'journal_admissions');
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
    const identity=`${i.phase}:${JSON.stringify(Object.entries(i.descriptor).sort(([a],[b])=>a.localeCompare(b)))}`;need(!identities.has(identity),'duplicate_intent');identities.add(identity);
    for(const [k,v] of Object.entries(i.delta)){need(Object.hasOwn(totals[i.phase],k),'phase_counter');totals[i.phase][k]+=v;}
  });
  need(JSON.stringify(totals.run)===JSON.stringify(s.counters.run)&&JSON.stringify(totals.cleanup)===JSON.stringify(s.counters.cleanup)&&JSON.stringify(totals.recovery)===JSON.stringify(s.counters.recoveries[0]?.counts??zero(CLEANUP_CAPS)),'journal_counter_envelope');
  if(s.settlement!==null){
    const r=s.settlement;
    need(exact(r,['sha256','run_id','origin','deployment_id','closed_to_test_traffic','website_calls_settled','admission_writes_settled','issued_at'])&&SHA.test(r.sha256)&&r.run_id===s.runId&&r.origin===s.pins.origin&&r.deployment_id===s.pins.deploymentId&&r.closed_to_test_traffic===true&&r.website_calls_settled===true&&r.admission_writes_settled===true&&timestamp(r.issued_at)&&s.uncertainWebsite&&Date.parse(r.issued_at)>Date.parse(s.uncertainAt)&&s.counters.recoveries.length===1,'journal_settlement');
  }
  need(!s.cleanupComplete||!s.uncertainWebsite||s.settlement!==null,'settlement_required');
}

/** Compare consecutive fsynced snapshots; successful reconciliation may bind null once only. */
export function validateMediatedHistory(old,next){
  validateMediatedState(old);validateMediatedState(next);
  need(old.runId===next.runId&&old.startedAt===next.startedAt&&JSON.stringify(old.pins)===JSON.stringify(next.pins)&&advance(old.stage,next.stage,stages)&&(!old.cleanupComplete||next.cleanupComplete)&&(!old.uncertainWebsite||next.uncertainWebsite)&&bound(old.uncertainAt,next.uncertainAt)&&(old.outcome==='pending'||old.outcome===next.outcome)&&old.revision<=next.revision&&next.revision<=old.revision+1&&old.scenarioIndex<=next.scenarioIndex&&prefix(old.intents,next.intents)&&prefix(old.assertions,next.assertions)&&prefix(old.failures,next.failures)&&prefix(old.admissionRows,next.admissionRows)&&persisted(old.baseline,next.baseline)&&persisted(old.after,next.after)&&persisted(old.settlement,next.settlement),'journal_history');
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
