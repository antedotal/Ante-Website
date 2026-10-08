// Browser-safe exact projection of original commitment history. Unknown fields,
// provider credentials and malformed identities fail closed before rendering.
import {exact,internalId} from './browser-dto-v1/primitives.mjs'
export type ReviewCase={case_id:string;kind:'appeal'|'issuer_dispute';state:string}
export type OwnerReview={commitment_id:string;task_id:string;revision:number;amount_minor:string;currency:string;started_at:string|null;funding_state:string|null;outcome:{outcome_id:string;outcome_revision:number;outcome_hash:string;outcome:'completed'|'failed'}|null;cases:ReviewCase[];finality:{action:'release'|'collect';financial_dispatch:false}|null}
export type HistoryItem={identity:string;kind:string;occurred_at:string}
const integer=(v:unknown)=>Number.isInteger(v)&&Number(v)>=1&&Number(v)<=2147483647
const hash=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)
const stamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(v)&&Number.isFinite(Date.parse(v))
export function ownerReview(value:unknown,commitment:string):OwnerReview {
 if(!exact(value,['authority_kind','commitment_id','task_id','revision','amount_minor','currency','started_at','funding_state','outcome','cases','finality']))throw Error('Unavailable review')
 const v=value as OwnerReview&{authority_kind:string}
 if(v.authority_kind!=='financial-commitment-view-v1'||v.commitment_id!==commitment||!internalId(v.commitment_id)||!internalId(v.task_id)||!integer(v.revision)||typeof v.amount_minor!=='string'||! /^[1-9][0-9]{0,15}$/.test(v.amount_minor)||BigInt(v.amount_minor)>9007199254740991n||v.currency!=='AUD'||v.started_at!==null&&!stamp(v.started_at)||![null,'pending','authorized','active_unsecured','requires_action','unknown','declined','expired_unsecured'].includes(v.funding_state))throw Error('Unavailable review')
 if(v.outcome){const o=v.outcome as OwnerReview['outcome']&{authority_kind:string;proof_resolution_id:string;proof_resolution_revision:number;proof_resolution_hash:string};if(!exact(o,['authority_kind','outcome_id','outcome_revision','outcome_hash','outcome','proof_resolution_id','proof_resolution_revision','proof_resolution_hash'])||o.authority_kind!=='financial-ledger-binding-v1'||!internalId(o.outcome_id)||o.outcome_revision!==1||!hash(o.outcome_hash)||!internalId(o.proof_resolution_id)||o.proof_resolution_revision!==1||!hash(o.proof_resolution_hash)||!['completed','failed'].includes(o.outcome))throw Error('Unavailable review')}
 if(!Array.isArray(v.cases)||v.cases.length>2||new Set(v.cases.map(c=>c.kind)).size!==v.cases.length||v.cases.some(c=>!exact(c,['case_id','kind','state'])||!internalId(c.case_id)||!['appeal','issuer_dispute'].includes(c.kind)||!['reviewer_pending','ante_pending','approved','denied','dispute_pending'].includes(c.state)))throw Error('Unavailable review')
 if(v.finality){const f=v.finality as NonNullable<OwnerReview['finality']>&{finality_id:string};if(!exact(f,['finality_id','action','financial_dispatch'])||!internalId(f.finality_id)||!['release','collect'].includes(f.action)||f.financial_dispatch!==false)throw Error('Unavailable review')}
 return structuredClone(v)
}
export function ownerHistory(value:unknown,after:string|null):HistoryItem[]{
 if(!exact(value,['commitment_contract_version','authority_kind','items']))throw Error('Unavailable history')
 const v=value as {commitment_contract_version:number;authority_kind:string;items:HistoryItem[]}
 if(v.commitment_contract_version!==1||v.authority_kind!=='financial-history-v1'||!Array.isArray(v.items)||v.items.length>25)throw Error('Unavailable history')
 let previous=after
 for(const i of v.items){if(!exact(i,['identity','kind','occurred_at'])||!internalId(i.identity)||previous!==null&&i.identity<=previous||!['case','financial_outcome','proof_resolution_binding','delivered_notice','financial_finality','orchestration_work'].includes(i.kind)||!stamp(i.occurred_at))throw Error('Unavailable history');previous=i.identity}
 return structuredClone(v.items)
}
// Copy distinguishes an original ledger decision from completed settlement.
export function reviewStatus(v:OwnerReview){if(v.cases.some(c=>['reviewer_pending','ante_pending','dispute_pending'].includes(c.state)))return 'Review pending. No collection is authorized by this report.';if(v.finality)return v.finality.action==='release'?'Release decision recorded. Settlement progress must be confirmed separately.':'Collection decision recorded. Payment progress must be confirmed separately.';if(!v.outcome)return 'Outcome pending or unknown. Pending proof and reviewer silence do not authorize collection.';return 'Outcome recorded. Financial finality is not yet confirmed.'}
// Returning owners discover only fixed current-owner original commitments. The
// cursor is an internal identity; it selects no effect, provider object or outcome.
export type ReviewCommitment={commitment_id:string;task_id:string;revision:number;amount_minor:string;currency:'AUD';started_at:string|null}
export type ReviewEvidence={asset_id:string;created_at:string}
function boundedPage<T>(value:unknown,keys:string[],identity:(item:T)=>string,validate:(item:T)=>boolean,after:string|null){if(!exact(value,keys))throw Error('Unavailable owner page');const v=value as {review_projection_version:number;items:T[];next_cursor:string|null};if(v.review_projection_version!==1||!Array.isArray(v.items)||v.items.length>25||v.next_cursor!==null&&!internalId(v.next_cursor))throw Error('Unavailable owner page');let previous=after;for(const item of v.items){const id=identity(item);if(!validate(item)||!internalId(id)||previous!==null&&id<=previous)throw Error('Unavailable owner page');previous=id}if(v.next_cursor!==null&&(v.items.length!==25||v.next_cursor!==previous))throw Error('Unavailable owner page');return structuredClone(v)}
export function reviewCommitments(value:unknown,after:string|null){return boundedPage<ReviewCommitment>(value,['review_projection_version','items','next_cursor'],i=>i.commitment_id,i=>exact(i,['commitment_id','task_id','revision','amount_minor','currency','started_at'])&&internalId(i.task_id)&&integer(i.revision)&&typeof i.amount_minor==='string'&&/^[1-9][0-9]{0,15}$/.test(i.amount_minor)&&BigInt(i.amount_minor)<=9007199254740991n&&i.currency==='AUD'&&(i.started_at===null||stamp(i.started_at)),after)}
export function reviewEvidence(value:unknown,commitment:string,after:string|null){if(!value||typeof value!=='object'||(value as {commitment_id:unknown}).commitment_id!==commitment||!internalId(commitment))throw Error('Unavailable evidence');return boundedPage<ReviewEvidence>(value,['review_projection_version','commitment_id','items','next_cursor'],i=>i.asset_id,i=>exact(i,['asset_id','created_at'])&&stamp(i.created_at),after)}
