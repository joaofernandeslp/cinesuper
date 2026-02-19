// src/pages/Contact.jsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Footer from "../components/layout/Footer.jsx";
import Container from "../components/layout/Container.jsx";
import Logo from "../assets/Logo.png";
import PageTitle from "../components/PageTitle.jsx";
import { marketingConfig } from "../lib/marketingConfig.js";

function buildWhatsAppUrl(phoneE164, text) {
  const base = `https://wa.me/${phoneE164}`;
  const msg = encodeURIComponent(text || "");
  return `${base}?text=${msg}`;
}

export default function Contact() {
  const [subject, setSubject] = useState("Suporte (App/Player)");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [publicId, setPublicId] = useState("");
  const [message, setMessage] = useState("");

  const composed = useMemo(() => {
    const lines = [
      "Olá, preciso de ajuda no CineSuper.",
      "",
      `Assunto: ${subject}`,
      name ? `Nome: ${name}` : null,
      email ? `E-mail: ${email}` : null,
      publicId ? `Título (public_id): ${publicId}` : null,
      "",
      "Descrição:",
      message || "(não informado)",
      "",
      "— Enviado pelo site CineSuper",
    ].filter(Boolean);

    return lines.join("\n");
  }, [subject, name, email, publicId, message]);

  const canSend = (message || "").trim().length >= 5;

  return (
    <div className="min-h-full bg-white text-black">
      <PageTitle title="Contato" />

      {/* Topo preto (logo centralizada) */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/95 backdrop-blur">
        <div className="h-16 flex items-center justify-center px-4">
          <Link to="/" className="inline-flex items-center justify-center">
            <img
              src={Logo}
              alt="CineSuper"
              className="h-10 w-auto select-none"
              draggable={false}
            />
          </Link>
        </div>
      </header>

      {/* Conteúdo branco */}
      <main className="bg-white text-black">
        <Container>
          <div className="mx-auto max-w-2xl py-10 text-center">
            <div className="text-xs font-semibold tracking-widest text-black/70">
              CONTATO
            </div>

            <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-black">
              Fale com a gente
            </h1>

            <p className="mt-3 text-black/70">
              Preencha abaixo e abriremos o WhatsApp com sua mensagem já formatada.
            </p>

            {/* Form */}
            <div className="mt-8 grid gap-4 text-left">
              <div>
                <label className="text-xs text-black/70">Assunto</label>
                <select
                  className="mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm text-black outline-none focus:border-black/30"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option>Suporte (App/Player)</option>
                  <option>Conta e acesso</option>
                  <option>Planos e pagamento</option>
                  <option>Solicitar conteúdo</option>
                  <option>Parcerias / Comercial</option>
                  <option>Outro</option>
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs text-black/70">Nome</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm text-black outline-none focus:border-black/30"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Seu nome"
                  />
                </div>

                <div>
                  <label className="text-xs text-black/70">E-mail</label>
                  <input
                    className="mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm text-black outline-none focus:border-black/30"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    inputMode="email"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-black/70">
                  Título (public_id) (opcional)
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm text-black outline-none focus:border-black/30"
                  value={publicId}
                  onChange={(e) => setPublicId(e.target.value)}
                  placeholder="Ex: mv-00001234"
                />
                <div className="mt-1 text-xs text-black/60">
                  Se for problema em um filme/série específico, informe o public_id.
                </div>
              </div>

              <div>
                <label className="text-xs text-black/70">Mensagem</label>
                <textarea
                  rows={5}
                  className="mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm text-black outline-none focus:border-black/30"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Descreva o que aconteceu e, se possível, informe o dispositivo/navegador."
                />
                <div className="mt-1 text-xs text-black/60">
                  Dica: descreva o erro e quando ocorreu.
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-4">
                <div className="text-xs font-semibold tracking-widest text-black/70">
                  PRÉVIA DA MENSAGEM
                </div>
                <pre className="mt-3 whitespace-pre-wrap text-sm text-black m-0">
                  {composed}
                </pre>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <a
                  href={buildWhatsAppUrl(marketingConfig.whatsappNumberE164, composed)}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center justify-center rounded-xl px-6 py-4 text-sm font-semibold transition ${
                    canSend
                      ? "bg-black text-white hover:bg-black/90"
                      : "bg-black/10 text-black/40 pointer-events-none"
                  }`}
                  title={canSend ? "Abrir WhatsApp com a mensagem" : "Escreva uma mensagem antes"}
                >
                  Enviar no WhatsApp
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setSubject("Suporte (App/Player)");
                    setName("");
                    setEmail("");
                    setPublicId("");
                    setMessage("");
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-4 text-sm font-semibold text-black border border-black/15 hover:bg-black/[0.03]"
                >
                  Limpar
                </button>
              </div>

              <div className="text-center text-xs text-black/60">
                Ao abrir o WhatsApp, você confirma o envio manualmente. Não enviamos mensagens automaticamente.
              </div>
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
}
