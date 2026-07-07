import { createClient } from "@supabase/supabase-js";
 
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
 
// Explicit auth config so sessions stay signed in — especially on mobile browsers.
// - persistSession + localStorage: the login is remembered after you close the tab.
// - autoRefreshToken: the session renews itself instead of silently expiring.
// - detectSessionInUrl: needed so email-confirmation / password-reset links work.
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    storageKey: "healthtracker-auth",
    flowType: "pkce",
  },
});