// src/pages/Landing.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Footer from "../components/layout/Footer.jsx";
import Container from "../components/layout/Container.jsx";
import "../styles/landing.css";

import BgLogin from "../assets/Back_Landing.jpg";
import Logo from "../assets/Logo.png";
import DownloaderLogo from "../assets/downloader-logo.png";

// Assista onde quiser (set A)
import A1 from "../assets/catalog/assista/1.jpg";
import A2 from "../assets/catalog/assista/2.jpg";
import A3 from "../assets/catalog/assista/3.jpg";
import A4 from "../assets/catalog/assista/4.jpg";
import PageTitle from "../components/PageTitle.jsx";
import { marketingConfig } from "../lib/marketingConfig.js";

// Auto-load de todas as imagens dentro das pastas (Vite)
function sortByFilename(a, b) {
  const ax = a.match(/(\d+)\.(jpg|jpeg|png|webp)$/i);
  const bx = b.match(/(\d+)\.(jpg|jpeg|png|webp)$/i);
  if (ax && bx) return Number(ax[1]) - Number(bx[1]);
  return a.localeCompare(b);
}

function loadFolder(globResult) {
  return Object.entries(globResult)
    .sort(([a], [b]) => sortByFilename(a, b))
    .map(([, src]) => src);
}

const CATALOG_ASSISTA = loadFolder(
  import.meta.glob("../assets/catalog/assista/*.{jpg,jpeg,png,webp}", {
    eager: true,
    import: "default",
  })
);

const CATALOG_PERFIS = loadFolder(
  import.meta.glob("../assets/catalog/perfis/*.{jpg,jpeg,png,webp}", {
    eager: true,
    import: "default",
  })
);

const PLANS = [
  {
    key: "prata",
    name: "CineSuper Prata",

    // ✅ Mensal
    price: marketingConfig.plans.prata.price,

    // ✅ Anual (exemplo: 2 meses grátis = 10x mensal)
    annualPrice: marketingConfig.plans.prata.annualPrice,
    annualSubLabel: marketingConfig.plans.prata.annualSubLabel,
    annualBadge: marketingConfig.plans.prata.annualBadge,

    badge: null,
    highlight: "Para quem quer economizar e assistir no dia a dia.",
    features: ["2 telas simultâneas", "Até Full HD (1080p)", "2 perfis", "Áudio estéreo (2.0)"],
  },
  {
    key: "ouro",
    name: "CineSuper Ouro",

    // ✅ Mensal
    price: marketingConfig.plans.ouro.price,

    // ✅ Anual
    annualPrice: marketingConfig.plans.ouro.annualPrice,
    annualSubLabel: marketingConfig.plans.ouro.annualSubLabel,
    annualBadge: marketingConfig.plans.ouro.annualBadge,

    badge: "Recomendado",
    highlight: "Mais telas, mais perfis e melhor áudio.",
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

    // ✅ Mensal
    price: marketingConfig.plans.diamante.price,

    // ✅ Anual
    annualPrice: marketingConfig.plans.diamante.annualPrice,
    annualSubLabel: marketingConfig.plans.diamante.annualSubLabel,
    annualBadge: marketingConfig.plans.diamante.annualBadge,

    badge: null,
    highlight: "O máximo de qualidade e conforto.",
    features: ["6 telas simultâneas", "Até 4K (quando disponível)", "6 perfis", "Áudio 5.1 (quando disponível)", "Prioridade no suporte"],
  },
];

const PLAN_COMPARE = [
  { label: "Telas simultâneas", prata: "2", ouro: "4", diamante: "6" },
  { label: "Perfis", prata: "2", ouro: "4", diamante: "6" },
  { label: "Qualidade máxima", prata: "Full HD", ouro: "Full HD", diamante: "4K*" },
  { label: "Áudio", prata: "Estéreo (2.0)", ouro: "2.0 + 5.1*", diamante: "5.1*" },
  { label: "Suporte", prata: "Padrão", ouro: "Padrão", diamante: "Prioridade" },
];

const FAQ = [
  {
    q: "O que é o CineSuper?",
    a: "O CineSuper é um serviço de assinatura para assistir filmes e séries online em dispositivos compatíveis. Você escolhe um plano e assiste respeitando o limite de telas simultâneas do seu plano.",
  },
  { q: "Tem anúncios? Tem download?", a: "Não. O CineSuper não exibe anúncios e não oferece download offline. O acesso é via streaming." },
  { q: "Posso assistir em outra residência?", a: "Sim. Você pode acessar de qualquer lugar, desde que não ultrapasse a quantidade de telas simultâneas do seu plano." },
  { q: "Como funciona o pagamento?", a: "Cartão recorrente via Stripe ou Pix via Mercado Pago. No Pix, cada pagamento libera 30 dias (ou 365 no anual)." },
  { q: "Como cancelar?", a: "No cartão, você pode cancelar quando quiser. No Pix, o acesso expira no fim do período já pago e basta gerar um novo Pix para renovar." },
];

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

function Pill({ children }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-white/80">{children}</span>;
}

function SectionShell({ children, className }) {
  return <section className={cx("mx-auto max-w-[1400px] px-5 sm:px-6 lg:px-10 xl:px-14", className)}>{children}</section>;
}

function Divider() {
  return (
    <div className="mx-auto max-w-[1400px] px-5 sm:px-6 lg:px-10 xl:px-14">
      <div className="h-px bg-white/10" />
    </div>
  );
}

function Accordion({ items }) {
  const [open, setOpen] = useState(null);

  return (
    <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md overflow-hidden">
      {items.map((it, idx) => {
        const isOpen = open === idx;
        return (
          <div key={idx} className="p-5 md:p-6">
            <button
              type="button"
              className="w-full text-left flex items-center justify-between gap-4"
              onClick={() => setOpen(isOpen ? null : idx)}
            >
              <div className="text-base md:text-lg font-semibold text-white/90">{it.q}</div>
              <div className="shrink-0 rounded-full border border-white/15 bg-black/30 w-9 h-9 flex items-center justify-center">
                <span className="text-white/80 text-lg leading-none">{isOpen ? "–" : "+"}</span>
              </div>
            </button>

            {isOpen ? <div className="mt-4 text-sm md:text-base text-white/65 leading-relaxed">{it.a}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

/* =========================
   Cover Marquee (com imagens reais)
========================= */

function PosterTile({ src, alt = "Capa", className = "" }) {
  return (
    <div
      className={cx(
        "relative shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40",
        "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]",
        className
      )}
    >
      <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 opacity-45 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/55" />
    </div>
  );
}

function CoverMarquee({ reverse = false, images = [] }) {
  const fadeMask =
    "[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] " +
    "[-webkit-mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]";

  const loop = images?.length ? [...images, ...images] : [];

  return (
    <div className="relative rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(220,38,38,0.16)_0%,rgba(0,0,0,0)_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-black/60" />

      <div className="relative px-6 md:px-7 pt-6 md:pt-7">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-white/85">Prévia do catálogo</div>
          <div className="text-xs text-white/45">{images.length} capas</div>
        </div>
      </div>

      <div className="relative px-6 md:px-7 pb-6 md:pb-7 pt-5">
        <div className={cx("overflow-hidden cs-pause", fadeMask)}>
          <div className={cx("cs-track", reverse ? "rev" : "")}>
            {loop.map((src, i) => (
              <PosterTile
                key={`p-${i}`}
                src={src}
                alt={`Capa ${i + 1}`}
                className="w-[122px] sm:w-[136px] md:w-[150px] lg:w-[168px] aspect-[2/3]"
              />
            ))}
          </div>
        </div>

        <div className="mt-5 text-xs text-white/45">Passe o mouse para pausar o movimento.</div>
      </div>
    </div>
  );
}

function FeatureRow({ title, desc, bullets = [], flipped, images = [] }) {
  return (
    <div className="grid gap-6 lg:gap-10 items-center lg:grid-cols-12">
      <div className={cx("lg:col-span-6", flipped ? "lg:order-2" : "lg:order-1")}>
        <div className="text-2xl md:text-3xl font-black tracking-tight text-white/95">{title}</div>
        <div className="mt-3 text-sm md:text-base text-white/60 leading-relaxed">{desc}</div>

        {bullets?.length ? (
          <ul className="mt-5 space-y-2 text-sm text-white/70">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1 inline-flex h-5 w-5 items-center justify-center rounded-md border border-white/10 bg-black/30 text-white/80">
                  ✓
                </span>
                <span className="leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={cx("lg:col-span-6", flipped ? "lg:order-1" : "lg:order-2")}>
        <CoverMarquee reverse={!!flipped} images={images} />
      </div>
    </div>
  );
}

/**
 * ✅ Ajuste pedido:
 * - Se o card NÃO estiver selecionado: clique apenas seleciona o plano.
 * - Se o card JÁ estiver selecionado: clique (e “Continuar”) navega para /signup com plan/cycle/email.
 */
function PlanCard({ plan, selected, onSelect, onContinue, billingCycle }) {
  const isRecommended = String(plan.badge || "").trim().toLowerCase() === "recomendado";
  const isAnnual = billingCycle === "anual";

  const mainPrice = isAnnual ? plan.annualPrice || plan.price : plan.price;

  function handleClick() {
    if (selected) {
      onContinue?.(plan.key);
    } else {
      onSelect?.(plan.key);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={selected}
      className={cx(
        "group relative text-left rounded-3xl border transition overflow-hidden h-full",
        "focus:outline-none focus:ring-2 focus:ring-red-500/40",
        "hover:-translate-y-[1px] active:translate-y-0",
        selected
          ? "border-red-500/45 bg-red-500/10"
          : "border-white/10 bg-white/[0.06] hover:bg-white/[0.09] hover:border-white/20",
        isRecommended && !selected ? "lg:scale-[1.01] lg:shadow-[0_24px_60px_rgba(0,0,0,0.55)]" : ""
      )}
    >
      {isRecommended ? (
        <div className="pointer-events-none absolute -inset-24 opacity-35 blur-3xl bg-[radial-gradient(circle_at_top,rgba(220,38,38,0.35),transparent_60%)]" />
      ) : null}

      <div className="relative p-6 md:p-7 flex flex-col h-full">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg md:text-xl font-black tracking-tight text-white line-clamp-1">{plan.name}</div>
            <div className="mt-2 text-sm text-white/60 leading-snug line-clamp-2">{plan.highlight}</div>
          </div>

          <div className="shrink-0 flex flex-col items-end gap-2">
            {selected ? (
              <span className="rounded-full border border-red-500/30 bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-100">
                ✓ Selecionado
              </span>
            ) : null}

            {plan.badge ? (
              <span className="rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-200">
                {plan.badge}
              </span>
            ) : null}

            {isAnnual && plan.annualBadge ? (
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/85">
                {plan.annualBadge}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="text-2xl md:text-3xl font-black text-white">{mainPrice}</div>
          </div>

          {isAnnual ? (
            <div className="mt-2 text-xs text-white/55">{plan.annualSubLabel || "Pagamento anual. Cancele quando quiser."}</div>
          ) : (
            <div className="mt-1 text-xs text-white/45">Cobrança recorrente. Cancele quando quiser.</div>
          )}
        </div>

        <ul className="mt-6 space-y-2.5 text-sm text-white/70 flex-1">
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
              selected ? "bg-red-600 text-white" : "bg-white/10 text-white group-hover:bg-white/15"
            )}
          >
            {selected ? "Continuar" : "Selecionar"}
          </div>
        </div>

        {isRecommended ? <div className="pointer-events-none absolute inset-0 rounded-3xl ring-2 ring-red-500/25" /> : null}
      </div>
    </button>
  );
}

export default function Landing() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("ouro");
  const selectedPlan = useMemo(() => PLANS.find((p) => p.key === plan), [plan]);

  // ✅ mensal/anual
  const [billingCycle, setBillingCycle] = useState("mensal"); // "mensal" | "anual"

  const [scrolled, setScrolled] = useState(false);
  const tvYoutubeId = marketingConfig.tv.youtubeId;
  const tvYoutubeSrc = `https://www.youtube.com/embed/${encodeURIComponent(tvYoutubeId)}?rel=0&modestbranding=1`;

  useEffect(() => {
    const getY = (e) => {
      const yWin = window.scrollY ?? document.documentElement.scrollTop ?? document.body.scrollTop ?? 0;
      const t = e?.target;
      const yTarget = t && typeof t.scrollTop === "number" ? t.scrollTop : 0;
      return Math.max(yWin, yTarget);
    };

    const onScroll = (e) => {
      const y = getY(e);
      setScrolled(y > 10);
    };

    onScroll();

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  function goCheckout(planOverride) {
    const planKey = planOverride || plan;

    const emailParam = email ? `&email=${encodeURIComponent(email)}` : "";
    nav(`/signup?step=1&plan=${planKey}&cycle=${billingCycle}${emailParam}`);
  }

  function onSubmit(e) {
    e.preventDefault();
    goCheckout();
  }

  return (
    <div className="min-h-[100vh] bg-black text-white cs-landing">
      <PageTitle title="Cinesuper - assistir a séries e filmes online" />

      {/* Topbar */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div
          className={cx(
            "transition-colors duration-200",
            scrolled ? "bg-black/90 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.55)]" : "bg-transparent"
          )}
        >
          <div className="mx-auto max-w-[1400px] px-5 sm:px-6 lg:px-10 xl:px-14 h-16 flex items-center justify-between">
            {/* ✅ Logo clicável: volta para / */}
            <Link to="/" className="inline-flex items-center" aria-label="Voltar ao início">
              <img src={Logo} alt="CineSuper" className="h-12 w-auto select-none" draggable={false} />
            </Link>

            <Link to="/login" className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 active:scale-[0.99]">
              Entrar
            </Link>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* HERO */}
        <section className="relative min-h-[78vh] w-full">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${BgLogin})` }} />
            <div className="absolute inset-0 bg-black/70" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/55 to-black" />
          </div>

          <Container className="mx-auto max-w-[1400px] px-5 sm:px-6 lg:px-10 xl:px-14">
            <div className="relative pt-28 md:pt-32 pb-14 md:pb-20">
              <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] items-center">
                <div className="w-full">
                  <div className="max-w-[520px] xl:max-w-[560px] mx-auto lg:mx-0">
                    <div className="rounded-3xl border border-white/10 bg-black/40 overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
                      <div className="aspect-video w-full">
                        <iframe
                          className="h-full w-full"
                          src={tvYoutubeSrc}
                          title="CineSuper TV"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-white/55">Preview do app na TV.</div>
                  </div>
                </div>

                <div className="max-w-2xl text-left">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs text-white/75">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    Streaming nacional • Sem anúncios
                  </div>

                  <h1 className="mt-4 text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-tight">
                    Assista onde quiser. Entre agora ou crie sua conta.
                  </h1>

                  <div className="mt-4 text-base md:text-lg text-white/70">
                    Planos flexíveis, Pix mensal ou cartão recorrente. Qualidade adaptada ao seu plano e ao título.
                  </div>

                  <form onSubmit={onSubmit} className="mt-8 rounded-3xl border border-white/10 bg-white/[0.08] backdrop-blur-md p-4 md:p-5 text-left">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center">
                      <div className="flex-1">
                        <label className="text-xs text-white/60">Email</label>
                        <input
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Email"
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-sm outline-none focus:border-white/25"
                        />
                        <div className="mt-2 text-xs text-white/45">Informe seu email para criar ou reiniciar sua assinatura.</div>
                      </div>

                      <div className="flex md:block">
                        <button
                          type="submit"
                          className="w-full md:w-auto rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500 active:scale-[0.99]"
                        >
                          Assinar agora →
                        </button>
                      </div>
                    </div>
                  </form>

                  <div className="mt-4 text-sm text-white/65">
                    <span className="text-white/90 font-semibold">Prata:</span> {marketingConfig.plans.prata.price} •{" "}
                    <span className="text-white/90 font-semibold">Ouro:</span> {marketingConfig.plans.ouro.price} •{" "}
                    <span className="text-white/90 font-semibold">Diamante:</span> {marketingConfig.plans.diamante.price}
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>

        {/* TV */}
        <SectionShell className="py-12">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-6 md:p-7">
              <div className="text-xs font-semibold tracking-widest text-red-500/90">CINESUPER NA TV</div>
              <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight">Baixe o app para TV</h2>

              <div className="mt-4 flex items-center gap-3">
                <div className="h-10 w-10 flex items-center justify-center">
                  <img src={DownloaderLogo} alt="Downloader" className="h-8 w-8" draggable={false} />
                </div>
                <div className="text-sm text-white/70">
                  Use o app <span className="text-white/90 font-semibold">Downloader</span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 px-5 py-4">
                <div className="text-xs text-white/55">Código do Downloader</div>
                <div className="mt-1 text-3xl md:text-4xl font-black tracking-wider text-white">
                  {marketingConfig.tv.downloaderCode}
                </div>
                <div className="mt-2 text-xs text-white/45">Digite esse código no Downloader para baixar o app.</div>
              </div>

              <ol className="mt-4 space-y-2 text-sm text-white/70">
                <li>1) Abra o Downloader na sua TV.</li>
                <li>
                  2) Digite o código <b className="text-white/85">{marketingConfig.tv.downloaderCode}</b>.
                </li>
                <li>3) Permita instalação de fontes desconhecidas quando solicitado.</li>
                <li>4) Abra o app e entre com sua conta.</li>
              </ol>

              <a
                href={marketingConfig.tv.apkUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex rounded-xl bg-white text-black px-5 py-3 text-sm font-semibold hover:bg-white/90"
              >
                Baixar APK direto →
              </a>
              <div className="mt-3 text-xs text-white/45">* Link direto para Android TV/Fire TV.</div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-6 md:p-7">
              <div className="text-xs font-semibold tracking-widest text-red-500/90">COMPATIBILIDADE</div>
              <h3 className="mt-2 text-2xl md:text-3xl font-black tracking-tight">Estamos em processo</h3>
              <div className="mt-4 text-sm text-white/70 leading-relaxed">
                Hoje o CineSuper funciona em Android TV e em dispositivos que transformam a TV em Android
                (como Firestick e similares). Estamos trabalhando para suportar mais modelos e sistemas em breve.
              </div>
            </div>
          </div>
        </SectionShell>

        <Divider />

        {/* FEATURE ROWS */}
        <SectionShell id="planos" className="py-14">
          <FeatureRow
            title="Assista onde quiser"
            desc="TV, notebook, celular ou tablet. A experiência ajusta a qualidade conforme seu plano, título e conexão."
            bullets={["Acesso em dispositivos compatíveis", "Qualidade depende do plano e do conteúdo (quando disponível)", "Sem anúncios para interromper"]}
            images={CATALOG_ASSISTA}
          />
        </SectionShell>

        <Divider />

        <SectionShell className="py-14">
          <FeatureRow
            flipped
            title="Perfis para a família"
            desc="Cada pessoa com sua lista e histórico. Mantém a experiência organizada em uma única conta."
            bullets={["Perfis por conta (varia por plano)", "Mais controle na escolha do que assistir", "Experiência consistente em todos os dispositivos"]}
            images={CATALOG_PERFIS}
          />
        </SectionShell>

        <Divider />

        {/* PLANOS */}
        <SectionShell className="py-14">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs font-semibold tracking-widest text-red-500/90">PLANOS</div>
              <h2 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Escolha o plano ideal</h2>
              <div className="mt-2 text-sm text-white/60">Sem anúncios e sem download. Cartão via Stripe ou Pix via Mercado Pago.</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md px-4 py-3 text-sm text-white/70">
              Selecionado: <b className="text-white/90">{selectedPlan?.name}</b>
              <div className="text-xs text-white/45 mt-1">* 4K e 5.1 dependem do título e do dispositivo (quando disponível).</div>
            </div>
          </div>

          {/* ✅ Toggle Mensal/Anual */}
          <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-white/60">Escolha a forma de cobrança:</div>

            <div className="inline-flex rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-1">
              <button
                type="button"
                onClick={() => setBillingCycle("mensal")}
                className={cx(
                  "px-4 py-2 text-sm font-semibold rounded-xl transition",
                  billingCycle === "mensal" ? "bg-white text-black" : "text-white/80 hover:bg-white/10"
                )}
              >
                Mensal
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("anual")}
                className={cx(
                  "px-4 py-2 text-sm font-semibold rounded-xl transition",
                  billingCycle === "anual" ? "bg-white text-black" : "text-white/80 hover:bg-white/10"
                )}
              >
                Anual
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {PLANS.map((p) => (
              <PlanCard
                key={p.key}
                plan={p}
                selected={plan === p.key}
                onSelect={setPlan}
                onContinue={(planKey) => goCheckout(planKey)}
                billingCycle={billingCycle}
              />
            ))}
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md overflow-hidden">
            <div className="px-5 md:px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white/90">Comparar planos</div>
                <div className="text-xs text-white/50">Decida com clareza.</div>
              </div>
              <div className="text-xs text-white/50">* quando disponível</div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left">
                <thead className="bg-black/20">
                  <tr className="text-xs text-white/60">
                    <th className="px-5 md:px-6 py-3 font-semibold">Recurso</th>
                    <th className="px-5 md:px-6 py-3 font-semibold">Prata</th>
                    <th className="px-5 md:px-6 py-3 font-semibold">Ouro</th>
                    <th className="px-5 md:px-6 py-3 font-semibold">Diamante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {PLAN_COMPARE.map((row, i) => (
                    <tr key={i} className="text-sm">
                      <td className="px-5 md:px-6 py-3 text-white/75">{row.label}</td>
                      <td className="px-5 md:px-6 py-3 text-white/85">{row.prata}</td>
                      <td className="px-5 md:px-6 py-3 text-white/85">{row.ouro}</td>
                      <td className="px-5 md:px-6 py-3 text-white/85">{row.diamante}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-5">
            <div className="text-sm text-white/70">
              Pronto para começar? Continue com <b className="text-white/85">{selectedPlan?.name}</b> (
              <b className="text-white/85">{billingCycle === "mensal" ? "Mensal" : "Anual"}</b>).
            </div>
            <button
              type="button"
              onClick={() => goCheckout()}
              className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500 active:scale-[0.99]"
            >
              Continuar →
            </button>
          </div>
        </SectionShell>

        <Divider />

        {/* BENEFÍCIOS */}
        <SectionShell className="py-14">
          <div className="grid gap-4 lg:grid-cols-4">
            {[
              { title: "Assista onde quiser", desc: "Acesse de qualquer lugar. O limite é por telas simultâneas do seu plano." },
              { title: "Perfis por conta", desc: "Crie perfis e mantenha sua experiência organizada por pessoa." },
              { title: "Sem anúncios", desc: "A experiência é direta: você dá play e assiste." },
              { title: "Suporte prioritário", desc: "No Diamante, atendimento com prioridade quando precisar." },
            ].map((b, i) => (
              <div key={i} className="rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-6 hover:bg-white/[0.08] transition">
                <div className="text-lg font-bold text-white/90">{b.title}</div>
                <div className="mt-2 text-sm text-white/60 leading-relaxed">{b.desc}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-xs text-white/45 leading-relaxed">
            Observações: Qualidade (HD/Full HD/4K) depende do plano, do título (quando disponível), do dispositivo e da conexão.
          </div>
        </SectionShell>

        <Divider />

        {/* FAQ */}
        <SectionShell className="py-14">
          <div className="text-xs font-semibold tracking-widest text-red-500/90">DÚVIDAS</div>
          <h3 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Perguntas frequentes</h3>

          <div className="mt-6">
            <Accordion items={FAQ} />
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-white/70">Quer começar agora? Selecione um plano e avance para o checkout.</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goCheckout()}
                className="rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500 active:scale-[0.99]"
              >
                Assinar agora →
              </button>
              <Link to="/login" className="rounded-xl bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15">
                Entrar
              </Link>
            </div>
          </div>
        </SectionShell>

        <Footer />
      </main>
    </div>
  );
}
