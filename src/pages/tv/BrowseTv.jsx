// src/pages/tv/BrowseTv.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Logo from "../../assets/Logo.png";

import { fetchCatalog } from "../../lib/catalogApi.js";
import { getAllow4k } from "../../lib/playbackPolicy.js";
import { getActiveProfileContext, checkTitleAccess } from "../../lib/profilePolicy.js";
import { useContinueWatching } from "../../hooks/browse/useContinueWatching.js";

import TvSidebar, { TV_SIDEBAR_ITEMS } from "./components/TvSidebar.jsx";
import TvHero from "./components/TvHero.jsx";
import TvRow from "./components/TvRow.jsx";
import TvKeyboard, { keyboardSize, getKeyAt } from "./components/TvKeyboard.jsx";
import TvPreviewOverlay from "./components/TvPreviewOverlay.jsx";
import TvIntroPopup from "./components/TvIntroPopup.jsx";

import { KEY, BACK_KEYCODES, hasCode } from "./_tvKeys.js";
import { scrollRowToCenter, scrollTopHard, ensureVisibleH } from "./_tvScroll.js";

import { supabase } from "../../lib/supabaseClient.js";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function onlyDigits(imdbId) {
  return String(imdbId || "").replace(/^tt/i, "").replace(/\D+/g, "");
}
function pad8(n) {
  return String(n || "").padStart(8, "0");
}

const SR_RE = /^sr-\d{8}$/i;

function isSeriesLike(it) {
  const tid = String(it?.id || "").trim();
  return !!it?.seriesCard || SR_RE.test(tid);
}

function seriesIdFromImdb(imdbId) {
  const d = onlyDigits(imdbId);
  return d ? `sr-${pad8(d)}` : "";
}
function seriesTitleFromPrefix(prefix) {
  const p = String(prefix || "");
  const m = p.match(/\/([^/]+)\s*\[(tt\d{7,8})\]\//i);
  if (!m) return "";
  return String(m[1] || "").replace(/\s+/g, " ").trim();
}
function pickBestRepresentative(a, b) {
  const ta = a?.last_watched_at || a?.updated_at || a?.updatedAt || a?.created_at || "";
  const tb = b?.last_watched_at || b?.updated_at || b?.updatedAt || b?.created_at || "";
  if (ta && tb) return String(tb) > String(ta) ? b : a;
  return b || a;
}
function collapseContinueWatching(list) {
  const out = [];
  const bySeries = new Map();

  for (const it of list || []) {
    const mt = String(it?.media_type || it?.mediaType || "").toLowerCase();
    const imdb = String(it?.imdb_id || it?.imdbId || "").toLowerCase();

    if (mt === "tv" && imdb.startsWith("tt")) {
      const cur = bySeries.get(imdb);
      bySeries.set(imdb, cur ? pickBestRepresentative(cur, it) : it);
      continue;
    }
    out.push(it);
  }

  for (const [imdb, rep] of bySeries.entries()) {
    const srId = seriesIdFromImdb(imdb);
    const titleFromPath = seriesTitleFromPrefix(rep?.r2_prefix || rep?.r2Prefix || "");
    const displayTitle = titleFromPath || rep?.seriesTitle || rep?.showTitle || rep?.title || "Série";

    out.push({
      ...rep,
      id: srId || rep.id,
      publicId: srId || rep.publicId,
      seriesCard: true,
      seriesImdbId: imdb,
      title: displayTitle,
    });
  }

  out.sort((a, b) => {
    const ta = a?.last_watched_at || a?.updated_at || a?.updatedAt || a?.created_at || "";
    const tb = b?.last_watched_at || b?.updated_at || b?.updatedAt || b?.created_at || "";
    return String(tb).localeCompare(String(ta));
  });

  return out;
}

function mediaTypeOf(it) {
  const mt = String(it?.media_type || it?.mediaType || "").toLowerCase().trim();
  if (mt) return mt;
  if (it?.season_number || it?.episode_number) return "tv";
  return "movie";
}

// ✅ id “canônico” para dedup / watchlist / continue-watching
function titleIdOf(it) {
  return String(
    it?.title_public_id || it?.titlePublicId || it?.public_id || it?.publicId || it?.id || ""
  ).trim();
}

/* =========================
   Distribuição por gênero (TV)
========================= */

const GENRE_PRIORITY = [
  "Suspense",
  "Terror",
  "Mistério",
  "Crime",
  "Ficção científica",
  "Ação",
  "Aventura",
  "Fantasia",
  "Drama",
  "Comédia",
  "Romance",
  "Animação",
  "Documentário",
  "Guerra",
  "Faroeste",
  "Família",
  "Musical",
];

const COLLECTION_PRIORITY = ["Em alta", "Novidades", "Recomendados", "Para começar"];
const TV_CAT_CHUNK_SIZE = 24;

function cleanCategories(cats) {
  return (Array.isArray(cats) ? cats : [])
    .map((c) => String(c || "").trim())
    .filter(Boolean);
}

function isTypeCategoryName(c) {
  const n = norm(c);
  return n === "filmes" || n === "series" || n === "séries";
}

function hasCategory(it, cat) {
  const wanted = norm(cat);
  if (!wanted) return false;
  const cats = cleanCategories(it?.categories);
  return cats.some((c) => norm(c) === wanted);
}

function pickPrimaryGenreFromItem(it) {
  const explicit = String(it?.primary_genre || it?.genre || it?.main_genre || "").trim();
  if (explicit) return explicit;

  const cats = cleanCategories(it?.categories);
  if (!cats.length) return "";

  const filtered = cats.filter(
    (c) => !isTypeCategoryName(c) && !COLLECTION_PRIORITY.some((p) => norm(p) === norm(c))
  );

  if (!filtered.length) return cats.find((c) => !isTypeCategoryName(c)) || cats[0] || "";

  const priorityNorm = GENRE_PRIORITY.map(norm);

  let best = "";
  let bestRank = 9999;

  for (const c of filtered) {
    const idx = priorityNorm.indexOf(norm(c));
    const rank = idx === -1 ? 9999 : idx;
    if (rank < bestRank) {
      bestRank = rank;
      best = c;
    }
  }

  return best || filtered[0] || cats[0] || "";
}

function chunk(items, size) {
  const out = [];
  const n = Math.max(1, Number(size || 1));
  for (let i = 0; i < (items || []).length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/* =========================
   ✅ CALENDÁRIO (cinema -> data no CineSuper)
========================= */

function parseDateOnly(v) {
  const s = String(v || "").trim();
  if (!s) return null;

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }

  const dt = new Date(s);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function dateKeyYYYYMMDD(dt) {
  if (!dt) return "";
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmtPtDate(dt) {
  if (!dt) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(dt);
  } catch {
    const k = dateKeyYYYYMMDD(dt);
    return k ? k : "";
  }
}

function getCineSuperReleaseDate(it) {
  const v =
    it?.cinesuper_release_at ??
    it?.cinesuperReleaseAt ??
    it?.cinesuper_release_date ??
    it?.cinesuperReleaseDate ??
    it?.cs_release_at ??
    it?.csReleaseAt ??
    it?.cs_release_date ??
    it?.csReleaseDate ??
    it?.available_at ??
    it?.availableAt ??
    it?.release_at ??
    it?.releaseAt ??
    it?.coming_at ??
    it?.comingAt ??
    it?.coming_to_cinesuper_at ??
    it?.comingToCinesuperAt ??
    it?.coming_to_cinesuper_date ??
    it?.comingToCinesuperDate ??
    "";

  return parseDateOnly(v);
}

function isInCinema(it) {
  const f =
    it?.in_cinema ??
    it?.inCinema ??
    it?.is_in_cinema ??
    it?.isInCinema ??
    it?.cinema ??
    it?.isCinema ??
    false;

  if (f === true) return true;

  const cats = cleanCategories(it?.categories);
  const tags = Array.isArray(it?.tags) ? it.tags.map((t) => String(t || "").trim()).filter(Boolean) : [];

  const hay = [...cats, ...tags].map(norm);
  return hay.includes("cinema") || hay.includes("em cinema") || hay.includes("nos cinemas") || hay.includes("no cinema");
}

/* =========================
   ✅ Intro Popup config
========================= */
const WHATSAPP_NUMBER = String(
  import.meta?.env?.VITE_CS_WHATSAPP_NUMBER || import.meta?.env?.VITE_CS_WHATSAPP || ""
).trim();

const INTRO_SEEN_KEY = "cs_tv_intro_seen_v1";

export default function BrowseTv() {
  const nav = useNavigate();
  const location = useLocation();

  const from = useMemo(() => {
    const st = location.state || {};
    const raw = String(st.from || "").trim();

    if (!raw) return "";
    if (/\/login/i.test(raw)) return "";
    if (raw.startsWith("/tv/")) return raw.replace(/^\/tv/, "") || "";
    if (raw === "/who" || raw === "/browse") return raw;
    if (raw.startsWith("/watch/") || raw.startsWith("/t/")) return raw;
    return "";
  }, [location.state]);

  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  const LEFT_INSET = 140;

  const [sectionKey, setSectionKey] = useState("home");

  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [profileCtx, setProfileCtx] = useState({ profile: null, blockedPublicIds: new Set() });
  const [profileLoading, setProfileLoading] = useState(true);

  const cw = useContinueWatching({ limit: 30, days: 5 });

  const [searchText, setSearchText] = useState("");

  // area: intro | sidebar | hero | rows | keyboard | preview
  const [area, setArea] = useState("sidebar");

  const [sidebarIndex, setSidebarIndex] = useState(2); // 0=perfil, 1=pesquisa, 2=início
  const [heroIndex, setHeroIndex] = useState(0);
  const [rowIndex, setRowIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);

  const { rows: KB_R, cols: KB_C } = keyboardSize();
  const [kbRow, setKbRow] = useState(0);
  const [kbCol, setKbCol] = useState(0);

  const pageRef = useRef(null);

  const sidebarRefs = useRef([]);
  const heroRefs = useRef([null, null]);

  const rowRefs = useRef([]);
  const cardRefs = useRef([]);
  const rowScrollerRefs = useRef([]);

  const kbRefs = useRef([]);

  // Preview
  const previewTimerRef = useRef(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);

  // ✅ foco dos botões do preview: 0=Assistir, 1=Minha Lista
  const [previewBtnIndex, setPreviewBtnIndex] = useState(0);
  const previewBtnRefs = useRef([null, null]);

  // ✅ Intro Popup (TV) — 1 botão
  const [introOpen, setIntroOpen] = useState(false);
  const introBtnRefs = useRef([null]);

  // Watchlist (TV)
  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [watchlistOrder, setWatchlistOrder] = useState([]);
  const [listBusy, setListBusy] = useState(false);

  useEffect(() => {
    const st = location.state || {};
    const sk = String(st.sectionKey || st.section || "").trim();
    if (!sk) return;

    const idx = TV_SIDEBAR_ITEMS.findIndex((it) => it.key === sk);
    if (idx >= 0) {
      setSectionKey(sk);
      setSidebarIndex(idx + 1);
      setHeroIndex(0);
      setRowIndex(0);
      setCardIndex(0);
      setPreviewOpen(false);
      setPreviewItem(null);
      clearPreviewTimer();
      scrollTopHard(pageRef.current);
    }
  }, [location.state]);

  function clearPreviewTimer() {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
  }

  function setRowRef(i, el) {
    rowRefs.current[i] = el;
  }
  function setRowScrollerRef(i, el) {
    rowScrollerRefs.current[i] = el;
  }
  function setCardRef(r, c, el) {
    if (!cardRefs.current[r]) cardRefs.current[r] = [];
    cardRefs.current[r][c] = el;
  }
  function setKbRef(r, c, el) {
    if (!kbRefs.current[r]) kbRefs.current[r] = [];
    kbRefs.current[r][c] = el;
  }

  const activeSidebarIndex = useMemo(() => {
    const idx = TV_SIDEBAR_ITEMS.findIndex((it) => it.key === sectionKey);
    return idx >= 0 ? idx + 1 : 2;
  }, [sectionKey]);

  function focusSidebar(i = sidebarIndex) {
    const total = TV_SIDEBAR_ITEMS.length + 1; // +1 do Perfil
    const useActive = area !== "sidebar";
    const base = useActive ? activeSidebarIndex : i;
    const idx = Math.max(0, Math.min(base, total - 1));
    setArea("sidebar");
    setSidebarIndex(idx);
    requestAnimationFrame(() => sidebarRefs.current[idx]?.focus?.());
  }

  function focusHero(i = 0) {
    setArea("hero");
    const idx = i === 1 ? 1 : 0;
    setHeroIndex(idx);
    scrollTopHard(pageRef.current);
    requestAnimationFrame(() => heroRefs.current[idx]?.focus?.());
  }

  function focusKeyboard(r = kbRow, c = kbCol) {
    const rr = Math.max(0, Math.min(r, KB_R - 1));
    const cc = Math.max(0, Math.min(c, KB_C - 1));
    setArea("keyboard");
    setKbRow(rr);
    setKbCol(cc);
    scrollTopHard(pageRef.current);
    requestAnimationFrame(() => kbRefs.current?.[rr]?.[cc]?.focus?.());
  }

  function focusRows(r, c, opts = { center: true }) {
    const rr = Math.max(0, Math.min(r, Math.max(0, visualRows.length - 1)));
    const rowLen = visualRows[rr]?.items?.length || 0;
    const cc = Math.max(0, Math.min(c, Math.max(0, rowLen - 1)));

    const enteringRows = area !== "rows";
    const rowChanged = rr !== rowIndex;

    setArea("rows");
    setRowIndex(rr);
    setCardIndex(cc);

    requestAnimationFrame(() => {
      const btn = cardRefs.current?.[rr]?.[cc];
      btn?.focus?.();

      const sc = rowScrollerRefs.current?.[rr];
      if (sc && btn) ensureVisibleH(sc, btn);

      if (opts.center && (enteringRows || rowChanged)) {
        const rowEl = rowRefs.current[rr];
        scrollRowToCenter(pageRef.current, rowEl, 0.52);
      }
    });
  }

  // ✅ close intro helper
function closeIntro(restore = true) {
  setIntroOpen(false);
  setArea("sidebar");

  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {}

  if (!restore) return;

  requestAnimationFrame(() => focusSidebar(2));
}

  // ---------------------------
  // Boot catálogo + perfil
  // ---------------------------
  useEffect(() => {
    let alive = true;
    let profilePending = true;
    let catalogPending = true;
    const watchdog = setTimeout(() => {
      if (!alive) return;
      if (!profilePending && !catalogPending) return;
      setErr((prev) => prev || "Tempo de carregamento excedido. Verifique a conexão.");
      if (profilePending) setProfileLoading(false);
      if (catalogPending) setLoading(false);
    }, 30000);

    setLoading(true);
    setErr("");

    const allow4k = getAllow4k();

    setProfileLoading(true);
    getActiveProfileContext()
      .then((ctx) => {
        if (!alive) return;
        setProfileCtx({
          profile: ctx.profile || null,
          blockedPublicIds: ctx.blockedPublicIds || new Set(),
        });
      })
      .catch((e) => {
        if (!alive) return;
        console.warn("getActiveProfileContext", e);
        setProfileCtx({ profile: null, blockedPublicIds: new Set() });
      })
      .finally(() => {
        if (!alive) return;
        profilePending = false;
        setProfileLoading(false);
      });

    fetchCatalog({ allow4k, includeDraftCalendar: true })
      .then((data) => {
        if (!alive) return;
        setCatalog(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        console.error("fetchCatalog", e);
        if (!alive) return;
        setErr(e?.message || "Falha ao carregar catálogo.");
        setCatalog([]);
      })
      .finally(() => {
        if (!alive) return;
        catalogPending = false;
        setLoading(false);
      });

    return () => {
      alive = false;
      clearTimeout(watchdog);
    };
  }, []);

  // ---------------------------
  // ✅ Show intro once (after loading)
  // ---------------------------
useEffect(() => {
  if (loading || profileLoading) return;

  let seen = false;
  try {
    seen = localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {}

  if (seen) return;

  setIntroOpen(true);
  setArea("intro");

  // ✅ força foco (2 tentativas: render + estabilização)
  requestAnimationFrame(() => introBtnRefs.current?.[0]?.focus?.());
  setTimeout(() => introBtnRefs.current?.[0]?.focus?.(), 60);
}, [loading, profileLoading]);

  // ---------------------------
  // ✅ HYDRATE avatar_url
  // ---------------------------
  const activeProfileId = String(profileCtx?.profile?.id || "").trim();

  useEffect(() => {
    let alive = true;

    async function hydrateActiveProfile() {
      if (!activeProfileId) return;
      if (String(profileCtx?.profile?.avatar_url || "").trim()) return;

      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, name, avatar_url, is_kids")
        .eq("id", activeProfileId)
        .single();

      if (!alive) return;
      if (error || !data) return;

      setProfileCtx((prev) => ({
        ...prev,
        profile: { ...(prev.profile || {}), ...data },
      }));
    }

    hydrateActiveProfile();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId]);

  // ---------------------------
  // ✅ Watchlist (TV)
  // ---------------------------
  useEffect(() => {
    let alive = true;

    async function loadList(pid) {
      setWatchlistIds(new Set());
      setWatchlistOrder([]);
      if (!pid) return;

      try {
        const { data, error } = await supabase
          .from("user_watchlist")
          .select("title_public_id, created_at")
          .eq("profile_id", pid)
          .order("created_at", { ascending: false })
          .limit(1500);

        if (!alive) return;

        if (error) {
          console.log("[TV] watchlist load error:", error);
          setWatchlistIds(new Set());
          setWatchlistOrder([]);
          return;
        }

        const order = (data || [])
          .map((r) => String(r?.title_public_id || "").trim())
          .filter(Boolean);

        const ids = new Set(order);

        setWatchlistIds(ids);
        setWatchlistOrder(order);
      } catch (e) {
        if (!alive) return;
        console.log("[TV] watchlist load exception:", e);
        setWatchlistIds(new Set());
        setWatchlistOrder([]);
      }
    }

    loadList(activeProfileId);

    return () => {
      alive = false;
    };
  }, [activeProfileId]);

  const toggleWatchlist = useCallback(
    async (it) => {
      const pid = String(profileCtx?.profile?.id || "").trim();
      const tid = titleIdOf(it);

      if (!pid || !tid) return;

      const isIn = watchlistIds.has(tid);

      if (listBusy) return;
      setListBusy(true);

      try {
        if (!isIn) {
          const { error } = await supabase
            .from("user_watchlist")
            .upsert({ profile_id: pid, title_public_id: tid }, { onConflict: "profile_id,title_public_id" });

          if (error) throw error;

          setWatchlistIds((prev) => {
            const n = new Set(prev);
            n.add(tid);
            return n;
          });
          setWatchlistOrder((prev) => [tid, ...prev.filter((x) => x !== tid)]);
        } else {
          const { error } = await supabase
            .from("user_watchlist")
            .delete()
            .eq("profile_id", pid)
            .eq("title_public_id", tid);

          if (error) throw error;

          setWatchlistIds((prev) => {
            const n = new Set(prev);
            n.delete(tid);
            return n;
          });
          setWatchlistOrder((prev) => prev.filter((x) => x !== tid));
        }
      } catch (e) {
        console.log("[TV] toggle watchlist error:", e);
      } finally {
        setListBusy(false);
      }
    },
    [profileCtx?.profile?.id, watchlistIds, listBusy]
  );

  const allowedCatalog = useMemo(() => {
    if (!catalog?.length) return [];
    const profile = profileCtx?.profile;
    if (!profile) return catalog;

    return catalog.filter((it) => {
      const res = checkTitleAccess({
        profile,
        title: it,
        blockedPublicIds: profileCtx.blockedPublicIds,
      });
      return !!res.ok;
    });
  }, [catalog, profileCtx]);

  const allowedCatalogDedup = useMemo(() => {
    const out = [];
    const seen = new Set();

    for (const it of allowedCatalog || []) {
      const id = titleIdOf(it);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(it);
    }
    return out;
  }, [allowedCatalog]);

  const allowedContinueWatching = useMemo(() => {
    const list = Array.isArray(cw.items) ? cw.items : [];
    const profile = profileCtx?.profile;
    if (!profile) return list;

    return list.filter((it) => {
      const res = checkTitleAccess({
        profile,
        title: it,
        blockedPublicIds: profileCtx.blockedPublicIds,
      });
      return !!res.ok;
    });
  }, [cw.items, profileCtx]);

  const continueWatchingCollapsed = useMemo(
    () => collapseContinueWatching(allowedContinueWatching),
    [allowedContinueWatching]
  );

  function pickSynopsis(it) {
    return String(it?.synopsis || it?.overview || it?.plot || it?.description || it?.desc || "").trim();
  }

  const catalogById = useMemo(() => {
    const m = new Map();
    for (const it of allowedCatalogDedup || []) {
      const id = titleIdOf(it);
      if (id) m.set(id, it);
    }
    return m;
  }, [allowedCatalogDedup]);

  const continueWatchingHydrated = useMemo(() => {
    return (continueWatchingCollapsed || []).map((cwIt) => {
      const id = titleIdOf(cwIt);
      const full = id ? catalogById.get(id) : null;
      if (!full) return cwIt;

      const merged = { ...full, ...cwIt };

      const syn = pickSynopsis(cwIt) || pickSynopsis(full);
      if (syn) merged.synopsis = syn;

      if (!merged.title && full.title) merged.title = full.title;
      if (!merged.id && full.id) merged.id = full.id;

      return merged;
    });
  }, [continueWatchingCollapsed, catalogById]);

  const publishedCatalog = useMemo(() => {
    return (allowedCatalogDedup || []).filter((it) => String(it?.status || "").toLowerCase() === "published");
  }, [allowedCatalogDedup]);

  const watchlistCatalog = useMemo(() => {
    if (!watchlistIds.size) return [];
    const idxMap = new Map();
    watchlistOrder.forEach((id, i) => idxMap.set(id, i));

    const items = publishedCatalog.filter((it) => {
      const id = titleIdOf(it);
      return id && watchlistIds.has(id);
    });

    items.sort((a, b) => {
      const ia = idxMap.get(titleIdOf(a));
      const ib = idxMap.get(titleIdOf(b));
      const ra = Number.isFinite(ia) ? ia : 999999;
      const rb = Number.isFinite(ib) ? ib : 999999;
      return ra - rb;
    });

    return items;
  }, [publishedCatalog, watchlistIds, watchlistOrder]);

  const calendarRows = useMemo(() => {
    if (!allowedCatalogDedup.length) return [];

    const items = allowedCatalogDedup.filter((it) => {
      if (mediaTypeOf(it) !== "movie") return false;
      if (!isInCinema(it)) return false;
      return true;
    });

    if (!items.length) return [];

    const groups = new Map();
    const noDateKey = "nodate";

    for (const it of items) {
      const dt = getCineSuperReleaseDate(it);
      const k = dt ? dateKeyYYYYMMDD(dt) : noDateKey;

      if (!groups.has(k)) groups.set(k, { dt: dt || null, items: [] });
      groups.get(k).items.push(it);
    }

    const entries = Array.from(groups.entries());

    entries.sort(([ka, va], [kb, vb]) => {
      if (ka === noDateKey && kb !== noDateKey) return 1;
      if (kb === noDateKey && ka !== noDateKey) return -1;
      if (va.dt && vb.dt) return va.dt.getTime() - vb.dt.getTime();
      return String(ka).localeCompare(String(kb));
    });

    const out = [];
    for (const [k, g] of entries) {
      const title =
        k === noDateKey ? "Calendário · Em breve no CineSuper" : `Calendário · Chega em ${fmtPtDate(g.dt)}`;
      out.push({ key: `cal:${k}`, title, items: g.items });
    }

    return out;
  }, [allowedCatalogDedup]);

  const baseSectionCatalog = useMemo(() => {
    if (sectionKey === "watchlist") return watchlistCatalog;
    if (sectionKey === "calendar") return [];

    if (sectionKey === "movies") return publishedCatalog.filter((it) => mediaTypeOf(it) === "movie");
    if (sectionKey === "series") return publishedCatalog.filter((it) => mediaTypeOf(it) === "tv");
    return publishedCatalog;
  }, [publishedCatalog, sectionKey, watchlistCatalog]);

  const searchActive = useMemo(
    () => sectionKey === "search" && norm(searchText).length >= 2,
    [sectionKey, searchText]
  );

  const searchedCatalog = useMemo(() => {
    if (!baseSectionCatalog?.length) return [];
    if (!searchActive) return baseSectionCatalog;

    const qn = norm(searchText);
    if (!qn) return baseSectionCatalog;

    return baseSectionCatalog.filter((it) => {
      const hay = [
        it?.title,
        it?.seriesTitle,
        it?.showTitle,
        it?.synopsis,
        Array.isArray(it?.categories) ? it.categories.join(" ") : "",
        Array.isArray(it?.tags) ? it.tags.join(" ") : "",
        Array.isArray(it?.cast) ? it.cast.join(" ") : "",
        it?.director,
        it?.creators ? (Array.isArray(it.creators) ? it.creators.join(" ") : String(it.creators)) : "",
        it?.year,
      ]
        .filter(Boolean)
        .map(norm)
        .join(" ");

      return hay.includes(qn);
    });
  }, [baseSectionCatalog, searchActive, searchText]);

  const heroItem = useMemo(() => {
    if (sectionKey !== "home") return null;
    if (searchActive) return null;
    return searchedCatalog?.[0] || null;
  }, [sectionKey, searchedCatalog, searchActive]);

  const continueTitle = useMemo(() => {
    const n = String(cw.profileName || "").trim();
    return n ? `Continuar assistindo como ${n}` : "Continuar assistindo";
  }, [cw.profileName]);

  const rows = useMemo(() => {
    if (sectionKey === "watchlist") {
      if (!watchlistCatalog.length) return [];
      return [{ key: "watchlist", title: "Minha lista", items: watchlistCatalog }];
    }

    if (sectionKey === "calendar") {
      return calendarRows;
    }

    if (!searchedCatalog?.length) return [];

    if (searchActive) {
      return [{ key: "search", title: `Resultados: ${searchText}`, items: searchedCatalog }];
    }

    const used = new Set();
    const out = [];

    for (const col of COLLECTION_PRIORITY) {
      const items = [];
      for (const it of searchedCatalog) {
        const id = titleIdOf(it);
        if (!id || used.has(id)) continue;
        if (!hasCategory(it, col)) continue;
        used.add(id);
        items.push(it);
      }
      if (items.length) {
        const chunks = chunk(items, TV_CAT_CHUNK_SIZE);
        chunks.forEach((ck, idx) => {
          const title = chunks.length > 1 ? `${col} · ${idx + 1}/${chunks.length}` : col;
          out.push({ key: `col:${norm(col)}:${idx}`, title, items: ck });
        });
      }
    }

    const byGenre = new Map();
    for (const it of searchedCatalog) {
      const id = titleIdOf(it);
      if (!id || used.has(id)) continue;

      const g = String(pickPrimaryGenreFromItem(it) || "").trim() || "Catálogo";
      if (!byGenre.has(g)) byGenre.set(g, []);
      byGenre.get(g).push(it);

      used.add(id);
    }

    const priorityNorm = GENRE_PRIORITY.map(norm);
    const genreEntries = Array.from(byGenre.entries());
    genreEntries.sort(([ga], [gb]) => {
      const ia = priorityNorm.indexOf(norm(ga));
      const ib = priorityNorm.indexOf(norm(gb));
      const pa = ia === -1 ? 999 : ia;
      const pb = ib === -1 ? 999 : ib;
      if (pa !== pb) return pa - pb;
      return String(ga).localeCompare(String(gb));
    });

    for (const [genreName, items] of genreEntries) {
      const chunks = chunk(items, TV_CAT_CHUNK_SIZE);
      chunks.forEach((ck, idx) => {
        const title = chunks.length > 1 ? `${genreName} · ${idx + 1}/${chunks.length}` : genreName;
        out.push({ key: `genre:${norm(genreName)}:${idx}`, title, items: ck });
      });
    }

    if (out.length) return out;
    return [{ key: "all", title: "Catálogo", items: searchedCatalog }];
  }, [searchedCatalog, searchActive, searchText, sectionKey, watchlistCatalog, calendarRows]);

  const visualRows = useMemo(() => {
    const out = [];
    const showContinue = sectionKey === "home" && !searchActive;
    if (showContinue && continueWatchingHydrated.length) {
      out.push({ key: "continue", title: continueTitle, items: continueWatchingHydrated });
    }
    for (const r of rows) out.push(r);
    return out;
  }, [rows, continueTitle, continueWatchingHydrated, searchActive, sectionKey]);

  // ---------------------------
  // Preview timer
  // ---------------------------
  useEffect(() => {
    clearPreviewTimer();

    if (previewOpen) return;
    if (area !== "rows") return;

    const it = visualRows?.[rowIndex]?.items?.[cardIndex] || null;
    if (!it) return;

    previewTimerRef.current = setTimeout(() => {
      const cur = visualRows?.[rowIndex]?.items?.[cardIndex] || null;
      if (!cur) return;

      setPreviewItem(cur);
      setPreviewBtnIndex(0);
      setPreviewOpen(true);
      setArea("preview");

      requestAnimationFrame(() => previewBtnRefs.current?.[0]?.focus?.());
    }, 5000);

    return () => clearPreviewTimer();
  }, [area, rowIndex, cardIndex, visualRows, previewOpen]);

  function openTitle(it) {
    if (!it?.id) return;
    nav(`/t/${it.id}`, { state: { item: it, from: location.pathname, sectionKey } });
  }

  function playHero() {
    if (!heroItem?.id) return;

    if (isSeriesLike(heroItem)) {
      nav(`/t/${heroItem.id}`, { state: { item: heroItem, from: location.pathname, sectionKey } });
      return;
    }

    nav(`/watch/${heroItem.id}`, { state: { item: heroItem, from: location.pathname, sectionKey } });
  }

  function heroInfo() {
    if (!heroItem?.id) return;
    nav(`/t/${heroItem.id}`, { state: { item: heroItem, from: location.pathname, sectionKey } });
  }

  function setSectionByIndex(idx) {
    if (idx === 0) {
      nav("/who", { state: { from: "/browse" } });
      return;
    }

    const item = TV_SIDEBAR_ITEMS[idx - 1];
    const key = item?.key || "home";

    setSectionKey(key);
    setHeroIndex(0);
    setRowIndex(0);
    setCardIndex(0);

    setPreviewOpen(false);
    setPreviewItem(null);
    clearPreviewTimer();

    if (key !== "search") {
      setKbRow(0);
      setKbCol(0);
      setSearchText("");
    } else {
      setSearchText("");
      setKbRow(0);
      setKbCol(0);
    }

    scrollTopHard(pageRef.current);
  }

  useEffect(() => {
    if (loading) return;
    if (introOpen) return;

    const from = String(location.state?.from || "").trim();
    const hasReturn = !!from;

    const focusDefault = () => {
      if (sectionKey === "search") {
        focusKeyboard(0, 0);
        return;
      }

      if (sectionKey === "home" && heroItem) {
        focusHero(0);
        return;
      }

      if (visualRows.length) {
        focusRows(0, 0, { center: true });
        return;
      }

      focusSidebar(2);
    };

    const t = setTimeout(() => {
      if (hasReturn) focusDefault();
      else focusSidebar(2);
    }, 80);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, introOpen, sectionKey, heroItem, visualRows.length, location.state?.from]);

  function applyKeyboardKey(k) {
    const key = String(k || "").toUpperCase();
    if (key === "ESPACO") return setSearchText((p) => (p ? `${p} ` : " "));
    if (key === "APAGAR") return setSearchText((p) => String(p || "").slice(0, -1));
    if (key === "LIMPAR") return setSearchText("");
    if (key === "OK") {
      if (visualRows.length) focusRows(0, 0, { center: true });
      return;
    }
    if (/^[A-Z0-9]$/.test(key)) setSearchText((p) => `${String(p || "")}${key}`);
  }

  const closePreview = useCallback(
    (restoreFocus = true) => {
      setPreviewOpen(false);
      setPreviewItem(null);
      clearPreviewTimer();
      setArea("rows");

      if (!restoreFocus) return;

      requestAnimationFrame(() => {
        const btn = cardRefs.current?.[rowIndex]?.[cardIndex];
        btn?.focus?.();
      });
    },
    [rowIndex, cardIndex]
  );

  const handleBack = useCallback(
    (e) => {
      try {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        e?.stopImmediatePropagation?.();
      } catch {}

      // ✅ INTRO tem prioridade
      if (introOpen) {
        closeIntro(true);
        return;
      }

      if (previewOpen) {
        setPreviewOpen(false);
        setPreviewItem(null);
        clearPreviewTimer();
        setArea("rows");

        requestAnimationFrame(() => {
          const btn = cardRefs.current?.[rowIndex]?.[cardIndex];
          btn?.focus?.();
        });
        return;
      }

      nav("/who", { replace: true, state: { from: "/browse" } });
    },
    [introOpen, previewOpen, nav, rowIndex, cardIndex]
  );

  useEffect(() => {
    function onTvBack(e) {
      handleBack(e);
    }

    window.addEventListener("cs:tv-back", onTvBack);
    return () => window.removeEventListener("cs:tv-back", onTvBack);
  }, [handleBack]);

  useEffect(() => {
    function onKeyDown(e) {
      const code = e.keyCode ?? e.which;

      const isBack =
        BACK_KEYCODES.includes(code) ||
        code === 8 ||
        e.key === "Backspace" ||
        e.key === "Escape" ||
        e.key === "GoBack" ||
        e.key === "BrowserBack";

      if (isBack) {
        handleBack(e);
        return;
      }

      // ✅ INTRO (1 botão): ENTER fecha
// ✅ INTRO tem prioridade absoluta
if (introOpen) {
  // ENTER fecha
  if (hasCode(KEY.ENTER, code)) {
    e.preventDefault();
    closeIntro(true);
    return;
  }

  // bloqueia qualquer navegação/enter no fundo
  e.preventDefault();
  return;
}

      if (
        e.repeat &&
        (hasCode(KEY.LEFT, code) || hasCode(KEY.RIGHT, code) || hasCode(KEY.UP, code) || hasCode(KEY.DOWN, code))
      ) {
        e.preventDefault();
        return;
      }

      if (previewOpen && area === "preview") {
        if (hasCode(KEY.LEFT, code) || hasCode(KEY.RIGHT, code)) {
          e.preventDefault();
          const next = previewBtnIndex === 0 ? 1 : 0;
          setPreviewBtnIndex(next);
          requestAnimationFrame(() => previewBtnRefs.current?.[next]?.focus?.());
          return;
        }

        if (hasCode(KEY.ENTER, code)) {
          e.preventDefault();
          const it = previewItem;
          if (!it) return;

          if (previewBtnIndex === 0) {
            closePreview(false);
            nav(`/watch/${it.id}`);
            return;
          }

          toggleWatchlist(it);
          return;
        }

        if (hasCode(KEY.UP, code) || hasCode(KEY.DOWN, code)) {
          e.preventDefault();
          closePreview(true);
          return;
        }

        e.preventDefault();
        return;
      }

      if (hasCode(KEY.LEFT, code) || hasCode(KEY.UP, code) || hasCode(KEY.RIGHT, code) || hasCode(KEY.DOWN, code)) {
        e.preventDefault();
      }

      if (hasCode(KEY.ENTER, code)) {
        e.preventDefault();

        if (area === "sidebar") {
          if (sidebarIndex === 0) {
            nav("/who", { state: { from: "/browse" } });
            return;
          }

          setSectionByIndex(sidebarIndex);

          if (TV_SIDEBAR_ITEMS[sidebarIndex - 1]?.key === "search") {
            setTimeout(() => focusKeyboard(0, 0), 0);
          }
          return;
        }

        if (area === "hero") return heroIndex === 0 ? playHero() : heroInfo();

        if (area === "keyboard") {
          const k = getKeyAt(kbRow, kbCol);
          return applyKeyboardKey(k);
        }

        if (area === "rows") {
          const it = visualRows?.[rowIndex]?.items?.[cardIndex];
          if (it) openTitle(it);
          return;
        }
      }

      if (area === "sidebar") {
        if (hasCode(KEY.UP, code)) return focusSidebar(sidebarIndex - 1);
        if (hasCode(KEY.DOWN, code)) return focusSidebar(sidebarIndex + 1);

        if (hasCode(KEY.RIGHT, code)) {
          if (sectionKey === "search") return focusKeyboard(0, 0);
          if (heroItem) return focusHero(0);
          if (visualRows.length) return focusRows(0, 0, { center: true });
        }
        return;
      }

      if (area === "hero") {
        if (hasCode(KEY.LEFT, code)) return heroIndex > 0 ? focusHero(heroIndex - 1) : focusSidebar(sidebarIndex);
        if (hasCode(KEY.RIGHT, code)) return heroIndex < 1 ? focusHero(heroIndex + 1) : undefined;
        if (hasCode(KEY.DOWN, code)) return (visualRows.length ? focusRows(0, 0, { center: true }) : undefined);
        return;
      }

      if (area === "keyboard") {
        if (hasCode(KEY.LEFT, code)) return kbCol > 0 ? focusKeyboard(kbRow, kbCol - 1) : focusSidebar(sidebarIndex);
        if (hasCode(KEY.RIGHT, code)) return kbCol < KB_C - 1 ? focusKeyboard(kbRow, kbCol + 1) : undefined;
        if (hasCode(KEY.UP, code)) return kbRow > 0 ? focusKeyboard(kbRow - 1, kbCol) : undefined;
        if (hasCode(KEY.DOWN, code))
          return kbRow < KB_R - 1
            ? focusKeyboard(kbRow + 1, kbCol)
            : visualRows.length
            ? focusRows(0, 0, { center: true })
            : undefined;
        return;
      }

      if (area === "rows") {
        const rowLen = visualRows?.[rowIndex]?.items?.length || 0;

        if (hasCode(KEY.LEFT, code)) {
          if (cardIndex > 0) return focusRows(rowIndex, cardIndex - 1, { center: false });
          return focusSidebar(sidebarIndex);
        }
        if (hasCode(KEY.RIGHT, code)) {
          if (cardIndex < rowLen - 1) return focusRows(rowIndex, cardIndex + 1, { center: false });
          return;
        }

        if (hasCode(KEY.UP, code)) {
          if (rowIndex <= 0) {
            if (sectionKey === "search") return focusKeyboard(KB_R - 1, KB_C - 1);
            if (heroItem) return focusHero(0);
            return focusSidebar(sidebarIndex);
          }
          return focusRows(rowIndex - 1, cardIndex, { center: true });
        }
        if (hasCode(KEY.DOWN, code)) {
          if (rowIndex < visualRows.length - 1) return focusRows(rowIndex + 1, cardIndex, { center: true });
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false, capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [
    introOpen,
    area,
    previewOpen,
    previewItem,
    previewBtnIndex,
    sidebarIndex,
    heroIndex,
    rowIndex,
    cardIndex,
    sectionKey,
    heroItem,
    visualRows,
    nav,
    from,
    kbRow,
    kbCol,
    KB_R,
    KB_C,
    searchText,
    closePreview,
    toggleWatchlist,
    handleBack,
  ]);

  const sidebarExpanded = area === "sidebar";

  const inWatchlistPreview = useMemo(() => {
    if (!previewItem) return false;
    const tid = titleIdOf(previewItem);
    return !!tid && watchlistIds.has(tid);
  }, [previewItem, watchlistIds]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
      <div className="relative h-full w-full">
        <TvSidebar
          expanded={sidebarExpanded}
          activeKey={sectionKey}
          focusIndex={sidebarIndex}
          profile={profileCtx?.profile || null}
          setBtnRef={(i, el) => (sidebarRefs.current[i] = el)}
          onClickItem={(idx) => {
            setSidebarIndex(idx);

            if (idx === 0) {
              nav("/who", { state: { from: "/browse" } });
              return;
            }

            setSectionByIndex(idx);
            focusSidebar(idx);
          }}
        />

        <TvPreviewOverlay
          open={previewOpen}
          item={previewItem}
          focusIndex={area === "preview" ? previewBtnIndex : -1}
          setBtnRef={(i, el) => (previewBtnRefs.current[i] = el)}
          inWatchlist={inWatchlistPreview}
          listBusy={listBusy}
          onPlay={() => {
            if (!previewItem?.id) return;
            closePreview(false);
            nav(`/watch/${previewItem.id}`);
          }}
          onToggleList={() => toggleWatchlist(previewItem)}
          onClose={() => closePreview(true)}
        />

        {/* ✅ INTRO POPUP (QR + 1 botão) */}
        <TvIntroPopup
          open={introOpen}
          whatsappNumber={WHATSAPP_NUMBER}
          focusIndex={area === "intro" ? 0 : -1}
          setBtnRef={(i, el) => (introBtnRefs.current[i] = el)}
          onClose={() => closeIntro(true)}
        />

        <div ref={pageRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden">
          <TvHero
            item={heroItem}
            visible={sectionKey === "home" && !!heroItem}
            focusIndex={area === "hero" ? heroIndex : -1}
            setBtnRef={(i, el) => (heroRefs.current[i] = el)}
            onPlay={playHero}
            onInfo={heroInfo}
          />

          <div className="pointer-events-none absolute top-8 right-14 z-40 text-sm text-white/55">
            {loading ? "Carregando..." : profileLoading ? "Perfil..." : ""}
          </div>

          {err ? (
            <div
              className="mt-6 w-[720px] rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-red-200"
              style={{ marginLeft: `${LEFT_INSET}px` }}
            >
              {err}
            </div>
          ) : null}

          <div
            className="w-full"
            style={{
              paddingLeft: `${LEFT_INSET}px`,
              paddingRight: "0px",
              paddingBottom: "48px",
              paddingTop: sectionKey === "home" ? "0px" : "32px",
            }}
          >
            {sectionKey === "search" ? (
              <TvKeyboard
                query={searchText}
                focused={area === "keyboard"}
                kbRow={kbRow}
                kbCol={kbCol}
                setKeyRef={(r, c, el) => setKbRef(r, c, el)}
                onKeyPress={applyKeyboardKey}
              />
            ) : null}

            <div className={sectionKey === "home" ? "mt-12" : "mt-0"}>
              {visualRows.map((r, i) => (
                <TvRow
                  key={r.key || i}
                  title={r.title}
                  items={r.items}
                  rowRefSetter={(el) => setRowRef(i, el)}
                  scrollerRefSetter={(el) => setRowScrollerRef(i, el)}
                  focusedCardIndex={area === "rows" && rowIndex === i ? cardIndex : -1}
                  setCardRef={(ci, el) => setCardRef(i, ci, el)}
                  onOpenTitle={openTitle}
                  pageEnsureH={area === "rows" && rowIndex === i}
                />
              ))}
              <div className="h-28" />
            </div>
          </div>
        </div>

        <div
          className="pointer-events-none absolute right-10 bottom-10 z-40"
          style={{
            filter:
              "drop-shadow(0 48px 150px rgba(0,0,0,1)) drop-shadow(0 26px 80px rgba(0,0,0,1)) drop-shadow(0 12px 36px rgba(0,0,0,1)) drop-shadow(0 5px 16px rgba(0,0,0,1))",
          }}
        >
          <img src={Logo} alt="CineSuper" draggable={false} className="h-20 w-auto opacity-98" />
        </div>
      </div>
    </div>
  );
}
