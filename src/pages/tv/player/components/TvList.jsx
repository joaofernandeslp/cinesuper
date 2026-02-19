// src/pages/tv/player/components/TvList.jsx
import React, { useEffect } from "react";
import { UI, s } from "../uiScale.js";
import { cx } from "../../_tvKeys.js";
import { X } from "lucide-react";

export default function TvList({ items, focusIndex, setItemRef, onPick, onClose, hint, renderLeft, renderRight }) {
  useEffect(() => {
    const el = setItemRef?.current?.[focusIndex];
    if (el && typeof el.scrollIntoView === "function") {
      try {
        el.scrollIntoView({ block: "nearest" });
      } catch {}
    }
  }, [focusIndex, setItemRef]);

  const list = Array.isArray(items) ? items : [];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="text-white/60" style={{ fontSize: s(UI.listHint) }}>
          {hint || "Use ↑↓ e OK. Back para fechar."}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-2xl bg-white/10 text-white hover:bg-white/15 outline-none border border-white/10"
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

      <div className="mt-4 max-h-[58vh] overflow-auto rounded-2xl border border-white/10 bg-black/25">
        {list.length ? (
          <div className="divide-y divide-white/10">
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
                    "w-full text-left outline-none transition flex items-center justify-between gap-3",
                    focused ? "bg-white/10 ring-4 ring-white/70" : "hover:bg-white/5"
                  )}
                  style={{
                    paddingLeft: s(UI.listItemPadX),
                    paddingRight: s(UI.listItemPadX),
                    paddingTop: s(UI.listItemPadY),
                    paddingBottom: s(UI.listItemPadY),
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-white/92 font-extrabold truncate" style={{ fontSize: s(UI.title) }}>
                      {renderLeft ? renderLeft(it, idx) : String(it?.label ?? it?.title ?? it?.name ?? "")}
                    </div>
                    {it?.sub ? (
                      <div className="mt-1 text-white/45" style={{ fontSize: s(UI.meta) }}>
                        {it.sub}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-white/80 font-extrabold" style={{ fontSize: s(UI.meta) }}>
                    {renderRight ? renderRight(it, idx) : it?.right || ""}
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
    </div>
  );
}
