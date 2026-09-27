#!/usr/bin/env node
// Fixed-purpose hosted reader acceptance. Importing this module never reads credentials or contacts a provider.
import { constants } from 'node:fs';
import { open, mkdir, readdir, readFile, lstat, unlink, realpath } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { hostname, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PROJECT, ORIGIN, validateCredentials, reconcileCreate, stateDirectory } from './hosted-account-jwt.mjs';
import { TABLES } from './hosted-account-jwt-sql.mjs';

const exec=promisify(execFile);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{64}$/;
const COMMIT=/^[0-9a-f]{40}$/;
const LABELS=['A','B','C'];
const OBJECTS=['legacy','G1','G2','G3'];
const RUN_CAPS={auth:12,data:52,storage:40,cli:20};
const CLEANUP_CAPS={auth:6,data:8,storage:16,cli:16};
const TOTAL_CAPS={auth:18,data:60,storage:56,cli:36};
const MIME='image/png';
const VERSION='synthetic-reader-fixture-v1';
const BACKEND_ROOT='/Users/daniel/.codex/worktrees/ante-web-first-foundation/Ante';
const ADAPTER='supabase/functions/_shared/profilePhotoAssetStore.ts';
const photoPath=key=>`/storage/v1/object/authenticated/profile-photos/${key}`;
const reason=code=>new Error(code);
const ensure=(yes,code)=>{if(!yes)throw reason(code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const simple=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,names)=>simple(value)&&Object.keys(value).sort().join(',')===[...names].sort().join(',');

export function verifyPins(pins) {
  ensure(exact(pins,['catalog','backendCommit','adapterSha256'])&&SHA.test(pins.catalog)&&COMMIT.test(pins.backendCommit)&&SHA.test(pins.adapterSha256),'pin');
  return pins;
}

export function newReaderState(runId,pins) {
  ensure(UUID.test(runId),'run_id');verifyPins(pins);
  return {version:1,project:PROJECT,runId,startedAt:new Date().toISOString(),pins,stage:'prepared',outcome:'pending',cleanupComplete:false,
    fixtures:LABELS.map(label=>({label,email:`ante-reader-${runId}-${label.toLowerCase()}@example.invalid`,id:null,createdAt:null,stage:'planned',createAttempts:0,deleteAttempts:0})),
    objects:OBJECTS.map(label=>({label,key:null,assetId:null,operationId:label==='legacy'?null:randomUUID(),leaseEpoch:null,sha256:null,byteCount:null,mime:MIME,stage:'planned',uploadAttempts:0,deleteAttempts:0})),
    friendship:{id:randomUUID(),status:'planned'},clear:{operationId:randomUUID(),stage:'planned'},teardown:'planned',revision:0,
    counters:{run:{auth:0,data:0,storage:0,cli:0},cleanup:{auth:0,data:0,storage:0,cli:0}},
    baseline:null,after:null,checks:[],failures:[]};
}

// Validate every durable snapshot so a changed journal cannot authorize a foreign teardown.
export function validateReaderState(s) {
  ensure(exact(s,['version','project','runId','startedAt','pins','stage','outcome','cleanupComplete','fixtures','objects','friendship','clear','teardown','revision','counters','baseline','after','checks','failures'])&&s.version===1&&s.project===PROJECT&&UUID.test(s.runId)&&Number.isFinite(Date.parse(s.startedAt)),'journal_shape');
  verifyPins(s.pins);
  ensure(['prepared','preflight','testing','cleanup','blocked','complete'].includes(s.stage)&&['pending','passed','failed','recovered'].includes(s.outcome)&&typeof s.cleanupComplete==='boolean','journal_stage');
  ensure(Array.isArray(s.fixtures)&&s.fixtures.length===3,'journal_fixtures');
  for(let i=0;i<3;i++) {
    const f=s.fixtures[i],label=LABELS[i];
    ensure(exact(f,['label','email','id','createdAt','stage','createAttempts','deleteAttempts'])&&f.label===label&&f.email===`ante-reader-${s.runId}-${label.toLowerCase()}@example.invalid`&&(f.id===null||UUID.test(f.id))&&(f.createdAt===null||Number.isFinite(Date.parse(f.createdAt)))&&['planned','create_intent','created','profile_removed','auth_delete_intent','cleaned'].includes(f.stage)&&Number.isInteger(f.createAttempts)&&f.createAttempts>=0&&f.createAttempts<=1&&Number.isInteger(f.deleteAttempts)&&f.deleteAttempts>=0&&f.deleteAttempts<=2,'journal_fixture');
  }
  ensure(Array.isArray(s.objects)&&s.objects.length===4,'journal_objects');
  for(let i=0;i<4;i++) {
    const o=s.objects[i];
    ensure(exact(o,['label','key','assetId','operationId','leaseEpoch','sha256','byteCount','mime','stage','uploadAttempts','deleteAttempts'])&&o.label===OBJECTS[i]&&(o.key===null||o.key===`${s.fixtures[0].id}/${i===0?'avatar':o.assetId}`)&&(i===0?o.assetId===null&&o.operationId===null&&o.leaseEpoch===null:(o.assetId===null||UUID.test(o.assetId))&&UUID.test(o.operationId)&&(o.leaseEpoch===null||Number.isSafeInteger(o.leaseEpoch)&&o.leaseEpoch>0))&&(o.sha256===null||SHA.test(o.sha256))&&(o.byteCount===null||Number.isInteger(o.byteCount)&&o.byteCount>=1&&o.byteCount<=4096)&&o.mime===MIME&&['planned','reserve_intent','reserved','bind_intent','bound','prepare_intent','prepared','upload_intent','upload_uncertain','verified','publish_intent','published','delete_intent','deleted'].includes(o.stage)&&Number.isInteger(o.uploadAttempts)&&o.uploadAttempts>=0&&o.uploadAttempts<=1&&Number.isInteger(o.deleteAttempts)&&o.deleteAttempts>=0&&o.deleteAttempts<=2,'journal_object');
  }
  ensure(exact(s.friendship,['id','status'])&&UUID.test(s.friendship.id)&&['planned','insert_intent','accepted','reject_intent','rejected','restore_intent','delete_intent','deleted'].includes(s.friendship.status)&&exact(s.clear,['operationId','stage'])&&UUID.test(s.clear.operationId)&&['planned','intent','completed'].includes(s.clear.stage)&&['planned','intent','done'].includes(s.teardown)&&Number.isInteger(s.revision)&&s.revision>=0&&s.revision<=3,'journal_authority');
  ensure(exact(s.counters,['run','cleanup']),'journal_counters');
  for(const phase of ['run','cleanup']) {
    ensure(exact(s.counters[phase],['auth','data','storage','cli']),'journal_counters');
    for(const kind of ['auth','data','storage','cli']) {
      const n=s.counters[phase][kind];
      ensure(Number.isInteger(n)&&n>=0&&n<=({run:RUN_CAPS,cleanup:CLEANUP_CAPS}[phase][kind])&&n+s.counters[phase==='run'?'cleanup':'run'][kind]<=TOTAL_CAPS[kind],'journal_counters');
    }
  }
  for(const rows of [s.baseline,s.after]) if(rows!==null) {
    ensure(Array.isArray(rows)&&rows.length===TABLES.length,'journal_fingerprint');
    for(const r of rows) ensure(exact(r,['table','count','digest'])&&TABLES.includes(r.table)&&Number.isSafeInteger(r.count)&&r.count>=0&&SHA.test(r.digest),'journal_fingerprint');
  }
  ensure(Array.isArray(s.checks)&&s.checks.length<=90&&s.checks.every(c=>exact(c,['label','passed'])&&typeof c.label==='string'&&/^[a-z0-9-]{1,80}$/.test(c.label)&&typeof c.passed==='boolean'),'journal_checks');
  ensure(Array.isArray(s.failures)&&s.failures.length<=30&&s.failures.every(f=>typeof f==='string'&&/^[a-z0-9_]{1,80}$/.test(f)),'journal_failures');
}

async function syncDir(dir) {const h=await open(dir,'r');try{await h.sync();}finally{await h.close();}}
async function privateFile(path){const st=await lstat(path);ensure(st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&st.uid===process.getuid(),'private_file');}
async function load(dir,runId){const path=join(dir,`${runId}.jsonl`);await privateFile(path);const raw=await readFile(path,'utf8');ensure(raw.endsWith('\n'),'journal_torn_tail');const snapshots=raw.trim().split('\n').map(JSON.parse);snapshots.forEach(validateReaderState);ensure(snapshots.every(s=>s.runId===runId),'journal_identity');return {path,state:snapshots.at(-1)};}

// A new run cannot coexist with any unresolved journal; every mutation is an fsynced snapshot.
export class ReaderJournal {
  static async lock(dir,recover=false) {
    await mkdir(dir,{recursive:true,mode:0o700});const st=await lstat(dir);ensure(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&st.uid===process.getuid(),'journal_directory');
    const path=join(dir,'reader.lock');let h;
    try{h=await open(path,'wx',0o600);}catch{
      if(!recover)throw reason('journal_lock');
      await privateFile(path);const prior=JSON.parse(await readFile(path,'utf8'));
      ensure(exact(prior,['pid','host'])&&prior.host===hostname()&&Number.isInteger(prior.pid)&&prior.pid>0,'journal_lock');
      try{process.kill(prior.pid,0);throw reason('journal_lock');}catch(error){if(error.code!=='ESRCH')throw reason('journal_lock');}
      await unlink(path);try{h=await open(path,'wx',0o600);}catch{throw reason('journal_lock');}
    }
    await h.writeFile(JSON.stringify({pid:process.pid,host:hostname()}));await h.sync();await h.close();await syncDir(dir);return path;
  }
  static async create(dir,state) {
    validateReaderState(state);const lock=await this.lock(dir);
    try {
      for(const name of await readdir(dir))if(name.endsWith('.jsonl')){const old=await load(dir,name.slice(0,-6));ensure(old.state.cleanupComplete,'unresolved_journal');}
      const path=join(dir,`${state.runId}.jsonl`);const file=await open(path,'wx',0o600);const j=new ReaderJournal(dir,path,lock,file,state);await j.save({});await syncDir(dir);return j;
    }catch(e){await unlink(lock);await syncDir(dir);throw e;}
  }
  static async resume(dir,runId,recover=false) {
    ensure(UUID.test(runId),'run_id');const lock=await this.lock(dir,recover);
    try{const {path,state}=await load(dir,runId);return new ReaderJournal(dir,path,lock,await open(path,constants.O_APPEND|constants.O_WRONLY|constants.O_NOFOLLOW),state);}catch(e){await unlink(lock);throw e;}
  }
  constructor(dir,path,lock,file,state){Object.assign(this,{dir,path,lock,file,state});}
  async save(patch){const next={...this.state,...patch};validateReaderState(next);await this.file.write(`${JSON.stringify(next)}\n`);await this.file.sync();Object.assign(this.state,next);}
  async mutate(change){const next=structuredClone(this.state);change(next);await this.save(next);}
  async close(){if(!this.file)return;await this.file.close();this.file=null;await unlink(this.lock);await syncDir(this.dir);}
}

export async function unresolvedJournals(dir){
  let names;try{names=await readdir(dir);}catch(error){if(error.code==='ENOENT')return [];throw error;}
  const st=await lstat(dir);ensure(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&st.uid===process.getuid(),'journal_directory');
  const unresolved=[];for(const name of names)if(name.endsWith('.jsonl')){const old=await load(dir,name.slice(0,-6));if(!old.state.cleanupComplete)unresolved.push(old.state.runId);}return unresolved;
}

// Cleanup accepts only exact owned identities and manifests; unknown rows are preservation failures.
export function assertOwnedInventory(s,inventory) {
  ensure(exact(inventory,['auth','profiles','friends','heads','operations','objects','protected'])&&Number.isInteger(inventory.protected)&&inventory.protected===0,'protected_references');
  for(const name of ['auth','profiles','friends','heads','operations','objects'])ensure(Array.isArray(inventory[name]),'ownership_mismatch');
  for(const u of inventory.auth){const f=s.fixtures.find(x=>x.id===u.id);ensure(f&&u.email===f.email&&u.marker===s.runId&&Date.parse(u.created_at)===Date.parse(f.createdAt)&&Date.parse(u.created_at)>=Date.parse(s.startedAt)&&Date.parse(u.created_at)<=Date.parse(s.startedAt)+300_000,'ownership_mismatch');}
  for(const p of inventory.profiles){const f=s.fixtures.find(x=>x.id===p.id);ensure(f&&p.email===f.email&&p.waitlist_status==='standard'&&p.stripe_customer_id===null&&p.avatar_url===null,'ownership_mismatch');}
  for(const f of inventory.friends)ensure(f.id===s.friendship.id&&f.friend_1===s.fixtures[0].id&&f.friend_2===s.fixtures[1].id&&['accepted','rejected'].includes(f.status),'ownership_mismatch');
  const current=s.clear.stage==='completed'?null:[...s.objects.slice(1)].reverse().find(o=>o.stage==='published')?.assetId??null;
  for(const h of inventory.heads)ensure(h.owner_id===s.fixtures[0].id&&Number(h.revision)===s.revision&&(h.current_asset_id??null)===current,'ownership_mismatch');
  for(const op of inventory.operations){const index=s.objects.findIndex(x=>x.operationId===op.operation_id),isClear=op.operation_id===s.clear.operationId,o=index>0?s.objects[index]:isClear?{assetId:null,key:null,sha256:null,byteCount:null,mime:null}:null;
    ensure(o&&op.owner_id===s.fixtures[0].id&&(op.asset_id??null)===o.assetId&&(op.object_key??null)===o.key&&op.kind===(isClear?'delete':'upload')&&Number(op.expected_revision)===(isClear?2:index-1)&&['prepared','completed'].includes(op.state)&&Number(op.result_revision??-1)===(op.state==='completed'?(isClear?3:index):-1),'ownership_mismatch');
    if(!isClear)ensure(op.normalized_sha256===o.sha256&&op.mime===o.mime&&Number(op.byte_count)===o.byteCount,'manifest_mismatch');
  }
  for(const obj of inventory.objects){const o=s.objects.find(x=>x.key===obj.name);ensure(o,'ownership_mismatch');ensure(obj.sha256===o.sha256&&obj.byte_count===o.byteCount&&obj.mime===o.mime,'manifest_mismatch');}
  return true;
}
export function cleanupDecision(s,inventory) {
  if(s.fixtures.some(f=>f.stage==='create_intent'&&f.id===null)||s.objects.some(o=>o.stage==='upload_uncertain'&&o.key&&!inventory.objects.some(x=>x.name===o.key)))return 'blocked';
  assertOwnedInventory(s,inventory);return 'ready';
}

// The request descriptor, not a caller-supplied URL, chooses every provider endpoint and budget.
export function readerRequest({state,credentials,sessions={},save,fetchImpl=fetch,phase='run',deadlineMs=10_000}) {
  validateCredentials(credentials);
  ensure(['run','cleanup'].includes(phase),'phase_boundary');
  const seen=new Set();
  return async spec=>{
    ensure(simple(spec)&&Object.keys(spec).every(k=>['kind','method','key','body','mime','intent','caller','rpc','args','action','label','password','service','view','table'].includes(k)),'request_boundary');
    let path,category,headers={apikey:credentials.publicKey},payload=null,cap=16_384;
    const caller=spec.caller;
    const publicCaller=()=>{
      const token=sessions[caller]?.token;
      ensure(LABELS.includes(caller)&&typeof token==='string'&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token),'caller_boundary');
      return {apikey:credentials.publicKey,Authorization:`Bearer ${token}`};
    };
    if(spec.kind==='storage') {
      const o=state.objects.find(x=>x.key===spec.key);
      ensure(o&&spec.key&&state.fixtures[0].id&&spec.key.startsWith(`${state.fixtures[0].id}/`),'key_boundary');
      category='storage';
      const view=spec.view??'authenticated';
      ensure(['authenticated','upload','sign','list','public','render'].includes(view),'storage_boundary');
      path=view==='list'?'/storage/v1/object/list/profile-photos':view==='sign'?`/storage/v1/object/sign/profile-photos/${spec.key}`:view==='public'?`/storage/v1/object/public/profile-photos/${spec.key}`:view==='render'?`/storage/v1/render/image/authenticated/profile-photos/${spec.key}`:view==='upload'||spec.method==='DELETE'?`/storage/v1/object/profile-photos/${spec.key}`:photoPath(spec.key);
      if(['authenticated','upload'].includes(view)&&spec.method==='POST'){
        ensure(spec.intent===`${o.label}-upload`&&o.stage==='upload_intent'&&o.uploadAttempts===0&&spec.mime===MIME&&spec.body instanceof Uint8Array&&spec.body.byteLength===o.byteCount&&sha(spec.body)===o.sha256&&spec.service===true,'upload_boundary');
        o.uploadAttempts++;headers={apikey:credentials.secretKey,'content-type':MIME,'x-upsert':'false','cache-control':'private, no-store'};payload=spec.body;
      } else if(view==='authenticated'&&spec.method==='DELETE'){
        ensure(spec.intent===`${o.label}-delete`&&o.stage==='delete_intent'&&o.deleteAttempts<2&&spec.service===true,'delete_boundary');o.deleteAttempts++;headers={apikey:credentials.secretKey};
      } else if(view==='authenticated'&&spec.method==='GET'){
        ensure(spec.intent===undefined,'storage_boundary');headers=spec.service===true?{apikey:credentials.secretKey}:caller==='anon'?{apikey:credentials.publicKey}:publicCaller();cap=4096;
      } else if(view==='sign'&&spec.method==='POST'){
        ensure(spec.service!==true&&caller==='A'&&spec.intent===undefined,'storage_boundary');headers={...publicCaller(),'content-type':'application/json'};payload=JSON.stringify({expiresIn:60});
      } else if(view==='list'&&spec.method==='POST'){
        ensure(spec.service!==true&&caller==='A'&&spec.intent===undefined,'storage_boundary');headers={...publicCaller(),'content-type':'application/json'};payload=JSON.stringify({prefix:`${state.fixtures[0].id}/`,limit:100});
      } else if(['public','render'].includes(view)&&spec.method==='GET'){
        ensure(spec.service!==true&&caller==='A'&&spec.intent===undefined,'storage_boundary');headers=publicCaller();cap=4096;
      } else throw reason('storage_boundary');
    } else if(spec.kind==='data') {
      const rpcArgs={resolve_profile_photo_v1:['p_owner'],profile_photo_state_v1:['p_owner'],reserve_profile_photo_v1:['p_owner','p_operation_id','p_expected_revision'],bind_profile_photo_input_v1:['p_owner','p_operation_id','p_lease_epoch','p_input_sha256','p_transform_version'],prepare_profile_photo_v1:['p_owner','p_operation_id','p_lease_epoch','p_input_sha256','p_normalized_sha256','p_mime','p_width','p_height','p_byte_count','p_transform_version'],publish_profile_photo_v1:['p_owner','p_operation_id','p_lease_epoch'],clear_profile_photo_v1:['p_owner','p_operation_id','p_expected_revision']};
      ensure(spec.method==='POST'&&Object.hasOwn(rpcArgs,spec.rpc)&&exact(spec.args,rpcArgs[spec.rpc])&&spec.args.p_owner===state.fixtures[0].id,'rpc_boundary');
      if(spec.rpc==='resolve_profile_photo_v1'||spec.rpc==='profile_photo_state_v1'&&spec.service!==true)headers={...(caller==='anon'?{apikey:credentials.publicKey}:publicCaller()),'content-type':'application/json'};
      else {ensure(spec.service===true&&spec.caller===undefined,'rpc_boundary');headers={apikey:credentials.secretKey,'content-type':'application/json'};}
      if(spec.args.p_operation_id!==undefined){
        const o=state.objects.find(x=>x.operationId===spec.args.p_operation_id);
        ensure(o||spec.rpc==='clear_profile_photo_v1'&&spec.args.p_operation_id===state.clear.operationId,'rpc_boundary');
        if(o){ensure(o.assetId===null||o.key===`${state.fixtures[0].id}/${o.assetId}`,'rpc_boundary');if(spec.args.p_lease_epoch!==undefined)ensure(spec.args.p_lease_epoch===o.leaseEpoch,'rpc_boundary');if(spec.args.p_input_sha256!==undefined)ensure(spec.args.p_input_sha256===`\\x${o.sha256}`,'rpc_boundary');if(spec.args.p_normalized_sha256!==undefined)ensure(spec.args.p_normalized_sha256===`\\x${o.sha256}`,'rpc_boundary');if(spec.args.p_byte_count!==undefined)ensure(spec.args.p_byte_count===o.byteCount&&spec.args.p_mime===MIME&&spec.args.p_width===1&&spec.args.p_height===1,'rpc_boundary');if(spec.args.p_transform_version!==undefined)ensure(spec.args.p_transform_version===VERSION,'rpc_boundary');}
        if(spec.args.p_expected_revision!==undefined)ensure(spec.args.p_expected_revision===state.revision,'rpc_boundary');
      }
      category='data';path=`/rest/v1/rpc/${spec.rpc}`;payload=JSON.stringify(spec.args);
    } else if(spec.kind==='table') {
      ensure(spec.method==='GET'&&['heads','operations'].includes(spec.table)&&spec.caller==='A'&&spec.service!==true,'table_boundary');
      category='data';path=`/rest/v1/${spec.table}?select=owner_id&limit=1`;headers={...publicCaller(),'accept-profile':'profile_asset_private'};
    } else if(spec.kind==='auth') {
      category='auth';const f=state.fixtures.find(x=>x.label===spec.label);
      if(spec.action==='create'){
        ensure(spec.method==='POST'&&f?.stage==='create_intent'&&f.createAttempts===0&&typeof spec.password==='string'&&spec.password.length>=32&&spec.caller===undefined,'create_boundary');
        f.createAttempts++;path='/auth/v1/admin/users';headers={apikey:credentials.secretKey,Authorization:`Bearer ${credentials.secretKey}`,'content-type':'application/json'};
        payload=JSON.stringify({email:f.email,password:spec.password,email_confirm:true,app_metadata:{acceptance_run:state.runId}});
      } else if(spec.action==='password'){
        ensure(spec.method==='POST'&&f?.stage==='created'&&typeof spec.password==='string'&&spec.password.length>=32,'auth_boundary');
        path='/auth/v1/token?grant_type=password';headers={apikey:credentials.publicKey,'content-type':'application/json'};payload=JSON.stringify({email:f.email,password:spec.password});
      } else if(spec.action==='user'){
        ensure(spec.method==='GET'&&f?.stage==='created'&&sessions[f.label]?.token,'auth_boundary');
        path='/auth/v1/user';headers=publicCaller();
      } else if(spec.action==='delete'){
        ensure(spec.method==='DELETE'&&f?.id&&f.stage==='auth_delete_intent'&&f.deleteAttempts<2,'auth_delete_boundary');
        f.deleteAttempts++;path=`/auth/v1/admin/users/${f.id}`;headers={apikey:credentials.secretKey,Authorization:`Bearer ${credentials.secretKey}`,'content-type':'application/json'};payload=JSON.stringify({should_soft_delete:false});
      } else if(spec.action==='probe'){
        ensure(spec.method==='GET'&&spec.label===undefined,'auth_boundary');path='/auth/v1/admin/users/00000000-0000-0000-0000-000000000000';headers={apikey:credentials.secretKey,Authorization:`Bearer ${credentials.secretKey}`};
      } else throw reason('auth_boundary');
    } else throw reason('request_boundary');
    ensure(phase==='cleanup'||Date.now()-Date.parse(state.startedAt)<=360_000,'test_deadline');
    const mutating=spec.kind==='auth'&&['create','delete'].includes(spec.action)||spec.kind==='storage'&&['POST','DELETE'].includes(spec.method)&&spec.view!=='sign'&&spec.view!=='list'||spec.kind==='data'&&!['resolve_profile_photo_v1','profile_photo_state_v1'].includes(spec.rpc);
    const marker=`${spec.kind}:${spec.method}:${spec.intent??spec.rpc??spec.action??spec.key}:${spec.args?.p_operation_id??''}`;
    if(mutating&&seen.has(marker))throw reason('retry_refused');if(mutating)seen.add(marker);
    ensure(state.counters[phase][category]<({run:RUN_CAPS,cleanup:CLEANUP_CAPS}[phase][category])&&state.counters.run[category]+state.counters.cleanup[category]<TOTAL_CAPS[category],'request_cap');
    state.counters[phase][category]++;await save();
    const controller=new AbortController();let timer,reader,response;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(reason('request_deadline'));},deadlineMs);});
    try {
      const pending=fetchImpl(`${ORIGIN}${path}`,{method:spec.method,headers,body:payload,cache:'no-store',redirect:'error',signal:controller.signal});
      pending.then(late=>{if(controller.signal.aborted)void late.body?.cancel().catch(()=>{});}).catch(()=>{});
      response=await Promise.race([pending,deadline]);
      ensure(!response.redirected&&(response.status<300||response.status>=400),'redirect');
      const declared=response.headers.get('content-length');ensure(declared===null||/^(0|[1-9][0-9]*)$/.test(declared)&&Number(declared)<=cap,'response_size');
      if(!response.body)return {status:response.status,headers:response.headers,bytes:new Uint8Array()};
      reader=response.body.getReader();const chunks=[];let length=0;
      for(;;){const part=await Promise.race([reader.read(),deadline]);if(part.done)break;ensure(part.value instanceof Uint8Array&&length+part.value.byteLength<=cap,'response_size');length+=part.value.byteLength;chunks.push(part.value.slice());}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      return {status:response.status,headers:response.headers,bytes};
    }catch(error){if(reader)void reader.cancel().catch(()=>{});else void response?.body?.cancel().catch(()=>{});throw reason(['request_cap','test_deadline','response_size','redirect'].includes(error.message)?error.message:'unavailable');}
    finally{clearTimeout(timer);}
  };
}

// Validate a fixed paired backend checkout against pins before importing its local TypeScript module.
export async function importReviewedAdapter(pins) {
  verifyPins(pins);const root=await realpath(BACKEND_ROOT);ensure(root===BACKEND_ROOT,'backend_root');
  const path=join(root,ADAPTER);ensure(await realpath(path)===path,'adapter_path');
  const commit=(await exec('git',['-C',root,'rev-parse','HEAD'],{timeout:5000,maxBuffer:4096})).stdout.trim();
  ensure(commit===pins.backendCommit,'backend_pin');
  const bytes=await readFile(path);ensure(sha(bytes)===pins.adapterSha256,'adapter_pin');
  return import(pathToFileURL(path).href);
}

const PNG_A=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64'));
const PNG_B=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg==','base64'));
const equalBytes=(a,b)=>a instanceof Uint8Array&&b instanceof Uint8Array&&a.byteLength===b.byteLength&&a.every((v,i)=>v===b[i]);

// Check a complete image or explicit denial with the saved caller JWT; no read fallback is attempted.
async function expectRead(port,label,key,bytes=null){
  const result=await port.get(label,key);
  if(bytes===null)ensure(result?.kind==='denied','read_leak');
  else ensure(result?.kind==='found'&&result.mime===MIME&&equalBytes(result.bytes,bytes),'read_mismatch');
}
async function expectResolve(port,label,expected){
  const got=await port.resolve(label);
  ensure(exact(got,Object.keys(expected))&&Object.entries(expected).every(([key,value])=>got[key]===value),'resolver_mismatch');
}
async function journalCheck(j,label,action){
  await action();await j.mutate(s=>{s.checks.push({label,passed:true});});
}

// A single fixed sequence exercises legacy, publication, revocation, replacement, preparation and clear.
export async function runAcceptance(j,port) {
  let assertionError=null,cleanupError=null;
  try {
    const pre=await port.preflight(j.state);
    ensure(pre.catalog===j.state.pins.catalog,'catalog_drift');
    await j.mutate(s=>{s.baseline=pre.baseline;s.stage='testing';});
    for(const label of LABELS) {
      await j.mutate(s=>{s.fixtures.find(x=>x.label===label).stage='create_intent';});
      const password=Buffer.from(crypto.getRandomValues(new Uint8Array(36))).toString('base64url');
      let acknowledged=null;
      try{acknowledged=await port.create(j.state.fixtures.find(x=>x.label===label),password);}catch{/* Reconcile the one dispatched creation; never issue another. */}
      const candidates=await port.reconcile(j.state.fixtures.find(x=>x.label===label));
      const owned=reconcileCreate(j.state.fixtures.find(x=>x.label===label),candidates,j.state.runId,j.state.startedAt);
      if(acknowledged)ensure(acknowledged.id===owned.id,'create_result');
      await j.mutate(s=>{s.fixtures[LABELS.indexOf(label)]=owned;});
      const profile=await port.profile(owned);
      ensure(profile?.id===owned.id&&profile.email===owned.email&&profile.waitlist_status==='standard'&&profile.stripe_customer_id===null&&profile.avatar_url===null,'created_profile');
      const session=await port.login(owned,password);ensure(session?.token,'login_failed');
      const verified=await port.verify(owned,session.token);ensure(verified?.id===owned.id,'auth_identity');
      await j.mutate(s=>{s.checks.push({label:`identity-${label.toLowerCase()}`,passed:true});});
    }
    const [a,b,c]=j.state.fixtures;ensure(new Set([a.id,b.id,c.id]).size===3,'distinct_identities');
    await j.mutate(s=>{const o=s.objects[0];o.key=`${a.id}/avatar`;o.sha256=sha(PNG_A);o.byteCount=PNG_A.byteLength;o.stage='upload_intent';});
    let legacyAck=true;try{await port.upload(j.state.objects[0],PNG_A);}catch{legacyAck=false;}
    const legacyBytes=await port.readback(j.state.objects[0]);
    if(!legacyBytes||legacyBytes.mime!==MIME||!equalBytes(legacyBytes.bytes,PNG_A)){
      await j.mutate(s=>{s.objects[0].stage='upload_uncertain';});
      throw reason(legacyAck?'legacy_readback':'upload_uncertain');
    }
    await j.mutate(s=>{s.objects[0].stage='verified';});
    const legacy=j.state.objects[0];
    await journalCheck(j,'legacy-owner',async()=>{await expectResolve(port,'A',{kind:'legacy'});await expectRead(port,'A',legacy.key,PNG_A);await expectResolve(port,'B',{kind:'not_found'});await expectResolve(port,'C',{kind:'not_found'});await expectRead(port,'C',legacy.key);});
    await j.mutate(s=>{s.friendship.status='insert_intent';});await port.friend('insert');await j.mutate(s=>{s.friendship.status='accepted';});
    await journalCheck(j,'legacy-friend',async()=>{await expectResolve(port,'B',{kind:'legacy'});await expectRead(port,'B',legacy.key,PNG_A);});
    const generation=async(label,expected,bytes)=>{
      const index=OBJECTS.indexOf(label);
      await j.mutate(s=>{s.objects[index].stage='reserve_intent';});
      const reserved=await port.reserve(j.state.objects[index],expected);
      ensure(reserved?.code==='OK'&&reserved.owner_id===a.id&&reserved.operation_id===j.state.objects[index].operationId&&UUID.test(reserved.asset_id)&&reserved.object_key===`${a.id}/${reserved.asset_id}`&&Number.isSafeInteger(reserved.lease_epoch)&&reserved.lease_epoch>0&&Number(reserved.expected_revision)===expected,'reserve_receipt');
      ensure(!j.state.objects.some((o,i)=>i!==index&&o.assetId===reserved.asset_id),'asset_collision');
      await j.mutate(s=>{const o=s.objects[index];o.assetId=reserved.asset_id;o.key=reserved.object_key;o.leaseEpoch=reserved.lease_epoch;o.sha256=sha(bytes);o.byteCount=bytes.byteLength;o.stage='reserved';});
      await j.mutate(s=>{s.objects[index].stage='bind_intent';});const bound=await port.bind(j.state.objects[index]);ensure(bound?.code==='OK','bind_receipt');await j.mutate(s=>{s.objects[index].stage='bound';});
      await j.mutate(s=>{s.objects[index].stage='prepare_intent';});const prepared=await port.prepare(j.state.objects[index],bytes);
      ensure(prepared?.code==='OK'&&prepared.kind==='upload'&&prepared.state==='prepared'&&prepared.owner_id===a.id&&prepared.asset_id===reserved.asset_id&&prepared.object_key===reserved.object_key&&prepared.normalized_sha256===`\\x${sha(bytes)}`&&prepared.mime===MIME&&prepared.byte_count===bytes.byteLength&&prepared.width===1&&prepared.height===1&&prepared.transform_version===VERSION,'prepare_receipt');
      await j.mutate(s=>{s.objects[index].stage='prepared';});
      await j.mutate(s=>{s.objects[index].stage='upload_intent';});const result=await port.store(prepared,bytes,j.state.objects[index]);
      if(result?.status!=='verified'){await j.mutate(s=>{s.objects[index].stage='upload_uncertain';});throw reason('upload_uncertain');}
      await j.mutate(s=>{s.objects[index].stage='verified';});return j.state.objects[index];
    };
    const publish=async(o,revision)=>{
      const index=OBJECTS.indexOf(o.label);await j.mutate(s=>{s.objects[index].stage='publish_intent';});
      const receipt=await port.publish(j.state.objects[index]);
      ensure(receipt?.code==='OK'&&receipt.asset_id===o.assetId&&receipt.object_key===o.key&&Number(receipt.revision)===revision,'publish_receipt');
      await j.mutate(s=>{s.objects[index].stage='published';s.revision=revision;});
    };
    const g1=await generation('G1',0,PNG_A);await publish(g1,1);
    await journalCheck(j,'generation-one',async()=>{for(const who of ['A','B']){await expectResolve(port,who,{kind:'current',asset_id:g1.assetId});await expectRead(port,who,legacy.key);}await expectRead(port,'B',g1.key,PNG_A);await expectResolve(port,'C',{kind:'not_found'});await expectRead(port,'C',g1.key);});
    await j.mutate(s=>{s.friendship.status='reject_intent';});await port.friend('reject');await j.mutate(s=>{s.friendship.status='rejected';});
    await journalCheck(j,'friend-revoked',async()=>{await expectRead(port,'B',g1.key);await expectResolve(port,'B',{kind:'not_found'});await expectRead(port,'A',g1.key,PNG_A);});
    await j.mutate(s=>{s.friendship.status='restore_intent';});await port.friend('restore');await j.mutate(s=>{s.friendship.status='accepted';});
    const g2=await generation('G2',1,PNG_B);
    await journalCheck(j,'prepared-hidden',async()=>{await expectRead(port,'A',g2.key);await expectRead(port,'B',g2.key);await expectResolve(port,'A',{kind:'current',asset_id:g1.assetId});await expectRead(port,'A',g1.key,PNG_A);});
    await publish(g2,2);
    await journalCheck(j,'replacement',async()=>{for(const who of ['A','B']){await expectResolve(port,who,{kind:'current',asset_id:g2.assetId});await expectRead(port,who,g2.key,PNG_B);await expectRead(port,who,g1.key);await expectRead(port,who,legacy.key);}});
    await journalCheck(j,'private-exposure',()=>port.exposure(j.state,g2));
    const g3=await generation('G3',2,PNG_A);await expectRead(port,'A',g3.key);
    await j.mutate(s=>{s.clear.stage='intent';});const clear=await port.clear(j.state.clear);
    ensure(clear?.code==='OK'&&Number(clear.revision)===3&&clear.current_asset_id===null,'clear_receipt');
    await j.mutate(s=>{s.clear.stage='completed';s.revision=3;});
    await journalCheck(j,'cleared',async()=>{for(const who of ['A','B'])await expectResolve(port,who,{kind:'not_found'});for(const o of j.state.objects)for(const who of ['A','B'])await expectRead(port,who,o.key);});
  }catch(error){assertionError=error;await j.mutate(s=>{s.failures.push('assertion_failed');s.outcome='failed';});}
  try{await j.mutate(s=>{s.stage='cleanup';});await port.cleanup(j.state);await j.mutate(s=>{s.cleanupComplete=true;s.stage='complete';s.outcome=assertionError?'failed':'passed';});}
  catch(error){cleanupError=error;await j.mutate(s=>{s.stage='blocked';s.outcome='failed';s.failures.push('cleanup_blocked');});}
  if(assertionError)throw reason(`assertion_failed:${assertionError.message}`);if(cleanupError)throw reason(`cleanup_blocked:${cleanupError.message}`);
}

async function readCredential(name){
  const value=process.env[name],path=process.env[`${name}_FILE`];
  ensure(!(value&&path),'ambiguous_credentials');
  if(path){await privateFile(path);return(await readFile(path,'utf8')).trim();}return value;
}
const environmentPins=()=>verifyPins({catalog:process.env.ANTE_READER_EXPECTED_CATALOG,backendCommit:process.env.ANTE_READER_BACKEND_COMMIT,adapterSha256:process.env.ANTE_READER_ADAPTER_SHA256});
export async function main(argv=process.argv.slice(2)){
  const [mode='preflight',...flags]=argv;
  ensure(['preflight','run','cleanup'].includes(mode),'mode');
  const reviewed=flags.includes('--reviewed'),recover=flags.includes('--recover-lock'),at=flags.indexOf('--run-id'),runId=at<0?null:flags[at+1];
  ensure(flags.filter((v,i)=>i!==at+1).every(v=>['--reviewed','--recover-lock','--run-id'].includes(v))&&(!reviewed||mode==='run')&&(!recover||mode==='cleanup')&&(mode==='cleanup'?UUID.test(runId??''):runId===null)&&(mode!=='run'||reviewed),'arguments');
  const pins=environmentPins();await importReviewedAdapter(pins);
  const credentials=validateCredentials({publicKey:await readCredential('ANTE_ACCEPTANCE_PUBLIC_KEY'),secretKey:await readCredential('ANTE_ACCEPTANCE_SECRET_KEY')});
  const dir=await stateDirectory(process.env.ANTE_ACCEPTANCE_STATE_DIR??join(homedir(),'.local/state/ante-acceptance/hosted-profile-photo-readers'));
  ensure((await unresolvedJournals(dir)).length===(mode==='cleanup'?1:0),'unresolved_journal');
  const {makeReaderPort}=await import('./hosted-profile-photo-readers-port.mjs');
  if(mode==='preflight'){
    const state=newReaderState(randomUUID(),pins),stub={state,save:async()=>{}};
    const result=await makeReaderPort(stub,credentials).preflight();
    console.log(JSON.stringify({project:PROJECT,mode,catalog:result.catalog,preservationTables:result.baseline.length,mutations:0,passed:true}));return;
  }
  const j=mode==='run'?await ReaderJournal.create(dir,newReaderState(randomUUID(),pins)):await ReaderJournal.resume(dir,runId,recover);
  try{
    ensure(JSON.stringify(j.state.pins)===JSON.stringify(pins),'pin_changed');
    const port=makeReaderPort(j,credentials);
    if(mode==='run')await runAcceptance(j,port);
    else {await j.mutate(s=>{s.stage='cleanup';});await port.cleanup();await j.mutate(s=>{s.cleanupComplete=true;s.stage='complete';s.outcome=s.failures.length===0?'recovered':'failed';});}
  }catch{process.exitCode=1;await j.mutate(s=>{s.outcome='failed';s.failures.push(mode==='run'?'run_failed':'cleanup_failed');});}
  finally{console.log(JSON.stringify({project:PROJECT,runId:j.state.runId,mode,outcome:j.state.outcome,cleanupComplete:j.state.cleanupComplete,journal:j.path,counters:j.state.counters,checks:j.state.checks,failures:j.state.failures}));await j.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error(JSON.stringify({project:PROJECT,outcome:'failed',reason:'preflight_or_journal'}));process.exitCode=1;});
