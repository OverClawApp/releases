import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fmukgsxfnqcahdgxkvce.supabase.co'
const supabaseAnonKey = 'sb_publishable_EcO0J0_b7rO1KizdEFTp7Q__jTlJaVV'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
