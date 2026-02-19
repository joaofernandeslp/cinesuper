// src/app/App.jsx
import { useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { routes } from "./routes.jsx";
import DomainGate from "../components/DomainGate.jsx";
import ScrollToTop from "../components/ScrollToTop.jsx";
import { IS_TV, TV_HOME } from "./target.js";
import { ensureTvNavInit } from "./tvNavInit.js";
import { ensureTvScaleInit } from "./tv/tvScaleInit.js";
import { supabase } from "../lib/supabaseClient.js";
import { checkForUpdate, downloadUpdate } from "../lib/update.ts";

function routeEnabledForTarget(r) {
  const targets = Array.isArray(r.targets) ? r.targets.map(String) : null;
  if (targets) return targets.includes(IS_TV ? "tv" : "web");
  if (r.tvOnly) return IS_TV;
  if (r.webOnly) return !IS_TV;
  return true;
}

function isTextInput(el) {
  if (!el) return false;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

function samePath(a, b) {
  const aa = String(a || "").replace(/\/+$/, "") || "/";
  const bb = String(b || "").replace(/\/+$/, "") || "/";
  return aa === bb;
}

export default function App() {
  const nav = useNavigate();
  const location = useLocation();
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateStage, setUpdateStage] = useState("idle"); // idle|available|downloading|external|dismissed
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateError, setUpdateError] = useState("");
  const [updateAutoStarted, setUpdateAutoStarted] = useState(false);
  const updateUrl =
    (import.meta && import.meta.env && (import.meta.env.VITE_TV_UPDATE_URL || import.meta.env.VITE_APP_UPDATE_URL)) ||
    "";
  const updateDisabled =
    IS_TV &&
    (String(import.meta?.env?.VITE_TV_UPDATE_DISABLE ?? "") === "1" ||
      String(import.meta?.env?.VITE_TV_UPDATE_DEBUG ?? "") === "1");

  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    if (!IS_TV) return;
    if (updateDisabled) return;

    ensureTvNavInit();
    ensureTvScaleInit();

    try {
      document.documentElement.classList.add("cs-tv");
    } catch {}
  }, []);

  // ✅ TV: checa atualização na abertura
  useEffect(() => {
    if (!IS_TV) return;

    let alive = true;

    (async () => {
      try {
        const res = await checkForUpdate(updateUrl);
        if (!alive) return;
        if (res?.updateAvailable && res?.info) {
          setUpdateInfo(res.info);
          setUpdateStage("available");
        }
      } catch (e) {
        if (!alive) return;
      }
    })().catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  const startUpdate = async () => {
    if (!updateInfo?.apkUrl) return;
    setUpdateStage("downloading");
    setUpdateProgress(0);
    setUpdateError("");

    const res = await downloadUpdate(updateInfo.apkUrl, (p) => {
      setUpdateProgress(Math.max(0, Math.min(1, Number(p?.progress || 0))));
    });

    if (!res?.ok) {
      setUpdateStage("external");
      if (res?.reason === "native_download_failed") {
        setUpdateError("Não foi possível iniciar o download no dispositivo. Verifique a permissão e tente novamente.");
      } else if (res?.reason === "no_native_bridge") {
        setUpdateError("Atualização não suportada neste dispositivo.");
      } else {
        setUpdateError("Não foi possível iniciar o download. Tente novamente.");
      }
    }
  };

  // ✅ TV: bloquear Backspace/Del “voltar página” (APAGAR)
  useEffect(() => {
    if (!IS_TV) return;

    const onKeyDownCapture = (e) => {
      // Backspace/Del não pode fazer "back" de página quando não está em input
      if (e.key === "Backspace" || e.key === "Delete") {
        const ae = document.activeElement;
        if (!isTextInput(ae)) {
          try {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
          } catch {}
        }
      }
    };

    window.addEventListener("keydown", onKeyDownCapture, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDownCapture, { capture: true });
  }, []);

  // ✅ TV: BACK físico (nativo) — não fechar app, e sim voltar/fechar overlay
  useEffect(() => {
    if (!IS_TV) return;

    let removeListener = null;
    let alive = true;

    (async () => {
      try {
        const mod = await import("@capacitor/app");
        if (!alive) return;

        const CapApp = mod?.App;
        if (!CapApp?.addListener) return;

        const sub = await CapApp.addListener("backButton", (data) => {
          // 1) Se existir overlay aberto, fecha primeiro
          const closer = window.__CS_TV_OVERLAY_CLOSE__;
          if (typeof closer === "function") {
            try {
              closer();
            } catch {}
            return;
          }

          const loc = locationRef.current || {};
          const curPath = String(loc.pathname || "");
          const homePath = String(TV_HOME || "/");

          // 2) Se WebView diz que pode voltar, tenta voltar no router
          // (isso cobre /t/:id, /profiles etc)
          if (data?.canGoBack) {
            try {
              nav(-1);
              return;
            } catch {}
          }

          // 3) Se não pode voltar, mas não está na home -> manda pra home
          if (!samePath(curPath, homePath) && !samePath(curPath, "/")) {
            nav(TV_HOME, { replace: true });
            return;
          }

          // 4) Já está na home: NÃO fecha app (ignora)
        });

        removeListener = () => {
          try {
            sub?.remove?.();
          } catch {}
        };
      } catch {
        // se não tiver Capacitor/App no bundle, só não intercepta
      }
    })();

    return () => {
      alive = false;
      try {
        removeListener?.();
      } catch {}
    };
  }, [nav]);

    // ✅ TV (Capacitor): garante refresh token ao voltar do background
  // ✅ TV/Capacitor: garante refresh token ao voltar do background
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
        try { supabase.auth.startAutoRefresh?.(); } catch {}

        const sub = await CapApp.addListener("appStateChange", async (state) => {
          const active = !!state?.isActive;

          try {
            if (active) {
              supabase.auth.startAutoRefresh?.();

              // “nudge” ao voltar: força reavaliar sessão armazenada
              const { data } = await supabase.auth.getSession();
              if (!data?.session) {
                // tenta renovar usando refresh token salvo (se existir)
                try { await supabase.auth.refreshSession?.(); } catch {}
              }
            } else {
              // em background, pare timers (evita drift e comportamento estranho)
              supabase.auth.stopAutoRefresh?.();
            }
          } catch {}
        });

        removeListener = () => {
          try { sub?.remove?.(); } catch {}
        };
      } catch {
        // sem capacitor => ignora
      }
    })();

    return () => {
      alive = false;
      try { removeListener?.(); } catch {}
    };
  }, []);

  const enabledRoutes = routes.filter(routeEnabledForTarget);
  const showUpdate = IS_TV && updateInfo && updateStage !== "dismissed" && !updateDisabled;
  const progressPct = Math.round((updateProgress || 0) * 100);

  // ✅ TV: bloqueia back/escape enquanto update obrigatório estiver aberto
  useEffect(() => {
    if (!showUpdate) return;

    const prevCloser = window.__CS_TV_OVERLAY_CLOSE__;
    window.__CS_TV_OVERLAY_CLOSE__ = () => {};

    const onKeyDownCapture = (e) => {
      if (e.key === "Escape" || e.key === "Backspace" || e.key === "Delete") {
        try {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
        } catch {}
      }

      if (e.key === "Enter" || e.key === "OK") {
        try {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
        } catch {}
        if (updateStage === "available" || updateStage === "external") {
          startUpdate();
        }
      }
    };

    window.addEventListener("keydown", onKeyDownCapture, { capture: true });
    return () => {
      try {
        window.__CS_TV_OVERLAY_CLOSE__ = prevCloser;
      } catch {}
      window.removeEventListener("keydown", onKeyDownCapture, { capture: true });
    };
  }, [showUpdate]);

  // ✅ auto-inicia o download (update obrigatório) - só uma vez por versão
  useEffect(() => {
    if (!showUpdate) return;
    if (updateStage !== "available") return;
    if (updateAutoStarted) return;
    const key = `cs_update_autostart_${updateInfo?.latestVersionCode || "x"}`;
    if (localStorage.getItem(key) === "1") return;
    localStorage.setItem(key, "1");
    setUpdateAutoStarted(true);
    const t = setTimeout(() => startUpdate(), 400);
    return () => clearTimeout(t);
  }, [showUpdate, updateStage, updateAutoStarted]);

  // ✅ erro do download nativo
  useEffect(() => {
    if (!showUpdate) return;
    const onErr = (ev) => {
      const detail = ev?.detail || {};
      const reason = detail?.reason != null ? ` (code ${detail.reason})` : "";
      if (detail?.code === "install_permission_required") {
        setUpdateError("Permita instalação de apps desconhecidos e clique em Atualizar agora novamente.");
        setUpdateStage("external");
      } else {
        setUpdateError(`Falha no download${reason}. Tente novamente.`);
        setUpdateStage("external");
      }
    };
    window.addEventListener("cs:update-error", onErr);
    return () => window.removeEventListener("cs:update-error", onErr);
  }, [showUpdate]);

  const updateUi = showUpdate ? (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-6">
      <div className="w-full max-w-[680px] rounded-2xl border border-white/10 bg-[#141414] p-6 text-white shadow-2xl">
        {updateStage === "downloading" ? (
          <>
            <div className="text-[13px] uppercase tracking-[0.2em] text-white/60">Atualizando</div>
            <div className="mt-4">
              <div className="mb-2 text-sm text-white/70">Baixando… {progressPct}%</div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-emerald-500" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-[13px] uppercase tracking-[0.2em] text-white/60">Atualização obrigatória</div>
            <div className="mt-2 text-2xl font-semibold">CineSuper TV</div>
            <div className="mt-1 text-sm text-white/70">
              Versão nova:{" "}
              <span className="text-white/90">
                {updateInfo.latestVersionName || `build ${updateInfo.latestVersionCode}`}
              </span>
            </div>

            {updateInfo.notes ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                {updateInfo.notes}
              </div>
            ) : null}

            {updateStage === "external" ? (
              <div className="mt-4 text-sm text-white/70">
                Abrimos o download no sistema. Após baixar, confirme a instalação.
              </div>
            ) : null}

            {updateError ? (
              <div className="mt-4 text-sm text-red-300">{updateError}</div>
            ) : null}

            <div className="mt-6 flex items-center gap-3">
              <button
                className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white"
                onClick={startUpdate}
              >
                Atualizar agora
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null;

  const routesUi = (
    <>
      {/* ✅ WEB: sempre iniciar páginas no topo (na TV não aplica) */}
      {!IS_TV ? <ScrollToTop /> : null}

      <Routes>
        {IS_TV && !enabledRoutes.some((r) => r.path === "/") ? (
          <Route path="/" element={<Navigate to={TV_HOME} replace />} />
        ) : null}

        {enabledRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={r.element} />
        ))}
      </Routes>

      {updateUi}
    </>
  );

  if (IS_TV && showUpdate) return updateUi;
  return IS_TV ? routesUi : <DomainGate>{routesUi}</DomainGate>;
}
