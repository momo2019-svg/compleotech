// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // En dev tu peux laisser un fallback si tu veux, mais idéalement pas en prod
  console.error('❌ Supabase env vars manquantes (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  // throw new Error('Supabase env manquantes'); // ← décommente en prod si tu préfères fail fast
}

// Optionnel: config auth pour sessions persistantes côté navigateur
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // flowType: 'pkce', // optionnel (recommandé) si tu utilises OAuth modernes
  },
  realtime: {
    params: { eventsPerSecond: 10 }, // optionnel, limite le flux
  },
});
