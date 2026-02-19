// src/hooks/player/usePlaybackEngine.js
import { useEffect, useMemo, useRef } from "react";
import Hls from "hls.js";
import { DEBUG, HLS_DEBUG_TO_WINDOW, INTRO_SRC, WATCH_BASE } from "../../player/env.js";
import { pickBest1080pCapIndex } from "../../player/overlay.js";
import { normalizeGatewayUrl } from "../../player/gateway.js";

export function usePlaybackEngine({
  videoRef,
  hlsRef,
  pbSrc,
  loading,
  gate,
  disabled = false,

  // ✅ para renovar token
  supabase,
  pbBodyRef,
  pbExpRef,
  onTokenRefreshed,

  // ✅ states
  introEnabled,
  introDone,

  // refs (opcional)
  introEnabledRef,
  introDoneRef,

  finishIntro,
  reportSessionState,
  titleDbIdRef,

  // progress
  startProgressTimer,
  stopProgressTimer,
  saveProgress,

  // anti-reset
  noteUserSeek,
  userSeekRecently,
  scheduleRestore,
  clearRestoreTimer,
  lastGoodTimeRef,
  pendingRestoreRef,
  appliedResumeRef,
  resumeFromRef,

  // ui
  armAutoHide,
  clearHideTimer,

  // tracks + state setters
  setError,
  setIsPlaying,
  setCurrent,
  setDuration,
  setTextTracks,
  setAudioTracks,
  setActiveAudioTrack,
  syncTextTracks,

  // navigation
  nextEpisode,
  navigate,
}) {
  // retry network
  const netRetryTimerRef = useRef(null);
  const netRetriesRef = useRef(0);
  const MAX_NET_RETRIES = 5;

  // ✅ refresh do token
  const tokenTimerRef = useRef(null);
  const tokenInFlightRef = useRef(false);
  const lastTokenRefreshAtRef = useRef(0);

  // ✅ mantém sempre o “master atual” (para retries nunca voltarem ao token velho)
  const masterUrlRef = useRef("");
  const refreshRestoreTimeRef = useRef(0);

  const clearNetRetryTimer = () => {
    if (netRetryTimerRef.current) {
      clearTimeout(netRetryTimerRef.current);
      netRetryTimerRef.current = null;
    }
  };

  const clearTokenTimer = () => {
    if (tokenTimerRef.current) {
      clearTimeout(tokenTimerRef.current);
      tokenTimerRef.current = null;
    }
  };

  // ✅ evita reiniciar o engine por mudança de episodes
  const nextEpisodeIdRef = useRef(null);
  useEffect(() => {
    nextEpisodeIdRef.current = nextEpisode?.id || null;
  }, [nextEpisode?.id]);

  const isIOSOrSafariNative = useMemo(() => {
    const video = videoRef.current;
    if (!video) return false;
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    return (isIOS || isSafari) && video.canPlayType("application/vnd.apple.mpegurl");
  }, [videoRef]);

  useEffect(() => {
    if (disabled) return;

    // reset tracks UI
    setTextTracks([]);
    setAudioTracks([]);
    setActiveAudioTrack(-1);

    const video = videoRef.current;
    if (!video) return;

    clearNetRetryTimer();
    clearTokenTimer();

    // sempre manter o master atual em ref
    masterUrlRef.current = pbSrc || "";

    // manter refs alinhados (se foram passadas)
    if (introEnabledRef) introEnabledRef.current = !!introEnabled;
    if (introDoneRef) introDoneRef.current = !!introDone;

    // bloqueado
    if (gate?.blocked) {
      try {
        video.pause?.();
      } catch {}

      reportSessionState?.({
        profileId: gate?.profile?.id || null,
        titleDbId: String(titleDbIdRef?.current || "") || null,
        is_playing: false,
      });

      return () => {
        clearNetRetryTimer();
        clearTokenTimer();
      };
    }

    // =====================================================
    // ✅ helpers refresh
    // =====================================================
    const nativeHlsSupported = (() => {
      try {
        const a = video.canPlayType("application/vnd.apple.mpegurl");
        const b = video.canPlayType("application/x-mpegURL");
        return !!(a || b);
      } catch {
        return false;
      }
    })();

    const useNativeHls = isIOSOrSafariNative || (!Hls.isSupported() && nativeHlsSupported);
    const scheduleTokenRefresh = (expSec) => {
      clearTokenTimer();

      const exp = Number(expSec || 0);
      if (!Number.isFinite(exp) || exp <= 0) return;

      const now = Math.floor(Date.now() / 1000);
      const safety = 120; // 2 min antes
      const seconds = Math.max(10, exp - now - safety);
      const ms = seconds * 1000;

      if (DEBUG) console.log("[PB] schedule refresh in", seconds, "s", { exp, now });

      tokenTimerRef.current = setTimeout(() => {
        refreshToken("scheduled").catch(() => {});
      }, ms);
    };

    // ✅ restore "forte": não depende de userSeekRecently (importante para token-refresh/resume)
    const forceRestoreTime = (label, t) => {
      const tt = Number(t || 0);
      if (!Number.isFinite(tt) || tt <= 0.5) return;

      try {
        video.currentTime = tt;
      } catch {}

      try {
        scheduleRestore?.(label, tt, { force: true });
      } catch {}
    };

    const refreshToken = async (reason = "manual") => {
      if (!supabase?.functions?.invoke) return false;
      const body = pbBodyRef?.current;
      if (!body) return false;

      // rate-limit (evita tempestade)
      const nowMs = Date.now();
      if (tokenInFlightRef.current) return false;
      if (nowMs - (lastTokenRefreshAtRef.current || 0) < 3000) return false;

      tokenInFlightRef.current = true;
      lastTokenRefreshAtRef.current = nowMs;

      const curT = Number(video.currentTime || 0);
      const lg = Number(lastGoodTimeRef?.current || 0);
      const snapshot = curT > 0.5 ? curT : lg;

      if (DEBUG) console.log("[PB] refresh start", { reason, snapshot });

      try {
        const { data: pb, error: pbErr } = await supabase.functions.invoke("playback-token", { body });

        if (pbErr) throw new Error(pbErr.message || "Erro ao invocar playback-token (refresh).");
        if (!pb?.ok) throw new Error(String(pb?.error || "Falha ao renovar token."));

        const master = normalizeGatewayUrl(String(pb?.master || "").trim());
        const thumbs = normalizeGatewayUrl(String(pb?.thumbs || "").trim());
        const exp = Number(pb?.exp || 0);

        if (!master) throw new Error("Refresh não retornou master.");

        // ✅ atualizar refs (master atual + exp)
        masterUrlRef.current = master;
        if (pbExpRef) pbExpRef.current = Number.isFinite(exp) ? exp : 0;
        scheduleTokenRefresh(pbExpRef?.current || exp);

        // ✅ limpa erro (se estava mostrando “sessão expirada”)
        try {
          setError?.("");
        } catch {}

        // notifica quem quiser atualizar thumbs/vtt fora do engine
        try {
          onTokenRefreshed?.({ master, thumbs, exp });
        } catch {}

        // ✅ guarda restore SEM marcar como seek do usuário
        if (snapshot > 0.5) {
          refreshRestoreTimeRef.current = snapshot;
          try {
            pendingRestoreRef.current = { time: snapshot, reason: `token-refresh:${reason}`, tries: 0 };
          } catch {}
        } else {
          refreshRestoreTimeRef.current = 0;
        }

        // =========================
        // Native HLS (iOS/Safari)
        // =========================
        if (useNativeHls) {
          try {
            video.pause?.();
          } catch {}

          try {
            video.src = master;
          } catch {}

          const t = refreshRestoreTimeRef.current;
          if (t > 0.5) {
            const onMeta = () => {
              video.removeEventListener("loadedmetadata", onMeta);
              setTimeout(() => forceRestoreTime("token-refresh-native", t), 60);
            };
            try {
              video.addEventListener("loadedmetadata", onMeta, { once: true });
            } catch {}

            // fallback
            setTimeout(() => forceRestoreTime("token-refresh-native-fallback", t), 250);
          }

          video.play().catch(() => {});
          return true;
        }

        // =========================
        // HLS.js
        // =========================
        const hls = hlsRef.current;
        if (hls) {
          const t = refreshRestoreTimeRef.current;

          // ✅ quando o novo manifest parsear, forçamos restore
          try {
            hls.once(Hls.Events.MANIFEST_PARSED, () => {
              if (t > 0.5) setTimeout(() => forceRestoreTime("token-refresh-manifest", t), 60);
            });
          } catch {}

          // ✅ quando o primeiro fragment bufferizar, forçamos de novo
          try {
            hls.once(Hls.Events.FRAG_BUFFERED, () => {
              if (t > 0.5) setTimeout(() => forceRestoreTime("token-refresh-frag", t), 0);
            });
          } catch {}

          try {
            hls.stopLoad();
          } catch {}

          try {
            hls.loadSource(master);
          } catch {}

          try {
            hls.startLoad(t > 0.5 ? t : -1);
          } catch {}

          // fallback extra
          if (t > 0.5) setTimeout(() => forceRestoreTime("token-refresh-post", t), 350);

          return true;
        }

        return false;
      } catch (e) {
        if (DEBUG) console.warn("[PB] refresh failed", e);
        return false;
      } finally {
        tokenInFlightRef.current = false;
      }
    };

    // =========================
    // ✅ INTRO
    // =========================
    if (introEnabled && !introDone) {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }

      const onIntroEnded = () => finishIntro?.("ended");
      const onIntroError = () => finishIntro?.("error");

      setIsPlaying(false);
      setCurrent(0);
      setDuration(0);

      reportSessionState?.({
        profileId: gate?.profile?.id || null,
        titleDbId: String(titleDbIdRef?.current || "") || null,
        is_playing: false,
      });

      try {
        const abs = new URL(INTRO_SRC, window.location.href).toString();
        if (video.src !== abs) video.src = abs;
        video.currentTime = 0;
      } catch {
        video.src = INTRO_SRC;
        try {
          video.currentTime = 0;
        } catch {}
      }

      video.addEventListener("ended", onIntroEnded);
      video.addEventListener("error", onIntroError);

      video.play().catch(() => {});

      return () => {
        clearNetRetryTimer();
        clearTokenTimer();
        try {
          video.removeEventListener("ended", onIntroEnded);
          video.removeEventListener("error", onIntroError);
        } catch {}

        try {
          video.pause?.();
        } catch {}
        try {
          video.removeAttribute("src");
          video.load?.();
        } catch {}
      };
    }

    // =========================
    // ✅ MAIN (HLS)
    // =========================
    if (!pbSrc) {
      if (!loading) setError?.((prev) => prev || "Não foi possível obter a URL do player seguro (gateway).");
      return () => {
        clearNetRetryTimer();
        clearTokenTimer();
      };
    }

    if (DEBUG) console.log("[PLAYBACK] using src:", pbSrc);

    setIsPlaying(false);
    setCurrent(0);
    setDuration(0);

    try {
      lastGoodTimeRef.current = 0;
    } catch {}
    try {
      pendingRestoreRef.current = null;
    } catch {}
    clearRestoreTimer?.();
    noteUserSeek?.("setup-hls");

    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    // ✅ agenda refresh pelo exp atual
    try {
      const exp = pbExpRef?.current || 0;
      scheduleTokenRefresh(exp);
    } catch {}

    const onPlay = () => {
      setIsPlaying(true);
      reportSessionState?.({
        profileId: gate?.profile?.id || null,
        titleDbId: String(titleDbIdRef?.current || "") || null,
        is_playing: true,
      });
      startProgressTimer?.();
    };

    const onPause = () => {
      setIsPlaying(false);
      reportSessionState?.({
        profileId: gate?.profile?.id || null,
        titleDbId: String(titleDbIdRef?.current || "") || null,
        is_playing: false,
      });
      stopProgressTimer?.();
      saveProgress?.({ force: true }).catch(() => {});
    };

    const onTime = () => {
      const t = Number(video.currentTime || 0);
      setCurrent(t);

      if (Number.isFinite(t)) {
        const lg = Number(lastGoodTimeRef?.current || 0);
        if (t >= lg - 0.75) {
          try {
            lastGoodTimeRef.current = t;
          } catch {}
        }
      }
    };

    const onDur = () => setDuration(Number(video.duration || 0));

    const onEnded = () => {
      reportSessionState?.({
        profileId: gate?.profile?.id || null,
        titleDbId: String(titleDbIdRef?.current || "") || null,
        is_playing: false,
      });

      stopProgressTimer?.();
      saveProgress?.({ force: true, ended: true }).catch(() => {});

      const nextId = nextEpisodeIdRef.current;
      if (nextId) navigate?.(`${WATCH_BASE}/${nextId}`);
    };

    const onSeeking = () => noteUserSeek?.("seeking");

    const onLoadedMeta = () => {
      const cur = Number(video.currentTime || 0);
      try {
        lastGoodTimeRef.current = Number.isFinite(cur) ? cur : 0;
      } catch {}

      // ✅ resume nativo: NÃO marcar como seek do usuário; restaurar com force
      const resume = Number(resumeFromRef?.current || 0);
      if (!appliedResumeRef?.current && resume > 1) {
        appliedResumeRef.current = true;

        try {
          video.currentTime = resume;
        } catch {}

        try {
          pendingRestoreRef.current = { time: resume, reason: "resume-native", tries: 0 };
        } catch {}

        scheduleRestore?.("resume-native", resume, { force: true });
      }

      const pending = pendingRestoreRef?.current;
      if (pending?.time && !userSeekRecently?.()) scheduleRestore?.("loadedmetadata-restore", pending.time);
    };

    // listeners base
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("durationchange", onDur);
    video.addEventListener("loadedmetadata", onLoadedMeta);
    video.addEventListener("ended", onEnded);
    video.addEventListener("seeking", onSeeking);

    const syncAudioState = (hls) => {
      try {
        const tracks = hls.audioTracks || [];
        setAudioTracks(tracks);
        setActiveAudioTrack(Number.isFinite(hls.audioTrack) ? hls.audioTrack : -1);
      } catch {
        setAudioTracks([]);
        setActiveAudioTrack(-1);
      }
    };

    // Native HLS
    if (useNativeHls) {
      try {
        video.src = pbSrc;
      } catch {}

      video.play().catch(() => {});
      startProgressTimer?.();
      armAutoHide?.();
      setTimeout(() => syncTextTracks?.(), 300);

      return () => {
        clearNetRetryTimer();
        clearTokenTimer();
        clearHideTimer?.();
        clearRestoreTimer?.();

        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("timeupdate", onTime);
        video.removeEventListener("durationchange", onDur);
        video.removeEventListener("loadedmetadata", onLoadedMeta);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("seeking", onSeeking);
      };
    }

    // hls.js
    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: false,
        enableWorker: true,

        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
        fetchSetup: (_context, init) => ({ ...init, credentials: "omit" }),

        maxBufferHole: 2.5,
        nudgeOffset: 0.2,
        nudgeMaxRetry: 10,
        backBufferLength: 30,
      });

      hlsRef.current = hls;

      if (HLS_DEBUG_TO_WINDOW) {
        try {
          window.__hls = hls;
          window.__video = video;
        } catch {}
      }

      hls.attachMedia(video);

      // ✅ IMPORTANT: nunca voltar ao pbSrc antigo em reattach
      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        const src = masterUrlRef.current || pbSrc;
        hls.loadSource(src);
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => syncAudioState(hls));

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => {
        syncAudioState(hls);
        const pending = pendingRestoreRef?.current;
        const want = pending?.time;
        if (want && !userSeekRecently?.()) {
          if (DEBUG) console.log("[PLAYER] audio switched -> restore", want);
          scheduleRestore?.("audio-switch", want);
        }
      });

      const applyQualityCap = () => {
        const capIdx = pickBest1080pCapIndex(hls.levels);
        if (capIdx >= 0) hls.autoLevelCapping = capIdx;
        else hls.autoLevelCapping = -1;
      };

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        netRetriesRef.current = 0;
        clearNetRetryTimer();
        setError?.("");

        applyQualityCap();

        video.play().catch(() => {});
        startProgressTimer?.();
        armAutoHide?.();

        setTimeout(() => syncTextTracks?.(), 300);
        syncAudioState(hls);
      });

      hls.on(Hls.Events.LEVELS_UPDATED, () => applyQualityCap());

      // ✅ resume 1x (HLS): NÃO marcar como seek do usuário; usar force
      {
        const resume = Number(resumeFromRef?.current || 0);
        if (!appliedResumeRef?.current && resume > 1) {
          appliedResumeRef.current = true;

          try {
            video.currentTime = resume;
          } catch {}
          try {
            hls.startLoad(resume);
          } catch {}

          try {
            pendingRestoreRef.current = { time: resume, reason: "resume-initial", tries: 0 };
          } catch {}

          scheduleRestore?.("resume-initial", resume, { force: true });
        }
      }

      hls.on(Hls.Events.ERROR, (_event, data) => {
        const http = data?.response?.code ?? data?.response?.status ?? data?.networkDetails?.status ?? 0;

        const details = [
          `type=${data?.type}`,
          `details=${data?.details}`,
          `fatal=${data?.fatal}`,
          http ? `http=${http}` : "",
          data?.response?.url ? `url=${data.response.url}` : "",
        ]
          .filter(Boolean)
          .join(" | ");

        const curT = Number(video.currentTime || 0);
        const lg = Number(lastGoodTimeRef?.current || 0);
        const snapshot = curT > 0.5 ? curT : lg;

        if (snapshot > 0.5 && !userSeekRecently?.()) {
          try {
            pendingRestoreRef.current = { time: snapshot, reason: String(data?.details || "hls-error"), tries: 0 };
          } catch {}
        }

        // ✅ 401/403: token expirou -> refresh mantendo tempo
        if (Number(http) === 401 || Number(http) === 403) {
          if (DEBUG) console.warn("[HLS] auth error -> refresh token", { http, details });

          // ✅ interrompe tempestade de requests com token velho
          try {
            hls.stopLoad();
          } catch {}

          refreshToken(`http-${http}`).then((ok) => {
            if (!ok) {
              setError?.(`Sessão do player expirou (HTTP ${http}). Faça login novamente ou recarregue a página.`);
            }
          });

          return;
        }

        if (!data?.fatal) {
          if (data?.details === "bufferSeekOverHole" || data?.details === "bufferStalledError") {
            try {
              if (DEBUG) console.warn("[HLS] non-fatal stall/hole -> startLoad + restore:", details, { snapshot });
              hls.startLoad(snapshot > 0.5 ? snapshot : -1);
              scheduleRestore?.("nonfatal-stall", snapshot);
            } catch {}
          } else {
            console.warn("[HLS] non-fatal", details, data);
          }
          return;
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && [502, 503, 504].includes(Number(http || 0))) {
          const n = (netRetriesRef.current || 0) + 1;

          if (n <= MAX_NET_RETRIES) {
            netRetriesRef.current = n;
            setError?.(`Servidor indisponível (HTTP ${http}). Tentando reconectar... (${n}/${MAX_NET_RETRIES})`);

            const wait = Math.min(1000 * 2 ** (n - 1), 15000);
            if (DEBUG) console.warn("[HLS] fatal network -> retry", { http, wait, details });

            try {
              hls.stopLoad();
            } catch {}

            clearNetRetryTimer();
            netRetryTimerRef.current = setTimeout(() => {
              try {
                // ✅ usa SEMPRE o master atual (token novo), nunca o pbSrc antigo
                const srcToReload = masterUrlRef.current || pbSrc;
                hls.loadSource(srcToReload);
                hls.startLoad(snapshot > 0.5 ? snapshot : -1);
                scheduleRestore?.("fatal-network-retry", snapshot);
              } catch (e) {
                if (DEBUG) console.warn("[HLS] retry start failed", e);
              }
            }, wait);

            return;
          }

          setError?.(`HLS: ${details}`);
          console.error("[HLS] FATAL (network retries exceeded)", data);
          try {
            hls.destroy();
          } catch {}
          hlsRef.current = null;
          return;
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setError?.(`HLS: ${details}`);
          console.error("[HLS] FATAL network", data);
          try {
            hls.startLoad(snapshot > 0.5 ? snapshot : -1);
            scheduleRestore?.("fatal-network", snapshot);
          } catch {}
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          setError?.(`HLS: ${details}`);
          console.error("[HLS] FATAL media", data);
          try {
            hls.recoverMediaError();
            scheduleRestore?.("fatal-media", snapshot);
          } catch {}
          return;
        }

        setError?.(`HLS: ${details}`);
        console.error("[HLS] FATAL", data);
        try {
          hls.destroy();
        } catch {}
        hlsRef.current = null;
      });

      return () => {
        clearNetRetryTimer();
        clearTokenTimer();
        clearHideTimer?.();
        clearRestoreTimer?.();

        try {
          hls.destroy();
        } catch {}
        hlsRef.current = null;

        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("timeupdate", onTime);
        video.removeEventListener("durationchange", onDur);
        video.removeEventListener("loadedmetadata", onLoadedMeta);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("seeking", onSeeking);

        if (HLS_DEBUG_TO_WINDOW) {
          try {
            delete window.__hls;
            delete window.__video;
          } catch {}
        }
      };
    }

    setError?.("Seu dispositivo não suporta HLS neste player.");

    return () => {
      stopProgressTimer?.();
      saveProgress?.({ force: true }).catch(() => {});
      clearNetRetryTimer();
      clearTokenTimer();
      clearHideTimer?.();
      clearRestoreTimer?.();

      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("durationchange", onDur);
      video.removeEventListener("loadedmetadata", onLoadedMeta);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("seeking", onSeeking);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, pbSrc, loading, gate?.blocked, introEnabled, introDone]);
}
