import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
// Uses environment variables for configuration
// These should be set in your .env.local file:
// NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
// NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Create and export the Supabase client instance
// This client can be used in both client and server components
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
