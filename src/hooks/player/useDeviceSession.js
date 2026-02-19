// src/hooks/player/useDeviceSession.js
import { useCallback, useRef } from "react";
import { DEBUG, DEVICE_LABEL_STORAGE } from "../../player/env.js";
import { defaultDeviceLabel, getOrCreateDeviceKey, guessPlatform, readStoredDeviceLabel } from "../../player/device.js";

export function useDeviceSession({ supabase, titlePublicIdRef, titleDbIdRef, setError }) {
  const deviceIdRef = useRef("");
  const heartbeatRef = useRef(null);
  const lastReportRef = useRef({ ts: 0, is_playing: null, titleDbId: null, profileId: null });
  const sessionStateRef = useRef({ profileId: null, titleDbId: null, is_playing: false });

  const getDeviceLimit = useCallback(async (uid) => {
    try {
      const { data } = await supabase
        .from("user_entitlements")
        .select("max_screens")
        .eq("user_id", uid)
        .maybeSingle();
      const n = Number(data?.max_screens || 0);
      if (Number.isFinite(n) && n > 0) return n;
    } catch {}

    try {
      const ls = Number(localStorage.getItem("cs_max_screens") || 0);
      if (Number.isFinite(ls) && ls > 0) return ls;
    } catch {}

    return 0;
  }, [supabase]);

  const ensureDeviceAndSession = useCallback(
    async ({ profileId, titleDbId, is_playing }) => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data?.user || null;
        if (!user?.id) return;

        const uid = user.id;
        const device_key = getOrCreateDeviceKey();
        const ua = navigator.userAgent || "";
        const platform = guessPlatform();

        let label = readStoredDeviceLabel();
        if (!label) label = defaultDeviceLabel();

        const nowIso = new Date().toISOString();

        const { data: existingDev, error: existingErr } = await supabase
          .from("user_devices")
          .select("id,is_revoked")
          .eq("user_id", uid)
          .eq("device_key", device_key)
          .maybeSingle();

        if (existingErr) throw existingErr;

        if (existingDev?.is_revoked) {
          deviceIdRef.current = "";
          throw new Error("Este aparelho foi desconectado. Entre novamente pela sua conta.");
        }

        if (!existingDev?.id) {
          const limit = await getDeviceLimit(uid);
          if (limit > 0) {
            const { data: devs, error: dErr } = await supabase
              .from("user_devices")
              .select("id")
              .eq("user_id", uid)
              .eq("is_revoked", false);
            if (dErr) throw dErr;
            const count = Array.isArray(devs) ? devs.length : 0;
            if (count >= limit) {
              throw new Error(
                `Limite de aparelhos atingido (${count}/${limit}). Desconecte um aparelho em Perfil → Aparelhos.`
              );
            }
          }
        }

        const { data: dev, error: devErr } = await supabase
          .from("user_devices")
          .upsert(
            { user_id: uid, device_key, label, platform, ua, last_seen_at: nowIso },
            { onConflict: "user_id,device_key" }
          )
          .select("id,is_revoked")
          .single();

        if (devErr) throw devErr;

        if (dev?.is_revoked) {
          deviceIdRef.current = "";
          throw new Error("Este aparelho foi desconectado. Entre novamente pela sua conta.");
        }

        const deviceId = String(dev?.id || "");
        if (!deviceId) throw new Error("Falha ao obter device_id.");
        deviceIdRef.current = deviceId;

        // ✅ 1 sessão por device, gravando SOMENTE UUID
        const publicIdForSession = String(titlePublicIdRef.current || "").trim();
        const dbIdForSession = String(titleDbIdRef.current || "").trim();

        const { error: sessErr } = await supabase
          .from("device_sessions")
          .upsert(
            {
              user_id: uid,
              device_id: deviceId,
              last_seen_at: nowIso,
              status: "active",
              profile_id: profileId || null,
              current_title_id: dbIdForSession || null,
              current_title_public_id: publicIdForSession || null,
              is_playing: !!is_playing,
              playback_updated_at: nowIso,
            },
            { onConflict: "device_id" }
          );

        if (sessErr) throw sessErr;

        return true;
      } catch (e) {
        if (DEBUG) console.error("[DEVICES] ensureDeviceAndSession failed:", e);
        throw e;
      }
    },
    [supabase, titlePublicIdRef, titleDbIdRef]
  );

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startHeartbeatIfNeeded = useCallback(() => {
    if (heartbeatRef.current) return;

    heartbeatRef.current = setInterval(async () => {
      const deviceId = String(deviceIdRef.current || "").trim();
      if (!deviceId) return;

      try {
        const nowIso = new Date().toISOString();
        const st = sessionStateRef.current || {};
        const profileId = st.profileId || null;
        const titleDbId = st.titleDbId || null;
        const is_playing = !!st.is_playing;

        await supabase.from("user_devices").update({ last_seen_at: nowIso }).eq("id", deviceId);

        await supabase
          .from("device_sessions")
          .update({
            last_seen_at: nowIso,
            status: "active",
            profile_id: profileId,
            current_title_id: titleDbId,
            is_playing,
            playback_updated_at: nowIso,
          })
          .eq("device_id", deviceId);
      } catch (e) {
        if (DEBUG) console.warn("[DEVICES] heartbeat failed:", e?.message || e);
      }
    }, 25_000);
  }, [supabase]);

  const reportSessionState = useCallback(
    async ({ profileId, titleDbId, is_playing }) => {
      sessionStateRef.current = { profileId: profileId || null, titleDbId: titleDbId || null, is_playing: !!is_playing };

      const now = Date.now();
      const last = lastReportRef.current || {};
      const changed =
        last.is_playing !== !!is_playing ||
        String(last.titleDbId || "") !== String(titleDbId || "") ||
        String(last.profileId || "") !== String(profileId || "");

      if (!changed && now - (last.ts || 0) < 8000) return;

      lastReportRef.current = { ts: now, is_playing: !!is_playing, titleDbId, profileId };

      try {
        const deviceId = String(deviceIdRef.current || "").trim();

        if (!deviceId) {
          await ensureDeviceAndSession({ profileId, titleDbId, is_playing });
          startHeartbeatIfNeeded();
          return;
        }

        const nowIso = new Date().toISOString();
        await supabase.from("user_devices").update({ last_seen_at: nowIso }).eq("id", deviceId);

        await supabase
          .from("device_sessions")
          .update({
            last_seen_at: nowIso,
            status: "active",
            profile_id: profileId || null,
            current_title_id: titleDbId || null,
            is_playing: !!is_playing,
            playback_updated_at: nowIso,
          })
          .eq("device_id", deviceId);

        startHeartbeatIfNeeded();
      } catch (e) {
        const msg = e?.message || "Não consegui registrar este aparelho. Verifique SQL/RLS.";
        setError(String(msg));
      }
    },
    [ensureDeviceAndSession, startHeartbeatIfNeeded, supabase, setError]
  );

  return { reportSessionState, stopHeartbeat };
}
