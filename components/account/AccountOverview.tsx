// Show the server-verified identity and feature destinations without inventing
// cards, tasks, prices, entitlements or approval state. Each page owns its gate.
import styles from './AccountShell.module.css'
const features=[
 {title:'Cards',href:'/account/payments',description:'Manage saved cards and review your consent when card features are available.',link:'Open Cards'},
 {title:'Task funding',href:'/account/financial-tasks',description:'Review funding options and existing task commitments when available.',link:'Open Task funding'},
 {title:'Premium',href:'/account/premium',description:'Review Premium options and your subscription when available.',link:'Open Premium'},
] as const
export default function AccountOverview({identity}:{identity:string}){
 return <main className={styles.overview}>
  <h1>Your Ante account</h1>
  <p className={styles.identity}>Signed in as {identity}</p>
  <p className={styles.introduction}>Your cards, task funding and Premium, in one place. Availability is shown on each page. If a feature is unavailable, you won’t be able to start a new financial action there.</p>
  <div className={styles.features}>{features.map(feature=><section key={feature.title} className={styles.feature}><h2>{feature.title}</h2><p>{feature.description}</p><a href={feature.href}>{feature.link}</a></section>)}</div>
 </main>
}
