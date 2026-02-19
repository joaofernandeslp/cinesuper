import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient.js";

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || "";
}

function getActiveProfileId(uid) {
  try {
    return String(localStorage.getItem(`cs_active_profile:${uid}`) || "").trim();
  } catch {
    return "";
  }
}

function getActiveProfileName(uid) {
  try {
    return String(localStorage.getItem(`cs_active_profile_name:${uid}`) || "").trim();
  } catch {
    return "";
  }
}

/**
 * Continuar assistindo - colapso de episódios:
 * - ep-19244304-s01e01 + ep-19244304-s01e02 -> 1 card: sr-19244304
 */
const EP_RE = /^ep-(\d{8})-s(\d{2})e(\d{2})$/i;

function stripEpisodeSuffix(title) {
  // remove sufixos comuns: " • T1E02", " - T1E02", "(T1E02)" etc
  let t = String(title || "").trim();
  if (!t) return t;
  t = t.replace(/\s*[•\-–—]\s*T\d+\s*E\d+\s*$/i, "").trim();
  t = t.replace(/\s*\(\s*T\d+\s*E\d+\s*\)\s*$/i, "").trim();
  return t;
}

function epPublicIdToSeriesId(epPublicId) {
  const s = String(epPublicId || "").trim().toLowerCase();
  const m = s.match(EP_RE);
  if (!m) return "";
  const digits8 = m[1]; // já vem 8 dígitos
  return `sr-${digits8}`;
}

function seriesIdToImdbId(srPublicId) {
  // sr-19244304 -> tt19244304 (mantém sem zeros)
  const s = String(srPublicId || "").trim().toLowerCase();
  if (!s.startsWith("sr-")) return "";
  const digits8 = s.replace(/^sr-/, "");
  const digits = digits8.replace(/^0+/, "") || "0";
  return `tt${digits}`;
}

function asTime(x) {
  const t = new Date(String(x || "")).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Regra: se vierem vários episódios da mesma série, mostramos apenas 1 item (sr-########),
 * escolhendo como “representante” o episódio com updatedAt mais recente.
 */
function collapseContinueWatching(list) {
  const out = [];
  const bySeries = new Map(); // srId -> representative item

  for (const it of list || []) {
    const pid = String(it?.publicId || it?.id || "").trim();
    const srId = epPublicIdToSeriesId(pid);

    // não é episódio -> mantém
    if (!srId) {
      out.push(it);
      continue;
    }

    const cur = bySeries.get(srId);
    const itTime = asTime(it?.updatedAt);
    const curTime = asTime(cur?.updatedAt);

    // escolhe o mais recente
    if (!cur || itTime >= curTime) {
      // cria um card de série (sr-########)
      bySeries.set(srId, {
        ...it,

        // ✅ vira o card da série
        id: srId,
        publicId: srId,

        // ✅ marca como série agregada (útil se você quiser diferenciar no UI)
        seriesCard: true,
        seriesImdbId: seriesIdToImdbId(srId),

        // ✅ evita chip de T/E no TitleCard (porque ele usa r2_prefix pra isso)
        r2_prefix: "",
        r2Prefix: "",

        // ✅ garante que o TitleCard saiba que é TV
        media_type: "tv",
        mediaType: "tv",

        // ✅ título limpo (sem "• T1E02")
        title: stripEpisodeSuffix(it?.title),

        // ✅ este é o episódio “mais recente” que o usuário estava assistindo
        // (pode ser útil no futuro)
        resumeEpisodePublicId: String(pid || "").trim(),
      });
    }
  }

  out.push(...Array.from(bySeries.values()));

  // ordena tudo por updatedAt desc (para ficar natural no Continue Watching)
  out.sort((a, b) => asTime(b?.updatedAt) - asTime(a?.updatedAt));

  return out;
}

export function useContinueWatching({ limit = 30, days = 5 } = {}) {
  const [items, setItems] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const uid = await getUserId();
      const profileId = getActiveProfileId(uid);
      const pName = getActiveProfileName(uid);

      setProfileName(pName || "Perfil");

      if (!uid || !profileId) {
        setItems([]);
        return;
      }

      const { data, error } = await supabase.rpc("get_continue_watching", {
        p_profile_id: profileId,
        p_limit: limit,
        p_days: days,
      });

      if (error) throw error;

      const rawList = (data || []).map((r) => ({
        // formato compatível com Row/TitleCard do seu app
        id: r.public_id || r.video_id, // rota usa public_id quando existir
        publicId: r.public_id || null,
        dbId: r.video_id,

        title: r.title,
        year: r.year,
        maturity: String(r.maturity || ""),
        duration: r.duration_label || "",
        durationSec: Number(r.duration_sec || 0),

        thumb: r.thumb_url || "",
        hero_image_url: r.hero_image_url || "",

        tags: Array.isArray(r.tags) ? r.tags : r.tags ? Object.values(r.tags) : [],
        categories: Array.isArray(r.categories) ? r.categories : r.categories ? Object.values(r.categories) : [],

        has4k: !!r.has_4k,

        // ✅ progresso
        progressSec: Number(r.position_sec || 0),
        updatedAt: r.updated_at,

        // (se o RPC já trouxer isso, ótimo; se não trouxer, tudo bem)
        media_type: r.media_type || r.mediaType || null,
        imdb_id: r.imdb_id || r.imdbId || null,
        r2_prefix: r.r2_prefix || r.r2Prefix || "",
      }));

      // ✅ aqui está a mágica: episódios -> 1 card da série
      const collapsed = collapseContinueWatching(rawList);

      setItems(collapsed);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [limit, days]);

  useEffect(() => {
    load();
  }, [load]);

  // troca perfil no TopNav
  useEffect(() => {
    const onProfileChanged = () => load();
    window.addEventListener("cs:profile-changed", onProfileChanged);
    return () => window.removeEventListener("cs:profile-changed", onProfileChanged);
  }, [load]);

  return { items, profileName, loading, reload: load };
}
