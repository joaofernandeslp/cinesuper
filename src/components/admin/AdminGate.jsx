// src/components/admin/AdminGate.jsx
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient.js";

function parseAllowed() {
  const raw = import.meta.env.VITE_ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default function AdminGate({ children }) {
  const allowed = useMemo(() => parseAllowed(), []);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data?.session || null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-white/70">Carregando...</div>;
  }

  if (!session) return <Navigate to="/admin" replace />;

  const email = (session.user?.email || "").toLowerCase();
  if (allowed.length && !allowed.includes(email)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 text-white">
        <div className="max-w-md w-full rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Acesso negado</div>
          <div className="mt-2 text-sm text-white/70">
            Este usuário não está autorizado para o Admin.
          </div>
          <button
            className="mt-4 rounded bg-white px-4 py-2 text-sm font-semibold text-black"
            onClick={() => supabase.auth.signOut()}
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  return children;
}
