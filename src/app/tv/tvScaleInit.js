// src/app/tv/tvScaleInit.js
import { IS_TV } from "../target.js";

let done = false;

export function ensureTvScaleInit() {
  if (done || !IS_TV) return;
  done = true;

  const BASE_W = 1920;
  const BASE_H = 1080;
  const MAX_SCALE = 3.0;

  // Ajuste fino do padding (CSS divide por scale, então 1.0 é ok)
  const TV_SAFE = 1.0;

  const vv = window.visualViewport;

  let stableW = Math.max(1, Math.round((vv?.width ?? window.innerWidth) || 1));
  let stableH = Math.max(1, Math.round((vv?.height ?? window.innerHeight) || 1));

  function fontForWidth(w) {
    return w >= 3000 ? 1.05 : 1.20;
  }

  function updateStableIfBigger(w, h) {
    // Teclado/IME reduz -> ignorar. Só atualiza quando volta a crescer.
    if (w > stableW + 6) stableW = w;
    if (h > stableH + 6) stableH = h;

    if (w >= stableW && h >= stableH) {
      stableW = w;
      stableH = h;
    }
  }

  function applyStable() {
    const cover = Math.max(stableW / BASE_W, stableH / BASE_H);
    const scale = Math.min(MAX_SCALE, cover);

    const x = Math.round((stableW - BASE_W * scale) / 2);
    const y = Math.min(0, Math.round((stableH - BASE_H * scale) / 2)); // ✅ não desce o conteúdo

    const root = document.documentElement;
    root.classList.add("cs-tv");

    root.style.setProperty("--tv-base-w", `${BASE_W}px`);
    root.style.setProperty("--tv-base-h", `${BASE_H}px`);
    root.style.setProperty("--tv-scale", String(scale));
    root.style.setProperty("--tv-offset-x", `${x}px`);
    root.style.setProperty("--tv-offset-y", `${y}px`);

    root.style.setProperty("--tv-font", String(fontForWidth(stableW)));
    root.style.setProperty("--tv-safe", String(TV_SAFE));
  }

  function applyNow() {
    const w = Math.max(1, Math.round((vv?.width ?? window.innerWidth) || 1));
    const h = Math.max(1, Math.round((vv?.height ?? window.innerHeight) || 1));
    updateStableIfBigger(w, h);
    applyStable();
  }

  requestAnimationFrame(() => requestAnimationFrame(applyNow));

  if (vv) {
    vv.addEventListener("resize", applyNow, { passive: true });
    vv.addEventListener(
      "scroll",
      () => {
        try { window.scrollTo(0, 0); } catch {}
      },
      { passive: true }
    );
  }

  window.addEventListener("resize", applyNow, { passive: true });
  window.addEventListener("orientationchange", applyNow, { passive: true });
}
