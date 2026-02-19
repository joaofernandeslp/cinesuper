// src/components/auth/RequireAuth.jsx
import { useEffect, useRef, useState } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient.js";
import { IS_TV } from "../../app/target.js";

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t <= Date.now();
}

function daysUntil(expiresAt) {
  if (!expiresAt) return null;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function FullScreenGate({ title, detail, onRetry }) {
  return (
    <div className="min-h-[100vh] bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-5">
        <div className="text-lg font-bold">{title}</div>
        {detail ? <div className="mt-2 text-sm text-white/70 leading-relaxed">{detail}</div> : null}

        {onRetry ? (
          <button className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15" onClick={onRetry}>
            Tentar novamente
          </button>
        ) : null}
      </div>
    </div>
  );
}

async function fetchEntitlement(userId) {
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("user_id, plan, status, expires_at, max_screens, max_profiles, max_quality")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function fetchEntitlementWithRetry(userId) {
  const tries = [0, 400, 900];
  let lastErr = null;

  for (let i = 0; i < tries.length; i++) {
    if (tries[i]) await sleep(tries[i]);
    try {
      return await fetchEntitlement(userId);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Falha ao buscar entitlement.");
}

// Profile gate helpers
function storageKeyActiveProfile(uid) {
  return `cs_active_profile:${uid || "anon"}`;
}
function storageKeyActiveProfileName(uid) {
  return `cs_active_profile_name:${uid || "anon"}`;
}

function readActiveProfileId(uid) {
  if (!uid) return "";
  const k = storageKeyActiveProfile(uid);

  try {
    const ss = String(sessionStorage.getItem(k) || "").trim();
    if (ss) return ss;
  } catch {}

  // compat (caso algum trecho ainda tenha gravado em localStorage)
  try {
    const ls = String(localStorage.getItem(k) || "").trim();
    if (ls) return ls;
  } catch {}

  return "";
}

function clearActiveProfile(uid) {
  if (!uid) return;
  const k = storageKeyActiveProfile(uid);
  const kn = storageKeyActiveProfileName(uid);

  try {
    sessionStorage.removeItem(k);
    sessionStorage.removeItem(kn);
  } catch {}

  try {
    localStorage.removeItem(k);
    localStorage.removeItem(kn);
  } catch {}
}

export default function RequireAuth({ children }) {
  const location = useLocation();
  const GRACE_MS = 8000;

  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");

  const [session, setSession] = useState(null);
  const [ent, setEnt] = useState(null);

  const graceUntilRef = useRef(Date.now() + GRACE_MS);
  const entInFlightRef = useRef(false);
  const lastUidRef = useRef("");

  async function refreshEntitlement(uid, reason) {
    if (!uid) return;
    if (entInFlightRef.current) return;
    entInFlightRef.current = true;

    try {
      const entRow = await fetchEntitlementWithRetry(uid);
      setEnt(entRow);
      setBootError("");
      console.log("[RequireAuth] entitlement ok:", { reason, uid, status: entRow?.status });
    } catch (e) {
      console.error("[RequireAuth] entitlement error:", e);
      setEnt(null);
      setBootError(e?.message || "Falha ao validar assinatura.");
    } finally {
      entInFlightRef.current = false;
    }
  }

  async function boot(reason = "mount") {
    setBootError("");
    setBooting(true);

    try {
      const { data } = await supabase.auth.getSession();
      const sess = data?.session ?? null;
      setSession(sess);

      const uid = sess?.user?.id || "";
      if (uid) {
        lastUidRef.current = uid;
        void refreshEntitlement(uid, `boot:${reason}`);
      } else {
        setEnt(null);
        lastUidRef.current = "";
      }

      console.log("[RequireAuth] boot ok:", { reason, hasSession: !!sess, uid: uid || null });
    } catch (e) {
      console.error("[RequireAuth] boot error:", e);
      setSession(null);
      setEnt(null);
      lastUidRef.current = "";
      setBootError(e?.message || "Falha ao validar sessão.");
    } finally {
      setBooting(false);
    }
  }

  // ============
  // BOOT + AUTH EVENTS
  // ============
  useEffect(() => {
    let alive = true;

    void boot("mount");

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!alive) return;

      console.log("[RequireAuth] auth event:", event);
      setSession(newSession ?? null);

      const uid = newSession?.user?.id || "";

      // SIGNED_OUT / sessão perdida: limpa perfil salvo
      if (!uid) {
        if (lastUidRef.current) clearActiveProfile(lastUidRef.current);
        lastUidRef.current = "";
        setEnt(null);
        return;
      }

      // trocou usuário: limpa perfil do anterior
      if (lastUidRef.current && lastUidRef.current !== uid) {
        clearActiveProfile(lastUidRef.current);
        setEnt(null);
      }
      lastUidRef.current = uid;

      void refreshEntitlement(uid, `auth:${event}`);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============
  // ✅ TV/Capacitor: garante refresh token ao voltar do background
  // (Se você também colocar isso no App.jsx, remova de um dos dois para não duplicar.)
  // ============
  useEffect(() => {
    if (!IS_TV) return;

    let alive = true;
    let removeListener = null;

    (async () => {
      try {
        const mod = await import("@capacitor/app");
        if (!alive) return;

        const CapApp = mod?.App;
        if (!CapApp?.addListener) return;

        // quando o app está ativo, deixe o supabase fazendo auto-refresh
        try {
          supabase.auth.startAutoRefresh?.();
        } catch {}

        const sub = await CapApp.addListener("appStateChange", async (state) => {
          if (!alive) return;
          const active = !!state?.isActive;

          try {
            if (active) {
              supabase.auth.startAutoRefresh?.();

              // “nudge” ao voltar: força reavaliar sessão armazenada
              let sess = null;
              try {
                const { data } = await supabase.auth.getSession();
                sess = data?.session ?? null;
              } catch {}

              if (!sess) {
                // tenta renovar usando refresh token salvo (se existir)
                try {
                  await supabase.auth.refreshSession?.();
                } catch {}
              }

              // dá um grace novo e reboota estados (sessão/entitlement)
              graceUntilRef.current = Date.now() + GRACE_MS;
              await boot("resume");
            } else {
              // em background, pare timers (evita drift e comportamento estranho)
              supabase.auth.stopAutoRefresh?.();
            }
          } catch {}
        });

        removeListener = () => {
          try {
            sub?.remove?.();
          } catch {}
        };
      } catch {
        // sem capacitor => ignora
      }
    })();

    return () => {
      alive = false;
      try {
        removeListener?.();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============
  // RENDER / GATES
  // ============
  if (booting) {
    return <FullScreenGate title="Carregando sua sessão..." detail="Validando login e assinatura..." />;
  }

  const inGrace = Date.now() < graceUntilRef.current;

  if (!session && inGrace) {
    return (
      <FullScreenGate
        title="Restaurando sua sessão..."
        detail="Aguarde alguns segundos. Se não entrar, clique em tentar novamente."
        onRetry={() => boot("retry")}
      />
    );
  }

  if (bootError) {
    return (
      <FullScreenGate
        title="Não foi possível validar seu acesso"
        detail={bootError}
        onRetry={() => {
          graceUntilRef.current = Date.now() + GRACE_MS;
          void boot("retry");
        }}
      />
    );
  }

  if (!session) {
    const qp = new URLSearchParams();
    qp.set("next", location.pathname + (location.search || ""));
    return <Navigate to={`/login?${qp.toString()}`} replace />;
  }

  if (!ent) {
    return (
      <FullScreenGate
        title="Validando sua assinatura..."
        detail="Se isso demorar, pode ser conexão com o Supabase. Clique em tentar novamente."
        onRetry={() => {
          const uid0 = session?.user?.id;
          if (uid0) void refreshEntitlement(uid0, "manual-retry");
        }}
      />
    );
  }

  const status = String(ent?.status || "").toLowerCase();
  const expired = isExpired(ent?.expires_at);
  const daysLeft = daysUntil(ent?.expires_at);
  const showExpiringWarning =
    status === "active" && !!ent?.expires_at && !expired && Number.isFinite(daysLeft) && daysLeft <= 3 && daysLeft >= 0;
  const expiringLabel = daysLeft <= 0 ? "hoje" : daysLeft === 1 ? "1 dia" : `${daysLeft} dias`;

  if (status !== "active" || expired) {
    // ✅ TV: não redireciona para signup (web-only). Mostra instrução.
    if (IS_TV) {
      const detail = ent?.expires_at
        ? "Seu acesso por Pix expirou. Gere um novo Pix para voltar a assistir. Acesse app.cinesuper.com.br no celular/PC, finalize o pagamento e faça login novamente."
        : "Sua assinatura não está ativa ou expirou. Para regularizar, acesse app.cinesuper.com.br no celular/PC e finalize o pagamento. Depois volte para a TV e faça login novamente.";
      return (
        <FullScreenGate
          title="Assinatura inativa"
          detail={detail}
          onRetry={() => {
            const uid0 = session?.user?.id;
            if (uid0) void refreshEntitlement(uid0, "tv-retry-entitlement");
          }}
        />
      );
    }

    // Web: fluxo normal
    const qp = new URLSearchParams();
    qp.set("step", "2");
    qp.set("sub", "plans");
    qp.set("from", location.pathname);
    if (expired && ent?.expires_at) qp.set("reason", "pix_expired");
    return <Navigate to={`/signup?${qp.toString()}`} replace />;
  }

  // ============================
  // PROFILE GATE (Who is watching?)
  // ============================
  const uid = session?.user?.id || "";
  const path = String(location.pathname || "");

  const isWho = path.startsWith("/who");
  const isProfilesManage = path.startsWith("/profiles");
  const isLogin = path.startsWith("/login");
  const isSignup = path.startsWith("/signup");

  const activeProfileId = readActiveProfileId(uid);
  const needsProfile = uid && !activeProfileId && !isWho && !isProfilesManage && !isLogin && !isSignup;

  if (needsProfile) {
    const from = path + (location.search || "");
    return <Navigate to="/who" replace state={{ from }} />;
  }

  return (
    <>
      {showExpiringWarning ? (
        <div className="bg-amber-500/15 border-b border-amber-400/30 text-amber-100 px-5 py-3 text-sm">
          Seu acesso por Pix vence em{" "}
          <b className="text-amber-100">{expiringLabel}</b>. Gere um novo Pix para evitar
          bloqueio.
        </div>
      ) : null}
      {children}
    </>
  );
}
