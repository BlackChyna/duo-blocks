/**
 * DUO BLOCKS — Supabase client bootstrap.
 *
 * Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. When either is missing
 * (or still a placeholder from .env.example) `supabase` is null and
 * `isSupabaseConfigured()` is false — every service method then degrades to
 * a local-only no-op instead of throwing.
 *
 * All data is protected by Row Level Security (see supabase/migrations/0001_init.sql);
 * the anon key is publishable by design. NEVER put the service_role key here.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Fixed two-player room id (Cyril + Yayra). */
export const ROOM_ID = 'cyril-yayra-001';

const SUPABASE_URL = readEnv('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = readEnv('VITE_SUPABASE_ANON_KEY');

function readEnv(name: string): string | undefined {
  try {
    const raw = (import.meta.env as Record<string, unknown> | undefined)?.[name];
    if (typeof raw !== 'string') return undefined;
    const value = raw.trim();
    // .env.example placeholders must never be treated as a real configuration
    if (value.length === 0 || value.startsWith('YOUR-')) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

export const isSupabaseConfigured = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;
