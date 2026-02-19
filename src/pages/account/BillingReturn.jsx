// src/pages/account/BillingReturn.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Container from "../../components/layout/Container.jsx";
import Footer from "../../components/layout/Footer.jsx";
import Logo from "../../assets/Logo.png";
import { supabase } from "../../lib/supabaseClient.js";
import { CheckCircle2, Clock, RefreshCw, AlertTriangle, LogIn } from "lucide-react";
import PageTitle from "../../components/PageTitle.jsx";

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchLatestEntitlement(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from("user_entitlements")
    .select("plan, status, max_quality, max_screens, max_profiles, expires_at, updated_at, created_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export default function BillingReturn() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  <PageTitle title="Pagamento" />
  const provider = String(sp.get("provider") || "").toLowerCase();
  const emailParam = String(sp.get("email") || "");
  const planParam = String(sp.get("plan") || "");
  const promoParam = String(sp.get("promo") || "");

  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [ent, setEnt] = useState(null);

  const prettyPlan = useMemo(() => {
    const p = String(ent?.plan || planParam || "").toLowerCase();
    if (p === "ouro") return "Ouro";
    if (p === "diamante") return "Diamante";
    if (p === "prata") return "Prata";
    return p ? p : "—";
  }, [ent?.plan, planParam]);

  const isActive = String(ent?.status || "").toLowerCase() === "active";

  async function loadSessionAndMaybePoll({ doPoll = true } = {}) {
    setErr("");
    setMsg("");
    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const sess = data?.session || null;

      setHasSession(!!sess);
      setUserEmail(sess?.user?.email || "");

      // Se não tem sessão, não dá para consultar entitlements por user_id
      if (!sess?.user?.id) {
        setEnt(null);
        setMsg("Pagamento recebido. Agora faça login para ativarmos seu acesso automaticamente.");
        return;
      }

      // Primeiro fetch rápido
      const e0 = await fetchLatestEntitlement(sess.user.id);
      setEnt(e0);

      // Se já está ativo, pronto.
      if (String(e0?.status || "").toLowerCase() === "active") {
        setMsg("Acesso liberado. Bem-vindo ao CineSuper!");
        return;
      }

      if (!doPoll) {
        setMsg("Estamos aguardando a confirmação do pagamento.");
        return;
      }

      // Poll por ~25s (webhook pode demorar alguns segundos)
      setChecking(true);
      for (let i = 0; i < 10; i++) {
        await sleep(2500);
        const e = await fetchLatestEntitlement(sess.user.id);
        setEnt(e);

        if (String(e?.status || "").toLowerCase() === "active") {
          setMsg("Pagamento confirmado e acesso liberado. Bem-vindo ao CineSuper!");
          return;
        }
      }

      setMsg("Ainda estamos aguardando a confirmação automática. Se você acabou de pagar, tente atualizar em alguns segundos.");
    } catch (e) {
      setErr(e?.message || "Falha ao verificar sua assinatura.");
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    // Apenas uma proteção (se alguém acessar sem querystring)
    // Provider pode ser vazio em testes; não bloqueia.
    loadSessionAndMaybePoll({ doPoll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginLink = useMemo(() => {
    // manda email preenchido e volta para cá depois
    const p = new URLSearchParams();
    if (emailParam) p.set("email", emailParam);
    // Você pode usar state.from também, mas aqui vai simples:
    p.set("from", "/account/billing-return");
    return `/login?${p.toString()}`;
  }, [emailParam]);

  return (
    <div className="min-h-[100vh] bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1100px] px-5 sm:px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center" aria-label="Voltar para a Landing">
            <img src={Logo} alt="CineSuper" className="h-10 w-auto select-none" draggable={false} />
          </Link>
          <Link to="/login" className="text-sm text-white/70 hover:text-white">
            Entrar
          </Link>
        </div>
      </header>

      <main className="min-h-screen">
        <Container>
          <div className="py-10">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-6 md:p-8">
              <div className="text-xs font-semibold tracking-widest text-red-500/90">
                RETORNO DO PAGAMENTO {provider ? `• ${provider.toUpperCase()}` : ""}
              </div>

              <h1 className="mt-2 text-2xl md:text-3xl font-black tracking-tight">Finalizando sua assinatura</h1>

              <div className="mt-4 text-sm text-white/65 leading-relaxed">
                Email: <b className="text-white/90">{userEmail || emailParam || "—"}</b>
                <span className="text-white/35"> • </span>
                Plano: <b className="text-white/90">{prettyPlan}</b>
                {promoParam ? (
                  <>
                    <span className="text-white/35"> • </span>
                    Promo: <b className="text-white/90">{promoParam}</b>
                  </>
                ) : null}
              </div>

              {err ? (
                <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <div>{err}</div>
                  </div>
                </div>
              ) : null}

              {msg ? (
                <div className="mt-5 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/80">
                  {msg}
                </div>
              ) : null}

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5">
                <div className="flex items-start gap-3">
                  {isActive ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-200 mt-0.5" />
                  ) : checking || loading ? (
                    <Clock className="h-5 w-5 text-white/70 mt-0.5" />
                  ) : (
                    <Clock className="h-5 w-5 text-white/70 mt-0.5" />
                  )}

                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white/90">
                      {isActive ? "Assinatura ativa" : "Aguardando confirmação"}
                    </div>

                    <div className="mt-1 text-sm text-white/65">
                      {hasSession ? (
                        <>
                          Status atual:{" "}
                          <b className="text-white/90">{String(ent?.status || "pending")}</b>
                          {ent?.updated_at ? (
                            <>
                              <span className="text-white/35"> • </span>
                              Atualizado: <b className="text-white/90">{String(ent.updated_at)}</b>
                            </>
                          ) : null}
                        </>
                      ) : (
                        "Você ainda não está logado nesta aba. Faça login para concluir a ativação automática."
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  {!hasSession ? (
                    <Link
                      to={loginLink}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500"
                    >
                      <LogIn className="h-4 w-4" />
                      Fazer login para ativar
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled={loading || checking}
                      onClick={() => loadSessionAndMaybePoll({ doPoll: true })}
                      className={cx(
                        "inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15",
                        (loading || checking) ? "opacity-60 cursor-not-allowed" : ""
                      )}
                    >
                      <RefreshCw className={cx("h-4 w-4", (loading || checking) ? "animate-spin" : "")} />
                      Atualizar status
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => nav("/browse", { replace: false })}
                    className="inline-flex items-center justify-center rounded-xl bg-white text-black px-4 py-3 text-sm font-semibold hover:bg-white/90"
                  >
                    Ir para o catálogo
                  </button>
                </div>

                <div className="mt-3 text-[11px] text-white/45 leading-relaxed">
                  Observação: a página de retorno apenas redireciona. A liberação do acesso depende do webhook do Stripe
                  (cartão) ou do Mercado Pago (Pix) atualizar seus registros (pode levar alguns segundos).
                </div>
              </div>
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
}
