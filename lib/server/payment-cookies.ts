// Private encrypted intent cookies allocate operation IDs before side effects.
// Return cookies carry the existing92-byte apr1 token, never a second codec.
import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { canonicalRequest } from '../payments/bridge-v1/scripts/backend/web-payment-contract.mjs'
import type { NextRequest, NextResponse } from 'next/server'
export const PAYMENT_INTENT_COOKIE = '__Host-ante-payment-intent'
export const PAYMENT_RETURN_COOKIE = '__Host-ante-payment-return'
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict' as const, path: '/' }
export type PaymentIntent = { owner: string; requestId: string; operationId: string; action: string; input: Record<string, unknown>; admissionId: string; browserNonce: string; expiresAt: number; revocation?: PaymentIntent }
// Duplicate private cookie names are ambiguous and cannot select another lineage.
export function singlePaymentCookie(request: NextRequest, name: string): string | null {
 const raw=request.headers.get('cookie') ?? ''; if(raw.length>16384) throw new Error('Invalid cookies')
 const values=raw.split(';').map(p=>p.trim()).filter(p=>p.startsWith(name+'='));if(values.length>1)throw new Error('Invalid cookies')
 return values.length===1?values[0].slice(name.length+1):null
}
export function paymentCookieKey(value: string | undefined): Buffer | null {
 if(!value || !/^[A-Za-z0-9_-]{43}$/.test(value))return null
 const key=Buffer.from(value,'base64url');return key.length===32 && key.toString('base64url')===value?key:null
}
export function newPaymentIntent(owner: string, requestId: string, action: string, input: Record<string, unknown>, now=Date.now()): PaymentIntent {
 return {owner,requestId,operationId:randomUUID(),action,input,admissionId:randomUUID(),browserNonce:randomBytes(32).toString('base64url'),expiresAt:now+1800000}
}
export function encodePaymentIntent(intent: PaymentIntent,key: Buffer) {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('ante-payment-intent-v1'))
 const payload=Buffer.concat([cipher.update(JSON.stringify(intent),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),payload]).toString('base64url')
}
export function decodePaymentIntent(token: string | null,key: Buffer,owner: string,now=Date.now()): PaymentIntent | null {
 if(!token)return null
 if(token.length>4096 || !/^[A-Za-z0-9_-]+$/.test(token))throw new Error('Invalid intent')
 try {const bytes=Buffer.from(token,'base64url');if(bytes.toString('base64url')!==token || bytes.length<29)throw new Error('Invalid intent');const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(Buffer.from('ante-payment-intent-v1'));decipher.setAuthTag(bytes.subarray(12,28));const value=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8')) as PaymentIntent;
 const valid=(intent:PaymentIntent)=>intent.owner===owner && Number.isSafeInteger(intent.expiresAt) && intent.expiresAt>now && intent.expiresAt<=now+1800000 && /^[A-Za-z0-9_-]{43}$/.test(intent.browserNonce) && !!intent.operationId && !!intent.admissionId;
 if(!valid(value))throw new Error('Invalid intent');
 // Only one consent-revoke child is allowed. It cannot nest, replace a provider
 // intention or extend its original cookie lifetime; the same AEAD codec binds
 // both ordinary B1 operation payloads to the verified owner.
 if(value.revocation && (!valid(value.revocation)||value.action==='consent.revoke'||value.revocation.action!=='consent.revoke'||value.revocation.revocation||value.revocation.expiresAt!==value.expiresAt))throw new Error('Invalid intent');return value
 }catch{throw new Error('Invalid intent')}
}
// An identical prepare ACK retry retains all originally allocated identifiers.
export function preparePaymentIntent(prior: PaymentIntent | null,owner: string,requestId: string,action: string,input: Record<string, unknown>) {
 if(prior?.requestId===requestId){if(prior.action!==action || canonicalRequest(prior.input)!==canonicalRequest(input))throw new Error('Intent conflict');return prior}
 return newPaymentIntent(owner,requestId,action,input)
}
export function installPaymentIntent(response: NextResponse,intent: PaymentIntent,key: Buffer){response.cookies.set(PAYMENT_INTENT_COOKIE,encodePaymentIntent(intent,key),{...cookieOptions,expires:new Date(intent.expiresAt)})}
export function paymentBrowserDigest(intent: PaymentIntent){return createHash('sha256').update('ante-payment-browser-v1:'+intent.owner+':'+intent.browserNonce).digest('hex')}
export function installPaymentReturn(response: NextResponse,token: string,expiryMicroseconds: string) {
 if(!/^apr1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/.test(token) || token.length!==92 || !/^[1-9][0-9]{0,19}$/.test(expiryMicroseconds))throw new Error('Invalid return state')
 const expires=Number(BigInt(expiryMicroseconds)/1000n);if(!Number.isSafeInteger(expires)||expires<=Date.now()||expires>Date.now()+300000)throw new Error('Invalid return expiry')
 response.cookies.set(PAYMENT_RETURN_COOKIE,token,{...cookieOptions,expires:new Date(expires)})
}
