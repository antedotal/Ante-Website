// Stripe owns all card fields inside the official Payment Element iframe.
// This loader is called only after approved setup/return/continuation responses;
// no PAN/CVC, provider query, client-secret logging or local storage is used.
export interface PaymentElement { mount(target: HTMLElement): void; destroy(): void; on(event:'ready',listener:()=>void):void }
export interface StripeElements { create(kind:'payment'):PaymentElement; submit():Promise<{error?:unknown}> }
export interface PaymentStripe { handleNextAction?(options:{clientSecret:string}):Promise<{error?:unknown;paymentIntent?:{status:string}}>; elements(options:{clientSecret:string}):StripeElements; confirmSetup(options:{elements:StripeElements;confirmParams:{return_url:string};redirect:'if_required'}):Promise<{error?:unknown;setupIntent?:{status:string}}> }
declare global { interface Window { Stripe?: (key:string)=>PaymentStripe } }
let loading:Promise<void>|undefined
export async function loadPaymentStripe(key:string):Promise<PaymentStripe> {
 if(!/^pk_(test|live)_[A-Za-z0-9]{10,256}$/.test(key))throw new Error('Card entry unavailable')
 if(!window.Stripe){loading??=new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src='https://js.stripe.com/dahlia/stripe.js';script.async=true;script.referrerPolicy='no-referrer';script.onload=()=>resolve();script.onerror=()=>{loading=undefined;reject(new Error('Card entry unavailable'))};document.head.appendChild(script)});await loading}
 if(!window.Stripe)throw new Error('Card entry unavailable');return window.Stripe(key)
}
