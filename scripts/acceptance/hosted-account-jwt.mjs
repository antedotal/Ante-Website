#!/usr/bin/env node
// Bounded hosted acceptance, never a provider mutation by default.
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { open, mkdir, readdir, readFile, lstat, unlink, mkdtemp, rm, realpath } from 'node:fs/promises';
import { homedir, hostname, tmpdir } from 'node:os';
import { join, resolve, dirname, basename, sep } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { TABLES, catalogSql, grantSql, preservationSql, collisionSql, reconcileSql, fixtureSql } from './hosted-account-jwt-sql.mjs';

export const PROJECT = 'yxilmwxptfnebnjsikwo';
export const ORIGIN = `https://${PROJECT}.supabase.co`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ANY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODES = new Set(['42501','P0002','PGRST202','PGRST106','28000','22023','session_not_found','refresh_token_not_found','refresh_token_already_used','user_not_found','bad_jwt','invalid_credentials','unexpected_failure','over_request_rate_limit','request_timeout']);
const FAILURE_REASONS=new Set([
  'ownership_mismatch','protected_references','admin_credentials','admin_delete_failed','admin_endpoint','ambiguous_credentials','arguments',
  'auth_config','auth_delete_guard','auth_endpoint','auth_retry_refused','catalog_drift','cleanup_blocked','cleanup_counts','cleanup_orphan','cleanup_recheck','cleanup_remaining',
  'cli_failed','cli_version','collision','create_boundary','create_result','created_profile','credential_boundary','credential_probe_collision','credentials','data_endpoint','db_response','delete_boundary','distinct_sessions','grants',
  'journal_assertion','journal_catalog','journal_counters','journal_directory','journal_failure','journal_fingerprint','journal_fixture','journal_fixture_stage','journal_fixtures','journal_identity','journal_lock','journal_outcome','journal_request_count','journal_run_id','journal_shape','journal_stage','journal_timestamp','journal_torn_tail',
  'lock_live','lock_owner','login_failed','missing_profile_mutation','mode','name_boundary','origin','preservation_changed','preservation_incomplete','preset_boundary','private_file','private_filter','profile_body','profile_delete_result','profile_filter','request_cap','request_deadline','response_size','review_required','rpc_boundary','state_inside_checkout','state_path','checkout_root','test_deadline','uncertain_create_absence','unresolved_journal','assertion_failed','unclassified_failure',
]);
const FAILURE_PHASES=new Set(['preflight','setup','assertions','cleanup','runner']);
class RunnerFailure extends Error {
  constructor(reason,result) {super(reason);this.reason=reason;this.provider=safeResult(result);}
}
export function failure(reason,result) {return new RunnerFailure(FAILURE_REASONS.has(reason)?reason:'unclassified_failure',result);}
const fail = (reason,result) => {throw failure(reason,result);};
export function safeFailure(error,phase='runner',fixture=null) {
  const trusted=error instanceof RunnerFailure&&FAILURE_REASONS.has(error.reason);
  return {phase:FAILURE_PHASES.has(phase)?phase:'runner',fixture:['A','B'].includes(fixture)?fixture:null,reason:trusted?error.reason:'unclassified_failure',...(trusted?error.provider:{status:null,code:null})};
}
export async function recordFailure(j,error,phase,fixture=null) {
  const entry=safeFailure(error,phase,fixture);const failures=j.state.failures??[];
  if(!failures.some(f=>JSON.stringify(f)===JSON.stringify(entry)))await j.save({failures:[...failures,entry]});
}

export function validateCredentials({publicKey,secretKey,url=ORIGIN}) {
  if (url !== ORIGIN) fail('origin');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey ?? '') || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey ?? '') || publicKey===secretKey) fail('credentials');
  return {publicKey,secretKey,url};
}
export function safeResult(result) {
  const status=result?.status??result?.error?.status;
  return {status:Number.isInteger(status)&&status>=100&&status<=599?status:null,code:result?.error ? (CODES.has(result.error.code)?result.error.code:'unclassified') : null};
}
function keys(value, expected) { assert.deepEqual(Object.keys(value??{}).sort(), [...expected].sort(), 'result_shape'); }
export function validateName(data, name) {
  keys(data,['ok','profile']); assert.equal(data.ok,true,'name_result'); keys(data.profile,['full_name','updated_at']);
  assert.equal(data.profile.full_name,name,'name_value'); assert.ok(typeof data.profile.updated_at==='string' && Number.isFinite(Date.parse(data.profile.updated_at)),'name_timestamp');
}
export function validatePresets(data, amounts) {
  keys(data,['ok','presets']); assert.equal(data.ok,true,'preset_result');
  if(amounts===null) { assert.equal(data.presets,null,'preset_unset'); return; }
  keys(data.presets,['currency','easy_cents','medium_cents','hard_cents','updated_at']); assert.equal(data.presets.currency,'AUD','preset_currency');
  assert.deepEqual([data.presets.easy_cents,data.presets.medium_cents,data.presets.hard_cents],amounts,'preset_values');
  assert.ok(typeof data.presets.updated_at==='string'&&Number.isFinite(Date.parse(data.presets.updated_at)),'preset_timestamp');
}
export function reconcileCreate(fixture, candidates, runId, startedAt) {
  if(candidates.length===0) fail('uncertain_create_absence');
  if(candidates.length!==1) fail('ownership_mismatch');
  const u=candidates[0];
  if(u.email!==fixture.email||u.marker!==runId||!ANY_UUID.test(u.id)||!Number.isFinite(Date.parse(u.created_at))||Date.parse(u.created_at)<Date.parse(startedAt)||Date.parse(u.created_at)>Date.parse(startedAt)+300_000) fail('ownership_mismatch');
  return {...fixture,id:u.id,createdAt:u.created_at,stage:'created'};
}
export function assertPreflight({catalog,expected,collisions,configSafe}) {
  if(catalog!==expected) fail('catalog_drift');
  if(!Array.isArray(collisions)||collisions.length!==2||collisions.some(n=>n!==0)) fail('collision');
  if(configSafe!==true) fail('auth_config');
}
const STATE_KEYS=['version','project','runId','startedAt','method','stage','fixtures','counters','assertions','baseline','after','catalog','outcome','cleanupComplete','failures'];
function validateState(s) {
  if(Object.keys(s).some(k=>!STATE_KEYS.includes(k))||s.version!==1||s.project!==PROJECT||!UUID.test(s.runId)||s.method!=='confirmed-password'||!Number.isFinite(Date.parse(s.startedAt))) fail('journal_shape');
  if(!['prepared','create_pending','testing','cleanup','complete','blocked'].includes(s.stage)) fail('journal_stage');
  if(!Array.isArray(s.fixtures)||s.fixtures.length!==2) fail('journal_fixtures');
  s.fixtures.forEach((f,i)=>{
    if(Object.keys(f).some(k=>!['label','email','id','createdAt','stage','createRequests','deleteRequests'].includes(k))||f.label!==['A','B'][i]||f.email!==`ante-jwt-${s.runId}-${['a','b'][i]}@example.invalid`||(f.id!==null&&!ANY_UUID.test(f.id))) fail('journal_fixture');
    if(!['planned','create_pending','created','profile_removed_auth_pending','delete_pending','cleaned'].includes(f.stage)) fail('journal_fixture_stage');
    for(const k of ['createRequests','deleteRequests']) if(!Number.isInteger(f[k])||f[k]<0||f[k]>1) fail('journal_request_count');
    if(f.createdAt!==null&&!Number.isFinite(Date.parse(f.createdAt))) fail('journal_timestamp');
  });
  keys(s.counters,['data','auth','create','delete']);
  for(const [k,v] of Object.entries(s.counters)) if(!Number.isInteger(v)||v<0||v>({data:40,auth:16,create:2,delete:2}[k])) fail('journal_counters');
  for(const a of s.assertions) {
    keys(a,['check','status','code','passed']);
    if(!CHECKS.has(a.check)||typeof a.passed!=='boolean'||(a.code!==null&&a.code!=='unclassified'&&!CODES.has(a.code))||(a.status!==null&&(!Number.isInteger(a.status)||a.status<100||a.status>599))) fail('journal_assertion');
  }
  for(const f of s.failures??[]) {
    if(!f||Object.keys(f).sort().join(',')!=='code,fixture,phase,reason,status'||!FAILURE_PHASES.has(f.phase)||![null,'A','B'].includes(f.fixture)||!FAILURE_REASONS.has(f.reason)||(f.code!==null&&f.code!=='unclassified'&&!CODES.has(f.code))||(f.status!==null&&(!Number.isInteger(f.status)||f.status<100||f.status>599)))fail('journal_failure');
  }
  for(const field of ['baseline','after']) if(s[field]!==null) for(const row of s[field]) {
    keys(row,['table','count','digest']); if(!TABLES.includes(row.table)||!Number.isSafeInteger(row.count)||row.count<0||!/^[a-f0-9]{64}$/.test(row.digest)) fail('journal_fingerprint');
  }
  if(s.catalog!==null&&!/^[a-f0-9]{64}$/.test(s.catalog)) fail('journal_catalog');
  if(!['pending','passed','failed','recovered'].includes(s.outcome)||typeof s.cleanupComplete!=='boolean') fail('journal_outcome');
}
async function syncDir(dir) { const h=await open(dir,'r'); try {await h.sync();} finally {await h.close();} }
async function privateFile(path) { const s=await lstat(path); if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid()) fail('private_file'); }
async function loadState(path) {
  await privateFile(path); const raw=await readFile(path,'utf8');
  // Refuse a torn tail. Its last intent remains available for manual diagnosis; never discard it.
  if(!raw.endsWith('\n')) fail('journal_torn_tail');
  const states=raw.trim().split('\n').map(line=>JSON.parse(line)); states.forEach(validateState);
  if(states.some(s=>s.runId!==states[0].runId)) fail('journal_identity'); return states.at(-1);
}
export class Journal {
  static async lock(dir, recover=false) {
    await mkdir(dir,{recursive:true,mode:0o700}); const d=await lstat(dir);
    if(!d.isDirectory()||d.isSymbolicLink()||(d.mode&0o077)!==0||d.uid!==process.getuid()) fail('journal_directory');
    const path=join(dir,'run.lock');
    if(recover) {
      await privateFile(path); const lock=JSON.parse(await readFile(path,'utf8'));
      if(lock.host!==hostname()||!Number.isSafeInteger(lock.pid)||lock.pid<1) fail('lock_owner');
      try {process.kill(lock.pid,0); fail('lock_live');} catch(e) {if(e.code!=='ESRCH') throw e;}
      await unlink(path); await syncDir(dir);
    }
    let h;try {h=await open(path,'wx',0o600);}catch {fail('journal_lock');}
    await h.writeFile(JSON.stringify({pid:process.pid,host:hostname()}));await h.sync();await h.close();await syncDir(dir);return path;
  }
  static async create(dir,runId=randomUUID()) {
    if(!UUID.test(runId)) fail('journal_run_id');const lock=await this.lock(dir);
    try {
      for(const name of await readdir(dir)) if(name.endsWith('.jsonl')&&!(await loadState(join(dir,name))).cleanupComplete) fail('unresolved_journal');
      const path=join(dir,`${runId}.jsonl`); const file=await open(path,'wx',0o600);
      const j=new Journal(dir,path,lock,file,{version:1,project:PROJECT,runId,startedAt:new Date().toISOString(),method:'confirmed-password',stage:'prepared',fixtures:['A','B'].map(label=>({label,email:`ante-jwt-${runId}-${label.toLowerCase()}@example.invalid`,id:null,createdAt:null,stage:'planned',createRequests:0,deleteRequests:0})),counters:{data:0,auth:0,create:0,delete:0},assertions:[],failures:[],baseline:null,after:null,catalog:null,outcome:'pending',cleanupComplete:false});
      await j.save({});await syncDir(dir);return j;
    } catch(e) {await unlink(lock);await syncDir(dir);throw e;}
  }
  static async resume(dir,runId,recover=false) {
    if(!UUID.test(runId)) fail('journal_run_id');const lock=await this.lock(dir,recover);
    try {const path=join(dir,`${runId}.jsonl`);const state=await loadState(path);return new Journal(dir,path,lock,await open(path,constants.O_APPEND|constants.O_WRONLY|constants.O_NOFOLLOW),state);}catch(e){await unlink(lock);throw e;}
  }
  constructor(dir,path,lock,file,state) {Object.assign(this,{dir,path,lock,file,state});}
  async save(patch) { const next={...this.state,...patch};validateState(next);await this.file.write(`${JSON.stringify(next)}\n`);await this.file.sync();Object.assign(this.state,next); }
  async close() {if(!this.file)return;await this.file.close();this.file=null;await unlink(this.lock);await syncDir(this.dir);}
}

// Public fetch boundaries never accept the server secret, even if a caller misconfigures SDK headers.
export function makeFetch({kind,key,secret,state,save,fetchImpl=fetch,deadlineMs=10_000}) {
  const sentAuthMutations=new Set();
  return async(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url??String(input));
    if(url.origin!==ORIGIN||url.username||url.password) fail('origin');
    const headers=new Headers(init.headers); const method=(init.method??'GET').toUpperCase();
    if(headers.get('apikey')!==key||(kind==='public'&&[...headers.values()].some(v=>v.includes(secret)))) fail('credential_boundary');
    const body=init.body?JSON.parse(init.body):{};let category;
    if(kind==='admin') {
      if(method==='POST'&&url.pathname==='/auth/v1/admin/users'&&!url.search) {
        const fixture=state.fixtures.find(f=>f.email===body.email);
        if(!fixture||fixture.stage!=='create_pending'||fixture.createRequests!==0||body.email_confirm!==true||body.app_metadata?.acceptance_run!==state.runId) fail('create_boundary');
        keys(body,['email','password','email_confirm','app_metadata']);keys(body.app_metadata,['acceptance_run']);
        fixture.createRequests++;category='create';
      } else if(method==='DELETE'&&url.pathname.startsWith('/auth/v1/admin/users/')) {
        const f=state.fixtures.find(f=>url.pathname===`/auth/v1/admin/users/${f.id}`);
        if(!f||f.stage!=='delete_pending'||f.deleteRequests!==0||url.search||body.should_soft_delete!==false) fail('delete_boundary');
        keys(body,['should_soft_delete']);f.deleteRequests++;category='delete';
      } else if(method==='GET'&&url.pathname==='/auth/v1/admin/users/00000000-0000-0000-0000-000000000000'&&!url.search) category='auth';
      else fail('admin_endpoint');
    } else if(url.pathname.startsWith('/rest/v1/')) {
      if(method==='POST'&&RPCS.includes(url.pathname.slice('/rest/v1/rpc/'.length))&&url.pathname.startsWith('/rest/v1/rpc/')&&!url.search) {
        const name=url.pathname.slice('/rest/v1/rpc/'.length);
        const allowed=name==='profile_photo_state_v1'?['p_owner']:name==='set_my_profile_name'?['p_full_name','p_owner']:name==='set_my_ante_presets'?['p_easy_cents','p_medium_cents','p_hard_cents','p_owner']:['p_owner'];
        if(Object.keys(body).some(k=>!allowed.includes(k))||(body.p_owner&&!state.fixtures.some(f=>f.id===body.p_owner))) fail('rpc_boundary');
        if(name==='set_my_profile_name'&&!['  Fixture Alpha  ','Fixture Beta','Fixture Missing'].includes(body.p_full_name)) fail('name_boundary');
        if(name==='set_my_ante_presets'&&![[100,2500,5000],[200,300,400]].some(a=>JSON.stringify(a)===JSON.stringify([body.p_easy_cents,body.p_medium_cents,body.p_hard_cents]))) fail('preset_boundary');
      } else if(method==='PATCH'&&url.pathname==='/rest/v1/profiles'&&state.fixtures.some(f=>url.searchParams.get('id')===`eq.${f.id}`)) {
        if([...url.searchParams.keys()].some(k=>!['id','select'].includes(k))||url.searchParams.get('select')!=='id') fail('profile_filter');
        keys(body,['full_name']);if(body.full_name!=='Fixture Forbidden') fail('profile_body');
      } else if(method==='GET'&&url.pathname==='/rest/v1/owner_presets'&&headers.get('Accept-Profile')==='ante_presets_private'&&url.searchParams.get('select')==='owner_id'&&state.fixtures.some(f=>url.searchParams.get('owner_id')===`eq.${f.id}`)) {
        if([...url.searchParams.keys()].some(k=>!['select','owner_id'].includes(k))) fail('private_filter');
      } else fail('data_endpoint');
      category='data';
    } else if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.search==='?grant_type=password'&&state.fixtures.some(f=>f.email===body.email)) category='auth';
    else if(method==='POST'&&url.pathname==='/auth/v1/token'&&url.search==='?grant_type=refresh_token'&&typeof body.refresh_token==='string') category='auth';
    else if(method==='GET'&&url.pathname==='/auth/v1/user'&&!url.search) category='auth';
    else if(method==='POST'&&url.pathname==='/auth/v1/logout'&&url.search==='?scope=local') category='auth';
    else fail('auth_endpoint');
    if(category==='auth'&&method==='POST') {
      const signature=url.toString()+' '+init.body;
      if(sentAuthMutations.has(signature))fail('auth_retry_refused');
      sentAuthMutations.add(signature);
    }
    if(category!=='delete'&&Date.now()-Date.parse(state.startedAt)>300_000) fail('test_deadline');
    const cap={data:40,auth:16,create:2,delete:2}[category];
    if(state.counters[category]>=cap) fail('request_cap');state.counters[category]++;await save();
    const controller=new AbortController();let timer;
    try {
      return await Promise.race([(async()=>{
        const response=await fetchImpl(url.toString(),{...init,redirect:'error',signal:controller.signal});
        const bytes=await response.arrayBuffer();
        if(bytes.byteLength>2*1024*1024)fail('response_size');
        return new Response([204,205,304].includes(response.status)?null:bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
      })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(failure('request_deadline'));},deadlineMs);})]);
    } finally {clearTimeout(timer);}
  };
}
export async function cleanupFixture(fixture,{inspect,removeProfile,deleteUser,save}) {
  let e=await inspect();
  if(e.owned!==true)fail('ownership_mismatch');
  if(e.protected!==0)fail('protected_references');
  if(e.auth===0) {if(e.profile!==0||e.privateRows!==0)fail('cleanup_orphan');await save('cleaned');return;}
  if(e.auth!==1||![0,1].includes(e.profile))fail('cleanup_counts');
  if(e.profile===1) await removeProfile();
  await save('profile_removed_auth_pending');
  e=await inspect();if(e.owned!==true)fail('ownership_mismatch');
  if(e.protected!==0)fail('protected_references');
  if(e.auth!==1||e.profile!==0)fail('cleanup_recheck');
  await save('delete_pending');
  let deleteError;
  try {await deleteUser();} catch(error) {deleteError=error;} // Reconcile a possibly committed delete.
  e=await inspect();
  if(e.auth!==0||e.profile!==0||e.protected!==0||e.privateRows!==0) {
    if(deleteError)throw deleteError;
    if(e.owned!==true)fail('ownership_mismatch');if(e.protected!==0)fail('protected_references');
    fail('cleanup_remaining');
  }
  await save('cleaned');
}
export async function runWithCleanup(run,cleanup,onFailure=async()=>{}) {
  let error;try {await run();}catch(e){error=e;try {await onFailure(e,'run');}catch { /* Still attempt cleanup if reporting fails. */ }}
  try {await cleanup();}catch(e){error??=e;await onFailure(e,'cleanup');}
  if(error)throw error;
}
const RPCS=['get_my_profile_name','set_my_profile_name','get_my_ante_presets','set_my_ante_presets','profile_photo_state_v1'];
const CHECKS=new Set(['identity-A','identity-B','name-set-A','name-get-A','name-set-B','name-get-B','name-A-unchanged','preset-unset-A','preset-unset-B','preset-set-A','preset-set-B','preset-get-A','preset-get-B','owner-get_my_profile_name','owner-set_my_profile_name','owner-get_my_ante_presets','owner-set_my_ante_presets','direct-name-A','direct-name-B','direct-private','photo-A','photo-anon','anonymous-name','anonymous-presets','final-name-A','final-name-B','final-preset-A','final-preset-B','missing-profile-get','missing-profile-set','signout-B','revoked-getUser-B','revoked-refresh-B']);

const HOOKS=['mfa_verification_attempt','password_verification_attempt','custom_access_token','send_sms','send_email','before_user_created'];
export function configSafe(proof) {
  if(proof?.target?.project_ref!==PROJECT||proof.dry_run!==true||proof.wrote!==false||!Array.isArray(proof.changes))return false;
  return [...HOOKS.map(h=>`auth.hook.${h}.enabled`),'auth.captcha.enabled'].every(path=>proof.changes.filter(c=>Array.isArray(c.path)&&c.path.join('.')===path&&c.remote===false).length===1) && proof.changes.filter(c=>Array.isArray(c.path)&&c.path.join('.')==='auth.email.enable_signup'&&c.remote===true).length===1;
}

const EXPECTED_CATALOG='6ecb70845fc10d9d80ba6f43b2810300d934fb6889fe880fde2146ff5d6799a5';
const exec=promisify(execFile);
const CLI='/opt/homebrew/bin/supabase';
async function cli(args,workdir) {
  try {return (await exec(CLI,args,{cwd:workdir,timeout:20_000,maxBuffer:4*1024*1024,env:{...process.env,NO_COLOR:'1'},killSignal:'SIGKILL'})).stdout;} catch {fail('cli_failed');}
}
export async function dbQuery(sql,{write=false}={}) {
  const dir=await mkdtemp(join(tmpdir(),'ante-jwt-sql-'));
  try {
    const file=await open(join(dir,'query.sql'),'wx',0o600);
    await file.writeFile(`BEGIN ${write?'':'READ ONLY'}; SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='3s'; SET LOCAL standard_conforming_strings=on;\n${sql};\nCOMMIT;`);await file.close();
    const raw=await cli(['db','query','--linked','--project-ref',PROJECT,'--file',join(dir,'query.sql'),'--output','json']);
    const envelope=JSON.parse(raw);if(!Array.isArray(envelope.rows))fail('db_response');return envelope.rows;
  } finally {await rm(dir,{recursive:true,force:true});}
}
export async function inspectConfig() {
  if((await cli(['--version'])).trim()!=='2.118.0')fail('cli_version');
  const dir=await mkdtemp(join(tmpdir(),'ante-jwt-config-'));
  try {
    await mkdir(join(dir,'supabase'),{mode:0o700});
    const file=await open(join(dir,'supabase','config.toml'),'wx',0o600);
    // Local sentinels only. config pull MUST remain --dry-run. No secrets or remote config saved.
    await file.writeFile(`project_id = "ante-account-acceptance-inspection"\n[auth.email]\nenable_signup = false\n`+HOOKS.map(h=>`[auth.hook.${h}]\nenabled = true\nuri = "pg-functions://postgres/public/ante_probe_never_called"\n`).join('')+'[auth.captcha]\nenabled = true\nprovider = "turnstile"\nsecret = "local-placeholder-never-pushed"\n');await file.close();
    return configSafe(JSON.parse(await cli(['config','pull','--project-ref',PROJECT,'--dry-run','--output-format','json','--workdir',dir],dir)));
  } finally {await rm(dir,{recursive:true,force:true});}
}
async function readCredential(name) {
  const value=process.env[name];const path=process.env[`${name}_FILE`];
  if(value&&path)fail('ambiguous_credentials');if(path){await privateFile(path);return(await readFile(path,'utf8')).trim();}return value;
}
function clients(credentials,state,save) {
  const build=(kind,key)=>createClient(ORIGIN,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,debug:false},global:{fetch:makeFetch({kind,key,secret:credentials.secretKey,state,save})}});
  return {admin:build('admin',credentials.secretKey),A:build('public',credentials.publicKey),B:build('public',credentials.publicKey),anon:build('public',credentials.publicKey)};
}
async function catalogCheck() {
  const [{digest}]=await dbQuery(catalogSql);if(digest!==EXPECTED_CATALOG)fail('catalog_drift');
  const [grants]=await dbQuery(grantSql);if(Object.values(grants).some(v=>v!==true)||Object.keys(grants).length!==3)fail('grants');return digest;
}
async function preflight(credentials,state,save=async()=>{}) {
  const config=await inspectConfig();const catalog=await catalogCheck();
  const collisions=(await dbQuery(collisionSql(state.fixtures))).map(r=>r.count);
  assertPreflight({catalog,expected:EXPECTED_CATALOG,collisions,configSafe:config});
  const [{count}]=await dbQuery("SELECT count(*)::int AS count FROM auth.users WHERE id='00000000-0000-0000-0000-000000000000'::uuid");
  if(count!==0)fail('credential_probe_collision');
  const c=clients(credentials,state,save);const adminProbe=await c.admin.auth.admin.getUserById('00000000-0000-0000-0000-000000000000');
  if(adminProbe.error?.status!==404||adminProbe.error?.code!=='user_not_found')fail('admin_credentials',adminProbe);
  const baseline=await dbQuery(preservationSql());if(baseline.length!==TABLES.length)fail('preservation_incomplete');
  return {catalog,baseline};
}
async function record(j,check,result,validate) {
  let error;try {validate(result);}catch(e){error=e;}
  j.state.assertions.push({check,...safeResult(result),passed:!error});await j.save({});if(error)fail('assertion_failed',result);return result.data;
}
const success=r=>assert.equal(r.error,null,'provider_error');
const denied=(codes,statuses=[401,403,404])=>r=>{assert.ok(r.error,'denial_required');assert.ok(statuses.includes(r.status??r.error.status),'denial_status');assert.ok(codes.includes(r.error.code),'denial_code');};
// PostgREST maps P0* to HTTP 500, except P0001; require this exact missing-row code.
export const missingProfileDenied=denied(['P0002'],[500]);
async function assertions(j,c) {
  const rpc=async(label,client,name,args,validate)=>record(j,label,await client.rpc(name,args),validate);
  const nameOk=name=>r=>{success(r);validateName(r.data,name);};
  const presetOk=amounts=>r=>{success(r);validatePresets(r.data,amounts);};
  const [a,b]=j.state.fixtures;
  await rpc('name-set-A',c.A,'set_my_profile_name',{p_full_name:'  Fixture Alpha  '},nameOk('Fixture Alpha'));
  await rpc('name-get-A',c.A,'get_my_profile_name',{},nameOk('Fixture Alpha'));
  await rpc('name-set-B',c.B,'set_my_profile_name',{p_full_name:'Fixture Beta'},nameOk('Fixture Beta'));
  await rpc('name-get-B',c.B,'get_my_profile_name',{},nameOk('Fixture Beta'));
  await rpc('name-A-unchanged',c.A,'get_my_profile_name',{},nameOk('Fixture Alpha'));
  await rpc('preset-unset-A',c.A,'get_my_ante_presets',{},presetOk(null));
  await rpc('preset-unset-B',c.B,'get_my_ante_presets',{},presetOk(null));
  for(const [label,client,amounts] of [['A',c.A,[100,2500,5000]],['B',c.B,[200,300,400]]]) {
    await rpc(`preset-set-${label}`,client,'set_my_ante_presets',{p_easy_cents:amounts[0],p_medium_cents:amounts[1],p_hard_cents:amounts[2]},presetOk(amounts));
    await rpc(`preset-get-${label}`,client,'get_my_ante_presets',{},presetOk(amounts));
  }
  for(const name of RPCS.slice(0,4)) {
    const args=name==='set_my_profile_name'?{p_full_name:'  Fixture Alpha  '}:name==='set_my_ante_presets'?{p_easy_cents:100,p_medium_cents:2500,p_hard_cents:5000}:{};
    await rpc(`owner-${name}`,c.A,name,{...args,p_owner:b.id},denied(['PGRST202'],[404]));
  }
  for(const f of [a,b]) await record(j,`direct-name-${f.label}`,await c.A.from('profiles').update({full_name:'Fixture Forbidden'}).eq('id',f.id).select('id'),r=>{
    if(r.error)denied(['42501'])(r);else assert.deepEqual(r.data,[],'no_changed_rows');
  });
  await record(j,'direct-private',await c.A.schema('ante_presets_private').from('owner_presets').select('owner_id').eq('owner_id',a.id).retry(false),denied(['PGRST106','42501'],[400,401,403,406]));
  await rpc('photo-A',c.A,'profile_photo_state_v1',{p_owner:a.id},denied(['42501']));
  await rpc('photo-anon',c.anon,'profile_photo_state_v1',{p_owner:a.id},denied(['42501']));
  await rpc('anonymous-name',c.anon,'get_my_profile_name',{},denied(['42501']));
  await rpc('anonymous-presets',c.anon,'get_my_ante_presets',{},denied(['42501']));
  for(const [label,client,name,amounts] of [['A',c.A,'Fixture Alpha',[100,2500,5000]],['B',c.B,'Fixture Beta',[200,300,400]]]) {
    await rpc(`final-name-${label}`,client,'get_my_profile_name',{},nameOk(name));
    await rpc(`final-preset-${label}`,client,'get_my_ante_presets',{},presetOk(amounts));
  }
}
async function inspectFixture(j,f) {return(await dbQuery(fixtureSql(f,j.state.runId,j.state.startedAt).inspect))[0];}
async function removeProfile(j,f) {
  await catalogCheck();const rows=await dbQuery(fixtureSql(f,j.state.runId,j.state.startedAt,EXPECTED_CATALOG).remove,{write:true});
  if(rows.length!==1||rows[0].remaining!==0)fail('profile_delete_result');f.stage='profile_removed_auth_pending';await j.save({});
}
async function cleanup(j,c) {
  await j.save({stage:'cleanup'});
  if(j.state.counters.create===0&&!j.state.baseline){await j.save({cleanupComplete:true,stage:'complete'});return;}
  await catalogCheck();let blocked=false;
  for(let i=0;i<j.state.fixtures.length;i++) {
    let f=j.state.fixtures[i];
    try {
      if(!f.id&&f.stage==='planned'){f.stage='cleaned';await j.save({});continue;}
      if(!f.id){f=reconcileCreate(f,await dbQuery(reconcileSql(f)),j.state.runId,j.state.startedAt);j.state.fixtures[i]=f;await j.save({});}
      await cleanupFixture(f,{
        inspect:()=>inspectFixture(j,f),removeProfile:()=>removeProfile(j,f),
        deleteUser:async()=>{
          await catalogCheck();const fresh=await inspectFixture(j,f);
          if(fresh.owned!==true)fail('ownership_mismatch');if(fresh.protected!==0)fail('protected_references');
          if(fresh.auth!==1||fresh.profile!==0)fail('auth_delete_guard');
          const r=await c.admin.auth.admin.deleteUser(f.id,false);if(r.error)fail('admin_delete_failed',r);
        },
        save:async stage=>{f.stage=stage;await j.save({});},
      });
    } catch(error) {blocked=true;await recordFailure(j,error,'cleanup',f.label);}
  }
  if(blocked){await j.save({stage:'blocked',outcome:'failed'});fail('cleanup_blocked');}
  const after=await dbQuery(preservationSql());await j.save({after});
  if(!j.state.baseline||JSON.stringify(after)!==JSON.stringify(j.state.baseline)){await j.save({stage:'blocked',outcome:'failed'});fail('preservation_changed');}
  await catalogCheck();await j.save({cleanupComplete:true,stage:'complete'});
}
async function executeRun(j,credentials) {
  const c=clients(credentials,j.state,()=>j.save({}));const sessions={};
  let phase='preflight';let fixture=null;
  await runWithCleanup(async()=>{
    const pre=await preflight(credentials,j.state,()=>j.save({}));await j.save({...pre,stage:'testing'});
    phase='setup';
    for(let i=0;i<2;i++) {
      let f=j.state.fixtures[i];fixture=f.label;f.stage='create_pending';await j.save({stage:'create_pending'});
      const password=randomBytes(36).toString('base64url');
      const r=await c.admin.auth.admin.createUser({email:f.email,password,email_confirm:true,app_metadata:{acceptance_run:j.state.runId}});
      if(r.error)await recordFailure(j,failure('create_result',r),'setup',f.label);
      // Persist a successful create acknowledgement before any subsequent network operation.
      if(!r.error&&r.data.user) {
        const u=r.data.user;
        f=reconcileCreate(f,[{id:u.id,email:u.email,created_at:u.created_at,marker:u.app_metadata?.acceptance_run}],j.state.runId,j.state.startedAt);
        j.state.fixtures[i]=f;await j.save({});
      }
      // Reconcile even an error/timeout; never make another create request.
      const candidates=await dbQuery(reconcileSql(f));
      f=reconcileCreate(f,candidates,j.state.runId,j.state.startedAt);j.state.fixtures[i]=f;await j.save({stage:'testing'});
      if(r.error||r.data.user?.id!==f.id)fail('create_result',r);
      const e=await inspectFixture(j,f);if(e.owned!==true)fail('ownership_mismatch');if(e.protected!==0)fail('protected_references');
      if(e.auth!==1||e.profile!==1)fail('created_profile');
      const login=await c[f.label].auth.signInWithPassword({email:f.email,password});
      if(login.error||!login.data.session)fail('login_failed',login);
      const session=login.data.session;sessions[f.label]=session;
      const verified=await c[f.label].auth.getUser(session.access_token);
      await record(j,`identity-${f.label}`,verified,result=>{success(result);assert.equal(result.data.user?.id,f.id);assert.equal(result.data.user?.role,'authenticated');assert.equal(session.user.id,f.id);});
    }
    if(j.state.fixtures[0].id===j.state.fixtures[1].id||sessions.A.access_token===sessions.B.access_token)fail('distinct_sessions');
    phase='assertions';fixture=null;await assertions(j,c);
    const [a]=j.state.fixtures;
    fixture='A';await removeProfile(j,a);
    const quotaSql=fixtureSql(a,j.state.runId,j.state.startedAt).quota;const before=await dbQuery(quotaSql);
    await record(j,'missing-profile-get',await c.A.rpc('get_my_profile_name'),missingProfileDenied);
    await record(j,'missing-profile-set',await c.A.rpc('set_my_profile_name',{p_full_name:'Fixture Missing'}),missingProfileDenied);
    if(JSON.stringify(before)!==JSON.stringify(await dbQuery(quotaSql))||(await inspectFixture(j,a)).profile!==0)fail('missing_profile_mutation');
    fixture='B';await record(j,'signout-B',await c.B.auth.signOut({scope:'local'}),success);
    // getUser may still accept an access JWT until expiry. Preserve the actual provider classification.
    await record(j,'revoked-getUser-B',await c.B.auth.getUser(sessions.B.access_token),()=>{});
    await record(j,'revoked-refresh-B',await c.B.auth.refreshSession({refresh_token:sessions.B.refresh_token}),r=>{assert.ok(r.error,'revoked_refresh_must_fail');assert.ok([400,401,403].includes(r.error.status),'revoked_refresh_auth_denial');assert.equal(r.data.session,null);});
  },()=>cleanup(j,c),(error,source)=>recordFailure(j,error,source==='cleanup'?'cleanup':phase,source==='cleanup'?null:fixture));
  await j.save({outcome:'passed'});
}
async function canonicalPath(path) {
  const missing=[];let current=resolve(path);
  for(;;) {
    try {return join(await realpath(current),...missing.reverse());}
    catch(error) {if(error.code!=='ENOENT'||dirname(current)===current)fail('state_path');missing.push(basename(current));current=dirname(current);}
  }
}
export async function stateDirectory(path) {
  let root;
  try {
    const scriptDir=dirname(fileURLToPath(import.meta.url));
    const env={...process.env};delete env.GIT_DIR;delete env.GIT_WORK_TREE;
    root=await realpath((await exec('git',['-C',scriptDir,'rev-parse','--show-toplevel'],{timeout:5000,maxBuffer:4096,env})).stdout.trim());
  } catch {fail('checkout_root');}
  const dir=await canonicalPath(path);
  if(dir===root||dir.startsWith(`${root}${sep}`))fail('state_inside_checkout');return dir;
}
export async function main(argv=process.argv.slice(2)) {
  const [mode='preflight',...flags]=argv;
  if(!['preflight','run','cleanup'].includes(mode))fail('mode');
  const reviewed=flags.includes('--reviewed');const recover=flags.includes('--recover-lock');
  const index=flags.indexOf('--run-id');const runId=index>=0?flags[index+1]:null;
  const known=flags.filter((_,i)=>i!==index+1||index<0);
  if(known.some(x=>!['--reviewed','--recover-lock','--run-id'].includes(x)))fail('arguments');
  if(mode==='run'&&!reviewed)fail('review_required');if(mode!=='cleanup'&&(runId||recover))fail('arguments');
  const credentials=validateCredentials({publicKey:await readCredential('ANTE_ACCEPTANCE_PUBLIC_KEY'),secretKey:await readCredential('ANTE_ACCEPTANCE_SECRET_KEY')});
  const dir=await stateDirectory(process.env.ANTE_ACCEPTANCE_STATE_DIR??join(homedir(),'.local/state/ante-acceptance/hosted-account-jwt'));
  if(mode==='preflight') {
    const probeId=randomUUID();const state={startedAt:new Date().toISOString(),fixtures:['a','b'].map(x=>({email:`ante-jwt-${probeId}-${x}@example.invalid`})),counters:{data:0,auth:0,create:0,delete:0}};
    const pre=await preflight(credentials,state);console.log(JSON.stringify({project:PROJECT,mode,passed:true,catalog:pre.catalog,preservationTables:pre.baseline.length,mutations:0}));return;
  }
  const j=mode==='cleanup'?await Journal.resume(dir,runId,recover):await Journal.create(dir);
  try {
    if(mode==='run')await executeRun(j,credentials);
    else {
      // An explicit recovery command grants at most one further exact-ID delete per fixture.
      // Previous attempts remain durable in earlier journal entries; creation is never reset.
      for(const f of j.state.fixtures)f.deleteRequests=0;
      j.state.counters.delete=0;await j.save({});
      await cleanup(j,clients(credentials,j.state,()=>j.save({})));await j.save({outcome:'recovered'});
    }
  } catch(error) {await recordFailure(j,error,mode==='cleanup'?'cleanup':'runner');await j.save({outcome:'failed'});process.exitCode=1;}
  finally {
    console.log(JSON.stringify({project:PROJECT,runId:j.state.runId,outcome:j.state.outcome,cleanupComplete:j.state.cleanupComplete,fixtures:j.state.fixtures.map(({label,email,id,stage})=>({label,email,id,stage})),counters:j.state.counters,assertions:j.state.assertions,failures:j.state.failures??[],journal:j.path}));await j.close();
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(JSON.stringify({project:PROJECT,outcome:'failed',reason:'runner_preflight_or_journal_failure',failure:safeFailure(error,'preflight')}));process.exitCode=1;});
