import { useEffect, useMemo, useState } from "react";

function parseTimestamp(ts) {
  // "HH:MM:SS.mmm"
  const m = String(ts).trim().match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!m) return 0;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3]);
  const ms = Number((m[4] || "0").padEnd(3, "0"));
  return hh * 3600 + mm * 60 + ss + ms / 1000;
}

function resolveUrl(baseUrl, relOrAbs) {
  try {
    return new URL(relOrAbs, baseUrl).toString();
  } catch {
    return relOrAbs;
  }
}

export function useThumbnailsVtt(vttUrl) {
  const [cues, setCues] = useState([]);

  useEffect(() => {
    let alive = true;
    if (!vttUrl) {
      setCues([]);
      return;
    }

    fetch(vttUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`VTT HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (!alive) return;

        const lines = text.replace(/\r/g, "").split("\n");
        const out = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          // linha de tempo: 00:00:00.000 --> 00:00:10.000
          if (line.includes("-->")) {
            const [a, b] = line.split("-->").map((s) => s.trim());
            const start = parseTimestamp(a);
            const end = parseTimestamp(b);

            // próxima linha não vazia é a URL da thumb
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            const raw = (lines[j] || "").trim();
            if (raw) {
              out.push({
                start,
                end,
                url: resolveUrl(vttUrl, raw),
              });
            }
            i = j; // avança
          }
        }

        setCues(out);
      })
      .catch(() => {
        if (alive) setCues([]);
      });

    return () => {
      alive = false;
    };
  }, [vttUrl]);

  const api = useMemo(() => {
    function findCue(time) {
      if (!cues.length) return null;
      // busca linear simples (ok para ~300-500 thumbs). Se ficar grande, trocamos para binária.
      for (const c of cues) {
        if (time >= c.start && time < c.end) return c;
      }
      return cues[cues.length - 1] || null;
    }
    return { cues, findCue };
  }, [cues]);

  return api;
}
