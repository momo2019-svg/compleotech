import { createClient } from '@supabase/supabase-js';

// 1) Essaie d'abord de lire les variables d'env (Vite)
// 2) Sinon, fallback sur tes valeurs (OK pour DEV local)
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://zwrygtkmzzzeyqgemzns.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3cnlndGttenp6ZXlxZ2Vtem5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyNTcyNDIsImV4cCI6MjA3NDgzMzI0Mn0.LWO9XVplpLOVne1zi6uLGkQCKzhLNaCe8g_IbqNfkfQ';

if (!supabaseUrl || !supabaseAnonKey) {
  // En prod, mieux vaut throw pour éviter un app silencieusement cassée
  console.error('❌ Supabase env vars manquantes (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
}

// Optionnel: config auth pour sessions persistantes côté navigateur
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
