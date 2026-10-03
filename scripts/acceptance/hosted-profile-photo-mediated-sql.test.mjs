// Real PostgreSQL tests catch destructive guards that a query-string assertion would miss.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { withDisposablePostgres, psql, docker, pause } from '../../../Ante/scripts/backend/integration/disposable-postgres.mjs';
import { newMediatedState, reserveDispatch } from './hosted-profile-photo-mediated.mjs';
import { TABLES, catalogSql, preservationSql } from './hosted-account-jwt-sql.mjs';
import * as sql from './hosted-profile-photo-mediated-sql.mjs';
const pins={websiteCommit:'a'.repeat(40),backendCommit:'b'.repeat(40),adapterSha256:'c'.repeat(64),releaseSha256:'d'.repeat(64),catalog:'e'.repeat(64),ordinaryBundleSha256:'f'.repeat(64),acceptanceBundleSha256:'1'.repeat(64),origin:'https://fixture.example.invalid',deploymentId:'local',cacheReceiptSha256:'2'.repeat(64),quiescenceReceiptSha256:'3'.repeat(64)};
const ident=t=>t.split('.').map(x=>'"'+x+'"').join('.');
async function setup(t){
  const c=await withDisposablePostgres(t,'mediated-sql');
  await psql(c,`CREATE SCHEMA auth;CREATE SCHEMA profile_asset_private;CREATE SCHEMA storage;CREATE SCHEMA profile_name_private;CREATE SCHEMA ante_presets_private;CREATE SCHEMA website_callback_private;
  CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_app_meta_data jsonb,created_at timestamptz);
  CREATE TABLE public.profiles(id uuid PRIMARY KEY,email text,waitlist_status text,stripe_customer_id text,avatar_url text);
  CREATE TABLE public."friend pairs"(id uuid PRIMARY KEY,friend_1 uuid,friend_2 uuid,status text);
  CREATE TABLE profile_asset_private.heads(owner_id uuid,revision bigint,current_asset_id uuid);
  CREATE TABLE profile_asset_private.operations(owner_id uuid,operation_id uuid,kind text,asset_id uuid,object_key text,lease_epoch bigint,input_sha256 bytea,normalized_sha256 bytea,transform_version text,mime text,width int,height int,byte_count int,state text,expected_revision bigint,result_revision bigint);
  CREATE TABLE storage.objects(bucket_id text,name text,owner uuid,owner_id text);
  CREATE TABLE public.tasks(user_id uuid);CREATE TABLE public."tasks to verify"("sent by" uuid);
  CREATE TABLE public.payment_methods(user_id uuid);CREATE TABLE public.payment_holds(user_id uuid);CREATE TABLE public.notifications(user_id uuid,related_user_id uuid);
  CREATE TABLE profile_name_private.owner_limits(owner_id uuid);CREATE TABLE ante_presets_private.owner_presets(owner_id uuid);
  CREATE TABLE storage.s3_multipart_uploads(owner_id text,key text);CREATE TABLE storage.s3_multipart_uploads_parts(owner_id text,key text);
  CREATE TABLE storage.buckets(id text,owner uuid,owner_id text);
  CREATE TABLE website_callback_private.admissions(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,visitor_hash text,admitted_at timestamptz);`);
  for(const name of TABLES)if(await psql(c,`SELECT to_regclass('${ident(name)}') IS NULL`)==='t')await psql(c,`CREATE TABLE ${ident(name)}(sentinel text)`);
  await psql(c,`INSERT INTO public.waitlist VALUES ('unrelated-sentinel');INSERT INTO storage.buckets VALUES ('unrelated-bucket',null,null)`);
  const s=newMediatedState(randomUUID(),pins);s.pins.catalog=await psql(c,catalogSql);
  return {c,s};
}
async function add(c,s,count){for(let i=0;i<count;i++){const f=s.fixtures[i];Object.assign(f,{id:randomUUID(),createdAt:s.startedAt,stage:'created',createAttempts:1});await psql(c,`INSERT INTO auth.users VALUES ('${f.id}','${f.email}','{"acceptance_run":"${s.runId}"}','${f.createdAt}');INSERT INTO profiles VALUES ('${f.id}','${f.email}','standard',null,null)`);}}
const query=(c,q)=>psql(c,`SELECT row_to_json(r) FROM (${q}) r`).then(x=>JSON.parse(x));
const mutate=(c,q)=>psql(c,`BEGIN;${q};COMMIT;`);

test('partial one/two/three-user teardown preserves all 22 unrelated table fingerprints',async t=>{
 const {c,s}=await setup(t);const before=await psql(c,preservationSql());assert.equal(before.split('\n').length,22);
 for(const count of [1,2,3]){const state=structuredClone(s);await add(c,state,count);await mutate(c,sql.mediatedTeardownSql(state));assert.equal(await psql(c,preservationSql()),before);assert.equal(await psql(c,'SELECT count(*) FROM auth.users'),String(count));await psql(c,'DELETE FROM auth.users');}
});

test('foreign identity, profile, protected refs, objects and multipart rows block every mutation',async t=>{
 const {c,s}=await setup(t);await add(c,s,3);await mutate(c,sql.mediatedFriendSql(s,'insert'));s.friendship.stage='accepted';
 const a=s.fixtures[0];
 const cases=[
  [`UPDATE auth.users SET raw_app_meta_data='{}' WHERE id='${a.id}'`,`UPDATE auth.users SET raw_app_meta_data='{"acceptance_run":"${s.runId}"}'`],
  [`UPDATE auth.users SET email='foreign@invalid' WHERE id='${a.id}'`,`UPDATE auth.users SET email='${a.email}' WHERE id='${a.id}'`],
  [`UPDATE auth.users SET created_at=created_at+interval '1 day' WHERE id='${a.id}'`,`UPDATE auth.users SET created_at='${a.createdAt}' WHERE id='${a.id}'`],
  [`UPDATE profiles SET avatar_url='foreign' WHERE id='${a.id}'`,`UPDATE profiles SET avatar_url=null`],
  [`INSERT INTO payment_holds VALUES ('${a.id}')`,'DELETE FROM payment_holds'],
  [`INSERT INTO ante_presets_private.owner_presets VALUES ('${a.id}')`,'DELETE FROM ante_presets_private.owner_presets'],
  [`INSERT INTO profile_name_private.owner_limits VALUES ('${a.id}')`,'DELETE FROM profile_name_private.owner_limits'],
  [`INSERT INTO storage.objects VALUES ('other','elsewhere','${a.id}',null)`,'DELETE FROM storage.objects'],
  [`INSERT INTO storage.objects VALUES ('profile-photos','${a.id}/foreign',null,null)`,'DELETE FROM storage.objects'],
  [`INSERT INTO storage.s3_multipart_uploads VALUES (null,'${a.id}/foreign')`,'DELETE FROM storage.s3_multipart_uploads'],
  [`INSERT INTO storage.s3_multipart_uploads_parts VALUES ('${a.id}','foreign')`,'DELETE FROM storage.s3_multipart_uploads_parts'],
 ];
 for(const [bad,repair] of cases){await psql(c,bad);const before=await psql(c,preservationSql());await assert.rejects(mutate(c,sql.mediatedTeardownSql(s)));assert.equal(await psql(c,preservationSql()),before);await psql(c,repair);}
 await mutate(c,sql.mediatedFriendSql(s,'reject'));s.friendship.stage='rejected';await mutate(c,sql.mediatedFriendSql(s,'restore'));s.friendship.stage='accepted_again';await mutate(c,sql.mediatedTeardownSql(s));
});

test('fixture reconciliation combines exact safe Auth/profile/reference evidence including unbound create',async t=>{
 const {c,s}=await setup(t);await add(c,s,1);const id=s.fixtures[0].id;Object.assign(s.fixtures[0],{id:null,createdAt:null,stage:'create_uncertain'});
 const row=await query(c,sql.mediatedFixtureSql(s,'A'));assert.equal(row.auth[0].id,id);assert.equal(row.profiles[0].id,id);assert.equal(row.protected,0);
 await psql(c,`INSERT INTO storage.objects VALUES ('other','foreign','${id}',null)`);assert.equal((await query(c,sql.mediatedFixtureSql(s,'A'))).references,1);
});

test('admission cleanup rejects unknown or changed rows, allows expiry, preserves bigint precision and sequence',async t=>{
 const {c,s}=await setup(t);s.preparation={...s.preparation,stage:'complete',visitorDigest:'1'.repeat(64),userDigests:['2'.repeat(64),'3'.repeat(64),'4'.repeat(64)]};
 const j={state:s,async mutate(fn){fn(this.state);}};await reserveDispatch(j,'run',{kind:'photo',caseId:1});
 s.baseline=TABLES.map(table=>({table,count:0,digest:'a'.repeat(64)}));const d=s.preparation.visitorDigest;s.cleanupStartedAt=new Date().toISOString();
 await psql(c,`INSERT INTO website_callback_private.admissions(visitor_hash,admitted_at) VALUES ('${d}','${s.startedAt}')`);
 const rows=JSON.parse(await psql(c,`SELECT coalesce(json_agg(r),'[]') FROM (${sql.mediatedAdmissionsSql(s,'inspect')}) r`));assert.equal(rows[0].id,'1');s.admissionRows=rows;
 const before=await psql(c,preservationSql());await psql(c,`INSERT INTO website_callback_private.admissions(visitor_hash,admitted_at) VALUES ('${'9'.repeat(64)}','${s.startedAt}')`);
 await assert.rejects(mutate(c,sql.mediatedAdmissionsSql(s,'delete')));assert.equal(await psql(c,'SELECT count(*) FROM website_callback_private.admissions'),'2');await psql(c,`DELETE FROM website_callback_private.admissions WHERE visitor_hash<>'${d}'`);assert.equal(await psql(c,preservationSql()),before);
 await psql(c,`UPDATE website_callback_private.admissions SET admitted_at=admitted_at-interval '1 day'`);await assert.rejects(mutate(c,sql.mediatedAdmissionsSql(s,'delete')));await psql(c,`UPDATE website_callback_private.admissions SET admitted_at='${s.startedAt}'`);
 await mutate(c,sql.mediatedAdmissionsSql(s,'delete'));assert.equal(await psql(c,'SELECT count(*) FROM website_callback_private.admissions'),'0');assert.equal(await psql(c,'SELECT last_value FROM website_callback_private.admissions_id_seq'),'2');
 // Scheduled expiry is represented by a previously observed row disappearing; it is never recreated.
 await mutate(c,sql.mediatedAdmissionsSql(s,'delete'));assert.equal(await psql(c,'SELECT last_value FROM website_callback_private.admissions_id_seq'),'2');
});

import { createHash } from 'node:crypto';
import { validateMediatedHistory } from './hosted-profile-photo-mediated.mjs';
import { cleanupMediated } from './hosted-profile-photo-mediated-cleanup.mjs';
import { syntheticReaderBytes } from './hosted-profile-photo-readers.mjs';

// The fixture schema mirrors production authority columns and admissions bigint identity. Real
// generated SQL executes in PostgreSQL; only the external Auth/Storage service endpoints are simulated.
test('actual SQL reconciles lost create/reserve/bind/prepare/publish/clear acknowledgements and exact revisions',async t=>{
 const {c,s:base}=await setup(t);
 const baseline=JSON.parse(await psql(c,`SELECT json_agg(r) FROM (${preservationSql()}) r`));
 for(const boundary of ['create','reserve','bind','prepare','upload','publish','clear']){
  const s=structuredClone(base);s.baseline=baseline;await add(c,s,boundary==='create'?1:3);
  if(boundary!=='create'){
   const owner=s.fixtures[0].id,count=boundary==='clear'?2:1;
   for(let i=0;i<count;i++){
    const o=s.objects[i],bytes=syntheticReaderBytes(o.label);Object.assign(o,{assetId:randomUUID(),leaseEpoch:1,sha256:createHash('sha256').update(bytes).digest('hex'),byteCount:bytes.length});o.key=`${owner}/${o.assetId}`;
    const state=['reserve','bind'].includes(boundary)?'reserved':['prepare','upload'].includes(boundary)?'prepared':'completed';
    const bound=boundary!=='reserve',prepared=state!=='reserved';o.stage=boundary==='clear'?'published':`${boundary}_uncertain`;o.uploadAttempts=['upload','publish','clear'].includes(boundary)?1:0;
    await psql(c,`INSERT INTO profile_asset_private.operations(owner_id,operation_id,kind,asset_id,object_key,lease_epoch,input_sha256,normalized_sha256,transform_version,mime,width,height,byte_count,state,expected_revision,result_revision) VALUES ('${owner}','${o.operationId}','upload','${o.assetId}','${o.key}',1,${bound?`decode('${o.sha256}','hex')`:'null'},${prepared?`decode('${o.sha256}','hex')`:'null'},${bound?"'synthetic-mediated-reader-v1'":'null'},${prepared?"'image/png',1,1,"+o.byteCount:'null,null,null,null'},'${state}',${i},${state==='completed'?i+1:'null'})`);
    if(o.uploadAttempts)await psql(c,`INSERT INTO storage.objects VALUES ('profile-photos','${o.key}',null,null)`);
    if(boundary==='reserve')Object.assign(o,{assetId:null,key:null,leaseEpoch:null,sha256:null,byteCount:null});
   }
   const actualRevision=['publish','clear'].includes(boundary)?count:0;s.revision=boundary==='clear'?2:0;
   await psql(c,`INSERT INTO profile_asset_private.heads VALUES ('${owner}',${boundary==='clear'?3:actualRevision},${actualRevision&&boundary!=='clear'?`'${s.objects[count-1].assetId}'`:'null'})`);
   if(boundary==='clear'){s.clear.stage='uncertain';await psql(c,`INSERT INTO profile_asset_private.operations(owner_id,operation_id,kind,state,expected_revision,result_revision) VALUES ('${owner}','${s.clear.operationId}','delete','completed',2,3)`);}
  }else Object.assign(s.fixtures[0],{id:null,createdAt:null,stage:'create_uncertain'});
  const j={state:s,async mutate(fn){const next=structuredClone(this.state);fn(next);validateMediatedHistory(this.state,next);this.state=next;}};
  const calls=[];const query=async(statement,{write,slot})=>{calls.push(slot);if(write){await mutate(c,statement);return [{remaining:0}];}return JSON.parse(await psql(c,`SELECT coalesce(json_agg(r),'[]') FROM (${statement}) r`));};
  const http={async dispatch(d,phase){await reserveDispatch(j,phase,d);calls.push(d.kind);if(d.kind==='authDelete'){const f=j.state.fixtures.find(f=>f.label===d.label);await psql(c,`DELETE FROM auth.users WHERE id='${f.id}'`);return {status:204};}const o=j.state.objects.find(o=>o.label===d.label);if(d.kind==='storageDelete'){await psql(c,`DELETE FROM storage.objects WHERE bucket_id='profile-photos' AND name='${o.key}'`);return {status:200};}const present=await psql(c,`SELECT count(*) FROM storage.objects WHERE bucket_id='profile-photos' AND name='${o.key}'`);return present==='1'?{status:200,bytes:syntheticReaderBytes(o.label),headers:new Headers({'content-type':'image/png'})}:{status:404,bytes:new TextEncoder().encode('{"code":"NoSuchKey"}'),headers:new Headers({'content-type':'application/json'})};}};
  await cleanupMediated(j,{sql:query,http});assert.equal(j.state.cleanupComplete,true,boundary);assert.equal(j.state.revision,boundary==='clear'?3:boundary==='publish'?1:0);assert.equal(await psql(c,preservationSql()),await psql(c,`SELECT "table",count,digest FROM jsonb_to_recordset('${JSON.stringify(baseline)}'::jsonb) AS r("table" text,count int,digest text) ORDER BY 1`));assert.ok(j.state.counters.cleanup.cli<=20);assert.ok(calls.filter(x=>x==='storageDelete').length<=2);
 }
});

test('admission deletion refuses pre-existing digests, excess reservations, changed known fields and unknown IDs',async t=>{
 const {c,s}=await setup(t);s.baseline=TABLES.map(table=>({table,count:0,digest:'a'.repeat(64)}));s.preparation={...s.preparation,stage:'complete',visitorDigest:'1'.repeat(64),userDigests:['2'.repeat(64),'3'.repeat(64),'4'.repeat(64)]};
 const j={state:s,async mutate(fn){fn(this.state);}};await reserveDispatch(j,'run',{kind:'photo',caseId:1});s.cleanupStartedAt=new Date().toISOString();
 const insert=async(digest,at=s.startedAt)=>psql(c,`INSERT INTO website_callback_private.admissions(visitor_hash,admitted_at) VALUES ('${digest}','${at}')`);
 const read=()=>psql(c,`SELECT coalesce(json_agg(r),'[]') FROM (${sql.mediatedAdmissionsSql(s,'inspect')}) r`).then(JSON.parse);
 await insert(s.preparation.visitorDigest);s.admissionRows=await read();
 for(const mutation of [
  `UPDATE website_callback_private.admissions SET visitor_hash='${s.preparation.userDigests[0]}'`,
  `UPDATE website_callback_private.admissions SET admitted_at=admitted_at+interval '1 second'`,
  `INSERT INTO website_callback_private.admissions(visitor_hash,admitted_at) VALUES ('${s.preparation.visitorDigest}','${s.startedAt}')`,
  `INSERT INTO website_callback_private.admissions(visitor_hash,admitted_at) VALUES ('${'9'.repeat(64)}','${s.startedAt}')`,
 ]){await psql(c,`BEGIN;${mutation};COMMIT;`);const before=await psql(c,preservationSql());await assert.rejects(mutate(c,sql.mediatedAdmissionsSql(s,'delete')));assert.equal(await psql(c,preservationSql()),before);await psql(c,`DELETE FROM website_callback_private.admissions WHERE id<>1;UPDATE website_callback_private.admissions SET visitor_hash='${s.preparation.visitorDigest}',admitted_at='${s.startedAt}'`);}
 await insert(s.preparation.visitorDigest);s.admissionRows=await read();await assert.rejects(mutate(c,sql.mediatedAdmissionsSql(s,'delete')),/count/);
 s.baseline.find(r=>r.table==='website_callback_private.admissions').count=1;assert.throws(()=>sql.mediatedAdmissionsSql(s,'delete'),/baseline/);
});

test('missing created profile, wrong head revision and unknown operation prevent teardown atomically',async t=>{
 const {c,s}=await setup(t);await add(c,s,3);const a=s.fixtures[0];
 await psql(c,`DELETE FROM profiles WHERE id='${a.id}'`);const before=await psql(c,preservationSql());await assert.rejects(mutate(c,sql.mediatedTeardownSql(s)));assert.equal(await psql(c,preservationSql()),before);
 await psql(c,`INSERT INTO profiles VALUES ('${a.id}','${a.email}','standard',null,null);INSERT INTO profile_asset_private.heads VALUES ('${a.id}',99,null)`);await assert.rejects(mutate(c,sql.mediatedTeardownSql(s)),/head/);
 await psql(c,`DELETE FROM profile_asset_private.heads;INSERT INTO profile_asset_private.operations(owner_id,operation_id,kind) VALUES ('${a.id}','${randomUUID()}','upload')`);await assert.rejects(mutate(c,sql.mediatedTeardownSql(s)),/operation/);assert.equal(await psql(c,'SELECT count(*) FROM profiles'),'3');
});

test('admission cleanup uses production digest advisory locks and a lock timeout preserves rows',async t=>{
 const {c,s}=await setup(t);s.baseline=TABLES.map(table=>({table,count:0,digest:'a'.repeat(64)}));s.preparation={...s.preparation,stage:'complete',visitorDigest:'1'.repeat(64),userDigests:['2'.repeat(64),'3'.repeat(64),'4'.repeat(64)]};const j={state:s,async mutate(fn){fn(this.state);}};await reserveDispatch(j,'run',{kind:'photo',caseId:1});s.cleanupStartedAt=new Date().toISOString();
 await psql(c,`INSERT INTO website_callback_private.admissions(visitor_hash,admitted_at) VALUES ('${s.preparation.visitorDigest}','${s.startedAt}')`);s.admissionRows=JSON.parse(await psql(c,`SELECT json_agg(r) FROM (${sql.mediatedAdmissionsSql(s,'inspect')}) r`));
 const holder=docker(['exec',c,'psql','-X','-q','-U','postgres','-c',`BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('${s.preparation.visitorDigest}',0));SELECT pg_sleep(2);COMMIT;`]);
 try{let ready=false;for(let i=0;i<100;i++){if(await psql(c,"SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted")!=='0'){ready=true;break;}await pause(10);}assert.equal(ready,true);const before=await psql(c,preservationSql());await assert.rejects(psql(c,`BEGIN;SET LOCAL lock_timeout='50ms';${sql.mediatedAdmissionsSql(s,'delete')};COMMIT;`),/lock timeout/);assert.equal(await psql(c,preservationSql()),before);}finally{await holder;}
 await mutate(c,sql.mediatedAdmissionsSql(s,'delete'));assert.equal(await psql(c,'SELECT count(*) FROM website_callback_private.admissions'),'0');
});
