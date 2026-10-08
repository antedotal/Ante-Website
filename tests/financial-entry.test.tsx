// Exercise the actual three account pages and first-hop returns with local
// Auth/config doubles. Navigation cannot open a closed financial authority.
import {expect,it,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
const host=vi.hoisted(()=>({enabled:false,owner:'11111111-1111-4111-8111-111111111111',getUser:vi.fn(),create:vi.fn(),redirect:vi.fn((path:string)=>{throw Error(path)})}))
vi.mock('../lib/server/financial-bridge',()=>({configuredFinancialWebsite:()=>host.enabled?{enabled:true,publishableKey:'pk_test_fixture'}:null}))
vi.mock('../lib/server/payment-bridge',()=>({configuredPaymentWebsite:()=>host.enabled?{enabled:true,publishableKey:'pk_test_fixture'}:null}))
vi.mock('../lib/supabase/server',()=>({createClient:host.create}))
vi.mock('next/navigation',()=>({redirect:host.redirect}))
import CardPage from '../app/account/payments/page'
import TaskPage from '../app/account/financial-tasks/page'
import PremiumPage from '../app/account/premium/page'
import AccountShell from '../components/account/AccountShell'
import AccountPayments from '../components/account/AccountPayments'
import AccountFinancial from '../components/account/AccountFinancial'
import {paymentReturnIngressResponse} from '../lib/payments/payment-return-ingress'
import {PRODUCTION_SITE_ORIGIN} from '../lib/production-origin'
const pages=[['payments',CardPage,'cards',AccountPayments],['financial-tasks',TaskPage,'tasks',AccountFinancial],['premium',PremiumPage,'premium',AccountFinancial]] as const
it.each(pages)('actual %s page renders fixed navigation before Auth when closed and keys verified financial owners',async(name,Page,activePage,Component)=>{
 host.enabled=false;host.create.mockClear();host.getUser.mockClear()
 const closed=await Page();expect(closed.type).toBe(AccountShell);expect(closed.props.activePage).toBe(activePage);expect(closed.props.unavailable).toBe(true);expect(closed.props.children.props.enabled).toBe(false);expect(host.create).not.toHaveBeenCalled();expect(host.getUser).not.toHaveBeenCalled()
 const html=renderToStaticMarkup(closed);expect(html).toContain('aria-label="Account navigation"');expect(html).toMatch(new RegExp(`href="/account/${name}"[^>]*aria-current="page"`));expect(html.match(/aria-current="page"/g)).toHaveLength(1);expect(html).not.toContain('client_secret')
 host.enabled=true;host.create.mockResolvedValue({auth:{getUser:host.getUser}});host.getUser.mockImplementation(async()=>({data:{user:{id:host.owner}},error:null}))
 const a=await Page(),first=a.props.children;expect(a.type).toBe(AccountShell);expect(a.props.unavailable).not.toBe(true);expect(first.type).toBe(Component);expect(first.key).toBe(host.owner);expect(first.props.ownerId).toBe(host.owner);expect(first.props.publishableKey).toBe('pk_test_fixture')
 host.owner='22222222-2222-4222-8222-222222222222';const b=await Page(),next=b.props.children;expect(next.key).toBe(host.owner);expect(next.key).not.toBe(first.key);host.owner='11111111-1111-4111-8111-111111111111'
})
it.each(pages)('actual %s page redirects an unverified owner before rendering private content',async(_name,Page)=>{
 host.enabled=true;host.create.mockResolvedValue({auth:{getUser:host.getUser}});host.getUser.mockResolvedValue({data:{user:null},error:Error('unverified')});await expect(Page()).rejects.toThrow('/account/sign-in')
})
it.each(['financial-tasks','premium'])('first hop discards %s query without downstream authority',family=>{const clean=PRODUCTION_SITE_ORIGIN+'/account/'+family;const r=paymentReturnIngressResponse(new Request(clean+'/return?client_secret=private&session_id=cs_fake'));expect(r?.status).toBe(303);expect(r?.headers.get('Location')).toBe(clean);expect(r?.headers.get('Referrer-Policy')).toBe('no-referrer');for(const method of ['HEAD','POST','OPTIONS'])expect(paymentReturnIngressResponse(new Request(clean+'/return?secret=private',{method}))?.status).toBe(405);expect(paymentReturnIngressResponse(new Request(clean+'/%72eturn?secret=private'))?.status).toBe(403);expect(paymentReturnIngressResponse(new Request(clean+'/return/?secret=private'))?.status).toBe(403)})
