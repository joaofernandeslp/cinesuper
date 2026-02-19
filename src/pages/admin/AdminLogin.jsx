// src/pages/admin/AdminLogin.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "../../components/layout/TopNav.jsx";
import Footer from "../../components/layout/Footer.jsx";
import Container from "../../components/layout/Container.jsx";
import { supabase } from "../../lib/supabaseClient.js";

export default function AdminLogin() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) nav("/admin/dashboard", { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onLogin(e) {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(email).trim(),
        password: String(pass),
      });
      if (error) throw error;
      nav("/admin/dashboard", { replace: true });
    } catch (e2) {
      setMsg(e2?.message || "Falha no login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-black text-white">
      <TopNav />
      <main className="pt-16">
        <Container>
          <div className="py-10 max-w-lg">
            <div className="text-xs font-semibold tracking-widest text-yellow-400/90">ADMIN</div>
            <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Painel Cine Super</h1>
            <p className="mt-3 text-sm text-white/70">
              Faça login para publicar títulos e sincronizar metadados via TMDB.
            </p>

            <form onSubmit={onLogin} className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6">
              <label className="block text-sm text-white/80">E-mail</label>
              <input
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3 text-sm outline-none focus:border-white/25"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@dominio.com"
                autoComplete="email"
              />

              <label className="mt-4 block text-sm text-white/80">Senha</label>
              <input
                type="password"
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-3 text-sm outline-none focus:border-white/25"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />

              {msg ? (
                <div className="mt-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {msg}
                </div>
              ) : null}

              <button
                disabled={loading}
                className={`mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold ${
                  loading ? "bg-white/30 text-black/70" : "bg-white text-black hover:bg-white/90"
                }`}
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>

              <div className="mt-3 text-xs text-white/50">
                Dica: controle quem pode acessar via <code className="text-white/70">VITE_ADMIN_EMAILS</code>.
              </div>
            </form>
          </div>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
