import { useEffect } from "react";

const BASE_W = 1920;
const BASE_H = 1080;

function setScale() {
  const w = window.innerWidth || BASE_W;
  const h = window.innerHeight || BASE_H;
  const s = Math.min(w / BASE_W, h / BASE_H);

  document.documentElement.style.setProperty("--tv-scale", String(s));
  document.documentElement.style.setProperty("--tv-w", String(BASE_W));
  document.documentElement.style.setProperty("--tv-h", String(BASE_H));
}

export default function TvShell({ children }) {
  useEffect(() => {
    setScale();
    window.addEventListener("resize", setScale);

    try {
      document.documentElement.classList.add("cs-tv");
      document.body.classList.add("cs-tv");
    } catch {}

    return () => window.removeEventListener("resize", setScale);
  }, []);

  return (
    <div className="tv-stage">
      <div className="tv-canvas">
        <div className="tv-safe">{children}</div>
      </div>
    </div>
  );
}
