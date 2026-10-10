// The website composes the pinned Joint SDK/repository and fixed owner HTTP ports.
// Purpose keys are explicitly indexed by immutable reference/revision; missing
// bindings/configuration deny before Auth or network and install no defaults.
import 'server-only'
import { accountConfig } from '../supabase/config'
import { financialWebsiteSourceEnabled } from '../payments/financial-source-gate'
import { guardedTransportJoint, type Provisioning } from '../payments/owned-card-joint/supabase/functions/_shared/webPaymentProviderClientJoint'
import { createFinancialSupabase } from './financial-transport'
import { paymentCookieKey } from './payment-cookies'
import type { FinancialReturnOptions } from './financial-return'
export type FinancialWebsiteBindings=FinancialReturnOptions & {enabled:boolean;cookieKeys:{task:Buffer;premium:Buffer};publishableKey:string}
function references(raw:string|undefined):Record<string,string>|null {try{const v=JSON.parse(raw??'null');return v&&typeof v==='object'&&!Array.isArray(v)&&Object.values(v).every(x=>typeof x==='string')?v:null}catch{return null}}
export function configuredFinancialWebsite():FinancialWebsiteBindings|null {
 if(!financialWebsiteSourceEnabled())return null
 const task=paymentCookieKey(process.env.ANTE_WEB_FINANCIAL_TASK_INTENT_KEY),premium=paymentCookieKey(process.env.ANTE_WEB_PREMIUM_INTENT_KEY),publishableKey=process.env.ANTE_WEB_PAYMENT_PUBLISHABLE_KEY,holdKeys=references(process.env.ANTE_WEB_HOLD_RETURN_KEYS),premiumKeys=references(process.env.ANTE_WEB_PREMIUM_RETURN_KEYS),collectionKeys=references(process.env.ANTE_WEB_LONG_COLLECTION_RETURN_KEYS),credentials=references(process.env.ANTE_WEB_PAYMENT_PROVIDER_CREDENTIALS)
 if(!task||!premium||!publishableKey||!/^pk_(test|live)_[A-Za-z0-9]{10,256}$/.test(publishableKey)||!holdKeys||!premiumKeys||!credentials)return null
 try{const account=accountConfig(),provision=JSON.parse(process.env.ANTE_WEB_PAYMENT_PROVIDER_PROVISIONING??'null') as Provisioning;if(!provision||provision.enabled!==true||provision.fixture_only!==false||!credentials[provision.credential_reference])return null
  const services=createFinancialSupabase({projectUrl:account.url,publicKey:account.key,enabled:true,transportAccepted:true,acceptedB0AuthoritySha256:'6799e95ac25d0fa3c2a6a2f89dd0113d25f2bdcc3cb06c1b4a766c551b978f89',gatewayCredential:process.env.ANTE_WEB_PAYMENT_GATEWAY_CREDENTIAL,holdSecretCredential:process.env.ANTE_WEB_HOLD_SECRET_CREDENTIAL,holdSecretBearer:process.env.ANTE_WEB_HOLD_SECRET_BEARER,holdBindCredential:process.env.ANTE_WEB_HOLD_BIND_CREDENTIAL,holdBindBearer:process.env.ANTE_WEB_HOLD_BIND_BEARER,premiumSecretCredential:process.env.ANTE_WEB_PREMIUM_SECRET_CREDENTIAL,premiumSecretBearer:process.env.ANTE_WEB_PREMIUM_SECRET_BEARER,premiumBindCredential:process.env.ANTE_WEB_PREMIUM_BIND_CREDENTIAL,premiumBindBearer:process.env.ANTE_WEB_PREMIUM_BIND_BEARER,collectionSecretCredential:process.env.ANTE_WEB_LONG_COLLECTION_SECRET_CREDENTIAL,collectionSecretBearer:process.env.ANTE_WEB_LONG_COLLECTION_SECRET_BEARER,collectionBindCredential:process.env.ANTE_WEB_LONG_COLLECTION_BIND_CREDENTIAL,collectionBindBearer:process.env.ANTE_WEB_LONG_COLLECTION_BIND_BEARER})
  return Object.freeze({enabled:services.ready(),services,cookieKeys:{task,premium},publishableKey,provider:{provision,credential:()=>credentials[provision.credential_reference],transport:guardedTransportJoint(fetch)},loadKey:async(purpose,reference,revision)=>{const key=paymentCookieKey((purpose==='collection'?collectionKeys??{}:purpose==='hold'?holdKeys:premiumKeys)[reference+':'+revision]);return key?new Uint8Array(key):null}})
 }catch{return null}
}
