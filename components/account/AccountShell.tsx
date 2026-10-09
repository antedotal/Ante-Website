// A presentational account shell owns navigation only. Server pages retain their
// verified identity, private-cache and financial configuration decisions.
import type {ReactNode} from 'react'
import Link from 'next/link'
import styles from './AccountShell.module.css'
export type AccountPageKey = 'overview' | 'cards' | 'tasks' | 'premium' | 'review'
const destinations = [
 {key:'overview',href:'/account',label:'Overview'},
 {key:'cards',href:'/account/payments',label:'Cards'},
 {key:'tasks',href:'/account/financial-tasks',label:'Task funding'},
 {key:'review',href:'/account/payment-review',label:'Payment history'},
 {key:'premium',href:'/account/premium',label:'Premium'},
] as const
// Fixed native anchors preserve keyboard/link semantics and avoid prefetching
// private account routes. An unavailable feature remains navigable for context.
export default function AccountShell({activePage,unavailable=false,children}:{activePage:AccountPageKey;unavailable?:boolean;children:ReactNode}){
 const feature=destinations.find(item=>item.key===activePage)?.label ?? 'This feature'
 return <div className={styles.shell}>
  <a className={styles.skip} href="#account-content">Skip to account content</a>
  <header className={styles.header}><Link className={styles.brand} href="/" prefetch={false}>Ante</Link><span className={styles.accountLabel}>Your account</span></header>
  <div className={styles.layout}>
   <nav aria-label="Account navigation" className={styles.navigation}>{destinations.map(item=><a key={item.key} href={item.href} aria-current={item.key===activePage?'page':undefined} className={styles.navigationLink}>{item.label}</a>)}</nav>
   <div id="account-content" tabIndex={-1} className={styles.content}>
    {unavailable&&<aside className={styles.notice} aria-label="Feature availability"><p><strong>{feature} {activePage==='cards'?'are':'is'} currently unavailable.</strong></p><p>You can still browse your account pages.</p></aside>}
    {children}
   </div>
  </div>
 </div>
}
