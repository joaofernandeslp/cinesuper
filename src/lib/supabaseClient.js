import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { IS_TV } from "../app/target.js";

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("[supabase] ENV ausente:", {
    hasUrl: !!SUPABASE_URL,
    hasAnon: !!SUPABASE_ANON_KEY,
  });
}

const safeWebStorage = {
  getItem: (key) => {
    try {
      return globalThis?.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      globalThis?.localStorage?.setItem(key, String(value ?? ""));
    } catch {}
  },
  removeItem: (key) => {
    try {
      globalThis?.localStorage?.removeItem(key);
    } catch {}
  },
};

const safeCapStorage = {
  getItem: async (key) => {
    try {
      const { value } = await Preferences.get({ key });
      return value ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      await Preferences.set({ key, value: String(value ?? "") });
    } catch {}
  },
  removeItem: async (key) => {
    try {
      await Preferences.remove({ key });
    } catch {}
  },
};

const useNativeStorage = IS_TV && !!Capacitor?.isNativePlatform?.();
const storage = useNativeStorage ? safeCapStorage : safeWebStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,

    // ✅ TV não precisa disso (é mais para OAuth/magic-link via URL)
    detectSessionInUrl: !IS_TV,

    // ✅ fixa para evitar variação entre builds
    storageKey: "cs_auth",

    storage,
  },
});
