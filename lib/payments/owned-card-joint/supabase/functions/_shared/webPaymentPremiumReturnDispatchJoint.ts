// Trusted common-job composition obtains this fixed permit-specific approval
// port from the accepted SQL dispatch authority. No browser request, static flag
// or commercial configuration alone can authorize a Checkout effect.
import {exact,paymentRequestHash,type Permit} from './webPaymentProviderContractJoint.ts'
export type PremiumReturnAuthority=Readonly<{success_url:string;cancel_url:string}>
// This ephemeral local witness is created only after the protected approval
// resolves. Hashing the entire original permit prevents mutation before client
// construction; it is neither a journal nor reusable provider capability.
const approvals=new WeakMap<object,string>()
export function isApprovedPremiumReturn(permit:Permit,value:PremiumReturnAuthority|null){return !!value&&approvals.get(value)===paymentRequestHash(permit)}
export type PremiumReturnDispatch={approve(permit:Permit):Promise<{success_url:string;cancel_url:string}|null>}
export async function approvedPremiumReturnUrls(permit:Permit,dispatch:PremiumReturnDispatch|null){
 if(!dispatch||permit.kind!=='subscription.create'||permit.plan!=='effect'||permit.billing_configuration?.return_adapter_version!=='premium_return_v1')return null
 try{const originalHash=paymentRequestHash(permit),value=await dispatch.approve(permit);if(paymentRequestHash(permit)!==originalHash)return null;if(!exact(value,['success_url','cancel_url'])||!value)return null;const success=new URL(value.success_url),cancel=new URL(value.cancel_url);if(success.protocol!=='https:'||success.username||success.password||success.port||success.search||success.hash||success.pathname!=='/account/premium/return'||cancel.href!==success.href||success.origin!==new URL(success.origin).href.slice(0,-1))return null;const authority=Object.freeze({success_url:success.href,cancel_url:cancel.href});approvals.set(authority,originalHash);return authority}catch{return null}
}
