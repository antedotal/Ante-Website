// Shared stream ownership enforces finite progress/caps without prefetch or claims of physical quiescence.
import {createPrivatePhotoObservationLifetime} from '../../../../supabase/functions/_shared/privatePhotoTransport.ts';
export const unavailable=()=>Error('unavailable');
// One local request budget races results; retained physical Fetch/read/cancel promises settle separately.
export function requestLifetime(signal,observe,{timeoutMs=60000,now=()=>performance.now(),arrival=now()}={}) {
  const observation=createPrivatePhotoObservationLifetime(observe),controller=new AbortController(),deadline=arrival+timeoutMs;
  const stop=()=>controller.abort();
  const timer=setTimeout(stop,Math.max(0,deadline-now()));signal.addEventListener('abort',stop,{once:true});
  if(signal.aborted) stop();
  let closed=false;
  const check=()=>{if(controller.signal.aborted||now()>=deadline) {stop();throw unavailable();}};
  return Object.freeze({signal:controller.signal,deadline,now,retain:observation.retain,stop,check,
    async within(work) {
      observation.retain(work);let reject;
      const abort=()=>reject(unavailable()),stopped=new Promise((_,r)=>{reject=r;});
      controller.signal.addEventListener('abort',abort,{once:true});
      try {check();const value=await Promise.race([work,stopped]);check();return value;} finally {controller.signal.removeEventListener('abort',abort);}
    },
    finishAfter:observation.finishAfter,
    close(){if(closed)return;closed=true;clearTimeout(timer);signal.removeEventListener('abort',stop);},
  });
}
// Exact length parsing is shared by incoming uploads, provider JSON and private service responses.
export function declaredLength(headers,cap) {
  const text=headers.get('content-length');
  if(text===null) return null;
  if(!/^(0|[1-9][0-9]*)$/.test(text)||!Number.isSafeInteger(Number(text))||Number(text)>cap) throw unavailable();
  return Number(text);
}
// Reader creation cannot prefetch. Only consumer pulls perform reads, with HWM0 and finite empty progress.
export function boundedStream(body,{cap,length=null,lifetime,check=()=>{},finished=()=>{},framed=false}) {
  if(!body) throw unavailable();
  const reader=body.getReader();let count=0,empties=0,ended=false,cancellation;
  let settled;const completion=new Promise(resolve=>{settled=resolve;});lifetime.retain(completion);
  const finish=()=>{if(ended)return;ended=true;lifetime.signal.removeEventListener('abort',abort);try{reader.releaseLock();}catch{/* A pending read remains independently observed. */}settled();finished();};
  const cancel=()=>{
    if(ended) return Promise.resolve();
    if(!cancellation) cancellation=lifetime.retain(Promise.resolve().then(()=>reader.cancel()).catch(()=>{})).finally(finish);
    return cancellation;
  };
  const readNext=async()=>{lifetime.check();check();const next=await lifetime.within(Promise.resolve().then(()=>reader.read()));lifetime.check();check();return next;};
  const abort=()=>{void cancel();};lifetime.signal.addEventListener('abort',abort,{once:true});
  if(lifetime.signal.aborted) abort();
  const stream=new ReadableStream({
    // Workerd's producer-length extension retains HTTP framing without a pumping transform or prefetch.
    ...(framed?{expectedLength:length}:{}),
    async pull(controller) {
      try {
        while(!ended) {
          const next=await readNext();
          if(next.done) {if(length!==null&&length!==count)throw unavailable();finish();controller.close();return;}
          if(!(next.value instanceof Uint8Array)) throw unavailable();
          if(!next.value.byteLength) {if(++empties>32)throw unavailable();continue;}
          empties=0;count+=next.value.byteLength;if(count>cap||(length!==null&&count>length))throw unavailable();
          // Before the final framed byte is exposed, prove actual EOF; framing cannot hide trailing producer bytes.
          if(framed&&count===length){const last=new Uint8Array(next.value);for(;;){const tail=await readNext();if(tail.done)break;if(!(tail.value instanceof Uint8Array)||tail.value.byteLength||++empties>32)throw unavailable();}finish();controller.enqueue(last);controller.close();return;}
          controller.enqueue(next.value);return;
        }
        controller.error(unavailable());
      } catch {controller.error(unavailable());void cancel();}
    },cancel,
  },{highWaterMark:0});
  // The owner may dispose an unconsumed replay upload even while Fetch holds the stream's reader.
  Object.defineProperty(stream,'dispose',{value:cancel});return stream;
}
