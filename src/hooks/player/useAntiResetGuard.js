// src/hooks/player/useAntiResetGuard.js
import { useRef, useCallback } from "react";
import { clamp } from "../../player/utils.js";
import { DEBUG } from "../../player/env.js";

export function useAntiResetGuard({ videoRef, hlsRef, scrubbingRef, durationState }) {
  const lastGoodTimeRef = useRef(0);
  const userSeekAtRef = useRef(0);
  const pendingRestoreRef = useRef(null);
  const restoreTimerRef = useRef(null);

  const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  const noteUserSeek = useCallback((reason) => {
    userSeekAtRef.current = nowMs();
    if (DEBUG && reason) console.log("[PLAYER] userSeek:", reason);
  }, []);

  const userSeekRecently = useCallback((windowMs = 1500) => {
    return nowMs() - (userSeekAtRef.current || 0) <= windowMs;
  }, []);

  const clearRestoreTimer = useCallback(() => {
    if (restoreTimerRef.current) {
      clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
  }, []);

  const safeClampSeekTime = (t, dur) => {
    const d = Number.isFinite(dur) && dur > 0 ? dur : 0;
    const tt = Number.isFinite(t) ? t : 0;
    if (!d) return Math.max(0, tt);
    return clamp(tt, 0, Math.max(0, d - 0.25));
  };

  // ✅ motivos internos onde NÃO faz sentido bloquear por userSeekRecently()
  // (isso resolve token refresh + resume mesmo se alguém tiver chamado noteUserSeek por engano)
  const bypassUserBlockByReason = (reason) => {
    const r = String(reason || "");
    return (
      r.startsWith("token-refresh") ||
      r.startsWith("resume-") ||
      r === "resume" ||
      r === "unexpected-reset"
    );
  };

  /**
   * scheduleRestore(reason, desiredTime, opts)
   * opts:
   *   - force: ignora userSeekRecently() (mas AINDA respeita scrubbingRef por padrão)
   *   - ignoreScrubbing: se true, ignora scrubbingRef também (use com cautela)
   *   - delayMs: override do delay inicial (default 220)
   *   - maxTries: override do limite (default 8)
   */
  const scheduleRestore = useCallback(
    (reason, desiredTime, opts = {}) => {
      const v = videoRef.current;
      if (!v) return;

      const dur = Number(v.duration || 0) || Number(durationState || 0);
      const t = safeClampSeekTime(desiredTime, dur);

      // ✅ aceita restores próximos do início (>0), mas evita spam com 0 absoluto
      if (!Number.isFinite(t) || t <= 0) return;

      const delayMs = Number.isFinite(opts.delayMs) ? Math.max(0, opts.delayMs) : 220;
      const maxTries = Number.isFinite(opts.maxTries) ? Math.max(1, opts.maxTries) : 8;

      pendingRestoreRef.current = {
        time: t,
        reason: String(reason || ""),
        tries: 0,
        opts: {
          force: !!opts.force,
          ignoreScrubbing: !!opts.ignoreScrubbing,
          delayMs,
          maxTries,
        },
      };

      if (restoreTimerRef.current) {
        clearTimeout(restoreTimerRef.current);
        restoreTimerRef.current = null;
      }

      const run = () => {
        const v2 = videoRef.current;
        if (!v2) return;

        const pending = pendingRestoreRef.current;
        if (!pending) return;

        const want = safeClampSeekTime(pending.time, Number(v2.duration || 0));
        const cur = Number(v2.currentTime || 0);

        // já está praticamente lá
        if (Math.abs(cur - want) <= 0.75) {
          pendingRestoreRef.current = null;
          return;
        }

        const pOpts = pending.opts || {};
        const bypassByReason = bypassUserBlockByReason(pending.reason);
        const bypassUser = !!pOpts.force || bypassByReason;

        const scrubbing = !!scrubbingRef.current;
        const userRecent = userSeekRecently();

        // ✅ se houver ação do usuário/scrubbing, NÃO zera o pending: só adia
        if ((scrubbing && !pOpts.ignoreScrubbing) || (userRecent && !bypassUser)) {
          pending.tries += 1;

          if (DEBUG) {
            console.log("[PLAYER] restore deferred", {
              reason: pending.reason,
              want,
              cur,
              tries: pending.tries,
              scrubbing,
              userRecent,
              bypassUser,
            });
          }

          if (pending.tries >= maxTries) {
            // desistiu para não ficar brigando com o usuário indefinidamente
            pendingRestoreRef.current = null;
            return;
          }

          clearRestoreTimer();
          restoreTimerRef.current = setTimeout(run, 350);
          return;
        }

        pending.tries += 1;

        try {
          v2.currentTime = want;
        } catch {}

        try {
          const hls = hlsRef.current;
          if (hls && typeof hls.startLoad === "function") {
            hls.startLoad(want);
          }
        } catch {}

        if (DEBUG) {
          console.log("[PLAYER] restore applied:", {
            reason: pending.reason,
            want,
            cur,
            tries: pending.tries,
            bypassUser,
          });
        }

        if (pending.tries < 2) {
          clearRestoreTimer();
          restoreTimerRef.current = setTimeout(run, 450);
        } else {
          pendingRestoreRef.current = null;
        }
      };

      restoreTimerRef.current = setTimeout(run, delayMs);
    },
    [videoRef, hlsRef, scrubbingRef, durationState, userSeekRecently]
  );

  const onTimeUpdateGuard = useCallback(
    ({ isPlaying }) => {
      const v = videoRef.current;
      if (!v) return;
      if (scrubbingRef.current) return;

      const t = Number(v.currentTime || 0);
      if (Number.isFinite(t)) {
        const lg = lastGoodTimeRef.current || 0;
        if (t >= lg - 0.75) lastGoodTimeRef.current = t;
      }

      const lg2 = Number(lastGoodTimeRef.current || 0);
      const dur = Number(v.duration || 0);
      const cur = Number(v.currentTime || 0);

      if (
        dur > 60 &&
        lg2 > 30 &&
        cur <= 1.0 &&
        !v.ended &&
        !v.seeking &&
        isPlaying &&
        !scrubbingRef.current &&
        !userSeekRecently()
      ) {
        if (DEBUG) console.warn("[PLAYER] unexpected reset to ~0; restoring", { cur, lastGood: lg2, dur });
        scheduleRestore("unexpected-reset", lg2, { force: true });
      }
    },
    [videoRef, scrubbingRef, userSeekRecently, scheduleRestore]
  );

  return {
    lastGoodTimeRef,
    pendingRestoreRef,
    noteUserSeek,
    userSeekRecently,
    scheduleRestore,
    clearRestoreTimer,
    onTimeUpdateGuard,
  };
}
