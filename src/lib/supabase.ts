import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const remoteConfigured = Boolean(url && publicKey);
export const supabase = remoteConfigured ? createClient(url!, publicKey!) : null;
