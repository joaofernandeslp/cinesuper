import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import PageTitle from "../components/PageTitle.jsx";
import Logo from "../assets/Logo.png";
import { ArrowLeft } from "lucide-react";

function onlyDigits(s) {
  return String(s || "").replace(/\D+/g, "").slice(0, 6);
}

export default function TvPairWeb() {
  const nav = useNavigate();

  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setBooting(true);
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        setSession(data?.session ?? null);
      } finally {
        if (!alive) return;
        setBooting(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => {
      setSession(s ?? null);
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const loggedIn = !!session?.user?.id;

  useEffect(() => {
    if (booting) return;
    if (!loggedIn) {
      nav(`/login?next=${encodeURIComponent("/tv")}`, { replace: true });
    }
  }, [booting, loggedIn, nav]);

  const canSubmit = useMemo(() => /^\d{6}$/.test(code), [code]);

  async function submit() {
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const s = data?.session;
      if (!s?.user?.id) throw new Error("Faça login primeiro.");

      const refreshToken = s.refresh_token;
      if (!refreshToken) throw new Error("Sessão sem refresh_token.");

      const { data: res, error } = await supabase.functions.invoke("tv-pairing-claim", {
        body: { code, refreshToken },
      });

      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || "Falha ao conectar.");

      setMsg("TV conectada com sucesso. Volte para a TV.");
    } catch (e) {
      setErr(e?.message || "Erro ao conectar.");
    } finally {
      setLoading(false);
    }
  }

  function goBackToBrowse() {
    nav("/browse");
  }

  return (
    <div className="min-h-[100vh] bg-black text-white px-6 py-10">
      <PageTitle title="Conectar TV" />

      {/* Barra do topo (full width) com botão à esquerda */}
      <div className="w-full">
        <button
          type="button"
          onClick={goBackToBrowse}
          className="
            inline-flex items-center gap-2 rounded-xl
            border border-white/10 bg-white/0
            px-3 py-2 text-sm text-white/80
            hover:bg-white/10 hover:text-white
            transition
          "
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>

      {/* Conteúdo central */}
      <div className="flex items-center justify-center mb-8 mt-6">
        <img src={Logo} alt="CineSuper" className="h-14 w-auto select-none" draggable={false} />
      </div>

      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-black">Conectar CineSuper TV</h1>
        <p className="mt-2 text-sm text-white/60">Digite o código que está aparecendo na sua TV.</p>

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

        <div className="mt-6">
          <label className="text-xs text-white/60">Código (6 dígitos)</label>
          <input
            value={code}
            onChange={(e) => setCode(onlyDigits(e.target.value))}
            inputMode="numeric"
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-lg tracking-[0.3em] outline-none focus:border-white/30"
            placeholder="000000"
          />
        </div>

        <button
          disabled={!canSubmit || loading}
          onClick={submit}
          className={[
            "mt-4 w-full rounded-xl px-5 py-3 text-sm font-semibold transition",
            !canSubmit || loading
              ? "bg-white/10 text-white/50 cursor-not-allowed"
              : "bg-white text-black hover:bg-white/90",
          ].join(" ")}
        >
          {loading ? "Conectando..." : "Conectar TV"}
        </button>

        <div className="mt-6 text-xs text-white/45">Se precisar de ajuda: https://cinesuper.com.br/contato</div>
      </div>
    </div>
  );
}
