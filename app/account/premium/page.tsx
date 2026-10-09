// Presentational account navigation does not change financial authority. Closed
// source gates precede Auth; the verified-owner key remounts all child state and
// transient frames when identity changes inside the reusable shell.
import { redirect } from 'next/navigation'
import AccountShell from '../../../components/account/AccountShell'
import AccountFinancial from '../../../components/account/AccountFinancial'
import { createClient } from '../../../lib/supabase/server'
import { configuredFinancialWebsite } from '../../../lib/server/financial-bridge'

export const dynamic = 'force-dynamic'

export default async function FinancialPage() {
 const bindings = configuredFinancialWebsite()
 if (!bindings?.enabled) return <AccountShell activePage="premium" unavailable><AccountFinancial enabled={false} purpose="premium"/></AccountShell>
 const supabase = await createClient()
 const { data, error } = await supabase.auth.getUser()
 if (error || !data.user) redirect('/account/sign-in')
 return <AccountShell activePage="premium"><AccountFinancial key={data.user.id} ownerId={data.user.id} enabled purpose="premium" publishableKey={bindings.publishableKey}/></AccountShell>
}
