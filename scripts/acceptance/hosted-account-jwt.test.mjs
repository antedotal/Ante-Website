import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const mod = await import('./hosted-account-jwt.mjs').catch(() => ({}));
const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fixture = { label: 'A', email: `ante-jwt-${runId}-a@example.invalid`, id, createdAt: '2026-09-27T00:00:01.000Z', stage: 'created' };
const credentials = { publicKey: 'sb_publishable_public', secretKey: 'sb_secret_private' };

test('exports bounded runner safety primitives', () => {
  for (const name of ['validateCredentials','safeResult','Journal','makeFetch','reconcileCreate','assertPreflight','cleanupFixture','runWithCleanup','validateName','validatePresets']) assert.equal(typeof mod[name], 'function', name);
});
test('credentials reject server keys in public clients and wrong project URLs', () => {
  assert.equal(typeof mod.validateCredentials, 'function');
  assert.throws(() => mod.validateCredentials({ ...credentials, publicKey: credentials.secretKey }), /credentials/);
  assert.throws(() => mod.validateCredentials({ ...credentials, url: 'https://evil.invalid' }), /origin/);
  assert.deepEqual(mod.validateCredentials(credentials), { ...credentials, url: 'https://yxilmwxptfnebnjsikwo.supabase.co' });
});
test('sanitizer never persists raw errors or unrecognized codes', () => {
  assert.equal(typeof mod.safeResult, 'function');
  assert.deepEqual(mod.safeResult({ status: 401, error: { code: 'session_not_found', message: 'secret', token: 'secret' } }), { status: 401, code: 'session_not_found' });
  assert.deepEqual(mod.safeResult({ status: 500, error: { code: 'sb_secret_private', message: 'secret' } }), { status: 500, code: 'unclassified' });
});
test('journal creation is exclusive, private, durable, rejects secrets and unresolved runs', async () => {
  assert.equal(typeof mod.Journal, 'function');
  const dir = await mkdtemp(join(tmpdir(), 'ante-journal-')); const j = await mod.Journal.create(dir, runId);
  try {
    assert.equal((await stat(dir)).mode & 0o777, 0o700);
    assert.equal((await stat(j.path)).mode & 0o777, 0o600);
    await j.save({ stage: 'create_pending' });
    assert.equal(JSON.parse((await readFile(j.path,'utf8')).trim().split('\n').at(-1)).stage,'create_pending');
    await assert.rejects(j.save({ password: 'secret' }), /journal/);
    await assert.rejects(mod.Journal.create(dir, runId), /lock|journal/);
    await j.close();
    await assert.rejects(mod.Journal.create(dir, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), /unresolved/);
  } finally { await j.close(); await rm(dir,{recursive:true,force:true}); }
});
test('uncertain create reconciles exact marker/time only and never replaces a fixture', () => {
  assert.equal(typeof mod.reconcileCreate, 'function');
  const pending = { ...fixture, id: null, stage: 'create_pending' };
  const user = { id, email: fixture.email, created_at: fixture.createdAt, marker: runId };
  assert.equal(mod.reconcileCreate(pending, [user], runId, '2026-09-27T00:00:00Z').id,id);
  assert.throws(() => mod.reconcileCreate(pending, [],runId,'2026-09-27T00:00:00Z'), /uncertain/);
  assert.throws(() => mod.reconcileCreate(pending,[{...user,marker:'other'}],runId,'2026-09-27T00:00:00Z'), /ownership/);
  assert.throws(() => mod.reconcileCreate(pending,[user,user],runId,'2026-09-27T00:00:00Z'), /ownership/);
});
test('preflight fails on collision, catalog drift and hooks', () => {
  assert.equal(typeof mod.assertPreflight, 'function');
  const valid = { catalog: 'pinned', expected: 'pinned', collisions: [0,0], configSafe: true };
  assert.doesNotThrow(() => mod.assertPreflight(valid));
  for (const changes of [{collisions:[0,1]}, {catalog:'new'}, {configSafe:false}]) assert.throws(() => mod.assertPreflight({...valid,...changes}));
});
test('fetch enforces credentials/origin/endpoints, caps, deadlines, and no retry', async () => {
  assert.equal(typeof mod.makeFetch, 'function');
  let calls=0; const state={counters:{data:0,auth:0,create:0,delete:0},fixtures:[fixture],startedAt:new Date().toISOString()};
  const save=async()=>{};
  const fetcher=mod.makeFetch({kind:'public',key:credentials.publicKey,secret:credentials.secretKey,state,save,fetchImpl:async()=>{calls++;return new Response('{}');}});
  const req=(url,headers={})=>fetcher(url,{method:'POST',headers:{apikey:credentials.publicKey,...headers},body:'{}'});
  await assert.rejects(req('https://evil.invalid/rest/v1/rpc/get_my_profile_name'), /origin/);
  await assert.rejects(req('https://yxilmwxptfnebnjsikwo.supabase.co/rest/v1/rpc/reserve_profile_photo_v1'), /endpoint/);
  await assert.rejects(req('https://yxilmwxptfnebnjsikwo.supabase.co/rest/v1/rpc/get_my_profile_name',{Authorization:`Bearer ${credentials.secretKey}`}), /credential/);
  state.counters.data=40;
  await assert.rejects(req('https://yxilmwxptfnebnjsikwo.supabase.co/rest/v1/rpc/get_my_profile_name'), /cap/);
  assert.equal(calls,0);
  const timeout = mod.makeFetch({kind:'public',key:credentials.publicKey,secret:credentials.secretKey,state:{...state,counters:{data:0,auth:0,create:0,delete:0}},save,deadlineMs:10,fetchImpl:()=>new Promise(()=>{})});
  await assert.rejects(timeout('https://yxilmwxptfnebnjsikwo.supabase.co/rest/v1/rpc/get_my_profile_name',{method:'POST',headers:{apikey:credentials.publicKey},body:'{}'}), /deadline/);
});
test('cleanup refuses mismatched ownership or protected children before any deletion', async () => {
  assert.equal(typeof mod.cleanupFixture, 'function');
  for (const evidence of [{owned:false,protected:0,auth:1,profile:1},{owned:true,protected:1,auth:1,profile:1}]) {
    let deletes=0;
    await assert.rejects(mod.cleanupFixture(fixture,{inspect:async()=>evidence,removeProfile:async()=>{deletes++;},deleteUser:async()=>{deletes++;},save:async()=>{}}));
    assert.equal(deletes,0);
  }
});
test('cleanup preserves pending journal after admin failure, verifies absence after success', async () => {
  assert.equal(typeof mod.cleanupFixture, 'function');
  const stages=[]; let checks=0;
  const deps={inspect:async()=>({owned:true,protected:0,auth:1,profile:checks++===0?1:0}),removeProfile:async()=>{},deleteUser:async()=>{throw Error('provider secret');},save:async(stage)=>stages.push(stage)};
  await assert.rejects(mod.cleanupFixture({...fixture},deps));
  assert.ok(stages.includes('profile_removed_auth_pending'));
  checks=0;
  const good={...deps,inspect:async()=>({owned:true,protected:0,auth:checks++<2?1:0,profile:checks===1?1:0,privateRows:0}),deleteUser:async()=>{}};
  await mod.cleanupFixture({...fixture},good);
  assert.equal(stages.at(-1),'cleaned');
});
test('failed assertions always trigger cleanup and remain failed', async () => {
  assert.equal(typeof mod.runWithCleanup,'function');let cleaned=0;
  await assert.rejects(mod.runWithCleanup(async()=>{throw Error('assertion');},async()=>{cleaned++;}),/assertion/);
  assert.equal(cleaned,1);
});
test('contracts require exact deployed shape and valid timestamps', () => {
  assert.equal(typeof mod.validateName,'function');
  assert.doesNotThrow(()=>mod.validateName({ok:true,profile:{full_name:'Fixture Alpha',updated_at:'2026-09-27T00:00:00Z'}},'Fixture Alpha'));
  assert.throws(()=>mod.validateName({ok:true,profile:{full_name:'Fixture Alpha',updated_at:'bad'}},'Fixture Alpha'));
  assert.throws(()=>mod.validateName({ok:true,profile:{full_name:'Fixture Alpha',updated_at:'2026-09-27T00:00:00Z',id}},'Fixture Alpha'));
  assert.doesNotThrow(()=>mod.validatePresets({ok:true,presets:null},null));
  assert.throws(()=>mod.validatePresets({ok:false,error:'rate_limited'},null));
});

test('SQL rejects invalid identities and quotes data without treating it as code', async () => {
  const sql=await import('./hosted-account-jwt-sql.mjs').catch(()=>({}));
  assert.equal(typeof sql.literal,'function');
  assert.equal(sql.literal("a'b\\c"),"'a''b\\c'");
  assert.throws(()=>sql.fixtureSql({...fixture,id:"bad'; DELETE FROM profiles;--"},runId,'2026-09-27T00:00:00Z'));
  assert.throws(()=>sql.literal('nul\0value'));
});
test('config proof requires every explicit remote false, never absent diff fields', () => {
  assert.equal(typeof mod.configSafe,'function');
  const paths=['mfa_verification_attempt','password_verification_attempt','custom_access_token','send_sms','send_email','before_user_created'].map(n=>`auth.hook.${n}.enabled`).concat('auth.captcha.enabled');
  const proof={target:{project_ref:'yxilmwxptfnebnjsikwo'},dry_run:true,wrote:false,changes:paths.map(path=>({path:path.split('.'),remote:false})).concat({path:['auth','email','enable_signup'],remote:true})};
  assert.equal(mod.configSafe(proof),true);
  assert.equal(mod.configSafe({...proof,changes:proof.changes.slice(1)}),false);
  assert.equal(mod.configSafe({...proof,wrote:true}),false);
  assert.equal(mod.configSafe({...proof,changes:proof.changes.map((x,i)=>i===0?{...x,remote:true}:x)}),false);
});

test('deadline covers a response body that stalls after headers', async()=>{
  const fetcher=mod.makeFetch({kind:'public',key:credentials.publicKey,secret:credentials.secretKey,state:{startedAt:new Date().toISOString(),fixtures:[fixture],counters:{data:0,auth:0,create:0,delete:0}},save:async()=>{},deadlineMs:10,fetchImpl:async()=>new Response(new ReadableStream({start(){}}))});
  await assert.rejects(fetcher('https://yxilmwxptfnebnjsikwo.supabase.co/rest/v1/rpc/get_my_profile_name',{method:'POST',headers:{apikey:credentials.publicKey},body:'{}'}),/deadline/);
});
test('SDK Auth mutation retries cannot repeat a refresh request', async()=>{
  let calls=0;
  const fetcher=mod.makeFetch({kind:'public',key:credentials.publicKey,secret:credentials.secretKey,state:{startedAt:new Date().toISOString(),fixtures:[fixture],counters:{data:0,auth:0,create:0,delete:0}},save:async()=>{},fetchImpl:async()=>{calls++;return new Response('{}');}});
  const args=['https://yxilmwxptfnebnjsikwo.supabase.co/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:credentials.publicKey},body:'{"refresh_token":"retained-in-memory"}'}];
  await fetcher(...args);await assert.rejects(fetcher(...args),/retry/);assert.equal(calls,1);
});
test('fixture create dispatch remains at most once after an uncertain network result',async()=>{
  let calls=0;const f={...fixture,stage:'create_pending',createRequests:0};
  const state={runId,startedAt:new Date().toISOString(),fixtures:[f],counters:{data:0,auth:0,create:0,delete:0}};
  const fetcher=mod.makeFetch({kind:'admin',key:credentials.secretKey,secret:credentials.secretKey,state,save:async()=>{},fetchImpl:async()=>{calls++;throw Error('offline');}});
  const args=['https://yxilmwxptfnebnjsikwo.supabase.co/auth/v1/admin/users',{method:'POST',headers:{apikey:credentials.secretKey},body:JSON.stringify({email:fixture.email,password:'memory-only',email_confirm:true,app_metadata:{acceptance_run:runId}})}];
  await assert.rejects(fetcher(...args));await assert.rejects(fetcher(...args),/create_boundary/);assert.equal(calls,1);
});

test('cleanup reconciles an ambiguous delete response with exact absence',async()=>{
  let checks=0;let stage;
  await mod.cleanupFixture({...fixture},{inspect:async()=>({owned:true,protected:0,profile:0,privateRows:0,auth:checks++<2?1:0}),removeProfile:async()=>{},deleteUser:async()=>{throw Error('deadline');},save:async s=>{stage=s;}});
  assert.equal(stage,'cleaned');
});
test('default CLI invocation cannot start a hosted run, and run requires review flag',async()=>{
  const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
  for(const args of [[],['run']]) {
    await assert.rejects(promisify(execFile)(process.execPath,['scripts/acceptance/hosted-account-jwt.mjs',...args],{env:{PATH:process.env.PATH},timeout:3000}),e=>{
      assert.equal(e.code,1);assert.match(e.stderr,/runner_preflight_or_journal_failure/);assert.doesNotMatch(e.stderr,/sb_secret_/);return true;
    });
  }
});

test('failure receipts persist fixed reason, fixture and sanitized provider classification',async()=>{
  assert.equal(typeof mod.failure,'function');assert.equal(typeof mod.recordFailure,'function');
  const dir=await mkdtemp(join(tmpdir(),'ante-failure-'));const j=await mod.Journal.create(dir,runId);
  try {
    await mod.recordFailure(j,mod.failure('admin_delete_failed',{error:{status:500,code:'unexpected_failure',message:'sb_secret_hidden',details:{token:'hidden'}}}),'cleanup','A');
    assert.deepEqual(j.state.failures,[{phase:'cleanup',fixture:'A',reason:'admin_delete_failed',status:500,code:'unexpected_failure'}]);
    const disk=await readFile(j.path,'utf8');assert.doesNotMatch(disk,/sb_secret_hidden|details|hidden/);
    await mod.recordFailure(j,Error('sb_secret_hidden'),'setup','B');
    assert.equal(j.state.failures.at(-1).reason,'unclassified_failure');
    await assert.rejects(j.save({failures:[{phase:'cleanup',fixture:'A',reason:'sb_secret_hidden',status:null,code:null}]}),/journal_failure/);
  } finally {await j.close();await rm(dir,{recursive:true,force:true});}
});
test('cleanup identifies ownership and protected references separately, retaining delete errors',async()=>{
  assert.equal(typeof mod.safeFailure,'function');
  for(const [e,reason] of [[{owned:false,protected:0},'ownership_mismatch'],[{owned:true,protected:1},'protected_references']]) {
    await assert.rejects(mod.cleanupFixture(fixture,{inspect:async()=>e,save:async()=>{}}),error=>{assert.equal(mod.safeFailure(error,'cleanup','A').reason,reason);return true;});
  }
  const error=mod.failure('admin_delete_failed',{error:{status:403,code:'bad_jwt',message:'hidden'}});
  await assert.rejects(mod.cleanupFixture(fixture,{inspect:async()=>({owned:true,protected:0,auth:1,profile:0,privateRows:0}),save:async()=>{},deleteUser:async()=>{throw error;}}),e=>e===error);
});
test('both setup and cleanup failures are reported even when the setup error remains primary',async()=>{
  const seen=[];const setup=Error('setup');const cleanup=Error('cleanup');
  await assert.rejects(mod.runWithCleanup(async()=>{throw setup;},async()=>{throw cleanup;},async(e,phase)=>seen.push([e,phase])),e=>e===setup);
  assert.deepEqual(seen,[[setup,'run'],[cleanup,'cleanup']]);
});
test('state directory rejects checkout paths from another cwd and through ancestor symlinks',async()=>{
  assert.equal(typeof mod.stateDirectory,'function');
  const {fileURLToPath}=await import('node:url');const {symlink}=await import('node:fs/promises');
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const dir=await mkdtemp(join(tmpdir(),'ante-state-boundary-'));
  try {
    await assert.rejects(mod.stateDirectory(join(root,'not-created','journal')),/state_inside_checkout/);
    await symlink(root,join(dir,'alias'));
    await assert.rejects(mod.stateDirectory(join(dir,'alias','not-created','journal')),/state_inside_checkout/);
    assert.ok((await mod.stateDirectory(join(dir,'outside','journal'))).endsWith('/outside/journal'));
    const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
    await assert.rejects(promisify(execFile)(process.execPath,[fileURLToPath(new URL('./hosted-account-jwt.mjs',import.meta.url))],{cwd:dir,env:{PATH:process.env.PATH,ANTE_ACCEPTANCE_PUBLIC_KEY:credentials.publicKey,ANTE_ACCEPTANCE_SECRET_KEY:credentials.secretKey,ANTE_ACCEPTANCE_STATE_DIR:join(root,'not-created','journal')},timeout:3000}),e=>{assert.match(e.stderr,/state_inside_checkout/);return true;});
  } finally {await rm(dir,{recursive:true,force:true});}
});
