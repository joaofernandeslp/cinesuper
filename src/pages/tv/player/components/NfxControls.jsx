// src/pages/tv/player/components/NfxControls.jsx
import React from "react";
import { Check, SkipForward } from "lucide-react";

import { UI, s } from "../uiScale.js";
import { cx } from "../../_tvKeys.js";
import { fmtTime } from "../../../../player/utils.js";

/* =========================
   UI Components (Netflix-like)
========================= */
const focusFx = (focused) =>
  focused ? "scale-[1.05] ring-2 ring-white/90 shadow-[0_14px_32px_rgba(0,0,0,.55)]" : "";
const disFx = (disabled) => (disabled ? "opacity-35 cursor-not-allowed" : "");

export function NfxIconButton({ refCb, focused, disabled, icon: Icon, onClick, ariaLabel }) {
  return (
    <button
      style={{ width: s(UI.icon), height: s(UI.icon) }}
      ref={refCb}
      type="button"
      tabIndex={focused ? 0 : -1}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={disabled ? undefined : onClick}
      className={cx(
        "outline-none transition-transform duration-150 will-change-transform",
        "rounded-full grid place-items-center",
        "bg-white/10 border border-white/15 text-white/95",
        focusFx(focused),
        disFx(disabled)
      )}
    >
      {Icon ? <Icon style={{ width: s(UI.iconI), height: s(UI.iconI) }} /> : null}
    </button>
  );
}

export function NfxPillButton({ refCb, focused, disabled, icon: Icon, label, onClick }) {
  return (
    <button
      style={{
        height: s(UI.pillH),
        paddingLeft: s(UI.pillPx),
        paddingRight: s(UI.pillPx),
        fontSize: s(UI.pillText),
      }}
      ref={refCb}
      type="button"
      tabIndex={focused ? 0 : -1}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={cx(
        "outline-none transition-transform duration-150 will-change-transform",
        "rounded-full inline-flex items-center gap-2",
        "bg-white/10 border border-white/15 text-white/95",
        "font-extrabold uppercase tracking-[0.12em]",
        focusFx(focused),
        disFx(disabled)
      )}
    >
      {Icon ? <Icon style={{ width: s(UI.iconI), height: s(UI.iconI) }} /> : null}
      <span>{label}</span>
    </button>
  );
}

export function NfxPlayButton({ refCb, focused, disabled, icon: Icon, onClick, y }) {
  const yPx = typeof y === "number" ? y : -s(UI.playNudgeUp);
  return (
    <button
      style={{
        width: s(UI.play),
        height: s(UI.play),
        transform: `translateY(${yPx}px)`,
      }}
      ref={refCb}
      type="button"
      tabIndex={focused ? 0 : -1}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={cx(
        "outline-none transition-transform duration-150 will-change-transform",
        "rounded-full grid place-items-center",
        "bg-white/12 border border-white/20 text-white/95",
        focusFx(focused),
        disFx(disabled)
      )}
    >
      {Icon ? <Icon style={{ width: s(UI.playI), height: s(UI.playI) }} /> : null}
    </button>
  );
}

export function NfxSpinner({ label }) {
  const size = s(84);
  const thick = Math.max(2, s(8));

  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center">
      <style>{`
        @keyframes cs-spin { to { transform: rotate(360deg); } }
      `}</style>

      <span className="sr-only">{label || "Carregando…"}</span>

      <div
        style={{
          width: size,
          height: size,
          borderRadius: 9999,
          border: `${thick}px solid rgba(255,255,255,0.14)`,
          borderTopColor: "#e50914",
          animation: "cs-spin 0.9s linear infinite",
          boxShadow: "0 10px 26px rgba(0,0,0,.55)",
        }}
      />
    </div>
  );
}

export function NfxChip({ refCb, focused, selected, disabled, label, onClick, isIcon }) {
  return (
    <button
      style={{
        height: s(UI.chipH),
        paddingLeft: s(UI.chipPx),
        paddingRight: s(UI.chipPx),
        fontSize: s(UI.chipText),
      }}
      ref={refCb}
      type="button"
      tabIndex={focused ? 0 : -1}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={cx(
        "outline-none transition-transform duration-150 will-change-transform",
        "rounded-full inline-flex items-center gap-2 whitespace-nowrap",
        selected ? "bg-white text-black border border-white/90" : "bg-white/12 text-white/95 border border-white/15",
        "font-extrabold",
        focusFx(focused),
        disFx(disabled)
      )}
      aria-label={String(label || "").replace("⚙", "Configurações")}
    >
      <span style={isIcon ? { fontSize: s(UI.chipIcon), lineHeight: 1, display: "block" } : undefined} className={cx(isIcon ? "leading-none" : "")}>
        {label}
      </span>
      {selected ? <Check style={{ width: s(UI.chipCheck), height: s(UI.chipCheck) }} /> : null}
    </button>
  );
}

// Botão "Próximo episódio" (canto inferior direito)
export function NfxNextUpCornerButton({ refCb, focused, disabled, remainingSec, onClick }) {
  const h = s(66);
  const px = s(18);
  const iconBox = s(42);
  const iconI = s(20);

  return (
    <button
      ref={refCb}
      tabIndex={focused ? 0 : -1}
      disabled={disabled}
      type="button"
      onClick={disabled ? undefined : onClick}
      className={cx(
        "outline-none transition-transform duration-150 will-change-transform",
        "rounded-2xl",
        "bg-black/55 border border-white/14 text-white",
        focused ? "ring-4 ring-white/90 scale-[1.02]" : "hover:bg-black/60",
        disabled ? "opacity-35 cursor-not-allowed" : ""
      )}
      style={{
        height: h,
        paddingLeft: px,
        paddingRight: px,
        boxShadow: "0 18px 46px rgba(0,0,0,.55)",
        backdropFilter: "blur(8px)",
      }}
      aria-label="Próximo episódio"
    >
      <div className="flex items-center gap-3">
        <div
          className="rounded-full grid place-items-center"
          style={{
            width: iconBox,
            height: iconBox,
            background: "rgba(255,255,255,0.10)",
            border: "1px solid rgba(255,255,255,0.14)",
          }}
        >
          <SkipForward style={{ width: iconI, height: iconI }} />
        </div>

        <div className="text-left min-w-0">
          <div className="font-extrabold text-white/95" style={{ fontSize: s(13), lineHeight: 1.05 }}>
            Próximo episódio
          </div>
          <div className="text-white/70 font-semibold" style={{ fontSize: s(11), marginTop: s(3) }}>
            Em {fmtTime(Math.max(0, Number(remainingSec || 0)))}
          </div>
        </div>
      </div>
    </button>
  );
}
