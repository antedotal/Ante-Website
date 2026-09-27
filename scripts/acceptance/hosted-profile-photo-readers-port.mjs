// Fixed provider operations for the three-user reader fixture. Never imported by local safety tests.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ORIGIN, inspectConfig, dbQuery, reconcileCreate } from './hosted-account-jwt.mjs';
import { TABLES, catalogSql, preservationSql, collisionSql, reconcileSql, fixtureSql } from './hosted-account-jwt-sql.mjs';
import { readerRequest, assertOwnedInventory, cleanupDecision, reconcileAuthority, importReviewedAdapter } from './hosted-profile-photo-readers.mjs';
import { friendMutationSql, readerInventorySql, teardownSql } from './hosted-profile-photo-readers-sql.mjs';

const BACKEND='/Users/daniel/.codex/worktrees/ante-web-first-foundation/Ante';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(v,code)=>{if(!v)throw Error(code);};
const json=r=>{try{return JSON.parse(new TextDecoder().decode(r.bytes));}catch{throw Error('provider_json');}};
const ok=r=>{check(r.status>=200&&r.status<300,'provider_status');return json(r);};
const deny=r=>check([400,401,403,404,406].includes(r.status),'exposure');
const missingObject=r=>{
  if(r.status!==400&&r.status!==404)return false;
  let body;try{body=json(r);}catch{return false;}
  return body!==null&&typeof body==='object'&&!Array.isArray(body)&&(body.code==='NoSuchKey'||String(body.statusCode)==='404'&&body.message==='Object not found');
};

export function makeReaderPort(j,credentials,{fetchImpl=fetch,query=dbQuery,config=inspectConfig,adapter=importReviewedAdapter,recovery=false}={}) {
  const s=j.state,sessions={};
  const save=()=>j.save({});
  const run=readerRequest({state:s,credentials,sessions,save,fetchImpl,phase:'run'});
  const clean=readerRequest({state:s,credentials,sessions,save,fetchImpl,phase:recovery?'recovery':'cleanup'});
  async function sql(statement,{write=false,phase='run'}={}){
    const counts=phase==='cleanup'&&recovery?s.counters.recoveries.at(-1).counts:s.counters[phase];
    check(counts.cli<(phase==='run'?20:16)&&(recovery||s.counters.run.cli+s.counters.cleanup.cli<36),'cli_cap');
    if(phase==='run')check(Date.now()-Date.parse(s.startedAt)<=360_000,'test_deadline');
    counts.cli++;await save();return query(statement,{write});
  }
  const catalog=async phase=>{const rows=await sql(catalogSql,{phase});check(rows.length===1&&rows[0].digest===s.pins.catalog,'catalog_drift');return rows[0].digest;};
  const baseline=async phase=>{const rows=await sql(preservationSql(),{phase});check(rows.length===TABLES.length,'preservation_incomplete');return rows;};
  const rpc=(name,args,caller)=>({kind:'data',method:'POST',rpc:name,args,...(caller?{caller}:{service:true})});
  const photo=o=>({kind:'storage',method:'GET',key:o.key,service:true});
  const owner=()=>{check(s.fixtures[0].id,'missing_owner');return s.fixtures[0].id;};
  async function readback(o,phase='run'){
    const r=await (phase==='run'?run:clean)(photo(o));
    if(missingObject(r))return null;
    check(r.status===200,'storage_readback');
    const mime=r.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase();
    check(mime===o.mime&&r.bytes.length===o.byteCount&&hash(r.bytes)===o.sha256,'storage_manifest');
    return {bytes:r.bytes,mime};
  }
  const port={
    async preflight(){
      const digest=await catalog('run');
      check(s.counters.run.cli+2<=20,'cli_cap');s.counters.run.cli+=2;await save();check(await config()===true,'auth_config');
      const checks=await sql((await readFile(join(BACKEND,'supabase/releases/profile-photo-readers/postconditions.sql'),'utf8')));
      check(checks.length===6&&checks.every(row=>row.pass===true),'reader_postconditions');
      const collisions=await sql(collisionSql(s.fixtures));check(collisions.length===3&&collisions.every(x=>Number(x.count)===0),'fixture_collision');
      const probe=await run({kind:'auth',action:'probe',method:'GET'});check(probe.status===404,'admin_probe');
      const empty=await sql("SELECT (SELECT count(*)::int FROM storage.objects WHERE bucket_id='profile-photos') AS objects,(SELECT count(*)::int FROM profile_asset_private.heads) AS heads,(SELECT count(*)::int FROM profile_asset_private.operations) AS operations");
      check(empty.length===1&&Object.values(empty[0]).every(v=>Number(v)===0),'profile_inventory_not_empty');
      return {catalog:digest,baseline:await baseline('run')};
    },
    async create(f,password){const result=ok(await run({kind:'auth',action:'create',method:'POST',label:f.label,password}));check(result.id&&result.email===f.email,'create_result');return result;},
    reconcile:f=>sql(reconcileSql(f)),
    async profile(f){const rows=await sql(`SELECT id::text,email,waitlist_status,stripe_customer_id,avatar_url FROM public.profiles WHERE id='${f.id}'::uuid`);check(rows.length===1,'created_profile');return rows[0];},
    async login(f,password){const data=ok(await run({kind:'auth',action:'password',method:'POST',label:f.label,password}));check(typeof data.access_token==='string','login_failed');sessions[f.label]={token:data.access_token};return {token:data.access_token};},
    async verify(f){const data=ok(await run({kind:'auth',action:'user',method:'GET',label:f.label}));return {id:data.id};},
    async upload(o,bytes){const r=await run({kind:'storage',method:'POST',view:'upload',key:o.key,body:bytes,mime:o.mime,intent:`${o.label}-upload`,service:true});check(r.status>=200&&r.status<300,'storage_upload');},
    readback,
    async resolve(label){return ok(await run(rpc('resolve_profile_photo_v1',{p_owner:owner()},label)));},
    async get(label,key){const r=await run({kind:'storage',method:'GET',key,caller:label});if(r.status===200)return {kind:'found',bytes:r.bytes,mime:r.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()};deny(r);return {kind:'denied'};},
    async friend(action){await sql(friendMutationSql(s,action),{write:true});},
    reserve:(o,expected)=>run(rpc('reserve_profile_photo_v1',{p_owner:owner(),p_operation_id:o.operationId,p_expected_revision:expected})).then(ok),
    bind:o=>run(rpc('bind_profile_photo_input_v1',{p_owner:owner(),p_operation_id:o.operationId,p_lease_epoch:o.leaseEpoch,p_input_sha256:`\\x${o.sha256}`,p_transform_version:'synthetic-reader-fixture-v1'})).then(ok),
    prepare:(o)=>run(rpc('prepare_profile_photo_v1',{p_owner:owner(),p_operation_id:o.operationId,p_lease_epoch:o.leaseEpoch,p_input_sha256:`\\x${o.sha256}`,p_normalized_sha256:`\\x${o.sha256}`,p_mime:o.mime,p_width:1,p_height:1,p_byte_count:o.byteCount,p_transform_version:'synthetic-reader-fixture-v1'})).then(ok),
    async store(prepared,bytes,o){
      const {storePreparedProfilePhoto}=await adapter(s.pins);
      let sent=false;
      const fetcher=async(url,init)=>{
        const method=init.method;
        check(new URL(url).origin===ORIGIN,'adapter_origin');
        if(method==='POST'){
          check(!sent&&new URL(url).pathname===`/storage/v1/object/profile-photos/${o.key}`&&init.body instanceof Uint8Array&&hash(init.body)===o.sha256,'adapter_boundary');sent=true;
          const r=await run({kind:'storage',method:'POST',view:'upload',key:o.key,body:init.body,mime:o.mime,intent:`${o.label}-upload`,service:true});return new Response(r.bytes,{status:r.status,headers:r.headers});
        }
        check(method==='GET'&&new URL(url).pathname===`/storage/v1/object/authenticated/profile-photos/${o.key}`,'adapter_boundary');
        const r=await run(photo(o));return new Response(r.bytes,{status:r.status,headers:r.headers});
      };
      const result=await storePreparedProfilePhoto({prepared,bytes,projectUrl:ORIGIN,credential:credentials.secretKey,fetcher});
      check(sent,'adapter_not_dispatched');return result;
    },
    publish:o=>run(rpc('publish_profile_photo_v1',{p_owner:owner(),p_operation_id:o.operationId,p_lease_epoch:o.leaseEpoch})).then(ok),
    clear:c=>run(rpc('clear_profile_photo_v1',{p_owner:owner(),p_operation_id:c.operationId,p_expected_revision:s.revision})).then(ok),
    async exposure(_state,g2){
      deny(await run(rpc('profile_photo_state_v1',{p_owner:owner()},'A')));
      deny(await run(rpc('profile_photo_state_v1',{p_owner:owner()},'anon')));
      deny(await run(rpc('resolve_profile_photo_v1',{p_owner:owner()},'anon')));
      for(const table of ['heads','operations'])deny(await run({kind:'table',method:'GET',table,caller:'A'}));
      deny(await run({kind:'storage',method:'GET',key:g2.key,caller:'anon'}));
      for(const view of ['sign','public','render'])deny(await run({kind:'storage',method:view==='sign'?'POST':'GET',view,key:g2.key,caller:'A'}));
      const listed=await run({kind:'storage',method:'POST',view:'list',key:g2.key,caller:'A'});
      check(listed.status===200&&Array.isArray(json(listed))&&json(listed).length===0,'storage_listing');
    },
    async cleanup(){await cleanupReader(j,{sql,readback,clean,catalog,baseline,sessions});},
  };
  return port;
}

// Recovery uses the journaled identities; it never reissues a creation or upload.
export async function cleanupReader(j,{sql,readback,clean,catalog,baseline}){
  const s=j.state;
  const verified=new Map();
  await catalog('cleanup');
  for(const f of s.fixtures)if(f.stage==='create_intent'&&!f.id){
    const rows=await sql(reconcileSql(f),{phase:'cleanup'});
    const owned=reconcileCreate(f,rows,s.runId,s.startedAt);
    await j.mutate(next=>{next.fixtures['ABC'.indexOf(f.label)]=owned;});
  }
  const ids=s.fixtures.filter(f=>f.id);
  const deleteAuth=async()=>{
    for(let i=0;i<3;i++){
      const f=s.fixtures[i];if(!f.id||f.stage==='cleaned')continue;
      const candidates=await sql(reconcileSql(f),{phase:'cleanup'});
      if(candidates.length===0&&f.stage==='auth_delete_intent'){await j.mutate(next=>{next.fixtures[i].stage='cleaned';});continue;}
      check(candidates.length===1,'auth_ownership');reconcileCreate(f,candidates,s.runId,s.startedAt);
      const [proof]=await sql(fixtureSql(f,s.runId,s.startedAt).inspect,{phase:'cleanup'});
      check(proof?.owned===true&&Number(proof.auth)===1&&Number(proof.profile)===0&&Number(proof.protected)===0&&Number(proof.privateRows)===0,'auth_protected_references');
      await j.mutate(next=>{next.fixtures[i].stage='auth_delete_intent';});
      const r=await clean({kind:'auth',action:'delete',method:'DELETE',label:f.label});check(r.status>=200&&r.status<300,'auth_delete');
      check((await sql(reconcileSql(f),{phase:'cleanup'})).length===0,'auth_delete_unconfirmed');
      await j.mutate(next=>{next.fixtures[i].stage='cleaned';});
    }
  };
  if(ids.length<3){
    check(s.objects.every(o=>o.key===null)&&s.friendship.status==='planned'&&s.clear.stage==='planned'&&s.revision===0,'partial_creation_unresolved');
    if(ids.length){
      const [found]=await sql(readerInventorySql(s),{phase:'cleanup'});
      assertOwnedInventory(s,found);
      const present=new Set(found.auth.map(row=>row.id));
      check(found.auth.length===present.size&&found.friends.length===0&&found.heads.length===0&&found.operations.length===0&&found.objects.length===0&&found.protected===0&&found.profiles.every(p=>present.has(p.id)),'partial_references');
      for(const f of ids)check(present.has(f.id)?f.stage!=='cleaned':f.stage==='cleaned'||f.stage==='auth_delete_intent'&&f.deleteAttempts>0,'partial_references');
      for(const f of ids.filter(f=>present.has(f.id))){
        const [proof]=await sql(fixtureSql(f,s.runId,s.startedAt).inspect,{phase:'cleanup'});
        check(proof.owned===true&&Number(proof.auth)===1&&Number(proof.protected)===0&&Number(proof.privateRows)===0,'partial_ownership');
        if(Number(proof.profile)===1){await j.mutate(next=>{next.teardown='intent';});await sql(fixtureSql(f,s.runId,s.startedAt,s.pins.catalog).remove,{phase:'cleanup',write:true});}
        if(f.stage==='created')await j.mutate(next=>{next.fixtures.find(x=>x.label===f.label).stage='profile_removed';});
      }
      await deleteAuth();
    }
    if(s.baseline){const after=await baseline('cleanup');await j.mutate(next=>{next.after=after;});check(JSON.stringify(after)===JSON.stringify(s.baseline),'preservation_drift');}
    return;
  }
  const inventory=async()=>{
    const [row]=await sql(readerInventorySql(s),{phase:'cleanup'});check(row,'inventory_missing');
    for(const obj of row.objects){
      const o=s.objects.find(x=>x.key===obj.name);check(o,'unknown_object');
      const result=await readback(o,'cleanup');check(result,'object_missing');
      Object.assign(obj,{sha256:hash(result.bytes),byte_count:result.bytes.length,mime:result.mime});
      verified.set(o.key,result);
    }
    return row;
  };
  if(s.teardown!=='done'){
    const found=await inventory();check(found.protected===0,'protected_references');
    const metadataAbsent=found.profiles.length===0&&found.friends.length===0&&found.heads.length===0&&found.operations.length===0;
    if(!metadataAbsent)await j.mutate(next=>{
      reconcileAuthority(next,found);
      for(const o of next.objects)if(['upload_intent','upload_uncertain'].includes(o.stage)&&o.uploadAttempts>0&&found.objects.some(x=>x.name===o.key))o.stage='verified';
    });
    check(cleanupDecision(s,found)==='ready','cleanup_uncertain');
    if(s.teardown==='intent'&&metadataAbsent){
      check(found.auth.length===3,'teardown_reconcile');
    }else{
      check(found.auth.length===3&&found.profiles.length===3,'teardown_ownership');
      await j.mutate(next=>{next.teardown='intent';next.friendship.status='delete_intent';});
      await sql(teardownSql(s),{write:true,phase:'cleanup'});
    }
    await j.mutate(next=>{next.teardown='done';next.friendship.status='deleted';for(const f of next.fixtures)f.stage='profile_removed';});
  }
  const [metadata]=await sql(readerInventorySql(s),{phase:'cleanup'});
  check(metadata.profiles.length===0&&metadata.friends.length===0&&metadata.heads.length===0&&metadata.operations.length===0&&metadata.protected===0,'metadata_remaining');
  for(const obj of metadata.objects){
    const o=s.objects.find(x=>x.key===obj.name);check(o,'unknown_object');
    const rb=verified.get(o.key)??await readback(o,'cleanup');check(rb,'object_missing');
    verified.set(o.key,rb);
    Object.assign(obj,{sha256:hash(rb.bytes),byte_count:rb.bytes.length,mime:rb.mime});
  }
  assertOwnedInventory(s,metadata);
  for(let i=0;i<s.objects.length;i++){
    const o=s.objects[i];if(!o.key)continue;
    const rb=verified.get(o.key)??(o.stage==='deleted'||o.stage==='delete_intent'?await readback(o,'cleanup'):null);
    if(o.stage==='deleted'){check(rb===null&&!metadata.objects.some(x=>x.name===o.key),'deleted_object_reappeared');continue;}
    if(!rb&&o.uploadAttempts===0&&!metadata.objects.some(x=>x.name===o.key)){
      await j.mutate(next=>{next.objects[i].stage='deleted';});continue;
    }
    if(!rb&&o.stage==='delete_intent'&&o.deleteAttempts>0&&!metadata.objects.some(x=>x.name===o.key)){
      await j.mutate(next=>{next.objects[i].stage='deleted';});continue;
    }
    check(rb,'object_missing');
    await j.mutate(next=>{next.objects[i].stage='delete_intent';});
    const r=await clean({kind:'storage',method:'DELETE',key:o.key,intent:`${o.label}-delete`,service:true});
    check(r.status>=200&&r.status<300,'object_delete');
    check(await readback(o,'cleanup')===null,'object_delete_unconfirmed');
    await j.mutate(next=>{next.objects[i].stage='deleted';});
  }
  const [afterObjects]=await sql(readerInventorySql(s),{phase:'cleanup'});
  check(afterObjects.objects.length===0&&afterObjects.profiles.length===0&&afterObjects.friends.length===0&&afterObjects.heads.length===0&&afterObjects.operations.length===0,'references_remaining');
  await deleteAuth();
  const fingerprint=await baseline('cleanup');
  await j.mutate(next=>{next.after=fingerprint;});
  check(JSON.stringify(fingerprint)===JSON.stringify(s.baseline),'preservation_drift');
}
