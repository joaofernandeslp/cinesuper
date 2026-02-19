// src/pages/tv/player/components/TvPinPad.jsx
import React from "react";
import { Lock, X } from "lucide-react";

import { UI, s } from "../uiScale.js";
import { cx } from "../../_tvKeys.js";

export default function TvPinPad({
  open,
  profileName,
  reasonText,
  pinValue,
  setPinValue,
  errorText,
  focusIndex,
  setKeyRef,
  onSubmit,
  onClose,
}) {
  if (!open) return null;

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "LIMPAR", "0", "OK"];
  const masked = pinValue ? "•".repeat(pinValue.length) : "";

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center"
      style={{
        paddingLeft: s(UI.panelPadX),
        paddingRight: s(UI.panelPadX),
        paddingTop: s(UI.panelPadY),
        paddingBottom: s(UI.panelPadY),
      }}
    >
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden">
        <div
          className="border-b border-white/10 flex items-start justify-between gap-4"
          style={{
            paddingLeft: s(UI.panelHeaderPadX),
            paddingRight: s(UI.panelHeaderPadX),
            paddingTop: s(UI.panelHeaderPadY),
            paddingBottom: s(UI.panelHeaderPadY),
          }}
        >
          <div className="min-w-0">
            <div className="font-semibold tracking-widest text-yellow-400/90" style={{ fontSize: s(UI.meta) }}>
              CONTEÚDO BLOQUEADO
            </div>
            <div className="mt-1 text-white/75" style={{ fontSize: s(UI.meta) }}>
              {reasonText}
            </div>
            <div className="mt-3 text-white/70" style={{ fontSize: s(UI.meta) }}>
              Perfil: <span className="text-white/90 font-extrabold">{profileName || "—"}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="shrink-0 inline-flex items-center gap-2 rounded-2xl bg-white/10 text-white hover:bg-white/15 outline-none border border-white/10"
            style={{
              paddingLeft: s(16),
              paddingRight: s(16),
              paddingTop: s(10),
              paddingBottom: s(10),
              fontSize: s(UI.listHint),
            }}
          >
            <X style={{ width: s(18), height: s(18) }} />
            Fechar
          </button>
        </div>

        <div style={{ padding: s(UI.panelBodyPad) }}>
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5" style={{ paddingLeft: s(16), paddingRight: s(16), paddingTop: s(12), paddingBottom: s(12) }}>
              <Lock style={{ width: s(20), height: s(20) }} className="text-white/80" />
              <div>
                <div className="text-white/55" style={{ fontSize: s(UI.meta) }}>
                  PIN
                </div>
                <div className="font-extrabold tracking-widest text-white/90" style={{ fontSize: s(UI.pinMask), minWidth: s(120) }}>
                  {masked || "—"}
                </div>
              </div>
            </div>

            {errorText ? (
              <div className="text-red-200" style={{ fontSize: s(UI.meta) }}>
                {errorText}
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3" style={{ maxWidth: s(520) }}>
            {keys.map((k, idx) => {
              const focused = idx === focusIndex;
              const isOk = k === "OK";
              const isClear = k === "LIMPAR";

              return (
                <button
                  key={k}
                  ref={(el) => setKeyRef(idx, el)}
                  tabIndex={focused ? 0 : -1}
                  onClick={() => {
                    if (k === "OK") onSubmit();
                    else if (k === "LIMPAR") setPinValue("");
                    else setPinValue((prev) => String(prev || "").concat(k).replace(/\D/g, "").slice(0, 6));
                  }}
                  className={cx(
                    "rounded-2xl border outline-none font-extrabold transition",
                    isOk ? "bg-white text-black border-white/20" : "bg-white/10 text-white border-white/12",
                    isClear ? "bg-white/8" : "",
                    focused ? "ring-4 ring-white/90 scale-[1.01]" : "hover:bg-white/15"
                  )}
                  style={{ height: s(UI.pinKeyH), fontSize: s(UI.pinKeyText) }}
                >
                  {k}
                </button>
              );
            })}
          </div>

          <div className="mt-5 text-white/45" style={{ fontSize: s(UI.meta) }}>
            Dicas: ↑↓←→ para navegar • OK para selecionar • Back para sair
          </div>
        </div>
      </div>
    </div>
  );
}
