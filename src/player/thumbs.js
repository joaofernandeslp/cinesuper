// src/player/thumbs.js

// ✅ fetch com retry (para 502/503/504)
export async function fetchWithRetry(url, { retries = 2, timeoutMs = 8000, signal } = {}) {
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();

    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, { cache: "no-store", credentials: "include", signal: ctrl.signal });
      clearTimeout(t);
      if (signal) signal.removeEventListener("abort", onAbort);

      if (res.ok) return res;

      if ([502, 503, 504].includes(res.status) && i < retries) {
        await new Promise((r) => setTimeout(r, 400 * (2 ** i)));
        continue;
      }

      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(t);
      if (signal) signal.removeEventListener("abort", onAbort);
      if (i >= retries) throw err;
      await new Promise((r) => setTimeout(r, 400 * (2 ** i)));
    }
  }
}

export function parseThumbnailsVtt(vttText, vttUrl) {
  const lines = vttText.split(/\r?\n/);
  const cues = [];

  const resolve = (u) => {
    try {
      return new URL(u, vttUrl).toString();
    } catch {
      return u;
    }
  };

  const timeToSec = (t) => {
    const [hhmmss, ms = "0"] = String(t).trim().split(".");
    const parts = hhmmss.split(":").map((x) => Number(x));
    let sec = 0;

    if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
    else sec = Number(parts[0]) || 0;

    return sec + (Number(ms) || 0) / 1000;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line || line.startsWith("WEBVTT")) {
      i++;
      continue;
    }

    let timingLine = line;
    if (!timingLine.includes("-->") && i + 1 < lines.length && lines[i + 1].includes("-->")) {
      i++;
      timingLine = lines[i].trim();
    }

    if (timingLine.includes("-->")) {
      const [a, b] = timingLine.split("-->").map((s) => s.trim().split(" ")[0]);
      const start = timeToSec(a);
      const end = timeToSec(b);

      const urlLine = (lines[i + 1] || "").trim();
      if (urlLine) {
        const [rawUrl, frag] = urlLine.split("#");
        const url = resolve(rawUrl);

        let xywh = null;
        if (frag && frag.startsWith("xywh=")) {
          const [x, y, w, h] = frag
            .replace("xywh=", "")
            .split(",")
            .map((n) => Number(n));
          if ([x, y, w, h].every((n) => Number.isFinite(n))) {
            xywh = { x, y, w, h };
          }
        }

        cues.push({ start, end, url, xywh });
      }

      i += 2;
      continue;
    }

    i++;
  }

  cues.sort((a, b) => a.start - b.start);
  return cues;
}

export function findCueBinary(cues, t) {
  if (!cues?.length) return null;

  let lo = 0;
  let hi = cues.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c;
  }

  const last = cues[cues.length - 1];
  if (last && t >= last.start) return last;
  return null;
}
