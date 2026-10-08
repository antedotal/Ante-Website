// Presentational account navigation does not change financial authority. Closed
// source gates precede Auth; the verified-owner key remounts all child state and
// transient frames when identity changes inside the reusable shell.
import { redirect } from 'next/navigation'
import AccountShell from '../../../components/account/AccountShell'
import AccountPayments from '../../../components/account/AccountPayments'
import { createClient } from '../../../lib/supabase/server'
import { configuredPaymentWebsite } from '../../../lib/server/payment-bridge'

export const dynamic = 'force-dynamic'

export default async function AccountPaymentsPage() {
 const bindings = configuredPaymentWebsite()
 if (!bindings?.enabled) return <AccountShell activePage="cards" unavailable><AccountPayments enabled={false}/></AccountShell>
 const supabase = await createClient()
 const { data, error } = await supabase.auth.getUser()
 if (error || !data.user) redirect('/account/sign-in')
 return <AccountShell activePage="cards"><AccountPayments key={data.user.id} ownerId={data.user.id} enabled publishableKey={bindings.publishableKey}/></AccountShell>
}
