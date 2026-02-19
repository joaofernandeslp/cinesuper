// src/hooks/player/usePlayerBootstrap.js
import { useEffect, useMemo, useRef, useState } from "react";
import { getAllow4k } from "../../lib/playbackPolicy.js";
import { fetchSeasonEpisodes, fetchTitleById } from "../../lib/catalogApi.js";
import { normalizeGatewayUrl } from "../../player/gateway.js";
import { defaultDeviceLabel, getOrCreateDeviceKey, guessPlatform, readStoredDeviceLabel } from "../../player/device.js";
import { isHttpUrl } from "../../player/utils.js";
import { DEBUG, INTRO_MODE, INTRO_SRC } from "../../player/env.js";
import {
  getActiveProfileContext,
  checkTitleAccess,
  canUnlockWithPin,
  isUnlocked,
} from "../../lib/profilePolicy.js";

export function usePlayerBootstrap({
  supabase,
  id,
  initialItem,
  locationSearch,
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

  // ✅ NOVO: refs para refresh do token no engine
  pbBodyRef, // useRef({ ...body usado no invoke })
  pbExpRef,  // useRef(number exp em epoch seconds)

  resetPlayerLocalState, // fn para zerar overlays/refs no Player.jsx
  computeResume, // do useWatchProgress
  reportSessionState, // do useDeviceSession
}) {
  const [loading, setLoading] = useState(true);
  const [stage, setStageState] = useState("init");
  const [effectAlive, setEffectAlive] = useState(false);
  const stageRef = useRef("init");
  const BOOT_TIMEOUT_MS = 20000;

  const setStage = (s) => {
    stageRef.current = s || "bootstrap";
    setStageState(stageRef.current);
    if (DEBUG) console.log("[BOOT]", stageRef.current);
  };

  const introEnabled = useMemo(() => {
    const s = String(INTRO_SRC || "").trim();
    return !!s && s !== "/";
  }, []);

  const introKey = useMemo(() => `cs_intro_done_${String(INTRO_SRC || "").slice(0, 80)}`, []);

  const normalizeR2Prefix = (p) => {
    let s = String(p || "").trim();
    if (!s) return "";
    s = s.replace(/\\/g, "/");
    s = s.replace(/^\/+/, "");
    if (!s.endsWith("/")) s += "/";
    return s;
  };

  const readIntroAlreadyDoneOnce = () => {
    if (!introEnabled) return true;
    if (INTRO_MODE !== "once") return false;
    try {
      return sessionStorage.getItem(introKey) === "1";
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let alive = true;
    let timeoutId = null;
    setEffectAlive(true);

    const clearTimeoutGuard = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    async function load() {
      clearTimeoutGuard();
      timeoutId = setTimeout(() => {
        if (!alive) return;
        const stage = stageRef.current || "bootstrap";
        setError(`Timeout ao carregar (${stage}). Verifique a rede e tente novamente.`);
        setLoading(false);
        alive = false;
      }, BOOT_TIMEOUT_MS);

      setStage("start");
      setLoading(true);
      setError("");

      // resets controlados pelo Player.jsx
      resetPlayerLocalState?.();

      // reset payload bootstrap
      setItem(null);
      setSeasonEpisodes([]);
      setPbSrc("");
      setPbThumbs("");
      setThumbCues([]);

      // limpa refs do título
      titlePublicIdRef.current = "";
      titleDbIdRef.current = "";

      // ✅ limpa exp/body do token
      if (pbBodyRef) pbBodyRef.current = null;
      if (pbExpRef) pbExpRef.current = 0;

      // allow4k (policy local)
      const allow4k = !!getAllow4k();
      allow4kRef.current = allow4k;

      let profForSession = null;

      try {
        let data = null;
        const routeId = String(id || "").trim();
        const itemPid = String(initialItem?.publicId || initialItem?.id || "").trim();
        const itemDbId = String(initialItem?.dbId || "").trim();
        const useInitial =
          !!initialItem && !!routeId && (itemPid === routeId || itemDbId === routeId);

        if (useInitial) {
          setStage("prefill");
          data = initialItem;
        } else {
          setStage("fetchTitle");
          data = await fetchTitleById(routeId || id, { allow4k });
        }
        if (!alive) return;

        if (!data) {
          setItem(null);
          setLoading(false);
          return;
        }

        setItem(data);

        // ids
        const titlePublicId = String(data?.publicId || data?.id || id || "").trim();
        const titleDbId = data?.dbId ? String(data.dbId).trim() : "";
        titlePublicIdRef.current = titlePublicId;
        titleDbIdRef.current = titleDbId;

        // gate (profile policy) antes do token
        try {
          setStage("profile");
          const ctx = await getActiveProfileContext();
          const prof = ctx?.profile || null;
          profForSession = prof;

          if (prof) {
            const alreadyUnlocked = isUnlocked(prof.id, data.id);

            if (!alreadyUnlocked) {
              const res = checkTitleAccess({
                profile: prof,
                title: data,
                blockedPublicIds: ctx.blockedPublicIds,
              });

              if (!res.ok) {
                const needPin = canUnlockWithPin(prof);
                setGate({ blocked: true, reason: res.reason, needPin, profile: prof });
                setLoading(false);
                return;
              }
            }
          }

          setGate({ blocked: false, reason: "", needPin: false, profile: prof });
        } catch {
          profForSession = null;
          setGate({ blocked: false, reason: "", needPin: false, profile: null });
        }

        // resume: prioridade ?start= senão DB
        setStage("resume");
        await computeResume(titleDbId, profForSession?.id || null);

        // dados hls
        const masterKeyRaw = String(data?.hlsMasterKey || data?.hlsMasterUrl4k || data?.hlsMasterUrl || "").trim();
        const masterHdKeyRaw = String(data?.hlsMasterHdKey || data?.hlsMasterUrlHd || "").trim();
        const r2PrefixRaw = String(data?.r2Prefix || data?.r2_prefix || "").trim();
        const r2Prefix = normalizeR2Prefix(r2PrefixRaw);
        const fallbackMaster = r2Prefix ? `${r2Prefix}master.m3u8` : "";
        const fallbackMasterHd = r2Prefix ? `${r2Prefix}master-hd.m3u8` : "";

        const masterKeyReal = masterKeyRaw || fallbackMaster;
        const masterHdKeyReal = masterHdKeyRaw || fallbackMasterHd;

        const masterUrlLegacy = isHttpUrl(masterKeyReal) ? masterKeyReal : "";
        const masterHdUrlLegacy = isHttpUrl(masterHdKeyReal) ? masterHdKeyReal : "";

        if (!masterKeyReal && !masterHdKeyReal) throw new Error("Sem HLS no item (hlsMasterKey/hlsMasterHdKey).");

        const deviceKey = getOrCreateDeviceKey();

        let deviceLabel = readStoredDeviceLabel();
        if (!deviceLabel) deviceLabel = defaultDeviceLabel();

        const platform = guessPlatform();
        const ua = navigator.userAgent || "";

        // ✅ corpo do invoke (vamos reutilizar para refresh)
        const pbBody = {
          titlePublicId,
          titleDbId: titleDbId || null,
          titleId: titlePublicId, // compat

          allow4k,

          deviceKey,
          deviceLabel,
          platform,
          ua,

          masterKey: masterKeyReal && !masterUrlLegacy ? masterKeyReal : undefined,
          masterHdKey: masterHdKeyReal && !masterHdUrlLegacy ? masterHdKeyReal : undefined,

          masterUrl: masterUrlLegacy || undefined,
          masterHdUrl: masterHdUrlLegacy || undefined,

          r2Prefix: r2PrefixRaw || undefined,
          masterName: "master.m3u8",
          masterHdName: "master-hd.m3u8",
        };

        if (pbBodyRef) pbBodyRef.current = pbBody;

        // invoke playback-token
        setStage("playback-token");
        const { data: pb, error: pbErr } = await supabase.functions.invoke("playback-token", {
          body: pbBody,
        });

        if (DEBUG) console.log("[PB] invoke result", { pb, pbErr });

        if (pbErr) throw new Error(pbErr.message || "Erro ao invocar playback-token.");
        if (!pb?.ok) throw new Error(String(pb?.error || "Falha ao gerar token."));

        const master = normalizeGatewayUrl(String(pb?.master || "").trim());
        const thumbs = normalizeGatewayUrl(String(pb?.thumbs || "").trim());

        if (!master) throw new Error("playback-token não retornou master.");

        // ✅ guarda exp para o engine poder renovar
        const exp = Number(pb?.exp || 0);
        if (pbExpRef) pbExpRef.current = Number.isFinite(exp) ? exp : 0;

        setPbSrc(master);
        setPbThumbs(thumbs || "");

        if (DEBUG) console.log("[PLAYBACK] gateway ok", { master, thumbs, exp });

        // episódios
        // episódios (suporta camelCase e snake_case)
        const seriesId = data?.seriesId ?? data?.series_id ?? null;
        const seasonId = data?.seasonId ?? data?.season_id ?? null;

        if (seriesId && seasonId) {
          setStage("episodes");
          const eps = await fetchSeasonEpisodes({ seriesId, seasonId });
          if (!alive) return;
          setSeasonEpisodes(Array.isArray(eps) ? eps : []);
        } else {
          setSeasonEpisodes([]);
        }

        // sessão inicial (não tocando)
        setStage("session");
        await reportSessionState({
          profileId: profForSession?.id || null,
          titleDbId: titleDbId || null,
          is_playing: false,
        });
      } catch (e) {
        if (!alive) return;
        setError(e?.message ? String(e.message) : "Falha ao carregar do Supabase.");
      } finally {
        clearTimeoutGuard();
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
      clearTimeoutGuard();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, gateBump, locationSearch]);

  return { loading, stage, effectAlive, introEnabled, readIntroAlreadyDoneOnce };
}
