// src/pages/Browse.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import TopNav from "../components/layout/TopNav.jsx";
import Footer from "../components/layout/Footer.jsx";
import Container from "../components/layout/Container.jsx";
import Billboard from "../components/browse/Billboard.jsx";
import Row from "../components/browse/Row.jsx";
import Top10Hero from "../components/browse/Top10Hero.jsx";
import { fetchCatalog } from "../lib/catalogApi.js";
import { getAllow4k } from "../lib/playbackPolicy.js";
import { getActiveProfileContext, checkTitleAccess } from "../lib/profilePolicy.js";
import { useContinueWatching } from "../hooks/browse/useContinueWatching.js";
import PageTitle from "../components/PageTitle.jsx";
import { IS_TV } from "../app/target.js";
import { supabase } from "../lib/supabaseClient.js";

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/* =========================
   Continue Watching: colapsar episódios por série
========================= */

function onlyDigits(imdbId) {
  return String(imdbId || "").replace(/^tt/i, "").replace(/\D+/g, "");
}
function pad8(n) {
  return String(n || "").padStart(8, "0");
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
  const bySeries = new Map(); // imdb_id -> representative

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

/* =========================
   Filtros do Browse via URL
========================= */

function getBrowseParams(search) {
  const qs = new URLSearchParams(search || "");
  const searchTerm = String(qs.get("search") || "").trim();

  const typeRaw = String(qs.get("type") || "").trim().toLowerCase(); // movie | series
  const type = typeRaw === "tv" ? "series" : typeRaw;

  const trending = String(qs.get("trending") || "") === "1";
  const list = String(qs.get("list") || "") === "1";

  const cat = String(qs.get("cat") || "").trim();
  const calendar = String(qs.get("calendar") || "") === "1";

  return { searchTerm, type, trending, list, cat, calendar };
}

function titleIdOf(it) {
  return String(it?.public_id || it?.publicId || it?.id || "").trim();
}

function mediaTypeOf(it) {
  return String(it?.media_type || it?.mediaType || "").trim().toLowerCase();
}

function hasCategoryEmAlta(it) {
  const cats = Array.isArray(it?.categories) ? it.categories : [];
  return cats.some((c) => norm(c) === "em alta");
}

function hasCategory(it, cat) {
  const wanted = norm(cat);
  if (!wanted) return true;
  const cats = Array.isArray(it?.categories) ? it.categories : [];
  return cats.some((c) => norm(c) === wanted);
}

/* =========================
   ✅ Calendário (lançamentos)
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

/* =========================
   Home: regras de distribuição por gênero
   - sem duplicar título em múltiplas rows
   - prioriza gêneros (ex.: Suspense > Ação)
========================= */

// Ajuste essa ordem conforme seu gosto (maior prioridade primeiro)
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

// quantidade por linha (se tiver mais, quebra em “Cat · 1/2”, “Cat · 2/2”…)
const HOME_CAT_CHUNK_SIZE = IS_TV ? 14 : 24;
// limite por gênero para manter mistura equilibrada no home
const HOME_GENRE_MIN = IS_TV ? 6 : 12;
const HOME_GENRE_MAX = IS_TV ? 12 : 30;
// limite por gênero dentro das coleções (Novidades, Em alta, etc.)
const HOME_COLLECTION_GENRE_CAP = IS_TV ? 3 : 2;

function cleanCategories(cats) {
  return (Array.isArray(cats) ? cats : [])
    .map((c) => String(c || "").trim())
    .filter(Boolean);
}

function isTypeCategoryName(c) {
  const n = norm(c);
  return n === "filmes" || n === "series" || n === "séries";
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

function getCreatedAtMs(it) {
  const v = it?.created_at ?? it?.createdAt ?? "";
  const dt = new Date(String(v || ""));
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function pickPrimaryGenreFromItem(it) {
  // Se você tiver algum campo primário no Supabase, aproveite:
  // Ex.: it.primary_genre, it.genre, it.main_genre (ajuste se existir)
  const explicit = String(it?.primary_genre || it?.genre || it?.main_genre || "").trim();
  if (explicit) return explicit;

  const cats = cleanCategories(it?.categories);
  if (!cats.length) return "";

  // Remove categorias “técnicas” e coleções
  const filtered = cats.filter((c) => !isTypeCategoryName(c) && !COLLECTION_PRIORITY.some((p) => norm(p) === norm(c)));
  if (!filtered.length) return cats.find((c) => !isTypeCategoryName(c)) || cats[0] || "";

  // Seleciona pelo ranking GENRE_PRIORITY
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

  // Se nada bateu no ranking, usa a primeira categoria “real”
  return best || filtered[0] || cats[0] || "";
}

function getCandidateGenres(it) {
  const explicit = String(it?.primary_genre || it?.genre || it?.main_genre || "").trim();
  if (explicit) return [explicit];

  const cats = cleanCategories(it?.categories);
  if (!cats.length) return [];

  const filtered = cats.filter((c) => !isTypeCategoryName(c) && !COLLECTION_PRIORITY.some((p) => norm(p) === norm(c)));
  return filtered.length ? filtered : cats.filter((c) => !isTypeCategoryName(c));
}

function pickBalancedGenre(it, countsMap) {
  const candidates = getCandidateGenres(it);
  if (!candidates.length) return pickPrimaryGenreFromItem(it) || "Catálogo";

  const priorityNorm = GENRE_PRIORITY.map(norm);

  let best = candidates[0];
  let bestCount = Number.POSITIVE_INFINITY;
  let bestRank = 9999;

  for (const c of candidates) {
    const count = countsMap?.get(c) ?? 0;
    const rank = (() => {
      const idx = priorityNorm.indexOf(norm(c));
      return idx === -1 ? 9999 : idx;
    })();

    if (count < bestCount || (count === bestCount && rank < bestRank)) {
      best = c;
      bestCount = count;
      bestRank = rank;
    }
  }

  return best || "Catálogo";
}

function chunk(items, size) {
  const out = [];
  const n = Math.max(1, Number(size || 1));
  for (let i = 0; i < (items || []).length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export default function Browse() {
  const location = useLocation();

  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [profileCtx, setProfileCtx] = useState({ profile: null, blockedPublicIds: new Set() });
  const [profileLoading, setProfileLoading] = useState(true);

  // Minha lista
  const [watchlistIds, setWatchlistIds] = useState(new Set());
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [watchlistErr, setWatchlistErr] = useState("");

  // Curtidas
  const [likedIds, setLikedIds] = useState(new Set());

  // Top 10
  const [top10Ids, setTop10Ids] = useState([]);

  const cw = useContinueWatching({ limit: 30, days: 5 });

  const params = useMemo(() => getBrowseParams(location.search), [location.search]);
  const searchTerm = params.searchTerm;

  const typeFilter = params.type; // movie | series | ""
  const trendingActive = params.trending;
  const listActive = params.list;
  const calendarActive = params.calendar;

  const catFilter = params.cat;
  const catActive = useMemo(() => norm(catFilter).length > 0, [catFilter]);

  const searchActive = useMemo(() => !calendarActive && norm(searchTerm).length >= 2, [searchTerm, calendarActive]);

  const pageTitle = useMemo(() => {
    if (searchActive) return "Busca";
    if (listActive) return "Minha lista";
    if (trendingActive) return "Bombando";
    if (calendarActive) return "Calendário";
    if (typeFilter === "movie") return "Filmes";
    if (typeFilter === "series") return "Séries";
    if (catActive) return catFilter;
    return "Início";
  }, [searchActive, listActive, trendingActive, calendarActive, typeFilter, catActive, catFilter]);

  const isHomeMode = useMemo(() => {
    return !searchActive && !listActive && !trendingActive && !calendarActive && !typeFilter && !catActive;
  }, [searchActive, listActive, trendingActive, calendarActive, typeFilter, catActive]);

  useEffect(() => {
    if (IS_TV) return;

    if (searchActive) {
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        window.scrollTo(0, 0);
      }
    }
  }, [searchActive, searchTerm]);

  // =========================
  // 1) Catálogo (1x)
  // =========================
  useEffect(() => {
    let alive = true;

    setLoading(true);
    setErr("");

    const allow4k = getAllow4k();

    fetchCatalog({ allow4k, includeDraftCalendar: true })
      .then((data) => {
        if (!alive) return;
        setCatalog(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        console.error("fetchCatalog", e);
        if (!alive) return;
        setErr(e?.message || "Falha ao carregar catálogo do Supabase.");
        setCatalog([]);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  // =========================
  // 2) Perfil ativo — atualização imediata
  // =========================
  const lastProfileIdRef = useRef("");

  const refreshActiveProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const ctx = await getActiveProfileContext();
      const nextId = String(ctx?.profile?.id || "").trim();

      if (nextId !== lastProfileIdRef.current) {
        lastProfileIdRef.current = nextId;
        setProfileCtx({
          profile: ctx.profile || null,
          blockedPublicIds: ctx.blockedPublicIds || new Set(),
        });
      }
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    refreshActiveProfile();

    const onChanged = () => {
      if (!alive) return;
      refreshActiveProfile();
    };

    window.addEventListener("cs:profile-changed", onChanged);
    window.addEventListener("focus", onChanged);

    const onVis = () => {
      if (document.hidden) return;
      onChanged();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      alive = false;
      window.removeEventListener("cs:profile-changed", onChanged);
      window.removeEventListener("focus", onChanged);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refreshActiveProfile]);

  // =========================
  // 3) Watchlist — limpa imediatamente ao trocar profile
  // =========================
  const watchReqRef = useRef(0);

  // Curtidas — limpa imediatamente ao trocar profile
  const likesReqRef = useRef(0);

  useEffect(() => {
    let alive = true;
    const reqId = ++watchReqRef.current;

    async function loadWatchlist(profileId) {
      setWatchlistIds(new Set());
      setWatchlistLoading(true);
      setWatchlistErr("");

      try {
        const { data, error } = await supabase
          .from("user_watchlist")
          .select("title_public_id, created_at")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(1000);

        if (!alive || reqId !== watchReqRef.current) return;

        if (error) {
          setWatchlistIds(new Set());
          setWatchlistErr(error.message || "Falha ao carregar sua lista.");
          return;
        }

        const ids = new Set(
          (data || [])
            .map((r) => String(r?.title_public_id || "").trim())
            .filter(Boolean)
        );

        setWatchlistIds(ids);
      } catch (e) {
        if (!alive || reqId !== watchReqRef.current) return;
        setWatchlistIds(new Set());
        setWatchlistErr(e?.message || "Falha ao carregar sua lista.");
      } finally {
        if (!alive || reqId !== watchReqRef.current) return;
        setWatchlistLoading(false);
      }
    }

    const pid = String(profileCtx?.profile?.id || "").trim();

    if (!pid) {
      setWatchlistIds(new Set());
      setWatchlistErr("");
      setWatchlistLoading(false);
      return () => {
        alive = false;
      };
    }

    loadWatchlist(pid);

    return () => {
      alive = false;
    };
  }, [profileCtx?.profile?.id]);

  // =========================
  // Curtidas — limpa imediatamente ao trocar profile
  // =========================
  useEffect(() => {
    let alive = true;
    const reqId = ++likesReqRef.current;

    async function loadLikes(profileId) {
      setLikedIds(new Set());

      try {
        const { data, error } = await supabase
          .from("user_likes")
          .select("title_public_id, created_at")
          .eq("profile_id", profileId)
          .order("created_at", { ascending: false })
          .limit(1000);

        if (!alive || reqId !== likesReqRef.current) return;

        if (error) {
          setLikedIds(new Set());
          return;
        }

        const ids = new Set(
          (data || [])
            .map((r) => String(r?.title_public_id || "").trim())
            .filter(Boolean)
        );

        setLikedIds(ids);
      } catch (e) {
        if (!alive || reqId !== likesReqRef.current) return;
        setLikedIds(new Set());
      } finally {
        if (!alive || reqId !== likesReqRef.current) return;
      }
    }

    const pid = String(profileCtx?.profile?.id || "").trim();

    if (!pid) {
      setLikedIds(new Set());
      return () => {
        alive = false;
      };
    }

    loadLikes(pid);

    return () => {
      alive = false;
    };
  }, [profileCtx?.profile?.id]);

  // =========================
  // 4) toggleWatchlist
  // =========================
  const toggleWatchlist = useCallback(
    async (titlePublicId, nextAdd) => {
      const pid = String(profileCtx?.profile?.id || "").trim();
      const tid = String(titlePublicId || "").trim();
      if (!pid || !tid) return;

      if (nextAdd) {
        const { error } = await supabase
          .from("user_watchlist")
          .upsert({ profile_id: pid, title_public_id: tid }, { onConflict: "profile_id,title_public_id" });

        if (error) throw error;

        setWatchlistIds((prev) => {
          const n = new Set(prev);
          n.add(tid);
          return n;
        });
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
      }
    },
    [profileCtx?.profile?.id]
  );

  // =========================
  // toggleLike
  // =========================
  const toggleLike = useCallback(
    async (titlePublicId, nextAdd) => {
      const pid = String(profileCtx?.profile?.id || "").trim();
      const tid = String(titlePublicId || "").trim();
      if (!pid || !tid) return;

      if (nextAdd) {
        const { error } = await supabase
          .from("user_likes")
          .upsert({ profile_id: pid, title_public_id: tid }, { onConflict: "profile_id,title_public_id" });

        if (error) throw error;

        setLikedIds((prev) => {
          const n = new Set(prev);
          n.add(tid);
          return n;
        });
      } else {
        const { error } = await supabase
          .from("user_likes")
          .delete()
          .eq("profile_id", pid)
          .eq("title_public_id", tid);

        if (error) throw error;

        setLikedIds((prev) => {
          const n = new Set(prev);
          n.delete(tid);
          return n;
        });
      }
    },
    [profileCtx?.profile?.id]
  );

  // =========================
  // Top 10 (curtidas)
  // =========================
  useEffect(() => {
    if (IS_TV) return;

    let alive = true;

    async function loadTop10() {
      try {
        const { data, error } = await supabase.rpc("get_top10_likes");

        if (!alive) return;

        if (error) {
          setTop10Ids([]);
          return;
        }

        const ids = (data || [])
          .map((r) => String(r?.title_public_id || r?.titlePublicId || "").trim())
          .filter(Boolean);

        setTop10Ids(ids);
      } catch (e) {
        if (!alive) return;
        setTop10Ids([]);
      }
    }

    loadTop10();

    return () => {
      alive = false;
    };
  }, []);

  // =========================
  // Filtra catálogo pelo perfil
  // =========================
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
      const id = String(it?.public_id || it?.publicId || it?.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(it);
    }
    return out;
  }, [allowedCatalog]);

  const publishedCatalog = useMemo(() => {
    return (allowedCatalogDedup || []).filter((it) => String(it?.status || "").toLowerCase() === "published");
  }, [allowedCatalogDedup]);

  const top10Items = useMemo(() => {
    if (!top10Ids?.length || !publishedCatalog?.length) return [];
    const byId = new Map(publishedCatalog.map((it) => [titleIdOf(it), it]));
    return top10Ids.map((id) => byId.get(id)).filter(Boolean);
  }, [top10Ids, publishedCatalog]);

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

  const continueWatchingCollapsed = useMemo(() => {
    return collapseContinueWatching(allowedContinueWatching);
  }, [allowedContinueWatching]);

  const calendarRows = useMemo(() => {
    if (!allowedCatalogDedup.length) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const items = allowedCatalogDedup.filter((it) => {
      if (mediaTypeOf(it) !== "movie") return false;
      if (!isInCinema(it)) return false;
      const dt = getCineSuperReleaseDate(it);
      if (dt && dt.getTime() < todayMs) return false;
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

  // Aplica filtros (type / trending / list / cat) antes da busca textual
  const filteredCatalog = useMemo(() => {
    if (calendarActive) return [];

    let base = Array.isArray(publishedCatalog) ? publishedCatalog : [];

    const gospelActive = catActive && norm(catFilter) === "gospel";
    if (!gospelActive) {
      base = base.filter((it) => !hasCategory(it, "gospel"));
    }

    if (typeFilter) {
      if (typeFilter === "movie") {
        base = base.filter((it) => {
          const mt = mediaTypeOf(it);
          return mt === "movie" || mt === "film";
        });
      } else if (typeFilter === "series") {
        base = base.filter((it) => {
          const mt = mediaTypeOf(it);
          return mt === "tv" || mt === "series";
        });
      }
    }

    if (trendingActive) base = base.filter((it) => hasCategoryEmAlta(it));
    if (catActive) base = base.filter((it) => hasCategory(it, catFilter));

    if (listActive) {
      if (!watchlistIds || watchlistIds.size === 0) return [];
      base = base.filter((it) => watchlistIds.has(titleIdOf(it)));
    }

    return base;
  }, [
    publishedCatalog,
    calendarActive,
    typeFilter,
    trendingActive,
    listActive,
    watchlistIds,
    catActive,
    catFilter,
  ]);

  const searchedCatalog = useMemo(() => {
    if (!filteredCatalog?.length) return [];
    if (!searchActive) return filteredCatalog;

    const qn = norm(searchTerm);
    if (!qn) return filteredCatalog;

    return filteredCatalog.filter((it) => {
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
  }, [filteredCatalog, searchActive, searchTerm]);

  const hero = useMemo(() => {
    if (!isHomeMode) return null;
    return searchedCatalog?.[0] || null;
  }, [searchedCatalog, isHomeMode]);

  const rows = useMemo(() => {
    if (calendarActive) {
      return calendarRows;
    }

    if (!searchedCatalog?.length) return [];

    if (searchActive) {
      return [
        { key: `search:${norm(searchTerm)}`, title: `Resultados para “${searchTerm}”`, items: searchedCatalog },
      ];
    }

    if (trendingActive) return [{ key: "trending", title: "Em alta", items: searchedCatalog }];

    if (listActive) {
      return [{ key: `mylist:${profileCtx?.profile?.id || "anon"}`, title: "Minha lista", items: searchedCatalog }];
    }

    if (catActive) {
      const CHUNK_SIZE = 7;
      const chunks = [];
      for (let i = 0; i < searchedCatalog.length; i += CHUNK_SIZE) {
        chunks.push(searchedCatalog.slice(i, i + CHUNK_SIZE));
      }
      const total = chunks.length;

      return chunks.map((items, idx) => ({
        key: `cat:${norm(catFilter)}:${idx}`,
        title: total > 1 ? `${catFilter} · ${idx + 1}/${total}` : catFilter,
        items,
      }));
    }

    // =========================
    // HOME MODE: distribuição sem duplicar + prioridade de gênero
    // =========================
    const byGenre = new Map(); // genreName -> items[]
    const used = new Set(); // title ids já alocados numa row

    // (opcional) Se você quiser manter “coleções” no topo sem duplicar:
    // tira itens dessas coleções primeiro, e o restante vai pros gêneros.
    const collectionRows = [];

    for (const col of COLLECTION_PRIORITY) {
      const byGenre = new Map();
      const genreCounts = new Map();

      for (const it of searchedCatalog) {
        const id = titleIdOf(it);
        if (!id || used.has(id)) continue;
        if (!hasCategory(it, col)) continue;

        const genre = pickBalancedGenre(it, genreCounts);
        const g = String(genre || "").trim() || "Catálogo";

        if (!byGenre.has(g)) byGenre.set(g, []);
        byGenre.get(g).push(it);
        genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
      }

      const picked = [];

      for (const [, items] of byGenre.entries()) {
        items.sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
        picked.push(...items.slice(0, HOME_COLLECTION_GENRE_CAP));
      }

      if (picked.length) {
        picked.sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
        for (const it of picked) {
          const id = titleIdOf(it);
          if (id) used.add(id);
        }
      }

      if (picked.length) {
        const chunks = chunk(picked, HOME_CAT_CHUNK_SIZE);
        chunks.forEach((ck, idx) => {
          const title = chunks.length > 1 ? `${col} · ${idx + 1}/${chunks.length}` : col;
          collectionRows.push({ key: `home:col:${norm(col)}:${idx}`, title, items: ck });
        });
      }
    }

    // Agora, aloca o restante para UM gênero primário por título
    const homeGenreCounts = new Map();

    for (const it of searchedCatalog) {
      const id = titleIdOf(it);
      if (!id || used.has(id)) continue;

      const genre = pickBalancedGenre(it, homeGenreCounts);
      const g = String(genre || "").trim() || "Catálogo";

      if (!byGenre.has(g)) byGenre.set(g, []);
      byGenre.get(g).push(it);

      used.add(id);
      homeGenreCounts.set(g, (homeGenreCounts.get(g) || 0) + 1);
    }

    // Ordena gêneros em ordem alfabética (depois das coleções)
    const genreEntries = Array.from(byGenre.entries());
    genreEntries.sort(([ga], [gb]) => {
      const na = norm(ga);
      const nb = norm(gb);
      if (na !== nb) return na.localeCompare(nb, "pt-BR");
      return String(ga).localeCompare(String(gb), "pt-BR");
    });

    const genreTotal = genreEntries.reduce((sum, [, items]) => sum + items.length, 0);
    const genreCount = genreEntries.length;
    const avgPerGenre = genreCount ? Math.ceil(genreTotal / genreCount) : 0;
    const genreCap =
      genreCount <= 1 ? Number.POSITIVE_INFINITY : Math.max(HOME_GENRE_MIN, Math.min(avgPerGenre, HOME_GENRE_MAX));

    const genreRows = [];
    for (const [genreName, items] of genreEntries) {
      const sorted = [...items].sort((a, b) => getCreatedAtMs(b) - getCreatedAtMs(a));
      const limited = genreCap === Number.POSITIVE_INFINITY ? sorted : sorted.slice(0, genreCap);
      if (!limited.length) continue;
      const chunks = chunk(limited, HOME_CAT_CHUNK_SIZE);
      chunks.forEach((ck, idx) => {
        const title = chunks.length > 1 ? `${genreName} · ${idx + 1}/${chunks.length}` : genreName;
        genreRows.push({ key: `home:genre:${norm(genreName)}:${idx}`, title, items: ck });
      });
    }

    const combined = [...collectionRows, ...genreRows];
    if (combined.length) return combined;

    const fallbackTitle = typeFilter === "movie" ? "Filmes" : typeFilter === "series" ? "Séries" : "Catálogo";
    return [{ key: "all", title: fallbackTitle, items: searchedCatalog }];
  }, [
    searchedCatalog,
    searchActive,
    searchTerm,
    trendingActive,
    listActive,
    typeFilter,
    profileCtx?.profile?.id,
    catActive,
    catFilter,
    calendarActive,
    calendarRows,
  ]);

  const continueTitle = useMemo(() => {
    const n = String(cw.profileName || "").trim();
    return n ? `Continuar assistindo como ${n}` : "Continuar assistindo";
  }, [cw.profileName]);

  const showChrome = !IS_TV;

  return (
    <div
      className={showChrome ? "min-h-full" : "h-screen overflow-y-auto overflow-x-hidden"}
      style={IS_TV ? { scrollBehavior: "smooth" } : undefined}
    >
      <PageTitle title={pageTitle} />
      {showChrome ? <TopNav /> : null}

      <main className={showChrome ? "pt-16" : "pt-6"}>
        {isHomeMode ? <Billboard item={hero} /> : null}

        <div className="pb-12">
          <Container>
            {searchActive ? (
              <div className={IS_TV ? "mt-6" : "mt-10 sm:mt-16"}>
                <div className="text-white/80 text-sm">
                  Resultados para <span className="text-white font-semibold">“{searchTerm}”</span>
                </div>
              </div>
            ) : null}

            {listActive ? (
              <div className={IS_TV ? "mt-6" : "mt-10 sm:mt-12"}>
                {watchlistLoading ? (
                  <div className="text-white/70 text-sm">Carregando sua lista...</div>
                ) : watchlistErr ? (
                  <div className="rounded border border-yellow-500/25 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
                    {watchlistErr}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={IS_TV ? "space-y-10 mt-8" : "space-y-8 mt-10 sm:mt-16 lg:mt-20"}>
              {err ? (
                <div className="rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {err}
                </div>
              ) : null}

              {!loading && searchActive && searchedCatalog.length === 0 && !err ? (
                <div className="text-white/70 text-sm">
                  Nenhum resultado para <span className="text-white font-semibold">“{searchTerm}”</span>.
                </div>
              ) : null}

              {!loading && calendarActive && calendarRows.length === 0 && !err ? (
                <div className="text-white/60 text-sm">Nenhum lançamento futuro no calendário.</div>
              ) : null}

              {!loading && !searchActive && !calendarActive && !searchedCatalog.length && !err ? (
                <div className="text-white/60 text-sm">
                  {profileLoading
                    ? "Carregando perfil..."
                    : listActive
                      ? "Sua lista está vazia (adicione títulos no +)."
                      : "Nenhum título disponível para este perfil (restrições aplicadas)."}
                </div>
              ) : null}

              {isHomeMode && continueWatchingCollapsed.length ? (
                <Row
                  key={`continue:${profileCtx?.profile?.id || "anon"}`}
                  title={continueTitle}
                  items={continueWatchingCollapsed}
                  tvRowKey={`continue:${profileCtx?.profile?.id || "anon"}`}
                  tvAutoFocus
                  profileId={profileCtx?.profile?.id}
                  watchlistIds={watchlistIds}
                  onToggleWatchlist={toggleWatchlist}
                  likedIds={likedIds}
                  onToggleLike={toggleLike}
                />
              ) : null}

              {isHomeMode && !IS_TV && top10Items.length ? (
                <Top10Hero items={top10Items} />
              ) : null}

              {rows.map((r) => (
                <Row
                  key={r.key}
                  title={r.title}
                  items={r.items}
                  tvRowKey={r.key}
                  profileId={profileCtx?.profile?.id}
                  watchlistIds={watchlistIds}
                  onToggleWatchlist={toggleWatchlist}
                  likedIds={likedIds}
                  onToggleLike={toggleLike}
                />
              ))}
            </div>
          </Container>
        </div>
      </main>

      {showChrome ? <Footer /> : null}
    </div>
  );
}
