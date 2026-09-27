// Fixed descriptor-to-request adapter. Secrets remain in closures; imports perform no provider I/O.
import { createHash } from 'node:crypto';
import https from 'node:https';
import { Readable } from 'node:stream';
import { ORIGIN, validateCredentials } from './hosted-account-jwt.mjs';
import { syntheticReaderBytes } from './hosted-profile-photo-readers.mjs';
import { reserveDispatch } from './hosted-profile-photo-mediated.mjs';
import { DIRECT_VIEWS, PHOTO_CASES } from './hosted-profile-photo-mediated-protocol.mjs';
import { sessionCookies, cookieHeader, applyResponseCookies, sessionFromCookies } from './hosted-profile-photo-mediated-cookies.mjs';

const need=(ok,reason='request_boundary')=>{if(!ok)throw Error(reason);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const cancel=body=>{try{void body?.cancel().catch(()=>{});}catch{/* A rejected/hostile cancellation cannot extend a deadline. */}};

// A private HTTPS agent bypasses ambient fetch dispatchers and proxy settings. Preparation and
// website calls share this same pool; connection reuse does not prove stable Cloudflare ingress.
function directHttpsFetch(){
  const agent=new https.Agent({keepAlive:true,maxSockets:1,maxFreeSockets:1});
  return (url,init)=>new Promise((resolve,reject)=>{
    let response;const req=https.request(url,{method:init.method,headers:init.headers,agent},incoming=>{
      response=incoming;const headers=new Headers();
      for(let i=0;i<incoming.rawHeaders.length;i+=2)headers.append(incoming.rawHeaders[i],incoming.rawHeaders[i+1]);
      const status=incoming.statusCode;
      try{
        if([204,205,304].includes(status)){incoming.resume();resolve(new Response(null,{status,headers}));}
        else resolve(new Response(Readable.toWeb(incoming),{status,headers}));
      }catch{incoming.destroy();reject(Error('unavailable'));}
    });
    const abort=()=>{response?.destroy();req.destroy();reject(Error('unavailable'));};
    req.on('error',()=>reject(Error('unavailable')));
    req.on('close',()=>init.signal.removeEventListener('abort',abort));
    init.signal.addEventListener('abort',abort,{once:true});
    if(init.signal.aborted){abort();return;}
    req.end(init.body??undefined);
  });
}

/** Bound network and body settlement under one monotonic deadline, including immediately ready reads. */
async function receive(url,init,{fetchImpl,clock,timeout,successCap,image}){
  const controller=new AbortController(),deadlineAt=clock.now()+timeout;let response,reader,timer;
  const stop=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('request_deadline'));},timeout);});
  const check=()=>{need(!controller.signal.aborted&&clock.now()<deadlineAt,'request_deadline');};
  try{
    const pending=Promise.resolve().then(()=>{check();return fetchImpl(url,{...init,cache:'no-store',redirect:'error',signal:controller.signal});});
    void pending.then(late=>{if(controller.signal.aborted)cancel(late.body);},()=>{});
    response=await Promise.race([pending,stop]);check();
    need(!response.redirected&&response.type!=='opaqueredirect'&&response.status>=200&&!(response.status>=300&&response.status<400)&&response.status!==206&&!response.headers.has('content-range'),'response_protocol');
    const encoding=response.headers.get('content-encoding');need(encoding===null||encoding==='identity','response_protocol');
    const cap=response.ok?successCap:16384,length=response.headers.get('content-length');
    need(length===null||/^(0|[1-9][0-9]*)$/.test(length)&&Number.isSafeInteger(Number(length))&&Number(length)<=cap,'response_size');
    const chunks=[];let size=0,empty=0;reader=response.body?.getReader();
    while(reader){const part=await Promise.race([reader.read(),stop]);check();if(part.done)break;need(part.value instanceof Uint8Array,'response_protocol');if(!part.value.length){need(++empty<=32,'response_size');continue;}empty=0;size+=part.value.length;need(size<=cap,'response_size');chunks.push(part.value.slice());}
    check();need(length===null||Number(length)===size,'response_size');
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    // Errors and JSON operations cannot smuggle an image or unparseable provider document.
    const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if(bytes.length&&(!response.ok||!image||type!=='image/png'&&type!=='image/jpeg')){
      need(type==='application/json','response_protocol');try{JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('response_protocol');}
    }
    return {status:response.status,headers:response.headers,bytes};
  }catch(error){controller.abort();if(reader)cancel(reader);else cancel(response?.body);throw Error(['request_deadline','response_protocol','response_size'].includes(error?.message)?error.message:'unavailable');}
  finally{clearTimeout(timer);}
}

/** Assemble only the reviewed Auth/Data/Storage/preparation/website vocabulary and fsync before dispatch. */
export function createMediatedHttp({journal,credentials,sessions={},cookieJars={},origin,operatorToken,fetchImpl=directHttpsFetch(),clock={now:()=>performance.now(),wall:()=>Date.now()}}){
  const keys=validateCredentials(credentials);const site=new URL(origin);need(site.protocol==='https:'&&site.origin===origin&&origin===journal.state.pins.origin);
  let queue=Promise.resolve();
  // Serializing reservations prevents concurrent callers from racing durable sequence/counter updates.
  return {dispatch(descriptor,phase){const frozen=structuredClone(descriptor);const operation=queue.then(()=>dispatch(frozen,phase));queue=operation.catch(()=>{});return operation;}};

  async function dispatch(d,phase){
    const s=journal.state;let url=ORIGIN,path,method='GET',body=null,headers={},successCap=16384,image=false,timeout=10000,category,jar,actor,updatedSession;
    const owner=()=>{need(uuid.test(s.fixtures[0].id));return s.fixtures[0].id;};
    const object=label=>{const o=s.objects.find(o=>o.label===label);need(o);return o;};
    const fixture=label=>{const f=s.fixtures.find(f=>f.label===label);need(f);return f;};
    const token=label=>{const value=sessions[label]?.session?.access_token;need(typeof value==='string'&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)&&value.length<=8192);return value;};
    const ordinary=label=>{need(['A','B','C','N'].includes(label));return {apikey:keys.publicKey,...(label==='N'?{}:{Authorization:`Bearer ${token(label)}`})};};
    const service=()=>({apikey:keys.secretKey});
    const asset=label=>{const id=label==='absence'?s.absenceProbeAssetId:object(label).assetId;need(uuid.test(id));return id;};
    const key=label=>{const value=`${owner()}/${asset(label)}`;need(label==='absence'||object(label).key===value);return value;};
    const rpc=(name,args,auth)=>{path=`/rest/v1/rpc/${name}`;method='POST';headers={...auth,'content-type':'application/json','content-profile':'public'};body=JSON.stringify(args);};
    if(d.kind==='photo'){
      const row=PHOTO_CASES.find(c=>c.id===d.caseId);need(row);category='website';url=origin;path=`/api/profiles/${owner()}/photo`;successCap=4096;image=true;timeout=35000;actor=row.actor;
      need(s.preparation.stage==='complete','preparation_required');
      if(actor!=='N'){
        const existing=await sessionFromCookies(cookieJars[actor]);need(existing.user.id===fixture(actor).id,'cookie_identity');
        jar=sessionCookies(existing,origin,{forceRefresh:row.requestHeader==='expired-session'});headers.cookie=cookieHeader(jar,origin);
      }
      if(row.requestHeader==='range')headers.range='bytes=0-0';
      if(row.requestHeader==='if-none-match')headers['if-none-match']='"ante-acceptance"';
      if(row.requestHeader==='if-modified-since')headers['if-modified-since']='Thu, 01 Jan 1970 00:00:00 GMT';
    }else if(d.kind==='preparation'){
      need(/^[0-9a-f]{64}$/.test(operatorToken),'operator_token');need(s.fixtures.every(f=>uuid.test(f.id))&&new Set(s.fixtures.map(f=>f.id)).size===3);
      category='preparation';url=origin;path='/__ante_acceptance/profile-read-digests-v1';method='POST';headers={Authorization:`Bearer ${operatorToken}`,'content-type':'application/json'};body=JSON.stringify({run_id:s.runId,fixture_ids:s.fixtures.map(f=>f.id)});successCap=1024;
    }else if(d.kind.startsWith('auth')){
      category='directAuth';successCap=65536;
      if(d.kind==='authProbe'){path='/auth/v1/admin/users/00000000-0000-0000-0000-000000000000';headers={...service(),Authorization:`Bearer ${keys.secretKey}`};}
      else{
        const f=fixture(d.label);
        if(d.kind==='authCreate'||d.kind==='authLogin'){
          const password=sessions[d.label]?.password;need(typeof password==='string'&&password.length>=32&&password.length<=1024);method='POST';headers={'content-type':'application/json'};
          if(d.kind==='authCreate'){path='/auth/v1/admin/users';Object.assign(headers,service(),{Authorization:`Bearer ${keys.secretKey}`});body=JSON.stringify({email:f.email,password,email_confirm:true,app_metadata:{acceptance_run:s.runId}});}
          else{path='/auth/v1/token?grant_type=password';headers.apikey=keys.publicKey;body=JSON.stringify({email:f.email,password});}
        }else if(d.kind==='authGetUser'){
          path='/auth/v1/user';headers=ordinary(d.label);
          if(d.label==='A'&&d.slot===2){updatedSession=await sessionFromCookies(cookieJars.A);need(updatedSession.user.id===f.id,'cookie_identity');headers.Authorization=`Bearer ${updatedSession.access_token}`;}
        }else if(d.kind==='authDelete'){need(uuid.test(f.id));path=`/auth/v1/admin/users/${f.id}`;method='DELETE';headers={...service(),Authorization:`Bearer ${keys.secretKey}`,'content-type':'application/json'};body=JSON.stringify({should_soft_delete:false});}
        else throw Error('request_boundary');
      }
    }else if(d.kind.startsWith('data')){
      category='directData';
      if(d.kind==='dataOperation'){
        const o=object(d.label),base={p_owner:owner(),p_operation_id:o.operationId},leased={...base,p_lease_epoch:o.leaseEpoch};
        if(d.slot===1)rpc('reserve_profile_photo_v1',{...base,p_expected_revision:d.label==='G1'?0:1},service());
        else if(d.slot===2)rpc('bind_profile_photo_input_v1',{...leased,p_input_sha256:`\\x${o.sha256}`,p_transform_version:'synthetic-reader-fixture-v1'},service());
        else if(d.slot===3)rpc('prepare_profile_photo_v1',{...leased,p_input_sha256:`\\x${o.sha256}`,p_normalized_sha256:`\\x${o.sha256}`,p_mime:o.mime,p_width:1,p_height:1,p_byte_count:o.byteCount,p_transform_version:'synthetic-reader-fixture-v1'},service());
        else if(d.slot===4)rpc('publish_profile_photo_v1',leased,service());else throw Error('request_boundary');
      }else if(d.kind==='dataClear')rpc('clear_profile_photo_v1',{p_owner:owner(),p_operation_id:s.clear.operationId,p_expected_revision:2},service());
      else if(d.kind==='dataExposure')rpc('profile_photo_read_manifest_v1',{p_owner:owner(),p_asset_id:asset(d.label)},ordinary(d.actor));
      else if(d.kind==='dataBoundary'){
        if(d.slot===1)rpc('resolve_profile_photo_v1',{p_owner:owner()},ordinary('N'));
        else if(d.slot===2)rpc('profile_photo_state_v1',{p_owner:owner()},ordinary('A'));
        else if(d.slot===3||d.slot===4){path=`/rest/v1/${d.slot===3?'heads':'operations'}?select=owner_id&limit=1`;headers={...ordinary('A'),'accept-profile':'profile_asset_private'};}else throw Error('request_boundary');
      }else throw Error('request_boundary');
    }else if(d.kind==='directMatrix'){
      category='directStorage';const view=DIRECT_VIEWS.find(v=>v.id===d.view);need(view);method=view.method;headers=ordinary(d.actor);successCap=4096;image=true;
      path=`/storage/v1/${view.path}/profile-photos${view.id==='list'?'':`/${key(d.keyLabel)}`}`;
      if(view.body){headers['content-type']='application/json';body=JSON.stringify(view.body==='sign-60'?{expiresIn:60}:{prefix:`${owner()}/`,limit:100,offset:0});}
    }else if(['storageUpload','storageReadback','storageWarm','storageOwnership','storageDelete','storageAbsence'].includes(d.kind)){
      category='directStorage';const o=object(d.label),k=key(d.label);headers=service();successCap=4096;image=true;
      path=`/storage/v1/object/authenticated/profile-photos/${k}`;
      if(d.kind==='storageUpload'){method='POST';path=`/storage/v1/object/profile-photos/${k}`;body=syntheticReaderBytes(d.label);need(body.length===o.byteCount&&createHash('sha256').update(body).digest('hex')===o.sha256);headers={...headers,'content-type':o.mime,'x-upsert':'false','cache-control':'private, no-store'};successCap=16384;image=false;}
      if(d.kind==='storageDelete'){method='DELETE';path=`/storage/v1/object/profile-photos/${k}`;successCap=16384;image=false;}
    }else throw Error('request_boundary');
    const epochStart=phase==='run'?s.startedAt:phase==='cleanup'?s.cleanupStartedAt:s.counters.recoveries[0]?.startedAt;
    need(epochStart&&clock.wall()-Date.parse(epochStart)<(phase==='run'?900000:300000)&&clock.wall()>=Date.parse(epochStart),'phase_deadline');
    // Descriptor validation, duplicate rejection and durable counter reservation happen exactly once.
    await reserveDispatch(journal,phase,d);
    need(clock.wall()-Date.parse(epochStart)<(phase==='run'?900000:300000),'phase_deadline');
    let result;
    try{result=await receive(`${url}${path}`,{method,headers:{...headers,'accept-encoding':'identity'},body},{fetchImpl,clock,timeout,successCap,image});}
    catch(error){if(d.kind==='photo')await journal.mutate(next=>{next.uncertainWebsite=true;next.uncertainAt??=new Date(clock.wall()).toISOString();});throw error;}
    // Only completed external HTTP responses are observed; reserved Worker envelopes are never traces.
    await journal.mutate(next=>{next.observed[phase][category]++;});
    if(jar){applyResponseCookies(jar,result.headers,origin);const current=await sessionFromCookies(jar);need(current.user.id===fixture(actor).id,'cookie_identity');cookieJars[actor]=jar;}
    if(d.kind==='authGetUser'&&result.status===200){let user;try{user=JSON.parse(new TextDecoder().decode(result.bytes));}catch{throw Error('identity_reply');}need(user.id===fixture(d.label).id,'identity_reply');if(updatedSession)sessions.A.session=updatedSession;}
    return result;
  }
}
