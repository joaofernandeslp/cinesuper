import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

export function useAuthBoot() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      // 1) restaura do storage
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      setSession(data?.session ?? null);
      setBooting(false);

      // 2) mantém em sync
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
        if (!alive) return;
        setSession(s ?? null);
      });

      // cleanup
      return () => sub?.subscription?.unsubscribe?.();
    })();

    return () => {
      alive = false;
    };
  }, []);

  return { booting, session, user: session?.user ?? null };
}
