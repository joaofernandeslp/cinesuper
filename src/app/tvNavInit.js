// src/app/tvNavInit.js
import { init, setKeyMap } from "@noriginmedia/norigin-spatial-navigation";

let done = false;

function dispatchTvBack() {
  try {
    const ev = new CustomEvent("cs:tv-back");
    window.dispatchEvent(ev);
  } catch {}
}

function isTextInput(el) {
  if (!el) return false;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if (el.isContentEditable) return true;
  return false;
}

export function ensureTvNavInit() {
  if (done) return;
  done = true;

  init({
    debug: false,
    visualDebug: false,
  });

  // Android TV / DPAD
  setKeyMap({
    left: [21, 37],
    up: [19, 38],
    right: [22, 39],
    down: [20, 40],
    enter: [23, 66, 13],
    back: [4, 111, 27], // não inclua 8 aqui (backspace)
  });

  // 1) BACK nativo (Capacitor) -> dispara cs:tv-back e NÃO fecha app
  try {
    import("@capacitor/app")
      .then(({ App }) => {
        App.addListener("backButton", () => {
          // prioridade: se houver um overlay registrado, fecha ele
          try {
            const fn = window.__CS_TV_OVERLAY_CLOSE__;
            if (typeof fn === "function") {
              fn();
              return;
            }
          } catch {}

          dispatchTvBack();
        });
      })
      .catch(() => {});
  } catch {}

  // 2) Fallback: alguns devices disparam keydown (webview) em vez de backButton nativo
  //    Captura e transforma em cs:tv-back
  window.addEventListener(
    "keydown",
    (e) => {
      const code = e.keyCode ?? e.which;

      // ✅ Se for Backspace (8) e o foco estiver em input, deixa apagar texto
      if (code === 8 && isTextInput(document.activeElement)) return;

      // back codes principais (inclui 8 com proteção acima)
      if (code === 4 || code === 111 || code === 27 || code === 461 || code === 10009 || code === 8) {
        e.preventDefault();
        e.stopPropagation();
        dispatchTvBack();
      }
    },
    { passive: false }
  );
}
