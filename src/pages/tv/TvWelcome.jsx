// src/pages/tv/TvWelcome.jsx
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FocusContext, useFocusable, setFocus } from "@noriginmedia/norigin-spatial-navigation";

import Logo from "../../assets/Logo.png";
import { APP_VERSION } from "../../lib/appVersion.js";

// ✅ fundo fixo (substitui o vídeo do welcome)
import BackLogin from "../../assets/tv/Back_Login.jpg";

function safePadStyle() {
  return { padding: "calc((52px * var(--tv-safe, 1)) / var(--tv-scale, 1))" };
}

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

function TvBtn({ focusKey, variant = "primary", onEnter, children }) {
  const { ref, focused } = useFocusable({
    focusKey,
    onEnterPress: () => onEnter?.(),
  });

  return (
    <button
      ref={ref}
      tabIndex={-1}
      type="button"
      className={cx(
        "w-full outline-none rounded-2xl px-6 py-4 text-2xl font-semibold transition",
        variant === "primary"
          ? "bg-white text-black"
          : "bg-white/10 text-white border border-white/15",
        focused ? "ring-4 ring-white/80" : ""
      )}
    >
      {children}
    </button>
  );
}

export default function TvWelcome() {
  const nav = useNavigate();

  const { ref, focusKey, focusSelf } = useFocusable({
    focusKey: "tv-welcome",
    isFocusBoundary: true,
    saveLastFocusedChild: true,
    trackChildren: true,
  });

  useEffect(() => {
    const t = setTimeout(() => {
      focusSelf();
      setFocus("tv-welcome:enter");
    }, 0);
    return () => clearTimeout(t);
  }, [focusSelf]);

  const bgStyle = useMemo(
    () => ({
      backgroundImage: `url(${BackLogin})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      filter: "brightness(0.9)",
      transform: "scale(1.02)",
    }),
    []
  );

  return (
    <div className="w-full h-full bg-black text-white relative overflow-hidden">
      <FocusContext.Provider value={focusKey}>
        <div ref={ref} className="w-full h-full">
          {/* ✅ BACKGROUND IMAGE (substitui o vídeo) */}
          <div className="absolute inset-0" style={bgStyle} />

          {/* Overlay para legibilidade (Netflix-like) */}
          <div className="absolute inset-0 bg-black/10" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg," +
                "rgba(0,0,0,0.84) 0%," +
                "rgba(0,0,0,0.78) 36%," +
                "rgba(0,0,0,0.55) 55%," +
                "rgba(0,0,0,0.22) 70%," +
                "rgba(0,0,0,0.00) 82%)",
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(1200px 700px at 30% 15%, rgba(255,255,255,0.10), rgba(0,0,0,0) 60%), " +
                "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 35%, rgba(0,0,0,0.35) 100%)",
            }}
          />

          {/* Conteúdo */}
          <div className="absolute inset-0 flex flex-col" style={safePadStyle()}>
            <div className="flex items-center justify-between">
              <img src={Logo} alt="CineSuper" className="h-20 w-auto" draggable={false} />
              <div className="text-xs text-white/60">{APP_VERSION}</div>
            </div>

            <div className="flex-1 flex items-center">
              <div className="max-w-3xl">
                <h1 className="text-6xl font-black tracking-tight">Bem-vindo ao CineSuper</h1>
                <div className="mt-3 text-xl text-white/70">
                  Assista onde quiser. Entre agora ou crie sua conta.
                </div>
              </div>
            </div>

            <div className="w-full max-w-xl">
              <div className="grid gap-3">
                <TvBtn
                  focusKey="tv-welcome:enter"
                  variant="primary"
                  onEnter={() => nav("/login", { replace: true })}
                >
                  Entrar
                </TvBtn>

                <TvBtn
                  focusKey="tv-welcome:signup"
                  variant="secondary"
                  onEnter={() => nav("/signup-tv", { replace: true })}
                >
                  Criar conta
                </TvBtn>
              </div>

              <div className="mt-4 text-base text-white/55">
                Use as setas do controle para navegar e OK para confirmar.
              </div>
            </div>
          </div>
        </div>
      </FocusContext.Provider>
    </div>
  );
}
