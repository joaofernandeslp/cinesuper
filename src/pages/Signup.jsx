// src/pages/Signup.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Container from "../components/layout/Container.jsx";
import Footer from "../components/layout/Footer.jsx";
import Logo from "../assets/Logo.png";
import { supabase } from "../lib/supabaseClient.js";
import { marketingConfig } from "../lib/marketingConfig.js";
import { CreditCard, QrCode, ShieldCheck, X, Lock, CheckCircle2, Mail, RotateCw } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import QRCode from "react-qr-code";
import PageTitle from "../components/PageTitle.jsx";

/* =========================
   Domínios (IMPORTANTE)
========================= */
const ROOT_ORIGIN = "https://cinesuper.com.br"; // landing
const APP_ORIGIN = "https://app.cinesuper.com.br"; // auth + app

/* =========================
   Utils
========================= */
function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(msg || "Tempo excedido.")), ms)),
  ]);
}

const PROMO = { key: "early100", label: "Primeiros 100 • por 3 meses" };

// helper BRL
function brl(n) {
  const v = Number(n || 0);
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function getAccessTokenOrThrow() {
  const { data } = await supabase.auth.getSession();
  let session = data?.session || null;
  const now = Math.floor(Date.now() / 1000);

  if (session?.expires_at && session.expires_at <= now + 30) {
    const { data: refreshed, error: rerr } = await supabase.auth.refreshSession();
    if (!rerr && refreshed?.session) session = refreshed.session;
  }

  const access_token = session?.access_token;
  if (!access_token) throw new Error("Sessão expirada. Faça login novamente.");
  return access_token;
}

/* =========================
   Stripe
========================= */
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "";
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null;

function parseMoneyBR(input) {
  const m = String(input || "").match(/([\d.,]+)/);
  if (!m) return 0;
  const raw = m[1].replace(/\./g, "").replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

const PLANS = [
  {
    key: "prata",
    name: "CineSuper Prata",
    price: marketingConfig.plans.prata.price,
    promoPrice: marketingConfig.plans.prata.price,
    promoLabel: PROMO.label,
    amount: parseMoneyBR(marketingConfig.plans.prata.price),
    promoAmount: parseMoneyBR(marketingConfig.plans.prata.price),

    // ✅ anual (para o UI ficar correto)
    annualPrice: marketingConfig.plans.prata.annualPrice,
    annualSubLabel: marketingConfig.plans.prata.annualSubLabel,
    annualAmount: parseMoneyBR(marketingConfig.plans.prata.annualPrice),

    highlight: "Para quem quer economizar e assistir no dia a dia.",
    features: ["2 telas simultâneas", "Até Full HD (1080p)", "2 perfis", "Áudio estéreo (2.0)"],
  },
  {
    key: "ouro",
    name: "CineSuper Ouro",
    price: marketingConfig.plans.ouro.price,
    promoPrice: marketingConfig.plans.ouro.price,
    promoLabel: PROMO.label,
    amount: parseMoneyBR(marketingConfig.plans.ouro.price),
    promoAmount: parseMoneyBR(marketingConfig.plans.ouro.price),

    // ✅ anual
    annualPrice: marketingConfig.plans.ouro.annualPrice,
    annualSubLabel: marketingConfig.plans.ouro.annualSubLabel,
    annualAmount: parseMoneyBR(marketingConfig.plans.ouro.annualPrice),

    badge: "Recomendado",
    highlight: "O melhor custo-benefício: mais telas, mais perfis e melhor áudio.",
    features: [
      "4 telas simultâneas",
      "Até Full HD (1080p)",
      "4 perfis",
      "Áudio estéreo + 5.1 (quando disponível)",
      "Acesso antecipado a lançamentos (quando disponível)",
    ],
  },
  {
    key: "diamante",
    name: "CineSuper Diamante",
    price: marketingConfig.plans.diamante.price,
    promoPrice: marketingConfig.plans.diamante.price,
    promoLabel: PROMO.label,
    amount: parseMoneyBR(marketingConfig.plans.diamante.price),
    promoAmount: parseMoneyBR(marketingConfig.plans.diamante.price),

    // ✅ anual
    annualPrice: marketingConfig.plans.diamante.annualPrice,
    annualSubLabel: marketingConfig.plans.diamante.annualSubLabel,
    annualAmount: parseMoneyBR(marketingConfig.plans.diamante.annualPrice),

    highlight: "Para quem quer o máximo de qualidade e conforto.",
    features: [
      "6 telas simultâneas",
      "Até 4K (quando disponível)",
      "6 perfis",
      "Áudio 5.1 (quando disponível)",
      "Prioridade no suporte",
    ],
  },
];

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

function Stepper({ step }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs text-white/60">
      <div
        className={cx(
          "rounded-full px-3 py-1 border",
          step === 1 ? "border-red-500/40 bg-red-500/10 text-white/85" : "border-white/10"
        )}
      >
        Passo 1 de 3
      </div>
      <div
        className={cx(
          "rounded-full px-3 py-1 border",
          step === 2 ? "border-red-500/40 bg-red-500/10 text-white/85" : "border-white/10"
        )}
      >
        Passo 2 de 3
      </div>
      <div
        className={cx(
          "rounded-full px-3 py-1 border",
          step === 3 ? "border-red-500/40 bg-red-500/10 text-white/85" : "border-white/10"
        )}
      >
        Passo 3 de 3
      </div>
    </div>
  );
}

function PlanCard({ plan, selected, onSelect, cycle, promo, promoEligible }) {
  const isRec = String(plan.badge || "").toLowerCase() === "recomendado";
  const isAnnual = cycle === "anual";
  const hasPromo = !isAnnual && (promoEligible || !!promo) && plan.promoPrice;

  const mainPrice = isAnnual ? plan.annualPrice || plan.price : hasPromo ? plan.promoPrice : plan.price;
  const subLine = isAnnual
    ? plan.annualSubLabel || "Pagamento anual. Cancele quando quiser."
    : hasPromo
    ? `Promo lançamento: ${plan.promoPrice} (primeiros 3 meses)`
    : "Cobrança mensal. Cancele quando quiser.";

  return (
    <button
      type="button"
      onClick={() => onSelect(plan.key)}
      className={cx(
        "text-left rounded-3xl border p-6 transition h-full",
        "hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-red-500/40",
        selected ? "border-red-500/45 bg-red-500/10" : "border-white/10 bg-white/[0.06]"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-lg font-black text-white/95">{plan.name}</div>
          <div className="mt-2 text-sm text-white/60">{plan.highlight}</div>
        </div>
        {isRec ? (
          <div className="shrink-0 rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-200">
            Recomendado
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="text-xl font-black text-white">{mainPrice}</div>
        <div className="mt-1 text-xs text-white/50">{subLine}</div>
      </div>

      <ul className="mt-5 space-y-2 text-sm text-white/70">
        {plan.features.map((f, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-black/30 text-white/80">
              ✓
            </span>
            <span className="leading-snug">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <div
          className={cx(
            "w-full text-center rounded-xl px-4 py-3 text-sm font-semibold transition",
            selected ? "bg-red-600 text-white" : "bg-white/10 text-white"
          )}
        >
          {selected ? "Selecionado" : "Selecionar"}
        </div>
      </div>
    </button>
  );
}

function parseHashParams() {
  const h = String(window.location.hash || "").replace(/^#/, "");
  if (!h) return {};
  const p = new URLSearchParams(h);
  const obj = {};
  for (const [k, v] of p.entries()) obj[k] = v;
  return obj;
}

/* =========================
   Stripe Elements
========================= */
const CARD_ELEMENT_OPTIONS = {
  hidePostalCode: true,
  style: {
    base: {
      color: "#ffffff",
      fontSize: "16px",
      fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
      "::placeholder": { color: "rgba(255,255,255,0.45)" },
    },
    invalid: {
      color: "#fecaca",
    },
  },
};

function StripeCardForm({
  email,
  planKey,
  cycle,
  promo,
  planName,
  displayAmount,
  busy,
  setBusy,
  setMsg,
  onSuccess,
  onClose,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    if (busy) return;

    if (!stripe || !elements) {
      setMsg("Stripe não carregou. Recarregue a página e tente novamente.");
      return;
    }

    setBusy(true);
    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error("Cartão não carregado. Tente novamente.");

      const access_token = await getAccessTokenOrThrow();

      const { data: siData, error: siError } = await supabase.functions.invoke("stripe-create-setup-intent", {
        body: { email },
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (siError) {
        let detail = siError.message || "Erro ao iniciar setup do cartão.";
        try {
          const res = siError.context;
          if (res) {
            try {
              const j = await res.json();
              detail = j?.error || j?.message || JSON.stringify(j);
            } catch {
              const t = await res.text();
              if (t) detail = t;
            }
          }
        } catch {}
        throw new Error(detail);
      }

      const setupSecret = String(siData?.client_secret || "");
      if (!setupSecret) throw new Error("Não foi possível obter o client_secret do SetupIntent.");

      const setupRes = await stripe.confirmCardSetup(setupSecret, {
        payment_method: {
          card: cardElement,
          billing_details: { email: email || undefined },
        },
      });

      if (setupRes?.error) throw new Error(setupRes.error.message || "Falha ao validar o cartão.");
      const paymentMethodId = String(setupRes?.setupIntent?.payment_method || "");
      if (!paymentMethodId) throw new Error("Não foi possível obter o payment_method do cartão.");

      const { data, error } = await supabase.functions.invoke("stripe-create-subscription", {
        body: { plan: planKey, cycle, promo, email, payment_method_id: paymentMethodId },
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (error) {
        let detail = error.message || "Erro ao iniciar assinatura no Stripe.";
        try {
          const res = error.context;
          if (res) {
            try {
              const j = await res.json();
              detail = j?.error || j?.message || JSON.stringify(j);
            } catch {
              const t = await res.text();
              if (t) detail = t;
            }
          }
        } catch {}
        throw new Error(detail);
      }

      const clientSecret = String(data?.client_secret || "");
      if (clientSecret) {
        const payRes = await stripe.confirmCardPayment(clientSecret);
        if (payRes?.error) throw new Error(payRes.error.message || "Falha ao confirmar o pagamento.");
      }

      onSuccess?.(data);
    } catch (e) {
      setMsg(e?.message || "Falha ao criar assinatura com cartão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-black/30 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">Dados do cartão</div>
          <div className="mt-1 text-xs text-white/55">Pagamento recorrente via Stripe. Seus dados são tokenizados.</div>
          <div className="mt-2 text-xs text-white/60">
            Plano: <span className="text-white/85 font-semibold">{planName}</span> • Valor exibido:{" "}
            <span className="text-white/85 font-semibold">{brl(displayAmount)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/15"
          aria-label="Fechar"
          title="Fechar"
        >
          <X className="h-4 w-4 text-white/80" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4">
        <div className="rounded-xl border border-white/10 bg-black/40 px-4 py-4">
          <CardElement options={CARD_ELEMENT_OPTIONS} onChange={(e) => setReady(!!e?.complete)} />
        </div>

        <button
          type="submit"
          disabled={!ready || busy}
          className="mt-4 w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
        >
          {busy ? "Processando..." : ready ? "Assinar com cartão" : "Preencha o cartão"}
        </button>

        <div className="mt-3 text-[11px] text-white/45 leading-relaxed">
          O valor final e a recorrência são confirmados no Stripe conforme o plano configurado.
        </div>
      </form>
    </div>
  );
}

/* =========================
   Password rules
========================= */
function passwordRules(pw) {
  const s = String(pw || "");
  return {
    len: s.length >= 8,
    upper: /[A-Z]/.test(s),
    number: /\d/.test(s),
    special: /[^A-Za-z0-9]/.test(s),
  };
}
function isPasswordValid(pw) {
  const r = passwordRules(pw);
  return r.len && r.upper && r.number && r.special;
}

/* =========================
   Signup
========================= */
export default function Signup() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  <PageTitle title="Criar conta" />
  const step = Math.max(1, Math.min(3, Number(sp.get("step") || "1")));
  const sub = sp.get("sub") || "";
  const promo = "";
  const reason = sp.get("reason") || "";
  const cycle = sp.get("cycle") || "mensal"; // "mensal" | "anual"

  const [email, setEmail] = useState(sp.get("email") || "");
  const [plan, setPlan] = useState(sp.get("plan") || "ouro");

  const [sent, setSent] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [pwReady, setPwReady] = useState(false);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [hasSession, setHasSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [payMethod, setPayMethod] = useState("");
  const [pixData, setPixData] = useState(null);
  const [pixBusy, setPixBusy] = useState(false);

  const [needsReauth, setNeedsReauth] = useState(false);
  const [reauthSent, setReauthSent] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const [promoEligible, setPromoEligible] = useState(false);
  const [promoChecked, setPromoChecked] = useState(false);

  const selectedPlan = useMemo(() => PLANS.find((p) => p.key === plan) || PLANS[1], [plan]);

  const showPromoUI = useMemo(() => {
    if (cycle === "anual") return false;
    return !!promo || promoEligible;
  }, [promo, promoEligible, cycle]);

  // ✅ valor exibido no passo 3
  const displayAmountForCheckout = useMemo(() => {
    if (cycle === "anual") return Number(selectedPlan?.annualAmount || 0);
    return showPromoUI ? Number(selectedPlan?.promoAmount || selectedPlan?.amount || 0) : Number(selectedPlan?.amount || 0);
  }, [selectedPlan, showPromoUI, cycle]);

  // ✅ label exibido no passo 3
  const displayLabelForCheckout = useMemo(() => {
    if (cycle === "anual") return selectedPlan?.annualPrice || "";
    return showPromoUI ? selectedPlan?.promoPrice || selectedPlan?.price || "" : selectedPlan?.price || "";
  }, [selectedPlan, showPromoUI, cycle]);

  const rules = useMemo(() => passwordRules(password), [password]);
  const canContinue = hasSession && pwReady;

  function goStep(nextStep, nextSub = "") {
    const next = new URLSearchParams(sp);
    next.set("step", String(nextStep));
    if (nextSub) next.set("sub", nextSub);
    else next.delete("sub");
    setSp(next, { replace: true });
  }

  useEffect(() => {
    if (step !== 3) {
      setPayMethod("");
      setPixData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted) {
        revalidateSessionAndUser({ silent: true });
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPwSetFromUser(user) {
    return !!user?.user_metadata?.pw_set;
  }

  async function computePromoEligibility() {
    return false;
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!hasSession) {
        setPromoEligible(false);
        setPromoChecked(true);
        return;
      }
      setPromoChecked(false);
      try {
        const eligible = await computePromoEligibility();
        if (!alive) return;
        setPromoEligible(!!eligible);
      } catch {
        if (!alive) return;
        setPromoEligible(false);
      } finally {
        if (!alive) return;
        setPromoChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, cycle, promo]);

  async function refreshUserFlags(sessionUser = null) {
    if (sessionUser) {
      const pwSet = getPwSetFromUser(sessionUser);
      const em = sessionUser?.email || null;

      setPwReady(pwSet);
      if (em) setEmail((prev) => (prev ? prev : em));
      return { pwSet, email: em };
    }

    try {
      const { data, error } = await withTimeout(
        supabase.auth.getUser(),
        15000,
        "Demorou para validar o usuário. Recarregue a página e tente novamente."
      );
      if (error) return { pwSet: false, email: null };

      const pwSet = getPwSetFromUser(data?.user);
      const em = data?.user?.email || null;

      setPwReady(pwSet);
      if (em) setEmail((prev) => (prev ? prev : em));
      return { pwSet, email: em };
    } catch {
      return { pwSet: false, email: null };
    }
  }

  async function revalidateSessionAndUser({ silent = false } = {}) {
    if (!silent) setMsg("");
    setNeedsReauth(false);
    setReauthSent(false);

    setRefreshing(true);
    try {
      const { data } = await withTimeout(
        supabase.auth.getSession(),
        12000,
        "Demorou para validar sua sessão. Abra o link do email novamente e tente."
      );

      const session = data?.session || null;
      const ok = !!session;
      setHasSession(ok);

      if (ok) {
        const flags = await refreshUserFlags(session.user);
        setSent(false);
        setSessionChecked(true);
        return { ok: true, ...flags };
      } else {
        setPwReady(false);
        setSessionChecked(true);
        return { ok: false, pwSet: false, email: null };
      }
    } catch (e) {
      if (!silent) setMsg(e?.message || "Falha ao verificar sessão.");
      setSessionChecked(true);
      return { ok: false, pwSet: false, email: null };
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let alive = true;

    async function handleAuthReturnIfAny() {
      const url = new URL(window.location.href);

      const code = url.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        url.searchParams.delete("code");
        url.searchParams.delete("type");
        window.history.replaceState({}, "", url.toString());
        return true;
      }

      const token_hash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ type, token_hash });
        if (error) throw error;
        url.searchParams.delete("token_hash");
        url.searchParams.delete("type");
        window.history.replaceState({}, "", url.toString());
        return true;
      }

      const hp = parseHashParams();
      if (hp.access_token && hp.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: hp.access_token,
          refresh_token: hp.refresh_token,
        });
        if (error) throw error;
        window.history.replaceState({}, "", window.location.pathname + window.location.search);
        return true;
      }

      return false;
    }

    (async () => {
      setSessionChecked(false);

      try {
        try {
          const didReturn = await handleAuthReturnIfAny();
          if (didReturn) {
            setMsg("Email confirmado. Agora crie uma senha para acessar a plataforma.");
            setSent(true);
          }
        } catch (e) {
          setMsg(e?.message || "Falha ao validar o link. Reenvie e tente novamente.");
        }

        await revalidateSessionAndUser({ silent: true });

        const { data: subAuth } = supabase.auth.onAuthStateChange(async (_event, s) => {
          if (!alive) return;
          setHasSession(!!s);
          setSessionChecked(true);

          if (s) {
            await refreshUserFlags(s.user);
            setSent(false);
          } else {
            setPwReady(false);
          }
        });

        return () => subAuth?.subscription?.unsubscribe?.();
      } finally {
        // noop
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionChecked) return;

    if ((step === 2 || step === 3) && !hasSession) {
      goStep(1, "");
      return;
    }
    if ((step === 2 || step === 3) && hasSession && !pwReady) {
      goStep(1, "");
      setMsg("Para continuar, crie uma senha de acesso à sua conta.");
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, hasSession, pwReady, sessionChecked]);

  useEffect(() => {
    if (reason === "pix_expired") {
      setMsg((prev) => prev || "Seu acesso por Pix expirou. Gere um novo Pix para continuar.");
    }
  }, [reason]);

  useEffect(() => {
    const next = new URLSearchParams(sp);

    if (email) next.set("email", email);
    else next.delete("email");

    next.set("plan", plan);
    next.set("cycle", cycle);

    if (promo) next.set("promo", promo);
    else next.delete("promo");

    setSp(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, plan, cycle, promo]);

  useEffect(() => {
    setPixData(null);
  }, [plan, cycle, promo, showPromoUI]);

  function buildEmailRedirectTo(nextStep = 1, nextSub = "") {
    const p = new URLSearchParams();
    p.set("step", String(nextStep));
    if (nextSub) p.set("sub", nextSub);
    if (email) p.set("email", email);
    if (plan) p.set("plan", plan);
    if (cycle) p.set("cycle", cycle);
    if (promo && cycle !== "anual") p.set("promo", promo); // ✅ promo só no mensal
    return `${APP_ORIGIN}/signup?${p.toString()}`;
  }

  async function sendMagicLink(isResend = false) {
    setMsg("");
    setNeedsReauth(false);
    setReauthSent(false);

    if (!email || !String(email).includes("@")) {
      setMsg("Informe um email válido.");
      return;
    }

    setBusy(true);
    try {
      await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: buildEmailRedirectTo(1, ""),
          shouldCreateUser: true,
        },
      });

      setSent(true);
      setMsg(isResend ? "Link reenviado. Verifique seu email." : "Enviamos um link de confirmação. Verifique seu email.");
    } catch (e) {
      setMsg(e?.message || "Não foi possível enviar o link. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function iAlreadyClickedLink() {
    setMsg("");
    setBusy(true);
    try {
      const res = await revalidateSessionAndUser({ silent: true });

      if (res.ok) {
        setSent(false);
        if (!res.pwSet) setMsg("Email confirmado. Agora crie uma senha para acessar a plataforma.");
        else setMsg("");
      } else {
        setMsg("Ainda não identificamos sua sessão. Abra o link do email no mesmo navegador onde você está usando o CineSuper.");
      }
    } catch {
      setMsg("Falha ao verificar sessão. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReauthEmail() {
    setMsg("");
    setBusy(true);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      setReauthSent(true);
      setMsg("Enviamos um email para reautenticar. Abra o link e volte para salvar a senha.");
    } catch (e) {
      setMsg(e?.message || "Não foi possível reautenticar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function savePasswordRequired() {
    setMsg("");
    setNeedsReauth(false);
    setReauthSent(false);

    if (!hasSession) {
      setMsg("Confirme seu email primeiro para definir a senha.");
      return;
    }

    if (!isPasswordValid(password)) {
      setMsg("Senha fraca: mínimo 8, 1 maiúscula, 1 número e 1 caractere especial.");
      return;
    }

    if (password !== password2) {
      setMsg("As senhas não conferem.");
      return;
    }

    setBusy(true);
    try {
      const { data: sess } = await withTimeout(
        supabase.auth.getSession(),
        8000,
        "Demorou para validar sua sessão. Reabra o link do email e tente novamente."
      );

      if (!sess?.session?.access_token) {
        throw new Error("Sessão não encontrada. Reabra o link do email novamente e tente.");
      }

      const { data, error } = await withTimeout(
        supabase.auth.updateUser({
          password,
          data: { pw_set: true },
        }),
        15000,
        "Demorou para salvar sua senha. Verifique sua internet e tente novamente."
      );

      if (error) {
        const low = String(error.message || "").toLowerCase();
        if (
          low.includes("reauth") ||
          low.includes("recent") ||
          low.includes("aal") ||
          low.includes("expired") ||
          low.includes("not authorized")
        ) {
          setNeedsReauth(true);
          throw new Error("Por segurança, o Supabase exige reautenticação para alterar a senha. Clique em “Reautenticar por email”.");
        }
        throw error;
      }

      setPwReady(true);
      setPassword("");
      setPassword2("");

      setMsg("Senha definida com sucesso. Você já pode continuar.");
      goStep(2, "intro");
    } catch (e) {
      setMsg(e?.message || "Não foi possível definir a senha. Tente novamente.");
      console.error("[Signup] savePasswordRequired error:", e);
    } finally {
      setBusy(false);
    }
  }

  function buildBillingReturnUrl(provider) {
    const qs = new URLSearchParams();
    if (email) qs.set("email", String(email).toLowerCase().trim());
    if (plan) qs.set("plan", plan);
    if (cycle) qs.set("cycle", cycle);
    if (showPromoUI && promo) qs.set("promo", promo);
    if (provider) qs.set("provider", provider);
    return `/account/billing-return?${qs.toString()}`;
  }

  async function startPixCheckout({ force = false } = {}) {
    setMsg("");
    setPayMethod("pix");
    if (pixData && !force) return;

    if (!email || !String(email).includes("@")) {
      setMsg("Informe um email válido antes de gerar o Pix.");
      return;
    }

    setPixBusy(true);
    try {
      const access_token = await getAccessTokenOrThrow();
      const planKey = String(plan || "").toLowerCase();
      const body = {
        plan: planKey,
        cycle,
        promo: showPromoUI ? promo : "",
        email: String(email).toLowerCase().trim(),
      };

      const { data, error } = await supabase.functions.invoke("mp-create-pix", {
        body,
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (error) {
        let detail = error.message || "Falha ao gerar Pix.";
        try {
          const res = error.context;
          if (res) {
            try {
              const j = await res.json();
              detail = j?.error || j?.message || JSON.stringify(j);
            } catch {
              const t = await res.text();
              if (t) detail = t;
            }
          }
        } catch {}
        throw new Error(detail);
      }

      if (!data?.qr_code) throw new Error("Não foi possível gerar o QR Code do Pix.");
      setPixData(data);
    } catch (e) {
      setPixData(null);
      setMsg(e?.message || "Falha ao iniciar Pix.");
    } finally {
      setPixBusy(false);
    }
  }

  function handleStripeSuccess() {
    setMsg("Pagamento iniciado. Estamos confirmando sua assinatura...");
    nav(buildBillingReturnUrl("stripe"));
  }

  return (
    <div className="min-h-[100vh] bg-black text-white">
      <style>{`html { scrollbar-gutter: stable; }`}</style>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1100px] px-5 sm:px-6 lg:px-10 h-16 flex items-center justify-between">
          <a href={`${ROOT_ORIGIN}/`} className="flex items-center" aria-label="Voltar para a Landing">
            <img src={Logo} alt="CineSuper" className="h-10 w-auto select-none" draggable={false} />
          </a>

          <a href={`${APP_ORIGIN}/login`} className="text-sm text-white/70 hover:text-white">
            Já tem conta? Entrar
          </a>
        </div>
      </header>

      <main className="min-h-screen">
        <Container>
          <div className={cx("mx-auto py-10", step === 2 && sub === "plans" ? "max-w-[1200px]" : "max-w-[900px]")}>
            <Stepper step={step} />

            <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-6 md:p-8">
              {!sessionChecked ? <div className="mb-4 text-sm text-white/60">Verificando seu acesso...</div> : null}

              {/* PASSO 1 */}
              {step === 1 ? (
                <div className="grid gap-6 md:grid-cols-2 md:gap-10 items-start">
                  <div>
                    <div className="text-xs font-semibold tracking-widest text-red-500/90">PASSO 1 DE 3</div>
                    <h1 className="mt-2 text-2xl md:text-3xl font-black tracking-tight">Crie sua conta</h1>

                    <p className="mt-3 text-sm md:text-base text-white/65 leading-relaxed">
                      Confirme seu email e defina uma senha forte para entrar com email/senha quando quiser.
                    </p>

                    <div className="mt-5">
                      <label className="text-xs text-white/60">Email</label>
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        autoComplete="email"
                        placeholder="Email"
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                        disabled={hasSession}
                      />
                    </div>

                    {msg ? <div className="mt-4 text-sm text-white/80">{msg}</div> : null}

                    {!hasSession ? (
                      <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
                        <div className="text-sm font-semibold text-white/90">Confirmar email</div>
                        <div className="mt-1 text-sm text-white/65 leading-relaxed">
                          Enviaremos um link para <b className="text-white/90">{email || "seu email"}</b>.
                        </div>

                        <div className="mt-4 flex flex-col gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => sendMagicLink(sent)}
                            className="rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                          >
                            {busy ? "Enviando..." : sent ? "Enviar novamente" : "Enviar link"}
                          </button>

                          {sent ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={iAlreadyClickedLink}
                              className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                            >
                              Já cliquei no link
                            </button>
                          ) : null}

                          <button
                            type="button"
                            disabled={busy || refreshing}
                            onClick={() => revalidateSessionAndUser({ silent: false })}
                            className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                          >
                            <span className="inline-flex items-center justify-center gap-2">
                              <RotateCw className={cx("h-4 w-4", refreshing ? "animate-spin" : "")} />
                              Revalidar status
                            </span>
                          </button>
                        </div>

                        <div className="mt-3 text-xs text-white/45">
                          Abra o link no mesmo navegador onde você está usando o CineSuper.
                        </div>
                      </div>
                    ) : (
                      <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-emerald-200 mt-0.5" />
                          <div>
                            <div className="text-sm font-semibold text-emerald-100">Email confirmado</div>
                            <div className="mt-1 text-sm text-emerald-100/80">Agora defina sua senha para continuar.</div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                          <Lock className="h-5 w-5 text-white/80" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white/90">Definir senha de acesso</div>
                          <div className="mt-1 text-sm text-white/65 leading-relaxed">
                            {pwReady ? "Senha já definida. Você pode continuar." : hasSession ? "Crie uma senha forte." : "Confirme o email para habilitar."}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div>
                          <label className="text-xs text-white/60">Senha</label>
                          <input
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            type="password"
                            autoComplete="new-password"
                            placeholder="Mínimo 8 caracteres"
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            disabled={!hasSession || pwReady || busy}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-white/60">Confirmar senha</label>
                          <input
                            value={password2}
                            onChange={(e) => setPassword2(e.target.value)}
                            type="password"
                            autoComplete="new-password"
                            placeholder="Repita a senha"
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            disabled={!hasSession || pwReady || busy}
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-xs text-white/55">
                        <div className={cx("flex items-center gap-2", rules.len ? "text-emerald-200" : "")}>
                          <span className="inline-block w-2 h-2 rounded-full bg-white/20" /> Mínimo 8 caracteres
                        </div>
                        <div className={cx("flex items-center gap-2", rules.upper ? "text-emerald-200" : "")}>
                          <span className="inline-block w-2 h-2 rounded-full bg-white/20" /> 1 letra maiúscula (A-Z)
                        </div>
                        <div className={cx("flex items-center gap-2", rules.number ? "text-emerald-200" : "")}>
                          <span className="inline-block w-2 h-2 rounded-full bg-white/20" /> 1 número (0-9)
                        </div>
                        <div className={cx("flex items-center gap-2", rules.special ? "text-emerald-200" : "")}>
                          <span className="inline-block w-2 h-2 rounded-full bg-white/20" /> 1 caractere especial (!@#)
                        </div>
                        {password2 ? (
                          <div className={cx("flex items-center gap-2", password === password2 ? "text-emerald-200" : "text-red-200")}>
                            <span className="inline-block w-2 h-2 rounded-full bg-white/20" /> Confirmação{" "}
                            {password === password2 ? "ok" : "não confere"}
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={savePasswordRequired}
                        disabled={!hasSession || pwReady || busy}
                        className="mt-4 w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15 disabled:opacity-60"
                      >
                        {pwReady ? "Senha já definida" : busy ? "Salvando..." : "Salvar senha"}
                      </button>

                      {needsReauth ? (
                        <button
                          type="button"
                          onClick={sendReauthEmail}
                          disabled={busy}
                          className="mt-3 w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
                        >
                          <span className="inline-flex items-center justify-center gap-2">
                            <Mail className="h-4 w-4" />
                            Reautenticar por email
                          </span>
                        </button>
                      ) : null}

                      {reauthSent ? (
                        <div className="mt-3 text-xs text-white/60">
                          Reautenticação enviada. Abra o link do email e volte para clicar em “Salvar senha” novamente.
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 text-xs text-white/45 leading-relaxed">
                      Ao continuar, você concorda com os termos e política da CineSuper.
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-black/30 p-6">
                    <div className="text-sm font-semibold text-white/90">Seu plano selecionado</div>
                    <div className="mt-2 text-white/80 font-bold">{selectedPlan.name}</div>

                    <div className="mt-2 text-sm text-white/60">
                      {cycle === "anual" ? selectedPlan.annualPrice : selectedPlan.price}
                      {!String(cycle).toLowerCase().includes("anual") && showPromoUI ? (
                        <span className="text-white/45"> • Promo: {selectedPlan.promoPrice} (3 meses)</span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!sessionChecked) {
                          setMsg("Verificando sua sessão... aguarde um instante e tente novamente.");
                          return;
                        }
                        if (!canContinue) {
                          setMsg("Para continuar, confirme seu email e defina uma senha.");
                          return;
                        }
                        goStep(2, "intro");
                      }}
                      className="mt-6 w-full rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15"
                    >
                      Continuar para escolher plano →
                    </button>

                    <div className="mt-4 text-xs text-white/45">
                      Status:{" "}
                      <span className={cx("font-semibold", hasSession ? "text-white/80" : "text-white/55")}>
                        {hasSession ? "Email confirmado" : "Aguardando confirmação"}
                      </span>{" "}
                      <span className="text-white/35">•</span>{" "}
                      <span className={cx("font-semibold", pwReady ? "text-white/80" : "text-white/55")}>
                        {pwReady ? "Senha definida" : "Senha pendente"}
                      </span>
                    </div>

                    <div className="mt-3 text-xs text-white/45 leading-relaxed">
                      Dica: se você abriu o link do email e não marcou na hora, clique em <b>Revalidar status</b>.
                    </div>
                  </div>
                </div>
              ) : null}

              {/* PASSO 2 */}
              {step === 2 ? (
                <>
                  {sub !== "plans" ? (
                    <div>
                      <div className="text-xs font-semibold tracking-widest text-red-500/90">PASSO 2 DE 3</div>
                      <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight">Escolha seu plano</h2>

                      <div className="mt-4 space-y-2 text-white/65">
                        <div>Sem compromisso, cancele quando quiser.</div>
                        <div>Entretenimento sem fim, por um preço baixo.</div>
                        <div>Divirta-se com a CineSuper em todos os seus aparelhos.</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => goStep(2, "plans")}
                        className="mt-8 rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
                      >
                        Próximo →
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs font-semibold tracking-widest text-red-500/90">PASSO 2 DE 3</div>
                      <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight">Escolha o melhor plano para você</h2>

                      <div className="mt-6 grid gap-4 lg:grid-cols-3">
                        {PLANS.map((p) => (
                          <PlanCard
                            key={p.key}
                            plan={p}
                            selected={plan === p.key}
                            onSelect={setPlan}
                            cycle={cycle}
                            promo={promo}
                            promoEligible={promoEligible}
                          />
                        ))}
                      </div>

                      <div className="mt-6 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => goStep(2, "intro")}
                          className="rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          onClick={() => goStep(3, "")}
                          className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
                        >
                          Próximo →
                        </button>
                      </div>

                      {cycle === "anual" ? (
                        <div className="mt-4 text-xs text-white/45">Pagamento anual. 4K/5.1 dependem do título e dispositivo (quando disponível).</div>
                      ) : showPromoUI ? (
                        <div className="mt-4 text-xs text-white/45">
                          Promo lançamento aplicada na cobrança mensal (3 meses). 4K/5.1 dependem do título e dispositivo (quando disponível).
                        </div>
                      ) : (
                        <div className="mt-4 text-xs text-white/45">
                          Cobrança mensal. 4K/5.1 dependem do título e dispositivo (quando disponível).
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : null}

              {/* PASSO 3 */}
              {step === 3 ? (
                <div>
                  <div className="text-xs font-semibold tracking-widest text-red-500/90">PASSO 3 DE 3</div>
                  <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight">Escolha como você quer pagar</h2>

                  {msg ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/80">{msg}</div>
                  ) : null}

                  <div className="mt-4 text-sm text-white/65 leading-relaxed">
                    Cartão recorrente via <b>Stripe</b> ou Pix via <b>Mercado Pago</b>. Escolha abaixo como prefere pagar.
                  </div>

                  {/* ✅ promo só mensal */}
                  {promoChecked && showPromoUI && cycle !== "anual" ? (
                    <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100/90">
                      Promo aplicada para sua conta: <b>{selectedPlan.promoPrice}</b> por 3 meses.
                    </div>
                  ) : null}

                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPayMethod("card")}
                      className={cx(
                        "rounded-2xl border border-white/10 bg-white/[0.06] p-5 text-left hover:bg-white/[0.09] transition",
                        busy ? "opacity-60 cursor-not-allowed" : ""
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                          <CreditCard className="h-5 w-5 text-white/80" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white/90">Cartão de crédito (Stripe)</div>
                          <div className="mt-1 text-xs text-white/50">
                            Assinatura recorrente • Plano {selectedPlan.name} • {displayLabelForCheckout} •{" "}
                            {brl(displayAmountForCheckout)}
                          </div>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={pixBusy}
                      onClick={startPixCheckout}
                      className={cx(
                        "rounded-2xl border border-white/10 bg-white/[0.06] p-5 text-left hover:bg-white/[0.09] transition",
                        pixBusy ? "opacity-60 cursor-not-allowed" : ""
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                          <QrCode className="h-5 w-5 text-white/80" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white/90">Pix (Mercado Pago)</div>
                          <div className="mt-1 text-xs text-white/50">
                            {cycle === "anual" ? "Acesso anual (365 dias)" : "Acesso por 30 dias"} • Plano {selectedPlan.name} •{" "}
                            {displayLabelForCheckout}
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>

                  {payMethod === "card" ? (
                    stripePromise ? (
                      <Elements stripe={stripePromise} options={{ locale: "pt-BR" }}>
                        <StripeCardForm
                          email={email}
                          planKey={plan}
                          cycle={cycle}
                          promo={showPromoUI ? promo : ""}
                          planName={selectedPlan.name}
                          displayAmount={displayAmountForCheckout}
                          busy={busy}
                          setBusy={setBusy}
                          setMsg={setMsg}
                          onSuccess={handleStripeSuccess}
                          onClose={() => setPayMethod("")}
                        />
                      </Elements>
                    ) : (
                      <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        Falta configurar <b>VITE_STRIPE_PUBLISHABLE_KEY</b> no .env para habilitar o cartão.
                      </div>
                    )
                  ) : null}

                  {payMethod === "pix" ? (
                    <div className="mt-6 rounded-3xl border border-white/10 bg-black/30 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white/90">Pix Mercado Pago</div>
                          <div className="mt-1 text-xs text-white/55">
                            Pagamento único. O acesso vence em {cycle === "anual" ? "365 dias" : "30 dias"} e avisaremos com 3 dias de antecedência.
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPixData(null);
                            startPixCheckout({ force: true });
                          }}
                          className="inline-flex h-9 items-center justify-center rounded-xl bg-white/10 px-3 text-xs hover:bg-white/15"
                        >
                          Gerar novo Pix
                        </button>
                      </div>

                      {!pixData ? (
                        <div className="mt-4 text-sm text-white/70">
                          {pixBusy ? "Gerando Pix..." : "Clique em “Pix (Mercado Pago)” para gerar o QR Code."}
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-4 md:grid-cols-[220px,1fr] items-start">
                          <div className="rounded-2xl bg-white p-3 flex items-center justify-center">
                            {pixData.qr_code_base64 ? (
                              <img
                                src={`data:image/png;base64,${pixData.qr_code_base64}`}
                                alt="QR Code Pix"
                                className="h-[180px] w-[180px]"
                              />
                            ) : (
                              <QRCode value={pixData.qr_code} size={180} />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="text-xs uppercase tracking-widest text-white/45">Copia e cola</div>
                            <div className="mt-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/70 break-all">
                              {pixData.qr_code}
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(pixData.qr_code || "");
                                    setMsg("Código Pix copiado!");
                                  } catch {
                                    setMsg("Não foi possível copiar o Pix. Selecione e copie manualmente.");
                                  }
                                }}
                                className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
                              >
                                Copiar código Pix
                              </button>
                              <button
                                type="button"
                                onClick={() => nav(buildBillingReturnUrl("mp"))}
                                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500"
                              >
                                Já paguei
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="mt-5 flex items-center gap-2 text-xs text-white/50">
                    <ShieldCheck className="h-4 w-4 text-white/60" />
                    <span>Cartão processado pela Stripe. Pix processado pelo Mercado Pago.</span>
                  </div>

                  <div className="mt-6 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => goStep(2, "plans")}
                      className="rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
                    >
                      Voltar
                    </button>

                    <div className="text-sm text-white/70">
                      Plano: <b className="text-white/90">{selectedPlan.name}</b> •{" "}
                      <b className="text-white/90">{cycle === "anual" ? "Anual" : "Mensal"}</b>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
}
