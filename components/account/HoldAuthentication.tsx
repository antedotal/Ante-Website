'use client'
// A GET-issued original intent secret stays only in this controlled lifetime.
// Verified failed authentication requires a fresh explicit original-card choice;
// ordinary requires_action tickets retain Stripe's existing next-action call.
import {useEffect,useRef,useState} from 'react'
import {loadPaymentStripe,type PaymentStripe} from '../../lib/payments/stripe-elements'
import type {OriginalCardActionTicket} from '../../lib/payments/original-card-action'
type Lifetime={alive:boolean;attempted:boolean;affirmed:boolean}
export default function HoldAuthentication({ticket,publishableKey,onConfirmed,onExpired,isCurrent,kind='hold'}:{ticket:OriginalCardActionTicket;publishableKey:string;onConfirmed:()=>Promise<void>;onExpired:()=>void;isCurrent?:()=>boolean;kind?:'hold'|'collection'}){
 const noun=kind==='collection'?'payment':'hold',confirmation=ticket.action_mode==='confirm_original_card'
 const client=useRef<PaymentStripe|null>(null),frame=useRef<Lifetime|null>(null),boundary=useRef({ticket,publishableKey}),attempt=useRef({ticket,used:false}),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[affirmed,setAffirmed]=useState(false),[message,setMessage]=useState('Loading secure authentication…')
 // Retire the exact previous frame during render, before passive cleanup. A
 // retained submit/checkbox or SDK reply cannot act on a newly issued secret.
 if(boundary.current.ticket!==ticket||boundary.current.publishableKey!==publishableKey){if(frame.current)frame.current.alive=false;client.current=null}
 boundary.current={ticket,publishableKey}
 if(attempt.current.ticket!==ticket)attempt.current={ticket,used:false}
 useEffect(()=>{const lifetime:Lifetime={alive:true,attempted:attempt.current.used,affirmed:false};frame.current=lifetime;setReady(false);setBusy(false);setAffirmed(false);setMessage('Loading secure authentication…');const delay=Date.parse(ticket.expires_at)-Date.now();if(!Number.isFinite(delay)||delay<=0){lifetime.alive=false;onExpired();return}const timer=setTimeout(()=>{if(lifetime.alive){lifetime.alive=false;onExpired()}},delay)
  void loadPaymentStripe(publishableKey).then(stripe=>{if(!lifetime.alive||frame.current!==lifetime||Date.now()>=Date.parse(ticket.expires_at))return;if(confirmation?!stripe.confirmCardPayment:!stripe.handleNextAction)throw new Error();client.current=stripe;setReady(true);setMessage('')}).catch(()=>{if(lifetime.alive)setMessage(`Secure authentication is unavailable. Check the original ${noun} progress.`)})
  return()=>{lifetime.alive=false;clearTimeout(timer);client.current=null}
 },[ticket,publishableKey,onExpired,noun,confirmation])
 const lifetime=frame.current,current=()=>!!lifetime&&lifetime.alive&&frame.current===lifetime&&boundary.current.ticket===ticket&&boundary.current.publishableKey===publishableKey&&Date.now()<Date.parse(ticket.expires_at)&&(isCurrent?.()??true)
 // The lifetime latch is set synchronously before the SDK await, so double
 // submissions and all success/error/unknown results consume this attempt. Only
 // the existing canonical recovery callback may establish backing or payment.
 async function authenticate(event:React.FormEvent){event.preventDefault();const stripe=client.current;if(!ready||busy||!stripe||!current()||lifetime!.attempted||attempt.current.used||confirmation&&!lifetime!.affirmed)return;const action=confirmation?stripe.confirmCardPayment:stripe.handleNextAction;if(!action)return;lifetime!.attempted=true;attempt.current.used=true;setBusy(true);setReady(false)
  try{const result=confirmation?await stripe.confirmCardPayment!(ticket.client_secret,{payment_method:ticket.method_id!}):await stripe.handleNextAction!({clientSecret:ticket.client_secret});if(!current())return;if(result.error){setMessage(`Authentication did not finish. Check the original ${noun} progress.`);return}await onConfirmed()}catch{if(current())setMessage(`The authentication outcome is unknown. Check the original ${noun} progress.`)}finally{if(current())setBusy(false)}
 }
 return <form onSubmit={authenticate} aria-busy={busy} className="mt-6 space-y-4">{confirmation&&<><p className="text-sm">Your original task card needs confirmation to continue this {noun}.</p><label className="flex gap-3 text-sm"><input type="checkbox" checked={affirmed} disabled={!ready||busy} onChange={event=>{if(!current()||lifetime!.attempted)return;lifetime!.affirmed=event.target.checked;setAffirmed(event.target.checked)}}/>I confirm that Ante may continue this original {noun} using the original task card.</label></>}<p role="status" className="text-sm">{message}</p><button type="submit" disabled={!ready||busy||confirmation&&!affirmed} className="rounded-xl bg-[#003a4a] px-5 py-3 text-white disabled:opacity-50">{busy?'Authenticating…':confirmation?`Confirm original card for this ${noun}`:`Authenticate original ${noun}`}</button><p className="text-sm">{kind==='collection'?'Authentication does not confirm payment. Check the verified payment progress afterward.':'Authentication does not confirm task start or reserved funds. Check the verified task progress afterward.'}</p></form>
}
