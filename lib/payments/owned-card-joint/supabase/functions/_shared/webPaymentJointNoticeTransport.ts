// GENERATED finite dedicated notice transport from accepted Task13 source.
// Four fixed retrieval ports retain its original physical lifetime/stream core.
// It supplies no SDK executor, activation rows, keys, grants or generic proxy.
import {ProviderRepositoryJoint} from './webPaymentProviderRepositoryJoint.ts';
import {boundedStream as originalBoundedStream, declaredLength, requestLifetime} from '../../../scripts/backend/photo/native-facade-v1/stream.mjs';
type Body=ReadableStream<Uint8Array>&{dispose:()=>Promise<void>};
const boundedStream=originalBoundedStream as unknown as (body:ReadableStream<Uint8Array>|null,options:{cap:number;length:number|null;lifetime:ReturnType<typeof requestLifetime>})=>Body;
type Configuration=Readonly<{publishableApiKey:string;retrievalBearer:string;retrievalCredential:string;observe:(work:Promise<void>)=>void;}>;
const rpcPaths=Object.freeze({claim_notice:'http_claim_payment_notice_v1',record_notice_dispatch:'http_dispatch_payment_notice_v1',record_notice_observation:'http_observe_payment_notice_v1',reconcile_notice:'http_reconcile_payment_notice_v1'});
// Operational credentials are required arguments and never copied into receipt,
// log or browser state. The project endpoint and port names are literal source.
export function createJointNoticeSqlRepository(input:Configuration){
 if(!input||!/^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(input.publishableApiKey)||!/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(input.retrievalBearer)||! /^[A-Za-z0-9_-]{43,128}$/.test(input.retrievalCredential)||typeof input.observe!=='function')throw Error('webhook transport unavailable');
 const config=Object.freeze({...input});let physicalBusy=false;
 async function rpc(port:keyof typeof rpcPaths,args:Record<string,unknown>):Promise<unknown>{
  if(physicalBusy)throw Error('webhook transport retained');physicalBusy=true;
  const lifetime=requestLifetime(new AbortController().signal,(work:Promise<void>)=>{config.observe(work);void work.then(()=>{physicalBusy=false;});},{timeoutMs:5000});
  let stream:Body|undefined,captured:Response|undefined,requestDone=false,disposed=false;
  // A late Fetch acknowledgment still owns a response body. Cancel that exact
  // unclaimed body under the original retained lifetime before clearing busy.
  const disposeUnclaimed=(response:Response)=>{if(disposed||stream)return;disposed=true;const late=boundedStream(response.body,{cap:65536,length:null,lifetime});lifetime.retain(late.dispose());};
  try{
   const fetchWork=fetch('https://yxilmwxptfnebnjsikwo.supabase.co/rest/v1/rpc/'+rpcPaths[port],{method:'POST',redirect:'error',signal:lifetime.signal,headers:{'Content-Type':'application/json',Accept:'application/json',apikey:config.publishableApiKey,Authorization:'Bearer '+config.retrievalBearer,'x-ante-payment-webhook-retrieval':config.retrievalCredential},body:JSON.stringify({p_request:args})});
   lifetime.retain(fetchWork.then(response=>{captured=response;if(requestDone)disposeUnclaimed(response);}));
   const response=await lifetime.within(fetchWork);
   stream=boundedStream(response.body,{cap:65536,length:declaredLength(response.headers,65536),lifetime});
   const bytes=await lifetime.within(new Response(stream).arrayBuffer());
   if(!response.ok||!/^application\/json(?:\s*;.*)?$/i.test(response.headers.get('content-type')??''))throw Error('webhook SQL unavailable');
   // The trusted SQL endpoint returns only its fixed descriptor or scalar result;
   // the intake independently validates the complete descriptor/receipt shape.
   return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }finally{requestDone=true;if(!stream&&captured)disposeUnclaimed(captured);if(stream)lifetime.retain(stream.dispose());lifetime.close();lifetime.finishAfter(Promise.resolve());}
 }
 // Only four fixed notice names reach the original captured bounded transport.
 // Legacy/effect repository methods have no name mapping and fail before I/O.
 return new ProviderRepositoryJoint(async(name,args)=>{if(!Object.hasOwn(rpcPaths,name))throw Error('notice port unavailable');return await rpc(name as keyof typeof rpcPaths,args);},'source-owned-notice-retrieval');
}
