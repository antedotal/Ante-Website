// Fixed synthetic provider replies exercise descriptor isolation without credentials or network I/O.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, chmod, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newMediatedState, MediatedJournal, validateMediatedState, validateMediatedHistory } from './hosted-profile-photo-mediated.mjs';
import { syntheticReaderBytes } from './hosted-profile-photo-readers.mjs';
const transportModule = () => import('./hosted-profile-photo-mediated-http.mjs');
const cookies = () => import('./hosted-profile-photo-mediated-cookies.mjs');
const origin='https://ante.test', sha='a'.repeat(64), commit='b'.repeat(40);
const pins={websiteCommit:commit,backendCommit:commit,adapterSha256:sha,releaseSha256:sha,catalog:sha,ordinaryBundleSha256:sha,acceptanceBundleSha256:sha,origin,deploymentId:'deployment-1',cacheReceiptSha256:sha,quiescenceReceiptSha256:sha};
const credentials={publicKey:'sb_publishable_synthetic_public',secretKey:'sb_secret_synthetic_private'};
const fullSession=id=>({access_token:`exact.${id.replaceAll('-','')}.token`,refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'test@example.invalid',app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:'2026-01-01T00:00:00Z'}});
function fixture(){
  const state=newMediatedState(randomUUID(),pins);
  state.fixtures.forEach(f=>Object.assign(f,{id:randomUUID(),createdAt:state.startedAt,stage:'created'}));
  state.objects.forEach(o=>{const bytes=syntheticReaderBytes(o.label);Object.assign(o,{assetId:randomUUID(),leaseEpoch:1,byteCount:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});o.key=`${state.fixtures[0].id}/${o.assetId}`;});
  Object.assign(state.preparation,{stage:'complete',visitorDigest:'a'.repeat(64),userDigests:['b'.repeat(64),'c'.repeat(64),'d'.repeat(64)]});
  const journal={state,async mutate(fn){const next=structuredClone(this.state);fn(next);validateMediatedState(next);validateMediatedHistory(this.state,next);this.state=next;}};
  const sessions=Object.fromEntries(state.fixtures.map(f=>[f.label,{password:'synthetic-password-'.repeat(3),session:fullSession(f.id)}]));
  return {journal,sessions,credentials,origin,operatorToken:'c'.repeat(64)};
}
const json=(value={},status=200)=>Response.json(value,{status});

test('fixed transport export exists before any provider use',async()=>{assert.equal(typeof (await transportModule().catch(()=>({}))).createMediatedHttp,'function');});
test('seven exact Storage views use four isolated public credential classes and fixed matrix identity',async()=>{
  const {createMediatedHttp}=await transportModule();const setup=fixture(), seen=[];
  const http=createMediatedHttp({...setup,fetchImpl:async(url,init)=>{seen.push({url,init});return json({},404);}});
  const suffixes=['object','object/authenticated','object/public','render/image/authenticated','render/image/public','object/sign','object/list'];
  const views=['object','authenticated','public','render-auth','render-public','sign','list'];
  for(const actor of ['A','B','C','N'])for(const view of views)await http.dispatch({kind:'directMatrix',matrixId:1,keyLabel:'absence',actor,view},'run');
  assert.equal(seen.length,28);
  seen.forEach(({url,init},i)=>{const actor=['A','B','C','N'][Math.floor(i/7)],view=i%7;const h=new Headers(init.headers);
    assert.equal(url,`https://yxilmwxptfnebnjsikwo.supabase.co/storage/v1/${suffixes[view]}/profile-photos${view===6?'':`/${setup.journal.state.fixtures[0].id}/${setup.journal.state.absenceProbeAssetId}`}`);
    assert.equal(h.get('apikey'),credentials.publicKey);assert.equal(h.get('authorization'),actor==='N'?null:`Bearer ${setup.sessions[actor].session.access_token}`);assert.equal(h.get('cookie'),null);
    assert.equal(init.method,view>=5?'POST':'GET');assert.equal(init.redirect,'error');
    if(view===5)assert.deepEqual(JSON.parse(init.body),{expiresIn:60});
    if(view===6)assert.deepEqual(JSON.parse(init.body),{prefix:`${setup.journal.state.fixtures[0].id}/`,limit:100,offset:0});
  });
  assert.equal(setup.journal.state.counters.run.directStorage,28);assert.equal(setup.journal.state.observed.run.directStorage,28);
  await assert.rejects(http.dispatch({kind:'directMatrix',matrixId:2,keyLabel:'absence',actor:'A',view:'object'},'run'));
});
test('all 25 fixed Data descriptors constrain RPC bodies, schema, actor and service authority',async()=>{
  const {createMediatedHttp}=await transportModule();const setup=fixture(), seen=[];
  const http=createMediatedHttp({...setup,fetchImpl:async(url,init)=>{seen.push({url,init});return json();}});
  for(const label of ['G1','G2'])for(const slot of [1,2,3,4])await http.dispatch({kind:'dataOperation',label,slot},'run');
  await http.dispatch({kind:'dataClear'},'run');
  for(const label of ['absence','G1','G2'])for(const actor of ['A','B','C','N'])await http.dispatch({kind:'dataExposure',label,actor},'run');
  for(const slot of [1,2,3,4])await http.dispatch({kind:'dataBoundary',slot},'run');
  assert.equal(seen.length,25);
  assert.deepEqual(seen.slice(0,9).map(x=>new URL(x.url).pathname.split('/').at(-1)),['reserve_profile_photo_v1','bind_profile_photo_input_v1','prepare_profile_photo_v1','publish_profile_photo_v1','reserve_profile_photo_v1','bind_profile_photo_input_v1','prepare_profile_photo_v1','publish_profile_photo_v1','clear_profile_photo_v1']);
  seen.slice(0,9).forEach(x=>assert.equal(new Headers(x.init.headers).get('apikey'),credentials.secretKey));
  seen.slice(9).forEach(x=>assert.equal(new Headers(x.init.headers).get('apikey'),credentials.publicKey));
  assert.deepEqual(JSON.parse(seen[0].init.body),{p_owner:setup.journal.state.fixtures[0].id,p_operation_id:setup.journal.state.objects[0].operationId,p_expected_revision:0});
  assert.equal(JSON.parse(seen[4].init.body).p_expected_revision,1);assert.equal(JSON.parse(seen[8].init.body).p_expected_revision,2);
  assert.equal(new Headers(seen[23].init.headers).get('accept-profile'),'profile_asset_private');
  assert.equal(new Headers(seen[24].init.headers).get('accept-profile'),'profile_asset_private');
  assert.equal(setup.journal.state.counters.run.directData,25);
});
test('eleven direct Auth dispatches include one separately budgeted updated A identity check',async()=>{
  const {createMediatedHttp}=await transportModule(),{sessionCookies}=await cookies();const setup=fixture(), seen=[];
  const cookieJars={A:sessionCookies({...setup.sessions.A.session,access_token:'exact.updated.token'},origin)};
  const http=createMediatedHttp({...setup,cookieJars,fetchImpl:async(url,init)=>{seen.push({url,init});const bearer=new Headers(init.headers).get('authorization');const label=['A','B','C'].find(label=>bearer===`Bearer ${setup.sessions[label].session.access_token}`);return json({id:label?setup.journal.state.fixtures.find(f=>f.label===label).id:setup.journal.state.fixtures[0].id});}});
  await http.dispatch({kind:'authProbe'},'run');
  for(const label of ['A','B','C'])for(const kind of ['authCreate','authLogin','authGetUser'])await http.dispatch({kind,label,...(kind==='authGetUser'?{slot:1}:{})},'run');
  await http.dispatch({kind:'authGetUser',label:'A',slot:2},'run');
  assert.equal(setup.sessions.A.session.access_token,'exact.updated.token');assert.equal(seen.length,11);assert.equal(new Headers(seen[10].init.headers).get('authorization'),'Bearer exact.updated.token');
  assert.equal(seen[0].url,'https://yxilmwxptfnebnjsikwo.supabase.co/auth/v1/admin/users/00000000-0000-0000-0000-000000000000');
  for(let i=1;i<10;i+=3){assert.equal(new Headers(seen[i].init.headers).get('apikey'),credentials.secretKey);assert.equal(new Headers(seen[i+1].init.headers).get('apikey'),credentials.publicKey);assert.equal(new Headers(seen[i+2].init.headers).get('apikey'),credentials.publicKey);}
  const journal=JSON.stringify(setup.journal.state);for(const secret of [credentials.secretKey,setup.sessions.A.password,'exact.updated.token'])assert.ok(!journal.includes(secret));
});
test('website gets only selected same-origin jar, three optional variants, and anonymous gets none',async()=>{
  const {createMediatedHttp}=await transportModule(),{sessionCookies}=await cookies();const setup=fixture(), seen=[];
  const cookieJars=Object.fromEntries(['A','B','C'].map(label=>[label,sessionCookies(setup.sessions[label].session,origin)]));
  const http=createMediatedHttp({...setup,cookieJars,fetchImpl:async(url,init)=>{seen.push({url,headers:new Headers(init.headers)});return json({},404);}});
  for(const caseId of [1,3,5,6,7,8,9])await http.dispatch({kind:'photo',caseId},'run');
  assert.equal(seen[3].headers.get('cookie'),null);assert.notEqual(seen[0].headers.get('cookie'),seen[1].headers.get('cookie'));
  for(const x of seen){assert.equal(x.url,`${origin}/api/profiles/${setup.journal.state.fixtures[0].id}/photo`);assert.equal(x.headers.get('apikey'),null);assert.equal(x.headers.get('authorization'),null);}
  assert.equal(seen[4].headers.get('range'),'bytes=0-0');assert.equal(seen[5].headers.get('if-none-match'),'"ante-acceptance"');assert.equal(seen[6].headers.get('if-modified-since'),'Thu, 01 Jan 1970 00:00:00 GMT');
  assert.equal(setup.journal.state.counters.run.workerAuth,182);assert.equal(setup.journal.state.observed.run.workerAuth,0);
});
test('rejects arbitrary origin, credentials, path, headers, descriptors and duplicate attempts before network',async()=>{
  const {createMediatedHttp}=await transportModule();let calls=0;const setup=fixture();const fetchImpl=async()=>{calls++;throw Error('private provider body');};
  assert.throws(()=>createMediatedHttp({...setup,origin:'https://foreign.test',fetchImpl}));
  assert.throws(()=>createMediatedHttp({...setup,credentials:{...credentials,publicKey:credentials.secretKey},fetchImpl}));
  const http=createMediatedHttp({...setup,fetchImpl});
  for(const descriptor of [{kind:'authProbe',path:'/foreign'},{kind:'authProbe',headers:{}},{kind:'directMatrix',matrixId:12,keyLabel:'absence',actor:'N',view:'object'},{kind:'cli',slot:1}])await assert.rejects(http.dispatch(descriptor,'run'));
  assert.equal(calls,0);await assert.rejects(http.dispatch({kind:'authProbe'},'run'),/unavailable/);await assert.rejects(http.dispatch({kind:'authProbe'},'run'));assert.equal(calls,1);
  assert.equal(setup.journal.state.counters.run.directAuth,1);assert.equal(setup.journal.state.observed.run.directAuth,0);
});
test('durable reservation is readable before the first fetch and survives lost acknowledgement',async()=>{
  const {createMediatedHttp}=await transportModule();const dir=await mkdtemp(join(tmpdir(),'mediated-http-'));await chmod(dir,0o700);const journal=await MediatedJournal.create(dir,newMediatedState(randomUUID(),pins));
  try{const http=createMediatedHttp({journal,credentials,origin,fetchImpl:async()=>{const disk=JSON.parse((await readFile(journal.path,'utf8')).trim().split('\n').at(-1));assert.equal(disk.counters.run.directAuth,1);assert.equal(disk.intents.length,1);throw Error('lost');}});await assert.rejects(http.dispatch({kind:'authProbe'},'run'));assert.equal(journal.state.counters.run.directAuth,1);}finally{await journal.close();await rm(dir,{recursive:true});}
});
for(const [name,response] of [
  ['redirect',()=>new Response(null,{status:302})],['partial',()=>new Response('x',{status:206})],['not-modified',()=>new Response(null,{status:304})],
  ['compression',()=>json({},200).clone() /* replaced below */],['truncated',()=>new Response('{}',{headers:{'content-length':'9','content-type':'application/json'}})],
  ['oversized',()=>new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}})],['image-error',()=>new Response('not-json',{status:404,headers:{'content-type':'image/png'}})],
])test(`rejects ${name} response without resend`,async()=>{const {createMediatedHttp}=await transportModule();let calls=0;const http=createMediatedHttp({...fixture(),fetchImpl:async()=>{calls++;const r=response();if(name==='compression')r.headers.set('content-encoding','gzip');return r;}});await assert.rejects(http.dispatch({kind:'authProbe'},'run'));assert.equal(calls,1);});
test('missing Content-Length is allowed only within streamed bounds; immediately empty streams stop',async()=>{
  const {createMediatedHttp}=await transportModule();const good=createMediatedHttp({...fixture(),fetchImpl:async()=>json({ok:true})});assert.equal((await good.dispatch({kind:'authProbe'},'run')).bytes.length,11);
  let cancelled=0;const bad=createMediatedHttp({...fixture(),fetchImpl:async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array());},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}})});await assert.rejects(bad.dispatch({kind:'authProbe'},'run'));assert.equal(cancelled,1);
});
test('monotonic late fetch and body settlement cancel without waiting for hostile cancellation',async()=>{
  const {createMediatedHttp}=await transportModule();let now=0,cancelled=0;const late=createMediatedHttp({...fixture(),clock:{now:()=>now,wall:()=>Date.now()},fetchImpl:async()=>{now=10001;return new Response(new ReadableStream({cancel(){cancelled++;return new Promise(()=>{});}}));}});await assert.rejects(late.dispatch({kind:'authProbe'},'run'));assert.equal(cancelled,1);
  now=0;const body=createMediatedHttp({...fixture(),clock:{now:()=>now,wall:()=>Date.now()},fetchImpl:async()=>new Response(new ReadableStream({pull(c){now=10001;c.enqueue(new TextEncoder().encode('{}'));},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}})});await assert.rejects(body.dispatch({kind:'authProbe'},'run'));assert.equal(cancelled,2);
});
test('cookie chunks replace/delete atomically and reject foreign origins and unsafe attributes',async()=>{
  const {sessionCookies,cookieHeader,applyResponseCookies,sessionFromCookies}=await cookies();const original=fullSession(randomUUID());original.user.user_metadata={long:'x'.repeat(10000)};const jar=sessionCookies(original,origin);assert.ok(cookieHeader(jar,origin).includes('.1='));assert.deepEqual(await sessionFromCookies(jar),original);assert.throws(()=>cookieHeader(jar,'https://foreign.test'));
  const small=fullSession(original.user.id),smallJar=sessionCookies(small,origin);const headers=new Headers();
  for(const part of cookieHeader(jar,origin).split('; '))headers.append('set-cookie',`${part.split('=')[0]}=; Path=/; Max-Age=0; Secure; SameSite=Lax`);
  headers.append('set-cookie',`${cookieHeader(smallJar,origin)}; Path=/; Secure; SameSite=Lax`);applyResponseCookies(jar,headers,origin);assert.deepEqual(await sessionFromCookies(jar),small);
  for(const attrs of ['Domain=foreign.test; Path=/; Secure; SameSite=Lax','Path=/foreign; Secure; SameSite=Lax','Path=/; SameSite=Lax','Path=/; Secure; SameSite=None']){const h=new Headers({'set-cookie':`${cookieHeader(smallJar,origin)}; ${attrs}`});assert.throws(()=>applyResponseCookies(jar,h,origin));assert.deepEqual(await sessionFromCookies(jar),small);}
});

// Timers cover transports that never settle; advancing monotonic time alone cannot wake them.
for(const stalled of ['fetch','body'])test(`stalled ${stalled} returns at deadline and cancels a late body`,async t=>{
  const {createMediatedHttp}=await transportModule();t.mock.timers.enable({apis:['setTimeout']});let release,called=0,cancelled=0;
  const lateBody=()=>new Response(new ReadableStream({cancel(){cancelled++;return new Promise(()=>{});}}),{headers:{'content-type':'application/json'}});
  const http=createMediatedHttp({...fixture(),fetchImpl:async()=>{called++;return stalled==='fetch'?new Promise(resolve=>{release=resolve;}):lateBody();}});
  const work=assert.rejects(http.dispatch({kind:'authProbe'},'run'),/request_deadline/);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(called,1);t.mock.timers.tick(10000);await work;
  if(release){release(lateBody());await new Promise(resolve=>setImmediate(resolve));}
  assert.equal(cancelled,1);t.mock.timers.reset();
});

test('preparation uses only operator token; fixed service upload/readback/warm/cleanup paths retain exact keys',async()=>{
  const {createMediatedHttp}=await transportModule();const setup=fixture(),seen=[];
  const http=createMediatedHttp({...setup,fetchImpl:async(url,init)=>{seen.push({url,init});return json();}});
  await http.dispatch({kind:'preparation'},'run');assert.equal(seen[0].url,`${origin}/__ante_acceptance/profile-read-digests-v1`);
  assert.equal(new Headers(seen[0].init.headers).get('apikey'),null);assert.equal(new Headers(seen[0].init.headers).get('authorization'),`Bearer ${setup.operatorToken}`);
  assert.deepEqual(JSON.parse(seen[0].init.body),{run_id:setup.journal.state.runId,fixture_ids:setup.journal.state.fixtures.map(f=>f.id)});
  for(const kind of ['storageUpload','storageReadback','storageWarm'])await http.dispatch({kind,label:'G1'},'run');
  await assert.rejects(http.dispatch({kind:'storageOwnership',label:'G1'},'cleanup'),/phase_deadline/);
  await setup.journal.mutate(s=>{s.cleanupStartedAt=s.startedAt;});
  for(const kind of ['storageOwnership','storageDelete','storageAbsence'])await http.dispatch({kind,label:'G1'},'cleanup');
  const k=setup.journal.state.objects[0].key;
  assert.deepEqual(seen.slice(1).map(x=>[new URL(x.url).pathname,x.init.method]),[
    [`/storage/v1/object/profile-photos/${k}`,'POST'],[`/storage/v1/object/authenticated/profile-photos/${k}`,'GET'],[`/storage/v1/object/authenticated/profile-photos/${k}`,'GET'],
    [`/storage/v1/object/authenticated/profile-photos/${k}`,'GET'],[`/storage/v1/object/profile-photos/${k}`,'DELETE'],[`/storage/v1/object/authenticated/profile-photos/${k}`,'GET'],
  ]);
  seen.slice(1).forEach(x=>{const h=new Headers(x.init.headers);assert.equal(h.get('apikey'),credentials.secretKey);assert.equal(h.get('cookie'),null);});
  assert.deepEqual(seen[1].init.body,syntheticReaderBytes('G1'));
});

test('persisted run and cleanup epochs stop dispatch without resetting after a new transport instance',async()=>{
  const {createMediatedHttp}=await transportModule();const setup=fixture();let calls=0;const start=Date.parse(setup.journal.state.startedAt);
  const fetchImpl=async()=>{calls++;return json();};const clock={now:()=>0,wall:()=>start+900000};
  await assert.rejects(createMediatedHttp({...setup,fetchImpl,clock}).dispatch({kind:'authProbe'},'run'),/phase_deadline/);
  await setup.journal.mutate(s=>{s.cleanupStartedAt=s.startedAt;});
  for(let i=0;i<2;i++)await assert.rejects(createMediatedHttp({...setup,fetchImpl,clock}).dispatch({kind:'storageOwnership',label:'G1'},'cleanup'),/phase_deadline/);
  assert.equal(calls,0);assert.equal(setup.journal.state.intents.length,0);
});

test('cookie replacement rejects mixed chunks, gaps, malformed sessions and identity changes',async()=>{
  const {sessionCookies,cookieHeader,applyResponseCookies,sessionFromCookies,SESSION_COOKIE}=await cookies();
  const original=fullSession(randomUUID()),jar=sessionCookies(original,origin),before=cookieHeader(jar,origin);
  const fields=[`${SESSION_COOKIE}.1=base64-e30; Path=/; Secure; SameSite=Lax`,`${SESSION_COOKIE}=base64-e30; Path=/; Secure; SameSite=Lax`,`${SESSION_COOKIE}=x; Path=/; Secure; SameSite=Lax; Max-Age=0, ignored`];
  for(const field of fields){assert.throws(()=>applyResponseCookies(jar,new Headers({'set-cookie':field}),origin));assert.equal(cookieHeader(jar,origin),before);}
  const forced=await sessionFromCookies(sessionCookies(original,origin,{forceRefresh:true}));const {expires_at,...rest}=forced;assert.ok(expires_at<Math.floor(Date.now()/1000));const {expires_at:oldExpiry,...oldRest}=original;assert.ok(oldExpiry>expires_at);assert.deepEqual(rest,oldRest);
  const {createMediatedHttp}=await transportModule(),setup=fixture();const cookieJars={A:sessionCookies(setup.sessions.A.session,origin)};
  const wrong=sessionCookies(fullSession(randomUUID()),origin);const headers=new Headers({'set-cookie':`${cookieHeader(wrong,origin)}; Path=/; Secure; SameSite=Lax`,'content-type':'application/json'});
  const http=createMediatedHttp({...setup,cookieJars,fetchImpl:async()=>new Response('{}',{headers})});
  await assert.rejects(http.dispatch({kind:'photo',caseId:1},'run'),/cookie_identity/);assert.equal((await sessionFromCookies(cookieJars.A)).user.id,setup.sessions.A.session.user.id);
});

test('default network transport uses its own direct HTTPS pool instead of ambient fetch/proxy dispatchers',async t=>{
  const {default:https}=await import('node:https');const {EventEmitter}=await import('node:events');const {Readable}=await import('node:stream');
  let used=0;const originalFetch=globalThis.fetch;t.mock.method(globalThis,'fetch',async()=>{throw Error('ambient_fetch_not_allowed');});
  t.mock.method(https,'request',(url,options,callback)=>{
    used++;assert.equal(new URL(url).origin,'https://yxilmwxptfnebnjsikwo.supabase.co');assert.ok(options.agent instanceof https.Agent);assert.equal(options.agent.options.keepAlive,true);
    const req=new EventEmitter();req.end=()=>{const response=Readable.from([Buffer.from('{}')]);response.statusCode=200;response.rawHeaders=['Content-Type','application/json','Set-Cookie','one=a; Expires=Thu, 01 Jan 1970 00:00:00 GMT','Set-Cookie','two=b'];queueMicrotask(()=>callback(response));};req.destroy=()=>{};return req;
  });
  const {createMediatedHttp}=await transportModule();const result=await createMediatedHttp(fixture()).dispatch({kind:'authProbe'},'run');assert.equal(result.status,200);assert.equal(new TextDecoder().decode(result.bytes),'{}');assert.equal(result.headers.getSetCookie().length,2);assert.equal(used,1);assert.notEqual(globalThis.fetch,originalFetch);
});

test('default HTTPS stalled socket is destroyed on deadline without retry',async t=>{
  const {default:https}=await import('node:https');const {EventEmitter}=await import('node:events');let destroyed=0,started=0;
  t.mock.timers.enable({apis:['setTimeout']});t.mock.method(https,'request',()=>{started++;const req=new EventEmitter();req.end=()=>{};req.destroy=()=>{destroyed++;req.emit('close');};return req;});
  const {createMediatedHttp}=await transportModule();const work=assert.rejects(createMediatedHttp(fixture()).dispatch({kind:'authProbe'},'run'),/request_deadline|unavailable/);
  await new Promise(resolve=>setImmediate(resolve));t.mock.timers.tick(10000);await work;assert.equal(started,1);assert.equal(destroyed,1);t.mock.timers.reset();
});

// The dispatch boundary must check the supplied jar before cloning or inducing expiry.
for(const descriptor of [{kind:'photo',caseId:1},{kind:'photo',caseId:10},{kind:'authGetUser',label:'A',slot:2}])test(`foreign jar cannot be repinned by ${JSON.stringify(descriptor)}`,async()=>{
  const {createMediatedHttp}=await transportModule(),{sessionCookies,cookieHeader,sessionFromCookies}=await cookies();const setup=fixture(),foreign='https://foreign.test';
  const original=sessionCookies(setup.sessions.A.session,foreign),before=cookieHeader(original,foreign),cookieJars={A:original};let called=0;
  const http=createMediatedHttp({...setup,cookieJars,fetchImpl:async()=>{called++;return json({id:setup.sessions.A.session.user.id});}});
  await assert.rejects(http.dispatch(descriptor,'run'),/cookie_boundary/);
  assert.equal(called,0);assert.equal(setup.journal.state.intents.length,0);assert.strictEqual(cookieJars.A,original);assert.equal(cookieHeader(original,foreign),before);assert.deepEqual(await sessionFromCookies(original),setup.sessions.A.session);
});

// Null-body Response objects cannot hide a still-live incoming Node stream behind a cleared deadline.
for(const nonempty of [false,true])test(`private HTTPS rejects and destroys ${nonempty?'nonempty':'unterminated'} chunked 205 without draining`,async t=>{
  const {default:https}=await import('node:https'),{EventEmitter}=await import('node:events'),{Readable}=await import('node:stream');let started=0,reads=0,resumes=0,incoming;
  t.mock.timers.enable({apis:['setTimeout']});
  t.mock.method(https,'request',(_url,_options,callback)=>{
    started++;const req=new EventEmitter();req.destroy=()=>{req.emit('close');};req.end=()=>{
      incoming=new Readable({read(){reads++;}});if(nonempty)incoming.push(Buffer.from('prohibited'));incoming.statusCode=205;incoming.rawHeaders=['Transfer-Encoding','chunked'];
      const resume=incoming.resume.bind(incoming);incoming.resume=()=>{resumes++;return resume();};queueMicrotask(()=>callback(incoming));
    };return req;
  });
  const {createMediatedHttp}=await transportModule();await assert.rejects(createMediatedHttp(fixture()).dispatch({kind:'authProbe'},'run'));
  assert.equal(incoming.destroyed,true);assert.equal(resumes,0);const settledReads=reads;t.mock.timers.tick(60000);await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,settledReads);assert.equal(started,1);t.mock.timers.reset();
});

test('private HTTPS legitimate 204 cleanup deletion releases its stream without background drain',async t=>{
  const {default:https}=await import('node:https'),{EventEmitter}=await import('node:events'),{Readable}=await import('node:stream');let incoming,started=0,resumes=0;
  t.mock.method(https,'request',(_url,options,callback)=>{
    started++;assert.equal(options.method,'DELETE');const req=new EventEmitter();req.destroy=()=>{req.emit('close');};req.end=()=>{incoming=Readable.from([]);incoming.statusCode=204;incoming.rawHeaders=[];const resume=incoming.resume.bind(incoming);incoming.resume=()=>{resumes++;return resume();};queueMicrotask(()=>callback(incoming));};return req;
  });
  const {createMediatedHttp}=await transportModule(),setup=fixture();await setup.journal.mutate(s=>{s.cleanupStartedAt=s.startedAt;});
  const result=await createMediatedHttp(setup).dispatch({kind:'authDelete',label:'A'},'cleanup');assert.equal(result.status,204);assert.equal(result.bytes.length,0);assert.equal(incoming.destroyed,true);assert.equal(resumes,0);assert.equal(started,1);
});
