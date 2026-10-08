// Render a minimal account view only after verifying the cookie-backed identity on the server.
import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import AccountShell from '../../components/account/AccountShell'
import AccountOverview from '../../components/account/AccountOverview'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) redirect('/account/sign-in')

  const identity = typeof data.claims.email === 'string' ? data.claims.email : data.claims.sub
  return <AccountShell activePage="overview"><AccountOverview identity={identity}/></AccountShell>
}
