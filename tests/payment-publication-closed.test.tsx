// The real public gate remains closed even when all former presence prerequisites
// are set. Canonical unavailable pages must bypass Auth/config, never grant money.
import {afterEach,it,expect,vi} from 'vitest'
import {NextRequest} from 'next/server'
import {renderToStaticMarkup} from 'react-dom/server'
vi.mock('server-only',()=>({}))
const calls=vi.hoisted(()=>({config:vi.fn(()=>({url:'https://project.supabase.co',key:'synthetic_public_key',siteOrigin:'https://antedotal.com'})),admit:vi.fn(),auth:vi.fn(),create:vi.fn(),redirect:vi.fn()}))
vi.mock('../lib/supabase/config',()=>({accountConfig:calls.config,accountCookieOptions:()=>({})}))
vi.mock('../lib/server/callback-admission',()=>({admitAccountVisitor:calls.admit}))
vi.mock('@supabase/ssr',()=>({createServerClient:calls.auth}))
vi.mock('../lib/supabase/server',()=>({createClient:calls.create}))
vi.mock('next/navigation',()=>({redirect:calls.redirect}))
import {paymentWebsiteSourceEnabled} from '../lib/payments/website-source-gate'
import {financialWebsiteSourceEnabled} from '../lib/payments/financial-source-gate'
import {paymentReviewSourcePresent,longCollectionSourcePresent} from '../lib/payments/financial-page-source-gate'
import {proxy} from '../proxy'
import CardsPage from '../app/account/payments/page'
import FundingPage from '../app/account/financial-tasks/page'
import PremiumPage from '../app/account/premium/page'
import ReviewPage from '../app/account/payment-review/page'
import CollectionPage from '../app/account/financial-tasks/collection/[commitmentId]/[revision]/page'
// Values are synthetic presence only: no real credential, policy, amount or cap.
function present(){for(const name of ['ANTE_WEB_PAYMENT_INTENT_KEY','ANTE_WEB_PAYMENT_PUBLISHABLE_KEY','ANTE_WEB_PAYMENT_PROVIDER_CREDENTIALS','ANTE_WEB_PAYMENT_RETURN_KEYS','ANTE_WEB_PAYMENT_PROVIDER_PROVISIONING','ANTE_WEB_PAYMENT_GATEWAY_CREDENTIAL','ANTE_WEB_PAYMENT_SECRET_READ_CREDENTIAL','ANTE_WEB_PAYMENT_SECRET_READ_BEARER','ANTE_WEB_PAYMENT_BIND_CREDENTIAL','ANTE_WEB_PAYMENT_BIND_BEARER','ANTE_WEB_FINANCIAL_TASK_INTENT_KEY','ANTE_WEB_PREMIUM_INTENT_KEY','ANTE_WEB_HOLD_RETURN_KEYS','ANTE_WEB_PREMIUM_RETURN_KEYS','ANTE_WEB_HOLD_SECRET_CREDENTIAL','ANTE_WEB_HOLD_SECRET_BEARER','ANTE_WEB_HOLD_BIND_CREDENTIAL','ANTE_WEB_HOLD_BIND_BEARER','ANTE_WEB_PREMIUM_SECRET_CREDENTIAL','ANTE_WEB_PREMIUM_SECRET_BEARER','ANTE_WEB_PREMIUM_BIND_CREDENTIAL','ANTE_WEB_PREMIUM_BIND_BEARER','ANTE_WEB_PAYMENT_REVIEW_INTENT_KEY','ANTE_WEB_LONG_COLLECTION_READ_KEY','ANTE_WEB_LONG_COLLECTION_RETURN_KEYS','ANTE_WEB_LONG_COLLECTION_SECRET_CREDENTIAL','ANTE_WEB_LONG_COLLECTION_SECRET_BEARER','ANTE_WEB_LONG_COLLECTION_BIND_CREDENTIAL','ANTE_WEB_LONG_COLLECTION_BIND_BEARER'])vi.stubEnv(name,'synthetic_presence');for(const [name,value]of Object.entries({ANTE_WEB_PAYMENTS_MODE:'card-browser-v1',ANTE_WEB_PAYMENT_HTTP_ACCEPTANCE:'reviewed-owner-transport-v1',ANTE_WEB_FINANCIAL_MODE:'financial-browser-v1',ANTE_WEB_FINANCIAL_HTTP_ACCEPTANCE:'reviewed-financial-transport-v1',ANTE_WEB_PAYMENT_REVIEW_HTTP_ACCEPTANCE:'reviewed-owner-review-v2',ANTE_WEB_LONG_COLLECTION_HTTP_ACCEPTANCE:'reviewed-long-collection-http-v1'}))vi.stubEnv(name,value)}
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks()})
it('base and all existing purpose gates remain false with complete former presence',()=>{present();for(const gate of [paymentWebsiteSourceEnabled,financialWebsiteSourceEnabled,paymentReviewSourcePresent,longCollectionSourcePresent])expect(gate()).toBe(false)})
it('all five canonical closed pages bypass account configuration and Auth',async()=>{present();for(const path of ['/account/payments','/account/financial-tasks','/account/premium','/account/payment-review','/account/financial-tasks/collection/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/1']){const response=await proxy(new NextRequest('https://worker.invalid'+path,{headers:{host:'antedotal.com',cookie:'untrusted-private-session'}}));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store')}expect(calls.config).not.toHaveBeenCalled();expect(calls.admit).not.toHaveBeenCalled();expect(calls.auth).not.toHaveBeenCalled()})
it('actual closed components render unavailable navigation without identity, credentials or Stripe frames',async()=>{present();for(const page of [await CardsPage(),await FundingPage(),await PremiumPage(),await ReviewPage(),await CollectionPage({params:Promise.resolve({commitmentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',revision:'1'})})]){const html=renderToStaticMarkup(page);expect(html).toContain('aria-label="Account navigation"');expect(html).toMatch(/unavailable/i);expect(html).not.toMatch(/synthetic_presence|client_secret|js\.stripe\.com|<iframe/)}expect(calls.create).not.toHaveBeenCalled();expect(calls.config).not.toHaveBeenCalled();expect(calls.redirect).not.toHaveBeenCalled()})
it('unsafe and aliased scoped review requests keep the original origin denial',async()=>{present();for(const path of ['/account/payments/','/account/%70ayments','/account/premium/','/account/payment-review?stale=1'])expect((await proxy(new NextRequest('https://worker.invalid'+path,{headers:{host:'antedotal.com'}}))).status).toBe(403);expect((await proxy(new NextRequest('https://worker.invalid/account/payment-review',{method:'POST',headers:{host:'antedotal.com'}}))).status).toBe(403);expect(calls.auth).not.toHaveBeenCalled();expect(calls.admit).not.toHaveBeenCalled()})
