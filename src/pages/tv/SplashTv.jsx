import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../../assets/Logo.png";

export default function SplashTv() {
  const nav = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => nav("/welcome", { replace: true }), 4000);
    return () => clearTimeout(t);
  }, [nav]);

  return (
    <div className="w-full h-full bg-black text-white">
      <div className="w-full h-full grid place-items-center">
        <div className="flex flex-col items-center">
          {/* Logo maior, sem glow */}
          <img
            src={Logo}
            alt="CineSuper"
            className="h-32 w-auto"
            draggable={false}
          />

          {/* Spinner circular vermelho (Netflix-like) */}
          <div className="mt-10 cs-spinner" aria-label="Carregando" />

          <style>{`
            .cs-spinner {
              width: 62px;
              height: 62px;
              border-radius: 9999px;
              border: 6px solid rgba(255, 255, 255, 0.12);
              border-top-color: rgba(229, 9, 20, 0.95);
              border-right-color: rgba(229, 9, 20, 0.35);
              animation: csSpin 0.85s linear infinite;

              position: relative;
              transform: translate3d(0,0,0);
              will-change: transform;
              /* glow leve já no anel */
              filter: drop-shadow(0 0 10px rgba(229, 9, 20, 0.28));
            }

            /* Halo/blur externo (fica mais sofisticado) */
            .cs-spinner::before {
              content: "";
              position: absolute;
              inset: -10px;
              border-radius: 9999px;

              border: 8px solid rgba(229, 9, 20, 0.10);
              border-top-color: rgba(229, 9, 20, 0.55);
              border-right-color: rgba(229, 9, 20, 0.25);

              filter: blur(6px);
              opacity: 0.85;

              animation: csSpin 0.85s linear infinite;
              pointer-events: none;
            }

            /* “ponto” brilhante no topo (dá cara de app premium) */
            .cs-spinner::after {
              content: "";
              position: absolute;
              left: 50%;
              top: -7px;
              width: 10px;
              height: 10px;
              border-radius: 9999px;
              transform: translateX(-50%);
              box-shadow:
                0 0 12px rgba(229, 9, 20, 0.75),
                0 0 26px rgba(229, 9, 20, 0.35);

              opacity: 0.95;
              pointer-events: none;
            }

            @keyframes csSpin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}
