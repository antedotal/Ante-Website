'use client'
// Owner/commitment keyed recovery never creates a task or payment. A protected
// server read family binds the original collection; late replies and challenge
// callbacks are fenced to this owner's exact mounted generation.
import {useCallback,useEffect,useRef,useState} from 'react'
import HoldAuthentication from './HoldAuthentication'
import {parseOriginalCardAction,type OriginalCardActionTicket} from '../../lib/payments/original-card-action'
// Browser DTO helpers retain the original exact-object and UUID semantics
// without importing the backend canonical hash codec or Node core modules.
import {exact,internalId} from '../../lib/payments/browser-dto-v1/primitives.mjs'
type Props={enabled:boolean;ownerId?:string;commitmentId:string;commitmentRevision:number;publishableKey?:string}
type RecoveryView={identity:string;message:string;available:boolean;pending:boolean}
// Present only the mounted owner's selected commitment, including before passive
// cleanup. Pending is visible accessibility feedback for the existing action lock.
const initialView=(identity:string):RecoveryView=>({identity,message:'Check the original payment progress.',available:false,pending:false})
type IssuedTicket={owner:string;generation:number;value:OriginalCardActionTicket;identity:string}
const labels:Record<string,string>={pending:'Payment verification pending',requires_action:'Authentication required',unknown:'Payment outcome unknown',failed:'Payment did not complete',expired_unsecured:'Original payment expired',settled:'Payment verified'}
export default function LongCollectionRecovery({enabled,ownerId='',commitmentId,commitmentRevision,publishableKey=''}:Props){
 const identityKey=enabled+':'+ownerId+':'+commitmentId+':'+commitmentRevision,identity=useRef(identityKey);identity.current=identityKey
 const alive=useRef(false),generation=useRef(0),busy=useRef(false),[status,setStatus]=useState<RecoveryView>(initialView(identityKey)),[ticket,setTicket]=useState<IssuedTicket|null>(null),activeTicket=useRef<IssuedTicket|null>(null),confirmationPending=useRef(false)
 const view=status.identity===identityKey?status:initialView(identityKey)
 // Late reads update only their mounted selection; a new identity starts without
 // another owner's verified status, continuation control or pending indicator.
 const updateStatus=useCallback((patch:Partial<RecoveryView>)=>{if(identity.current===identityKey)setStatus(previous=>({...previous.identity===identityKey?previous:initialView(identityKey),...patch}))},[identityKey])
 const request=useCallback(async(path:string,body:unknown={})=>{const response=await fetch('/api/account/collections/by-commitment/'+commitmentId+'/'+commitmentRevision+'/'+path,{method:'POST',headers:{'content-type':'application/json','X-Ante-Payment-Owner':ownerId},body:JSON.stringify(body),credentials:'same-origin',cache:'no-store',redirect:'error'});const value=await response.json();if(!response.ok)throw new Error(response.status===429?'Please wait before checking again.':'Payment recovery is unavailable. Check the original progress.');return value as unknown},[ownerId,commitmentId,commitmentRevision])
 const invalidate=useCallback(()=>{alive.current=false;generation.current++;busy.current=false;activeTicket.current=null;confirmationPending.current=false},[])
 useEffect(()=>{alive.current=true;generation.current++;busy.current=false;setStatus(initialView(identityKey));return invalidate},[ownerId,enabled,commitmentId,commitmentRevision,identityKey,invalidate])
 // One active UI action retains the original read root. Every response is
 // checked after await; owner/enable/selection changes invalidate old frames.
 const progress=useCallback(async()=>{const value=await request('progress');if(!exact(value,['collection_state','continuation_available','original_intent_known'])||!labels[String((value as Record<string,unknown>).collection_state)]||typeof (value as Record<string,unknown>).continuation_available!=='boolean')throw new Error('Unavailable progress');return value as {collection_state:string;continuation_available:boolean}},[request])
 async function act(authenticate=false){if(!enabled||!ownerId||busy.current||!alive.current||identity.current!==identityKey)return;busy.current=true;updateStatus({pending:true,message:'Checking original payment…'});const g=++generation.current,valid=()=>alive.current&&generation.current===g&&identity.current===identityKey;activeTicket.current=null;confirmationPending.current=false;setTicket(null)
  try{await request('prepare',{commitment_id:commitmentId,commitment_revision:commitmentRevision});if(!valid())return;const view=await progress();if(!valid())return;updateStatus({message:labels[view.collection_state],available:view.continuation_available})
   if(authenticate&&view.continuation_available){await request('return/issue');if(!valid())return;const value=await request('return/continue');if(!valid())return
    const v=parseOriginalCardAction(value,'task.long_collection.continue',commitmentId,commitmentRevision),issued={owner:ownerId,generation:g,value:v,identity:identityKey};activeTicket.current=issued;setTicket(issued)
   }
  }catch(error){if(valid()){updateStatus({available:false,message:error instanceof Error?error.message:'Outcome unknown. Check the original payment.'})}}finally{if(valid()){busy.current=false;updateStatus({pending:false})}}
 }
 const current=ticket&&enabled&&ticket.owner===ownerId&&ticket.generation===generation.current&&ticket.identity===identityKey?ticket:null
 // Keep the exact issued object authoritative through its confirmation read.
 // Expiry retires it synchronously, including while progress is awaiting HTTP;
 // cleared, duplicate or replaced callbacks cannot dispatch or install replies.
 const issued=ticket
 const validIssued=useCallback(()=>!!issued&&alive.current&&identity.current===identityKey&&activeTicket.current===issued&&generation.current===issued.generation,[issued,identityKey])
 const confirmed=useCallback(async()=>{if(!validIssued()||confirmationPending.current||busy.current)return;confirmationPending.current=true;busy.current=true;updateStatus({pending:true,message:'Checking verified payment progress…'});setTicket(null);try{const view=await progress();if(validIssued()){updateStatus({available:view.continuation_available,message:labels[view.collection_state]})}}catch{if(validIssued())updateStatus({message:'Outcome unknown. Check the original payment.'})}finally{if(validIssued()){activeTicket.current=null;confirmationPending.current=false;busy.current=false;updateStatus({pending:false})}}},[progress,validIssued,updateStatus])
 const expired=useCallback(()=>{if(!validIssued())return;activeTicket.current=null;confirmationPending.current=false;generation.current++;busy.current=false;setTicket(null);updateStatus({pending:false,message:'Authentication expired. Check the original payment before resuming.'})},[validIssued,updateStatus])

 if(!enabled)return <main><h1 className="text-3xl font-semibold">Payment recovery</h1><p>Payment recovery is currently unavailable.</p></main>
 if(!internalId(commitmentId)||!Number.isInteger(commitmentRevision)||commitmentRevision<1)return <main><p>Payment recovery is unavailable.</p></main>
 return <main aria-busy={view.pending}><h1 className="text-3xl font-semibold">Original task payment</h1><p className="mt-4">Review the original payment. Authentication does not change the task outcome or create another payment.</p><p role="status" className="mt-4">{view.message}</p><div className="mt-6 flex flex-wrap gap-3"><button className="rounded-xl border px-5 py-3 disabled:opacity-50" disabled={view.pending} onClick={()=>void act()}>Check original payment</button>{view.available&&<button className="rounded-xl bg-[#003a4a] px-5 py-3 text-white disabled:opacity-50" disabled={view.pending} onClick={()=>void act(true)}>Resume authentication</button>}</div>{current&&<HoldAuthentication key={current.generation} kind="collection" ticket={current.value} publishableKey={publishableKey} onConfirmed={confirmed} onExpired={expired} isCurrent={validIssued}/>}</main>
}
