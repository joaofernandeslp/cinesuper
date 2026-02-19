// src/hooks/player/useWatchProgress.js
import { useCallback, useEffect, useRef, useState } from "react";
import { PROGRESS_MIN_SAVE_DELTA_SEC, PROGRESS_SAVE_EVERY_MS, DEBUG } from "../../player/env.js";

export function useWatchProgress({
  supabase,
  videoRef,
  gateRef,
  titleDbIdRef,
  introEnabledRef,
  introDoneRef,
  locationSearch,
  getCurrentTime,
  getDuration,
}) {
  const [resumeLoading, setResumeLoading] = useState(false);

  const resumeFromRef = useRef(0);
  const appliedResumeRef = useRef(false);

  const progressUserIdRef = useRef("");
  const progressTimerRef = useRef(null);
  const lastProgressSavedRef = useRef({ ts: 0, pos: 0 });

  const ensureAuthUserId = useCallback(async () => {
    if (progressUserIdRef.current) return progressUserIdRef.current;
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id || "";
    progressUserIdRef.current = uid;
    return uid;
  }, [supabase]);

  const getStartParamSec = useCallback(() => {
    try {
      const sp = new URLSearchParams(locationSearch || "");
      const raw = sp.get("start");
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  }, [locationSearch]);

  const getProfileIdFromGate = useCallback(() => {
    return String(gateRef?.current?.profile?.id || "").trim();
  }, [gateRef]);

  const loadResumeFromDb = useCallback(
    async (titleDbId, profileIdArg = null) => {
      const uid = await ensureAuthUserId();
      const vid = String(titleDbId || "").trim();
      const pid = String(profileIdArg || "").trim() || getProfileIdFromGate();

      if (!uid || !vid || !pid) return 0;

      const { data, error } = await supabase
        .from("watch_progress")
        .select("position_sec")
        .eq("user_id", uid)
        .eq("profile_id", pid)
        .eq("video_id", vid)
        .maybeSingle();

      if (error) {
        console.warn("[WATCH_PROGRESS] load error:", error);
        return 0;
      }

      return Math.max(0, Math.floor(Number(data?.position_sec || 0)));
    },
    [ensureAuthUserId, supabase, getProfileIdFromGate]
  );

  const upsertWatchProgress = useCallback(
    async (positionSec, profileIdArg = null) => {
      const uid = await ensureAuthUserId();
      const vid = String(titleDbIdRef.current || "").trim();
      const pid = String(profileIdArg || "").trim() || getProfileIdFromGate();

      // ✅ sem perfil não tem como salvar (PK exige profile_id)
      if (!uid || !vid || !pid) return;

      const pos = Math.max(0, Math.floor(Number(positionSec || 0)));
      const nowIso = new Date().toISOString();

      // ✅ ON CONFLICT precisa bater com o PK do banco: (user_id, profile_id, video_id)
      const { error } = await supabase
        .from("watch_progress")
        .upsert(
          { user_id: uid, profile_id: pid, video_id: vid, position_sec: pos, updated_at: nowIso },
          { onConflict: "user_id,profile_id,video_id" }
        );

      if (error) {
        console.warn("[WATCH_PROGRESS] upsert error:", error);
        throw error;
      }

      if (DEBUG) console.log("[WATCH_PROGRESS] saved", { uid, pid, vid, pos });
    },
    [ensureAuthUserId, supabase, titleDbIdRef, getProfileIdFromGate]
  );

  const saveProgress = useCallback(
    async ({ force = false, ended = false, profileId = null } = {}) => {
      const v = videoRef.current;

      const cur = typeof getCurrentTime === "function" ? Number(getCurrentTime() || 0) : Number(v?.currentTime || 0);
      const dur = typeof getDuration === "function" ? Number(getDuration() || 0) : Number(v?.duration || 0);

      if (!Number.isFinite(cur) || cur < 0) return;

      // não salva durante intro
      if (introEnabledRef.current && !introDoneRef.current) return;

      // não salva se está bloqueado
      if (gateRef.current?.blocked) return;

      let pos = Math.floor(cur);
      if (ended || (dur > 0 && dur - cur < 20)) pos = 0;

      const now = Date.now();
      const last = lastProgressSavedRef.current;

      if (!force) {
        if (now - (last.ts || 0) < PROGRESS_SAVE_EVERY_MS) return;
        if (Math.abs(pos - (last.pos || 0)) < PROGRESS_MIN_SAVE_DELTA_SEC) return;
      }

      lastProgressSavedRef.current = { ts: now, pos };

      try {
        await upsertWatchProgress(pos, profileId);
      } catch (e) {
        if (DEBUG) console.warn("[WATCH_PROGRESS] save failed:", e?.message || e);
      }
    },
    [videoRef, gateRef, titleDbIdRef, upsertWatchProgress, introEnabledRef, introDoneRef, getCurrentTime, getDuration]
  );

  const startProgressTimer = useCallback(() => {
    if (progressTimerRef.current) return;
    progressTimerRef.current = setInterval(() => {
      saveProgress({ force: false }).catch(() => {});
    }, PROGRESS_SAVE_EVERY_MS);
  }, [saveProgress]);

  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopProgressTimer(), [stopProgressTimer]);

  const computeResume = useCallback(
    async (titleDbId, profileId = null) => {
      setResumeLoading(true);
      try {
        const fromQuery = getStartParamSec();
        const fromDb = fromQuery > 0 ? 0 : await loadResumeFromDb(titleDbId, profileId);

        const resume = fromQuery > 0 ? fromQuery : fromDb;
        resumeFromRef.current = Math.max(0, resume);
        appliedResumeRef.current = false;
      } finally {
        setResumeLoading(false);
      }
    },
    [getStartParamSec, loadResumeFromDb]
  );

  return {
    resumeLoading,
    resumeFromRef,
    appliedResumeRef,
    computeResume,
    loadResumeFromDb,
    saveProgress,
    startProgressTimer,
    stopProgressTimer,
  };
}
