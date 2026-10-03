'use client'

// Keep account sign-in separate from the marketing waitlist and expose Google only.
import { useState } from 'react'
import { beginGoogleSignIn } from '../../../lib/supabase/google-sign-in'

export default function AccountSignInPage() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function signIn() {
    setBusy(true)
    setError(await beginGoogleSignIn())
    setBusy(false)
  }

  return (
    <main className="mx-auto min-h-screen max-w-xl px-6 py-24 text-[#003a4a]">
      <h1 className="text-3xl font-semibold">Sign in to Ante</h1>
      <p className="mt-4">Use the Google account linked to your Ante app.</p>
      <button className="mt-8 rounded-lg bg-[#005b70] px-5 py-3 font-medium text-white disabled:opacity-50" disabled={busy} onClick={signIn} type="button">
        Continue with Google
      </button>
      {error && <p className="mt-4" role="alert">{error}</p>}
    </main>
  )
}
