// Pure presence/canonical-route checks let closed public unavailable screens
// render before account config/Auth. They grant no owner or payment authority.
import {financialWebsiteSourceEnabled} from './financial-source-gate'
import {paymentId} from './bridge-v1/supabase/functions/_shared/webPaymentHttpIntake'
export function paymentReviewSourcePresent(){return financialWebsiteSourceEnabled()&&process.env.ANTE_WEB_PAYMENT_REVIEW_HTTP_ACCEPTANCE==='reviewed-owner-review-v2'&&!!process.env.ANTE_WEB_PAYMENT_REVIEW_INTENT_KEY}
export function longCollectionSourcePresent(){return financialWebsiteSourceEnabled()&&process.env.ANTE_WEB_LONG_COLLECTION_HTTP_ACCEPTANCE==='reviewed-long-collection-http-v1'&&['ANTE_WEB_LONG_COLLECTION_READ_KEY','ANTE_WEB_LONG_COLLECTION_RETURN_KEYS','ANTE_WEB_LONG_COLLECTION_SECRET_CREDENTIAL','ANTE_WEB_LONG_COLLECTION_SECRET_BEARER','ANTE_WEB_LONG_COLLECTION_BIND_CREDENTIAL','ANTE_WEB_LONG_COLLECTION_BIND_BEARER'].every(name=>!!process.env[name])}
// Only canonical GET/HEAD page paths qualify. Encoded UUID/separator aliases,
// uppercase UUIDs, query, extra segments and noncanonical revisions stay gated.
export function closedFinancialPage(pathname:string,rawPathname:string,search:string,method:string){if(!['GET','HEAD'].includes(method)||search||pathname!==rawPathname)return false;if(pathname==='/account/payment-review')return !paymentReviewSourcePresent();const prefix='/account/financial-tasks/collection/';if(!pathname.startsWith(prefix))return false;const parts=pathname.slice(prefix.length).split('/'),revision=Number(parts[1]);if(parts.length!==2||!paymentId(parts[0])||!Number.isInteger(revision)||revision<1||revision>2147483647||String(revision)!==parts[1])return false;return !longCollectionSourcePresent()}
