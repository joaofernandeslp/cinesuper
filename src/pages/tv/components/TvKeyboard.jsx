// src/pages/tv/components/TvKeyboard.jsx
import React, { memo } from "react";
import { cx } from "../_tvKeys.js";

const KEYBOARD_ROWS = [
  ["A","B","C","D","E","F","G","H","I","J"],
  ["K","L","M","N","O","P","Q","R","S","T"],
  ["U","V","W","X","Y","Z","0","1","2","3"],
  ["4","5","6","7","8","9","ESPACO","APAGAR","LIMPAR","OK"],
];

export function keyboardSize() {
  return { rows: KEYBOARD_ROWS.length, cols: KEYBOARD_ROWS[0].length };
}
export function getKeyAt(r, c) {
  const row = KEYBOARD_ROWS[r] || [];
  return row[c] || "";
}

function labelOf(k) {
  if (k === "ESPACO") return "Espaço";
  if (k === "APAGAR") return "Apagar";
  if (k === "LIMPAR") return "Limpar";
  return k;
}

/**
 * ✅ Botão memoizado:
 * só re-renderiza quando:
 * - muda o foco desse botão
 * - muda a label (não muda)
 */
const KeyButton = memo(function KeyButton({
  ri,
  ci,
  k,
  isFocus,
  setKeyRef,
  onKeyPress,
}) {
  return (
    <button
      ref={(el) => setKeyRef(ri, ci, el)}
      tabIndex={isFocus ? 0 : -1}
      type="button"
      onClick={() => onKeyPress(k)}
      className={cx(
        "outline-none select-none",
        // ✅ sem scale (scale pesa e dá “engasgo”)
        // ✅ transição mínima (TV WebView sofre com anim)
        "h-16 border border-white/12 bg-white/5",
        "px-6 text-[18px] font-bold text-white/90",
        "transition-[box-shadow,background-color] duration-75",
        k === "OK" ? "bg-white/12" : "",
        k === "LIMPAR" ? "bg-white/8" : "",
        k === "APAGAR" ? "bg-white/8" : "",
        k === "ESPACO" ? "min-w-[220px]" : "min-w-[96px]",
        // ✅ foco: borda/sombra forte, sem transform
        isFocus ? "shadow-[0_0_0_5px_rgba(255,255,255,0.92)] bg-white/10" : "opacity-90"
      )}
      aria-label={k}
      title={k}
    >
      {labelOf(k)}
    </button>
  );
}, (prev, next) => {
  // evita re-render se só o teclado inteiro re-renderizar
  return prev.isFocus === next.isFocus;
});

export default function TvKeyboard({
  query,
  focused,
  kbRow,
  kbCol,
  setKeyRef,
  onKeyPress,
}) {
  return (
    <div className="mt-8">
      <div className="text-3xl font-black">Pesquisa</div>

      <div
        className={cx(
          "mt-4 w-[1100px] border border-white/12 bg-white/5 px-6 py-5",
          focused ? "shadow-[0_0_0_2px_rgba(255,255,255,0.22)]" : ""
        )}
      >
        <div className="text-sm text-white/55 mb-2">
          Use o teclado (↑↓←→ + OK). Back: menu.
        </div>

        <div className="text-[26px] font-semibold text-white/95 min-h-[36px]">
          {query || <span className="text-white/35">Digite para buscar...</span>}
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {KEYBOARD_ROWS.map((r, ri) => (
          <div key={ri} className="flex gap-3">
            {r.map((k, ci) => {
              const isFocus = !!focused && ri === kbRow && ci === kbCol;

              return (
                <KeyButton
                  key={`${ri}-${ci}-${k}`}
                  ri={ri}
                  ci={ci}
                  k={k}
                  isFocus={isFocus}
                  setKeyRef={setKeyRef}
                  onKeyPress={onKeyPress}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 text-sm text-white/50">
        ←: menu • ↓: resultados • OK: tecla • OK no “OK”: ir para resultados
      </div>
    </div>
  );
}
