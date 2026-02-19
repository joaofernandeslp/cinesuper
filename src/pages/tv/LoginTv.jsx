import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useFocusable, FocusContext, setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { supabase } from "../../lib/supabaseClient.js";
import Logo from "../../assets/Logo.png";

const MOBILE_TV_URL = "https://app.cinesuper.com.br/tv";

/* =========================
   DeviceId estável (TV)
   - evita "insert infinito" no tv_pairings
========================= */

const DEVICE_KEY = "cs_tv_device_id";

function fallbackUuid() {
  return (
    "tv-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2) +
    "-" +
    Math.random().toString(36).slice(2)
  );
}

function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() || fallbackUuid());
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return (crypto?.randomUUID?.() || fallbackUuid());
  }
}

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

function blurActiveElement() {
  try {
    const el = document.activeElement;
    if (el && typeof el.blur === "function") el.blur();
  } catch {}
}

function isTextInput(el) {
  if (!el) return false;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if (el.isContentEditable) return true;
  return false;
}

function forceTop(frames = 14) {
  let i = 0;
  const step = () => {
    try { window.scrollTo(0, 0); } catch {}
    try { document.documentElement.scrollTop = 0; } catch {}
    try { document.body.scrollTop = 0; } catch {}
    i++;
    if (i < frames) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function focusInputDom(inputRef) {
  const el = inputRef?.current;
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    try { el.focus(); } catch {}
  }
  try {
    const v = String(el.value ?? "");
    el.setSelectionRange?.(v.length, v.length);
  } catch {}
}

/**
 * Normaliza "next/from" para as rotas REAIS do seu app.
 * - Seu app usa /who, /browse, /watch/:id, /t/:id (sem /tv)
 * - /tv é a tela de login TV
 */
function computeRedirectPath(nextQuery) {
  const q = typeof nextQuery === "string" ? nextQuery.trim() : "";

  if (!q) return "/browse";
  if (!q.startsWith("/")) return "/browse";

  if (q === "/login" || q === "/tv" || /^\/tv\/login/i.test(q)) return "/browse";
  if (q.startsWith("/admin")) return "/browse";

  if (q.startsWith("/tv/")) {
    const stripped = q.replace(/^\/tv/, "");
    if (stripped === "/login" || stripped === "/") return "/browse";
    return stripped || "/browse";
  }

  return q;
}

/* =========================
   Helpers (invoke com timeout)
========================= */

function timeoutAfter(ms, label = "invoke") {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout ao chamar ${label} (${ms}ms)`)), ms);
  });
}

async function invokeFn(name, body, timeoutMs = 12000) {
  let out;

  try {
    out = await Promise.race([
      supabase.functions.invoke(name, { body }),
      timeoutAfter(timeoutMs, name),
    ]);
  } catch (e) {
    const base = supabase?.supabaseUrl || "";
    const url = base ? `${base}/functions/v1/${name}` : "(supabaseUrl indefinido)";
    console.error(`[fn:${name}] failed to send request`, { url, err: e });

    throw new Error(
      `Falha de rede ao chamar Edge Function.\n` +
      `Verifique internet da TV, data/hora do sistema e acesso ao endpoint:\n` +
      `${url}\n` +
      `Detalhe: ${String(e?.message || e)}`
    );
  }

  const { data, error } = out || {};

  if (error) {
    const res = error?.context?.response;
    const status = res?.status;

    let raw = "";
    try { raw = await res?.clone?.().text?.(); } catch {}

    console.error(`[fn:${name}] non-2xx`, { status, raw, error });

    let msg = error?.message || "Falha ao chamar Edge Function.";
    try {
      const j = raw ? JSON.parse(raw) : null;
      if (j?.error) msg = j.error;
      if (j?.message) msg = j.message;
    } catch {}

    throw new Error(`${msg}${status ? ` (HTTP ${status})` : ""}`);
  }

  return data;
}

/* =========================
   UI (TV)
========================= */

function StatusPill({ tone = "muted", children }) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : tone === "warn"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-200"
      : tone === "err"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : "border-white/10 bg-white/5 text-white/70";

  return (
    <div className={cx("inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm", toneCls)}>
      {children}
    </div>
  );
}

function TvTab({ focusKey, active, onEnter, children }) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => {
      blurActiveElement();
      onEnter?.();
      forceTop(10);
    },
  });

  return (
    <button
      ref={ref}
      tabIndex={-1}
      type="button"
      className={cx(
        "outline-none px-6 py-3.5 text-base font-semibold transition rounded-2xl",
        active ? "bg-white text-black" : "bg-white/10 text-white",
        focused ? "ring-4 ring-white/70" : ""
      )}
    >
      {children}
    </button>
  );
}

function TvButton({ focusKey, onEnter, children, disabled = false, className = "" }) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => {
      blurActiveElement();
      onEnter?.();
      forceTop(10);
    },
  });

  return (
    <button
      ref={ref}
      tabIndex={-1}
      type="button"
      disabled={disabled}
      className={cx(
        "outline-none rounded-2xl px-6 py-4 text-lg font-semibold transition",
        disabled ? "opacity-60" : "",
        focused ? "ring-4 ring-white/80 bg-white/15" : "bg-white/10",
        className
      )}
    >
      {children}
    </button>
  );
}

function TvInput({ focusKey, label, value, onChange, type = "text", inputRef, hint, requestOpen }) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => {
      requestOpen?.();
    },
  });

  return (
    <div>
      <div className="text-sm text-white/70 mb-2">{label}</div>

      <button
        ref={ref}
        tabIndex={-1}
        type="button"
        className={cx(
          "w-full text-left rounded-2xl border bg-black/40 px-5 py-4 outline-none transition",
          focused ? "border-white/70 ring-4 ring-white/35" : "border-white/10"
        )}
        onClick={(e) => {
          e.preventDefault();
          requestOpen?.();
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={onChange}
          type={type}
          className="w-full bg-transparent outline-none text-white text-lg"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          onFocus={() => forceTop(14)}
          onClick={() => forceTop(14)}
        />
      </button>

      <div className="mt-2 text-sm text-white/45">
        {hint || "Pressione OK para abrir o teclado."}
      </div>
    </div>
  );
}

/* =========================
   Login TV
========================= */

export default function LoginTv() {
  const nav = useNavigate();
  useLocation();

  const deviceIdRef = useRef("");
  if (!deviceIdRef.current) deviceIdRef.current = getOrCreateDeviceId();

  useEffect(() => {
    try {
      console.log("[TV] supabaseUrl:", supabase?.supabaseUrl);
      console.log("[TV] deviceId:", deviceIdRef.current);
    } catch {}
  }, []);

  const nextQuery = useMemo(() => {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get("next") || u.searchParams.get("from") || "";
    } catch {
      return "";
    }
  }, []);

  const redirectTo = useMemo(() => computeRedirectPath(nextQuery), [nextQuery]);

  const emailRef = useRef(null);
  const passRef = useRef(null);

  const [mode, setMode] = useState("code");
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const editingRef = useRef(null);

  const [pair, setPair] = useState(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [dots, setDots] = useState("");
  const [expiresText, setExpiresText] = useState("");

  const switchModeSafe = useCallback((next) => {
    setErr("");
    setMsg("");
    setMode(next);
    blurActiveElement();
    forceTop(14);
  }, []);

  const openEmail = useCallback(() => {
    editingRef.current = "email";
    setFocus("login-tv:remote:email");
    forceTop(14);
    requestAnimationFrame(() => {
      focusInputDom(emailRef);
      forceTop(14);
    });
  }, []);

  const openPass = useCallback(() => {
    editingRef.current = "pass";
    setFocus("login-tv:remote:pass");
    forceTop(14);
    requestAnimationFrame(() => {
      focusInputDom(passRef);
      forceTop(14);
    });
  }, []);

  useEffect(() => {
    const onKeyDownCapture = (e) => {
      const el = document.activeElement;
      if (!isTextInput(el)) return;

      const key = e.key;
      const code = e.code;
      const kc = e.keyCode || e.which || 0;

      const isDown = key === "ArrowDown" || code === "ArrowDown" || kc === 20;
      const isUp = key === "ArrowUp" || code === "ArrowUp" || kc === 19;
      const isEnter = key === "Enter" || code === "Enter" || kc === 66 || kc === 13;

      if (isDown || isEnter) {
        e.preventDefault();
        e.stopPropagation();

        if (el === emailRef.current) {
          blurActiveElement();
          setFocus("login-tv:remote:pass");
          forceTop(16);
          return;
        }
        if (el === passRef.current) {
          blurActiveElement();
          setFocus("login-tv:remote:submit");
          forceTop(16);
          return;
        }
      }

      if (isUp) {
        e.preventDefault();
        e.stopPropagation();

        if (el === passRef.current) {
          blurActiveElement();
          setFocus("login-tv:remote:email");
          forceTop(16);
          return;
        }
      }

      e.stopPropagation();
    };

    window.addEventListener("keydown", onKeyDownCapture, true);
    return () => window.removeEventListener("keydown", onKeyDownCapture, true);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let lastH = vv.height;

    const onResize = () => {
      const h = vv.height;
      if (h > lastH) forceTop(22);
      lastH = h;
    };

    vv.addEventListener("resize", onResize, { passive: true });
    vv.addEventListener("scroll", () => forceTop(12), { passive: true });

    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", () => forceTop(12));
    };
  }, []);

  async function createPairing({ silent = false } = {}) {
    if (!silent) {
      setErr("");
      setMsg("");
    }
    setPairLoading(true);

    try {
      const deviceId = deviceIdRef.current;

      const data = await invokeFn(
        "tv-pairing-create",
        { deviceId, tvMeta: { ua: navigator.userAgent } },
        20000
      );
      if (!data?.ok) throw new Error(data?.error || "Falha ao gerar código.");

      setPair({
        pairingId: data.pairingId,
        code: data.code,
        secret: data.secret,
        expiresAt: data.expiresAt,
        deviceId: data.deviceId || deviceId,
      });
    } catch (e) {
      setErr(e?.message || "Falha ao gerar código.");
    } finally {
      setPairLoading(false);
    }
  }

  async function pollPairingOnce(p) {
    const data = await invokeFn("tv-pairing-poll", { pairingId: p.pairingId, secret: p.secret }, 12000);
    if (!data?.ok) return { status: "error", error: data?.error || "poll error" };
    return data;
  }

  useEffect(() => {
    if (mode !== "code") return;
    if (pair?.pairingId) return;
    createPairing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "code") return;
    if (!pair?.pairingId) return;
    const t = setInterval(() => setDots((d) => (d.length >= 3 ? "" : d + ".")), 450);
    return () => clearInterval(t);
  }, [mode, pair?.pairingId, pair?.secret]);

  useEffect(() => {
    if (mode !== "code") return;
    if (!pair?.expiresAt) {
      setExpiresText("");
      return;
    }

    let alive = true;

    const tick = () => {
      if (!alive) return;
      const exp = new Date(pair.expiresAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, exp - now);

      const s = Math.floor(diff / 1000);
      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      setExpiresText(`${mm}:${ss}`);

      if (diff === 0) {
        setMsg("Código expirou. Gerando um novo...");
        createPairing({ silent: true });
      }
    };

    tick();
    const t = setInterval(tick, 500);
    return () => {
      alive = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pair?.expiresAt]);

  /**
   * ✅ POLLING CORRIGIDO
   * - NÃO encerra polling antes de setSession concluir com sucesso
   * - Aceita accessToken/refreshToken e access_token/refresh_token
   * - Se setSession falhar, mantém polling (não trava)
   */
  useEffect(() => {
    if (mode !== "code") return;
    if (!pair?.pairingId || !pair?.secret) return;

    let alive = true;
    let busy = false;

    setPolling(true);

    const tick = async () => {
      if (!alive || busy) return;
      busy = true;

      try {
        const res = await pollPairingOnce(pair);
        if (!alive) return;

        // debug útil (deixa no console por enquanto)
        // console.log("[tv-pairing-poll] res:", res);

        if (res?.status === "pending") return;

        if (res?.status === "expired") {
          setMsg("Código expirou. Gerando um novo...");
          await createPairing({ silent: true });
          return;
        }

        const accessToken = res?.accessToken || res?.access_token;
        const refreshToken = res?.refreshToken || res?.refresh_token;

        if (accessToken && refreshToken) {
          // tenta salvar sessão; se falhar, NÃO interrompe polling
          try {
            await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
          } catch (e) {
            console.error("[TV] setSession failed:", e);
            setErr(`Falha ao salvar sessão na TV: ${String(e?.message || e)}`);
            return;
          }

          if (!alive) return;

          setMsg("Conectado. Abrindo...");
          // navega para tela de perfis
          nav("/who", { replace: true, state: { from: redirectTo } });
          return;
        }

        // se veio algum erro explícito
        if (res?.status === "error") {
          // não mata o polling; só mostra (muitas vezes é transitório)
          if (res?.error) console.warn("[tv-pairing-poll] error:", res.error);
        }
      } catch (e) {
        console.warn("[tv-pairing-poll] transient error", e?.message || e);
      } finally {
        busy = false;
      }
    };

    tick();
    const id = setInterval(tick, 2000);

    return () => {
      alive = false;
      clearInterval(id);
      setPolling(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pair?.pairingId, pair?.secret, nav, redirectTo]);

  const preferred = mode === "code" ? "login-tv:code:regen" : "login-tv:remote:email";
  const { ref, focusKey, focusSelf } = useFocusable({
    focusKey: "login-tv",
    isFocusBoundary: true,
    saveLastFocusedChild: true,
    trackChildren: true,
    preferredChildFocusKey: preferred,
  });

  useEffect(() => {
    const t = setTimeout(() => focusSelf(), 0);
    return () => clearTimeout(t);
  }, [focusSelf]);

  async function doLoginRemote() {
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      blurActiveElement();

      const cleanEmail = String(email || "").trim().toLowerCase();
      if (!cleanEmail) throw new Error("Informe o e-mail.");
      if (!password) throw new Error("Informe a senha.");

      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) throw error;

      setMsg("Login efetuado. Carregando...");
      nav("/who", { replace: true, state: { from: redirectTo } });
    } catch (e) {
      setErr(e?.message || "Falha ao fazer login.");
      setFocus("login-tv:remote:submit");
    } finally {
      setLoading(false);
    }
  }

  const isCodeMode = mode === "code";
  const code = pair?.code || "";

  const qrPayload = code ? `${MOBILE_TV_URL}?code=${encodeURIComponent(code)}` : MOBILE_TV_URL;
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrPayload)}`;

  const statusTone = pairLoading ? "muted" : polling ? "ok" : "muted";
  const statusText = pairLoading ? "Gerando código…" : polling ? `Aguardando confirmação${dots}` : "Pronto";

  return (
    <div className="h-full w-full bg-black text-white relative">
      <div
        className="absolute inset-0 pointer-events-none opacity-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 30% 10%, rgba(255,255,255,0.08), rgba(0,0,0,0) 60%), radial-gradient(900px 500px at 80% 20%, rgba(255,255,255,0.06), rgba(0,0,0,0) 55%)",
        }}
      />

      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className="tv-safe">
          <div className="flex items-center justify-between">
            <img src={Logo} alt="CineSuper" className="h-24 w-auto" draggable={false} />
            <div className="text-sm text-white/50">TV</div>
          </div>

          <div className="mt-3 flex items-center justify-center">
            <div className="inline-flex items-center gap-3 rounded-3xl bg-white/5 p-2.5 border border-white/10">
              <TvTab focusKey="login-tv:tab:code" active={isCodeMode} onEnter={() => switchModeSafe("code")}>
                Código no celular
              </TvTab>
              <TvTab focusKey="login-tv:tab:remote" active={!isCodeMode} onEnter={() => switchModeSafe("remote")}>
                Acesso no controle
              </TvTab>
            </div>
          </div>

          <div className="mt-4 mx-auto max-w-5xl">
            {err ? (
              <div className="mb-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-base text-red-200">
                {err}
              </div>
            ) : null}

            {msg ? (
              <div className="mb-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-base text-emerald-200">
                {msg}
              </div>
            ) : null}

            <div className="rounded-[28px] border border-white/12 bg-black/40 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
              {isCodeMode ? (
                <div className="grid gap-6">
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0">
                      <h1 className="text-3xl font-black tracking-tight">Entrar com o celular</h1>
                      <div className="mt-2 text-base text-white/60">
                        Escaneie o QR ou abra{" "}
                        <span className="text-white/85 font-semibold">cinesuper.com.br/tv</span>{" "}
                        e confirme o código.
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <StatusPill tone={statusTone}>{statusText}</StatusPill>
                      {expiresText ? (
                        <div className="mt-2">
                          <StatusPill tone="muted">Expira em {expiresText}</StatusPill>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-[1.15fr_0.85fr] gap-8">
                    <div className="rounded-3xl border border-white/10 bg-black/35 p-6">
                      <div className="text-base font-semibold text-white/85">QR Code</div>
                      <div className="mt-4 flex items-center gap-6">
                        <div className="rounded-2xl bg-white p-3">
                          <img src={qrImg} alt="QR Code" className="h-48 w-48" draggable={false} />
                        </div>

                        <div className="min-w-0">
                          <div className="text-sm text-white/60">Código</div>
                          <div className="mt-2 text-[54px] font-extrabold tracking-[0.18em] leading-none truncate">
                            {code || "----"}
                          </div>
                          <div className="mt-2 text-sm text-white/45">
                            A TV conecta automaticamente após a confirmação.
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-black/45 p-6 flex flex-col justify-between">
                      <div>
                        <div className="text-base font-semibold text-white/85">Ações</div>
                        <div className="mt-2 text-base text-white/60">
                          Se preferir, use “Acesso no controle”.
                        </div>
                      </div>

                      <div className="mt-6 grid gap-3">
                        <TvButton
                          focusKey="login-tv:code:regen"
                          onEnter={() => createPairing()}
                          disabled={pairLoading}
                          className="w-full bg-white/15"
                        >
                          {pairLoading ? "Gerando…" : "Gerar novo código"}
                        </TvButton>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-5">
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <h1 className="text-3xl font-black tracking-tight">Acesso no controle</h1>
                      <div className="mt-2 text-base text-white/60">
                        Use as setas para navegar. Pressione OK para editar.
                      </div>
                    </div>

                    <div className="shrink-0">
                      <StatusPill tone="muted">{loading ? "Entrando…" : "Digite suas credenciais"}</StatusPill>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="rounded-3xl border border-white/10 bg-black/35 p-6">
                      <div className="mt-4 grid gap-4">
                        <TvInput
                          focusKey="login-tv:remote:email"
                          label="E-mail"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          inputRef={emailRef}
                          hint="OK abre o teclado. DPAD ↓ vai para senha."
                          requestOpen={openEmail}
                        />

                        <TvInput
                          focusKey="login-tv:remote:pass"
                          label="Senha"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          type="password"
                          inputRef={passRef}
                          hint="OK abre o teclado. DPAD ↓ vai para Entrar."
                          requestOpen={openPass}
                        />

                        <TvButton
                          focusKey="login-tv:remote:submit"
                          onEnter={doLoginRemote}
                          disabled={loading}
                          className="bg-white/15"
                        >
                          {loading ? "Entrando…" : "Entrar"}
                        </TvButton>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-black/45 p-6 flex flex-col justify-between">
                      <div>
                        <div className="text-base font-semibold text-white/85">Mais rápido</div>
                        <div className="mt-2 text-base text-white/60">
                          Para uma experiência melhor, use “Código no celular”.
                        </div>
                        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/60">
                          Assim você evita digitar no controle e conecta em segundos.
                        </div>
                      </div>

                      <div className="mt-6">
                        <TvButton
                          focusKey="login-tv:remote:go-code"
                          onEnter={() => switchModeSafe("code")}
                          className="w-full bg-white/15"
                        >
                          Voltar para Código no celular
                        </TvButton>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 text-center text-sm text-white/45">
              Precisa de ajuda? <span className="text-white/70">cinesuper.com.br/contato</span>
            </div>
          </div>
        </div>
      </FocusContext.Provider>
    </div>
  );
}
