/**
 * Centralized Supabase access.
 *
 * The underlying client lives in `src/integrations/supabase/client.ts`. It reads
 * `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `import.meta.env`,
 * persists the session in `localStorage`, and auto-refreshes tokens.
 *
 * This module re-exports it (so the rest of the app imports from a single
 * place) and exposes `isSupabaseConfigured()` for graceful UI fallbacks when
 * the environment variables are missing.
 */
export { supabase } from "@/integrations/supabase/client";

export function isSupabaseConfigured(): boolean {
  const url =
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
    (import.meta.env.SUPABASE_URL as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_URL_FALLBACK as string | undefined);
  const key =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
    (import.meta.env.SUPABASE_ANON_KEY as string | undefined);
  return Boolean(url && key);
}

export function missingSupabaseEnvVars(): string[] {
  const missing: string[] = [];
  const url = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    import.meta.env.SUPABASE_ANON_KEY;

  if (!url) missing.push("VITE_SUPABASE_URL or SUPABASE_URL");
  if (!key) missing.push("VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_PUBLISHABLE_KEY");
  return missing;
}
