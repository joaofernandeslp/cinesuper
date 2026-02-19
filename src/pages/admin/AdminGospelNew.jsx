// src/pages/admin/AdminGospelNew.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import TopNav from "../../components/layout/TopNav.jsx";
import Footer from "../../components/layout/Footer.jsx";
import Container from "../../components/layout/Container.jsx";

export default function AdminGospelNew() {
  const nav = useNavigate();
  const [mode, setMode] = useState("course"); // course | movie

  function go() {
    if (mode === "course") {
      nav("/admin/series/new?gospel=1&type=course");
      return;
    }
    nav("/admin/titles/new?gospel=1&type=movie");
  }

  return (
    <div className="min-h-full bg-black text-white">
      <TopNav />

      <main className="pt-16">
        <Container>
          <div className="py-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-widest text-yellow-400/90">ADMIN</div>
                <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Novo Gospel</h1>
                <div className="mt-2 text-sm text-white/60">
                  Escolha o tipo. A categoria <b className="text-white/80">Gospel</b> será aplicada automaticamente.
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  to="/admin/dashboard"
                  className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
                >
                  ← Voltar
                </Link>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="rounded-2xl border border-white/10 bg-white/5 p-5 cursor-pointer hover:bg-white/10">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="gospel-mode"
                    className="h-4 w-4 accent-yellow-400"
                    checked={mode === "course"}
                    onChange={() => setMode("course")}
                  />
                  <div className="text-sm font-semibold text-white/90">Curso (módulos e episódios)</div>
                </div>
                <div className="mt-2 text-xs text-white/60">
                  Abre o editor estilo série, com módulos/episódios e base de R2.
                </div>
              </label>

              <label className="rounded-2xl border border-white/10 bg-white/5 p-5 cursor-pointer hover:bg-white/10">
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="gospel-mode"
                    className="h-4 w-4 accent-yellow-400"
                    checked={mode === "movie"}
                    onChange={() => setMode("movie")}
                  />
                  <div className="text-sm font-semibold text-white/90">Filme / Especial</div>
                </div>
                <div className="mt-2 text-xs text-white/60">
                  Abre o editor de título único (filme).
                </div>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={go}
                className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
              >
                Continuar
              </button>
              <button
                onClick={() => nav("/admin/titles/new?gospel=1&type=movie")}
                className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Ir direto para Filme
              </button>
              <button
                onClick={() => nav("/admin/series/new?gospel=1&type=course")}
                className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
              >
                Ir direto para Curso
              </button>
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
}
