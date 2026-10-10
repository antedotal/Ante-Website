// Purpose-specific composition of the accepted Premium capsule/ticket reader
// with the selected joined parser/client. Browser redirects grant no entitlement;
// only the original Checkout GET and fresh final owner consumption deliver a URL.
import {createPremiumCapsule,premiumCapsuleDigest,verifyPremiumCapsule} from '../../../scripts/backend/web-payment-premium-return-capsule.mjs';
import {exact,internalId,paymentRequestHash,parsePermitJoint} from './webPaymentProviderContractJoint.ts';
import {createProviderClientJoint,type Provisioning,type GuardedTransport} from './webPaymentProviderClientJoint.ts';
import {safeCheckoutUrl} from './webPaymentPremiumCheckoutUrlJoint.ts';
export type PremiumReturnLineage={ownerId:string;operationId:string;browserDigest:string;returnAdmissionId:string;capsule:string};
export type PremiumReturnOwner={fresh():Promise<void>;read(input:Record<string,unknown>):Promise<unknown>;consume(input:Record<string,unknown>):Promise<unknown>};
export type PremiumReturnOptions={readCapability(digest:string):Promise<unknown>;loadKey(reference:string,revision:number):Promise<Uint8Array|null>;provider:{provision:Provisioning;credential():string;transport:GuardedTransport}};
// Original SQL microseconds remain exact; neither a current resource revision
// nor a rounded Date can extend the original issuing capability's lifetime.
function timestampMicroseconds(value:unknown):bigint|null {if(typeof value!=='string')return null;const match=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.([0-9]{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/.exec(value),milliseconds=Date.parse(value);if(!match||!Number.isSafeInteger(milliseconds))return null;return BigInt(milliseconds)*1000n+BigInt((match[1]??'').padEnd(6,'0').slice(3))}
export async function continuePremiumReturnJoint(options:PremiumReturnOptions,owner:PremiumReturnOwner,lineage:PremiumReturnLineage){
 await owner.fresh();
 const digest=premiumCapsuleDigest(lineage.capsule),raw=await owner.read({token_digest:digest,browser_digest:lineage.browserDigest,return_admission_id:lineage.returnAdmissionId});
 if(!exact(raw,['metadata','capability_digest','original_return_admission_id']))throw Error('browser_lineage_required');
 const r=raw as {metadata:Record<string,unknown>;capability_digest:string;original_return_admission_id:string},m=structuredClone(r.metadata);
 createPremiumCapsule(m,new Uint8Array(32));
 if(r.original_return_admission_id!==lineage.returnAdmissionId||m.owner_id!==lineage.ownerId||m.begin_operation_id!==lineage.operationId||m.browser_digest!==lineage.browserDigest||BigInt(String(m.expires_at_unix_microseconds))<=BigInt(Date.now())*1000n||typeof r.capability_digest!=='string'||!/^[0-9a-f]{64}$/.test(r.capability_digest))throw Error('browser_lineage_required');
 const key=await options.loadKey(String(m.key_reference_id),Number(m.key_reference_revision));
 if(!key||!verifyPremiumCapsule(m,key,lineage.capsule))throw Error('browser_lineage_required');
 const capability=await options.readCapability(r.capability_digest);
 // The existing owner port rechecks Auth and final SQL fences before returning
 // a literal ACK. Lost ACK never exposes the original private Checkout URL.
 const consume=async(ticketId:string)=>{await owner.fresh();return await owner.consume({family_id:m.family_id,token_digest:digest,browser_digest:lineage.browserDigest,return_admission_id:m.return_admission_id,ticket_id:ticketId})===true;};
 try{
  if(!exact(capability,['permit','ticket']))throw new Error('browser_lineage_required');const c=capability as {permit:unknown;ticket:Record<string,unknown>},p=parsePermitJoint(c.permit),t=c.ticket
  if(!exact(t,'ticket_id owner_id subscription_id subscription_revision subaction_id operation_revision observation_id lease_generation provider_checkout_id transport_approval_id created_at expires_at'.split(' '))||!internalId(t.ticket_id)||!internalId(t.observation_id)||!internalId(t.transport_approval_id)||t.subaction_id!==p.subaction_id||!Number.isFinite(Date.parse(String(t.created_at)))||Date.parse(String(t.created_at))>=Date.parse(String(t.expires_at))||timestampMicroseconds(t.expires_at)!==BigInt(String(m.expires_at_unix_microseconds))||p.customer_id!==m.customer_id||p.customer_revision!==m.customer_provider_revision||p.consent_id!==m.consent_id||p.operation_revision!==m.begin_operation_revision||p.configuration_id!==m.provider_configuration_id||p.configuration.revision!==m.provider_configuration_revision||p.configuration_hash!==m.provider_configuration_hash||!p.billing_configuration||paymentRequestHash(p.billing_configuration)!==m.billing_configuration_hash||p.billing_configuration.configuration_id!==m.billing_configuration_id||p.billing_configuration.revision!==m.billing_configuration_revision||p.billing_configuration.return_adapter_version!=='premium_return_v1'||p.kind!=='subscription.create'||p.plan!=='retrieve'||p.owner_id!==lineage.ownerId||p.operation_id!==lineage.operationId||p.subject_id!==m.subscription_id||t.subscription_revision!==m.subscription_revision||p.object_id!==m.provider_checkout_id||t.owner_id!==p.owner_id||t.subscription_id!==p.subject_id||t.lease_generation!==p.lease_generation||t.operation_revision!==p.operation_revision||t.provider_checkout_id!==p.object_id||Date.parse(String(t.expires_at))<=Date.now()||t.expires_at!==p.lease_expires_at)throw new Error('browser_lineage_required')
  const {sdk}=createProviderClientJoint(p,options.provider.provision,options.provider.credential,options.provider.transport),session=await options.provider.transport.run(()=>sdk.checkout.sessions.retrieve(p.object_id!,undefined,{maxNetworkRetries:0}))
  if(session.id!==p.object_id||session.object!=='checkout.session'||session.mode!=='subscription'||session.status!=='open'||session.customer!==p.parameters.customer||session.livemode!==(p.configuration.environment==='live')||session.metadata?.ante_operation!==p.operation_id||session.metadata?.ante_subscription!==p.subject_id||!safeCheckoutUrl(session.url)||Date.parse(String(t.expires_at))<=Date.now()||!await consume(String(t.ticket_id))||Date.parse(String(t.expires_at))<=Date.now())throw new Error('operation_pending')
  return {purpose:'premium.subscribe.return' as const,checkout_url:session.url,expires_at:String(t.expires_at)}
 }finally{await options.provider.transport.quiescence()}
}
