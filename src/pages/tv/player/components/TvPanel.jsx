// src/pages/tv/player/components/TvPanel.jsx
import React from "react";
import { UI, s } from "../uiScale.js";

export default function TvPanel({ open, title, subtitle, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/55">
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          paddingLeft: s(UI.panelPadX),
          paddingRight: s(UI.panelPadX),
          paddingTop: s(UI.panelPadY),
          paddingBottom: s(UI.panelPadY),
        }}
      >
        <div className="w-full max-w-5xl rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl overflow-hidden">
          <div
            className="border-b border-white/10"
            style={{
              paddingLeft: s(UI.panelHeaderPadX),
              paddingRight: s(UI.panelHeaderPadX),
              paddingTop: s(UI.panelHeaderPadY),
              paddingBottom: s(UI.panelHeaderPadY),
            }}
          >
            <div className="font-semibold tracking-widest text-yellow-400/90" style={{ fontSize: s(UI.meta) }}>
              {title}
            </div>
            {subtitle ? (
              <div className="mt-1 text-white/75" style={{ fontSize: s(UI.meta) }}>
                {subtitle}
              </div>
            ) : null}
          </div>

          <div style={{ padding: s(UI.panelBodyPad) }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
