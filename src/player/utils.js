// src/player/utils.js
export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  const m = Math.floor((sec / 60) % 60).toString();
  const h = Math.floor(sec / 3600);
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export function safeId(x) {
  return String(x || "").trim();
}

export function encodePath(rel) {
  return String(rel || "")
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

export function isHttpUrl(v) {
  return /^https?:\/\//i.test(String(v || "").trim());
}

export function r2KeyFromUrl(u) {
  try {
    const url = new URL(String(u || "").trim());
    return decodeURIComponent(url.pathname || "").replace(/^\/+/, "");
  } catch {
    return "";
  }
}

export function dirOfKey(key) {
  const clean = String(key || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const idx = clean.lastIndexOf("/");
  if (idx < 0) return "";
  return clean.slice(0, idx + 1);
}
