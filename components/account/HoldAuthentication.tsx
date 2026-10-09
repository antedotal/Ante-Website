'use client'
// The original one-use hold secret exists only in this controlled lifetime.
// Stripe owns the authentication challenge; no editable card or replacement
// method fields, confirmation parameters or payment effects are constructed.
import {useEffect,useRef,useState} from 'react'
import {loadPaymentStripe,type PaymentStripe} from '../../lib/payments/stripe-elements'
import type {SetupTicket} from './CardSetup'
export default function HoldAuthentication({ticket,publishableKey,onConfirmed,onExpired,kind='hold'}:{ticket:SetupTicket;publishableKey:string;onConfirmed:()=>Promise<void>;onExpired:()=>void;kind?:'hold'|'collection'}){
 // Both purposes reuse the same official GET-issued intent challenge lifetime;
 // only human-facing copy differs. No confirmation/capture parameters are added.
 const noun=kind==='collection'?'payment':'hold'
 const client=useRef<PaymentStripe|null>(null),frame=useRef<{alive:boolean}|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading secure authentication…')
 useEffect(()=>{const lifetime={alive:true};frame.current=lifetime;const delay=Date.parse(ticket.expires_at)-Date.now();if(delay<=0){lifetime.alive=false;onExpired();return}const timer=setTimeout(()=>{if(lifetime.alive){lifetime.alive=false;onExpired()}},delay)
  void loadPaymentStripe(publishableKey).then(stripe=>{if(!lifetime.alive||Date.now()>=Date.parse(ticket.expires_at))return;if(!stripe.handleNextAction)throw new Error();client.current=stripe;setReady(true);setMessage('')}).catch(()=>{if(lifetime.alive)setMessage(`Secure authentication is unavailable. Check the original ${noun} progress.`)})
  return()=>{lifetime.alive=false;clearTimeout(timer);client.current=null}
 },[ticket,publishableKey,onExpired,noun])
 // Capture this exact live frame/client before awaiting the official original
 // next-action call. Cleanup, replacement or expiry suppresses all later parent
 // callbacks; a provider response never establishes task start or backing here.
 async function authenticate(event:React.FormEvent){event.preventDefault();const lifetime=frame.current,stripe=client.current,current=()=>!!lifetime&&lifetime.alive&&frame.current===lifetime&&Date.now()<Date.parse(ticket.expires_at);if(!ready||busy||!stripe?.handleNextAction||!current())return;setBusy(true);setReady(false)
  try{const result=await stripe.handleNextAction({clientSecret:ticket.client_secret});if(!current())return;if(result.error){setMessage(`Authentication did not finish. Check the original ${noun} progress.`);return}await onConfirmed()}catch{if(current())setMessage(`The authentication outcome is unknown. Check the original ${noun} progress.`)}finally{if(current())setBusy(false)}
 }
 return <form onSubmit={authenticate} className="mt-6 space-y-4"><p role="status" className="text-sm">{message}</p><button type="submit" disabled={!ready||busy} className="rounded-xl bg-[#003a4a] px-5 py-3 text-white disabled:opacity-50">{busy?'Authenticating…':`Authenticate original ${noun}`}</button><p className="text-sm">{kind==='collection'?'Authentication does not confirm payment. Check the verified payment progress afterward.':'Authentication does not confirm task start or reserved funds. Check the verified task progress afterward.'}</p></form>
}
