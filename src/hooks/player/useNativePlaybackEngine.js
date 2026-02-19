import { useEffect, useRef } from "react";
import { exoPlayer, isNativeExoAvailable } from "../../native/exoplayer.js";
import { DEBUG, INTRO_SRC, WATCH_BASE } from "../../player/env.js";
import { normalizeGatewayUrl } from "../../player/gateway.js";

function parsePositiveEnvNumber(rawValue, fallbackValue) {
  const n = Number(rawValue);
  if (Number.isFinite(n) && n > 0) return n;
  return fallbackValue;
}

function buildSubtitleList(subtitleFiles, subtitleToGatewayUrl) {
  const list = Array.isArray(subtitleFiles) ? subtitleFiles : [];
  if (!list.length) return [];
  return list
    .map((s) => {
      const src = subtitleToGatewayUrl ? subtitleToGatewayUrl(s?.src) : s?.src;
      const url = String(src || "").trim();
      if (!url) return null;
      return {
        url,
        lang: String(s?.lang || "").trim(),
        label: String(s?.label || "").trim(),
        isDefault: !!s?.default,
      };
    })
    .filter(Boolean);
}

export function useNativePlaybackEngine({
  enabled = false,

  // playback
  pbSrc,
  loading,
  gate,

  // token refresh
  supabase,
  pbBodyRef,
  pbExpRef,
  onTokenRefreshed,

  // intro
  introEnabled,
  introDone,
  introEnabledRef,
  introDoneRef,
  finishIntro,

  // session/progress
  reportSessionState,
  titleDbIdRef,
  startProgressTimer,
  stopProgressTimer,
  saveProgress,

  // anti-reset (refs apenas)
  lastGoodTimeRef,
  pendingRestoreRef,
  appliedResumeRef,
  resumeFromRef,

  // ui
  armAutoHide,
  clearHideTimer,

  // setters
  setError,
  setIsPlaying,
  setCurrent,
  setDuration,
  setTextTracks,
  setAudioTracks,
  setActiveAudioTrack,

  // navigation
  nextEpisode,
  navigate,

  // subtitles
  subtitleFiles,
  subtitleToGatewayUrl,
}) {
  const tokenTimerRef = useRef(null);
  const isPlayingRef = useRef(false);
  const currentRef = useRef(0);
  const videoOffsetY = useRef(
    Number(import.meta?.env?.VITE_TV_VIDEO_OFFSET_Y || 0)
  );
  const preferSdr =
    String(import.meta?.env?.VITE_TV_PREFER_SDR ?? "1") !== "0";
  const maxVideoHeight = parsePositiveEnvNumber(
    import.meta?.env?.VITE_TV_MAX_HEIGHT,
    2160
  );
  const maxVideoWidth = parsePositiveEnvNumber(
    import.meta?.env?.VITE_TV_MAX_WIDTH,
    3840
  );
  const maxVideoFps = parsePositiveEnvNumber(
    import.meta?.env?.VITE_TV_MAX_FPS,
    30
  );

  useEffect(() => {
    if (!enabled || !isNativeExoAvailable()) return;
    // evita iniciar o player nativo enquanto o bootstrap ainda está carregando
    // (algumas TVs pausam timers do WebView durante init do player nativo)
    if (loading) {
      if (DEBUG) {
        console.log("[EXO-JS] wait bootstrap", {
          loading,
          pbSrc: !!pbSrc,
          introPending: !!introEnabled && !introDone,
          gateBlocked: !!gate?.blocked,
        });
      }
      return;
    }

    let alive = true;
    console.log("[EXO-JS] effect start", {
      enabled,
      pbSrc: String(pbSrc || "").slice(0, 120),
      introEnabled,
      introDone,
      gateBlocked: !!gate?.blocked,
    });

    const clearTokenTimer = () => {
      if (tokenTimerRef.current) {
        clearTimeout(tokenTimerRef.current);
        tokenTimerRef.current = null;
      }
    };

    const scheduleTokenRefresh = (expSec) => {
      clearTokenTimer();
      const exp = Number(expSec || 0);
      if (!Number.isFinite(exp) || exp <= 0) return;

      const now = Math.floor(Date.now() / 1000);
      const safety = 120;
      const seconds = Math.max(10, exp - now - safety);
      tokenTimerRef.current = setTimeout(() => {
        refreshToken("scheduled").catch(() => {});
      }, seconds * 1000);
    };

    const refreshToken = async (reason = "manual") => {
      if (!supabase?.functions?.invoke) return false;
      const body = pbBodyRef?.current;
      if (!body) return false;

      try {
        const { data: pb, error: pbErr } = await supabase.functions.invoke("playback-token", { body });
        if (pbErr) throw new Error(pbErr.message || "Erro ao invocar playback-token (refresh).");
        if (!pb?.ok) throw new Error(String(pb?.error || "Falha ao renovar token."));

        const master = normalizeGatewayUrl(String(pb?.master || "").trim());
        const thumbs = normalizeGatewayUrl(String(pb?.thumbs || "").trim());
        const exp = Number(pb?.exp || 0);

        if (!master) throw new Error("Refresh não retornou master.");

        if (pbExpRef) pbExpRef.current = Number.isFinite(exp) ? exp : 0;
        scheduleTokenRefresh(pbExpRef?.current || exp);

        try {
          setError?.("");
        } catch {}

        try {
          onTokenRefreshed?.({ master, thumbs, exp });
        } catch {}

        const snap = Number(currentRef.current || 0);
        if (snap > 0.5) {
          try {
            pendingRestoreRef.current = { time: snap, reason: `token-refresh:${reason}`, tries: 0 };
          } catch {}
        }

        const subs = buildSubtitleList(subtitleFiles, subtitleToGatewayUrl);
        const setRes = await exoPlayer.setSource({
          url: master,
          startPositionSec: snap > 0.5 ? snap : 0,
          subtitles: subs,
        });
        if (setRes?.ok === false) {
          console.log("[EXO-JS] setSource failed", setRes?.error || "unknown");
          return false;
        }
        await exoPlayer.play();
        return true;
      } catch (e) {
        if (DEBUG) console.warn("[EXO] refresh failed", e);
        return false;
      }
    };

    const handleState = (s) => {
      if (!alive) return;
      const pos = Number(s?.positionSec || 0);
      const dur = Number(s?.durationSec || 0);

      currentRef.current = pos;
      setCurrent(pos);
      if (Number.isFinite(dur) && dur > 0) setDuration(dur);

      if (Number.isFinite(pos)) {
        try {
          lastGoodTimeRef.current = pos;
        } catch {}
      }

      const playing = !!s?.isPlaying;
      if (playing !== isPlayingRef.current) {
        isPlayingRef.current = playing;
        setIsPlaying(playing);

        reportSessionState?.({
          profileId: gate?.profile?.id || null,
          titleDbId: String(titleDbIdRef?.current || "") || null,
          is_playing: playing,
        });

        if (playing) startProgressTimer?.();
        else {
          stopProgressTimer?.();
          saveProgress?.({ force: true }).catch(() => {});
        }

        // Garante que overlays de UI sumam após iniciar o vídeo nativo.
        if (playing) armAutoHide?.();
      }
    };

    const handleTracks = (payload) => {
      if (!alive) return;
      const audio = Array.isArray(payload?.audio) ? payload.audio : [];
      const text = Array.isArray(payload?.text) ? payload.text : [];
      setAudioTracks(audio);
      setTextTracks(text);
      const idx = Number(payload?.selectedAudio ?? -1);
      setActiveAudioTrack(Number.isFinite(idx) ? idx : -1);
    };

    const handleError = (payload) => {
      if (!alive) return;
      console.log("[EXO-JS] error", payload);
      const http = Number(payload?.http || 0);
      const code = Number(payload?.code || 0);
      const codeName = String(payload?.codeName || "");
      if (http === 401 || http === 403) {
        refreshToken(`http-${http}`).then((ok) => {
          if (!ok) setError?.(`Sessão do player expirou (HTTP ${http}).`);
        });
        return;
      }
      if ((code === 2005 || codeName.includes("FILE_NOT_FOUND")) && isPlayingRef.current) {
        // provavel legenda/asset secundário; evita poluir UI
        return;
      }
      const msg = String(payload?.message || "Falha no player nativo.").trim();
      const extra = [
        Number.isFinite(code) && code ? `code=${code}` : "",
        Number.isFinite(http) && http ? `http=${http}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      setError?.(extra ? `${msg} (${extra})` : msg);
    };

    const handleEnded = () => {
      if (!alive) return;
      const nextId = nextEpisode?.id || "";
      if (introEnabled && !introDone) {
        finishIntro?.("ended");
        return;
      }
      if (nextId) navigate?.(`${WATCH_BASE}/${nextId}`);
    };

    const subState = exoPlayer.addListener("state", handleState);
    const subTracks = exoPlayer.addListener("tracks", handleTracks);
    const subError = exoPlayer.addListener("error", handleError);
    const subEnded = exoPlayer.addListener("ended", handleEnded);

    (async () => {
      const initRes = await exoPlayer.init({
        transparent: true,
        preferSdr,
        maxVideoHeight: Number.isFinite(maxVideoHeight) ? maxVideoHeight : 0,
        maxVideoWidth: Number.isFinite(maxVideoWidth) ? maxVideoWidth : 0,
        maxVideoFps: Number.isFinite(maxVideoFps) ? maxVideoFps : 0,
      });
      if (initRes?.ok === false) {
        console.log("[EXO-JS] init failed", initRes?.error || "unknown");
        setError?.("Falha ao iniciar player nativo.");
        return;
      }

      try {
        if (Number.isFinite(videoOffsetY.current) && videoOffsetY.current !== 0) {
          await exoPlayer.setVideoOffset(videoOffsetY.current);
        }
      } catch {}

      const visRes = await exoPlayer.setVisible(true);
      if (visRes?.ok === false) {
        console.log("[EXO-JS] setVisible failed", visRes?.error || "unknown");
      }

      setTextTracks([]);
      setAudioTracks([]);
      setActiveAudioTrack(-1);

      if (introEnabledRef) introEnabledRef.current = !!introEnabled;
      if (introDoneRef) introDoneRef.current = !!introDone;

      if (gate?.blocked) {
        try {
          await exoPlayer.pause();
        } catch {}

        reportSessionState?.({
          profileId: gate?.profile?.id || null,
          titleDbId: String(titleDbIdRef?.current || "") || null,
          is_playing: false,
        });
        return;
      }

      // INTRO
      if (introEnabled && !introDone) {
        const resIntro = await exoPlayer.setSource({ url: INTRO_SRC, startPositionSec: 0, subtitles: [] });
        if (resIntro?.ok === false) {
          console.log("[EXO-JS] intro setSource failed", resIntro?.error || "unknown");
          setError?.("Falha ao iniciar intro no player nativo.");
          return;
        }
        await exoPlayer.play();
        return;
      }

      if (!pbSrc) {
        if (!loading) setError?.((prev) => prev || "Não foi possível obter a URL do player seguro (gateway).");
        return;
      }

      const resume = Number(resumeFromRef?.current || 0);
      const startPos = !appliedResumeRef?.current && resume > 1 ? resume : 0;
      if (startPos > 0 && appliedResumeRef) appliedResumeRef.current = true;

      const subs = buildSubtitleList(subtitleFiles, subtitleToGatewayUrl);
      const resMain = await exoPlayer.setSource({ url: pbSrc, startPositionSec: startPos, subtitles: subs });
      if (resMain?.ok === false) {
        console.log("[EXO-JS] main setSource failed", resMain?.error || "unknown");
        setError?.("Falha ao iniciar player nativo.");
        return;
      }

      const exp = pbExpRef?.current || 0;
      scheduleTokenRefresh(exp);

      await exoPlayer.play();
      armAutoHide?.();
    })();

    return () => {
      alive = false;
      clearTokenTimer();
      clearHideTimer?.();
      try {
        subState?.remove?.();
        subTracks?.remove?.();
        subError?.remove?.();
        subEnded?.remove?.();
      } catch {}
    };
  }, [
    enabled,
    pbSrc,
    loading,
    gate?.blocked,
    introEnabled,
    introDone,
    subtitleFiles,
    subtitleToGatewayUrl,
  ]);
}
