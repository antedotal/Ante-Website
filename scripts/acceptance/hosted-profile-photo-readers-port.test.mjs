import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { newReaderState, ReaderJournal, main } from './hosted-profile-photo-readers.mjs';
import { cleanupReader } from './hosted-profile-photo-readers-port.mjs';
import { TABLES } from './hosted-account-jwt-sql.mjs';

const pin='a'.repeat(64),runId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ids=['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
const assets=['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff','99999999-9999-4999-8999-999999999999'];
const bytes=new Uint8Array([137,80,78,71]);const digest=createHash('sha256').update(bytes).digest('hex');
const state=()=>{
  const s=newReaderState(runId,{catalog:pin,backendCommit:'b'.repeat(40),adapterSha256:pin});
  s.baseline=TABLES.map(table=>({table,count:0,digest:pin}));s.stage='cleanup';s.revision=3;s.clear.stage='completed';s.friendship.status='accepted';
  for(let i=0;i<3;i++)Object.assign(s.fixtures[i],{id:ids[i],createdAt:s.startedAt,stage:'created'});
  for(let i=0;i<4;i++)Object.assign(s.objects[i],{key:`${ids[0]}/${i===0?'avatar':assets[i-1]}`,assetId:i===0?null:assets[i-1],sha256:digest,byteCount:bytes.length,stage:i===0?'verified':i===3?'verified':'published'});
  return s;
};

test('CLI refuses unreviewed run and arbitrary cleanup flags before credential access',async()=>{
  await assert.rejects(main(['run']),/arguments/);
  await assert.rejects(main(['cleanup','--run-id',runId,'--force']),/arguments/);
});

test('cleanup reconciles a lost teardown acknowledgement and resumes exact object and Auth deletion',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ante-reader-recovery-'));
  const s=state(),j=await ReaderJournal.create(dir,s);
  const auth=new Set(ids),objects=new Set(s.objects.map(o=>o.key)),events=[];
  let metadata=true,first=true;
  const authRows=()=>s.fixtures.filter(f=>auth.has(f.id)).map(f=>({id:f.id,email:f.email,marker:runId,created_at:f.createdAt}));
  const inventory=()=>({auth:authRows(),profiles:metadata?s.fixtures.map(f=>({id:f.id,email:f.email,waitlist_status:'standard',stripe_customer_id:null,avatar_url:null})):[],friends:metadata?[{id:s.friendship.id,friend_1:ids[0],friend_2:ids[1],status:'accepted'}]:[],heads:metadata?[{owner_id:ids[0],revision:3,current_asset_id:null}]:[],operations:metadata?[...s.objects.slice(1).map((o,i)=>({owner_id:ids[0],operation_id:o.operationId,kind:'upload',expected_revision:i,state:i===2?'prepared':'completed',result_revision:i===2?null:i+1,asset_id:o.assetId,object_key:o.key,normalized_sha256:digest,mime:'image/png',byte_count:bytes.length})),{owner_id:ids[0],operation_id:s.clear.operationId,kind:'delete',expected_revision:2,state:'completed',result_revision:3,asset_id:null,object_key:null,normalized_sha256:null,mime:null,byte_count:null}]:[],objects:[...objects].map(name=>({name,sha256:digest,byte_count:bytes.length,mime:'image/png'})),protected:0});
  const sql=async(query,{write=false}={})=>{
    if(query.startsWith('WITH scoped'))return [{digest:pin}];
    if(query.includes('AS auth,')&&query.includes('AS profiles,'))return [inventory()];
    if(query.includes('FROM auth.users WHERE lower(email)')){const f=s.fixtures.find(x=>query.includes(x.email));return auth.has(f.id)?[{id:f.id,email:f.email,marker:runId,created_at:f.createdAt}]:[];}
    if(write&&query.includes('$reader_teardown$')){events.push('teardown');metadata=false;if(first){first=false;throw Error('lost_teardown_ack');}return [{remaining:0}];}
    if(query.includes('ORDER BY 1'))return s.baseline;
    throw Error('unexpected_sql');
  };
  const readback=async o=>objects.has(o.key)?{bytes,mime:'image/png'}:null;
  const clean=async spec=>{
    if(spec.kind==='storage'){assert.equal(spec.method,'DELETE');objects.delete(spec.key);events.push(`delete-object:${spec.key}`);return {status:200};}
    assert.equal(spec.action,'delete');const f=s.fixtures.find(x=>x.label===spec.label);auth.delete(f.id);events.push(`delete-auth:${spec.label}`);return {status:200};
  };
  const dependencies={sql,readback,clean,catalog:async()=>pin,baseline:async()=>s.baseline};
  try{
    await assert.rejects(cleanupReader(j,dependencies),/lost_teardown_ack/);
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
