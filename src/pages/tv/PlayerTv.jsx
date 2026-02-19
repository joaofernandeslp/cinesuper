// src/pages/tv/PlayerTv.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { RotateCcw, RotateCw, SkipForward, ListVideo, ArrowLeft, Settings } from "lucide-react";

import { supabase } from "../../lib/supabaseClient.js";
import { verifyPin, setUnlocked } from "../../lib/profilePolicy.js";

import { WATCH_BASE, INTRO_SRC, INTRO_MODE } from "../../player/env.js";
import { clamp, safeId } from "../../player/utils.js";
import { inferThumbsVttUrlFromMaster, buildSubtitleGatewayUrl } from "../../player/gateway.js";
import { fetchWithRetry, parseThumbnailsVtt } from "../../player/thumbs.js";
import { gateReasonText, getClassification, getEpisodeLine, getMainTitle } from "../../player/overlay.js";

import { useAutoHideUi } from "../../hooks/player/useAutoHideUi.js";
import { useAntiResetGuard } from "../../hooks/player/useAntiResetGuard.js";
import { useWatchProgress } from "../../hooks/player/useWatchProgress.js";
import { useDeviceSession } from "../../hooks/player/useDeviceSession.js";
import { usePlayerBootstrap } from "../../hooks/player/usePlayerBootstrap.js";
import { usePlaybackEngine } from "../../hooks/player/usePlaybackEngine.js";
import { useNativePlaybackEngine } from "../../hooks/player/useNativePlaybackEngine.js";
import { exoPlayer, isNativeAndroid, isNativeExoAvailable } from "../../native/exoplayer.js";

// ✅ helpers/UI modularizados
import { pickThumbCueAtTime, blurActiveElement } from "./player/helpers.js";

// ✅ novos módulos p/ reduzir PlayerTv
import { useTvTrackMenus } from "./player/hooks/useTvTrackMenus.js";
import { useTvPlayerHotkeys } from "./player/hooks/useTvPlayerHotkeys.js";
import TvPlayerView from "./player/components/TvPlayerView.jsx";

// quando faltar <= X segundos, mostra botão "Próximo episódio"
const NEXT_UP_THRESHOLD_SEC = 240; // 4min

/* =========================
   EP helpers (robustos)
========================= */
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

function formatTimeSec(t) {
  const x = Number(t || 0);
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  const s = (x % 60).toFixed(3).padStart(6, "0");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`;
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

function epRouteId(ep) {
  return String(ep?.publicId || ep?.public_id || ep?.id || "").trim();
}
function pickSeasonNum(ep) {
  const v = ep?.season ?? ep?.seasonNumber ?? ep?.season_number ?? ep?.season_num ?? 1;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function pickEpisodeNum(ep) {
  const v =
    ep?.episode ??
    ep?.episodeNumber ??
    ep?.episode_number ??
    ep?.ep_number ??
    ep?.number ??
    1;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function episodeMatchesRoute(ep, routeId) {
  const cur = safeId(routeId);
  if (!cur) return false;
  const cands = [epRouteId(ep), ep?.public_id, ep?.publicId, ep?.id].map((x) => safeId(x));
  return cands.some((x) => x && x === cur);
}

export default function PlayerTv() {
  const location = useLocation();
  const NATIVE_PLAYER_HOTFIX_DISABLED = true;
  const [forceWebPlayer, setForceWebPlayer] = useState(() => {
    try {
      return localStorage.getItem("cs_tv_force_web_player") === "1";
    } catch {
      return false;
    }
  });
  const useNativePlayer = useMemo(
    () =>
      !NATIVE_PLAYER_HOTFIX_DISABLED &&
      !forceWebPlayer &&
      isNativeAndroid() &&
      isNativeExoAvailable(),
    [forceWebPlayer]
  );

  // ✅ debug: ?nextup=1 força mostrar botão (se existir próximo episódio)
  const forceNextUp = useMemo(() => {
    const sp = new URLSearchParams(location.search || "");
    return sp.get("nextup") === "1";
  }, [location.search]);

  // ✅ start override (inclui start=0). Se existir, ignora resume do banco.
  const { forceFreshStart, startParam } = useMemo(() => {
    const sp = new URLSearchParams(location.search || "");
    const fresh = sp.get("fresh") === "1" || sp.get("noresume") === "1";

    let start = null;
    if (sp.has("start")) {
      const raw = sp.get("start"); // "0", "123", "" (se ?start=)
      if (raw !== null && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n)) start = Math.max(0, Math.floor(n));
      }
    }

    return { forceFreshStart: fresh, startParam: start };
  }, [location.search]);

  const { id } = useParams();
  const navigate = useNavigate();

  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  // ✅ para refresh de token sem reiniciar o engine
  const pbBodyRef = useRef(null);
  const pbExpRef = useRef(0);

  const [pbTokenState, setPbTokenState] = useState("");
  const [gatewayOriginState, setGatewayOriginState] = useState("");
  const [subsTokenBump, setSubsTokenBump] = useState(0);

  // Crash overlay (TV-friendly)
  const [crash, setCrash] = useState("");
  useEffect(() => {
    const onErr = (e) => setCrash(String(e?.message || e?.error?.message || e));
    const onRej = (e) => setCrash(String(e?.reason?.message || e?.reason || e));
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  // Portal target
  const portalTarget = useMemo(() => {
    if (typeof document === "undefined") return null;
    let el = document.getElementById("cs-tv-player-portal");
    if (!el) {
      el = document.createElement("div");
      el.id = "cs-tv-player-portal";
      document.body.appendChild(el);
    }
    return el;
  }, []);

  // Fullscreen lock
  useEffect(() => {
    if (typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;

    const prev = {
      htmlH: html.style.height,
      htmlBG: html.style.background,
      bodyH: body.style.height,
      bodyW: body.style.width,
      bodyM: body.style.margin,
      bodyP: body.style.padding,
      bodyO: body.style.overflow,
      bodyBG: body.style.background,
    };

    html.style.height = "100%";
    body.style.height = "100%";
    body.style.width = "100%";
    body.style.margin = "0";
    body.style.padding = "0";
    body.style.overflow = "hidden";
    const bg = useNativePlayer ? "transparent" : "#000";
    html.style.background = bg;
    body.style.background = bg;

    return () => {
      html.style.height = prev.htmlH;
      body.style.height = prev.bodyH;
      body.style.width = prev.bodyW;
      body.style.margin = prev.bodyM;
      body.style.padding = prev.bodyP;
      body.style.overflow = prev.bodyO;
      body.style.background = prev.bodyBG;
      html.style.background = prev.htmlBG;
    };
  }, [useNativePlayer]);

  // Main states
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [webStuck, setWebStuck] = useState(false);
  const [webStuckFocus, setWebStuckFocus] = useState(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const currentRawRef = useRef(0);
  const lastUiUpdateMsRef = useRef(0);
  const uiVisibleRef = useRef(true);

  const [textTracks, setTextTracks] = useState([]);
  const [audioTracks, setAudioTracks] = useState([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState(-1);

  const setCurrentLite = useCallback(
    (t) => {
      const v = Number(t || 0);
      currentRawRef.current = v;

      if (uiVisibleRef.current) {
        lastUiUpdateMsRef.current = Date.now();
        setCurrent(v);
        return;
      }

      const now = Date.now();
      const minMs = 1000;
      if (now - (lastUiUpdateMsRef.current || 0) >= minMs) {
        lastUiUpdateMsRef.current = now;
        setCurrent(v);
      }
    },
    [setCurrent]
  );

  const getCurrentTimeForProgress = useCallback(() => Number(currentRawRef.current || 0), []);
  const getDurationForProgress = useCallback(() => Number(duration || 0), [duration]);

  const [thumbCues, setThumbCues] = useState([]);

  const hasStartedRef = useRef(false);
  const [hasStarted, setHasStarted] = useState(false);

  const ratingShownRef = useRef(false);
  const [ratingVisible, setRatingVisible] = useState(false);
  const [ratingPayload, setRatingPayload] = useState({ age: "", descText: "" });
  const ratingTimersRef = useRef({ out: null });

  const allow4kRef = useRef(false);
  const titlePublicIdRef = useRef("");
  const titleDbIdRef = useRef("");

  // Gate
  const [gate, setGate] = useState({ blocked: false, reason: "", needPin: false, profile: null });
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [gateBump, setGateBump] = useState(0);
  const gateRef = useRef(gate);
  useEffect(() => {
    gateRef.current = gate;
  }, [gate]);

  // Auto-hide
  const { showUI, armAutoHide, clearHideTimer } = useAutoHideUi({ delayMs: 2400 });

  // Intro flags
  const [introDone, setIntroDone] = useState(false);
  const introEnabledRef = useRef(false);
  const introDoneRef = useRef(false);

  const introKey = useMemo(() => `cs_intro_done_${String(INTRO_SRC || "").slice(0, 80)}`, []);
  const introInitRef = useRef({ lastId: null });

  // Playback URLs
  const [pbSrc, setPbSrc] = useState("");
  const [pbThumbs, setPbThumbs] = useState("");
  const pbSrcRef = useRef("");

  // ✅ alinha token/origin com pbSrc inicial
  useEffect(() => {
    pbSrcRef.current = pbSrc;
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

  // Episodes
  const [seasonEpisodes, setSeasonEpisodes] = useState([]);

  // Rating
  const showRatingOnce = useCallback(() => {
    if (ratingShownRef.current) return;
    ratingShownRef.current = true;

    const payload = getClassification(item);
    setRatingPayload(payload);
    setRatingVisible(true);

    if (ratingTimersRef.current.out) clearTimeout(ratingTimersRef.current.out);
    ratingTimersRef.current.out = setTimeout(() => setRatingVisible(false), 8000);
  }, [item]);

  const markStarted = useCallback(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    setHasStarted(true);
    if (item?.id) showRatingOnce();
  }, [item, showRatingOnce]);

  // Device session
  const { reportSessionState, stopHeartbeat } = useDeviceSession({
    supabase,
    titlePublicIdRef,
    titleDbIdRef,
    setError,
  });

  // Watch progress
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
    getCurrentTime: getCurrentTimeForProgress,
    getDuration: getDurationForProgress,
  });

  // ✅ se vier ?start=..., o bootstrap deve usar exatamente esse valor (0 inclusive)
  const computeResumeWithStartOverride = useCallback(
    async (...args) => {
      const override = forceFreshStart ? 0 : startParam != null ? startParam : null;

      if (override != null) {
        resumeFromRef.current = override;
        appliedResumeRef.current = false;
        return override;
      }

      return computeResume(...args);
    },
    [forceFreshStart, startParam, computeResume, resumeFromRef, appliedResumeRef]
  );

  // Anti-reset guard
  const anti = useAntiResetGuard({
    videoRef,
    hlsRef,
    scrubbingRef: { current: false },
    durationState: duration,
  });

  // Reset local state
  const resetPlayerLocalState = useCallback(() => {
    setError("");
    setThumbCues([]);

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
  }, [anti]);

  // Bootstrap
  const bootstrap = usePlayerBootstrap({
    supabase,
    id,
    initialItem: location?.state?.item || null,
    locationSearch: location.search,
    gateBump,
    setGate,
    titlePublicIdRef,
    titleDbIdRef,
    allow4kRef,
    setError,
    setSeasonEpisodes,
    setItem,
    setPbSrc,
    setPbThumbs,
    setThumbCues,

    // ✅ para refresh do token no engine
    pbBodyRef,
    pbExpRef,

    resetPlayerLocalState,
    computeResume: computeResumeWithStartOverride,
    reportSessionState,
  });

  const isLoading = !!bootstrap.loading;
  const loadingStage = String(bootstrap.stage || "").trim();
  const bootEffectAlive = !!bootstrap.effectAlive;
  const nativeReady =
    useNativePlayer &&
    bootEffectAlive &&
    (pbSrc || (bootstrap.introEnabled && !introDone));
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const [jsTick, setJsTick] = useState(0);
  const debugInfo = useMemo(() => {
    const online = typeof navigator !== "undefined" ? navigator.onLine : null;
    return {
      id: String(id || "").trim(),
      path: String(location?.pathname || "").trim(),
      search: String(location?.search || "").trim(),
      nativePlayer: useNativePlayer ? "yes" : "no",
      online: online == null ? "?" : online ? "online" : "offline",
    };
  }, [id, location?.pathname, location?.search, useNativePlayer]);
  useEffect(() => {
    if (!isLoading) {
      setLoadingTooLong(false);
      return;
    }
    const t = setTimeout(() => setLoadingTooLong(true), 20000);
    return () => clearTimeout(t);
  }, [isLoading]);
  useEffect(() => {
    const id = setInterval(() => setJsTick((t) => (t + 1) % 100000), 1000);
    return () => clearInterval(id);
  }, []);
  const hasItem = !!item;

  // Profile change
  useEffect(() => {
    const onProfileChanged = () => {
      try {
        if (useNativePlayer) exoPlayer.pause();
        else videoRef.current?.pause?.();
      } catch {}
      const oldPid = gateRef.current?.profile?.id || null;
      saveProgress({ force: true, profileId: oldPid }).catch(() => {});
      try {
        stopProgressTimer();
      } catch {}
      setGateBump((n) => n + 1);
    };
    window.addEventListener("cs:profile-changed", onProfileChanged);
    return () => window.removeEventListener("cs:profile-changed", onProfileChanged);
  }, [saveProgress, stopProgressTimer, useNativePlayer]);

  // Intro init (once/per_title)
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
    }

    const initialDone = !enabled || alreadyOnce;
    introDoneRef.current = initialDone;
    setIntroDone(initialDone);
  }, [id, bootstrap.introEnabled, introKey]);

  useEffect(() => {
    introDoneRef.current = introDone;
  }, [introDone]);

  const finishIntro = useCallback(() => {
    const v = videoRef.current;

    introDoneRef.current = true;
    setIntroDone(true);

    if (bootstrap.introEnabled && INTRO_MODE === "once") {
      try {
        sessionStorage.setItem(introKey, "1");
      } catch {}
    }

    if (useNativePlayer) {
      try {
        exoPlayer.pause();
      } catch {}
    } else if (v) {
      try {
        v.pause?.();
      } catch {}
      try {
        v.removeAttribute("src");
        v.load?.();
      } catch {}
    }
    setIsPlaying(false);
  }, [bootstrap.introEnabled, introKey, useNativePlayer]);

  // Thumbs VTT
  const thumbsVttUrl = useMemo(() => {
    if (pbThumbs) return pbThumbs;
    if (pbSrc) return inferThumbsVttUrlFromMaster(pbSrc);
    return "";
  }, [pbThumbs, pbSrc]);

  useEffect(() => {
    let alive = true;

    async function loadVtt() {
      setThumbCues([]);
      if (!thumbsVttUrl) return;

      try {
        const res = await fetchWithRetry(thumbsVttUrl, { retries: 2, timeoutMs: 8000 });
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
    };
  }, [thumbsVttUrl]);

  // PB token/origin (atualizável após refresh)
  const pbToken =
    pbTokenState ||
    (() => {
      try {
        return pbSrc ? new URL(pbSrc).searchParams.get("t") || "" : "";
      } catch {
        return "";
      }
    })();

  const gatewayOrigin =
    gatewayOriginState ||
    (() => {
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

    async function buildM3uSubs() {
      if (useNativePlayer) {
        if (alive) setM3uSubsMap({});
        return;
      }

      const nextMap = {};
      const list = Array.isArray(subtitleFiles) ? subtitleFiles : [];
      if (!list.length) {
        if (alive) setM3uSubsMap({});
        return;
      }

      for (const s of list) {
        const resolved = subtitleToGatewayUrl(s?.src);
        if (!resolved || !isM3u8Url(resolved)) continue;

        try {
          const res = await fetchWithRetry(resolved, { retries: 2, timeoutMs: 8000 });
          const m3uText = await res.text();
          const segs = parseM3u8Segments(m3uText, resolved);
          if (!segs.length) continue;

          const allCues = [];
          let offset = 0;

          for (const seg of segs) {
            const segRes = await fetchWithRetry(seg.url, { retries: 2, timeoutMs: 8000 });
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
          // ignora
        }
      }

      if (alive) setM3uSubsMap(nextMap);
    }

    buildM3uSubs();
    return () => {
      alive = false;
      for (const u of revokeList) {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      }
    };
  }, [subtitleFiles, subtitleToGatewayUrl, subsTokenBump, useNativePlayer]);

  const syncTextTracks = useCallback(() => {
    if (useNativePlayer) return;
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
  }, [useNativePlayer]);

  // ✅ duração efetiva (TV às vezes começa com duration=0)
  const effectiveDuration = useMemo(() => {
    const d = Number(duration || 0);
    if (Number.isFinite(d) && d > 0) return d;

    const fallback = Number(item?.durationSec ?? item?.duration_sec ?? item?.duration_seconds ?? 0);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }, [duration, item?.durationSec, item?.duration_sec, item?.duration_seconds]);

  const remainingSec = useMemo(() => {
    const d = Number(effectiveDuration || 0);
    const c = Number(current || 0);
    if (!Number.isFinite(d) || d <= 0) return 0;
    if (!Number.isFinite(c) || c < 0) return Math.floor(d);
    return Math.max(0, Math.floor(d - c));
  }, [effectiveDuration, current]);

  // ✅ próximo episódio: ordena e acha o atual por match robusto
  const orderedEpisodes = useMemo(() => {
    const eps = Array.isArray(seasonEpisodes) ? [...seasonEpisodes] : [];
    eps.sort((a, b) => {
      const sa = pickSeasonNum(a);
      const sb = pickSeasonNum(b);
      if (sa !== sb) return sa - sb;
      return pickEpisodeNum(a) - pickEpisodeNum(b);
    });
    return eps;
  }, [seasonEpisodes]);

  const currentEpisodeIndex = useMemo(() => {
    if (!orderedEpisodes.length) return -1;
    return orderedEpisodes.findIndex((ep) => episodeMatchesRoute(ep, id));
  }, [orderedEpisodes, id]);

  const nextEpisodeRouteId = useMemo(() => {
    if (currentEpisodeIndex < 0) return "";
    const ep = orderedEpisodes[currentEpisodeIndex + 1] || null;
    return ep ? epRouteId(ep) : "";
  }, [orderedEpisodes, currentEpisodeIndex]);

  // engine só precisa de {id}
  const nextEpisodeForEngine = useMemo(() => {
    return nextEpisodeRouteId ? { id: nextEpisodeRouteId } : null;
  }, [nextEpisodeRouteId]);

  // Playback engine (com refresh)
  usePlaybackEngine({
    videoRef,
    hlsRef,
    pbSrc,
    loading: bootstrap.loading,
    gate,
    disabled: useNativePlayer,

    // ✅ refresh sem reiniciar
    supabase,
    pbBodyRef,
    pbExpRef,
    onTokenRefreshed: ({ master, thumbs }) => {
      if (thumbs) setPbThumbs(String(thumbs));

      try {
        const u = new URL(String(master || ""));
        setPbTokenState(u.searchParams.get("t") || "");
        setGatewayOriginState(u.origin || "");
        setSubsTokenBump((n) => n + 1);
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
    setCurrent: setCurrentLite,
    setDuration,
    setTextTracks,
    setAudioTracks,
    setActiveAudioTrack,
    syncTextTracks,

    nextEpisode: nextEpisodeForEngine,
    navigate,
  });

  useNativePlaybackEngine({
    enabled: nativeReady,
    pbSrc,
    loading: bootstrap.loading,
    gate,

    supabase,
    pbBodyRef,
    pbExpRef,
    onTokenRefreshed: ({ master, thumbs }) => {
      if (thumbs) setPbThumbs(String(thumbs));

      try {
        const u = new URL(String(master || ""));
        setPbTokenState(u.searchParams.get("t") || "");
        setGatewayOriginState(u.origin || "");
        setSubsTokenBump((n) => n + 1);
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

    lastGoodTimeRef: anti.lastGoodTimeRef,
    pendingRestoreRef: anti.pendingRestoreRef,
    appliedResumeRef,
    resumeFromRef,

    armAutoHide,
    clearHideTimer,

    setError,
    setIsPlaying,
    setCurrent: setCurrentLite,
    setDuration,
    setTextTracks,
    setAudioTracks,
    setActiveAudioTrack,

    nextEpisode: nextEpisodeForEngine,
    navigate,

    subtitleFiles,
    subtitleToGatewayUrl,
  });

  // Hotfix: garante remover qualquer camada nativa residual quando estiver em web player.
  useEffect(() => {
    if (useNativePlayer) return;
    try {
      exoPlayer.pause();
      exoPlayer.setVisible(false);
      exoPlayer.destroy();
    } catch {}
  }, [useNativePlayer]);

  const retryWebPlayback = useCallback(() => {
    setError("");
    setWebStuck(false);
    setWebStuckFocus(0);

    const cur = String(pbSrcRef.current || "");
    if (!cur) return;

    try {
      hlsRef.current?.destroy?.();
    } catch {}
    hlsRef.current = null;

    try {
      const v = videoRef.current;
      if (v) {
        v.pause?.();
        v.removeAttribute("src");
        v.load?.();
      }
    } catch {}

    setPbSrc("");
    setTimeout(() => setPbSrc(cur), 60);
  }, [setPbSrc]);

  useEffect(() => {
    setWebStuck(false);
    setWebStuckFocus(0);
  }, [pbSrc, introDone, bootstrap.introEnabled]);

  useEffect(() => {
    if (!webStuck) return;
    if (isPlaying || Number(currentRawRef.current || 0) > 0.25) {
      setWebStuck(false);
    }
  }, [webStuck, isPlaying]);

  // Watchdog: se o web player nao iniciar, mostra overlay de retry
  useEffect(() => {
    if (useNativePlayer) return;
    if (webStuck) return;
    if (bootstrap.loading) return;
    if (gate.blocked) return;

    const shouldPlayNow = !!pbSrc || (!!bootstrap.introEnabled && !introDone);
    if (!shouldPlayNow) return;
    if (isPlaying || Number(currentRawRef.current || 0) > 0.25) return;

    const t = setTimeout(() => {
      if (isPlaying || Number(currentRawRef.current || 0) > 0.25) return;
      setError("Nao conseguimos iniciar o video.");
      setWebStuck(true);
      setWebStuckFocus(0);
    }, 8000);

    return () => clearTimeout(t);
  }, [
    useNativePlayer,
    webStuck,
    bootstrap.loading,
    gate.blocked,
    pbSrc,
    bootstrap.introEnabled,
    introDone,
    isPlaying,
    setError,
  ]);

  // Fallback automático: se o player nativo não iniciar, troca para web player.
  useEffect(() => {
    if (!useNativePlayer) return;
    if (bootstrap.loading) return;
    if (gate.blocked) return;

    const shouldPlayNow = !!pbSrc || (!!bootstrap.introEnabled && !introDone);
    if (!shouldPlayNow) return;
    if (isPlaying || Number(currentRawRef.current || 0) > 0.25) return;

    const t = setTimeout(() => {
      if (isPlaying || Number(currentRawRef.current || 0) > 0.25) return;

      console.error("[TV] Native player watchdog timeout -> fallback web player");
      try {
        localStorage.setItem("cs_tv_force_web_player", "1");
      } catch {}
      try {
        exoPlayer.pause();
        exoPlayer.destroy();
      } catch {}
      setError("Ativamos modo de compatibilidade nesta TV. Tente reproduzir novamente.");
      setForceWebPlayer(true);
    }, 6500);

    return () => clearTimeout(t);
  }, [
    useNativePlayer,
    bootstrap.loading,
    gate.blocked,
    pbSrc,
    bootstrap.introEnabled,
    introDone,
    isPlaying,
    setError,
  ]);

  // Mark started
  useEffect(() => {
    if (isPlaying && !isIntroPlaying) markStarted();
  }, [isPlaying, isIntroPlaying, markStarted]);

  // Save on hidden
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

  // Cleanup final
  useEffect(() => {
    return () => {
      try {
        if (useNativePlayer) {
          exoPlayer.pause();
          exoPlayer.setVisible(false);
          exoPlayer.destroy();
        } else {
          videoRef.current?.pause?.();
        }
      } catch {}

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

  /* =========================
     UI / Navigation
  ========================= */
  const isIntroPlaying = !!bootstrap.introEnabled && !introDone && !gate.blocked;

  // panel: none | episodes | bubble-audio | bubble-subs | gatepin
  const [panel, setPanel] = useState("none");
  const overlayOpen = panel === "episodes" || panel === "bubble-audio" || panel === "bubble-subs";

  // ✅ NextUp visibilidade (threshold + debug ?nextup=1)
  const nextUpVisible = useMemo(() => {
    if (!nextEpisodeRouteId) return false;
    if (gate.blocked) return false;
    if (isIntroPlaying) return false;
    if (panel !== "none") return false;

    if (forceNextUp) return true;

    if (!Number.isFinite(effectiveDuration) || effectiveDuration <= 0) return false;
    if (!Number.isFinite(remainingSec) || remainingSec <= 0) return false;

    return remainingSec <= NEXT_UP_THRESHOLD_SEC;
  }, [
    nextEpisodeRouteId,
    gate.blocked,
    isIntroPlaying,
    panel,
    forceNextUp,
    effectiveDuration,
    remainingSec,
  ]);

  // debug log (só quando ?nextup=1)
  useEffect(() => {
    if (!forceNextUp) return;
    console.log("[NEXTUP DEBUG]", {
      id,
      seasonEpisodes: Array.isArray(seasonEpisodes) ? seasonEpisodes.length : 0,
      currentEpisodeIndex,
      nextEpisodeRouteId,
      effectiveDuration,
      current,
      remainingSec,
      gateBlocked: gate.blocked,
      isIntroPlaying,
      panel,
      nextUpVisible,
    });
  }, [
    forceNextUp,
    id,
    seasonEpisodes,
    currentEpisodeIndex,
    nextEpisodeRouteId,
    effectiveDuration,
    current,
    remainingSec,
    gate.blocked,
    isIntroPlaying,
    panel,
    nextUpVisible,
  ]);

  useEffect(() => {
    if (!nextUpVisible) return;
    armAutoHide();
  }, [nextUpVisible, remainingSec, armAutoHide]);

  const uiVisible = showUI || gate.blocked || isIntroPlaying || nextUpVisible;

  useEffect(() => {
    uiVisibleRef.current = uiVisible;
    if (uiVisible) {
      const v = Number(currentRawRef.current || 0);
      lastUiUpdateMsRef.current = Date.now();
      setCurrent(v);
    }
  }, [uiVisible, setCurrent]);

  // Seek preview
  const [seekPreview, setSeekPreview] = useState({ show: false, time: 0, cue: null });
  const seekPreviewTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (seekPreviewTimerRef.current) clearTimeout(seekPreviewTimerRef.current);
    };
  }, []);

  const showSeekPreview = useCallback(
    (t) => {
      const cue = pickThumbCueAtTime(thumbCues, t);
      setSeekPreview({ show: true, time: Number(t || 0), cue });

      if (seekPreviewTimerRef.current) clearTimeout(seekPreviewTimerRef.current);
      seekPreviewTimerRef.current = setTimeout(() => {
        setSeekPreview((p) => ({ ...p, show: false }));
      }, 1200);
    },
    [thumbCues]
  );

  const togglePlay = useCallback(() => {
    if (gate?.blocked) return;
    const v = videoRef.current;

    if (useNativePlayer) {
      if (isPlaying) exoPlayer.pause();
      else exoPlayer.play();
      armAutoHide();
      return;
    }

    if (!v) return;

    if (isIntroPlaying) {
      if (v.paused) v.play().catch(() => {});
      else v.pause?.();
      armAutoHide();
      return;
    }

    if (v.paused) {
      markStarted();
      v.play().catch(() => {});
    } else {
      v.pause?.();
    }
    armAutoHide();
  }, [gate?.blocked, isIntroPlaying, armAutoHide, markStarted, useNativePlayer, isPlaying]);

  const seekBy = useCallback(
    (deltaSec, reason = "tv-seek") => {
      anti.noteUserSeek(reason);

      if (useNativePlayer) {
        const base = Number(currentRawRef.current || 0);
        const nextT = Math.max(0, base + Number(deltaSec || 0));
        exoPlayer.seek(nextT);
        showSeekPreview(nextT);
        armAutoHide();
        return;
      }

      const v = videoRef.current;
      if (!v) return;

      const nextT = Math.max(0, Number(v.currentTime || 0) + Number(deltaSec || 0));
      try {
        v.currentTime = nextT;
      } catch {}
      showSeekPreview(nextT);
      armAutoHide();
    },
    [anti, showSeekPreview, armAutoHide, useNativePlayer]
  );

  const goNextEpisode = useCallback(() => {
    if (!nextEpisodeRouteId) return;

    reportSessionState({
      profileId: gateRef.current?.profile?.id || null,
      titleDbId: String(titleDbIdRef.current || "") || null,
      is_playing: false,
    });

    navigate(`${WATCH_BASE}/${nextEpisodeRouteId}`);
  }, [nextEpisodeRouteId, reportSessionState, navigate]);

  const backTargetTitleId = useMemo(() => {
    const fromItemId = safeId(location?.state?.item?.id || "");
    return fromItemId || safeId(id);
  }, [location?.state?.item?.id, id]);

  const goBack = useCallback(() => {
    navigate(`/t/${backTargetTitleId}`, {
      replace: true,
      state: { from: location?.state?.from || "/browse" },
    });
  }, [navigate, backTargetTitleId, location?.state?.from]);

  const [menuIndex, setMenuIndex] = useState(0);
  const menuRefs = useRef([]);

  const closeOverlay = useCallback(() => {
    setPanel("none");
    setMenuIndex(0);
    menuRefs.current = [];
    armAutoHide();
  }, [armAutoHide]);

  // PIN
  const [pinFocus, setPinFocus] = useState(0);
  const pinKeyRefs = useRef([]);
  const [pinBusy, setPinBusy] = useState(false);

  const submitPin = useCallback(async () => {
    const prof = gateRef.current?.profile;
    if (!prof) return;
    if (pinBusy) return;

    setPinBusy(true);
    setPinError("");

    try {
      const ok = await verifyPin(prof, pinInput);
      if (!ok) {
        setPinError("PIN inválido.");
        return;
      }

      setPinError("");
      setUnlocked(prof.id, item?.id || id);
      setPinInput("");
      setError("");
      setGate({ blocked: false, reason: "", needPin: false, profile: prof });
      setGateBump((n) => n + 1);
      setPanel("none");
      armAutoHide();
    } finally {
      setPinBusy(false);
    }
  }, [pinInput, item?.id, id, armAutoHide, pinBusy]);

  // auto-open pin
  useEffect(() => {
    if (gate.blocked && gate.needPin) {
      setPanel("gatepin");
      clearHideTimer();
    } else if (panel === "gatepin" && (!gate.blocked || !gate.needPin)) {
      setPanel("none");
      armAutoHide();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.blocked, gate.needPin]);

  // Focus areas
  const [focusArea, setFocusArea] = useState("none"); // none | controls | progress | top
  useEffect(() => {
    if (!uiVisible) setFocusArea("none");
  }, [uiVisible]);

  useEffect(() => {
    if (focusArea === "progress") blurActiveElement();
  }, [focusArea]);

  const [topFocus, setTopFocus] = useState(0);
  const topRefs = useRef([]);

  const [focusIndex, setFocusIndex] = useState(0);
  const btnRefs = useRef([]);

  // Episodes menu
  const episodesMenu = useMemo(() => {
    const eps = Array.isArray(orderedEpisodes) ? orderedEpisodes : [];
    return eps.map((ep, idx) => {
      const rid = epRouteId(ep);
      const epNum = pickEpisodeNum(ep);
      return {
        key: rid || idx,
        id: rid,
        label: `${epNum}. ${ep.title || "Episódio"}`,
        sub: ep.duration || ep.durationLabel || "",
        right: episodeMatchesRoute(ep, id) ? "▶" : "",
      };
    });
  }, [orderedEpisodes, id]);

  const setNativeTextTrack = useCallback(
    (idx) => {
      if (!useNativePlayer) return;
      exoPlayer.setTextTrack(idx);
    },
    [useNativePlayer]
  );

  const setNativeAudioTrack = useCallback(
    (idx) => {
      if (!useNativePlayer) return;
      exoPlayer.setAudioTrack(idx);
    },
    [useNativePlayer]
  );

  // ✅ tracks + chips (tirados do PlayerTv)
  const { hasTracks, showChips, subsMenu, audioMenu, chips, applySubsIdx, applyAudioIdx } = useTvTrackMenus({
    videoRef,
    hlsRef,
    anti,
    textTracks,
    audioTracks,
    activeAudioTrack,
    setActiveAudioTrack,
    syncTextTracks,
    clearHideTimer,
    setPanel,
    setMenuIndex,
    setTextTrack: useNativePlayer ? setNativeTextTrack : null,
    setAudioTrack: useNativePlayer ? setNativeAudioTrack : null,
  });

  // NextUp button indexes
  const showNextUpButton = nextUpVisible && !!nextEpisodeRouteId;
  const nextBtnIndex = useMemo(() => 1 + (showChips ? chips.length : 0), [showChips, chips.length]);
  const controlsMaxIndex = useMemo(() => {
    const total = 1 + (showChips ? chips.length : 0) + (showNextUpButton ? 1 : 0);
    return Math.max(0, total - 1);
  }, [showChips, chips.length, showNextUpButton]);

  // Top actions
  const focusFirstChip = useCallback(() => {
    if (!showChips) return;
    armAutoHide();
    setFocusArea("controls");
    setFocusIndex(1);
    setTimeout(() => btnRefs.current?.[1]?.focus?.(), 0);
  }, [showChips, armAutoHide]);

  const topActions = useMemo(() => {
    const arr = [];

    arr.push({
      key: "back",
      kind: "icon",
      icon: ArrowLeft,
      disabled: false,
      onClick: () => {
        const fromItemId = safeId(location?.state?.item?.id || "");
        const backTargetTitleId2 = fromItemId || safeId(id);
        navigate(`/t/${backTargetTitleId2}`, { replace: true, state: { from: location?.state?.from || "/browse" } });
      },
      ariaLabel: "Voltar",
    });

    arr.push({
      key: "options",
      kind: "pill",
      icon: Settings,
      label: "Opções",
      disabled: gate.blocked || isIntroPlaying || !showChips,
      onClick: focusFirstChip,
    });

    arr.push({
      key: "back10",
      kind: "icon",
      icon: RotateCcw,
      disabled: gate.blocked || isIntroPlaying,
      onClick: () => seekBy(-10, "tv-back10"),
      ariaLabel: "Retroceder 10 segundos",
    });

    arr.push({
      key: "fwd10",
      kind: "icon",
      icon: RotateCw,
      disabled: gate.blocked || isIntroPlaying,
      onClick: () => seekBy(10, "tv-fwd10"),
      ariaLabel: "Avançar 10 segundos",
    });

    if (nextEpisodeRouteId) {
      arr.push({
        key: "next",
        kind: "icon",
        icon: SkipForward,
        disabled: gate.blocked || isIntroPlaying,
        onClick: goNextEpisode,
        ariaLabel: "Próximo episódio",
      });
    }

    if (orderedEpisodes?.length) {
      arr.push({
        key: "episodes",
        kind: "icon",
        icon: ListVideo,
        disabled: gate.blocked || isIntroPlaying || !orderedEpisodes?.length,
        onClick: () => {
          clearHideTimer();
          setPanel("episodes");
          setMenuIndex(0);
        },
        ariaLabel: "Episódios",
      });
    }

    return arr;
  }, [
    location?.state?.item?.id,
    location?.state?.from,
    navigate,
    id,
    gate.blocked,
    isIntroPlaying,
    hasTracks,
    focusFirstChip,
    seekBy,
    nextEpisodeRouteId,
    goNextEpisode,
    orderedEpisodes?.length,
    clearHideTimer,
  ]);

  // Clamp focus
  useEffect(() => {
    const maxTop = Math.max(0, topActions.length - 1);
    setTopFocus((n) => Math.max(0, Math.min(maxTop, n)));
  }, [topActions.length]);

  useEffect(() => {
    setFocusIndex((n) => Math.max(0, Math.min(controlsMaxIndex, n)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlsMaxIndex]);

  // clamp menu index for overlays
  useEffect(() => {
    if (!overlayOpen) return;

    const list =
      panel === "episodes"
        ? episodesMenu
        : panel === "bubble-audio"
        ? audioMenu
        : panel === "bubble-subs"
        ? subsMenu
        : [];
    const max = Math.max(0, (list?.length || 0) - 1);
    setMenuIndex((n) => Math.max(0, Math.min(max, n)));
  }, [overlayOpen, panel, episodesMenu, audioMenu, subsMenu]);

  // ensure initial UI focus
  useEffect(() => {
    if (!uiVisible || overlayOpen || gate.blocked || isIntroPlaying || panel !== "none") return;

    const t = setTimeout(() => {
      setFocusArea("controls");
      setFocusIndex(0);
      btnRefs.current?.[0]?.focus?.();
    }, 60);

    return () => clearTimeout(t);
  }, [uiVisible, overlayOpen, gate.blocked, isIntroPlaying, panel]);

  // focus effects
  useEffect(() => {
    if (focusArea !== "top") return;
    const t = setTimeout(() => topRefs.current?.[topFocus]?.focus?.(), 0);
    return () => clearTimeout(t);
  }, [focusArea, topFocus]);

  useEffect(() => {
    if (focusArea !== "controls") return;
    const t = setTimeout(() => btnRefs.current?.[focusIndex]?.focus?.(), 0);
    return () => clearTimeout(t);
  }, [focusArea, focusIndex]);

  // Derived UI
  const mainTitle = useMemo(() => {
    try {
      return getMainTitle(item) || item?.title || "";
    } catch {
      return item?.title || "";
    }
  }, [item]);

  const episodeLine = useMemo(() => {
    try {
      return getEpisodeLine(item) || "";
    } catch {
      return "";
    }
  }, [item]);

  const synopsis = item?.synopsis || "";

  const isPausedOverlayOn = hasStarted && !isPlaying && !gate.blocked && !isIntroPlaying;
  const displayCurrent = seekPreview.show ? seekPreview.time : current;
  const progressPct = effectiveDuration ? clamp(displayCurrent / effectiveDuration, 0, 1) : 0;
  const lowPower = !uiVisible && !isPausedOverlayOn;

  // ✅ chrome
  const chromeVisible =
    (showUI || gate.blocked || isIntroPlaying || nextUpVisible) && !gate.blocked && !isIntroPlaying && panel !== "gatepin";

  const gateReason = gateReasonText(gate.reason);

  /* =========================
     HOTKEYS (hook)
  ========================= */
  useTvPlayerHotkeys({
    // flags
    isLoading,
    hasItem,
    panel,
    overlayOpen,
    gateBlocked: gate.blocked,
    gateNeedPin: gate.needPin,
    isIntroPlaying,
    uiVisible,
    stuckOverlay: webStuck,
    stuckFocus: webStuckFocus,
    setStuckFocus: setWebStuckFocus,
    onStuckRetry: retryWebPlayback,
    onStuckBack: goBack,

    // focus
    focusArea,
    focusIndex,
    controlsMaxIndex,
    topFocus,
    topActions,

    // menus
    menuIndex,
    episodesMenu,
    subsMenu,
    audioMenu,
    chips,

    // pin
    pinFocus,
    pinInput,

    // refs
    btnRefs,
    topRefs,

    // setters
    setPanel,
    setMenuIndex,
    setFocusArea,
    setFocusIndex,
    setTopFocus,
    setPinFocus,
    setPinInput,

    // actions
    closeOverlay,
    goBack,
    finishIntro,
    togglePlay,
    seekBy,
    applySubsIdx,
    applyAudioIdx,
    submitPin,
    armAutoHide,

    // next
    showNextUpButton,
    nextBtnIndex,
    goNextEpisode,

    // navigation used by episodes pick inside hook
    navigate,
    location,
    item,
    id,
  });

  /* =========================
     VIEW (JSX fora daqui)
  ========================= */
  return (
    <TvPlayerView
      portalTarget={portalTarget}
      isLoading={isLoading}
      loadingStage={loadingStage}
      loadingTooLong={loadingTooLong}
      bootEffectAlive={bootEffectAlive}
      jsTick={jsTick}
      debugInfo={debugInfo}
      resumeLoading={resumeLoading}
      id={id}
      item={item}
      error={error}
      crash={crash}
      stuckOverlay={webStuck}
      stuckFocus={webStuckFocus}
      onStuckRetry={retryWebPlayback}
      onStuckBack={goBack}
      useNativePlayer={useNativePlayer}
      videoRef={videoRef}
      isPlaying={isPlaying}
      duration={effectiveDuration}
      displayCurrent={displayCurrent}
      progressPct={progressPct}
      isIntroPlaying={isIntroPlaying}
      gate={gate}
      gateReason={gateReason}
      panel={panel}
      pinInput={pinInput}
      setPinInput={(v) => {
        setPinError("");
        setPinInput(v);
      }}
      pinError={pinError}
      pinFocus={pinFocus}
      setPinKeyRef={(idx, el) => {
        if (!pinKeyRefs.current) pinKeyRefs.current = [];
        pinKeyRefs.current[idx] = el;
      }}
      onPinSubmit={submitPin}
      onPinClose={() => {
        setPanel("none");
        armAutoHide();
      }}
      ratingVisible={ratingVisible}
      ratingPayload={ratingPayload}
      mainTitle={mainTitle}
      episodeLine={episodeLine}
      synopsis={synopsis}
      chromeVisible={chromeVisible}
      uiVisible={uiVisible}
      lowPower={lowPower}
      topActions={topActions}
      topFocus={topFocus}
      focusArea={focusArea}
      topRefs={topRefs}
      btnRefs={btnRefs}
      focusIndex={focusIndex}
      showChips={showChips}
      chips={chips}
      isBubbleAudio={panel === "bubble-audio"}
      isBubbleSubs={panel === "bubble-subs"}
      audioMenu={audioMenu}
      subsMenu={subsMenu}
      menuIndex={menuIndex}
      menuRefs={menuRefs}
      onPickAudio={(it) => {
        const idx = Number(it?.id);
        if (Number.isFinite(idx)) {
          applyAudioIdx(idx);
          closeOverlay();
        }
      }}
      onPickSubs={(it) => {
        if (!it) return;
        if (it.id === "off") {
          applySubsIdx("off");
          closeOverlay();
          return;
        }
        applySubsIdx(Number(it.id));
        closeOverlay();
      }}
      // ✅ next up
      showNextUpButton={showNextUpButton}
      nextBtnIndex={nextBtnIndex}
      remainingSec={remainingSec}
      onNextUp={() => {
        armAutoHide();
        goNextEpisode();
      }}
      togglePlay={togglePlay}
      goBack={goBack}
      subtitleFiles={subtitleFiles}
      m3uSubsMap={m3uSubsMap}
      subsTokenBump={subsTokenBump}
      subtitleToGatewayUrl={subtitleToGatewayUrl}
      seekPreview={seekPreview}
      focusAreaProgress={focusArea === "progress"}
      isEpisodesOpen={panel === "episodes"}
      episodesMenu={episodesMenu}
      onPickEpisode={(it) => {
        if (it?.id) {
          closeOverlay();
          navigate(`${WATCH_BASE}/${it.id}`, {
            state: { from: location?.state?.from || "/browse", item: location?.state?.item || item },
          });
        }
      }}
      onCloseOverlay={closeOverlay}
      locationStateFrom={location?.state?.from}
      locationStateItem={location?.state?.item}
      clearHideTimer={clearHideTimer}
      isPausedOverlayOn={isPausedOverlayOn}
      // opcional: pra você enxergar rápido no View (se quiser)
      nextEpisodeRouteId={nextEpisodeRouteId}
    />
  );
}
