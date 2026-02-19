// src/player/gateway.js
import { STREAM_BASE } from "./env.js";
import { dirOfKey, encodePath, isHttpUrl, r2KeyFromUrl } from "./utils.js";

export function normalizeGatewayUrl(rawUrl) {
  try {
    const s = String(rawUrl || "").trim();
    if (!s) return "";
    const u = new URL(s);

    if (u.origin === STREAM_BASE) return u.toString();

    const fixed = new URL(u.pathname + u.search + u.hash, STREAM_BASE);
    return fixed.toString();
  } catch {
    return String(rawUrl || "").trim();
  }
}

/**
 * Inferência:
 * master gateway ".../master.m3u8?t=TOKEN"
 * thumbs: ".../thumbs/thumbnails.vtt?t=TOKEN"
 */
export function inferThumbsVttUrlFromMaster(masterUrl) {
  try {
    if (!masterUrl) return "";
    const u = new URL(masterUrl);
    const t = u.searchParams.get("t") || "";

    u.hash = "";
    u.search = "";
    u.pathname = u.pathname.replace(/\/[^/]*$/, "/");

    const thumbs = new URL("thumbs/thumbnails.vtt", u.toString());
    if (t) thumbs.searchParams.set("t", t);
    return thumbs.toString();
  } catch {
    return "";
  }
}

/**
 * Converte legenda (original) para URL no gateway, mantendo token do pbSrc.
 * Regras idênticas ao seu código.
 */
export function buildSubtitleGatewayUrl({
  originalUrl,
  gatewayOrigin,
  pbToken,
  titlePublicId,
  item,
  allow4k,
}) {
  try {
    if (!originalUrl || !gatewayOrigin || !pbToken) return originalUrl;
    const pub = String(titlePublicId || "").trim();
    if (!pub) return originalUrl;

    if (isHttpUrl(originalUrl)) {
      const u = new URL(originalUrl);
      if (u.origin === gatewayOrigin) return originalUrl;
    }

    const masterKeyRaw = String(
      allow4k
        ? (item?.hlsMasterKey || item?.hlsMasterUrl4k || item?.hlsMasterUrl || "")
        : (item?.hlsMasterHdKey || item?.hlsMasterUrlHd || item?.hlsMasterUrl || "")
    ).trim();

    const masterKey = isHttpUrl(masterKeyRaw) ? r2KeyFromUrl(masterKeyRaw) : masterKeyRaw;
    const basePrefixKey = dirOfKey(masterKey);

    const isAbsolute = isHttpUrl(originalUrl);
    if (!isAbsolute) {
      const rel = String(originalUrl).replace(/^\/+/, "");
      return `${gatewayOrigin}/v/${encodeURIComponent(pub)}/${encodePath(rel)}?t=${encodeURIComponent(pbToken)}`;
    }

    const subKey = r2KeyFromUrl(originalUrl);
    if (!subKey || !basePrefixKey) return originalUrl;
    if (!subKey.startsWith(basePrefixKey)) return originalUrl;

    const rel = subKey.slice(basePrefixKey.length).replace(/^\/+/, "");
    return `${gatewayOrigin}/v/${encodeURIComponent(pub)}/${encodePath(rel)}?t=${encodeURIComponent(pbToken)}`;
  } catch {
    return originalUrl;
  }
}
