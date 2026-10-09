// Render the actual account components without Auth/network/provider work; navigation never changes feature authority.
import {describe,it,expect,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import AccountShell from '../components/account/AccountShell'
import AccountOverview from '../components/account/AccountOverview'
const auth=vi.hoisted(()=>({getClaims:vi.fn(),create:vi.fn(),redirect:vi.fn((path:string)=>{throw Error(path)})}))
vi.mock('../lib/supabase/server',()=>({createClient:auth.create}))
vi.mock('next/navigation',()=>({redirect:auth.redirect}))
import AccountPage from '../app/account/page'
describe('account navigation and verified overview',()=>{
 it('uses fixed destinations and exactly one current page with a keyboard skip target',()=>{
  const html=renderToStaticMarkup(<AccountShell activePage="tasks"><main><h1>Task funding</h1></main></AccountShell>)
  for(const href of ['/account','/account/payments','/account/financial-tasks','/account/premium'])expect(html).toContain(`href="${href}"`)
  expect(html.match(/aria-current="page"/g)).toHaveLength(1);expect(html).toMatch(/href="\/account\/financial-tasks"[^>]*aria-current="page"/)
  expect(html).toContain('aria-label="Account navigation"');expect(html).toContain('href="#account-content"');expect(html).toContain('id="account-content"');expect(html).toContain('tabindex="-1"')
 })
 it('renders unavailable mode as text without disabling navigation or supplying financial claims',()=>{
  const html=renderToStaticMarkup(<AccountShell activePage="premium" unavailable><main><h1>Premium</h1></main></AccountShell>)
  expect(html).toContain('Premium is currently unavailable');expect(html).not.toMatch(/aria-disabled|disabled|client_secret|paid|trial|\$\d/)
 })
 it('escapes verified identity and replaces stale feature copy with human labels',()=>{
  const html=renderToStaticMarkup(<AccountOverview identity="<script>owner</script>"/>);expect(html).toContain('&lt;script&gt;owner&lt;/script&gt;');expect(html).toContain('Cards');expect(html).toContain('Task funding');expect(html).toContain('Premium');expect(html).not.toContain('Account access is being prepared')
 })
 it('preserves server identity verification and redirects before private render on failure',async()=>{
  auth.create.mockResolvedValue({auth:{getClaims:auth.getClaims}});auth.getClaims.mockResolvedValue({data:null,error:Error('closed')});await expect(AccountPage()).rejects.toThrow('/account/sign-in')
  auth.getClaims.mockResolvedValue({data:{claims:{sub:'owned-id',email:'owner@example.invalid'}},error:null});const page=await AccountPage();expect(renderToStaticMarkup(page)).toContain('owner@example.invalid')
 })
})

// Emit an offline actual-component preview for local keyboard/viewport checks;
// this isolated fixture has no Auth cookie, payment request or financial record.
it('writes an actual rendered overview and unavailable shell preview for local visual verification',async()=>{
 const {readFileSync,writeFileSync,mkdirSync}=await import('node:fs'),styles=(await import('../components/account/AccountShell.module.css')).default
 let css=readFileSync(new URL('../components/account/AccountShell.module.css',import.meta.url),'utf8');for(const [name,value]of Object.entries(styles))css=css.replaceAll('.'+name,'.'+value)
 const folder='/private/tmp/ante-account-shell-render';mkdirSync(folder,{recursive:true})
 for(const activePage of ['overview','cards','tasks','premium'] as const){const child=activePage==='overview'?<AccountOverview identity="Account preview"/>:<main><h1>{activePage==='cards'?'Cards':activePage==='tasks'?'Task funding':'Premium'}</h1><p>This local preview shows navigation and unavailable mode only.</p></main>;const html=renderToStaticMarkup(<AccountShell activePage={activePage} unavailable={activePage!=='overview'}>{child}</AccountShell>);writeFileSync(folder+'/'+activePage+'.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ante account preview</title><style>body{margin:0;font-family:Arial,sans-serif}*{box-sizing:border-box}'+css+'</style><body>'+html+'</body></html>')}
 expect(readFileSync(folder+'/overview.html','utf8')).toContain('aria-current="page"')
})
