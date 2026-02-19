import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { QRCodeCanvas } from "qrcode.react";
import Logo from "../../assets/Logo.png";

// ✅ imagem fixa
import Bg1 from "../../assets/tv/signup-bg/1.jpg";

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

function TvBtn({ focusKey, onEnter, children, variant = "secondary", className }) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => onEnter?.(),
  });

  const handleClick = () => onEnter?.();
  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEnter?.();
    }
  };

  const base =
    "outline-none rounded-2xl px-7 py-4 text-lg font-semibold " +
    "transition duration-150 will-change-transform select-none";

  const styles =
    variant === "primary"
      ? "bg-white text-black hover:bg-white/95"
      : "bg-white/10 text-white border border-white/15 hover:bg-white/15";

  return (
    <button
      ref={ref}
      tabIndex={-1}
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cx(
        base,
        styles,
        focused ? "ring-4 ring-white/80 scale-[1.02]" : "scale-100",
        className
      )}
    >
      {children}
    </button>
  );
}

function Pill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/10 border border-white/15 px-4 py-2">
      {children}
    </span>
  );
}

export default function SignupTv() {
  const nav = useNavigate();

  const AFTER_SIGNUP_ROUTE = "/login";
  const SIGNUP_URL = "https://cinesuper.com.br/";

  const { ref, focusKey, focusSelf } = useFocusable({
    focusKey: "signup-tv",
    isFocusBoundary: true,
    trackChildren: true,
    preferredChildFocusKey: "signup-tv:done",
  });

  useEffect(() => {
    const id = requestAnimationFrame(() => focusSelf());
    return () => cancelAnimationFrame(id);
  }, [focusSelf]);

  return (
    <div className="w-full h-full text-white bg-black overflow-hidden relative">
      {/* ✅ Background único e fixo */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${Bg1})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "contrast(1.10) brightness(0.55) blur(1px)",
          transform: "scale(1.12)", // leve punch para TVs/overscan
          willChange: "transform",
        }}
      />

      {/* overlays */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-black/92" />
      <div className="absolute inset-0 bg-[radial-gradient(900px_520px_at_50%_18%,rgba(255,255,255,0.07),transparent_60%)]" />

      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className="relative tv-safe">
          <div className="flex items-center justify-between">
            <img src={Logo} alt="CineSuper" className="h-20 w-auto select-none" draggable={false} />
            <div className="text-xs text-white/60 tracking-widest">TV</div>
          </div>

          <div className="mt-4">
            <h1 className="text-3xl font-black leading-tight">Crie sua conta no CineSuper</h1>
            <p className="mt-2 text-white/75 text-base leading-relaxed max-w-3xl">
              Use o celular ou PC para cadastrar. Aponte a câmera para o QR Code e finalize rápido.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-12 gap-6 items-stretch">
            <div className="col-span-7 row-start-1 h-full rounded-3xl border border-white/15 bg-white/10 p-5">
              <div className="text-xs text-white/70 tracking-wider uppercase">Como funciona</div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-black/30 border border-white/10 p-3">
                  <div className="text-xl font-black">1</div>
                  <div className="mt-1 font-semibold">Escaneie</div>
                  <div className="mt-1 text-xs text-white/70">Aponte para o QR Code.</div>
                </div>

                <div className="rounded-2xl bg-black/30 border border-white/10 p-3">
                  <div className="text-xl font-black">2</div>
                  <div className="mt-1 font-semibold">Cadastre</div>
                  <div className="mt-1 text-xs text-white/70">Crie a conta e escolha o plano.</div>
                </div>

                <div className="rounded-2xl bg-black/30 border border-white/10 p-3">
                  <div className="text-xl font-black">3</div>
                  <div className="mt-1 font-semibold">Volte para a TV</div>
                  <div className="mt-1 text-xs text-white/70">Faça login e assista.</div>
                </div>
              </div>
            </div>

            <div className="col-span-5 row-start-1 h-full rounded-3xl border border-white/15 bg-white/10 p-5 flex flex-col">
              <div className="text-xs text-white/70 tracking-wider uppercase">Cadastro</div>

              <div className="mt-3 flex items-center gap-4">
                <div className="shrink-0 rounded-2xl bg-white p-3">
                  <QRCodeCanvas value={SIGNUP_URL} size={210} includeMargin={true} level="M" />
                </div>

                <div className="min-w-0">
                  <div className="text-base font-semibold">Aponte a câmera</div>
                  <div className="mt-1 text-sm text-white/70">Finalize no celular/PC.</div>

                  <div className="mt-3">
                    <div className="text-[11px] text-white/50 uppercase tracking-wider">Link</div>
                    <div className="mt-1 font-mono text-xs text-white/80 break-all">{SIGNUP_URL}</div>
                  </div>
                </div>
              </div>

              <div className="flex-1" />

              <div className="h-px bg-white/10" />
              <div className="pt-3 text-[11px] text-white/55 leading-relaxed">
                Se preferir, digite o link no navegador do celular/PC.
              </div>
            </div>

            <div className="col-span-7 row-start-2 h-full rounded-3xl border border-white/15 bg-white/10 p-5">
              <div className="text-xs text-white/70 tracking-wider uppercase">Promoção limitada</div>

              <div className="mt-2 text-lg font-semibold leading-snug">
                Promo para os primeiros 100 assinantes por 3 meses.
                <span className="text-white/70 font-normal"> Depois renova no valor padrão.</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Pill>
                  <span className="text-white/70 mr-2">Prata:</span> <b>R$ 13,90</b>
                </Pill>
                <Pill>
                  <span className="text-white/70 mr-2">Ouro:</span> <b>R$ 17,90</b>
                </Pill>
                <Pill>
                  <span className="text-white/70 mr-2">Diamante:</span> <b>R$ 21,90</b>
                </Pill>
              </div>
            </div>

            <div className="col-span-5 row-start-2 h-full rounded-3xl bg-white/5 border border-white/10 p-5">
              <div className="text-sm font-semibold">Depois do cadastro</div>
              <div className="mt-2 text-sm text-white/70 leading-relaxed">
                Volte para a TV e selecione <b>“Já fiz o cadastro”</b> para entrar.
              </div>

              <div className="mt-4 rounded-2xl bg-black/30 border border-white/10 p-4">
                <div className="text-[11px] text-white/60 uppercase tracking-wider">Dica</div>
                <div className="mt-2 text-sm text-white/75">Use as setas do controle e depois Enter.</div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-12 gap-6 items-center">
            <div className="col-span-7">
              <div className="flex gap-4 items-center">
                <TvBtn
                  focusKey="signup-tv:done"
                  variant="primary"
                  onEnter={() => nav(AFTER_SIGNUP_ROUTE, { replace: true })}
                  className="min-w-[280px]"
                >
                  Já fiz o cadastro
                </TvBtn>

                <TvBtn
                  focusKey="signup-tv:back"
                  onEnter={() => nav("/welcome", { replace: true })}
                  className="min-w-[200px]"
                >
                  Voltar
                </TvBtn>
              </div>
            </div>

            <div className="col-span-5" />
          </div>
        </div>
      </FocusContext.Provider>
    </div>
  );
}
