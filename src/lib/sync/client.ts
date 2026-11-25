/**
 * Lazy Supabase client. Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the app never loads
 * supabase-js at all and cloud sync simply stays off.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

function readEnv(): { url: string; key: string } | null {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
    const url = (env.VITE_SUPABASE_URL ?? '').trim();
    const key = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
    if (!url || !key || !/^https?:\/\//.test(url)) return null;
    return { url, key };
  } catch {
    return null;
  }
}

/** True when the build has Supabase keys. */
export function isConfigured(): boolean {
  return readEnv() !== null;
}

let clientPromise: Promise<SupabaseClient | null> | null = null;

/** The shared client, created on first use. Resolves null when sync isn't configured. */
export function getClient(): Promise<SupabaseClient | null> {
  if (!clientPromise) {
    const env = readEnv();
    clientPromise = !env
      ? Promise.resolve(null)
      : import('@supabase/supabase-js').then(({ createClient }) =>
          createClient(env.url, env.key, {
            auth: {
              flowType: 'pkce', // code comes back in ?code=, so the app's #hash routes stay intact
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true,
              storageKey: 'hisaab-auth',
            },
          }),
        ).catch(() => {
          clientPromise = null; // e.g. offline and the chunk isn't cached yet; try again later
          return null;
        });
  }
  return clientPromise;
}
