// src/pages/tv/player/helpers.js

export function pickThumbCueAtTime(cues, t) {
  const time = Number(t || 0);
  if (!Array.isArray(cues) || !cues.length) return null;

  let best = null;
  for (const c of cues) {
    const st = Number(c?.start ?? c?.startTime ?? 0);
    const en = Number(c?.end ?? c?.endTime ?? 0);
    if (time >= st && (en ? time < en : true)) best = c;
  }
  return best;
}

export function stopEvent(e) {
  try {
    e.preventDefault();
    e.stopPropagation();
  } catch {}
}

export function blurActiveElement() {
  try {
    const el = document.activeElement;
    if (el && typeof el.blur === "function") el.blur();
  } catch {}
}
