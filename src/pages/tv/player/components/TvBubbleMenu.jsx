// src/pages/tv/player/components/TvBubbleMenu.jsx
import React, { useEffect } from "react";
import { UI, s } from "../uiScale.js";
import { cx } from "../../_tvKeys.js";

export default function TvBubbleMenu({ open, title, items, focusIndex, setItemRef, onPick }) {
  // ✅ Hook sempre executa (mesmo se open=false)
  useEffect(() => {
    if (!open) return;
    const el = setItemRef?.current?.[focusIndex];
    if (el && typeof el.scrollIntoView === "function") {
      try {
        el.scrollIntoView({ block: "nearest" });
      } catch {}
    }
  }, [open, focusIndex, setItemRef]);

  // ✅ early return só depois dos hooks
  if (!open) return null;

  const list = Array.isArray(items) ? items : [];

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 bottom-full z-[90]"
      style={{ marginBottom: s(12), width: "min(760px, 92vw)" }}
    >
      <div className="relative rounded-1xl border border-white/10 bg-zinc-950/95 shadow-2xl overflow-visible">
        <div className="border-b border-white/10 flex items-center justify-between" style={{ padding: s(14) }}>
          <div className="text-white/85 font-extrabold tracking-[0.18em]" style={{ fontSize: s(UI.meta) }}>
            {title}
          </div>
          <div className="text-white/45 font-semibold" style={{ fontSize: s(UI.meta) }}>
            ↑↓ OK • Back
          </div>
        </div>

        <div className="cs-no-scrollbar" style={{ maxHeight: "36vh", overflowY: "auto", overflowX: "hidden" }}>
          {list.length ? (
            <div style={{ padding: s(10) }}>
              {list.map((it, idx) => {
                const focused = idx === focusIndex;
                return (
                  <button
                    key={it.key || it.id || idx}
                    ref={(el) => {
                      if (!setItemRef.current) setItemRef.current = [];
                      setItemRef.current[idx] = el;
                    }}
                    tabIndex={focused ? 0 : -1}
                    onClick={() => onPick?.(it, idx)}
                    className={cx(
                      "w-full text-left outline-none transition rounded-1xl",
                      focused ? "bg-white/10 ring-2 ring-white/70" : "hover:bg-white/5"
                    )}
                    style={{ padding: s(14), display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(12) }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-white/92 font-extrabold" style={{ fontSize: s(UI.title) }}>
                        {String(it?.label ?? it?.title ?? it?.name ?? "")}
                      </div>
                      {it?.sub ? (
                        <div className="mt-1 text-white/45" style={{ fontSize: s(UI.meta) }}>
                          {it.sub}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-white/80 font-extrabold" style={{ fontSize: s(UI.title) }}>
                      {it?.right || ""}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-white/60" style={{ padding: s(16), fontSize: s(UI.meta) }}>
              Nenhum item.
            </div>
          )}
        </div>

        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            bottom: -s(10),
            width: 0,
            height: 0,
            borderLeft: `${s(10)}px solid transparent`,
            borderRight: `${s(10)}px solid transparent`,
            borderTop: `${s(10)}px solid rgba(9,9,11,0.95)`,
            filter: "drop-shadow(0 6px 14px rgba(0,0,0,.35))",
          }}
        />
      </div>
    </div>
  );
}
