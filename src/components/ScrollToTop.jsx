// src/components/ScrollToTop.jsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function scrollToTopSmart() {
  // viewport
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  } catch {
    try {
      window.scrollTo(0, 0);
    } catch {}
  }

  // document
  try {
    const doc = document.scrollingElement || document.documentElement;
    if (doc) doc.scrollTop = 0;
  } catch {}

  // container interno conhecido (o mais importante)
  try {
    const last = window.__CS_LAST_SCROLL_EL__;
    if (last && typeof last.scrollTop === "number") {
      last.scrollTop = 0;
      return;
    }
  } catch {}

  // fallback: maior container rolável
  try {
    const els = Array.from(document.querySelectorAll("body *"));
    let best = null;
    let bestScore = 0;

    for (const el of els) {
      const st = window.getComputedStyle(el);
      const oy = st.overflowY;

      if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight + 2) {
        const score = (el.scrollHeight - el.clientHeight) * el.clientHeight;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
    }

    if (best) best.scrollTop = 0;
  } catch {}
}

export default function ScrollToTop() {
  const location = useLocation();

  // evita o browser “restaurar” scroll em navegações
  useEffect(() => {
    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch {}
  }, []);

  useEffect(() => {
    // 3 passes: garante que pega DOM + containers depois da renderização
    const raf = requestAnimationFrame(() => {
      scrollToTopSmart();
      setTimeout(scrollToTopSmart, 60);
      setTimeout(scrollToTopSmart, 180);
    });

    return () => {
      try { cancelAnimationFrame(raf); } catch {}
    };
  }, [location.key]);

  return null;
}
