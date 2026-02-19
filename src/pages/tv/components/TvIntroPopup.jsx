// src/pages/tv/components/TvIntroPopup.jsx
import React, { useMemo } from "react";
import QRCode from "react-qr-code";
import Logo from "../../../assets/Logo.png";

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

export default function TvIntroPopup({
  open,
  whatsappNumber = "",
  focusIndex = -1, // 0=Entendi
  setBtnRef,
  onClose,
}) {
  const digits = useMemo(() => String(whatsappNumber || "").replace(/\D+/g, ""), [whatsappNumber]);

  const waPretty = useMemo(() => {
    const d = digits;
    if (!d) return "";
    if (d.startsWith("55") && d.length >= 12) {
      const cc = d.slice(0, 2);
      const ddd = d.slice(2, 4);
      const rest = d.slice(4);
      return `+${cc} (${ddd}) ${rest}`;
    }
    return d;
  }, [digits]);

  const waUrl = useMemo(() => {
    if (!digits) return "";
    return `https://wa.me/${digits}`;
    // opcional com mensagem:
    // return `https://wa.me/${digits}?text=${encodeURIComponent("Quero solicitar um título no CineSuper: ")}`;
  }, [digits]);

  if (!open) return null;

  const btnBase =
    "w-full outline-none rounded-2xl px-6 py-4 text-lg font-semibold transition-all duration-150";
  const btnPrimary = (focused) =>
    cx(btnBase, "bg-white text-black", focused ? "ring-4 ring-white/80 scale-[1.02]" : "opacity-90");

  return (
    <div className="fixed inset-0 z-[90]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* modal */}
      <div className="absolute inset-0 flex items-center justify-center p-10">
        {/* ✅ mantém tamanho “original” e deixa preto */}
        <div className="w-[980px] max-w-[92vw] rounded-[28px] border border-white/12 bg-black shadow-2xl">
          <div className="px-10 pt-8 pb-6">
            {/* ✅ logo grande e centralizada, sem caixinha */}
            <img
              src={Logo}
              alt="CineSuper"
              draggable={false}
              className="mx-auto h-16 w-auto opacity-95"
            />

            <div className="mt-5 text-4xl font-extrabold tracking-tight text-center">
              Bem-vindo ao CineSuper
            </div>

            <div className="mt-4 text-xl leading-relaxed text-white/85 text-center">
              Estamos em <span className="text-white font-semibold">constante atualização</span> para entregar a melhor
              experiência. Por isso, nosso catálogo pode parecer{" "}
              <span className="text-white font-semibold">reduzido</span> no momento — estamos{" "}
              <span className="text-white font-semibold">todos os dias adicionando conteúdo novo</span>.
            </div>

            {/* ✅ box principal agora com QR dentro (não mexe no “tamanho geral”) */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-6 py-5">
              <div className="grid grid-cols-[1fr_280px] gap-6 items-start">
                {/* texto */}
                <div>
                  <div className="text-xl font-bold">Você pode ajudar nisso 👇</div>

                  <div className="mt-2 text-lg text-white/85 leading-relaxed">
                    Se quiser um <span className="text-white font-semibold">filme</span> ou{" "}
                    <span className="text-white font-semibold">série</span> no app, mande o nome pelo{" "}
                    <span className="text-white font-semibold">WhatsApp do CineSuper</span>. O título solicitado ficará
                    disponível em <span className="text-white font-semibold">no máximo 30 minutos</span>.
                  </div>

                  {waPretty ? (
                    <div className="mt-3 text-lg text-white/70">
                      WhatsApp: <span className="text-white font-semibold">{waPretty}</span>
                      <div className="mt-1 text-sm text-white/50">
                        Link: <span className="text-white/70 font-semibold">{waUrl}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-lg text-white/60">
                      (Configure o número do WhatsApp no .env para exibir o QR Code.)
                    </div>
                  )}

                  <div className="mt-3 text-sm text-white/45">
                    Dica: se tiver, mande também o <span className="text-white/70 font-semibold">IMDb</span> (tt1234567).
                  </div>
                </div>

                {/* QR */}
                <div className="rounded-2xl border border-white/12 bg-black/40 p-4">
                  <div className="text-xs text-white/60 font-semibold text-center">
                    ESCANEIE COM O CELULAR
                  </div>

                  <div className="mt-3 rounded-2xl bg-white p-3 flex items-center justify-center">
                    {waUrl ? (
                      <QRCode value={waUrl} size={190} />
                    ) : (
                      <div className="h-[190px] w-[190px] flex items-center justify-center text-center text-black/70 font-semibold">
                        QR indisponível
                        <br />
                        (sem número)
                      </div>
                    )}
                  </div>

                  <div className="mt-2 text-[11px] text-white/45 leading-relaxed text-center">
                    Abra a câmera do celular e aponte para o QR.
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ mantém “rodapé original” */}
            <div className="mt-7">
              <button
              ref={(el) => setBtnRef?.(0, el)}
              tabIndex={0}          // ✅ era -1
              autoFocus             // ✅ ajuda em alguns devices
              type="button"
              className={btnPrimary(focusIndex === 0)}
              onClick={() => onClose?.()}
            >
              Entendi
            </button>
            </div>

            <div className="mt-4 text-sm text-white/45 text-center">
              Dica: pressione <span className="text-white/70 font-semibold">BACK</span> para fechar.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
