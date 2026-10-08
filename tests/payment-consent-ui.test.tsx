// Independently render actual component logic using a deterministic React hook
// host; network responses remain local approved DTO fixtures, with no DOM/SDK.
import { beforeEach, expect, it, vi } from 'vitest'
const hooks = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, effects: [] as (()=>unknown)[] }))
vi.mock('react', () => ({
 useState: (initial:unknown) => { const index=hooks.cursor++;if(!(index in hooks.states))hooks.states[index]=initial;return [hooks.states[index],(v:unknown)=>{hooks.states[index]=typeof v==='function'?(v as (old:unknown)=>unknown)(hooks.states[index]):v}] },
 useRef: (initial:unknown) => { const index=hooks.cursor++;if(!(index in hooks.states))hooks.states[index]={current:initial};return hooks.states[index] },
 useEffect: (effect:()=>unknown) => {hooks.effects.push(effect)},
 useCallback: (fn:unknown) => fn,
}))
// Exercise the real authenticated page's key/props without real Auth or bindings.
const pageServices=vi.hoisted(()=>({enabled:true,owner:'11111111-1111-4111-8111-111111111111',getUser:vi.fn()}))
vi.mock('../lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:pageServices.getUser}})}))
vi.mock('../lib/server/payment-bridge',()=>({configuredPaymentWebsite:()=>pageServices.enabled?{enabled:true,publishableKey:'pk_test_fixture'}:null}))
const stripeHost=vi.hoisted(()=>({load:vi.fn()}))
vi.mock('../lib/payments/stripe-elements',()=>({loadPaymentStripe:stripeHost.load}))
import CardSetup from '../components/account/CardSetup'
import AccountPaymentsPage from '../app/account/payments/page'
import AccountPayments from '../components/account/AccountPayments'
type Element = {type:unknown;props:Record<string,unknown>}
function elements(value:unknown):Element[]{if(!value)return [];if(Array.isArray(value))return value.flatMap(elements);if(typeof value!=='object'||!('props'in value))return [];const element=value as Element;return [element,...elements(element.props.children)]}
function render(Component:(props:never)=>unknown,props:unknown){hooks.cursor=0;return Component(props as never)}
const policy={purpose:'card.save',available:true,policy_id:'new-policy',policy_version:'v2',policy_revision:2,policy_hash:'new-hash'}
const oldConsent={consent_id:'owned-old',revision:1,policy_id:'old-policy',policy_version:'v1',policy_hash:'old-hash',approved_text:'old text',scope_keys:['card.save'],state:'active',accepted_at:'2026-01-01',revoked_at:null}
// Closed page contains no panel, so obtain the actual private child from an
// enabled initial render without running its outer network effect.
function actualPanel(context:unknown){hooks.states=[];hooks.effects=[];const page=render(AccountPayments as never,{enabled:true});const panel=elements(page).find(e=>typeof e.type==='function'&&e.props.purpose==='card.save')!;hooks.states=[];hooks.effects=[];return {component:panel.type as (props:never)=>unknown,props:{...panel.props,context,busy:false}}}
beforeEach(()=>{hooks.states=[];hooks.cursor=0;hooks.effects=[];vi.stubGlobal('fetch',vi.fn(async()=>Response.json({result:{...oldConsent,consent_id:null,policy_id:'new-policy',policy_version:'v2',policy_hash:'new-hash',approved_text:'new text',revision:2,state:'active'}})))})
it('independent: current policy version remains independently acceptable after rotation',async()=>{const {component,props}=actualPanel({customer:{reservation_revision:1},policies:[policy],consents:[oldConsent]});render(component,props);for(const effect of hooks.effects)effect();await new Promise(resolve=>setTimeout(resolve,0));const result=render(component,props);expect(elements(result).filter(e=>e.type==='button').some(e=>e.props.children==='Accept this version')).toBe(true)})
it('independent: active historical consent remains revocable after current policy retirement',()=>{const {component,props}=actualPanel({customer:{reservation_revision:1},policies:[{...policy,available:false}],consents:[oldConsent]});const result=render(component,props);expect(elements(result).filter(e=>e.type==='button').some(e=>e.props.children==='Revoke consent')).toBe(true)})

it('control: without active consent the actual panel offers current-version acceptance',async()=>{const {component,props}=actualPanel({customer:{reservation_revision:1},policies:[policy],consents:[]});render(component,props);for(const effect of hooks.effects)effect();await new Promise(resolve=>setTimeout(resolve,0));const result=render(component,props);expect(elements(result).filter(e=>e.type==='button').some(e=>e.props.children==='Accept this version')).toBe(true)})

// Flush async hook callbacks without a browser or real owner/provider traffic.
async function flushEffects(){const effects=hooks.effects.splice(0);for(const effect of effects)effect();await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0))}
const pageProps={enabled:true,ownerId:'11111111-1111-4111-8111-111111111111'}
function button(tree:unknown,label:string){return elements(tree).find(element=>element.type==='button'&&element.props.children===label)}
function fixtureFetch(path:unknown){const url=String(path);if(url.endsWith('/intent'))return Response.json({request_id:null,operation_id:null,action:null});if(url.includes('/operations?'))return Response.json({result:{operations:[]}});if(url.includes('/consents/history?'))return Response.json({result:{entries:[oldConsent],next_cursor:null}});if(url.includes('/consent?consent_id='))return Response.json({result:oldConsent});return Response.json({error_code:'configuration_missing'},{status:503})}
it('history loads and revoke remains enabled when context/cards fail independently',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:unknown)=>fixtureFetch(path)));render(AccountPayments as never,pageProps);await flushEffects();const page=render(AccountPayments as never,pageProps),panel=elements(page).find(element=>typeof element.type==='function'&&element.props.purpose==='card.save')!;
 expect(panel.props.context).toBeNull();expect(panel.props.busy).toBe(false);expect(panel.props.history).toEqual([oldConsent]);expect(panel.props.acceptanceBlocked).toBe(true);
 hooks.states=[];const tree=render(panel.type as never,panel.props);expect(button(tree,'Revoke consent')?.props.disabled).toBe(false);expect(button(tree,'Accept this version')).toBeUndefined();
})
it('unrelated unfinished operations fence acceptance without disabling owned revoke',async()=>{
 const pending={operation_id:'unfinished',action:'customer.ensure',status:'pending',recovery:'await_policy'};
 vi.stubGlobal('fetch',vi.fn(async(path:unknown)=>String(path).endsWith('/context')?Response.json({result:{customer:{reservation_revision:1},policies:[policy],consents:[oldConsent],unfinished_operations:[pending]}}):String(path).endsWith('/cards')?Response.json({cards:[]}):fixtureFetch(path)));
 render(AccountPayments as never,pageProps);await flushEffects();const panel=elements(render(AccountPayments as never,pageProps)).find(element=>typeof element.type==='function'&&element.props.purpose==='card.save')!;
 expect(panel.props.busy).toBe(false);expect(panel.props.acceptanceBlocked).toBe(true)
})
it('revoke rechecks exact owned consent and prepares original consent revision while cards are unavailable',async()=>{
 const fetcher=vi.fn(async(path:unknown,_init?:RequestInit)=>{void _init;const url=String(path);if(url.endsWith('/prepare'))return Response.json({operation_id:'44444444-4444-4444-8444-444444444444',action:'consent.revoke'});if(url.endsWith('/execute'))return Response.json({status:'completed',result:null});return fixtureFetch(path)});vi.stubGlobal('fetch',fetcher);
 render(AccountPayments as never,pageProps);await flushEffects();const panel=elements(render(AccountPayments as never,pageProps)).find(element=>typeof element.type==='function'&&element.props.purpose==='card.save')!;
 await (panel.props.act as (action:string,input:unknown)=>Promise<void>)('consent.revoke',{consent_id:oldConsent.consent_id,consent_revision:oldConsent.revision});
 const prepare=fetcher.mock.calls.find(([path])=>String(path).endsWith('/prepare'))!;expect(JSON.parse(String(prepare[1]?.body))).toMatchObject({action:'consent.revoke',input:{consent_id:oldConsent.consent_id,consent_revision:1}});expect(fetcher.mock.calls.filter(([path])=>String(path).includes('/consent?consent_id=')).length).toBeGreaterThanOrEqual(2)
})
it('changed consent revision refreshes history without preparing a stale revoke',async()=>{
 let reads=0;const fetcher=vi.fn(async(path:unknown)=>{if(String(path).includes('/consent?consent_id=')){reads++;return Response.json({result:{...oldConsent,revision:reads===1?1:2}})}return fixtureFetch(path)});vi.stubGlobal('fetch',fetcher);
 render(AccountPayments as never,pageProps);await flushEffects();const panel=elements(render(AccountPayments as never,pageProps)).find(element=>typeof element.type==='function'&&element.props.purpose==='card.save')!;
 await (panel.props.act as (action:string,input:unknown)=>Promise<void>)('consent.revoke',{consent_id:oldConsent.consent_id,consent_revision:1});expect(fetcher.mock.calls.some(([path])=>String(path).endsWith('/prepare'))).toBe(false)
})
it('reload displays explicit original-intent resume even without a SQL row and never prepares replacement',async()=>{
 const original={request_id:'33333333-3333-4333-8333-333333333333',operation_id:'44444444-4444-4444-8444-444444444444',action:'customer.ensure'};
 const fetcher=vi.fn(async(path:unknown,_init?:RequestInit)=>{void _init;return String(path).endsWith('/intent')?Response.json(original):String(path).endsWith('/execute')?Response.json({status:'pending',result:null}):fixtureFetch(path)});vi.stubGlobal('fetch',fetcher);
 render(AccountPayments as never,pageProps);await flushEffects();const tree=render(AccountPayments as never,pageProps),resume=button(tree,'Resume original action')!;expect(resume?.props.disabled).toBe(false);await (resume.props.onClick as ()=>Promise<void>)();await new Promise(resolve=>setTimeout(resolve,0));
 const executed=fetcher.mock.calls.find(([path])=>String(path).endsWith('/execute'))!;expect(JSON.parse(String(executed[1]?.body))).toEqual({request_id:original.request_id,expected_operation_id:original.operation_id});expect(fetcher.mock.calls.some(([path])=>String(path).endsWith('/prepare'))).toBe(false)
})
it('retired or changed policy hides previously loaded current terms synchronously',async()=>{
 const {component,props}=actualPanel({customer:{reservation_revision:1},policies:[policy],consents:[]});render(component,props);await flushEffects();const loaded=render(component,props);expect(button(loaded,'Accept this version')).toBeDefined();
 expect(button(render(component,{...props,context:{customer:{reservation_revision:1},policies:[{...policy,policy_hash:'rotated'}],consents:[]}}),'Accept this version')).toBeUndefined();
 expect(button(render(component,{...props,context:{customer:{reservation_revision:1},policies:[{...policy,available:false}],consents:[]}}),'Accept this version')).toBeUndefined()
})
it('new owner and late old-owner reads cannot retain old history or intent',async()=>{
 const oldReplies:(()=>void)[]=[];const other='22222222-2222-4222-8222-222222222222';
 vi.stubGlobal('fetch',vi.fn((path:unknown,init?:RequestInit)=>{const requestedOwner=(init?.headers as Record<string,string>)['X-Ante-Payment-Owner'];if(requestedOwner===pageProps.ownerId)return new Promise<Response>(resolve=>oldReplies.push(()=>resolve(fixtureFetch(path))));if(String(path).includes('/consents/history?'))return Promise.resolve(Response.json({result:{entries:[],next_cursor:null}}));return Promise.resolve(fixtureFetch(path))}));
 render(AccountPayments as never,pageProps);for(const effect of hooks.effects.splice(0))effect();const nextProps={...pageProps,ownerId:other};render(AccountPayments as never,nextProps);await flushEffects();for(const resolve of oldReplies)resolve();await new Promise(resolve=>setTimeout(resolve,0));const page=render(AccountPayments as never,nextProps),panel=elements(page).find(element=>typeof element.type==='function'&&element.props.purpose==='card.save')!;expect(panel.props.history).toEqual([]);expect(button(page,'Resume original action')).toBeUndefined()
})

it('historical revoke prepares independently with an unrelated cookie-bound setup still unresolved',async()=>{
 const setup={request_id:'33333333-3333-4333-8333-333333333333',operation_id:'44444444-4444-4444-8444-444444444444',action:'card.setup.begin'};
 const fetcher=vi.fn(async(path:unknown,init?:RequestInit)=>{void init;if(String(path).endsWith('/intent'))return Response.json(setup);if(String(path).endsWith('/prepare'))return Response.json({action:'consent.revoke',operation_id:'55555555-5555-4555-8555-555555555555'});if(String(path).endsWith('/execute'))return Response.json({status:'unknown',result:null});return fixtureFetch(path)});vi.stubGlobal('fetch',fetcher);
 render(AccountPayments as never,pageProps);await flushEffects();const panel=elements(render(AccountPayments as never,pageProps)).find(element=>typeof element.type==='function'&&element.props.purpose==='card.save')!;expect(panel.props.busy).toBe(false);
 await (panel.props.act as (action:string,input:unknown)=>Promise<void>)('consent.revoke',{consent_id:oldConsent.consent_id,consent_revision:1});expect(fetcher.mock.calls.filter(([path])=>String(path).endsWith('/prepare'))).toHaveLength(1);const prepared=fetcher.mock.calls.find(([path])=>String(path).endsWith('/prepare'))!;expect(JSON.parse(String(prepared[1]?.body)).action).toBe('consent.revoke')
})

it('reload retains separate original setup and revocation controls and resumes the exact revoke IDs',async()=>{
 const restored={request_id:'33333333-3333-4333-8333-333333333333',operation_id:'44444444-4444-4444-8444-444444444444',action:'card.setup.begin',revocation:{request_id:'55555555-5555-4555-8555-555555555555',operation_id:'66666666-6666-4666-8666-666666666666',action:'consent.revoke'}};
 const fetcher=vi.fn(async(path:unknown,init?:RequestInit)=>{void init;if(String(path).endsWith('/intent'))return Response.json(restored);if(String(path).endsWith('/execute'))return Response.json({status:'unknown',result:null});return fixtureFetch(path)});vi.stubGlobal('fetch',fetcher);
 render(AccountPayments as never,pageProps);await flushEffects();const tree=render(AccountPayments as never,pageProps);expect(button(tree,'Resume original action')).toBeDefined();const resume=button(tree,'Resume original revocation')!;expect(resume.props.disabled).toBe(false);await (resume.props.onClick as ()=>Promise<void>)();await new Promise(resolve=>setTimeout(resolve,0));const execute=fetcher.mock.calls.find(([path])=>String(path).endsWith('/execute'))!;expect(JSON.parse(String(execute[1]?.body))).toEqual({request_id:restored.revocation.request_id,expected_operation_id:restored.revocation.operation_id});expect(fetcher.mock.calls.some(([path])=>String(path).endsWith('/prepare'))).toBe(false)
})

// Walk only rendered children: internal operation IDs/revisions remain in DTO
// props and must not be confused with visible product copy.
function renderedText(value:unknown):string{if(Array.isArray(value))return value.map(renderedText).join(' ');if(typeof value==='string'||typeof value==='number')return String(value);if(value&&typeof value==='object'&&'props'in value)return renderedText((value as Element).props.children);return ''}
it('operation history and recovery use the six human action labels without implementation details',async()=>{
 const labels={'customer.ensure':'Prepare card account','consent.accept':'Accept terms','consent.revoke':'Revoke consent','card.setup.begin':'Add card','card.default.set':'Make default','card.remove':'Remove card'};
 const summaries=Object.keys(labels).map((action,index)=>({operation_id:'operation-'+index,action,status:'pending',recovery:'none',operation_revision:7,resource_revision:13,resource_id:'resource-'+index}));
 vi.stubGlobal('fetch',vi.fn(async(path:unknown)=>{const url=String(path);if(url.endsWith('/intent'))return Response.json({request_id:'request',operation_id:'operation-3',action:'card.setup.begin'});if(url.includes('/operations?'))return Response.json({result:{operations:summaries}});if(url.includes('/operation?')){const summary=summaries.find(entry=>url.endsWith(entry.operation_id))!;return Response.json({result:{summary,original_contract:'fixture',original_receipt:{status:'pending',operation_revision:4,result:null},current_contract:'fixture',current_receipt:{status:'pending',result:{state:'requires_action',revision:13}}}})}return fixtureFetch(path)}));
 render(AccountPayments as never,pageProps);await flushEffects();const text=renderedText(render(AccountPayments as never,pageProps));
 for(const [action,label]of Object.entries(labels)){expect(text).toContain(label);expect(text).not.toContain(action)}
 expect(text).toContain('Original response:');expect(text).toContain('Current progress:');expect(text).not.toContain('revision');expect(text).not.toContain('Current resource');expect(text).not.toContain('protected on the server')
})
it('actual verified page keys each owner so switching owners discards the old component instance',async()=>{
 pageServices.enabled=true;pageServices.getUser.mockImplementation(async()=>({data:{user:{id:pageServices.owner}},error:null}));pageServices.owner=pageProps.ownerId;
 const original=(await AccountPaymentsPage()).props.children;expect(original.type).toBe(AccountPayments);expect(original.key).toBe(pageProps.ownerId);expect(original.props.ownerId).toBe(pageProps.ownerId);
 pageServices.owner='22222222-2222-4222-8222-222222222222';const switched=(await AccountPaymentsPage()).props.children;expect(switched.key).toBe(pageServices.owner);expect(switched.key).not.toBe(original.key);expect(switched.props.ownerId).toBe(pageServices.owner)
})
it('closed page and enabled=false render neither card-entry secrets nor private recovery',async()=>{
 pageServices.enabled=false;pageServices.getUser.mockClear();const closed=(await AccountPaymentsPage()).props.children;expect(closed.props.enabled).toBe(false);expect(pageServices.getUser).not.toHaveBeenCalled();pageServices.enabled=true;
 render(AccountPayments as never,pageProps);hooks.states[0]={phase:'ready',ownerId:pageProps.ownerId,context:null,cards:[],operations:[],message:''};hooks.states[2]={client_secret:'seti_old_frame_secret',expires_at:new Date(Date.now()+60000).toISOString(),return_route_key:'account_payments'};
 const props={...pageProps,publishableKey:'pk_test_fixture'},shown=render(AccountPayments as never,props);expect(elements(shown).some(element=>typeof element.type==='function'&&(element.type as {name:string}).name==='CardSetup')).toBe(true);
 const disabled=render(AccountPayments as never,{...props,enabled:false});expect(elements(disabled).some(element=>typeof element.type==='function'&&(element.type as {name:string}).name==='CardSetup')).toBe(false);expect(button(disabled,'Resume original action')).toBeUndefined()
})

// Execute the real child submit/confirm lifecycle and its effect cleanup. All
// Stripe methods are local doubles; no DOM, SDK load or provider call occurs.
it.each(['submit','confirmation'])('unmounted actual CardSetup fences a late %s callback',async phase=>{
 let ready=()=>{},resolveProvider:(value:unknown)=>void=()=>{};const pause=()=>new Promise(resolve=>{resolveProvider=resolve}),confirmed=vi.fn(async()=>{}),expired=vi.fn(),confirmSetup=vi.fn(()=>phase==='confirmation'?pause():Promise.resolve({}));
 const childElement={mount:vi.fn(),destroy:vi.fn(),on:(_event:string,listener:()=>void)=>{ready=listener}},client={elements:()=>({create:()=>childElement,submit:()=>phase==='submit'?pause():Promise.resolve({})}),confirmSetup};stripeHost.load.mockResolvedValue(client);vi.stubGlobal('window',{location:{origin:'https://ante.test'}});
 const props={ticket:{client_secret:'seti_local_fixture',expires_at:new Date(Date.now()+60000).toISOString(),return_route_key:'account_payments'},publishableKey:'pk_test_fixture',onConfirmed:confirmed,onExpired:expired};render(CardSetup as never,props);(hooks.states[0] as {current:unknown}).current={};const cleanup=hooks.effects.splice(0)[0]() as ()=>void;await new Promise(resolve=>setTimeout(resolve,0));ready();const form=render(CardSetup as never,props) as Element;
 const pending=(form.props.onSubmit as (event:unknown)=>Promise<void>)({preventDefault:()=>{}});await new Promise(resolve=>setTimeout(resolve,0));expect(confirmSetup).toHaveBeenCalledTimes(phase==='confirmation'?1:0);cleanup();let replacementCleanup:(()=>void)|undefined;
 // A pending old submit must not pick up a replacement frame's elements. This
 // exercises actual same-component effect cleanup/reinstallation, not just null
 // refs after unmount accidentally preventing a provider dispatch.
 if(phase==='submit'){const replacement={...props,ticket:{...props.ticket,client_secret:'seti_new_local_fixture'}};render(CardSetup as never,replacement);replacementCleanup=hooks.effects.splice(0).at(-1)!() as ()=>void;await new Promise(resolve=>setTimeout(resolve,0));ready()}
 resolveProvider({});await pending;expect(confirmSetup).toHaveBeenCalledTimes(phase==='confirmation'?1:0);expect(confirmed).not.toHaveBeenCalled();expect(expired).not.toHaveBeenCalled();replacementCleanup?.();expect(childElement.destroy).toHaveBeenCalledTimes(phase==='submit'?2:1)
})

it('old rendered frame callbacks cannot expire or confirm a newer same-owner continuation',async()=>{
 let issued=0;const setup={operation_id:'setup-operation',action:'card.setup.begin',status:'pending',recovery:'customer_action',operation_revision:1,resource_revision:1,resource_id:'setup'};
 const fetcher=vi.fn(async(path:unknown)=>{const url=String(path);if(url.includes('/operations?'))return Response.json({result:{operations:[setup]}});if(url.includes('/operation?'))return Response.json({result:{summary:setup,original_receipt:{status:'pending',result:null},current_receipt:{status:'pending',result:null}}});if(url.endsWith('/intent'))return Response.json({request_id:'original-request',operation_id:setup.operation_id,action:setup.action});if(url.endsWith('/setup/return'))return Response.json({});if(url.endsWith('/setup/continuation'))return Response.json({client_secret:'seti_local_fixture_'+(++issued),expires_at:new Date(Date.now()+60000).toISOString(),return_route_key:'account_payments'});return fixtureFetch(path)});vi.stubGlobal('fetch',fetcher);
 const props={...pageProps,publishableKey:'pk_test_fixture'};render(AccountPayments as never,props);await flushEffects();let page=render(AccountPayments as never,props);(button(page,'Continue existing setup')!.props.onClick as ()=>void)();await new Promise(resolve=>setTimeout(resolve,0));page=render(AccountPayments as never,props);const oldFrame=elements(page).find(element=>element.type===CardSetup)!;expect(oldFrame).toBeDefined();
 (button(page,'Check progress')!.props.onClick as ()=>void)();await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0));page=render(AccountPayments as never,props);(button(page,'Continue existing setup')!.props.onClick as ()=>void)();await new Promise(resolve=>setTimeout(resolve,0));const newFrame=elements(render(AccountPayments as never,props)).find(element=>element.type===CardSetup)!;expect(newFrame.props.ticket).not.toBe(oldFrame.props.ticket);const before=fetcher.mock.calls.length;
 (oldFrame.props.onExpired as ()=>void)();await (oldFrame.props.onConfirmed as ()=>Promise<void>)();expect(fetcher.mock.calls).toHaveLength(before);const retained=elements(render(AccountPayments as never,props)).find(element=>element.type===CardSetup)!;expect(retained.props.ticket).toBe(newFrame.props.ticket)
})

it('independent Fix2: recorded consent keeps legal policy version without exposing a backend revision counter',()=>{
 const {component,props}=actualPanel({customer:{reservation_revision:1},policies:[{...policy,available:false}],consents:[oldConsent]});
 const text=renderedText(render(component,props));expect(text).toContain('v1');expect(text).toContain('Revoke consent');expect(text).not.toContain('revision');
});
