import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { newReaderState, ReaderJournal, main, syntheticReaderBytes, reconcileAuthority, readerRequest } from './hosted-profile-photo-readers.mjs';
import { cleanupReader, makeReaderPort } from './hosted-profile-photo-readers-port.mjs';
import { TABLES } from './hosted-account-jwt-sql.mjs';

const pin='a'.repeat(64),runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ids=['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
const assets=['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff','99999999-9999-4999-8999-999999999999'];
const state=()=>{
  const s=newReaderState(runId,{catalog:pin,backendCommit:'b'.repeat(40),adapterSha256:pin});
  s.baseline=TABLES.map(table=>({table,count:0,digest:pin}));s.stage='cleanup';s.revision=3;s.clear.stage='completed';s.friendship.status='accepted';
  for(let i=0;i<3;i++)Object.assign(s.fixtures[i],{id:ids[i],createdAt:s.startedAt,stage:'created'});
  for(let i=0;i<4;i++){const photo=syntheticReaderBytes(s.objects[i].label);Object.assign(s.objects[i],{key:`${ids[0]}/${i===0?'avatar':assets[i-1]}`,assetId:i===0?null:assets[i-1],leaseEpoch:i===0?null:1,sha256:createHash('sha256').update(photo).digest('hex'),byteCount:photo.length,stage:i===0?'verified':i===3?'verified':'published'});}
  return s;
};

test('real port creates, reconciles, logs in and verifies three distinct caller JWTs',async()=>{
  const s=newReaderState(runId,{catalog:pin,backendCommit:'b'.repeat(40),adapterSha256:pin}),seen=[];
  const port=makeReaderPort({state:s,save:async()=>{}},{publicKey:'sb_publishable_public_test_1234567890',secretKey:'sb_secret_private_test_1234567890'},{
    fetchImpl:async(url,init)=>{
      const body=init.body?JSON.parse(init.body):{};seen.push({url,headers:init.headers,body});
      if(url.endsWith('/auth/v1/admin/users')){const i=s.fixtures.findIndex(f=>f.email===body.email);return Response.json({id:ids[i],email:body.email,created_at:s.startedAt});}
      if(url.includes('/auth/v1/token'))return Response.json({access_token:`${s.fixtures.find(f=>f.email===body.email).label}.checked.jwt`});
      if(url.endsWith('/auth/v1/user')){const label=init.headers.Authorization.split(' ')[1][0];return Response.json({id:ids['ABC'.indexOf(label)]});}
      throw Error('unexpected_endpoint');
    },
    query:async sql=>{
      const f=s.fixtures.find(x=>sql.includes(x.email)||x.id&&sql.includes(x.id));
      if(sql.includes('raw_app_meta_data'))return [{id:f.id,email:f.email,marker:runId,created_at:s.startedAt}];
      if(sql.includes('FROM public.profiles'))return [{id:f.id,email:f.email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null}];
      throw Error('unexpected_query');
    },
  });
  for(let i=0;i<3;i++){
    const f=s.fixtures[i];f.stage='create_intent';await port.create(f,'a'.repeat(40));f.id=ids[i];f.createdAt=s.startedAt;f.stage='created';
    assert.equal((await port.reconcile(f))[0].id,f.id);assert.equal((await port.profile(f)).id,f.id);
    const session=await port.login(f,'a'.repeat(40));assert.equal(session.token,`${f.label}.checked.jwt`);
    assert.equal((await port.verify(f)).id,f.id);
  }
  assert.equal(seen.filter(x=>x.url.endsWith('/auth/v1/admin/users')).length,3);
  assert.deepEqual(seen.filter(x=>x.url.endsWith('/auth/v1/user')).map(x=>x.headers.Authorization),['Bearer A.checked.jwt','Bearer B.checked.jwt','Bearer C.checked.jwt']);
});

test('CLI refuses unreviewed run and arbitrary cleanup flags before credential access',async()=>{
  await assert.rejects(main(['run']),/arguments/);
  await assert.rejects(main(['cleanup','--run-id',runId,'--force']),/arguments/);
});

test('cleanup reconciles a lost teardown acknowledgement and resumes exact object and Auth deletion',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-reader-recovery-'));
  const s=state();s.clear.stage='intent';s.revision=2;const j=await ReaderJournal.create(dir,s);
  const auth=new Set(ids),objects=new Set(s.objects.map(o=>o.key)),events=[];
  let metadata=true,first=true;
  const authRows=()=>s.fixtures.filter(f=>auth.has(f.id)).map(f=>({id:f.id,email:f.email,marker:runId,created_at:f.createdAt}));
  const inventory=()=>({auth:authRows(),profiles:metadata?s.fixtures.map(f=>({id:f.id,email:f.email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null})):[],friends:metadata?[{id:s.friendship.id,friend_1:ids[0],friend_2:ids[1],status:'accepted'}]:[],heads:metadata?[{owner_id:ids[0],revision:3,current_asset_id:null}]:[],operations:metadata?[...s.objects.slice(1).map((o,i)=>({owner_id:ids[0],operation_id:o.operationId,kind:'upload',expected_revision:i,state:i===2?'prepared':'completed',result_revision:i===2?null:i+1,asset_id:o.assetId,object_key:o.key,lease_epoch:1,input_sha256:o.sha256,normalized_sha256:o.sha256,transform_version:'synthetic-reader-fixture-v1',mime:'image/png',width:1,height:1,byte_count:o.byteCount})),{owner_id:ids[0],operation_id:s.clear.operationId,kind:'delete',expected_revision:2,state:'completed',result_revision:3,asset_id:null,object_key:null,lease_epoch:null,input_sha256:null,normalized_sha256:null,transform_version:null,mime:null,width:null,height:null,byte_count:null}]:[],objects:[...objects].map(name=>{const o=s.objects.find(x=>x.key===name);return {name,sha256:o.sha256,byte_count:o.byteCount,mime:'image/png'};}),protected:0});
  const sql=async(query,{write=false}={})=>{
    if(query.startsWith('WITH scoped'))return [{digest:pin}];
    if(query.includes('AS auth,')&&query.includes('AS profiles,'))return [inventory()];
    if(query.includes('AS owned'))return [{owned:true,auth:1,profile:0,protected:0,privateRows:0}];
    if(query.includes('FROM auth.users WHERE lower(email)')){const f=s.fixtures.find(x=>query.includes(x.email));return auth.has(f.id)?[{id:f.id,email:f.email,marker:runId,created_at:f.createdAt}]:[];}
    if(write&&query.includes('$reader_teardown$')){events.push('teardown');metadata=false;if(first){first=false;throw Error('lost_teardown_ack');}return [{remaining:0}];}
    if(query.includes('ORDER BY 1'))return s.baseline;
    throw Error('unexpected_sql');
  };
  const readback=async o=>objects.has(o.key)?{bytes:syntheticReaderBytes(o.label),mime:'image/png'}:null;
  const clean=async spec=>{
    if(spec.kind==='storage'){assert.equal(spec.method,'DELETE');objects.delete(spec.key);events.push(`delete-object:${spec.key}`);return {status:200};}
    assert.equal(spec.action,'delete');const f=s.fixtures.find(x=>x.label===spec.label);auth.delete(f.id);events.push(`delete-auth:${spec.label}`);return {status:200};
  };
  const dependencies={sql,readback,clean,catalog:async()=>pin,baseline:async()=>s.baseline};
  try{
    await assert.rejects(cleanupReader(j,dependencies),/lost_teardown_ack/);
    assert.equal(s.clear.stage,'completed');assert.equal(s.revision,3);
    assert.equal(s.teardown,'intent');assert.equal(auth.size,3);assert.equal(objects.size,4);
    await cleanupReader(j,dependencies);
    assert.equal(s.teardown,'done');assert.equal(auth.size,0);assert.equal(objects.size,0);
    assert.equal(events.filter(x=>x==='teardown').length,1);
    assert.equal(events.filter(x=>x.startsWith('delete-object')).length,4);
    assert.equal(events.filter(x=>x.startsWith('delete-auth')).length,3);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});

test('partial creation reconciles one Auth marker and removes its trigger profile before Auth deletion',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-reader-partial-'));
  const s=newReaderState(runId,{catalog:pin,backendCommit:'b'.repeat(40),adapterSha256:pin});
  s.fixtures[0].stage='create_intent';s.fixtures[0].createAttempts=1;
  const j=await ReaderJournal.create(dir,s);
  let profile=true,auth=true,creates=0;
  const candidate={id:ids[0],email:s.fixtures[0].email,marker:runId,created_at:s.startedAt};
  const sql=async(query,{write=false}={})=>{
    if(query.includes('FROM auth.users WHERE lower(email)'))return auth?[candidate]:[];
    if(query.includes('AS auth,')&&query.includes('AS profiles,'))return [{auth:auth?[candidate]:[],profiles:profile?[{id:ids[0],email:candidate.email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null}]:[],friends:[],heads:[],operations:[],objects:[],protected:0}];
    if(query.includes('AS owned'))return [{owned:true,auth:1,profile:profile?1:0,protected:0,privateRows:0}];
    if(write&&query.includes('$guarded_cleanup$')){profile=false;return [{remaining:0}];}
    throw Error('unexpected_sql');
  };
  try{
    await cleanupReader(j,{sql,readback:async()=>{throw Error('unexpected_storage');},clean:async spec=>{assert.equal(spec.action,'delete');assert.equal(profile,false);auth=false;return {status:200};},catalog:async()=>pin,baseline:async()=>{creates++;return [];}});
    assert.equal(s.fixtures[0].id,ids[0]);assert.equal(s.fixtures[0].stage,'cleaned');assert.equal(creates,0);
    assert.equal(profile,false);assert.equal(auth,false);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});

test('partial Auth cleanup preserves delete intent across failed acknowledgements and a later successful recovery',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-reader-partial-recovery-'));
  const s=newReaderState(runId,{catalog:pin,backendCommit:'b'.repeat(40),adapterSha256:pin});
  Object.assign(s.fixtures[0],{id:ids[0],createdAt:s.startedAt,stage:'created'});
  const j=await ReaderJournal.create(dir,s);let auth=true,dispatches=0;
  const candidate=()=>({id:ids[0],email:s.fixtures[0].email,marker:runId,created_at:s.startedAt});
  const sql=async query=>{
    if(query.includes('FROM auth.users WHERE lower(email)'))return auth?[candidate()]:[];
    if(query.includes('AS auth,')&&query.includes('AS profiles,'))return [{auth:auth?[candidate()]:[],profiles:[],friends:[],heads:[],operations:[],objects:[],protected:0}];
    if(query.includes('AS owned'))return [{owned:true,auth:1,profile:0,protected:0,privateRows:0}];
    throw Error('unexpected_sql');
  };
  const dependencies={sql,readback:async()=>{throw Error('unexpected_storage');},catalog:async()=>pin,baseline:async()=>{throw Error('unexpected_baseline');}};
  try{
    for(let epoch=0;epoch<3;epoch++){
      await j.mutate(next=>{next.counters.recoveries.push({id:randomUUID(),counts:{auth:0,data:0,storage:0,cli:0}});});
      const request=readerRequest({state:s,credentials:{publicKey:'sb_publishable_public_test_1234567890',secretKey:'sb_secret_private_test_1234567890'},save:async()=>j.save({}),phase:'recovery',fetchImpl:async()=>{dispatches++;if(dispatches<3)throw Error('lost_ack');auth=false;return new Response(null,{status:204});}});
      const run=cleanupReader(j,{...dependencies,clean:async spec=>{const response=await request(spec);return {status:response.status};}});
      if(epoch<2)await assert.rejects(run,/unavailable/);else await run;
      assert.equal(dispatches,epoch+1);
      assert.equal(s.fixtures[0].stage,epoch<2?'auth_delete_intent':'cleaned');
    }
    assert.equal(s.fixtures[0].deleteAttempts,3);assert.equal(auth,false);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});

test('cleanup reconciles a journaled lost reserve acknowledgement and removes its reserved operation',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-reader-reserve-'));
  const s=newReaderState(runId,{catalog:pin,backendCommit:'b'.repeat(40),adapterSha256:pin});s.stage='cleanup';s.baseline=TABLES.map(table=>({table,count:0,digest:pin}));
  for(let i=0;i<3;i++)Object.assign(s.fixtures[i],{id:ids[i],createdAt:s.startedAt,stage:'created'});
  s.objects[1].stage='reserve_intent';const j=await ReaderJournal.create(dir,s);
  let metadata=true;const auth=new Set(ids),asset=assets[0];
  const inventory=()=>({auth:s.fixtures.filter(f=>auth.has(f.id)).map(f=>({id:f.id,email:f.email,marker:runId,created_at:f.createdAt})),profiles:metadata?s.fixtures.map(f=>({id:f.id,email:f.email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null})):[],friends:[],heads:metadata?[{owner_id:ids[0],revision:0,current_asset_id:null}]:[],operations:metadata?[{owner_id:ids[0],operation_id:s.objects[1].operationId,kind:'upload',expected_revision:0,state:'reserved',result_revision:null,asset_id:asset,object_key:`${ids[0]}/${asset}`,lease_epoch:1,input_sha256:null,normalized_sha256:null,transform_version:null,mime:null,byte_count:null,width:null,height:null}]:[],objects:[],protected:0});
  const sql=async(query,{write=false}={})=>{
    if(query.includes('AS auth,')&&query.includes('AS profiles,'))return [inventory()];
    if(query.includes('AS owned'))return [{owned:true,auth:1,profile:0,protected:0,privateRows:0}];
    if(query.includes('FROM auth.users WHERE lower(email)')){const f=s.fixtures.find(x=>query.includes(x.email));return auth.has(f.id)?[{id:f.id,email:f.email,marker:runId,created_at:f.createdAt}]:[];}
    if(write&&query.includes('$reader_teardown$')){metadata=false;return [{remaining:0}];}
    throw Error('unexpected_sql');
  };
  try{
    await cleanupReader(j,{sql,readback:async()=>null,clean:async spec=>{assert.equal(spec.kind,'auth');auth.delete(s.fixtures.find(f=>f.label===spec.label).id);return {status:200};},catalog:async()=>pin,baseline:async()=>s.baseline});
    assert.equal(s.objects[1].assetId,asset);assert.equal(s.objects[1].stage,'deleted');assert.equal(auth.size,0);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});

test('cleanup reconciles a lost publish acknowledgement from the exact completed operation and head',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-reader-publish-'));
  const s=newReaderState(runId,{catalog:pin,backendCommit:'b'.repeat(40),adapterSha256:pin});s.stage='cleanup';s.baseline=TABLES.map(table=>({table,count:0,digest:pin}));
  for(let i=0;i<3;i++)Object.assign(s.fixtures[i],{id:ids[i],createdAt:s.startedAt,stage:'created'});
  const o=s.objects[1],photo=syntheticReaderBytes('G1');Object.assign(o,{stage:'publish_intent',assetId:assets[0],key:`${ids[0]}/${assets[0]}`,leaseEpoch:1,sha256:createHash('sha256').update(photo).digest('hex'),byteCount:photo.length,uploadAttempts:1});
  const j=await ReaderJournal.create(dir,s);let metadata=true,stored=true;const auth=new Set(ids);
  const inventory=()=>({auth:s.fixtures.filter(f=>auth.has(f.id)).map(f=>({id:f.id,email:f.email,marker:runId,created_at:f.createdAt})),profiles:metadata?s.fixtures.map(f=>({id:f.id,email:f.email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null})):[],friends:[],heads:metadata?[{owner_id:ids[0],revision:1,current_asset_id:assets[0]}]:[],operations:metadata?[{owner_id:ids[0],operation_id:o.operationId,kind:'upload',expected_revision:0,state:'completed',result_revision:1,asset_id:o.assetId,object_key:o.key,lease_epoch:1,input_sha256:o.sha256,normalized_sha256:o.sha256,transform_version:'synthetic-reader-fixture-v1',mime:'image/png',width:1,height:1,byte_count:o.byteCount}]:[],objects:stored?[{name:o.key}]:[],protected:0});
  const sql=async(query,{write=false}={})=>{
    if(query.includes('AS auth,')&&query.includes('AS profiles,'))return [inventory()];
    if(query.includes('AS owned'))return [{owned:true,auth:1,profile:0,protected:0,privateRows:0}];
    if(query.includes('FROM auth.users WHERE lower(email)')){const f=s.fixtures.find(x=>query.includes(x.email));return auth.has(f.id)?[{id:f.id,email:f.email,marker:runId,created_at:f.createdAt}]:[];}
    if(write&&query.includes('$reader_teardown$')){metadata=false;return [{remaining:0}];}
    throw Error('unexpected_sql');
  };
  try{
    await cleanupReader(j,{sql,readback:async()=>stored?{bytes:photo,mime:'image/png'}:null,clean:async spec=>{if(spec.kind==='storage')stored=false;else auth.delete(s.fixtures.find(f=>f.label===spec.label).id);return {status:200};},catalog:async()=>pin,baseline:async()=>s.baseline});
    assert.equal(s.revision,1);assert.equal(s.objects[1].stage,'deleted');assert.equal(auth.size,0);
    assert.match(await readFile(j.path,'utf8'),/"stage":"published"/);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});

test('journaled bind and prepare intents reconcile only matching reserved or prepared metadata',()=>{
  for(const step of ['bind','prepare']){
    const s=newReaderState(runId,{catalog:pin,backendCommit:'b'.repeat(40),adapterSha256:pin});s.fixtures[0].id=ids[0];s.fixtures[0].createdAt=s.startedAt;s.fixtures[0].stage='created';
    const o=s.objects[1],photo=syntheticReaderBytes('G1'),sha256=createHash('sha256').update(photo).digest('hex');
    Object.assign(o,{assetId:assets[0],key:`${ids[0]}/${assets[0]}`,leaseEpoch:1,sha256,byteCount:photo.length,stage:step==='bind'?'bind_intent':'prepare_intent'});
    const op={owner_id:ids[0],operation_id:o.operationId,kind:'upload',expected_revision:0,state:step==='bind'?'reserved':'prepared',result_revision:null,asset_id:o.assetId,object_key:o.key,lease_epoch:1,input_sha256:sha256,normalized_sha256:step==='bind'?null:sha256,transform_version:'synthetic-reader-fixture-v1',mime:step==='bind'?null:'image/png',width:step==='bind'?null:1,height:step==='bind'?null:1,byte_count:step==='bind'?null:photo.length};
    reconcileAuthority(s,{heads:[{owner_id:ids[0],revision:0,current_asset_id:null}],operations:[op]});
    assert.equal(o.stage,step==='bind'?'bound':'prepared');
    const changed=structuredClone(s);changed.objects[1].stage='prepare_intent';
    assert.throws(()=>reconcileAuthority(changed,{heads:[{owner_id:ids[0],revision:0,current_asset_id:null}],operations:[{...op,normalized_sha256:'f'.repeat(64)}]}),/authority_mismatch/);
  }
});

test('full cleanup refuses private cascade references before any Admin delete',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-reader-private-ref-'));
  const s=state();s.teardown='done';s.friendship.status='deleted';for(const f of s.fixtures)f.stage='profile_removed';for(const o of s.objects)o.stage='deleted';
  const j=await ReaderJournal.create(dir,s);let adminDeletes=0,inspections=0;
  const inventory=()=>({auth:s.fixtures.map(f=>({id:f.id,email:f.email,marker:runId,created_at:f.createdAt})),profiles:[],friends:[],heads:[],operations:[],objects:[],protected:0});
  const sql=async query=>{
    if(query.includes('AS auth,')&&query.includes('AS profiles,'))return [inventory()];
    if(query.includes('FROM auth.users WHERE lower(email)')){const f=s.fixtures.find(x=>query.includes(x.email));return [{id:f.id,email:f.email,marker:runId,created_at:f.createdAt}];}
    if(query.includes('AS owned')){inspections++;return [{owned:true,auth:1,profile:0,protected:0,privateRows:1}];}
    throw Error('unexpected_sql');
  };
  try{
    await assert.rejects(cleanupReader(j,{sql,readback:async()=>null,clean:async()=>{adminDeletes++;return {status:200};},catalog:async()=>pin,baseline:async()=>s.baseline}),/auth_protected_references/);
    assert.equal(inspections,1);assert.equal(adminDeletes,0);
  }finally{await j.close();await rm(dir,{recursive:true,force:true});}
});
