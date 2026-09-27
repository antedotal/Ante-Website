import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, appendFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { newReaderState, ReaderJournal, readerRequest, verifyPins, assertOwnedInventory, cleanupDecision, runAcceptance } from './hosted-profile-photo-readers.mjs';
import { TABLES } from './hosted-account-jwt-sql.mjs';
import { cleanupReader } from './hosted-profile-photo-readers-port.mjs';

const pin = 'a'.repeat(64);
const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const asset = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const secret = 'sb_secret_private_test_1234567890';
const publicKey = 'sb_publishable_public_test_1234567890';
const bytes = new Uint8Array([137,80,78,71]);
const byteHash = createHash('sha256').update(bytes).digest('hex');

const state = () => newReaderState(runId,{catalog:pin,backendCommit:'b'.repeat(40),adapterSha256:pin});

test('reader state permits exactly three identities, four owned keys and reviewed pins', () => {
  const s=state();
  assert.deepEqual(s.fixtures.map(f=>f.label),['A','B','C']);
  assert.deepEqual(s.objects.map(o=>o.label),['legacy','G1','G2','G3']);
  assert.equal(s.objects[0].key,null);
  assert.equal(s.fixtures[0].email,`ante-reader-${runId}-a@example.invalid`);
  assert.throws(()=>verifyPins({catalog:'',backendCommit:'b'.repeat(40),adapterSha256:pin}),/pin/);
  assert.throws(()=>verifyPins({catalog:pin,backendCommit:'b'.repeat(40),adapterSha256:'not-a-hash'}),/pin/);
});

test('private append-only journal persists intents and refuses changed ownership or secrets',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-reader-journal-'));
  let j;
  try {
    j=await ReaderJournal.create(dir,state());
    assert.equal((await stat(dir)).mode&0o777,0o700);
    assert.equal((await stat(j.path)).mode&0o777,0o600);
    await j.mutate(s=>{s.fixtures[0].stage='create_intent';s.fixtures[0].createAttempts=1;});
    assert.match(await readFile(j.path,'utf8'),/create_intent/);
    await assert.rejects(j.mutate(s=>{s.fixtures[0].email='other@example.invalid';}),/journal/);
    await assert.rejects(j.mutate(s=>{s.secret=secret;}),/journal/);
    await j.close();j=null;
    await assert.rejects(ReaderJournal.create(dir,state()),/unresolved/);
    const resumed=await ReaderJournal.resume(dir,runId);
    assert.equal(resumed.state.fixtures[0].createAttempts,1);
    await resumed.close();
  } finally {await j?.close();await rm(dir,{recursive:true,force:true});}
});

test('resume rejects otherwise valid identity edits and counter rollback appended to journal',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-reader-history-'));let j;
  try{
    j=await ReaderJournal.create(dir,state());
    await j.mutate(s=>{s.fixtures[0].stage='create_intent';s.fixtures[0].createAttempts=1;s.counters.run.auth=1;});
    await j.mutate(s=>{s.fixtures[0].stage='created';s.fixtures[0].id=owner;s.fixtures[0].createdAt=s.startedAt;});
    const path=j.path,baseline=structuredClone(j.state);await j.close();j=null;
    const altered=structuredClone(baseline);altered.fixtures[0].id=asset;
    await appendFile(path,`${JSON.stringify(altered)}\n`);
    await assert.rejects(ReaderJournal.resume(dir,runId),/journal_history/);
    const contents=(await readFile(path,'utf8')).trim().split('\n');contents.pop();
    const {writeFile}=await import('node:fs/promises');await writeFile(path,`${contents.join('\n')}\n`,{mode:0o600});
    const rolled=structuredClone(baseline);rolled.counters.run.auth=0;
    await appendFile(path,`${JSON.stringify(rolled)}\n`);
    await assert.rejects(ReaderJournal.resume(dir,runId),/journal_history/);
  }finally{await j?.close();await rm(dir,{recursive:true,force:true});}
});

test('three exact Auth mutations are independent and each identity remains one-attempt',async()=>{
  const s=state();const calls=[];
  const request=readerRequest({state:s,credentials:{publicKey,secretKey:secret},save:async()=>{},fetchImpl:async(url,init)=>{calls.push({url,init});return new Response('{}',{status:200});}});
  for(let i=0;i<3;i++){const f=s.fixtures[i];f.stage='create_intent';await request({kind:'auth',action:'create',method:'POST',label:f.label,password:'a'.repeat(40)});f.id=[owner,asset,'dddddddd-dddd-4ddd-8ddd-dddddddddddd'][i];f.createdAt=s.startedAt;f.stage='auth_delete_intent';}
  for(const f of s.fixtures)await request({kind:'auth',action:'delete',method:'DELETE',label:f.label});
  assert.equal(calls.length,6);
  await assert.rejects(request({kind:'auth',action:'delete',method:'DELETE',label:'A'}),/delete_boundary|retry_refused/);
});

test('explicit recovery has a fresh bounded request epoch without erasing prior cleanup history',async()=>{
  const s=state();s.fixtures[0].id=owner;s.fixtures[0].createdAt=s.startedAt;s.fixtures[0].stage='created';s.objects[0].key=`${owner}/avatar`;
  s.counters.cleanup.storage=16;s.counters.recoveries.push({id:randomUUID(),counts:{auth:0,data:0,storage:0,cli:0}});
  const request=readerRequest({state:s,credentials:{publicKey,secretKey:secret},save:async()=>{},phase:'recovery',fetchImpl:async()=>new Response(new Uint8Array([1]),{status:200})});
  await request({kind:'storage',method:'GET',key:s.objects[0].key,service:true});
  assert.equal(s.counters.cleanup.storage,16);assert.equal(s.counters.recoveries[0].counts.storage,1);
});

test('a fresh recovery epoch permits one exact Storage and Auth delete after two durable prior attempts',async()=>{
  const s=state();s.fixtures[0].id=owner;s.fixtures[0].createdAt=s.startedAt;s.fixtures[0].stage='auth_delete_intent';s.fixtures[0].deleteAttempts=2;
  const o=s.objects[0];o.key=`${owner}/avatar`;o.stage='delete_intent';o.deleteAttempts=2;
  s.counters.recoveries.push({id:randomUUID(),counts:{auth:0,data:0,storage:0,cli:0}});
  const calls=[];
  const request=readerRequest({state:s,credentials:{publicKey,secretKey:secret},save:async()=>{},phase:'recovery',fetchImpl:async(url,init)=>{calls.push({url,method:init.method});return new Response(null,{status:204});}});
  await request({kind:'storage',method:'DELETE',key:o.key,intent:'legacy-delete',service:true});
  await request({kind:'auth',action:'delete',method:'DELETE',label:'A'});
  assert.equal(o.deleteAttempts,3);assert.equal(s.fixtures[0].deleteAttempts,3);
  assert.deepEqual(calls,[
    {url:`https://yxilmwxptfnebnjsikwo.supabase.co/storage/v1/object/profile-photos/${owner}/avatar`,method:'DELETE'},
    {url:`https://yxilmwxptfnebnjsikwo.supabase.co/auth/v1/admin/users/${owner}`,method:'DELETE'},
  ]);
  await assert.rejects(request({kind:'storage',method:'DELETE',key:o.key,intent:'legacy-delete',service:true}),/retry_refused|delete_boundary/);
  await assert.rejects(request({kind:'auth',action:'delete',method:'DELETE',label:'A'}),/retry_refused|auth_delete_boundary/);
  assert.equal(calls.length,2);assert.equal(o.deleteAttempts,3);assert.equal(s.fixtures[0].deleteAttempts,3);
});

test('request boundary allows only exact owner and generated object, counts before dispatch, and never retries an uncertain upload',async()=>{
  const s=state();s.fixtures[0].id=owner;s.fixtures[0].createdAt=s.startedAt;s.fixtures[0].stage='created';
  s.objects[0].key=`${owner}/avatar`;
  s.objects[0].sha256=byteHash;s.objects[0].byteCount=bytes.length;
  s.objects[0].stage='upload_intent';
  let saves=0,calls=0;
  const request=readerRequest({state:s,credentials:{publicKey,secretKey:secret},save:async()=>{saves++;},fetchImpl:async()=>{calls++;throw Error('lost ack');}});
  await assert.rejects(request({kind:'storage',method:'POST',key:s.objects[0].key,body:bytes,mime:'image/png',intent:'legacy-upload',service:true}),/unavailable/);
  assert.equal(calls,1);assert.equal(saves,1);assert.equal(s.counters.run.storage,1);
  await assert.rejects(request({kind:'storage',method:'POST',key:s.objects[0].key,body:bytes,mime:'image/png',intent:'legacy-upload',service:true}),/retry|upload_boundary/);
  assert.equal(calls,1);
  await assert.rejects(request({kind:'storage',method:'GET',key:`${owner}/other`} ),/boundary/);
  await assert.rejects(request({kind:'data',method:'POST',rpc:'publish_profile_photo_v1',args:{p_owner:owner,p_operation_id:randomUUID(),p_lease_epoch:1}}),/boundary/);
});

test('public resolver and reads use only the named checked JWT, while auth mutations stay exact',async()=>{
  const s=state();s.fixtures[0].id=owner;s.fixtures[0].createdAt=s.startedAt;s.fixtures[0].stage='created';
  s.objects[0].key=`${owner}/avatar`;
  const observed=[];
  const request=readerRequest({state:s,credentials:{publicKey,secretKey:secret},sessions:{A:{token:'checked.jwt.token'}},save:async()=>{},fetchImpl:async(url,init)=>{observed.push({url,init});return new Response(JSON.stringify({kind:'legacy'}),{headers:{'content-type':'application/json'}});}});
  await request({kind:'data',method:'POST',rpc:'resolve_profile_photo_v1',args:{p_owner:owner},caller:'A'});
  await request({kind:'storage',method:'GET',key:s.objects[0].key,caller:'A'});
  assert.equal(observed.length,2);
  for(const {init} of observed){assert.equal(new Headers(init.headers).get('apikey'),publicKey);assert.equal(new Headers(init.headers).get('authorization'),'Bearer checked.jwt.token');assert.equal(JSON.stringify(init).includes(secret),false);}
  await assert.rejects(request({kind:'data',method:'POST',rpc:'resolve_profile_photo_v1',args:{p_owner:owner},caller:'B'}),/caller/);
  await assert.rejects(request({kind:'storage',method:'GET',key:s.objects[0].key,caller:'A',range:'bytes=0-1'}),/request_boundary/);
});

test('streaming response limit stops oversized provider bodies without retry',async()=>{
  const s=state();s.fixtures[0].id=owner;s.fixtures[0].createdAt=s.startedAt;s.fixtures[0].stage='created';s.objects[0].key=`${owner}/avatar`;
  let cancelled=0,calls=0;
  const request=readerRequest({state:s,credentials:{publicKey,secretKey:secret},sessions:{A:{token:'checked.jwt.token'}},save:async()=>{},fetchImpl:async()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(4097));},cancel(){cancelled++;}}),{headers:{'content-type':'image/png'}});}});
  await assert.rejects(request({kind:'storage',method:'GET',key:s.objects[0].key,caller:'A'}),/response_size/);
  assert.equal(calls,1);assert.equal(cancelled,1);
});

test('owned inventory rejects changed Auth marker, profile, foreign references and object manifest',()=>{
  const s=state();s.fixtures[0].id=owner;s.fixtures[0].createdAt=s.startedAt;s.fixtures[0].stage='created';
  s.objects[0].key=`${owner}/avatar`;s.objects[0].sha256=pin;s.objects[0].byteCount=4;s.objects[0].stage='verified';
  const inventory={auth:[{id:owner,email:s.fixtures[0].email,marker:runId,created_at:s.startedAt}],profiles:[{id:owner,email:s.fixtures[0].email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null}],friends:[],heads:[],operations:[],objects:[{name:s.objects[0].key,sha256:pin,byte_count:4,mime:'image/png'}],protected:0};
  assert.doesNotThrow(()=>assertOwnedInventory(s,inventory));
  for(const changed of [
    {auth:[{...inventory.auth[0],marker:'foreign'}]},
    {auth:[{...inventory.auth[0],email:'foreign@example.invalid'}]},
    {auth:[{...inventory.auth[0],created_at:'2020-01-01T00:00:00Z'}]},
    {profiles:[{...inventory.profiles[0],id:asset}]},
    {objects:[{...inventory.objects[0],sha256:'b'.repeat(64)}]},
    {objects:[{...inventory.objects[0],mime:'image/jpeg'}]},
    {objects:[{...inventory.objects[0],byte_count:5}]},
    {protected:1},
  ]) assert.throws(()=>assertOwnedInventory(s,{...inventory,...changed}),/ownership|protected|manifest/);
});

test('cleanup keeps uncertain uploads and creation ownership pending until evidence reconciles them',()=>{
  const s=state();s.fixtures[0].stage='create_intent';s.fixtures[0].createAttempts=1;
  assert.equal(cleanupDecision(s,{auth:[],profiles:[],friends:[],heads:[],operations:[],objects:[],protected:0}), 'blocked');
  s.fixtures[0].stage='created';s.fixtures[0].id=owner;s.fixtures[0].createdAt=s.startedAt;
  s.objects[0].key=`${owner}/avatar`;s.objects[0].sha256=pin;s.objects[0].byteCount=4;s.objects[0].stage='upload_uncertain';
  s.objects[0].uploadAttempts=1;
  assert.equal(cleanupDecision(s,{auth:[],profiles:[],friends:[],heads:[],operations:[],objects:[],protected:0}), 'blocked');
  s.objects[0].stage='upload_intent';
  assert.equal(cleanupDecision(s,{auth:[],profiles:[],friends:[],heads:[],operations:[],objects:[],protected:0}), 'blocked');
});

test('full reader lifecycle uses one friendship, three real reserve receipts and guarded cleanup',async()=>{
  const s=state(),events=[];
  const ids=['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
  let friend=false,revision=0,current=null,metadata=true,journal;
  const stored=new Map();
  const auth=new Set();
  const port={
    preflight:async()=>({catalog:pin,baseline:TABLES.map(table=>({table,count:0,digest:pin}))}),
    create:async(f)=>{const id=ids['ABC'.indexOf(f.label)];auth.add(id);return {id,email:f.email,marker:runId,created_at:s.startedAt};},
    reconcile:async(f)=>[{id:ids['ABC'.indexOf(f.label)],email:f.email,marker:runId,created_at:s.startedAt}],
    profile:async(f)=>({id:f.id,email:f.email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null}),
    login:async(f)=>({token:`${f.label}.checked.jwt`}),verify:async(f)=>({id:f.id}),
    upload:async(o,b)=>{stored.set(o.key,b.slice());events.push(`upload-${o.label}`);},
    readback:async(o)=>stored.has(o.key)?{bytes:stored.get(o.key),mime:'image/png'}:null,
    resolve:async(label)=>label==='C'||label==='B'&&!friend||revision===3?{kind:'not_found'}:revision===0?{kind:'legacy'}:{kind:'current',asset_id:current},
    get:async(label,key)=>{const allowed=label!=='C'&&(label==='A'||friend)&&(revision===0&&key===`${ids[0]}/avatar`||revision>0&&revision<3&&key===`${ids[0]}/${current}`);return allowed?{kind:'found',bytes:stored.get(key),mime:'image/png'}:{kind:'denied'};},
    friend:async action=>{friend=action!=='reject'&&action!=='delete';events.push(`friend-${action}`);},
    reserve:async(o,expected)=>{const assetId={G1:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',G2:'ffffffff-ffff-4fff-8fff-ffffffffffff',G3:'99999999-9999-4999-8999-999999999999'}[o.label];return {code:'OK',owner_id:ids[0],operation_id:o.operationId,asset_id:assetId,object_key:`${ids[0]}/${assetId}`,lease_epoch:1,expected_revision:expected,state:'reserved'};},
    bind:async()=>({code:'OK'}),prepare:async(o,bytes)=>({code:'OK',kind:'upload',state:'prepared',owner_id:ids[0],asset_id:o.assetId,object_key:o.key,normalized_sha256:`\\x${createHash('sha256').update(bytes).digest('hex')}`,mime:'image/png',width:1,height:1,byte_count:bytes.length,transform_version:'synthetic-reader-fixture-v1'}),
    store:async(_prepared,bytes,o)=>{stored.set(o.key,bytes.slice());return {status:'verified'};},
    publish:async o=>{revision++;current=o.assetId;return {code:'OK',asset_id:o.assetId,object_key:o.key,revision};},
    clear:async()=>{revision++;current=null;return {code:'OK',revision,current_asset_id:null};},
    exposure:async()=>{events.push('exposure');},
    cleanup:async()=>{
      const inventory=()=>({auth:s.fixtures.filter(f=>auth.has(f.id)).map(f=>({id:f.id,email:f.email,marker:runId,created_at:f.createdAt})),profiles:metadata?s.fixtures.map(f=>({id:f.id,email:f.email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null})):[],friends:metadata?[{id:s.friendship.id,friend_1:ids[0],friend_2:ids[1],status:'accepted'}]:[],heads:metadata?[{owner_id:ids[0],revision:3,current_asset_id:null}]:[],operations:metadata?[...s.objects.slice(1).map((o,i)=>({owner_id:ids[0],operation_id:o.operationId,kind:'upload',expected_revision:i,state:i===2?'prepared':'completed',result_revision:i===2?null:i+1,asset_id:o.assetId,object_key:o.key,lease_epoch:o.leaseEpoch,input_sha256:o.sha256,normalized_sha256:o.sha256,transform_version:'synthetic-reader-fixture-v1',mime:o.mime,width:1,height:1,byte_count:o.byteCount})),{owner_id:ids[0],operation_id:s.clear.operationId,kind:'delete',expected_revision:2,state:'completed',result_revision:3,asset_id:null,object_key:null,lease_epoch:null,input_sha256:null,normalized_sha256:null,transform_version:null,mime:null,width:null,height:null,byte_count:null}]:[],objects:[...stored.keys()].map(name=>({name})),protected:0});
      const sql=async(query,{write=false}={})=>{
        if(query.includes('AS auth,')&&query.includes('AS profiles,'))return [inventory()];
        if(query.includes('AS owned'))return [{owned:true,auth:1,profile:0,protected:0,privateRows:0}];
        if(query.includes('FROM auth.users WHERE lower(email)')){const f=s.fixtures.find(x=>query.includes(x.email));return auth.has(f.id)?[{id:f.id,email:f.email,marker:runId,created_at:f.createdAt}]:[];}
        if(write&&query.includes('$reader_teardown$')){metadata=false;return [{remaining:0}];}
        throw Error('unexpected_cleanup_sql');
      };
      await cleanupReader(journal,{sql,readback:async o=>stored.has(o.key)?{bytes:stored.get(o.key),mime:'image/png'}:null,clean:async spec=>{if(spec.kind==='storage')stored.delete(spec.key);else auth.delete(s.fixtures.find(f=>f.label===spec.label).id);return {status:200};},catalog:async()=>pin,baseline:async()=>s.baseline});
      events.push('cleanup');
    },
  };
  const dir=await mkdtemp(join(tmpdir(),'ante-reader-full-'));
  journal=await ReaderJournal.create(dir,s);
  try{await runAcceptance(journal,port);}finally{await journal.close();await rm(dir,{recursive:true,force:true});}
  assert.equal(s.outcome,'passed');assert.equal(s.cleanupComplete,true);
  assert.equal(s.revision,3);assert.equal(s.objects.filter(o=>o.assetId).length,3);
  assert.deepEqual(events.filter(e=>e==='friend-insert'||e==='friend-reject'||e==='friend-restore'),['friend-insert','friend-reject','friend-restore']);
  assert.equal(events.filter(e=>e.startsWith('upload-')).length,1);
  assert.equal(events.at(-1),'cleanup');
  assert.equal(stored.size,0);assert.equal(auth.size,0);
});
