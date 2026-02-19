// src/pages/Login.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Footer from "../components/layout/Footer.jsx";
import Container from "../components/layout/Container.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { Eye, EyeOff, Mail, Lock, ArrowLeft, LogOut, WalletCards } from "lucide-react";
import BgLogin from "../assets/Back_Login.jpg";
import Logo from "../assets/Logo.png";
import PageTitle from "../components/PageTitle.jsx";

import { IS_TV } from "../app/target.js";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";

const ROOT_HOST = "cinesuper.com.br";
const APP_HOST = "app.cinesuper.com.br";

function normPlan(v) {
  return String(v || "").trim().toLowerCase();
}
function allow4kFromEntitlement(ent) {
  const q = String(ent?.max_quality || "").trim().toLowerCase();
  if (q === "4k" || q === "uhd") return true;
  const plan = normPlan(ent?.plan);
  return plan === "diamante";
}
async function loadEntitlementsAndSetLocalStorage(userId) {
  if (!userId) return { entitlement: null };

  const { data, error } = await supabase
    .from("user_entitlements")
    .select("plan, max_quality, max_screens, max_profiles, status, expires_at, updated_at, created_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const ent = data || null;

  if (!ent) {
    localStorage.setItem("cs_plan", "prata");
    localStorage.setItem("cs_allow4k", "false");
    localStorage.removeItem("cs_max_screens");
    localStorage.removeItem("cs_max_profiles");
    return { entitlement: null };
  }

  const plan = normPlan(ent.plan) || "prata";
  const allow4k = allow4kFromEntitlement(ent);

  localStorage.setItem("cs_plan", plan);
  localStorage.setItem("cs_allow4k", allow4k ? "true" : "false");

  if (Number.isFinite(ent.max_screens)) localStorage.setItem("cs_max_screens", String(ent.max_screens));
  if (Number.isFinite(ent.max_profiles)) localStorage.setItem("cs_max_profiles", String(ent.max_profiles));

  return { entitlement: ent };
}

function isEntitlementActive(ent) {
  return String(ent?.status || "").trim().toLowerCase() === "active";
}

function computeRedirectPath(nextQuery) {
  const q = typeof nextQuery === "string" ? nextQuery : "";

  if (q && q.startsWith("/")) {
    if (q.startsWith("/admin")) return "/browse";
    if (q === "/login") return "/browse";
    return q;
  }

  return "/browse";
}

function parseHashParams() {
  const h = String(window.location.hash || "").replace(/^#/, "");
  if (!h) return {};
  const p = new URLSearchParams(h);
  const obj = {};
  for (const [k, v] of p.entries()) obj[k] = v;
  return obj;
}

/* =========================================
   TV helpers (foco + safe area + ring)
========================================= */

function TvFocusBox({ focusKey, autoFocus, onEnterPress, children, className = "" }) {
  const { ref, focused, focusSelf } = useFocusable({
    focusKey,
    onEnterPress,
  });

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => focusSelf(), 0);
    return () => clearTimeout(t);
  }, [autoFocus, focusSelf]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={[
        "outline-none transition-transform duration-150",
        focused ? "ring-4 ring-white/80 rounded-2xl" : "ring-0",
        className,
      ].join(" ")}
      style={{ transformOrigin: "center" }}
    >
      {children}
    </div>
  );
}

function TvInput({
  focusKey,
  autoFocus,
  icon: Icon,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
}) {
  const inputRef = useRef(null);

  return (
    <TvFocusBox
      focusKey={focusKey}
      autoFocus={autoFocus}
      onEnterPress={() => inputRef.current?.focus?.()}
      className="bg-black/35 border border-white/10"
    >
      <div className="relative flex items-center">
        {Icon ? <Icon className="ml-4 h-5 w-5 text-white/55 shrink-0" /> : null}
        <input
          ref={inputRef}
          value={value}
          onChange={onChange}
          type={type}
          placeholder={placeholder}
          autoComplete={type === "password" ? "current-password" : "email"}
          disabled={disabled}
          className={[
            "w-full bg-transparent text-white outline-none",
            "px-4 py-4 text-[16px]",
            Icon ? "pl-3" : "",
            disabled ? "opacity-70" : "",
          ].join(" ")}
          style={{ WebkitTextSizeAdjust: "100%" }}
        />
      </div>
    </TvFocusBox>
  );
}

function TvButton({ focusKey, autoFocus, disabled, onPress, children, variant = "primary" }) {
  const base =
    variant === "primary"
      ? "bg-red-600 hover:bg-red-500"
      : "bg-white/10 hover:bg-white/15";

  return (
    <TvFocusBox
      focusKey={focusKey}
      autoFocus={autoFocus}
      onEnterPress={() => {
        if (!disabled) onPress?.();
      }}
      className={[
        "select-none",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onPress}
        className={[
          "w-full rounded-2xl px-5 py-4",
          "text-[16px] font-semibold text-white",
          base,
          disabled ? "cursor-not-allowed" : "",
        ].join(" ")}
      >
        {children}
      </button>
    </TvFocusBox>
  );
}

/* =========================================
   Login TV (layout dedicado)
========================================= */

function TvLogin({ redirectTo }) {
  const nav = useNavigate();
  const location = useLocation();

  const [view, setView] = useState("login"); // "login" | "forgot" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPass1, setNewPass1] = useState("");
  const [newPass2, setNewPass2] = useState("");

  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [sessionEmail, setSessionEmail] = useState("");
  const [hasActive, setHasActive] = useState(false);
  const [showExistingSessionCard, setShowExistingSessionCard] = useState(false);

  async function hardSignOutCleanup() {
    try {
      await supabase.auth.signOut();
    } catch {}
    try {
      localStorage.removeItem("cs_plan");
      localStorage.removeItem("cs_allow4k");
      localStorage.removeItem("cs_max_screens");
      localStorage.removeItem("cs_max_profiles");
    } catch {}
    setSessionEmail("");
    setHasActive(false);
    setShowExistingSessionCard(false);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setBooting(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;

        const sess = data?.session || null;
        const userId = sess?.user?.id;
        const userMail = sess?.user?.email || "";

        if (!userId) {
          setSessionEmail("");
          setHasActive(false);
          setShowExistingSessionCard(false);
          return;
        }

        // Se não estiver na tela login, não redireciona automaticamente
        if (view !== "login") {
          setSessionEmail(userMail);
          setHasActive(false);
          setShowExistingSessionCard(false);
          return;
        }

        setLoading(true);
        const { entitlement } = await loadEntitlementsAndSetLocalStorage(userId);
        const active = isEntitlementActive(entitlement);

        setSessionEmail(userMail);
        setHasActive(active);

        if (active) {
          setShowExistingSessionCard(false);
          nav(redirectTo, { replace: true });
          return;
        }

        setShowExistingSessionCard(true);
        setMsg("Sessão detectada, porém a assinatura não está ativa.");
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Falha ao validar acesso do usuário.");
      } finally {
        if (!alive) return;
        setLoading(false);
        setBooting(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [nav, redirectTo, view]);

  useEffect(() => {
    let cancelled = false;

    async function handleEmailReturn() {
      try {
        const url = new URL(window.location.href);

        const code = url.searchParams.get("code");
        if (code) {
          setLoading(true);
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (cancelled) return;

          url.searchParams.delete("code");
          url.searchParams.delete("type");
          window.history.replaceState({}, "", url.toString());

          setView("reset");
          setMsg("Defina sua nova senha para acessar a CineSuper.");
          setErr("");
          return;
        }

        const token_hash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        if (token_hash && type) {
          setLoading(true);
          const { error } = await supabase.auth.verifyOtp({ type, token_hash });
          if (error) throw error;
          if (cancelled) return;

          url.searchParams.delete("token_hash");
          url.searchParams.delete("type");
          window.history.replaceState({}, "", url.toString());

          if (String(type).toLowerCase() === "recovery") {
            setView("reset");
            setMsg("Defina sua nova senha para acessar a CineSuper.");
            setErr("");
            return;
          }

          setView("login");
          setMsg("Email confirmado. Faça login com sua senha.");
          setErr("");
          return;
        }

        const hp = parseHashParams();
        if (hp.access_token && hp.refresh_token) {
          setLoading(true);
          const { error } = await supabase.auth.setSession({
            access_token: hp.access_token,
            refresh_token: hp.refresh_token,
          });
          if (error) throw error;
          if (cancelled) return;

          window.history.replaceState({}, "", window.location.pathname + window.location.search);

          setView("reset");
          setMsg("Defina sua nova senha para acessar a CineSuper.");
          setErr("");
          return;
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Não foi possível validar o link do email.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    handleEmailReturn();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmitLogin() {
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const cleanEmail = String(email || "").trim().toLowerCase();
      if (!cleanEmail) throw new Error("Informe o e-mail.");
      if (!password) throw new Error("Informe a senha.");

      // Se já existe sessão com outro email, limpa
      if (sessionEmail && cleanEmail && sessionEmail.toLowerCase() !== cleanEmail.toLowerCase()) {
        await hardSignOutCleanup();
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) throw error;

      const userId = data?.user?.id || data?.session?.user?.id;
      const userMail = data?.user?.email || cleanEmail;
      if (!userId) throw new Error("Login ok, mas não encontrei user.id no retorno.");

      const { entitlement } = await loadEntitlementsAndSetLocalStorage(userId);
      const active = isEntitlementActive(entitlement);

      setSessionEmail(userMail);
      setHasActive(active);

      if (!active) {
        // TV: NÃO abre browser. Apenas informa.
        setShowExistingSessionCard(true);
        setMsg("Sua conta está logada, mas a assinatura não está ativa. Ative pelo celular/computador em app.cinesuper.com.br.");
        return;
      }

      setShowExistingSessionCard(false);
      setMsg("Login efetuado.");
      nav(redirectTo, { replace: true });
    } catch (e2) {
      setErr(e2?.message || "Falha ao fazer login.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitForgot() {
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const cleanEmail = String(email || "").trim().toLowerCase();
      if (!cleanEmail) throw new Error("Informe o e-mail.");

      const redirectTo = `https://${APP_HOST}/login`;
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
      if (error) throw error;

      setMsg("Enviamos um email para redefinir sua senha. Abra o link e volte para continuar.");
    } catch (e) {
      setErr(e?.message || "Não foi possível enviar o email de recuperação.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitReset() {
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      if (!newPass1 || newPass1.length < 8) throw new Error("A nova senha precisa ter pelo menos 8 caracteres.");
      if (newPass1 !== newPass2) throw new Error("As senhas não conferem.");

      const { error } = await supabase.auth.updateUser({
        password: newPass1,
        data: { pw_set: true },
      });
      if (error) throw error;

      setMsg("Senha atualizada com sucesso. Faça login com sua nova senha.");
      setView("login");
      setPassword("");
      setNewPass1("");
      setNewPass2("");

      try {
        await supabase.auth.signOut();
      } catch {}
    } catch (e) {
      setErr(e?.message || "Não foi possível atualizar a senha.");
    } finally {
      setLoading(false);
    }
  }

  // Safe area (evita corte por overscan)
  return (
    <div className="min-h-screen bg-black text-white">
      <PageTitle title="Entrar" />

      <div className="min-h-screen px-[64px] py-[48px] flex items-center justify-center">
        <div className="w-full max-w-[560px]">
          <div className="flex items-center justify-center mb-8">
            <img src={Logo} alt="CineSuper" className="h-14 w-auto select-none" draggable={false} />
          </div>

          <FocusContext.Provider value="tv-login">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-6">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-[20px] font-black tracking-tight">
                  {view === "login" ? "Entrar" : view === "forgot" ? "Recuperar senha" : "Definir nova senha"}
                </h1>

                {view !== "login" ? (
                  <TvButton
                    focusKey="tv:back"
                    variant="ghost"
                    onPress={() => {
                      setView("login");
                      setErr("");
                      setMsg("");
                    }}
                  >
                    <span className="inline-flex items-center gap-2">
                      <ArrowLeft className="h-4 w-4" />
                      Voltar
                    </span>
                  </TvButton>
                ) : null}
              </div>

              {booting ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-[14px] text-white/70">
                  Verificando sua sessão…
                </div>
              ) : null}

              {err ? (
                <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[14px] text-red-200">
                  {err}
                </div>
              ) : null}

              {msg ? (
                <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-[14px] text-emerald-200">
                  {msg}
                </div>
              ) : null}

              {!booting && view === "login" && showExistingSessionCard && sessionEmail && !hasActive ? (
                <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-[14px] font-semibold text-white/90">Sessão detectada</div>
                  <div className="mt-1 text-[14px] text-white/65">
                    Você está logado como <b className="text-white/85">{sessionEmail}</b>, mas sem assinatura ativa.
                  </div>

                  <div className="mt-3 text-[13px] text-white/55">
                    Ative pelo celular/computador em <b className="text-white/80">app.cinesuper.com.br</b>.
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2">
                    <TvButton
                      focusKey="tv:logout"
                      variant="ghost"
                      disabled={loading}
                      onPress={async () => {
                        setLoading(true);
                        setErr("");
                        setMsg("");
                        try {
                          await hardSignOutCleanup();
                          setMsg("Ok. Agora você pode entrar com outra conta.");
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      <span className="inline-flex items-center gap-2">
                        Entrar com outra conta <LogOut className="h-4 w-4" />
                      </span>
                    </TvButton>
                  </div>
                </div>
              ) : null}

              {view === "login" ? (
                <div className="mt-5 space-y-3">
                  <div className="text-[13px] text-white/55">Use o controle: setas para navegar e OK para selecionar.</div>

                  <TvInput
                    focusKey="tv:email"
                    autoFocus
                    icon={Mail}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-mail"
                    disabled={booting || loading}
                  />

                  <TvInput
                    focusKey="tv:pass"
                    icon={Lock}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Senha"
                    disabled={booting || loading}
                  />

                  <TvButton
                    focusKey="tv:login"
                    disabled={booting || loading}
                    onPress={onSubmitLogin}
                  >
                    {booting ? "Verificando..." : loading ? "Entrando..." : "Entrar"}
                  </TvButton>

                  <TvButton
                    focusKey="tv:forgot"
                    variant="ghost"
                    disabled={booting || loading}
                    onPress={() => {
                      setView("forgot");
                      setErr("");
                      setMsg("");
                    }}
                  >
                    Esqueceu a senha?
                  </TvButton>
                </div>
              ) : null}

              {view === "forgot" ? (
                <div className="mt-5 space-y-3">
                  <div className="text-[14px] text-white/65 leading-relaxed">
                    Informe seu email e enviaremos um link para redefinir a senha.
                  </div>

                  <TvInput
                    focusKey="tv:forgotEmail"
                    autoFocus
                    icon={Mail}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-mail"
                    disabled={loading}
                  />

                  <TvButton
                    focusKey="tv:send"
                    disabled={loading}
                    onPress={onSubmitForgot}
                  >
                    {loading ? "Enviando..." : "Enviar link"}
                  </TvButton>

                  <div className="text-[12px] text-white/45">
                    Abra o link no celular/computador. Depois volte para a TV.
                  </div>
                </div>
              ) : null}

              {view === "reset" ? (
                <div className="mt-5 space-y-3">
                  <div className="text-[14px] text-white/65 leading-relaxed">
                    Defina sua nova senha para entrar com email e senha.
                  </div>

                  <TvInput
                    focusKey="tv:new1"
                    autoFocus
                    icon={Lock}
                    type="password"
                    value={newPass1}
                    onChange={(e) => setNewPass1(e.target.value)}
                    placeholder="Nova senha (mínimo 8)"
                    disabled={loading}
                  />

                  <TvInput
                    focusKey="tv:new2"
                    icon={Lock}
                    type="password"
                    value={newPass2}
                    onChange={(e) => setNewPass2(e.target.value)}
                    placeholder="Confirmar nova senha"
                    disabled={loading}
                  />

                  <TvButton
                    focusKey="tv:save"
                    disabled={loading}
                    onPress={onSubmitReset}
                  >
                    {loading ? "Salvando..." : "Salvar"}
                  </TvButton>
                </div>
              ) : null}
            </div>
          </FocusContext.Provider>
        </div>
      </div>
    </div>
  );
}

/* =========================================
   Login WEB (seu layout original)
========================================= */

export default function Login() {
  const nav = useNavigate();
  const location = useLocation();

  const nextQuery = useMemo(() => {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get("next") || u.searchParams.get("from") || "";
    } catch {
      return "";
    }
  }, []);
  const redirectTo = useMemo(() => computeRedirectPath(nextQuery), [nextQuery]);

  // ✅ TV usa layout dedicado
  if (IS_TV) {
    return <TvLogin redirectTo={redirectTo} />;
  }

  // ====== WEB abaixo (mantive seu fluxo; apenas corrigi o PageTitle e não quebrei nada) ======

  const [view, setView] = useState("login"); // "login" | "forgot" | "reset"

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPass1, setNewPass1] = useState("");
  const [newPass2, setNewPass2] = useState("");

  const [showPass, setShowPass] = useState(false);

  const [booting, setBooting] = useState(true);
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [sessionEmail, setSessionEmail] = useState("");
  const [hasActive, setHasActive] = useState(false);
  const [showExistingSessionCard, setShowExistingSessionCard] = useState(false);

  async function hardSignOutCleanup() {
    try {
      await supabase.auth.signOut();
    } catch {}
    try {
      localStorage.removeItem("cs_plan");
      localStorage.removeItem("cs_allow4k");
      localStorage.removeItem("cs_max_screens");
      localStorage.removeItem("cs_max_profiles");
    } catch {}
    setSessionEmail("");
    setHasActive(false);
    setShowExistingSessionCard(false);
  }

  function buildSignupPlansUrlAbs({ from = "/browse", email = "", plan = "ouro", cycle = "mensal", promo = "" }) {
    const qp = new URLSearchParams();
    qp.set("step", "2");
    qp.set("sub", "plans");
    qp.set("from", from);
    if (email) qp.set("email", email);
    if (plan) qp.set("plan", plan);
    if (cycle) qp.set("cycle", cycle);
    if (promo) qp.set("promo", promo);

    // ✅ signup/planos no APP (para manter sessão no subdomínio do app)
    return `https://${APP_HOST}/signup?${qp.toString()}`;
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setBooting(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;

        const sess = data?.session || null;
        const userId = sess?.user?.id;
        const userMail = sess?.user?.email || "";

        if (!userId) {
          setSessionEmail("");
          setHasActive(false);
          setShowExistingSessionCard(false);
          return;
        }

        if (view !== "login") {
          setSessionEmail(userMail);
          setHasActive(false);
          setShowExistingSessionCard(false);
          return;
        }

        setLoading(true);
        const { entitlement } = await loadEntitlementsAndSetLocalStorage(userId);
        const active = isEntitlementActive(entitlement);

        setSessionEmail(userMail);
        setHasActive(active);

        if (active) {
          setShowExistingSessionCard(false);
          nav(redirectTo, { replace: true });
          return;
        }

        setShowExistingSessionCard(true);
        setMsg("Você já está logado, mas sua assinatura ainda não está ativa.");
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Falha ao validar acesso do usuário.");
      } finally {
        if (!alive) return;
        setLoading(false);
        setBooting(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [nav, redirectTo, view]);

  useEffect(() => {
    let cancelled = false;

    async function handleEmailReturn() {
      try {
        const url = new URL(window.location.href);

        const code = url.searchParams.get("code");
        if (code) {
          setLoading(true);
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          if (cancelled) return;

          url.searchParams.delete("code");
          url.searchParams.delete("type");
          window.history.replaceState({}, "", url.toString());

          setView("reset");
          setMsg("Defina sua nova senha para acessar a CineSuper.");
          setErr("");
          return;
        }

        const token_hash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        if (token_hash && type) {
          setLoading(true);
          const { error } = await supabase.auth.verifyOtp({ type, token_hash });
          if (error) throw error;
          if (cancelled) return;

          url.searchParams.delete("token_hash");
          url.searchParams.delete("type");
          window.history.replaceState({}, "", url.toString());

          if (String(type).toLowerCase() === "recovery") {
            setView("reset");
            setMsg("Defina sua nova senha para acessar a CineSuper.");
            setErr("");
            return;
          }

          setView("login");
          setMsg("Email confirmado. Faça login com sua senha.");
          setErr("");
          return;
        }

        const hp = parseHashParams();
        if (hp.access_token && hp.refresh_token) {
          setLoading(true);
          const { error } = await supabase.auth.setSession({
            access_token: hp.access_token,
            refresh_token: hp.refresh_token,
          });
          if (error) throw error;
          if (cancelled) return;

          window.history.replaceState({}, "", window.location.pathname + window.location.search);

          setView("reset");
          setMsg("Defina sua nova senha para acessar a CineSuper.");
          setErr("");
          return;
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || "Não foi possível validar o link do email.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    handleEmailReturn();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmitLogin(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const cleanEmail = String(email || "").trim().toLowerCase();
      if (!cleanEmail) throw new Error("Informe o e-mail.");
      if (!password) throw new Error("Informe a senha.");

      if (sessionEmail && cleanEmail && sessionEmail.toLowerCase() !== cleanEmail.toLowerCase()) {
        await hardSignOutCleanup();
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) throw error;

      const userId = data?.user?.id || data?.session?.user?.id;
      const userMail = data?.user?.email || cleanEmail;
      if (!userId) throw new Error("Login ok, mas não encontrei user.id no retorno.");

      const { entitlement } = await loadEntitlementsAndSetLocalStorage(userId);
      const active = isEntitlementActive(entitlement);

      setSessionEmail(userMail);
      setHasActive(active);

      if (!active) {
        const abs = buildSignupPlansUrlAbs({
          from: redirectTo,
          email: cleanEmail,
          plan: "ouro",
          cycle: "mensal",
        });
        window.location.replace(abs);
        return;
      }

      setShowExistingSessionCard(false);
      setMsg("Login efetuado.");
      nav(redirectTo, { replace: true });
    } catch (e2) {
      setErr(e2?.message || "Falha ao fazer login.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitForgot(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const cleanEmail = String(email || "").trim().toLowerCase();
      if (!cleanEmail) throw new Error("Informe o e-mail.");

      const redirectTo = `https://${APP_HOST}/login`;
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
      if (error) throw error;

      setMsg("Enviamos um email para redefinir sua senha. Abra o link e volte para continuar.");
    } catch (e) {
      setErr(e?.message || "Não foi possível enviar o email de recuperação.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitReset(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      if (!newPass1 || newPass1.length < 8) throw new Error("A nova senha precisa ter pelo menos 8 caracteres.");
      if (newPass1 !== newPass2) throw new Error("As senhas não conferem.");

      const { error } = await supabase.auth.updateUser({
        password: newPass1,
        data: { pw_set: true },
      });
      if (error) throw error;

      setMsg("Senha atualizada com sucesso. Faça login com sua nova senha.");
      setView("login");
      setPassword("");
      setNewPass1("");
      setNewPass2("");

      try {
        await supabase.auth.signOut();
      } catch {}
    } catch (e) {
      setErr(e?.message || "Não foi possível atualizar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100vh] bg-black text-white">
      <PageTitle title="Entrar" />

      <main className="min-h-screen">
        <section className="relative min-h-screen w-full">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${BgLogin})` }} />
            <div className="absolute inset-0 bg-black/60" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,.10)_0%,rgba(0,0,0,0)_45%)]" />
          </div>

          <Container>
            <div className="relative py-16 flex flex-col items-center">
              <a href={`https://${ROOT_HOST}/`} className="mb-8 inline-flex items-center" aria-label="Voltar para a Landing">
                <img src={Logo} alt="CineSuper" className="h-16 md:h-20 w-auto select-none" draggable={false} />
              </a>

              <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-8">
                <div className="flex items-center justify-between gap-3">
                  <h1 className="mt-2 text-2xl font-black tracking-tight">
                    {view === "login" ? "Entrar" : view === "forgot" ? "Recuperar senha" : "Definir nova senha"}
                  </h1>

                  {view !== "login" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setView("login");
                        setErr("");
                        setMsg("");
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Voltar
                    </button>
                  ) : null}
                </div>

                {booting ? (
                  <div className="mt-5 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
                    Verificando sua sessão…
                  </div>
                ) : null}

                {err ? (
                  <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {err}
                  </div>
                ) : null}

                {msg ? (
                  <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                    {msg}
                  </div>
                ) : null}

                {!booting && view === "login" && showExistingSessionCard && sessionEmail && !hasActive ? (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
                    <div className="text-sm font-semibold text-white/90">Sessão detectada</div>
                    <div className="mt-1 text-sm text-white/65">
                      Você está logado como <b className="text-white/85">{sessionEmail}</b>, mas sem assinatura ativa.
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          const abs = buildSignupPlansUrlAbs({
                            from: redirectTo,
                            email: sessionEmail,
                            plan: "ouro",
                            cycle: "mensal",
                          });
                          window.location.replace(abs);
                        }}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                      >
                        Finalizar assinatura <WalletCards className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        disabled={loading}
                        onClick={async () => {
                          setLoading(true);
                          setErr("");
                          setMsg("");
                          try {
                            await hardSignOutCleanup();
                            setMsg("Ok. Agora você pode entrar com outra conta.");
                          } finally {
                            setLoading(false);
                          }
                        }}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                      >
                        Entrar com outra conta <LogOut className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-3 text-xs text-white/45">
                      Para usar outra conta, é necessário sair desta sessão (o Supabase não mantém duas contas ao mesmo tempo).
                    </div>
                  </div>
                ) : null}

                {view === "login" ? (
                  <form onSubmit={onSubmitLogin} className="mt-6 space-y-4">
                    <div>
                      <label className="text-xs text-white/60">E-mail</label>
                      <div className="relative mt-2">
                        <input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pl-10 text-sm outline-none focus:border-white/25"
                          placeholder="Email"
                          autoComplete="email"
                          disabled={booting || loading}
                        />
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-white/60">Senha</label>
                      <div className="relative mt-2">
                        <input
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          type={showPass ? "text" : "password"}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pl-10 pr-12 text-sm outline-none focus:border-white/25"
                          placeholder="••••••••"
                          autoComplete="current-password"
                          disabled={booting || loading}
                        />
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                        <button
                          type="button"
                          onClick={() => setShowPass((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/0 text-white/70 hover:text-white hover:bg-white/10"
                          aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                          title={showPass ? "Ocultar senha" : "Mostrar senha"}
                          disabled={booting || loading}
                        >
                          {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={booting || loading}
                      className={[
                        "w-full rounded-xl px-5 py-3 text-sm font-semibold transition",
                        booting || loading
                          ? "bg-red-600/40 text-white/70 cursor-not-allowed"
                          : "bg-red-600 text-white hover:bg-red-500 active:scale-[0.99]",
                      ].join(" ")}
                    >
                      {booting ? "Verificando..." : loading ? "Entrando..." : "Entrar"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setView("forgot");
                        setErr("");
                        setMsg("");
                      }}
                      className="w-full text-sm text-white/80 hover:text-white underline underline-offset-4"
                      disabled={booting || loading}
                    >
                      Esqueceu a senha?
                    </button>

                    <div className="pt-3 text-sm text-white/70">
                      Primeira vez aqui?{" "}
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = `https://${APP_HOST}/signup?step=1`;
                        }}
                        className="text-white hover:text-white/90 underline underline-offset-4 font-semibold"
                        disabled={booting || loading}
                      >
                        Assine agora.
                      </button>
                    </div>
                  </form>
                ) : null}

                {view === "forgot" ? (
                  <form onSubmit={onSubmitForgot} className="mt-6 space-y-4">
                    <div className="text-sm text-white/65 leading-relaxed">
                      Informe seu email e enviaremos um link para redefinir a senha.
                    </div>

                    <div>
                      <label className="text-xs text-white/60">E-mail</label>
                      <div className="relative mt-2">
                        <input
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 pl-10 text-sm outline-none focus:border-white/25"
                          placeholder="Email"
                          autoComplete="email"
                          disabled={loading}
                        />
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className={[
                        "w-full rounded-xl px-5 py-3 text-sm font-semibold transition",
                        loading
                          ? "bg-red-600/40 text-white/70 cursor-not-allowed"
                          : "bg-red-600 text-white hover:bg-red-500 active:scale-[0.99]",
                      ].join(" ")}
                    >
                      {loading ? "Enviando..." : "Enviar link de recuperação"}
                    </button>

                    <div className="text-xs text-white/45">
                      Abra o link no mesmo navegador onde você usa o CineSuper.
                    </div>
                  </form>
                ) : null}

                {view === "reset" ? (
                  <form onSubmit={onSubmitReset} className="mt-6 space-y-4">
                    <div className="text-sm text-white/65 leading-relaxed">
                      Defina sua nova senha para entrar com email e senha.
                    </div>

                    <div>
                      <label className="text-xs text-white/60">Nova senha</label>
                      <input
                        value={newPass1}
                        onChange={(e) => setNewPass1(e.target.value)}
                        type="password"
                        autoComplete="new-password"
                        placeholder="Mínimo 8 caracteres"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                        disabled={loading}
                      />
                    </div>

                    <div>
                      <label className="text-xs text-white/60">Confirmar nova senha</label>
                      <input
                        value={newPass2}
                        onChange={(e) => setNewPass2(e.target.value)}
                        type="password"
                        autoComplete="new-password"
                        placeholder="Repita a senha"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                        disabled={loading}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className={[
                        "w-full rounded-xl px-5 py-3 text-sm font-semibold transition",
                        loading
                          ? "bg-red-600/40 text-white/70 cursor-not-allowed"
                          : "bg-red-600 text-white hover:bg-red-500 active:scale-[0.99]",
                      ].join(" ")}
                    >
                      {loading ? "Salvando..." : "Salvar nova senha"}
                    </button>

                    <div className="text-xs text-white/45">
                      Depois disso, você fará login novamente com sua senha.
                    </div>
                  </form>
                ) : null}
              </div>
            </div>
          </Container>
        </section>
      </main>

      <Footer />
    </div>
  );
}
