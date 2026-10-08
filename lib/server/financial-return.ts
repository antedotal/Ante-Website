// Purpose adapters bind the original SQL family and byte/MAC capsule before a
// controlled transient delivery. They never allocate provider objects, replace
// an uncertain operation, grant entitlement, start a task or accept query data.
import 'server-only'
import {createLongCollectionCapsule,longCollectionCapsuleDigest,verifyLongCollectionCapsule} from '../payments/collection-v4/scripts/backend/web-payment-long-collection-return-capsule.mjs'
import {parsePermitV4} from '../payments/collection-v4/supabase/functions/_shared/webPaymentProviderContractV4'
import {ProviderRepositoryV4,type PrivateRpc as CollectionRpc} from '../payments/collection-v4/supabase/functions/_shared/webPaymentProviderRepositoryV4'
import {readLongCollectionContinuationV4} from '../payments/collection-v4/supabase/functions/_shared/webPaymentProviderV4'
import { createShortHoldCapsule, shortHoldCapsuleDigest, verifyShortHoldCapsule } from '../payments/bridge-v3/scripts/backend/web-payment-short-hold-return-capsule.mjs'
import { createPremiumCapsule, premiumCapsuleDigest, verifyPremiumCapsule } from '../payments/return-v1/premium-return-capsule.mjs'
import { exact, internalId } from '../payments/bridge-v3/scripts/backend/web-payment-provider-contract.mjs'
import { ProviderRepositoryV3, type PrivateRpc } from '../payments/bridge-v3/supabase/functions/_shared/webPaymentProviderRepositoryV3'
import { readShortHoldContinuationV3 } from '../payments/bridge-v3/supabase/functions/_shared/webPaymentProviderV3'
import { type GuardedTransport, type Provisioning } from '../payments/bridge-v3/supabase/functions/_shared/webPaymentProviderClientV3'
import { parsePermitV3 as parsePremiumPermit } from '../payments/premium-return-v1/webPaymentProviderContractV3'
import { createProviderClientV3 as createPremiumClient } from '../payments/premium-return-v1/webPaymentProviderClientV3'
import { safeCheckoutUrl } from '../payments/financial-ui-model'
import type { FinancialOwner, ReturnPurpose, createFinancialSupabase } from './financial-transport'
export type FinancialReturnLineage={ownerId:string;operationId:string;browserDigest:string;returnAdmissionId:string;capsule?:string;install(token:string,expiresMicroseconds:string):void}
export type FinancialReturnOptions={services:ReturnType<typeof createFinancialSupabase>;provider:{provision:Provisioning;credential():string;transport:GuardedTransport};loadKey(purpose:ReturnPurpose,reference:string,revision:number):Promise<Uint8Array|null>}
const codecs={collection:{create:createLongCollectionCapsule,digest:longCollectionCapsuleDigest,verify:verifyLongCollectionCapsule},hold:{create:createShortHoldCapsule,digest:shortHoldCapsuleDigest,verify:verifyShortHoldCapsule},premium:{create:createPremiumCapsule,digest:premiumCapsuleDigest,verify:verifyPremiumCapsule}}
// SQL JSON timestamps retain up to six fractional digits. Preserve their
// original microseconds when comparing the issuing ticket/capsule expiry;
// Date.parse alone truncates that precision and would reject valid SQL tickets.
function timestampMicroseconds(value:unknown):bigint|null {if(typeof value!=='string')return null;const match=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.([0-9]{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/.exec(value),milliseconds=Date.parse(value);if(!match||!Number.isSafeInteger(milliseconds))return null;return BigInt(milliseconds)*1000n+BigInt((match[1]??'').padEnd(6,'0').slice(3))}
// The fixed SQL read-admission port binds root or registered child metadata to
// the unchanged encrypted primary admission. Only that protected parent envelope
// permits a child ID; exact capsule geometry/purpose/key still bind final consume.
function metadata(value:unknown,purpose:ReturnPurpose,lineage:FinancialReturnLineage){if(!exact(value,['metadata','original_return_admission_id'])||(value as Record<string,unknown>).original_return_admission_id!==lineage.returnAdmissionId)throw new Error('browser_lineage_required');const m=(value as {metadata:Record<string,unknown>}).metadata;codecs[purpose].create(m,new Uint8Array(32));if(m.owner_id!==lineage.ownerId||m.begin_operation_id!==lineage.operationId||m.browser_digest!==lineage.browserDigest||BigInt(String(m.expires_at_unix_microseconds))<=BigInt(Date.now())*1000n)throw new Error('browser_lineage_required');return structuredClone(m)}
export async function issueFinancialReturn(options:FinancialReturnOptions,owner:FinancialOwner,purpose:ReturnPurpose,input:Record<string,unknown>,lineage:FinancialReturnLineage,observe:(p:Promise<void>)=>void){const m=metadata(await owner.create(purpose,{...input,browser_digest:lineage.browserDigest,return_admission_id:lineage.returnAdmissionId}),purpose,lineage),key=await options.loadKey(purpose,String(m.key_reference_id),Number(m.key_reference_revision));if(!key)throw new Error('activation_closed');const capsule=codecs[purpose].create(m,key);if(await options.services.bind(purpose,observe).bind({family_id:m.family_id,token_digest:capsule.token_digest,metadata_hash:capsule.metadata_hash})!==true)throw new Error('browser_lineage_required');await owner.fresh();lineage.install(capsule.token,String(m.expires_at_unix_microseconds));return {state:'ready'} as const}
// Every issued root/child is read only through its exact original capsule. Lost
// secret ACK never permits reusing a consumed capability; a separate prepare can
// issue a fresh current read child without replacing the financial operation.
export async function continueFinancialReturn(options:FinancialReturnOptions,owner:FinancialOwner,purpose:ReturnPurpose,lineage:FinancialReturnLineage,observe:(p:Promise<void>)=>void){
 if(!lineage.capsule)throw new Error('browser_lineage_required');const digest=codecs[purpose].digest(lineage.capsule),raw=await owner.read(purpose,{token_digest:digest,browser_digest:lineage.browserDigest,return_admission_id:lineage.returnAdmissionId});if(!exact(raw,['metadata','capability_digest','original_return_admission_id']))throw new Error('browser_lineage_required');const r=raw as {metadata:Record<string,unknown>;capability_digest:string;original_return_admission_id:string},m=metadata({metadata:r.metadata,original_return_admission_id:r.original_return_admission_id},purpose,lineage),key=await options.loadKey(purpose,String(m.key_reference_id),Number(m.key_reference_revision));if(!key||!codecs[purpose].verify(m,key,lineage.capsule))throw new Error('browser_lineage_required')
 const capability=await options.services.secret(purpose,observe).read(r.capability_digest)
 const consume=async(ticketId:string)=>await owner.consume(purpose,{family_id:m.family_id,token_digest:digest,browser_digest:lineage.browserDigest,return_admission_id:m.return_admission_id,ticket_id:ticketId})===true
 try{
  if(purpose==='collection'){
   // The accepted V4 engine verifies the same original long intent. The fixed
   // family context supplies its ticket; final owner consume is the only return
   // authority. No claim/dispatch/confirm/effect RPC is exposed to this reader.
   if(!exact(capability,['permit','ticket']))throw new Error('browser_lineage_required')
   const c=capability as {permit:unknown;ticket:Record<string,unknown>},p=parsePermitV4(c.permit),t=c.ticket
   if(p.kind!=='collection.create'||p.owner_id!==m.owner_id||p.operation_id!==m.begin_operation_id||p.operation_revision!==m.begin_operation_revision||p.subject_id!==m.commitment_id||p.subject_revision!==m.commitment_revision||p.object_id!==m.provider_intent_id||p.customer_id!==m.customer_id||p.customer_revision!==m.customer_provider_revision||p.consent_id!==m.consent_id||p.configuration_id!==m.provider_configuration_id||p.configuration.revision!==m.provider_configuration_revision||p.configuration_hash!==m.provider_configuration_hash||p.collection_configuration?.configuration_id!==m.collection_configuration_id||p.collection_configuration?.revision!==m.collection_configuration_revision||t.provider_intent_id!==m.provider_intent_id||timestampMicroseconds(t.expires_at)!==BigInt(String(m.expires_at_unix_microseconds)))throw new Error('browser_lineage_required')
   const rpc:CollectionRpc=async(name,args)=>{if(name==='collection_continuation'){if(args.p_commitment!==m.commitment_id||args.p_revision!==m.commitment_revision)throw new Error('browser_lineage_required');return capability}if(name==='consume_collection_continuation'&&internalId(args.p_ticket))return consume(String(args.p_ticket));throw new Error('activation_closed')}
   const ticket=await readLongCollectionContinuationV4(new ProviderRepositoryV4(rpc,'owner-long-collection-return'),String(m.commitment_id),Number(m.commitment_revision),options.provider.provision,options.provider.credential,options.provider.transport)
   if(!ticket)throw new Error('operation_pending');return ticket
  }
  if(purpose==='hold'){
   // The sole V3 reader still owns PaymentIntent verification. Its repository
   // receives the original ticket rather than allocating a replacement ticket;
   // final SQL consume includes fresh Auth and the entire capsule family fence.
   const rpc:PrivateRpc=async(name,args)=>{if(name==='hold_continuation'){if(args.p_commitment!==m.commitment_id||args.p_revision!==m.commitment_revision)throw new Error('browser_lineage_required');return capability}if(name==='consume_hold_continuation'&&internalId(args.p_ticket))return consume(String(args.p_ticket));throw new Error('activation_closed')},repository=new ProviderRepositoryV3(rpc,'owner-short-hold-return')
   const ticket=await readShortHoldContinuationV3(repository,String(m.commitment_id),Number(m.commitment_revision),options.provider.provision,options.provider.credential,options.provider.transport);if(!ticket)throw new Error('operation_pending');return ticket
  }
  // Premium URL transport retrieves only the known original Checkout Session
  // under its approved one-use ticket. Completion/payment_status never supplies
  // paid intervals: entitlement continues through the existing verified engine.
  if(!exact(capability,['permit','ticket']))throw new Error('browser_lineage_required');const c=capability as {permit:unknown;ticket:Record<string,unknown>},p=parsePremiumPermit(c.permit),t=c.ticket
  if(!exact(t,'ticket_id owner_id subscription_id subscription_revision subaction_id operation_revision observation_id lease_generation provider_checkout_id transport_approval_id created_at expires_at'.split(' '))||!internalId(t.ticket_id)||!internalId(t.observation_id)||!internalId(t.transport_approval_id)||t.subaction_id!==p.subaction_id||!Number.isFinite(Date.parse(String(t.created_at)))||Date.parse(String(t.created_at))>=Date.parse(String(t.expires_at))||timestampMicroseconds(t.expires_at)!==BigInt(String(m.expires_at_unix_microseconds))||p.customer_id!==m.customer_id||p.customer_revision!==m.customer_provider_revision||p.consent_id!==m.consent_id||p.operation_revision!==m.begin_operation_revision||p.configuration_id!==m.provider_configuration_id||p.configuration.revision!==m.provider_configuration_revision||p.configuration_hash!==m.provider_configuration_hash||!p.billing_configuration||p.billing_configuration.configuration_id!==m.billing_configuration_id||p.billing_configuration.revision!==m.billing_configuration_revision||p.billing_configuration.return_adapter_version!=='premium_return_v1'||p.kind!=='subscription.create'||p.plan!=='retrieve'||p.owner_id!==lineage.ownerId||p.operation_id!==lineage.operationId||p.subject_id!==m.subscription_id||t.subscription_revision!==m.subscription_revision||p.object_id!==m.provider_checkout_id||t.owner_id!==p.owner_id||t.subscription_id!==p.subject_id||t.lease_generation!==p.lease_generation||t.operation_revision!==p.operation_revision||t.provider_checkout_id!==p.object_id||Date.parse(String(t.expires_at))<=Date.now()||t.expires_at!==p.lease_expires_at)throw new Error('browser_lineage_required')
  const {sdk}=createPremiumClient(p,options.provider.provision,options.provider.credential,options.provider.transport),session=await options.provider.transport.run(()=>sdk.checkout.sessions.retrieve(p.object_id!,undefined,{maxNetworkRetries:0}))
  if(session.id!==p.object_id||session.object!=='checkout.session'||session.mode!=='subscription'||session.status!=='open'||session.customer!==p.parameters.customer||session.livemode!==(p.configuration.environment==='live')||session.metadata?.ante_operation!==p.operation_id||session.metadata?.ante_subscription!==p.subject_id||!safeCheckoutUrl(session.url)||Date.parse(String(t.expires_at))<=Date.now()||!await consume(String(t.ticket_id))||Date.parse(String(t.expires_at))<=Date.now())throw new Error('operation_pending')
  return {purpose:'premium.subscribe.return' as const,checkout_url:session.url,expires_at:String(t.expires_at)}
 }finally{await options.provider.transport.quiescence()}
}
