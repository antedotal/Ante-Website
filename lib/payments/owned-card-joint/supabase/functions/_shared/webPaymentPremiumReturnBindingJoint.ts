// Compose the accepted standalone server binding with the joined provider engine.
// Only the existing protected fixed RPC port approves an original dispatched
// permit. Browser data, configuration flags and URLs cannot supply that approval.
import type {PremiumReturnDispatch} from './webPaymentPremiumReturnDispatchJoint.ts';
export type PremiumDispatchRequest={subaction_id:string;lease_generation:number;operation_revision:number;configuration_id:string;configuration_revision:number};
export type ProtectedPremiumDispatchPort={approve(input:PremiumDispatchRequest):Promise<unknown>};
export function createPremiumReturnDispatchJoint(port:ProtectedPremiumDispatchPort,siteOrigin:string):PremiumReturnDispatch{
 const origin=new URL(siteOrigin);
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.port||origin.pathname!=='/'||origin.search||origin.hash||origin.origin!==siteOrigin)throw Error('activation_closed');
 const url=origin.origin+'/account/premium/return';
 return Object.freeze({async approve(p){
  if(p.kind!=='subscription.create'||p.plan!=='effect'||!p.billing_configuration||p.billing_configuration.return_adapter_version!=='premium_return_v1')return null;
  const result=await port.approve({subaction_id:p.subaction_id,lease_generation:p.lease_generation,operation_revision:p.operation_revision,configuration_id:p.billing_configuration.configuration_id,configuration_revision:p.billing_configuration.revision});
  return result===true?{success_url:url,cancel_url:url}:null;
 }});
}
