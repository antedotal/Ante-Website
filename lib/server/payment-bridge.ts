// Thin website composition injects the one pinned B1 runtime; it defines no
// payment engine, provider executor, return codec, SQL or owner identity shim.
import 'server-only'
import { accountConfig } from '../supabase/config'
import { paymentWebsiteSourceEnabled } from '../payments/website-source-gate'
import { createPaymentSupabase } from '../payments/bridge-v1/supabase/functions/_shared/webPaymentOwnerSupabase'
import { createPaymentOwnerHttp, type PaymentHttpOptions } from '../payments/bridge-v1/supabase/functions/_shared/webPaymentOwnerHttp'
import { guardedTransportJoint, type Provisioning } from '../payments/owned-card-joint/supabase/functions/_shared/webPaymentProviderClientJoint'
import { paymentCookieKey } from './payment-cookies'
export type PaymentWebsiteBindings = { handler: ReturnType<typeof createPaymentOwnerHttp>; cookieKey: Buffer; publishableKey: string; enabled: boolean }
// Explicit immutable-reference maps have no latest-key/default credential path.
function references(raw: string | undefined): Record<string, string> | null {
 try {const value=JSON.parse(raw ?? 'null');return value && typeof value==='object' && !Array.isArray(value) && Object.values(value).every(v=>typeof v==='string')?value:null}catch{return null}
}
export function composePaymentWebsite(options: PaymentHttpOptions, cookieKey: Buffer, publishableKey: string): PaymentWebsiteBindings {
 if(cookieKey.length!==32 || !/^pk_(test|live)_[A-Za-z0-9]{10,256}$/.test(publishableKey))throw new Error('Payment composition unavailable')
 return Object.freeze({handler:createPaymentOwnerHttp(options),cookieKey:Buffer.from(cookieKey),publishableKey,enabled:options.services.ready()})
}
// This gate is before account configuration, credentials and every network/effect.
// Source review alone cannot approve hosted OIDs/JWT ingress, grants or policies.
export function configuredPaymentWebsite(): PaymentWebsiteBindings | null {
 if(!paymentWebsiteSourceEnabled())return null
 const cookieKey=paymentCookieKey(process.env.ANTE_WEB_PAYMENT_INTENT_KEY),publishableKey=process.env.ANTE_WEB_PAYMENT_PUBLISHABLE_KEY
 if(!cookieKey || !publishableKey)return null
 try {
  const account=accountConfig(),credentials=references(process.env.ANTE_WEB_PAYMENT_PROVIDER_CREDENTIALS),keys=references(process.env.ANTE_WEB_PAYMENT_RETURN_KEYS),provision=JSON.parse(process.env.ANTE_WEB_PAYMENT_PROVIDER_PROVISIONING ?? 'null') as Provisioning;
  if(!credentials || !keys || !provision || provision.enabled!==true || provision.fixture_only!==false || !credentials[provision.credential_reference])return null
  const services=createPaymentSupabase({projectUrl:account.url,publicKey:account.key,enabled:true,transportAccepted:true,acceptedB0AuthoritySha256:'6799e95ac25d0fa3c2a6a2f89dd0113d25f2bdcc3cb06c1b4a766c551b978f89',gatewayCredential:process.env.ANTE_WEB_PAYMENT_GATEWAY_CREDENTIAL,secretReadCredential:process.env.ANTE_WEB_PAYMENT_SECRET_READ_CREDENTIAL,secretReadBearer:process.env.ANTE_WEB_PAYMENT_SECRET_READ_BEARER,capsuleBindCredential:process.env.ANTE_WEB_PAYMENT_BIND_CREDENTIAL,capsuleBindBearer:process.env.ANTE_WEB_PAYMENT_BIND_BEARER});
  return composePaymentWebsite({services,provider:{provision,credential:()=>credentials[provision.credential_reference],transport:guardedTransportJoint(fetch)},loadReturnKey:async(reference,revision)=>{const key=paymentCookieKey(keys[reference+':'+revision]);return key?new Uint8Array(key):null}},cookieKey,publishableKey)
 }catch{return null}
}
