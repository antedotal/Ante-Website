// Purpose adapters bind the original SQL family and byte/MAC capsule before a
// controlled transient delivery. They never allocate provider objects, replace
// an uncertain operation, grant entitlement, start a task or accept query data.
import 'server-only'
import {createLongCollectionCapsule,longCollectionCapsuleDigest,verifyLongCollectionCapsule} from '../payments/collection-v4/scripts/backend/web-payment-long-collection-return-capsule.mjs'
import {parsePermitJoint,paymentRequestHash} from '../payments/owned-card-joint/supabase/functions/_shared/webPaymentProviderContractJoint'
import {ProviderRepositoryJoint,type PrivateRpc} from '../payments/owned-card-joint/supabase/functions/_shared/webPaymentProviderRepositoryJoint'
import {readLongCollectionContinuationJoint,readShortHoldContinuationJoint} from '../payments/owned-card-joint/supabase/functions/_shared/webPaymentProviderJoint'
import {continuePremiumReturnJoint} from '../payments/owned-card-joint/supabase/functions/_shared/webPaymentPremiumContinuationJoint'
import { createShortHoldCapsule, shortHoldCapsuleDigest, verifyShortHoldCapsule } from '../payments/bridge-v3/scripts/backend/web-payment-short-hold-return-capsule.mjs'
import { createPremiumCapsule, premiumCapsuleDigest, verifyPremiumCapsule } from '../payments/return-v1/premium-return-capsule.mjs'
import { exact, internalId } from '../payments/bridge-v3/scripts/backend/web-payment-provider-contract.mjs'
import {type GuardedTransport,type Provisioning} from '../payments/owned-card-joint/supabase/functions/_shared/webPaymentProviderClientJoint'
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
// Match the complete immutable capsule to its protected current capability before
// the selected engine can construct an SDK. The same fences serve both purposes.
function boundOriginalAction(p:ReturnType<typeof parsePermitJoint>,t:Record<string,unknown>,m:Record<string,unknown>,purpose:'hold'|'collection'){
 const cfg=purpose==='hold'?p.hold_configuration:p.collection_configuration,kind=purpose==='hold'?'authorization.create':'collection.create',adapter=purpose==='hold'?'short_hold_return_v1':'long_collection_return_v1',prefix=purpose==='hold'?'hold':'collection'
 if(p.kind!==kind||p.plan!=='retrieve'||!cfg||cfg.continuation_adapter_version!==adapter||p.owner_id!==m.owner_id||p.operation_id!==m.begin_operation_id||p.operation_revision!==m.begin_operation_revision||p.subject_id!==m.commitment_id||p.subject_revision!==m.commitment_revision||p.object_id!==m.provider_intent_id||p.customer_id!==m.customer_id||p.customer_revision!==m.customer_provider_revision||p.consent_id!==m.consent_id||p.configuration_id!==m.provider_configuration_id||p.configuration.revision!==m.provider_configuration_revision||p.configuration_hash!==m.provider_configuration_hash||cfg.configuration_id!==m[prefix+'_configuration_id']||cfg.revision!==m[prefix+'_configuration_revision']||paymentRequestHash(cfg)!==m[prefix+'_configuration_hash']||t.provider_intent_id!==m.provider_intent_id||timestampMicroseconds(t.expires_at)!==BigInt(String(m.expires_at_unix_microseconds)))throw new Error('browser_lineage_required')
}
export async function issueFinancialReturn(options:FinancialReturnOptions,owner:FinancialOwner,purpose:ReturnPurpose,input:Record<string,unknown>,lineage:FinancialReturnLineage,observe:(p:Promise<void>)=>void){const m=metadata(await owner.create(purpose,{...input,browser_digest:lineage.browserDigest,return_admission_id:lineage.returnAdmissionId}),purpose,lineage),key=await options.loadKey(purpose,String(m.key_reference_id),Number(m.key_reference_revision));if(!key)throw new Error('activation_closed');const capsule=codecs[purpose].create(m,key);if(await options.services.bind(purpose,observe).bind({family_id:m.family_id,token_digest:capsule.token_digest,metadata_hash:capsule.metadata_hash})!==true)throw new Error('browser_lineage_required');await owner.fresh();lineage.install(capsule.token,String(m.expires_at_unix_microseconds));return {state:'ready'} as const}
// Every issued root/child is read only through its exact original capsule. Lost
// secret ACK never permits reusing a consumed capability; a separate prepare can
// issue a fresh current read child without replacing the financial operation.
export async function continueFinancialReturn(options:FinancialReturnOptions,owner:FinancialOwner,purpose:ReturnPurpose,lineage:FinancialReturnLineage,observe:(p:Promise<void>)=>void){
 if(purpose==='premium'){if(!lineage.capsule)throw new Error('browser_lineage_required');return continuePremiumReturnJoint({readCapability:digest=>options.services.secret('premium',observe).read(digest),loadKey:(reference,revision)=>options.loadKey('premium',reference,revision),provider:options.provider},{fresh:()=>owner.fresh(),read:input=>owner.read('premium',input),consume:input=>owner.consume('premium',input)},{...lineage,capsule:lineage.capsule})}
 if(!lineage.capsule)throw new Error('browser_lineage_required');const digest=codecs[purpose].digest(lineage.capsule),raw=await owner.read(purpose,{token_digest:digest,browser_digest:lineage.browserDigest,return_admission_id:lineage.returnAdmissionId});if(!exact(raw,['metadata','capability_digest','original_return_admission_id']))throw new Error('browser_lineage_required');const r=raw as {metadata:Record<string,unknown>;capability_digest:string;original_return_admission_id:string},m=metadata({metadata:r.metadata,original_return_admission_id:r.original_return_admission_id},purpose,lineage),key=await options.loadKey(purpose,String(m.key_reference_id),Number(m.key_reference_revision));if(!key||!codecs[purpose].verify(m,key,lineage.capsule))throw new Error('browser_lineage_required')
 const capability=await options.services.secret(purpose,observe).read(r.capability_digest)
 const consume=async(ticketId:string)=>await owner.consume(purpose,{family_id:m.family_id,token_digest:digest,browser_digest:lineage.browserDigest,return_admission_id:m.return_admission_id,ticket_id:ticketId})===true
 try{
  if(purpose==='collection'){
   // The selected Joint engine verifies the same original long intent. The fixed
   // family context supplies its ticket; final owner consume is the only return
   // authority. No claim/dispatch/confirm/effect RPC is exposed to this reader.
   if(!exact(capability,['permit','ticket']))throw new Error('browser_lineage_required')
   const c=capability as {permit:unknown;ticket:Record<string,unknown>},p=parsePermitJoint(c.permit),t=c.ticket
   boundOriginalAction(p,t,m,'collection')
   const rpc:PrivateRpc=async(name,args)=>{if(name==='collection_continuation'){if(args.p_commitment!==m.commitment_id||args.p_revision!==m.commitment_revision)throw new Error('browser_lineage_required');return capability}if(name==='consume_collection_continuation'&&internalId(args.p_ticket))return consume(String(args.p_ticket));throw new Error('activation_closed')}
   const ticket=await readLongCollectionContinuationJoint(new ProviderRepositoryJoint(rpc,'owner-long-collection-return'),String(m.commitment_id),Number(m.commitment_revision),options.provider.provision,options.provider.credential,options.provider.transport)
   if(!ticket)throw new Error('operation_pending');return ticket
  }
  if(purpose==='hold'){
   // The selected Joint reader owns PaymentIntent verification. Its repository
   // receives the original ticket rather than allocating a replacement ticket;
   // final SQL consume includes fresh Auth and the entire capsule family fence.
   if(!exact(capability,['permit','ticket']))throw new Error('browser_lineage_required');const c=capability as {permit:unknown;ticket:Record<string,unknown>};boundOriginalAction(parsePermitJoint(c.permit),c.ticket,m,'hold')
   const rpc:PrivateRpc=async(name,args)=>{if(name==='hold_continuation'){if(args.p_commitment!==m.commitment_id||args.p_revision!==m.commitment_revision)throw new Error('browser_lineage_required');return capability}if(name==='consume_hold_continuation'&&internalId(args.p_ticket))return consume(String(args.p_ticket));throw new Error('activation_closed')},repository=new ProviderRepositoryJoint(rpc,'owner-short-hold-return')
   const ticket=await readShortHoldContinuationJoint(repository,String(m.commitment_id),Number(m.commitment_revision),options.provider.provision,options.provider.credential,options.provider.transport);if(!ticket)throw new Error('operation_pending');return ticket
  }
 }finally{await options.provider.transport.quiescence()}
}
