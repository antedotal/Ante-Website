"use client"
// A one-use continuation lives only in this component's memory and expires.
// Confirmation waits for protected return-cookie installation before mounting.
import { useEffect, useRef, useState } from 'react'
import { loadPaymentStripe, type PaymentStripe, type StripeElements } from '../../lib/payments/stripe-elements'
export type SetupTicket={client_secret:string;expires_at:string;return_route_key:'account_payments'}
export default function CardSetup({ticket,publishableKey,onConfirmed,onExpired}:{ticket:SetupTicket;publishableKey:string;onConfirmed:()=>Promise<void>;onExpired:()=>void}) {
 const target=useRef<HTMLDivElement>(null),stripe=useRef<PaymentStripe|null>(null),elements=useRef<StripeElements|null>(null),frame=useRef<{alive:boolean}|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('Loading secure card entry…')
 useEffect(()=>{
  const lifetime={alive:true};frame.current=lifetime
  let cleanup:(()=>void)|undefined;const delay=Date.parse(ticket.expires_at)-Date.now();if(delay<=0){lifetime.alive=false;onExpired();return}
  const timer=setTimeout(()=>{if(lifetime.alive){lifetime.alive=false;onExpired()}},delay)
  void loadPaymentStripe(publishableKey).then(client=>{if(!lifetime.alive||!target.current||Date.now()>=Date.parse(ticket.expires_at))return;stripe.current=client;elements.current=client.elements({clientSecret:ticket.client_secret});const element=elements.current.create('payment');cleanup=()=>element.destroy();element.on('ready',()=>{if(lifetime.alive){setReady(true);setMessage('')}});element.mount(target.current)}).catch(()=>{if(lifetime.alive)setMessage('Secure card entry is unavailable. Check the existing setup before trying again.')})
  return()=>{lifetime.alive=false;clearTimeout(timer);cleanup?.();stripe.current=null;elements.current=null}
 },[ticket,publishableKey,onExpired])
 // Each submit captures the actual mounted frame and elements. Cleanup or ticket
 // replacement invalidates that frame, so late submit/provider replies cannot
 // call a parent recovery callback, mutate newer UI state or confirm new elements.
 async function confirm(event:React.FormEvent){event.preventDefault();const lifetime=frame.current,client=stripe.current,currentElements=elements.current,isCurrent=()=>!!lifetime&&lifetime.alive&&frame.current===lifetime&&Date.now()<Date.parse(ticket.expires_at);if(!ready||busy||!client||!currentElements||!isCurrent())return;setBusy(true)
  try{const submitted=await currentElements.submit();if(!isCurrent())return;if(submitted.error){setMessage('Check the card details in the secure form.');return}
   setReady(false);const result=await client.confirmSetup({elements:currentElements,confirmParams:{return_url:window.location.origin+'/account/payments/return'},redirect:'if_required'});if(!isCurrent())return
   if(result.error){setMessage('Card confirmation did not finish. Check the existing setup before retrying.');return}
   // Browser success is only a hint; server consumption/current resources decide.
   await onConfirmed()
  }catch{if(isCurrent())setMessage('The outcome is unknown. Check the existing card setup.')}finally{if(isCurrent())setBusy(false)}
 }
 return <form onSubmit={confirm} className="mt-6 space-y-4"><div ref={target} aria-label="Secure card details" /><p role="status" className="text-sm">{message}</p><button type="submit" disabled={!ready||busy} className="rounded-xl bg-[#003a4a] px-5 py-3 text-white disabled:opacity-50">{busy?'Confirming…':'Save card'}</button><p className="text-sm">Card details are collected securely by Stripe. Saving a card does not authorize an accountability hold.</p></form>
}
