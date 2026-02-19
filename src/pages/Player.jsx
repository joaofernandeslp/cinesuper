// src/pages/Player.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  SkipForward,
  ListVideo,
  Subtitles,
  Flag,
  Globe,
  X,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient.js";
import { verifyPin, setUnlocked } from "../lib/profilePolicy.js";

import { WATCH_BASE, INTRO_SRC, INTRO_MODE } from "../player/env.js";
import { clamp, fmtTime, safeId } from "../player/utils.js";
import { inferThumbsVttUrlFromMaster, buildSubtitleGatewayUrl } from "../player/gateway.js";
import { fetchWithRetry, parseThumbnailsVtt } from "../player/thumbs.js";
import { gateReasonText, getClassification, getEpisodeLine, getMainTitle } from "../player/overlay.js";

import { useAutoHideUi } from "../hooks/player/useAutoHideUi.js";
import { useAntiResetGuard } from "../hooks/player/useAntiResetGuard.js";
import { useWatchProgress } from "../hooks/player/useWatchProgress.js";
import { useDeviceSession } from "../hooks/player/useDeviceSession.js";
import { usePlayerBootstrap } from "../hooks/player/usePlayerBootstrap.js";
import { useThumbToggleScrub } from "../hooks/player/useThumb_toggleScrub.js";
import { usePlaybackEngine } from "../hooks/player/usePlaybackEngine.js";

/* =========================
   Episodes helpers
========================= */

const EP_THUMB_TARGET_SEC = 20 * 60; // 20:00 (apenas se existir VTT)
const EP_SERIES_THUMB_FILE = "thumb_00080.jpg"; // ✅ fallback fixo para TODAS as séries

function ensureSlashEnd(p) {
  const s = String(p || "").trim();
  if (!s) return "";
  return s.endsWith("/") ? s : s + "/";
}
function isHttpUrl(v) {
  return /^https?:\/\//i.test(String(v || "").trim());
}

function pad2(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "01";
  return String(Math.floor(x)).padStart(2, "0");
}

function parseSeasonEpisodeFromPrefix(prefix) {
  const p = String(prefix || "");
  const mSeason =
    p.match(/\/temporada\s*(\d+)/i) ||
    p.match(/\/season\s*(\d+)/i) ||
    p.match(/\/m[oó]dulo\s*(\d+)/i) ||
    p.match(/\/module\s*(\d+)/i);
  const mEp = p.match(/\/epis[oó]dio\s*(\d+)/i) || p.match(/\/episode\s*(\d+)/i);

  const season = mSeason ? Number(mSeason[1]) : 1;
  const episode = mEp ? Number(mEp[1]) : 1;

  return {
    season: Number.isFinite(season) && season > 0 ? season : 1,
    episode: Number.isFinite(episode) && episode > 0 ? episode : 1,
  };
}

function extractSeriesBaseFromPrefix(prefix) {
  const p = String(prefix || "").replace(/\\/g, "/");
  if (!p) return "";
  const m = p.match(/^(.*)\/(?:temporada|season|m[oó]dulo|module)\s*\d+/i);
  if (m && m[1]) return String(m[1] || "").replace(/\/+$/, "");
  return p.replace(/\/+$/, "");
}

function normalizePrefix(p) {
  let s = String(p || "").trim();
  if (!s) return "";
  s = s.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!s.endsWith("/")) s += "/";
  return s;
}

function pickEpisodeNumber(ep, idx) {
  const n =
    ep?.episodeNumber ??
    ep?.episode_number ??
    ep?.ep_number ??
    ep?.number ??
    ep?.episode ??
    null;
  return n != null ? Number(n) : idx + 1;
}

function pickSeasonNumber(ep) {
  const s = ep?.seasonNumber ?? ep?.season_number ?? ep?.season ?? null;
  return s != null ? Number(s) : null;
}

function pickEpisodeTitle(ep, idx) {
  const t = String(ep?.title || ep?.name || ep?.episode_title || "").trim();
  if (t) return t;

  const epNum = pickEpisodeNumber(ep, idx);
  return `Episódio ${pad2(epNum)}`;
}

function pickEpisodeSynopsis(ep) {
  return String(ep?.synopsis || ep?.overview || ep?.description || "").trim();
}

function pickEpisodeThumbFallback(ep) {
  return (
    String(ep?.thumb_url || "").trim() ||
    String(ep?.thumb || "").trim() ||
    String(ep?.still_url || "").trim() ||
    String(ep?.hero_image_url || "").trim() ||
    String(ep?.poster_url || "").trim() ||
    ""
  );
}

function isM3u8Url(v) {
  return /\.m3u8(\?|$)/i.test(String(v || "").trim());
}

function parseTimeToSec(raw) {
  const s = String(raw || "").trim();
  if (!s) return 0;
  const parts = s.split(":").map((p) => p.trim());
  let h = 0;
  let m = 0;
  let sec = 0;
  if (parts.length === 3) {
    h = Number(parts[0] || 0);
    m = Number(parts[1] || 0);
    sec = Number(parts[2] || 0);
  } else if (parts.length === 2) {
    m = Number(parts[0] || 0);
    sec = Number(parts[1] || 0);
  } else if (parts.length === 1) {
    sec = Number(parts[0] || 0);
  }
  if (!Number.isFinite(h)) h = 0;
  if (!Number.isFinite(m)) m = 0;
  if (!Number.isFinite(sec)) sec = 0;
  return h * 3600 + m * 60 + sec;
}

function parseTimestampMap(line) {
  const raw = String(line || "");
  if (!raw.toUpperCase().startsWith("X-TIMESTAMP-MAP")) return null;

  const rhs = raw.split("=").slice(1).join("=").trim();
  if (!rhs) return null;

  let localStr = "";
  let mpegts = null;

  for (const part of rhs.split(",")) {
    const [k, v] = part.split(":");
    const key = String(k || "").trim().toUpperCase();
    const val = String(v || "").trim();
    if (key === "LOCAL") localStr = val;
    if (key === "MPEGTS") {
      const n = Number(val);
      if (Number.isFinite(n)) mpegts = n;
    }
  }

  if (!Number.isFinite(mpegts)) return null;
  const localSec = localStr ? parseTimeToSec(localStr) : 0;
  const offsetSec = mpegts / 90000 - localSec;
  return { localSec, mpegts, offsetSec };
}

function formatTimeSec(t) {
  const x = Number(t || 0);
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  const s = (x % 60).toFixed(3).padStart(6, "0"); // ss.mmm
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`;
}

function parseVttCues(vttText) {
  const text = String(vttText || "").replace(/\uFEFF/g, "");
  const lines = text.split(/\r?\n/);
  const cues = [];
  let timestampMap = null;

  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();
    i += 1;

    if (!line) continue;
    if (line.startsWith("WEBVTT")) continue;
    if (line.toUpperCase().startsWith("X-TIMESTAMP-MAP")) {
      timestampMap = parseTimestampMap(line);
      continue;
    }
    if (line.startsWith("NOTE")) {
      while (i < lines.length && lines[i].trim()) i += 1;
      continue;
    }

    // Optional identifier line
    if (!line.includes("-->") && i < lines.length && lines[i].includes("-->")) {
      line = lines[i].trim();
      i += 1;
    }

    if (!line.includes("-->")) continue;

    const [rawStart, rawEndAndSettings] = line.split("-->");
    const rawEnd = String(rawEndAndSettings || "").trim().split(/\s+/)[0];

    const start = parseTimeToSec(rawStart);
    const end = parseTimeToSec(rawEnd);

    const textLines = [];
    while (i < lines.length && lines[i].trim()) {
      textLines.push(lines[i]);
      i += 1;
    }

    cues.push({ start, end, text: textLines.join("\n") });
  }

  return { cues, timestampMap };
}

function parseM3u8Segments(m3uText, baseUrl) {
  const lines = String(m3uText || "").split(/\r?\n/);
  const segments = [];
  let lastDur = 0;
  let baseSearch = "";

  try {
    baseSearch = new URL(baseUrl).search || "";
  } catch {}

  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || "").trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF:")) {
      const dur = Number(line.replace("#EXTINF:", "").split(",")[0]);
      lastDur = Number.isFinite(dur) ? dur : 0;
      continue;
    }

    if (line.startsWith("#")) continue;

    try {
      const absUrl = new URL(line, baseUrl);
      if (!absUrl.search && baseSearch) absUrl.search = baseSearch;
      segments.push({ url: absUrl.toString(), duration: lastDur || 0 });
    } catch {
      segments.push({ url: line, duration: lastDur || 0 });
    }
  }

  return segments;
}

function findCueNearTime(cues, tSec) {
  if (!Array.isArray(cues) || !cues.length) return null;

  const inRange = cues.find((c) => {
    const a = Number(c?.start ?? 0);
    const b = Number(c?.end ?? 0);
    return tSec >= a && tSec <= b;
  });
  if (inRange) return inRange;

  let best = cues[0];
  let bestD = Math.abs(Number(best?.start ?? 0) - tSec);

  for (const c of cues) {
    const d = Math.abs(Number(c?.start ?? 0) - tSec);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best || null;
}

export default function Player() {
  const location = useLocation();
  const { id } = useParams();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // ===== states principais =====
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const lastVolumeRef = useRef(1);

  const [showEpisodes, setShowEpisodes] = useState(false);
  const [showSubs, setShowSubs] = useState(false);
  const [showAudio, setShowAudio] = useState(false);

  const [textTracks, setTextTracks] = useState([]);
  const [audioTracks, setAudioTracks] = useState([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState(-1);

  const [thumbCues, setThumbCues] = useState([]);

  const hasStartedRef = useRef(false);
  const [hasStarted, setHasStarted] = useState(false);

  const ratingShownRef = useRef(false);
  const [ratingVisible, setRatingVisible] = useState(false);
  const [ratingPayload, setRatingPayload] = useState({ age: "", descText: "" });
  const ratingTimersRef = useRef({ out: null });
  const [showHelp, setShowHelp] = useState(false);

  const allow4kRef = useRef(false);

  // ids do título
  const titlePublicIdRef = useRef("");
  const titleDbIdRef = useRef("");

  // gate
  const [gate, setGate] = useState({ blocked: false, reason: "", needPin: false, profile: null });
  const [pinInput, setPinInput] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [gateBump, setGateBump] = useState(0);
  const gateRef = useRef(gate);
  useEffect(() => {
    gateRef.current = gate;
  }, [gate]);

  // ui auto-hide
  const { showUI, armAutoHide, clearHideTimer } = useAutoHideUi({ delayMs: 2500 });

  // intro flags
  const [introDone, setIntroDone] = useState(false);
  const introEnabledRef = useRef(false);
  const introDoneRef = useRef(false);

  // ✅ key de "once"
  const introKey = useMemo(() => `cs_intro_done_${String(INTRO_SRC || "").slice(0, 80)}`, []);
  // ✅ garante init só quando muda o título
  const introInitRef = useRef({ lastId: null });

  // playback urls
  const [pbSrc, setPbSrc] = useState("");
  const [pbThumbs, setPbThumbs] = useState("");

  // ✅ NOVO: suporte a refresh de token sem reiniciar o engine
  const pbBodyRef = useRef(null); // body usado para supabase.functions.invoke("playback-token")
  const pbExpRef = useRef(0); // exp em epoch seconds retornado pela function

  // ✅ token/origin para subtitles/thumbs (atualizável via refresh)
  const [pbTokenState, setPbTokenState] = useState("");
  const [gatewayOriginState, setGatewayOriginState] = useState("");
  const [subsTokenBump, setSubsTokenBump] = useState(0);

  // episódios (lista ordenada global da série)
  const [seasonEpisodes, setSeasonEpisodes] = useState([]);

  // Drawer episodes UI
  const [activeSeason, setActiveSeason] = useState(1);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesErr, setEpisodesErr] = useState("");

  // thumbs do minuto 20 (se houver vtt por episódio)
  const [episodeThumbMap, setEpisodeThumbMap] = useState({}); // { [epPublicId]: { url, xywh } }
  const episodeThumbRef = useRef({});
  useEffect(() => {
    episodeThumbRef.current = episodeThumbMap;
  }, [episodeThumbMap]);

  // rating / started
  const showRatingOnce = useCallback(
    (reason) => {
      if (ratingShownRef.current) return;
      ratingShownRef.current = true;

      const payload = getClassification(item);
      setRatingPayload(payload);
      setRatingVisible(true);

      if (ratingTimersRef.current.out) clearTimeout(ratingTimersRef.current.out);
      ratingTimersRef.current.out = setTimeout(() => setRatingVisible(false), 10_000);
    },
    [item]
  );

  const markStarted = useCallback(
    (reason) => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;
      setHasStarted(true);
      if (item?.id) showRatingOnce(reason);
    },
    [item, showRatingOnce]
  );

  // ===== device session =====
  const { reportSessionState, stopHeartbeat } = useDeviceSession({
    supabase,
    titlePublicIdRef,
    titleDbIdRef,
    setError,
  });

  // ===== watch progress =====
  const {
    resumeLoading,
    resumeFromRef,
    appliedResumeRef,
    computeResume,
    saveProgress,
    startProgressTimer,
    stopProgressTimer,
  } = useWatchProgress({
    supabase,
    videoRef,
    gateRef,
    titleDbIdRef,
    introEnabledRef,
    introDoneRef,
    locationSearch: location.search,
  });

  // ===== anti-reset guard =====
  const anti = useAntiResetGuard({
    videoRef,
    hlsRef,
    scrubbingRef: { current: false }, // mantido como no seu hook atual
    durationState: duration,
  });

  // ===== bootstrap (load title + gate + pb token) =====
  const resetPlayerLocalState = useCallback(() => {
    setError("");
    setThumbCues([]);
    setShowEpisodes(false);
    setShowSubs(false);
    setShowAudio(false);

    hasStartedRef.current = false;
    setHasStarted(false);

    ratingShownRef.current = false;
    setRatingVisible(false);
    setRatingPayload({ age: "", descText: "" });
    if (ratingTimersRef.current.out) clearTimeout(ratingTimersRef.current.out);

    anti.lastGoodTimeRef.current = 0;
    anti.pendingRestoreRef.current = null;
    anti.clearRestoreTimer();
    anti.noteUserSeek("load-reset");

    // episodes drawer
    setEpisodesErr("");
    setEpisodesLoading(false);
  }, [anti]);

  const bootstrap = usePlayerBootstrap({
    supabase,
    id,
    locationSearch: location.search,
    gateBump,
    setGate,
    titlePublicIdRef,
    titleDbIdRef,
    allow4kRef,
    setError,
    setSeasonEpisodes, // pode vir do bootstrap, mas a gente garante fallback pela tabela titles
    setItem,
    setPbSrc,
    setPbThumbs,
    setThumbCues,
    pbBodyRef, // ✅ novo
    pbExpRef, // ✅ novo
    resetPlayerLocalState,
    computeResume,
    reportSessionState,
  });

  // ✅ derivar token/origin do pbSrc inicial (primeiro carregamento do título)
  useEffect(() => {
    if (!pbSrc) return;
    try {
      const u = new URL(pbSrc);
      setPbTokenState(u.searchParams.get("t") || "");
      setGatewayOriginState(u.origin || "");
    } catch {
      setPbTokenState("");
      setGatewayOriginState("");
    }
  }, [pbSrc]);

  // ✅ quando trocar perfil no TopNav (sem mudar URL), recarrega gate/token/resume
  useEffect(() => {
    const onProfileChanged = () => {
      // pausa
      try {
        videoRef.current?.pause?.();
      } catch {}

      // salva progresso do perfil atual antes de trocar
      const oldPid = gateRef.current?.profile?.id || null;
      saveProgress({ force: true, profileId: oldPid }).catch(() => {});

      // para timer
      try {
        stopProgressTimer();
      } catch {}

      // fecha drawers
      setShowEpisodes(false);
      setShowSubs(false);
      setShowAudio(false);

      // força bootstrap rodar de novo (vai ler o novo perfil + computeResume do novo perfil)
      setGateBump((n) => n + 1);
    };

    window.addEventListener("cs:profile-changed", onProfileChanged);
    return () => window.removeEventListener("cs:profile-changed", onProfileChanged);
  }, [saveProgress, stopProgressTimer]);

  // ✅ inicializa intro SOMENTE quando muda o id (evita loop)
  useEffect(() => {
    if (introInitRef.current.lastId === id) return;
    introInitRef.current.lastId = id;

    const enabled = !!bootstrap.introEnabled;
    introEnabledRef.current = enabled;

    let alreadyOnce = false;
    if (enabled && INTRO_MODE === "once") {
      try {
        alreadyOnce = sessionStorage.getItem(introKey) === "1";
      } catch {}
    } else {
      alreadyOnce = false;
    }

    const initialDone = !enabled || alreadyOnce;
    introDoneRef.current = initialDone;
    setIntroDone(initialDone);
  }, [id, bootstrap.introEnabled, introKey]);

  useEffect(() => {
    introDoneRef.current = introDone;
  }, [introDone]);

  // ✅ fim da intro: seta done e grava "once" se necessário
  const finishIntro = useCallback(
    (reason = "") => {
      const v = videoRef.current;

      introDoneRef.current = true;
      setIntroDone(true);

      if (bootstrap.introEnabled && INTRO_MODE === "once") {
        try {
          sessionStorage.setItem(introKey, "1");
        } catch {}
      }

      if (v) {
        try {
          v.pause?.();
        } catch {}
        try {
          v.removeAttribute("src");
          v.load?.();
        } catch {}
      }
      setIsPlaying(false);
    },
    [bootstrap.introEnabled, introKey]
  );

  // ===== thumbs vtt (gateway) =====
  const thumbsVttUrl = useMemo(() => {
    if (pbThumbs) return pbThumbs;
    if (pbSrc) return inferThumbsVttUrlFromMaster(pbSrc);
    return "";
  }, [pbThumbs, pbSrc]);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();

    async function loadVtt() {
      setThumbCues([]);
      if (!thumbsVttUrl) return;

      try {
        const res = await fetchWithRetry(thumbsVttUrl, { retries: 2, timeoutMs: 8000, signal: ctrl.signal });
        const text = await res.text();
        const cues = parseThumbnailsVtt(text, thumbsVttUrl);
        if (alive) setThumbCues(cues);
      } catch {
        if (alive) setThumbCues([]);
      }
    }

    loadVtt();
    return () => {
      alive = false;
      try {
        ctrl.abort();
      } catch {}
    };
  }, [thumbsVttUrl]);

  // ===== pb token/origin (atualizável) =====
  const pbToken = pbTokenState || (() => {
    try {
      return pbSrc ? new URL(pbSrc).searchParams.get("t") || "" : "";
    } catch {
      return "";
    }
  })();

  const gatewayOrigin = gatewayOriginState || (() => {
    try {
      return pbSrc ? new URL(pbSrc).origin : "";
    } catch {
      return "";
    }
  })();

  const subtitleFiles = useMemo(
    () => (Array.isArray(item?.subtitles) ? item.subtitles : []),
    [item?.subtitles]
  );
  const [m3uSubsMap, setM3uSubsMap] = useState({});

  const subtitleToGatewayUrl = useCallback(
    (originalUrl) => {
      return buildSubtitleGatewayUrl({
        originalUrl,
        gatewayOrigin,
        pbToken,
        titlePublicId: String(titlePublicIdRef.current || id || "").trim(),
        item,
        allow4k: !!allow4kRef.current,
      });
    },
    [gatewayOrigin, pbToken, item, id]
  );

  // ===== subtitles m3u8 -> vtt (browser track) =====
  useEffect(() => {
    let alive = true;
    const revokeList = [];
    const ctrl = new AbortController();

    async function buildM3uSubs() {
      const nextMap = {};
      const list = Array.isArray(subtitleFiles) ? subtitleFiles : [];
      if (!showSubs) {
        if (alive) setM3uSubsMap({});
        return;
      }
      if (!list.length) {
        if (alive) setM3uSubsMap({});
        return;
      }

      for (const s of list) {
        const resolved = subtitleToGatewayUrl(s?.src);
        if (!resolved || !isM3u8Url(resolved)) continue;

        try {
          const res = await fetchWithRetry(resolved, { retries: 2, timeoutMs: 8000, signal: ctrl.signal });
          const m3uText = await res.text();
          const segs = parseM3u8Segments(m3uText, resolved);
          if (!segs.length) continue;

          const allCues = [];
          let offset = 0;

          for (const seg of segs) {
            const segRes = await fetchWithRetry(seg.url, { retries: 2, timeoutMs: 8000, signal: ctrl.signal });
            const segText = await segRes.text();
            const parsed = parseVttCues(segText);
            const cues = parsed?.cues || [];
            const tsMapOffset = Number.isFinite(parsed?.timestampMap?.offsetSec) ? parsed.timestampMap.offsetSec : null;

            const maxEnd = cues.reduce((m, c) => Math.max(m, Number(c.end || 0)), 0);
            const minStart = cues.reduce((m, c) => Math.min(m, Number(c.start || 0)), Number.POSITIVE_INFINITY);
            const segDur = Number(seg.duration || 0);
            const localLikely =
              offset > 0 &&
              Number.isFinite(maxEnd) &&
              Number.isFinite(minStart) &&
              segDur > 0 &&
              minStart < 8 &&
              maxEnd <= segDur + 15;

            const add = Number.isFinite(tsMapOffset) ? tsMapOffset : localLikely ? offset : 0;
            for (const c of cues) {
              allCues.push({
                start: Number(c.start || 0) + add,
                end: Number(c.end || 0) + add,
                text: c.text || "",
              });
            }

            offset += Number(seg.duration || 0);
          }

          if (!allCues.length) continue;

          let vtt = "WEBVTT\n\n";
          for (const c of allCues) {
            const start = formatTimeSec(c.start);
            const end = formatTimeSec(c.end);
            vtt += `${start} --> ${end}\n${c.text}\n\n`;
          }

          const blob = new Blob([vtt], { type: "text/vtt" });
          const blobUrl = URL.createObjectURL(blob);
          revokeList.push(blobUrl);
          nextMap[resolved] = blobUrl;
        } catch {
          // ignore
        }
      }

      if (alive) setM3uSubsMap(nextMap);
    }

    buildM3uSubs();

    return () => {
      alive = false;
      try {
        ctrl.abort();
      } catch {}
      for (const u of revokeList) {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      }
    };
  }, [subtitleFiles, subtitleToGatewayUrl, subsTokenBump, showSubs]);

  // ===== sync tracks =====
  const syncTextTracks = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;

    const tt = v.textTracks;
    if (!tt) {
      setTextTracks([]);
      return;
    }

    const tracks = Array.from(tt || []).map((t, idx) => ({
      idx,
      label: t.label || (t.language ? t.language.toUpperCase() : `Track ${idx + 1}`),
      language: t.language || "",
      kind: t.kind || "",
      mode: t.mode || "disabled",
    }));

    setTextTracks(tracks);
  }, []);

  // ===== scrubbing/hover =====
  const scrub = useThumbToggleScrub({
    videoRef,
    duration,
    thumbCues,
    noteUserSeek: anti.noteUserSeek,
    armAutoHide,
    setCurrent,
  });

  // ===== playback engine (intro/hls/native) =====
  usePlaybackEngine({
    videoRef,
    hlsRef,
    pbSrc,
    loading: bootstrap.loading,
    gate,

    // ✅ novo: engine consegue renovar token por exp/401
    supabase,
    pbBodyRef,
    pbExpRef,
    onTokenRefreshed: ({ master, thumbs }) => {
      // Atualiza thumbs/vtt para não dar 401 depois de refresh
      if (thumbs) setPbThumbs(String(thumbs));

      // Atualiza token/origin para subtitles (sem reiniciar o engine)
      try {
        const u = new URL(String(master || ""));
        setPbTokenState(u.searchParams.get("t") || "");
        setGatewayOriginState(u.origin || "");
        setSubsTokenBump((n) => n + 1); // força remount dos <track>
      } catch {}
    },

    introEnabled: !!bootstrap.introEnabled,
    introDone,

    introEnabledRef,
    introDoneRef,

    finishIntro,
    reportSessionState,
    titleDbIdRef,

    startProgressTimer,
    stopProgressTimer,
    saveProgress,

    noteUserSeek: anti.noteUserSeek,
    userSeekRecently: anti.userSeekRecently,
    scheduleRestore: anti.scheduleRestore,
    clearRestoreTimer: anti.clearRestoreTimer,
    lastGoodTimeRef: anti.lastGoodTimeRef,
    pendingRestoreRef: anti.pendingRestoreRef,
    appliedResumeRef,
    resumeFromRef,

    armAutoHide,
    clearHideTimer,

    setError,
    setIsPlaying,
    setCurrent,
    setDuration,
    setTextTracks,
    setAudioTracks,
    setActiveAudioTrack,
    syncTextTracks,

    nextEpisode: (() => {
      const idx = seasonEpisodes.findIndex((e) => safeId(e.id) === safeId(id));
      return idx >= 0 ? seasonEpisodes[idx + 1] || null : null;
    })(),
    navigate,
  });

  // mark started (quando play)
  useEffect(() => {
    if (isPlaying) markStarted("play");
  }, [isPlaying, markStarted]);

  const toggleFullscreen = useCallback(() => {
    const container = document.getElementById("cs-player-root");
    const target = container || document.documentElement;

    if (!document.fullscreenElement) target.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }, []);

  // hotkeys
  useEffect(() => {
    function onKey(e) {
      const v = videoRef.current;
      if (!v) return;

      const introEnabledNow = introEnabledRef.current;
      const introDoneNow = introDoneRef.current;

      if (!introDoneNow && introEnabledNow) {
        if (e.code === "Space") {
          e.preventDefault();
          if (v.paused) v.play().catch(() => {});
          else v.pause?.();
        }
        if (e.code === "KeyS") {
          e.preventDefault();
          finishIntro("hotkey-s");
        }
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        if (v.paused) {
          markStarted("space");
          v.play().catch(() => {});
        } else v.pause();
        armAutoHide();
      }

      if (e.code === "ArrowLeft") {
        e.preventDefault();
        anti.noteUserSeek("arrow-left");
        v.currentTime = Math.max(0, (v.currentTime || 0) - 10);
        armAutoHide();
      }

      if (e.code === "ArrowRight") {
        e.preventDefault();
        anti.noteUserSeek("arrow-right");
        v.currentTime = (v.currentTime || 0) + 10;
        armAutoHide();
      }

      if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      }

      if (e.code === "Escape") {
        setShowEpisodes(false);
        setShowSubs(false);
        setShowAudio(false);
        setShowHelp(false);
      }

      if (e.key === "?" || (e.shiftKey && e.code === "Slash") || e.code === "KeyH") {
        e.preventDefault();
        setShowHelp((v) => !v);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armAutoHide, anti, finishIntro, markStarted, toggleFullscreen]);

  // visibility: salva + marca não tocando
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        const profId = gateRef.current?.profile?.id || null;

        reportSessionState({
          profileId: profId,
          titleDbId: String(titleDbIdRef.current || "") || null,
          is_playing: false,
        });

        saveProgress({ force: true, profileId: profId }).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reportSessionState, saveProgress]);

  // cleanup final
  useEffect(() => {
    return () => {
      try {
        stopProgressTimer();
      } catch {}

      const profId = gateRef.current?.profile?.id || null;
      saveProgress({ force: true, profileId: profId }).catch(() => {});

      stopHeartbeat();

      reportSessionState({
        profileId: profId,
        titleDbId: String(titleDbIdRef.current || "") || null,
        is_playing: false,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== UI helpers =====
  const isIntroPlaying = !!bootstrap.introEnabled && !introDone && !gate.blocked;
  const pausedOverlayOn = hasStarted && !isPlaying;

  const displayCurrent = scrub.scrubTime != null ? scrub.scrubTime : current;
  const progressPct = duration ? clamp(displayCurrent / duration, 0, 1) : 0;

  const mainTitle = getMainTitle(item);
  const episodeLine = getEpisodeLine(item);
  const synopsis = item?.synopsis || "";

  // ===== EPISODES (como no Title.jsx): titles + imdb_id + r2_prefix =====
  const imdbIdForSeries = useMemo(() => {
    return String(item?.imdb_id || item?.imdbId || "").trim().toLowerCase();
  }, [item]);

  const mediaType = useMemo(
    () => String(item?.media_type || item?.mediaType || "").trim().toLowerCase(),
    [item]
  );
  const isCourse = useMemo(() => mediaType === "course" || mediaType === "curso", [mediaType]);
  const isTv = useMemo(() => mediaType === "tv" || isCourse, [mediaType, isCourse]);
  const seasonLabel = isCourse ? "Módulo" : "Temporada";
  const seasonLabelPlural = isCourse ? "Módulos" : "Temporadas";
  const seasonPrefix = isCourse ? "M" : "T";

  const seriesIdForEpisodes = useMemo(() => {
    const seriesId = String(
      item?.series_id || item?.seriesId || (item?.is_series ? item?.dbId : "") || ""
    ).trim();
    return seriesId;
  }, [item]);

  const basePrefixForSeries = useMemo(() => {
    const raw = String(item?.r2_prefix || item?.r2Prefix || item?.r2_prefix_base || item?.r2PrefixBase || "").trim();
    if (!raw) return "";
    return normalizePrefix(extractSeriesBaseFromPrefix(raw));
  }, [item]);

  const canShowEpisodes = useMemo(() => {
    if (!isTv) return false;
    if (mediaType === "tv") return imdbIdForSeries.startsWith("tt") || !!seriesIdForEpisodes;
    if (mediaType === "course") return !!seriesIdForEpisodes || !!basePrefixForSeries;
    return false;
  }, [isTv, mediaType, imdbIdForSeries, seriesIdForEpisodes, basePrefixForSeries]);

  const currentSE = useMemo(() => {
    return parseSeasonEpisodeFromPrefix(item?.r2_prefix || item?.r2Prefix || "");
  }, [item]);

  const seasons = useMemo(() => {
    const set = new Set();
    for (const ep of seasonEpisodes) set.add(Number(ep.season || 1));
    return Array.from(set).sort((a, b) => a - b);
  }, [seasonEpisodes]);

  const episodesForSeason = useMemo(() => {
    return seasonEpisodes
      .filter((e) => Number(e.season || 1) === Number(activeSeason || 1))
      .sort((a, b) => {
        if (Number(a.season || 1) !== Number(b.season || 1)) return Number(a.season || 1) - Number(b.season || 1);
        return Number(a.episode || 1) - Number(b.episode || 1);
      });
  }, [seasonEpisodes, activeSeason]);

  const normalizeEpisodesFromTitles = useCallback((rows) => {
    const list = Array.isArray(rows) ? rows : [];
    const normalized = list
      .map((r) => {
        const se = parseSeasonEpisodeFromPrefix(r?.r2_prefix);
        const publicId = String(r?.public_id || "").trim();
        if (!publicId) return null;

        const titleRaw = String(r?.title || "").trim();
        const syn = String(r?.synopsis || r?.overview || r?.description || "").trim();

        return {
          // IMPORTANT: Player navega por public_id
          id: publicId,
          public_id: publicId,
          dbId: r?.id ?? null,

          title: titleRaw || `Episódio ${pad2(se.episode)}`,
          synopsis: syn,

          thumb_url: String(r?.thumb_url || "").trim() || String(r?.hero_image_url || "").trim(),
          hero_image_url: String(r?.hero_image_url || "").trim(),
          r2_prefix: String(r?.r2_prefix || "").trim(),

          season: se.season,
          episode: se.episode,

          // opcionais (se existirem no schema, ajudam o thumb VTT)
          thumbs_vtt_url: r?.thumbs_vtt_url,
          thumbsVttUrl: r?.thumbsVttUrl,
          pbThumbs: r?.pbThumbs,
          pb_thumbs: r?.pb_thumbs,
          playback_src: r?.playback_src,
          playback_url: r?.playback_url,
          master_url: r?.master_url,
          hls_url: r?.hls_url,
        };
      })
      .filter(Boolean);

    normalized.sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      return a.episode - b.episode;
    });

    return normalized;
  }, []);

  const ensureSeasonEpisodesLoaded = useCallback(async () => {
    if (!canShowEpisodes) return;

    // se já tem lista, apenas garante season coerente
    if (Array.isArray(seasonEpisodes) && seasonEpisodes.length) {
      if (!activeSeason) setActiveSeason(currentSE.season || 1);
      return;
    }

    setEpisodesErr("");
    setEpisodesLoading(true);

    try {
        const mt = mediaType === "curso" ? "course" : mediaType;
        const selectWithSynopsis = "id, public_id, title, synopsis, r2_prefix, thumb_url, hero_image_url, status, is_series";
        const selectBase = "id, public_id, title, r2_prefix, thumb_url, hero_image_url, status, is_series";

        const buildQuery = (cols, useSeriesId) => {
          let q = supabase
            .from("titles")
            .select(cols)
            .eq("media_type", mt)
            .eq("status", "published")
            .eq("is_series", false);

          if (useSeriesId && seriesIdForEpisodes) {
            q = q.eq("series_id", seriesIdForEpisodes);
          } else if (mt === "tv" && imdbIdForSeries.startsWith("tt")) {
            q = q.eq("imdb_id", imdbIdForSeries);
          } else if (mt === "course" && basePrefixForSeries) {
            q = q.like("r2_prefix", `${basePrefixForSeries}%`);
          } else {
            return null;
          }

          return q;
        };

        // Primeiro tenta com synopsis (se sua tabela tiver). Se der erro de coluna, cai no select mínimo.
        let useSeriesId = !!seriesIdForEpisodes;
        let query = buildQuery(selectWithSynopsis, useSeriesId);
        if (!query) {
          setSeasonEpisodes([]);
          setEpisodesErr("Nenhum episódio publicado encontrado.");
          return;
        }

        let res = await query;
        if (res?.error && String(res.error.message || "").includes("series_id")) {
          useSeriesId = false;
          query = buildQuery(selectWithSynopsis, useSeriesId);
          res = query ? await query : { data: [], error: null };
        }

        if (res?.error && String(res.error.message || "").includes("does not exist")) {
          query = buildQuery(selectBase, useSeriesId);
          res = query ? await query : { data: [], error: null };
        }

        if (res?.error) throw res.error;

        const data = res?.data || [];

        const normalized = normalizeEpisodesFromTitles(data);

      if (!normalized.length) {
        setSeasonEpisodes([]);
        setEpisodesErr("Nenhum episódio publicado encontrado.");
        return;
      }

      setSeasonEpisodes(normalized);

      const defSeason =
        normalized.find((x) => x.season === currentSE.season)?.season ?? normalized[0]?.season ?? 1;
      setActiveSeason(defSeason);
    } catch (e) {
      setSeasonEpisodes([]);
      setEpisodesErr(e?.message || "Falha ao carregar episódios (titles).");
    } finally {
      setEpisodesLoading(false);
    }
  }, [
    canShowEpisodes,
    seasonEpisodes,
    activeSeason,
    currentSE.season,
    imdbIdForSeries,
    normalizeEpisodesFromTitles,
  ]);

  const resolveEpisodeThumbFromVtt = useCallback(async (ep) => {
    const epId = safeId(ep?.id);
    if (!epId) return;

    if (episodeThumbRef.current?.[epId]?.url) return;

    const vttUrl =
      String(ep?.thumbs_vtt_url || ep?.thumbsVttUrl || ep?.pbThumbs || ep?.pb_thumbs || "").trim() ||
      (String(ep?.playback_src || ep?.playback_url || ep?.master_url || ep?.hls_url || "").trim()
        ? inferThumbsVttUrlFromMaster(
            String(ep?.playback_src || ep?.playback_url || ep?.master_url || ep?.hls_url || "").trim()
          )
        : "");

    if (!vttUrl) return;

    try {
      const res = await fetchWithRetry(vttUrl, { retries: 2, timeoutMs: 8000 });
      const text = await res.text();
      const cues = parseThumbnailsVtt(text, vttUrl);
      const cue = findCueNearTime(cues, EP_THUMB_TARGET_SEC);
      if (!cue?.url) return;

      setEpisodeThumbMap((prev) => {
        if (prev?.[epId]?.url) return prev;
        return { ...prev, [epId]: { url: cue.url, xywh: cue.xywh || null } };
      });
    } catch {
      // silencioso
    }
  }, []);

  // ✅ NOVO: thumb fixa por pasta (/thumbs/thumb_00080.jpg) com presign
  const resolveEpisodeThumbFixed = useCallback(async (ep) => {
    const epId = safeId(ep?.id);
    if (!epId) return;

    if (episodeThumbRef.current?.[epId]?.url) return;

    const r2Prefix = ensureSlashEnd(ep?.r2_prefix || ep?.r2Prefix || "");
    if (!r2Prefix) return;

    const key = `${r2Prefix}thumbs/${EP_SERIES_THUMB_FILE}`;

    try {
      const { data, error } = await supabase.functions.invoke("r2-presign", {
        body: { key, expiresIn: 900 },
      });

      if (error || !data?.ok || !data?.url) return;

      setEpisodeThumbMap((prev) => {
        if (prev?.[epId]?.url) return prev;
        return { ...prev, [epId]: { url: String(data.url), xywh: null } };
      });
    } catch {
      // silencioso
    }
  }, []);

  // ao abrir o drawer, garante load + pré-carrega thumbs (quando possível)
  useEffect(() => {
    if (!showEpisodes) return;

    if (!seasonEpisodes?.length) {
      ensureSeasonEpisodesLoaded();
      return;
    }

    let alive = true;

    (async () => {
      const slice = seasonEpisodes.slice(0, 12);
      for (const ep of slice) {
        if (!alive) return;

        // tenta VTT (se existir)
        await resolveEpisodeThumbFromVtt(ep);

        // fallback fixo por pasta
        await resolveEpisodeThumbFixed(ep);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    showEpisodes,
    seasonEpisodes,
    ensureSeasonEpisodesLoaded,
    resolveEpisodeThumbFromVtt,
    resolveEpisodeThumbFixed,
  ]);

  // ===== actions =====
  const togglePlay = () => {
    if (gate?.blocked) return;
    const v = videoRef.current;
    if (!v) return;

    if (isIntroPlaying) {
      if (v.paused) v.play().catch(() => {});
      else v.pause?.();
      return;
    }

    if (v.paused) {
      markStarted("togglePlay click");
      v.play().catch(() => {});
    } else v.pause();
    armAutoHide();
  };

  const skip = (sec) => {
    const v = videoRef.current;
    if (!v) return;
    anti.noteUserSeek("skip");
    v.currentTime = Math.max(0, (v.currentTime || 0) + sec);
    armAutoHide();
  };

  const setVol = (val) => {
    const v = videoRef.current;
    if (!v) return;
    const next = clamp(val, 0, 1);
    v.volume = next;
    if (v.muted && next > 0) v.muted = false;
    setVolume(next);
    setMuted(!!v.muted);
    if (!v.muted && next > 0) lastVolumeRef.current = next;
    armAutoHide();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;

    if (!v.muted) {
      const vv = v.volume ?? 1;
      if (vv > 0) lastVolumeRef.current = vv;
      v.muted = true;
      setMuted(true);
    } else {
      v.muted = false;
      if ((v.volume ?? 0) === 0) v.volume = lastVolumeRef.current || 1;
      setMuted(false);
    }
    armAutoHide();
  };

  const currentEpisodeIndex = useMemo(() => {
    if (!seasonEpisodes.length) return -1;
    return seasonEpisodes.findIndex((e) => safeId(e.id) === safeId(id));
  }, [seasonEpisodes, id]);

  const nextEpisode = useMemo(() => {
    if (currentEpisodeIndex < 0) return null;
    return seasonEpisodes[currentEpisodeIndex + 1] || null;
  }, [seasonEpisodes, currentEpisodeIndex]);

  const goNextEpisode = () => {
    if (!nextEpisode?.id) return;
    reportSessionState({
      profileId: gate?.profile?.id || null,
      titleDbId: String(titleDbIdRef.current || "") || null,
      is_playing: false,
    });
    navigate(`${WATCH_BASE}/${nextEpisode.id}`);
  };

  const nextUp = useMemo(() => {
    // só séries (tv com imdb tt...) + precisa ter próximo episódio
    if (!canShowEpisodes) return { show: false };
    if (!nextEpisode?.id) return { show: false };

    // não mostra se estiver em intro/gate
    if (gate?.blocked) return { show: false };
    if (isIntroPlaying) return { show: false };

    // precisa ter duração válida
    if (!Number.isFinite(duration) || duration <= 0) return { show: false };

    const remaining = Math.max(0, Number(duration) - Number(current || 0));

    // threshold: aparece nos últimos 180s
    const thresholdSec = 180;

    const seasonNum = Number(nextEpisode?.season || 0) || 1;
    const epNum = Number(nextEpisode?.episode || 0) || 1;

    return {
      show: remaining <= thresholdSec,
      remaining,
      seasonNum,
      epNum,
      title: String(nextEpisode?.title || "").trim(),
    };
  }, [canShowEpisodes, nextEpisode, gate?.blocked, isIntroPlaying, duration, current]);

  // ===== render loading / not found =====
  if (bootstrap.loading) {
    return (
      <div className="min-h-full bg-black text-white p-6">
        <Link to={`/browse`} className="text-white/85 hover:text-white text-sm font-medium" onClick={clearHideTimer}>
          ← Voltar
        </Link>
        <div className="mt-4 text-white/70">Carregando{resumeLoading ? " (retomando…)" : "…"}</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-full bg-black text-white p-6">
        <Link to={`/browse`} className="text-white/85 hover:text-white text-sm font-medium" onClick={clearHideTimer}>
          ← Voltar
        </Link>
        <div className="mt-4">
          Vídeo não encontrado. <span className="text-white/50">(id: {String(id)})</span>
        </div>
        {error ? <div className="mt-3 text-sm text-red-200">{error}</div> : null}
      </div>
    );
  }

  // ===== active subtitle =====
  const activeSub = textTracks.find((t) => t.mode === "showing");

  return (
    <div
      id="cs-player-root"
      className="min-h-[100vh] bg-black text-white"
      onMouseMove={armAutoHide}
      onTouchStart={armAutoHide}
      onTouchMove={armAutoHide}
    >
      <div className="relative w-full h-[100vh] bg-black">
        <video
          ref={videoRef}
          // ✅ alinhado com o engine (omit credentials / token no querystring)
          crossOrigin="anonymous"
          className="absolute inset-0 h-full w-full cursor-pointer object-contain"
          playsInline
          autoPlay
          controls={false}
          onClick={togglePlay}
        >
          {!isIntroPlaying
            ? subtitleFiles.map((s, idx) => {
                const resolved = subtitleToGatewayUrl(s?.src);
                const isM3u = isM3u8Url(resolved);
                const finalSrc = isM3u ? m3uSubsMap?.[resolved] || "" : resolved;
                if (!finalSrc) return null;
                return (
                  <track
                    // ✅ token bump para recriar tracks quando token renova
                    key={`${subsTokenBump}:${s?.lang || "sub"}-${idx}`}
                    kind="subtitles"
                    label={s?.label || (s?.lang ? s.lang.toUpperCase() : `Legenda ${idx + 1}`)}
                    srcLang={s?.lang || ""}
                    src={finalSrc}
                    default={!!s?.default}
                  />
                );
              })
            : null}
        </video>

        {/* INTRO overlay */}
        {isIntroPlaying ? (
          <div className="absolute inset-0 z-[65] pointer-events-none">
            <div
              className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between"
              style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.75), rgba(0,0,0,0))" }}
            >
              <div className="text-sm text-white/80 pointer-events-none">Introdução</div>
              <button
                type="button"
                onClick={() => finishIntro("click-skip")}
                className="pointer-events-auto rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-2 text-sm"
                title="Pular intro (S)"
              >
                Pular intro
              </button>
            </div>

            <div className="absolute bottom-6 left-0 right-0 text-center text-xs text-white/50">
              Dica: aperte <span className="text-white/70 font-semibold">S</span> para pular
            </div>
          </div>
        ) : null}

        {/* GATE overlay */}
        {gate.blocked ? (
          <div className="absolute inset-0 z-[70] bg-black/80 flex items-center justify-center p-6">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0b0b]/95 backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,.6)] p-5">
              <div className="text-lg font-semibold text-white">Conteúdo bloqueado</div>
              <div className="mt-2 text-sm text-white/70">{gateReasonText(gate.reason)}</div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/75">
                Perfil: <span className="text-white/90 font-semibold">{gate.profile?.name || "—"}</span>
              </div>

              {gate.needPin ? (
                <div className="mt-4">
                  <div className="text-xs text-white/50 mb-2">Digite o PIN do perfil para desbloquear</div>
                  <div className="flex items-center gap-2">
                    <input
                      value={pinInput}
                      onChange={(e) => setPinInput(String(e.target.value || "").replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      placeholder="PIN"
                      className="flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const prof = gate.profile;
                        if (!prof) return;
                        if (pinBusy) return;

                        setPinBusy(true);
                        setError("");

                        try {
                          const ok = await verifyPin(prof, pinInput);
                          if (!ok) {
                            setError("PIN inválido.");
                            return;
                          }

                          setUnlocked(prof.id, item?.id || id);
                          setPinInput("");
                          setError("");
                          setGate({ blocked: false, reason: "", needPin: false, profile: prof });
                          setGateBump((n) => n + 1);
                        } finally {
                          setPinBusy(false);
                        }
                      }}
                      disabled={pinBusy || String(pinInput || "").replace(/\D/g, "").length < 4}
                      className={`rounded-xl px-4 py-2 text-sm text-black transition ${
                        pinBusy || String(pinInput || "").replace(/\D/g, "").length < 4
                          ? "bg-white/60 cursor-not-allowed"
                          : "bg-white hover:bg-white/90"
                      }`}
                    >
                      {pinBusy ? "Verificando..." : "Desbloquear"}
                    </button>
                  </div>
                  {error ? <div className="mt-2 text-xs text-red-200">{error}</div> : null}
                </div>
              ) : null}

              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/profiles")}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
                >
                  Trocar perfil
                </button>

                <button
                  type="button"
                  onClick={() => navigate(`/t/${id}`)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 transition"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* MAIN overlays + controls */}
        {!isIntroPlaying ? (
          <>
            {pausedOverlayOn ? (
              <div className="absolute inset-0 z-10 pointer-events-none">
                <div className="absolute inset-0 bg-black/55" />
                <div className="absolute left-8 sm:left-12 top-[28%] max-w-[760px]">
                  <div className="text-white/70 text-base sm:text-lg">Você está assistindo a</div>
                  <div className="mt-2 text-4xl sm:text-6xl font-extrabold tracking-tight">{mainTitle}</div>
                  {episodeLine ? (
                    <div className="mt-4 text-lg sm:text-2xl font-semibold text-white/90">{episodeLine}</div>
                  ) : null}
                  {synopsis ? (
                    <div className="mt-2 text-sm sm:text-base text-white/65 leading-relaxed max-w-[680px]">
                      {synopsis}
                    </div>
                  ) : null}
                </div>
                <div className="absolute right-20 bottom-10 text-white/75 text-sm sm:text-base">Pausado</div>
              </div>
            ) : null}

            {/* Rating */}
            <div
              className={`absolute left-8 sm:left-12 top-24 z-30 pointer-events-none transition-opacity duration-500 ${
                ratingVisible ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-[3px] h-10 bg-[#e50914] rounded" />
                <div className="text-white/90 text-xl sm:text-2xl font-semibold">Classificação:</div>
                {ratingPayload.age ? (
                  <div className="px-2.5 py-1 rounded bg-[#f59e0b] text-black font-extrabold text-lg sm:text-xl">
                    {ratingPayload.age}
                  </div>
                ) : (
                  <div className="px-2.5 py-1 rounded bg-white/10 text-white/90 font-semibold text-sm sm:text-base">
                    Não informada
                  </div>
                )}
                {ratingPayload.descText ? (
                  <div className="text-white/80 text-lg sm:text-2xl">{ratingPayload.descText}</div>
                ) : null}
              </div>
            </div>

            {/* Topbar */}
            <div
              className={`absolute top-0 left-0 right-0 z-20 px-4 py-3 flex items-center justify-between transition-opacity ${
                showUI ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
              style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.75), rgba(0,0,0,0))" }}
            >
              <Link
                to={`/t/${id}`}
                className="text-white/85 hover:text-white text-sm font-medium"
                onClick={clearHideTimer}
              >
                ← Voltar
              </Link>

              <div className="text-sm font-semibold line-clamp-1 text-center max-w-[70%]">{item.title}</div>

              <button className="text-white/75 hover:text-white text-sm" title="Reportar" onClick={() => {}}>
                <Flag className="w-5 h-5" />
              </button>
            </div>

            {/* Big play */}
            {!isPlaying ? (
              <button
                onClick={togglePlay}
                className={`absolute inset-0 z-10 flex items-center justify-center transition-opacity ${
                  showUI ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                <div className="h-16 w-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                  <Play className="w-7 h-7" />
                </div>
              </button>
            ) : null}

            {/* Next episode CTA (só séries, perto do fim) */}
            {nextUp.show ? (
              <button
                type="button"
                onClick={() => {
                  const profId = gateRef.current?.profile?.id || null;
                  saveProgress({ force: true, profileId: profId }).catch(() => {});
                  goNextEpisode();
                }}
                className="
                  absolute right-6 bottom-28 z-40
                  pointer-events-auto
                  rounded-2xl border border-white/15
                  bg-black/60 backdrop-blur-md
                  px-4 py-3
                  hover:bg-black/75 transition
                  shadow-[0_12px_40px_rgba(0,0,0,.6)]
                  flex items-center gap-4
                  max-w-[420px]
                "
                title="Assistir próximo episódio"
              >
                <div className="min-w-0">
                  <div className="text-[11px] text-white/60">
                    Próximo episódio {nextUp.remaining <= 60 ? `• em ${Math.ceil(nextUp.remaining)}s` : ""}
                  </div>
                    <div className="mt-0.5 text-sm font-semibold text-white/90 truncate">
                      {seasonPrefix}
                      {pad2(nextUp.seasonNum)}E{pad2(nextUp.epNum)}
                      {nextUp.title ? ` • ${nextUp.title}` : ""}
                    </div>
                </div>

                <span className="shrink-0 inline-flex items-center justify-center h-10 w-10 rounded-xl bg-white text-black">
                  <Play className="w-5 h-5" fill="currentColor" />
                </span>
              </button>
            ) : null}

            {/* Bottom controls */}
            <div
              className={`absolute bottom-0 left-0 right-0 z-30 px-4 pb-4 pt-10 transition-opacity ${
                showUI ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
              style={{ background: "linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0))" }}
            >
              <div className="flex items-center gap-3">
                <div className="text-xs text-white/80 w-[54px]">{fmtTime(displayCurrent)}</div>

                <div
                  className="relative w-full"
                  onPointerMove={scrub.onProgressPointerMove}
                  onPointerDown={scrub.onProgressPointerDown}
                  onPointerUp={scrub.onProgressPointerUp}
                  onPointerCancel={scrub.onProgressPointerCancel}
                  onPointerLeave={scrub.onProgressPointerLeave}
                >
                  {scrub.hover.show ? (
                    <div
                      className="absolute bottom-9 z-50 pointer-events-none"
                      style={{ left: `${scrub.hover.x}px`, transform: "translateX(-50%)" }}
                    >
                      <div className="flex flex-col items-center gap-2">
                        {scrub.hover.cue?.url ? (
                          scrub.hover.cue.xywh ? (
                            <div
                              className="rounded-md overflow-hidden border border-white/15 bg-black/40"
                              style={{
                                width: scrub.hover.cue.xywh?.w || 180,
                                height: scrub.hover.cue.xywh?.h || 100,
                                backgroundImage: `url(${scrub.hover.cue.url})`,
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: `-${scrub.hover.cue.xywh.x}px -${scrub.hover.cue.xywh.y}px`,
                                backgroundSize: "auto",
                              }}
                            />
                          ) : (
                            <div className="rounded-md overflow-hidden border border-white/15 bg-black/40">
                              <img
                                src={scrub.hover.cue.url}
                                alt=""
                                draggable="false"
                                className="block w-[180px] h-[100px] object-cover"
                              />
                            </div>
                          )
                        ) : null}

                        <div className="px-2 py-1 rounded bg-black/70 border border-white/10 text-[11px] text-white/90">
                          {fmtTime(scrub.hover.time)}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="relative h-2 w-full rounded-full bg-white/20 cursor-pointer">
                    <div
                      className="absolute left-0 top-0 h-2 rounded-full bg-[#e50914]"
                      style={{ width: `${progressPct * 100}%` }}
                    />
                    <div
                      className="absolute top-1/2 h-4 w-4 rounded-full bg-[#e50914] -translate-y-1/2"
                      style={{ left: `${progressPct * 100}%`, transform: "translate(-50%, -50%)" }}
                    />
                  </div>
                </div>

                <div className="text-xs text-white/70 w-[54px] text-right">{fmtTime(duration)}</div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={togglePlay}
                    className="h-10 px-3 rounded bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center"
                    title={isPlaying ? "Pausar" : "Reproduzir"}
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>

                  <button
                    onClick={() => skip(-10)}
                    className="h-10 px-3 rounded bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center"
                    title="Voltar 10s"
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span className="ml-1 text-xs">10</span>
                  </button>

                  <button
                    onClick={() => skip(10)}
                    className="h-10 px-3 rounded bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center"
                    title="Avançar 10s"
                  >
                    <RotateCw className="w-5 h-5" />
                    <span className="ml-1 text-xs">10</span>
                  </button>

                  <div className="ml-1 flex items-center gap-2">
                    <button
                      onClick={toggleMute}
                      className="h-10 px-3 rounded bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center"
                      title={muted ? "Desmutar" : "Mutar"}
                    >
                      {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                    </button>

                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(volume * 100)}
                      onChange={(e) => setVol(Number(e.target.value) / 100)}
                      className="w-28 accent-[#e50914] cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={goNextEpisode}
                    disabled={!nextEpisode}
                    className={`h-10 px-3 rounded border flex items-center justify-center ${
                      nextEpisode
                        ? "bg-white/10 hover:bg-white/15 border-white/15"
                        : "bg-white/5 border-white/10 text-white/30 cursor-not-allowed"
                    }`}
                    title="Próximo episódio"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => {
                      setShowEpisodes(true);
                      setShowSubs(false);
                      setShowAudio(false);
                      if (!seasonEpisodes.length) ensureSeasonEpisodesLoaded();
                    }}
                    disabled={!canShowEpisodes}
                    className={`h-10 px-3 rounded border flex items-center justify-center ${
                      canShowEpisodes ? "bg-white/10 hover:bg-white/15 border-white/15" : "bg-white/5 border-white/10 text-white/30"
                    }`}
                    title={canShowEpisodes ? "Episódios" : "Sem episódios para este título"}
                  >
                    <ListVideo className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => {
                      setShowAudio((v) => !v);
                      setShowSubs(false);
                      setShowEpisodes(false);
                      armAutoHide();
                    }}
                    className={`h-10 px-3 rounded border flex items-center justify-center ${
                      audioTracks.length >= 2 ? "bg-white/10 hover:bg-white/15 border-white/15" : "bg-white/5 border-white/10 text-white/30"
                    }`}
                    title="Idioma de áudio"
                    disabled={audioTracks.length < 2}
                  >
                    <Globe className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => {
                      setShowSubs((v) => !v);
                      setShowAudio(false);
                      setShowEpisodes(false);
                      armAutoHide();
                    }}
                    className={`h-10 px-3 rounded border flex items-center justify-center ${
                      textTracks.length ? "bg-white/10 hover:bg-white/15 border-white/15" : "bg-white/5 border-white/10 text-white/30"
                    }`}
                    title="Legendas"
                    disabled={!textTracks.length}
                  >
                    <Subtitles className="w-5 h-5" />
                  </button>

                  <button
                    onClick={toggleFullscreen}
                    className="h-10 px-3 rounded bg-white/10 hover:bg-white/15 border border-white/15 flex items-center justify-center"
                    title="Tela cheia (F)"
                  >
                    <Maximize className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="mt-3 text-center text-sm text-white/90">{item.title}</div>
            </div>

            {/* Error toast */}
            {error ? (
              <div className="absolute bottom-6 left-4 right-4 z-40">
                <div className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              </div>
            ) : null}

            {/* Episodes Drawer */}
            {showEpisodes ? (
              <div className="absolute inset-0 z-50 bg-black/60" onClick={() => setShowEpisodes(false)}>
                <div
                  className="absolute right-0 top-0 h-full w-[92vw] max-w-[460px] bg-[#0b0b0b] border-l border-white/10 p-4 flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <div className="font-semibold">
                      Episódios{" "}
                      {seasons.length ? (
                        <span className="ml-2 text-xs text-white/50">
                          {seasonLabel} {pad2(activeSeason)} • {episodesForSeason.length} ep(s)
                        </span>
                      ) : null}
                    </div>
                    <button className="text-white/70 hover:text-white" onClick={() => setShowEpisodes(false)}>
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {episodesLoading ? <div className="mt-3 text-sm text-white/60">Carregando episódios…</div> : null}

                  {episodesErr ? (
                    <div className="mt-3 text-xs text-white/55 border border-white/10 bg-white/5 rounded-lg px-3 py-2">
                      {episodesErr}
                    </div>
                  ) : null}

                  {seasons.length > 1 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {seasons.map((s) => (
                        <button
                          key={`season-${s}`}
                          onClick={() => setActiveSeason(s)}
                          className={`text-xs rounded-full border px-3 py-2 font-semibold transition ${
                            Number(s) === Number(activeSeason)
                              ? "border-[#e50914]/40 bg-[#e50914]/15 text-white"
                              : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                          }`}
                        >
                          {seasonLabel} {pad2(s)}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-1">
                    {episodesForSeason.length ? (
                      episodesForSeason.map((ep, idx) => {
                        const active = safeId(ep.id) === safeId(id);
                        const epId = safeId(ep.id);

                        const cue = epId ? episodeThumbMap?.[epId] : null;

                        const fallbackThumbRaw = pickEpisodeThumbFallback(ep);
                        const fallbackThumbOk = isHttpUrl(fallbackThumbRaw) && !String(fallbackThumbRaw || "").trim().endsWith("/");
                        const fallbackThumb = fallbackThumbOk ? fallbackThumbRaw : "";

                        const epTitle = pickEpisodeTitle(ep, idx);
                        const epSyn = pickEpisodeSynopsis(ep);
                        const epNum = Number(ep.episode || pickEpisodeNumber(ep, idx));
                        const seasonNum = Number(ep.season || pickSeasonNumber(ep) || activeSeason || 1);
                        const epDur = String(ep?.duration || "").trim();

                        return (
                          <button
                            key={ep.id}
                            onClick={() => navigate(`${WATCH_BASE}/${ep.id}`)}
                            onMouseEnter={() => {
                              resolveEpisodeThumbFromVtt(ep);
                              resolveEpisodeThumbFixed(ep);
                            }}
                            className={`text-left flex items-start gap-3 rounded-lg border px-3 py-3 ${
                              active ? "border-[#e50914]/60 bg-[#e50914]/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                            }`}
                            title={`${seasonLabel} ${pad2(seasonNum)} • Episódio ${pad2(epNum)}`}
                          >
                            {/* Thumb */}
                            <div className="w-[120px] h-[68px] rounded-md overflow-hidden border border-white/10 bg-black/30 flex-shrink-0">
                              {cue?.url ? (
                                cue.xywh ? (
                                  <div
                                    className="w-full h-full"
                                    style={{
                                      backgroundImage: `url(${cue.url})`,
                                      backgroundRepeat: "no-repeat",
                                      backgroundPosition: `-${cue.xywh.x}px -${cue.xywh.y}px`,
                                      backgroundSize: "auto",
                                    }}
                                  />
                                ) : (
                                  <img src={cue.url} alt="" draggable={false} className="w-full h-full object-cover" />
                                )
                              ) : fallbackThumb ? (
                                <img
                                  src={fallbackThumb}
                                  alt=""
                                  draggable={false}
                                  className="w-full h-full object-cover opacity-95"
                                />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-white/5 to-black/40" />
                              )}
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-semibold text-white/90 line-clamp-1">
                                  <span className="text-white/55 mr-2">
                                    {seasonPrefix}
                                    {pad2(seasonNum)}E{pad2(epNum)}
                                  </span>
                                  {epTitle}
                                </div>
                                {epDur ? <div className="text-[11px] text-white/45 flex-shrink-0">{epDur}</div> : null}
                              </div>

                              {epSyn ? (
                                <div className="mt-1 text-xs text-white/60 line-clamp-2">{epSyn}</div>
                              ) : (
                                <div className="mt-1 text-xs text-white/40">Sem sinopse.</div>
                              )}
                            </div>

                            <div className="text-white/80">{active ? "▶" : ""}</div>
                          </button>
                        );
                      })
                    ) : !episodesLoading ? (
                      <div className="text-sm text-white/60">
                        Nenhum episódio encontrado neste {String(seasonLabel || "temporada").toLowerCase()}.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Subs Menu */}
            {showSubs ? (
              <div className="absolute inset-0 z-50 bg-black/30" onClick={() => setShowSubs(false)}>
                <div
                  className="absolute right-4 bottom-24 w-[280px] rounded-xl bg-[#0b0b0b] border border-white/10 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-sm font-semibold text-white/90">Legendas</div>
                  <div className="mt-2 flex flex-col gap-2">
                    <button
                      className="w-full text-left rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm"
                      onClick={() => {
                        const v = videoRef.current;
                        if (!v?.textTracks) return;
                        for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "disabled";
                        syncTextTracks();
                        setShowSubs(false);
                        armAutoHide();
                      }}
                    >
                      Desativado {activeSub ? "" : "✓"}
                    </button>

                    {textTracks.length ? (
                      textTracks.map((t) => (
                        <button
                          key={`${t.idx}-${t.label}`}
                          className="w-full text-left rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm"
                          onClick={() => {
                            const v = videoRef.current;
                            if (!v?.textTracks) return;
                            for (let i = 0; i < v.textTracks.length; i++)
                              v.textTracks[i].mode = i === t.idx ? "showing" : "disabled";
                            syncTextTracks();
                            setShowSubs(false);
                            armAutoHide();
                          }}
                        >
                          {t.label} {t.mode === "showing" ? "✓" : ""}
                        </button>
                      ))
                    ) : (
                      <div className="text-xs text-white/60">Nenhuma legenda detectada (track não carregou).</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Audio Menu */}
            {showAudio ? (
              <div className="absolute inset-0 z-50 bg-black/30" onClick={() => setShowAudio(false)}>
                <div
                  className="absolute right-4 bottom-24 w-[280px] rounded-xl bg-[#0b0b0b] border border-white/10 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-sm font-semibold text-white/90">Idioma (áudio)</div>
                  <div className="mt-2 flex flex-col gap-2">
                    {audioTracks.length ? (
                      audioTracks.map((t, idx) => (
                        <button
                          key={`${idx}-${t?.name || t?.lang || "audio"}`}
                          className="w-full text-left rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-sm"
                          onClick={() => {
                            const hls = hlsRef.current;
                            const v = videoRef.current;
                            if (!hls || !v) return;

                            try {
                              const tt = Number(v.currentTime || 0);
                              if (tt > 0.5 && !anti.userSeekRecently()) {
                                anti.pendingRestoreRef.current = { time: tt, reason: "user-audio-pick", tries: 0 };
                              }
                              hls.audioTrack = idx;
                              setActiveAudioTrack(idx);
                              setShowAudio(false);
                              armAutoHide();
                            } catch {}
                          }}
                        >
                          {t?.name || t?.lang || `Faixa ${idx + 1}`} {activeAudioTrack === idx ? "✓" : ""}
                        </button>
                      ))
                    ) : (
                      <div className="text-xs text-white/60">Sem faixas de áudio alternativas.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Help overlay */}
            {showHelp ? (
              <div className="absolute inset-0 z-[55] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b0b0b]/95 p-5">
                  <div className="text-sm font-semibold text-white/90">Atalhos do player</div>
                  <div className="mt-3 space-y-2 text-sm text-white/75">
                    <div><b className="text-white/90">Espaço</b> • Play/Pause</div>
                    <div><b className="text-white/90">← / →</b> • Voltar/avançar 10s</div>
                    <div><b className="text-white/90">S</b> • Pular intro</div>
                    <div><b className="text-white/90">F</b> • Tela cheia</div>
                    <div><b className="text-white/90">Esc</b> • Fechar menus</div>
                    <div><b className="text-white/90">H ou ?</b> • Mostrar/ocultar ajuda</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowHelp(false)}
                    className="mt-4 w-full rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm text-white/85"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
