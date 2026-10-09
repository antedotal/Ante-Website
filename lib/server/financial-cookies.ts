// Financial operation correlations are ACKed before execution in purpose-bound
// encrypted HttpOnly cookies. This is browser intent storage, not a SQL/provider
// journal or a payment-return capsule; original SQL receipts remain authoritative.
import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { canonicalRequest, exact, internalId } from '../payments/bridge-v3/scripts/backend/web-payment-provider-contract.mjs'
import type { FinancialAction } from '../payments/financial-ui-model'
import type { NextResponse } from 'next/server'
export type FinancialPurpose='task'|'premium'
export type FinancialIntent={owner:string;requestId:string;operationId:string;action:FinancialAction;input:Record<string,unknown>;admissionId:string;browserNonce:string;expiresAt:number}
export type FinancialFamily={primary:FinancialIntent;secondary:FinancialIntent|null}
export const financialCookieNames={task:'__Host-ante-financial-task',premium:'__Host-ante-premium-intent'} as const
export const financialReturnNames={hold:'__Host-ante-short-hold-return',premium:'__Host-ante-premium-return'} as const
const options={httpOnly:true,secure:true,sameSite:'strict' as const,path:'/'}
// Bound the two slots to their one business purpose. A child cannot nest, switch
// action families, change owner or extend the primary cookie's original lifetime.
function validate(family:FinancialFamily,purpose:FinancialPurpose,now=Date.now()) {
 if(!exact(family,['primary','secondary']))throw new Error('browser_lineage_required')
 const valid=(v:FinancialIntent)=>exact(v,['owner','requestId','operationId','action','input','admissionId','browserNonce','expiresAt'])&&[v.owner,v.requestId,v.operationId,v.admissionId].every(internalId)&&v.input!==null&&typeof v.input==='object'&&!Array.isArray(v.input)&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>now&&v.expiresAt<=now+1800000&&/^[A-Za-z0-9_-]{43}$/.test(v.browserNonce)
 const primary=purpose==='task'?'task.quote':'premium.checkout',secondary=purpose==='task'?'task.admit':'premium.cancel'
 if(!valid(family.primary)||!(family.primary.action===primary||purpose==='premium'&&family.primary.action==='premium.cancel')||family.secondary&&family.primary.action==='premium.cancel'||family.secondary&&(!valid(family.secondary)||family.secondary.action!==secondary||family.secondary.owner!==family.primary.owner||family.secondary.expiresAt!==family.primary.expiresAt))throw new Error('browser_lineage_required')
}
export function newFinancialIntent(owner:string,requestId:string,action:FinancialAction,input:Record<string,unknown>):FinancialIntent {return {owner,requestId,operationId:randomUUID(),action,input:structuredClone(input),admissionId:randomUUID(),browserNonce:randomBytes(32).toString('base64url'),expiresAt:Date.now()+1800000}}
// Retry reads exactly the same stored operation. Callers must prove SQL terminal
// progress before passing null to allocate a different original intention.
export function prepareFinancialSlot(previous:FinancialIntent|null,owner:string,requestId:string,action:FinancialAction,input:Record<string,unknown>) {if(previous?.requestId===requestId){if(previous.owner!==owner||previous.action!==action||canonicalRequest(previous.input)!==canonicalRequest(input))throw new Error('payload_conflict');return previous}return newFinancialIntent(owner,requestId,action,input)}
export function encodeFinancialFamily(family:FinancialFamily,key:Buffer,purpose:FinancialPurpose) {validate(family,purpose);if(key.length!==32)throw new Error('activation_closed');const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('ante-financial-intent-v1:'+purpose));const bytes=Buffer.concat([cipher.update(JSON.stringify(family),'utf8'),cipher.final()]),token=Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');if(token.length>4096)throw new Error('invalid_input');return token}
export function decodeFinancialFamily(token:string|null,key:Buffer,purpose:FinancialPurpose,owner:string):FinancialFamily|null {if(!token)return null;try{if(token.length>4096||!/^[A-Za-z0-9_-]+$/.test(token))throw new Error();const bytes=Buffer.from(token,'base64url');if(bytes.length<29||bytes.toString('base64url')!==token)throw new Error();const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(Buffer.from('ante-financial-intent-v1:'+purpose));decipher.setAuthTag(bytes.subarray(12,28));const family=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8')) as FinancialFamily;validate(family,purpose);if(family.primary.owner!==owner)throw new Error();return family}catch{throw new Error('browser_lineage_required')}}
export function installFinancialFamily(response:NextResponse,family:FinancialFamily,key:Buffer,purpose:FinancialPurpose){response.cookies.set(financialCookieNames[purpose],encodeFinancialFamily(family,key,purpose),{...options,expires:new Date(family.primary.expiresAt)})}
export function financialBrowserDigest(intent:FinancialIntent,purpose:FinancialPurpose){return createHash('sha256').update('ante-financial-browser-v1:'+purpose+':'+intent.owner+':'+intent.browserNonce).digest('hex')}
// Only the trusted purpose adapter installs an ash1/asp1 return capsule. Its
// original SQL expiry is retained; browser storage or query strings are unused.
export function installFinancialReturn(response:NextResponse,purpose:'hold'|'premium',token:string,expiryMicroseconds:string){const prefix=purpose==='hold'?'ash1':'asp1';if(token.length!==92||!new RegExp('^'+prefix+'\\.[A-Za-z0-9_-]{43}\\.[A-Za-z0-9_-]{43}$').test(token)||!/^[1-9][0-9]{0,19}$/.test(expiryMicroseconds))throw new Error('browser_lineage_required');const expires=Number(BigInt(expiryMicroseconds)/1000n);if(!Number.isSafeInteger(expires)||expires<=Date.now()||expires>Date.now()+300000)throw new Error('browser_lineage_required');response.cookies.set(financialReturnNames[purpose],token,{...options,expires:new Date(expires)})}
