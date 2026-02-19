import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient.js";

function storageKeyActiveProfile(uid) {
  return `cs_active_profile:${uid || "anon"}`;
}

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || "";
}

function readActiveProfileId(uid) {
  if (!uid) return "";
  try {
    return String(localStorage.getItem(storageKeyActiveProfile(uid)) || "").trim();
  } catch {
    return "";
  }
}

function pickVideoUuid(item) {
  return String(item?.dbId || item?.db_id || item?.video_id || item?.videoId || "").trim();
}

export function useWatchProgressForItems(items) {
  const [progressByVideoId, setProgressByVideoId] = useState(() => new Map());
  const [loading, setLoading] = useState(false);

  const videoIds = useMemo(() => {
    const set = new Set();
    for (const it of items || []) {
      const vid = pickVideoUuid(it);
      if (vid) set.add(vid);
    }
    return Array.from(set);
  }, [items]);

  const fetchProgress = useCallback(async () => {
    if (!videoIds.length) {
      setProgressByVideoId(new Map());
      return;
    }

    setLoading(true);
    try {
      const uid = await getUserId();
      const profileId = readActiveProfileId(uid);

      if (!uid || !profileId) {
        setProgressByVideoId(new Map());
        return;
      }

      const { data, error } = await supabase
        .from("watch_progress")
        .select("video_id, position_sec")
        .eq("user_id", uid)
        .eq("profile_id", profileId)
        .in("video_id", videoIds);

      if (error) throw error;

      const m = new Map();
      for (const row of data || []) {
        m.set(String(row.video_id), Number(row.position_sec || 0));
      }
      setProgressByVideoId(m);
    } catch {
      setProgressByVideoId(new Map());
    } finally {
      setLoading(false);
    }
  }, [videoIds]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  // ✅ troca de perfil no TopNav (sem mudar URL)
  useEffect(() => {
    const onProfileChanged = () => fetchProgress();
    window.addEventListener("cs:profile-changed", onProfileChanged);
    return () => window.removeEventListener("cs:profile-changed", onProfileChanged);
  }, [fetchProgress]);

  return { progressByVideoId, loading };
}
