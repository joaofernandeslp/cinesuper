// src/app/target.js

const ENV_TARGET = String(import.meta.env.VITE_APP_TARGET || "web").toLowerCase();

function getForcedTarget() {
  try {
    const qs = new URLSearchParams(window.location.search);

    // Prioridade: ?target=tv|web
    const t = String(qs.get("target") || "").toLowerCase();
    if (t === "tv" || t === "web") return t;

    // Atalhos opcionais:
    // ?tv=1 / ?tv=true
    const tv = String(qs.get("tv") || "").toLowerCase();
    if (tv === "1" || tv === "true" || tv === "yes") return "tv";

    // ?web=1 / ?web=true
    const web = String(qs.get("web") || "").toLowerCase();
    if (web === "1" || web === "true" || web === "yes") return "web";
  } catch {}

  return "";
}

function detectTvByUA() {
  const ua = String(navigator.userAgent || "");

  // LG webOS (Web0S é o mais comum)
  if (/web0s|webos|netcast/i.test(ua)) return true;

  // Android TV / Google TV / Fire TV
  if (/(android).*(tv)/i.test(ua) || /googletv/i.test(ua) || /aftb|aftt|aftm/i.test(ua)) return true;

  // Samsung Tizen / SmartTV genéricos
  if (/tizen|smart-?tv|smarttv|hbbtv|viera|bravia/i.test(ua)) return true;

  return false;
}

const forced = getForcedTarget();
const uaSaysTv = detectTvByUA();

// TARGET efetivo (o que o app realmente vai usar)
export const TARGET =
  forced ||
  (ENV_TARGET === "tv" ? "tv" : uaSaysTv ? "tv" : "web");

export const IS_TV = TARGET === "tv";
export const IS_WEB = !IS_TV;

// Rota “home” da TV (pra pular Landing)
export const TV_HOME = String(import.meta.env.VITE_TV_HOME || "/browse");
