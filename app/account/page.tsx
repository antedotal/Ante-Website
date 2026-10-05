// Render a minimal account view only after verifying the cookie-backed identity on the server.
import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) redirect('/account/sign-in')

  const identity = typeof data.claims.email === 'string' ? data.claims.email : data.claims.sub
  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-24 text-[#003a4a]">
      <h1 className="text-3xl font-semibold">Your Ante account</h1>
      <p className="mt-4">Signed in as {identity}</p>
      <p className="mt-6 text-sm">Account access is being prepared. Financial features are not available here.</p>
    </main>
  )
}
