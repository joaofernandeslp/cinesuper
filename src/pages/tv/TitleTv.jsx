// src/pages/tv/TitleTv.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient.js";

import { fetchTitleById, fetchCatalog } from "../../lib/catalogApi.js";
import { KEY, BACK_KEYCODES, hasCode, cx } from "./_tvKeys.js";

import { Play, Sparkles, Plus, Check, ChevronDown, ChevronUp, ListVideo, X } from "lucide-react";

/* =========================
   Consts / Regex
========================= */
const TMDB_KEY = (import.meta?.env?.VITE_TMDB_KEY || "").trim();
const OMDB_KEY = (import.meta?.env?.VITE_IMDB_KEY || "").trim();

const TMDB_BACKDROP_SIZE = "w1280";
const TMDB_BACKDROP_BASE = `https://image.tmdb.org/t/p/${TMDB_BACKDROP_SIZE}`;
const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/w500";

const HERO_MAX_SLIDES = 5;
const HERO_PRELOAD_FIRST = 2;
const HERO_ROTATE_MS = 6500;
const HERO_FADE_MS = 900;

const SR_RE = /^sr-\d{8}$/i;

// ✅ SIMILARES (Netflix-like) — painel na direita + lista (máx 10) + header fixo
const SIM_MAX = 10;

/* ===== Episodes drawer thumbs ===== */
const EP_SERIES_THUMB_FILE = "thumb_00080.jpg"; // fallback fixo por pasta

const EP_SERIES_THUMB_CANDIDATES = [
  "thumb_00080.jpg",
  "thumb_00040.jpg",
  "thumb_00020.jpg",
  "thumb_00010.jpg",
  "thumb_00001.jpg",
  "thumb_00000.jpg",
];

function ensureSlashEnd(p) {
  const s = String(p || "").trim();
  if (!s) return "";
  return s.endsWith("/") ? s : s + "/";
}

function stripLeadingSlash(k) {
  const s = String(k || "").trim();
  if (!s) return "";
  return s.startsWith("/") ? s.slice(1) : s;
}

function isHttpUrl(v) {
  return /^https?:\/\//i.test(String(v || "").trim());
}

function looksLikeR2Key(v) {
  const s = String(v || "").trim();
  if (!s) return false;
  if (isHttpUrl(s)) return false;
  if (s.startsWith("data:")) return false;
  return s.includes("/") && !/\s/.test(s);
}

function normalizeMaybeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (isHttpUrl(s)) return s;

  if (looksLikeR2Key(s)) return "";

  try {
    return new URL(s, window.location.origin).toString();
  } catch {
    return "";
  }
}

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function hasCinemaTag(list) {
  const wanted = new Set(["cinema", "em cinema", "nos cinemas", "no cinema"]);
  return (list || []).some((c) => wanted.has(normText(c)));
}

/* =========================
   Helpers
========================= */
function pickThumb(it) {
  return String(
    it?.thumb_url ||
      it?.thumbUrl ||
      it?.thumb ||
      it?.poster_url ||
      it?.posterUrl ||
      it?.hero_image_url ||
      it?.bannerImage ||
      ""
  ).trim();
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function fmtDurationFromMinutes(min) {
  const m = Math.max(0, Math.floor(Number(min || 0)));
  if (!m) return "";
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (hh <= 0) return `${mm}m`;
  if (mm <= 0) return `${hh}h`;
  return `${hh}h ${mm}m`;
}

function fmtDurationFromSeconds(sec) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  if (!s) return "";
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  if (hh <= 0) return `${mm}m`;
  if (mm <= 0) return `${hh}h`;
  return `${hh}h ${mm}m`;
}

function pickDurationLabel(it) {
  const direct =
    it?.duration ||
    it?.runtime ||
    it?.runtimeLabel ||
    it?.durationLabel ||
    it?.duration_label ||
    it?.runtime_label ||
    "";
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const sec =
    it?.durationSec ??
    it?.duration_sec ??
    it?.runtimeSec ??
    it?.runtime_sec ??
    it?.duration_seconds ??
    it?.runtime_seconds ??
    0;
  if (Number.isFinite(Number(sec)) && Number(sec) > 0) return fmtDurationFromSeconds(sec);

  const min = it?.durationMin ?? it?.duration_min ?? it?.runtimeMin ?? it?.runtime_min ?? 0;
  if (Number.isFinite(Number(min)) && Number(min) > 0) return fmtDurationFromMinutes(min);

  return "";
}

function pad2(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "01";
  return String(Math.floor(x)).padStart(2, "0");
}

function parseSeasonEpisodeFromPrefix(prefix) {
  const p = String(prefix || "");
  const mSeason =
    p.match(/\/temporada\s*(\d+)/i) ||
    p.match(/\/season\s*(\d+)/i) ||
    p.match(/\/m[oó]dulo\s*(\d+)/i) ||
    p.match(/\/module\s*(\d+)/i);
  const mEp = p.match(/\/epis[oó]dio\s*(\d+)/i) || p.match(/\/episode\s*(\d+)/i);

  const season = mSeason ? Number(mSeason[1]) : 1;
  const episode = mEp ? Number(mEp[1]) : 1;

  return {
    season: Number.isFinite(season) && season > 0 ? season : 1,
    episode: Number.isFinite(episode) && episode > 0 ? episode : 1,
  };
}

function extractSeriesBaseFromPrefix(prefix) {
  const p = String(prefix || "").replace(/\\/g, "/");
  if (!p) return "";
  const m = p.match(/^(.*)\/(?:temporada|season|m[oó]dulo|module)\s*\d+/i);
  if (m && m[1]) return String(m[1] || "").replace(/\/+$/, "");
  return p.replace(/\/+$/, "");
}

function normalizePrefix(p) {
  let s = String(p || "").trim();
  if (!s) return "";
  s = s.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!s.endsWith("/")) s += "/";
  return s;
}

function maturityBadge(m) {
  const raw = String(m ?? "").trim().toUpperCase();
  const v = raw.replace("+", "");

  if (v === "L" || v === "LIVRE" || v === "0") return { label: "L", hint: "Livre" };

  const n = Number(v);
  if (Number.isFinite(n)) {
    if (n <= 10) return { label: "A10", hint: "Não recomendado para menores de 10" };
    if (n === 12) return { label: "A12", hint: "Não recomendado para menores de 12" };
    if (n === 14) return { label: "A14", hint: "Não recomendado para menores de 14" };
    if (n === 16) return { label: "A16", hint: "Não recomendado para menores de 16" };
    if (n >= 18) return { label: "A18", hint: "Não recomendado para menores de 18" };
  }

  return { label: raw || "-", hint: "Classificação indicativa" };
}

function readLocalString(key) {
  try {
    return String(localStorage.getItem(key) ?? "").trim();
  } catch {
    return "";
  }
}

function getUserMaxQuality() {
  const direct = readLocalString("cs_max_quality").toLowerCase();
  if (direct) return direct;

  const entJson =
    readLocalString("cs_entitlement") ||
    readLocalString("cs_ent") ||
    readLocalString("cs_user_entitlement");

  if (entJson) {
    try {
      const ent = JSON.parse(entJson);
      const mq = String(ent?.max_quality || ent?.maxQuality || "").trim().toLowerCase();
      if (mq) return mq;
    } catch {}
  }

  const plan = readLocalString("cs_plan").toLowerCase();
  if (plan === "diamante") return "4k";
  return "1080p";
}

function titleHas4k(item) {
  if (!item) return false;

  if (item?.has4k === true) return true;
  if (item?.has4k === false) return false;

  const qRaw =
    item?.quality_label ||
    item?.qualityLabel ||
    item?.quality ||
    item?.max_quality ||
    item?.maxQuality ||
    item?.available_quality ||
    item?.availableQuality ||
    "";

  const q = String(qRaw || "").trim().toLowerCase();
  if (q.includes("4k") || q.includes("uhd")) return true;
  if (q.includes("1080") || q.includes("full")) return false;

  const full = String(item?.hlsMasterUrl4k || item?.hlsMasterUrl || "").trim();
  const hd = String(item?.hlsMasterUrlHd || item?.hlsMasterHdUrl || "").trim();
  if (!full) return false;
  if (full && hd && full !== hd) return true;
  if (full.toLowerCase().includes("master-hd")) return false;
  return true;
}

function storageKeyActiveProfile(uid) {
  return `cs_active_profile:${uid || "anon"}`;
}

async function getAuthUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || "";
}

function getActiveProfileIdFromStorage(uid) {
  if (!uid) return "";
  try {
    return String(localStorage.getItem(storageKeyActiveProfile(uid)) || "").trim();
  } catch {
    return "";
  }
}

/* ===== trailer helpers (somente para QR) ===== */
function cleanYtId(x) {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.split("?")[0].split("&")[0].split("#")[0].trim();
}

function extractYouTubeId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (raw.toLowerCase().startsWith("yt:")) return cleanYtId(raw.slice(3).trim());

  try {
    const u = new URL(raw);
    if (u.hostname.includes("youtu.be")) {
      const parts = (u.pathname || "").split("/").filter(Boolean);
      return cleanYtId(parts[0] || "");
    }
    const v = u.searchParams.get("v");
    if (v) return cleanYtId(v);

    const parts = (u.pathname || "").split("/").filter(Boolean);
    const embedIdx = parts.indexOf("embed");
    if (embedIdx >= 0 && parts[embedIdx + 1]) return cleanYtId(parts[embedIdx + 1]);
    const shortsIdx = parts.indexOf("shorts");
    if (shortsIdx >= 0 && parts[shortsIdx + 1]) return cleanYtId(parts[shortsIdx + 1]);
    const liveIdx = parts.indexOf("live");
    if (liveIdx >= 0 && parts[liveIdx + 1]) return cleanYtId(parts[liveIdx + 1]);
    return "";
  } catch {
    const id = cleanYtId(raw);
    return id.length >= 8 ? id : "";
  }
}

/* =========================
   TMDB pack (usa IMDB como base via resolveTmdbId)
========================= */
function uniq(arr) {
  const out = [];
  for (const x of arr || []) if (x && !out.includes(x)) out.push(x);
  return out;
}

function preload(url) {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  } catch {}
}

async function tmdbFetchJson(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`TMDB HTTP ${r.status}`);
  return r.json();
}

async function omdbFetchJson(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`OMDb HTTP ${r.status}`);
  return r.json();
}

function getImdbIdFromItem(item) {
  const raw = item?.imdb_id || item?.imdbId || item?.imdb || item?.imdbID || "";
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.startsWith("tt") ? s : `tt${s.replace(/\D+/g, "")}`;
}

function guessTitle(item) {
  return String(item?.title || item?.name || "").trim();
}

function guessYear(item) {
  const y = item?.year || item?.release_year || item?.releaseYear || "";
  const n = Number(String(y || "").trim());
  return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : null;
}

async function resolveImdbIdViaOmdb(item, signal) {
  if (!OMDB_KEY) return "";
  const title = guessTitle(item);
  if (!title) return "";
  const year = guessYear(item);

  const cacheKey = `cs_tvtitle_omdb_imdb:${title.toLowerCase()}:${year || ""}`;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw != null) return String(raw || "");
  } catch {}

  const url =
    `https://www.omdbapi.com/?apikey=${encodeURIComponent(OMDB_KEY)}&t=${encodeURIComponent(title)}` +
    (year ? `&y=${encodeURIComponent(String(year))}` : "");

  const j = await omdbFetchJson(url, signal);
  const imdb = String(j?.imdbID || "").trim();
  const out = imdb && imdb.startsWith("tt") ? imdb : "";

  try {
    sessionStorage.setItem(cacheKey, out || "");
  } catch {}
  return out;
}

async function resolveTmdbId(item, signal) {
  const tmdbId = item?.tmdb_id || item?.tmdbId || item?.tmdb || null;
  const tmdbType = String(item?.tmdb_type || item?.tmdbType || item?.media_type || "")
    .trim()
    .toLowerCase();

  if (tmdbId && (tmdbType === "movie" || tmdbType === "tv")) {
    return { id: Number(tmdbId), type: tmdbType };
  }

  let imdb = getImdbIdFromItem(item);
  if (!imdb) imdb = await resolveImdbIdViaOmdb(item, signal);

  if (imdb && TMDB_KEY) {
    const url = `https://api.themoviedb.org/3/find/${encodeURIComponent(
      imdb
    )}?api_key=${encodeURIComponent(TMDB_KEY)}&external_source=imdb_id`;

    const j = await tmdbFetchJson(url, signal);
    const mv = Array.isArray(j?.movie_results) ? j.movie_results : [];
    const tv = Array.isArray(j?.tv_results) ? j.tv_results : [];
    if (mv[0]?.id) return { id: Number(mv[0].id), type: "movie" };
    if (tv[0]?.id) return { id: Number(tv[0].id), type: "tv" };
  }

  const title = guessTitle(item);
  if (title && TMDB_KEY) {
    const year = guessYear(item);
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(
      TMDB_KEY
    )}&language=pt-BR&query=${encodeURIComponent(title)}&include_adult=false`;

    const j = await tmdbFetchJson(url, signal);
    const results = Array.isArray(j?.results) ? j.results : [];

    const scored = results
      .map((r) => {
        const type = r?.media_type;
        if (type !== "movie" && type !== "tv") return null;
        if (!r?.id) return null;

        const ry =
          type === "movie"
            ? String(r?.release_date || "").slice(0, 4)
            : String(r?.first_air_date || "").slice(0, 4);

        const yearMatch = year ? Number(ry) === year : true;
        return { id: Number(r.id), type, score: (yearMatch ? 100 : 0) + Number(r?.popularity || 0) };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    if (scored[0]) return { id: scored[0].id, type: scored[0].type };
  }

  return null;
}

function pickBestLogo(logos) {
  const arr = Array.isArray(logos) ? logos : [];
  if (!arr.length) return "";

  const langScore = (iso) => {
    if (iso === "pt") return 3;
    if (iso === "en") return 2;
    if (!iso) return 1;
    return 0;
  };

  const sorted = arr
    .map((l) => ({
      path: l?.file_path || "",
      iso: l?.iso_639_1 || "",
      w: Number(l?.width || 0),
      h: Number(l?.height || 0),
    }))
    .filter((x) => x.path)
    .sort((a, b) => {
      const sa = langScore(a.iso);
      const sb = langScore(b.iso);
      if (sb !== sa) return sb - sa;
      if (b.w !== a.w) return b.w - a.w;
      return b.h - a.h;
    });

  const best = sorted[0];
  return best?.path ? `${TMDB_LOGO_BASE}${best.path}` : "";
}

function pickTopBackdrops(backdrops, n = 10) {
  const arr = Array.isArray(backdrops) ? backdrops : [];
  if (!arr.length) return [];

  const all = arr
    .map((b) => ({
      path: b?.file_path || "",
      w: Number(b?.width || 0),
      aspect: Number(b?.aspect_ratio || 0),
      vote: Number(b?.vote_average || 0),
      votes: Number(b?.vote_count || 0),
    }))
    .filter((x) => x.path);

  const a169 = all.filter((x) => x.aspect >= 1.55 && x.aspect <= 2.05);
  const base = a169.length ? a169 : all;

  base.sort((a, b) => {
    if (b.vote !== a.vote) return b.vote - a.vote;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return b.w - a.w;
  });

  return uniq(base.slice(0, n).map((x) => `${TMDB_BACKDROP_BASE}${x.path}`));
}

function pickTopPosters(posters, n = 10) {
  const arr = Array.isArray(posters) ? posters : [];
  if (!arr.length) return [];

  const all = arr
    .map((p) => ({
      path: p?.file_path || "",
      w: Number(p?.width || 0),
      vote: Number(p?.vote_average || 0),
      votes: Number(p?.vote_count || 0),
    }))
    .filter((x) => x.path)
    .sort((a, b) => {
      if (b.vote !== a.vote) return b.vote - a.vote;
      if (b.votes !== a.votes) return b.votes - a.votes;
      return b.w - a.w;
    });

  return uniq(all.slice(0, n).map((x) => `${TMDB_BACKDROP_BASE}${x.path}`));
}

async function fetchTmdbPack(item, signal) {
  if (!TMDB_KEY) return null;

  const resolved = await resolveTmdbId(item, signal);
  if (!resolved?.id || !resolved?.type) return null;

  const cacheKey = `cs_tvtitle_pack_v2:${resolved.type}:${resolved.id}:${TMDB_BACKDROP_SIZE}`;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const j = JSON.parse(raw);
      if (Array.isArray(j?.slides) && j.slides.length) return j;
    }
  } catch {}

  const detailsUrl = `https://api.themoviedb.org/3/${resolved.type}/${resolved.id}?api_key=${encodeURIComponent(
    TMDB_KEY
  )}&language=pt-BR`;
  const details = await tmdbFetchJson(detailsUrl, signal);
  const detailsBackdrop = details?.backdrop_path ? `${TMDB_BACKDROP_BASE}${details.backdrop_path}` : "";

  const imagesUrl = `https://api.themoviedb.org/3/${resolved.type}/${resolved.id}/images?api_key=${encodeURIComponent(
    TMDB_KEY
  )}&include_image_language=pt,en,null`;
  const images = await tmdbFetchJson(imagesUrl, signal);

  const backdrops = pickTopBackdrops(images?.backdrops, 10);
  const posters = pickTopPosters(images?.posters, 10);
  const logo = pickBestLogo(images?.logos);

  const slides = uniq([detailsBackdrop, ...backdrops, ...posters]).filter(Boolean).slice(0, HERO_MAX_SLIDES);
  const out = { slides, logo: logo || "" };

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(out));
  } catch {}

  return out;
}

/* =========================
   UI helpers
========================= */
function ActionButton({ refCb, focused, variant = "dark", icon: Icon, label, right, disabled, onClick }) {
  const base = variant === "primary" ? "bg-white text-black" : "bg-white/20 text-white";

  return (
    <button
      ref={refCb}
      tabIndex={focused ? 0 : -1}
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={cx(
        "outline-none select-none w-full",
        "rounded-2xl px-7 py-4 text-[18px] font-bold",
        "flex items-center justify-between gap-4",
        base,
        disabled ? "opacity-40 cursor-not-allowed" : "",
        focused && !disabled ? "ring-4 ring-white/90 scale-[1.01]" : ""
      )}
    >
      <span className="flex items-center gap-4">
        {Icon ? <Icon className="h-6 w-6" /> : null}
        {label}
      </span>
      {right ? <span className="opacity-90">{right}</span> : null}
    </button>
  );
}

/* =========================
   Page
========================= */
export default function TitleTv() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();

  const userMaxQuality = useMemo(() => getUserMaxQuality(), []);
  const userCan4k = useMemo(() => userMaxQuality === "4k" || userMaxQuality === "uhd", [userMaxQuality]);

  const allow4k = useMemo(() => {
    if (userCan4k) return true;

    const raw = readLocalString("cs_allow4k").toLowerCase();
    if (raw === "true") return true;
    if (raw === "false") return false;

    const plan = readLocalString("cs_plan").toLowerCase();
    return plan === "prata" || plan === "ouro" || plan === "diamante";
  }, [userCan4k]);

  const [item, setItem] = useState(loc?.state?.item || null);
  const [loading, setLoading] = useState(true);

  // episódios / resume
  const [episodes, setEpisodes] = useState([]);
  const [activeSeason, setActiveSeason] = useState(1);

  const [resumeSec, setResumeSec] = useState(0);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [seriesResumePublicId, setSeriesResumePublicId] = useState("");

  // watchlist (Supabase)
  const [activeProfileId, setActiveProfileId] = useState("");
  const [inWatchlist, setInWatchlist] = useState(false);
  const [listBusy, setListBusy] = useState(false);

  // TMDB pack (título principal)
  const [pack, setPack] = useState({ slides: [], logo: "" });

  // navegação para player (debug visual)
  const [navPending, setNavPending] = useState(false);
  const [navTarget, setNavTarget] = useState("");
  const [navTick, setNavTick] = useState(0);
  useEffect(() => {
    if (!navPending) return;
    const t = setInterval(() => setNavTick((n) => (n + 1) % 100000), 1000);
    return () => clearInterval(t);
  }, [navPending]);

  // crossfade A/B
  const [layerA, setLayerA] = useState("");
  const [layerB, setLayerB] = useState("");
  const [activeLayer, setActiveLayer] = useState("A");
  const activeRef = useRef("A");
  const pendingRef = useRef(null);
  const idxRef = useRef(0);
  const timerRef = useRef(null);

  // foco (botões)
  const [focusIndex, setFocusIndex] = useState(0);
  const btnRefs = useRef([]);

  // foco: Ler mais
  const readMoreRef = useRef(null);
  const [focusZone, setFocusZone] = useState("actions"); // "readmore" | "actions"

  // drawers
  const [epsOpen, setEpsOpen] = useState(false);

  // ✅ SIMILARES (Netflix-like)
  const [similarOpen, setSimilarOpen] = useState(false);
  const [similarItems, setSimilarItems] = useState([]);
  const [similarZone, setSimilarZone] = useState("list"); // "close" | "list"
  const [similarIndex, setSimilarIndex] = useState(0);
  const similarRefs = useRef([]);
  const similarPrevRef = useRef({ zone: "actions", index: 0 });
  const closeModalRef = useRef(null);

  // ✅ Visual cache (banner + logo) para cada similar
  const [similarVisualMap, setSimilarVisualMap] = useState({}); // { [id]: { img, logo } }
  const similarVisualRef = useRef({});
  useEffect(() => {
    similarVisualRef.current = similarVisualMap;
  }, [similarVisualMap]);

  const isSeriesParam = useMemo(() => SR_RE.test(String(id || "").trim()), [id]);
  const isSeriesCard = useMemo(() => isSeriesParam || !!item?.seriesCard || item?.is_series === true, [isSeriesParam, item]);

  const viewItem = useMemo(() => item, [item]);
  const titleName = useMemo(() => String(viewItem?.title || "").trim() || "Título", [viewItem]);

  const mediaType = useMemo(
    () => String(viewItem?.media_type || viewItem?.mediaType || "").trim().toLowerCase(),
    [viewItem]
  );
  const isCourse = useMemo(() => mediaType === "course" || mediaType === "curso", [mediaType]);
  const isTv = useMemo(() => mediaType === "tv" || isCourse, [mediaType, isCourse]);
  const seasonLabel = isCourse ? "Módulo" : "Temporada";
  const seasonLabelPlural = isCourse ? "Módulos" : "Temporadas";
  const seasonLabelUpper = isCourse ? "MÓDULOS" : "TEMPORADAS";
  const seasonPrefix = isCourse ? "M" : "T";

  // carregar item
  useEffect(() => {
    let alive = true;
    setLoading(true);

    fetchTitleById(id, { allow4k })
      .then((data) => {
        if (!alive) return;
        setItem(data || loc?.state?.item || null);
      })
      .catch(() => {
        if (!alive) return;
        setItem(loc?.state?.item || null);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, allow4k]);

  // activeProfileId
  useEffect(() => {
    let alive = true;

    async function run() {
      const uid0 = await getAuthUserId();
      const pid0 = getActiveProfileIdFromStorage(uid0);
      if (!alive) return;
      setActiveProfileId(pid0 || "");
    }

    run();
    return () => {
      alive = false;
    };
  }, [id]);

  // episódios
  useEffect(() => {
    let alive = true;

    async function loadEpisodes() {
      try {
        const mt = mediaType === "curso" ? "course" : mediaType;
        const imdbId = String(viewItem?.imdb_id || viewItem?.imdbId || "").trim().toLowerCase();
        const seriesUuid = String(
          viewItem?.series_id || viewItem?.seriesId || (viewItem?.is_series ? viewItem?.dbId : "") || ""
        ).trim();
        const basePrefixRaw = String(
          viewItem?.r2_prefix_base || viewItem?.r2PrefixBase || viewItem?.r2_prefix || viewItem?.r2Prefix || ""
        ).trim();
        const basePrefix = normalizePrefix(extractSeriesBaseFromPrefix(basePrefixRaw));

        if (mt !== "tv" && mt !== "course") {
          if (alive) setEpisodes([]);
          return;
        }

        let data = null;
        let error = null;

        // 1) tenta por series_id (quando existir)
          if (seriesUuid) {
            const res = await supabase
              .from("titles")
              .select("id, public_id, title, synopsis, r2_prefix, season, episode, thumb_url, hero_image_url, status, created_at")
              .eq("media_type", mt)
              .eq("status", "published")
              .eq("is_series", false)
              .eq("series_id", seriesUuid)
              .order("created_at", { ascending: true });

            if (!res.error) data = res.data || [];
            else error = res.error;
            if (error && String(error.message || "").includes("series_id")) {
              data = null;
              error = null;
            }
          }

          // 2) fallback por imdb_id (compat)
          if ((!data || !data.length) && mt === "tv" && imdbId.startsWith("tt")) {
            const res2 = await supabase
              .from("titles")
              .select("id, public_id, title, synopsis, r2_prefix, season, episode, thumb_url, hero_image_url, status, created_at")
              .eq("media_type", "tv")
              .eq("imdb_id", imdbId)
              .eq("status", "published")
              .eq("is_series", false)
              .order("created_at", { ascending: true });

            if (res2.error && error) throw res2.error;
            data = res2.data || [];
          }

          // 3) fallback por r2_prefix (curso)
          if ((!data || !data.length) && mt === "course" && basePrefix) {
            const res3 = await supabase
              .from("titles")
              .select("id, public_id, title, synopsis, r2_prefix, season, episode, thumb_url, hero_image_url, status, created_at")
              .eq("media_type", "course")
              .eq("status", "published")
              .eq("is_series", false)
              .like("r2_prefix", `${basePrefix}%`)
              .order("created_at", { ascending: true });

            if (res3.error && error) throw res3.error;
            data = res3.data || [];
          }

        if (error && (!data || !data.length) && !imdbId.startsWith("tt")) throw error;

        const list = Array.isArray(data) ? data : [];

        const normalized = list
          .map((r) => {
            const parsed = parseSeasonEpisodeFromPrefix(r?.r2_prefix);
            const season = Number(r?.season || 0) > 0 ? Number(r.season) : parsed.season;
            const episode = Number(r?.episode || 0) > 0 ? Number(r.episode) : parsed.episode;

            return {
              dbId: r.id,
              public_id: r.public_id,
              title: r.title || viewItem?.title || "",
              synopsis: String(r?.synopsis || "").trim(),
              season: season || 1,
              episode: episode || 1,
              r2_prefix: String(r?.r2_prefix || "").trim(),
              thumb_url: String(r?.thumb_url || "").trim(),
              hero_image_url: String(r?.hero_image_url || "").trim(),
            };
          })
          .filter((x) => x.public_id);

        normalized.sort((a, b) => (a.season !== b.season ? a.season - b.season : a.episode - b.episode));

        if (!alive) return;
        setEpisodes(normalized);

        const curSe = parseSeasonEpisodeFromPrefix(viewItem?.r2_prefix || viewItem?.r2Prefix || "");
        const fallbackSeason = normalized.find((x) => x.season === curSe.season)?.season ?? normalized[0]?.season ?? 1;

        setActiveSeason(fallbackSeason);
      } catch {
        if (!alive) return;
        setEpisodes([]);
      }
    }

    if (viewItem) loadEpisodes();
    return () => {
      alive = false;
    };
  }, [viewItem]);

  const seasons = useMemo(() => {
    const set = new Set();
    for (const ep of episodes) set.add(ep.season);
    return Array.from(set).sort((a, b) => a - b);
  }, [episodes]);

  const episodesForSeason = useMemo(() => {
    return episodes.filter((e) => e.season === activeSeason).sort((a, b) => a.episode - b.episode);
  }, [episodes, activeSeason]);

  const firstEpisode = useMemo(() => (episodes.length ? episodes[0] : null), [episodes]);

  // resume
  useEffect(() => {
    let alive = true;

    async function loadResume() {
      try {
        setResumeLoading(true);

        const uid0 = await getAuthUserId();
        const pid0 = getActiveProfileIdFromStorage(uid0);

        if (!alive) return;

        if (!uid0 || !pid0) {
          setResumeSec(0);
          setSeriesResumePublicId("");
          return;
        }

        if (isSeriesCard) {
          const episodeDbIds = episodes.map((e) => String(e.dbId || "").trim()).filter(Boolean);
          if (!episodeDbIds.length) {
            setResumeSec(0);
            setSeriesResumePublicId("");
            return;
          }

          const { data, error } = await supabase
            .from("watch_progress")
            .select("video_id, position_sec, updated_at")
            .eq("user_id", uid0)
            .eq("profile_id", pid0)
            .in("video_id", episodeDbIds)
            .order("updated_at", { ascending: false })
            .limit(1);

          if (!alive) return;

          if (error) {
            setResumeSec(0);
            setSeriesResumePublicId("");
            return;
          }

          const row = Array.isArray(data) ? data[0] : null;
          const lastDbId = String(row?.video_id || "").trim();
          const lastSec = Number(row?.position_sec || 0);

          const lastEp = episodes.find((e) => String(e.dbId) === lastDbId);
          const lastPid = String(lastEp?.public_id || "").trim();

          setSeriesResumePublicId(lastPid);
          setResumeSec(Number.isFinite(lastSec) ? lastSec : 0);
          return;
        }

        const videoUuid = String(viewItem?.dbId || "").trim();
        if (!videoUuid) {
          setResumeSec(0);
          return;
        }

        const { data, error } = await supabase
          .from("watch_progress")
          .select("position_sec")
          .eq("user_id", uid0)
          .eq("profile_id", pid0)
          .eq("video_id", videoUuid)
          .maybeSingle();

        if (!alive) return;

        if (error) {
          setResumeSec(0);
          return;
        }

        setResumeSec(Number(data?.position_sec || 0));
      } catch {
        if (!alive) return;
        setResumeSec(0);
        setSeriesResumePublicId("");
      } finally {
        if (alive) setResumeLoading(false);
      }
    }

    if (viewItem) {
      if (isSeriesCard) {
        if (episodes.length) loadResume();
      } else {
        loadResume();
      }
    }

    return () => {
      alive = false;
    };
  }, [viewItem, isSeriesCard, episodes]);

  // id correto para assistir
  const primaryWatchId = useMemo(() => {
    if (!isTv) return String(viewItem?.id || "").trim();

    if (isSeriesCard) {
      const last = String(seriesResumePublicId || "").trim();
      if (last) return last;
      return String(firstEpisode?.public_id || "").trim();
    }

    return String(viewItem?.id || "").trim();
  }, [isTv, isSeriesCard, seriesResumePublicId, firstEpisode, viewItem]);

  // trailer -> QR
  const trailerRaw = String(
    viewItem?.trailer ||
      viewItem?.trailer_url ||
      viewItem?.trailerUrl ||
      viewItem?.trailer_youtube ||
      viewItem?.hero_youtube ||
      viewItem?.heroYoutube ||
      viewItem?.hero_youtube_url ||
      viewItem?.heroYoutubeUrl ||
      ""
  ).trim();

  const trailerYtId = useMemo(() => extractYouTubeId(trailerRaw), [trailerRaw]);
  const hasTrailer = Boolean(trailerYtId);

  const trailerUrl = useMemo(() => {
    if (!trailerYtId) return "";
    return `https://youtu.be/${encodeURIComponent(trailerYtId)}`;
  }, [trailerYtId]);

  const qrSrc = useMemo(() => {
    if (!trailerUrl) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(
      trailerUrl
    )}`;
  }, [trailerUrl]);

  // ✅ Qualidade exibida = o que o TÍTULO tem (tabela)
  const qualityLabel = titleHas4k(viewItem) ? "4K" : "FULL HD";

  const tags = useMemo(() => (Array.isArray(viewItem?.tags) ? viewItem.tags : []), [viewItem?.tags]);
  const categories = useMemo(
    () => (Array.isArray(viewItem?.categories) ? viewItem.categories : []),
    [viewItem?.categories]
  );
  const isCalendarItem = useMemo(() => {
    if (!viewItem) return false;
    if (viewItem?.in_cinema === true) return true;
    return hasCinemaTag(categories);
  }, [viewItem, categories]);
  const backSectionKey = useMemo(() => {
    const raw = String(loc?.state?.sectionKey || loc?.state?.section || "").trim();
    if (raw) return raw;
    return isCalendarItem ? "calendar" : "";
  }, [loc?.state?.sectionKey, loc?.state?.section, isCalendarItem]);

  const durationLabel = String(viewItem?.duration || "").trim();
  const synopsis = String(viewItem?.synopsis || "").trim();

  // sinopse
  const [expanded, setExpanded] = useState(false);
  const showReadMore = synopsis && synopsis.length > 220;

  const maturity = maturityBadge(viewItem?.maturity || "");

  const currentSE = useMemo(() => {
    if (isSeriesCard) return { season: 1, episode: 1 };
    return parseSeasonEpisodeFromPrefix(viewItem?.r2_prefix || viewItem?.r2Prefix || "");
  }, [isSeriesCard, viewItem]);

  const metaLine = useMemo(() => {
    const year = viewItem?.year ? String(viewItem.year) : "";
    const genre = tags.slice(0, 4).join(" • ");
    const cat = categories.slice(0, 2).join(" • ");
    const g = genre || cat;

    const parts = [year, g, durationLabel, qualityLabel].filter(Boolean);

    if (isTv && !isSeriesCard) parts.push(`${seasonPrefix}${pad2(currentSE.season)} • E${pad2(currentSE.episode)}`);
    if (isTv && isSeriesCard) parts.push(`${seasons.length} ${String(seasonLabelPlural).toLowerCase()} • ${episodes.length} episódio(s)`);

    return parts.filter(Boolean).join(" • ");
  }, [
    viewItem,
    tags,
    categories,
    durationLabel,
    qualityLabel,
    isTv,
    isSeriesCard,
    currentSE,
    seasons.length,
    episodes.length,
  ]);

  // TMDB pack (título principal)
  useEffect(() => {
    if (!viewItem) return;

    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        const p = await fetchTmdbPack(viewItem, ctrl.signal);
        if (!alive) return;

        if (p?.slides?.length) {
          p.slides.slice(0, HERO_PRELOAD_FIRST).forEach(preload);
          if (p.logo) preload(p.logo);
          setPack({ slides: p.slides, logo: p.logo || "" });
          return;
        }
      } catch {}

      const fallback = String(
        viewItem?.hero_image_url || viewItem?.bannerImage || viewItem?.thumb_url || viewItem?.thumb || ""
      ).trim();

      if (!alive) return;
      if (fallback) {
        preload(fallback);
        setPack({ slides: [fallback], logo: "" });
      } else {
        setPack({ slides: [], logo: "" });
      }
    }

    run();
    return () => {
      alive = false;
      try {
        ctrl.abort();
      } catch {}
    };
  }, [viewItem?.id]);

  // crossfade/rotate
  useEffect(() => {
    const slides = Array.isArray(pack?.slides) ? pack.slides : [];
    if (!slides.length) return;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    idxRef.current = 0;
    activeRef.current = "A";
    pendingRef.current = null;

    setLayerA(slides[0]);
    setLayerB(slides[1] || slides[0]);
    setActiveLayer("A");

    if (slides.length >= 2) {
      idxRef.current = 2;

      timerRef.current = setInterval(() => {
        const urls = Array.isArray(pack?.slides) ? pack.slides : [];
        if (urls.length < 2) return;

        const next = urls[idxRef.current % urls.length];
        idxRef.current = (idxRef.current + 1) % urls.length;

        const cur = activeRef.current;
        const target = cur === "A" ? "B" : "A";
        pendingRef.current = target;

        preload(next);

        if (target === "A") setLayerA(next);
        else setLayerB(next);
      }, HERO_ROTATE_MS);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [pack?.slides]);

  function onImgLoaded(which) {
    if (pendingRef.current !== which) return;
    setActiveLayer(which);
    activeRef.current = which;
    pendingRef.current = null;
  }

  // similares (lista)
  useEffect(() => {
    let alive = true;

    async function loadSimilar() {
      try {
        const cat = await fetchCatalog({ allow4k });
        const list = Array.isArray(cat) ? cat : Array.isArray(cat?.items) ? cat.items : [];

        const score = (x) => {
          const t = Array.isArray(x?.tags) ? x.tags : [];
          const c = Array.isArray(x?.categories) ? x.categories : [];
          let s = 0;
          for (const a of tags) if (t.includes(a)) s += 3;
          for (const b of categories) if (c.includes(b)) s += 2;
          return s;
        };

        const sim = list
          .filter((x) => String(x?.id) !== String(viewItem?.id))
          .map((x) => ({ x, s: score(x) }))
          .filter((r) => r.s > 0)
          .sort((a, b) => b.s - a.s)
          .slice(0, 120)
          .map((r) => r.x);

        if (!alive) return;
        setSimilarItems(sim);
      } catch {
        if (!alive) return;
        setSimilarItems([]);
      }
    }

    if (viewItem?.id) loadSimilar();
    return () => {
      alive = false;
    };
  }, [viewItem?.id, allow4k, tags, categories]);

  // ✅ hydrate visuals (banner + logo) via TMDB (resolvido por IMDB/título)
  const hydrateSimilarVisual = useCallback(async (it, signal) => {
    const pid = String(it?.id || "").trim();
    if (!pid) return;
    if (similarVisualRef.current?.[pid]?.img || similarVisualRef.current?.[pid]?.logo) return;

    const fallbackImg = pickThumb(it);

    if (!TMDB_KEY) {
      if (fallbackImg) {
        setSimilarVisualMap((prev) => (prev[pid] ? prev : { ...prev, [pid]: { img: fallbackImg, logo: "" } }));
      }
      return;
    }

    try {
      const p = await fetchTmdbPack(it, signal);
      const img = String(p?.slides?.[0] || "").trim() || fallbackImg || "";
      const logo = String(p?.logo || "").trim() || "";

      if (img) preload(img);
      if (logo) preload(logo);

      setSimilarVisualMap((prev) => (prev[pid] ? prev : { ...prev, [pid]: { img, logo } }));
    } catch {
      if (fallbackImg) {
        setSimilarVisualMap((prev) => (prev[pid] ? prev : { ...prev, [pid]: { img: fallbackImg, logo: "" } }));
      }
    }
  }, []);

  // quando abrir similares: pré-carrega os primeiros (até 10)
  useEffect(() => {
    if (!similarOpen) return;
    let alive = true;
    const ctrl = new AbortController();

    (async () => {
      const list = (Array.isArray(similarItems) ? similarItems : []).slice(0, SIM_MAX);
      for (const it of list) {
        if (!alive) return;
        await hydrateSimilarVisual(it, ctrl.signal);
      }
    })();

    return () => {
      alive = false;
      try {
        ctrl.abort();
      } catch {}
    };
  }, [similarOpen, similarItems, hydrateSimilarVisual]);

  // prefetch no foco (TV não tem hover)
  useEffect(() => {
    if (!similarOpen) return;
    if (similarZone !== "list") return;

    let alive = true;
    const ctrl = new AbortController();

    (async () => {
      const list = (Array.isArray(similarItems) ? similarItems : []).slice(0, SIM_MAX);
      const base = Math.max(0, similarIndex);
      const slice = list.slice(base, base + 4);
      for (const it of slice) {
        if (!alive) return;
        await hydrateSimilarVisual(it, ctrl.signal);
      }
    })();

    return () => {
      alive = false;
      try {
        ctrl.abort();
      } catch {}
    };
  }, [similarOpen, similarZone, similarIndex, similarItems, hydrateSimilarVisual]);

  // watchlist
  const titlePublicId = useMemo(() => String(viewItem?.id || "").trim(), [viewItem]);

  useEffect(() => {
    let alive = true;

    async function loadWatchlistFlag() {
      setInWatchlist(false);
      if (!activeProfileId || !titlePublicId) return;

      const { data, error } = await supabase
        .from("user_watchlist")
        .select("title_public_id")
        .eq("profile_id", activeProfileId)
        .eq("title_public_id", titlePublicId)
        .maybeSingle();

      if (!alive) return;
      if (error) return;

      setInWatchlist(!!data?.title_public_id);
    }

    loadWatchlistFlag();

    return () => {
      alive = false;
    };
  }, [activeProfileId, titlePublicId]);

  const toggleWatchlist = useCallback(async () => {
    if (!activeProfileId || !titlePublicId) return;
    if (listBusy) return;

    const isIn = inWatchlist;
    setListBusy(true);

    try {
      if (!isIn) {
        const { error } = await supabase
          .from("user_watchlist")
          .upsert(
            { profile_id: activeProfileId, title_public_id: titlePublicId },
            { onConflict: "profile_id,title_public_id" }
          );
        if (error) throw error;

        setInWatchlist(true);
        window.dispatchEvent(
          new CustomEvent("cs:watchlist-updated", { detail: { titleId: titlePublicId, inList: true } })
        );
      } else {
        const { error } = await supabase
          .from("user_watchlist")
          .delete()
          .eq("profile_id", activeProfileId)
          .eq("title_public_id", titlePublicId);

        if (error) throw error;

        setInWatchlist(false);
        window.dispatchEvent(
          new CustomEvent("cs:watchlist-updated", { detail: { titleId: titlePublicId, inList: false } })
        );
      }
    } catch (e) {
      console.log("[TitleTv] toggle watchlist error:", e);
    } finally {
      setListBusy(false);
    }
  }, [activeProfileId, titlePublicId, inWatchlist, listBusy]);

  const openSimilarModal = useCallback(() => {
    similarPrevRef.current = { zone: focusZone, index: focusIndex };

    setSimilarOpen(true);
    setSimilarZone("list");
    setSimilarIndex(0);

    setTimeout(() => {
      const el = similarRefs.current?.[0];
      if (el) el.focus?.();
      else closeModalRef.current?.focus?.();
    }, 0);
  }, [focusZone, focusIndex]);

  const closeSimilarModal = useCallback(() => {
    setSimilarOpen(false);

    const prev = similarPrevRef.current || { zone: "actions", index: 0 };

    setTimeout(() => {
      if (prev.zone === "readmore") {
        setFocusZone("readmore");
        readMoreRef.current?.focus?.();
        return;
      }
      setFocusZone("actions");
      setFocusIndex(prev.index ?? 0);
      btnRefs.current?.[prev.index ?? 0]?.focus?.();
    }, 0);
  }, []);

  // mantém item focado visível no scroll
  useEffect(() => {
    if (!similarOpen) return;
    if (similarZone !== "list") return;
    const el = similarRefs.current?.[similarIndex];
    if (el?.scrollIntoView) {
      try {
        el.scrollIntoView({ block: "nearest" });
      } catch {}
    }
  }, [similarOpen, similarZone, similarIndex]);

  // ações
  const canResume = Number(resumeSec || 0) > 5;
  const resumeLabel = resumeLoading ? "Continuar..." : canResume ? `Continuar • ${fmtTime(resumeSec)}` : "Continuar";

  const onPlay = useCallback(() => {
    const fallbackId = !isSeriesCard ? String(id || "").trim() : "";
    const watchId = String(primaryWatchId || fallbackId || "").trim();
    if (!watchId) return;

    const url = `/watch/${watchId}?start=0&fresh=1`;
    console.log("[TitleTv] onPlay", { watchId, url });
    setNavTarget(url);
    setNavPending(true);
    setTimeout(() => {
      nav(url, {
        state: { item: viewItem, from: loc?.state?.from || "/browse", sectionKey: backSectionKey },
      });
    }, 0);
  }, [nav, primaryWatchId, viewItem, loc?.state?.from, backSectionKey, isSeriesCard, id]);

  const onContinue = useCallback(() => {
    const fallbackId = !isSeriesCard ? String(id || "").trim() : "";
    const watchId = String(primaryWatchId || fallbackId || "").trim();
    if (!watchId) return;

    const start = Math.floor(Number(resumeSec || 0));
    const qs = start > 5 ? `?start=${encodeURIComponent(start)}` : "";

    const url = `/watch/${watchId}${qs}`;
    console.log("[TitleTv] onContinue", { watchId, url });
    setNavTarget(url);
    setNavPending(true);
    setTimeout(() => {
      nav(url, {
        state: { item: viewItem, from: loc?.state?.from || "/browse", sectionKey: backSectionKey },
      });
    }, 0);
  }, [nav, primaryWatchId, resumeSec, viewItem, loc?.state?.from, backSectionKey, isSeriesCard, id]);

  const goBack = useCallback(() => {
    const fallback = String(loc?.state?.from || "").trim() || "/browse";
    const state = { from: "/browse", sectionKey: backSectionKey };
    if (!fallback || fallback === "/browse") {
      nav("/browse", { replace: true, state });
      return;
    }
    nav(fallback, { replace: true, state });
  }, [nav, loc?.state?.from, backSectionKey]);

  const actions = useMemo(() => {
    const arr = [];
    const calendarLocked = isCalendarItem;
    const fallbackId = !isSeriesCard ? String(id || "").trim() : "";
    const canWatchId = String(primaryWatchId || fallbackId || "").trim();

    arr.push({
      key: "play",
      label: "Assistir",
      icon: Play,
      variant: "primary",
      disabled: !canWatchId || calendarLocked || navPending,
      onClick: onPlay,
      right: calendarLocked ? "Em breve" : "",
    });

    arr.push({
      key: "continue",
      label: resumeLabel,
      icon: Play,
      variant: "dark",
      disabled: !canWatchId || resumeLoading || calendarLocked || navPending,
      onClick: onContinue,
      right: calendarLocked ? "Em breve" : "",
    });

    if (isTv) {
      arr.push({
        key: "eps",
        label: "Episódios",
        icon: ListVideo,
        variant: "dark",
        disabled: !episodes.length,
        onClick: () => setEpsOpen(true),
      });
    }

    arr.push({
      key: "similar",
      label: "Títulos semelhantes",
      icon: Sparkles,
      variant: "dark",
      disabled: !similarItems.length,
      onClick: openSimilarModal,
    });

    arr.push({
      key: "watchlist",
      label: inWatchlist ? "Remover da minha lista" : "Adicionar à minha lista",
      icon: inWatchlist ? Check : Plus,
      variant: "dark",
      disabled: !activeProfileId || listBusy,
      onClick: toggleWatchlist,
      right: listBusy ? "..." : "",
    });

    return arr;
  }, [
    isCalendarItem,
    primaryWatchId,
    onPlay,
    onContinue,
    resumeLabel,
    resumeLoading,
    isTv,
    episodes.length,
    similarItems.length,
    openSimilarModal,
    inWatchlist,
    activeProfileId,
    listBusy,
    toggleWatchlist,
    navPending,
  ]);

  const firstEnabledActionIndex = useMemo(() => {
    const i = actions.findIndex((a) => !a.disabled);
    return i >= 0 ? i : 0;
  }, [actions]);

  useEffect(() => {
    if (!showReadMore && focusZone === "readmore") {
      setFocusZone("actions");
      setTimeout(() => btnRefs.current?.[firstEnabledActionIndex]?.focus?.(), 0);
    }
  }, [showReadMore, focusZone, firstEnabledActionIndex]);

  const epsActionIndex = useMemo(() => {
    const i = actions.findIndex((a) => a.key === "eps");
    return i >= 0 ? i : 0;
  }, [actions]);

  // foco inicial
  useEffect(() => {
    const t = setTimeout(() => {
      setFocusZone("actions");
      setFocusIndex(firstEnabledActionIndex);
      btnRefs.current?.[firstEnabledActionIndex]?.focus?.();
    }, 80);
    return () => clearTimeout(t);
  }, [id, loading, firstEnabledActionIndex]);

  /* =========================
     Episodes Drawer (TV) — thumbs
  ========================= */
  const [episodeThumbMap, setEpisodeThumbMap] = useState({});
  const episodeThumbRef = useRef({});
  useEffect(() => {
    episodeThumbRef.current = episodeThumbMap;
  }, [episodeThumbMap]);

  const [epsZone, setEpsZone] = useState("list"); // close | seasons | list
  const [epsSeasonIdx, setEpsSeasonIdx] = useState(0);
  const [epsItemIdx, setEpsItemIdx] = useState(0);

  const epsCloseRef = useRef(null);
  const epsSeasonRefs = useRef([]);
  const epsItemRefs = useRef([]);

  const presignKey = useCallback(async (key) => {
    const k = stripLeadingSlash(key);
    if (!k) return "";

    try {
      const { data, error } = await supabase.functions.invoke("r2-presign", {
        body: { key: k, expiresIn: 900 },
      });

      if (error) return "";

      const url = String(data?.url || data?.signedUrl || data?.result?.url || "").trim();
      return url || "";
    } catch {
      return "";
    }
  }, []);

  const resolveEpisodeThumbForEp = useCallback(
    async (ep) => {
      const pid = String(ep?.public_id || "").trim();
      if (!pid) return;

      if (episodeThumbRef.current?.[pid]?.url) return;

      const raw = String(ep?.thumb_url || ep?.hero_image_url || "").trim();
      if (raw && isHttpUrl(raw)) {
        setEpisodeThumbMap((prev) => (prev?.[pid]?.url ? prev : { ...prev, [pid]: { url: raw } }));
        return;
      }

      if (raw && looksLikeR2Key(raw)) {
        const url = await presignKey(raw);
        if (url) {
          setEpisodeThumbMap((prev) => (prev?.[pid]?.url ? prev : { ...prev, [pid]: { url } }));
          return;
        }
      }

      const r2Prefix = ensureSlashEnd(ep?.r2_prefix || ep?.r2Prefix || "");
      if (!r2Prefix) return;

      const candidates = Array.from(new Set([EP_SERIES_THUMB_FILE, ...EP_SERIES_THUMB_CANDIDATES].filter(Boolean)));

      for (const fname of candidates) {
        const key = `${r2Prefix}thumbs/${fname}`;
        const url = await presignKey(key);
        if (url) {
          setEpisodeThumbMap((prev) => (prev?.[pid]?.url ? prev : { ...prev, [pid]: { url } }));
          return;
        }
      }
    },
    [presignKey]
  );

  const pickEpisodeThumb = useCallback((ep) => {
    const pid = String(ep?.public_id || "").trim();
    const presigned = pid ? episodeThumbRef.current?.[pid]?.url : "";
    if (presigned) return presigned;

    const raw = String(ep?.thumb_url || ep?.hero_image_url || "").trim();
    return normalizeMaybeUrl(raw);
  }, []);

  const closeEpisodesDrawer = useCallback(() => {
    setEpsOpen(false);
    setTimeout(() => {
      setFocusZone("actions");
      setFocusIndex(epsActionIndex);
      btnRefs.current?.[epsActionIndex]?.focus?.();
    }, 0);
  }, [epsActionIndex]);

  const openEpisodeToWatch = useCallback(
    (epPublicId) => {
      const pid = String(epPublicId || "").trim();
      if (!pid) return;

      closeEpisodesDrawer();
      nav(`/watch/${pid}`, {
        state: { item: viewItem, from: loc?.state?.from || "/browse" },
      });
    },
    [nav, viewItem, loc?.state?.from, closeEpisodesDrawer]
  );

  useEffect(() => {
    if (!epsOpen) return;

    const sIdx = seasons.findIndex((s) => Number(s) === Number(activeSeason));
    setEpsSeasonIdx(sIdx >= 0 ? sIdx : 0);

    const initialIdx = (() => {
      const currentPid = String(viewItem?.id || "").trim();
      if (currentPid && !isSeriesCard) {
        const i = episodesForSeason.findIndex((e) => String(e.public_id || "").trim() === currentPid);
        if (i >= 0) return i;
      }

      const resumePid = String(seriesResumePublicId || "").trim();
      if (resumePid) {
        const i = episodesForSeason.findIndex((e) => String(e.public_id || "").trim() === resumePid);
        if (i >= 0) return i;
      }

      return 0;
    })();

    setEpsZone("list");
    setEpsItemIdx(Math.max(0, Math.min((episodesForSeason.length || 1) - 1, initialIdx)));

    let alive = true;
    (async () => {
      const slice = episodesForSeason.slice(0, 10);
      for (const ep of slice) {
        if (!alive) return;
        await resolveEpisodeThumbForEp(ep);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    epsOpen,
    activeSeason,
    seasons,
    episodesForSeason,
    resolveEpisodeThumbForEp,
    viewItem?.id,
    isSeriesCard,
    seriesResumePublicId,
  ]);

  useEffect(() => {
    if (!epsOpen) return;

    let alive = true;
    (async () => {
      const base = Math.max(0, epsItemIdx);
      const slice = episodesForSeason.slice(base, base + 8);
      for (const ep of slice) {
        if (!alive) return;
        await resolveEpisodeThumbForEp(ep);
      }
    })();

    return () => {
      alive = false;
    };
  }, [epsOpen, epsItemIdx, activeSeason, episodesForSeason, resolveEpisodeThumbForEp]);

  useEffect(() => {
    if (!epsOpen) return;

    const t = setTimeout(() => {
      if (epsZone === "close") {
        epsCloseRef.current?.focus?.();
        return;
      }
      if (epsZone === "seasons") {
        epsSeasonRefs.current?.[epsSeasonIdx]?.focus?.();
        return;
      }
      epsItemRefs.current?.[epsItemIdx]?.focus?.();
    }, 0);

    return () => clearTimeout(t);
  }, [epsOpen, epsZone, epsSeasonIdx, epsItemIdx, activeSeason]);

  useEffect(() => {
    if (!epsOpen) return;
    if (epsZone !== "list") return;

    const el = epsItemRefs.current?.[epsItemIdx];
    if (el && typeof el.scrollIntoView === "function") {
      try {
        el.scrollIntoView({ block: "nearest" });
      } catch {}
    }
  }, [epsOpen, epsZone, epsItemIdx, activeSeason]);

  /* =========================
     Keyboard (TV)
  ========================= */
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
        e.preventDefault();
        e.stopPropagation();

        if (expanded) {
          setExpanded(false);
          setTimeout(() => {
            setFocusZone(showReadMore ? "readmore" : "actions");
            if (showReadMore) readMoreRef.current?.focus?.();
            else btnRefs.current?.[focusIndex]?.focus?.();
          }, 0);
          return;
        }

        if (epsOpen) {
          closeEpisodesDrawer();
          return;
        }

        if (similarOpen) {
          closeSimilarModal();
          return;
        }

        goBack();
        return;
      }

      // ✅ SIMILARES (Netflix-like list) — navegação
      if (similarOpen) {
        const list = (Array.isArray(similarItems) ? similarItems : []).slice(0, SIM_MAX);
        if (!list.length) {
          e.preventDefault();
          e.stopPropagation();
          closeSimilarModal();
          return;
        }

        const clampIdx = (n) => Math.max(0, Math.min(list.length - 1, n));

        const focusAt = (idx, zone = "list") => {
          setSimilarZone(zone);
          if (zone === "list") {
            const next = clampIdx(idx);
            setSimilarIndex(next);
            setTimeout(() => similarRefs.current?.[next]?.focus?.(), 0);
          } else {
            setTimeout(() => closeModalRef.current?.focus?.(), 0);
          }
        };

        const isNav =
          hasCode(KEY.LEFT, code) ||
          hasCode(KEY.RIGHT, code) ||
          hasCode(KEY.UP, code) ||
          hasCode(KEY.DOWN, code) ||
          hasCode(KEY.ENTER, code);

        if (!isNav) return;

        e.preventDefault();
        e.stopPropagation();

        // LEFT fecha (igual Netflix)
        if (hasCode(KEY.LEFT, code)) {
          closeSimilarModal();
          return;
        }

        if (hasCode(KEY.ENTER, code)) {
          if (similarZone === "close") {
            closeSimilarModal();
            return;
          }
          const it = list[similarIndex];
          if (it?.id) {
            setSimilarOpen(false);
            nav(`/t/${it.id}`, { state: { item: it, from: loc?.state?.from || "/browse" } });
          }
          return;
        }

        if (similarZone === "close") {
          if (hasCode(KEY.DOWN, code)) focusAt(0, "list");
          return;
        }

        if (hasCode(KEY.UP, code)) {
          if (similarIndex <= 0) {
            setSimilarZone("close");
            setTimeout(() => closeModalRef.current?.focus?.(), 0);
            return;
          }
          focusAt(similarIndex - 1, "list");
          return;
        }

        if (hasCode(KEY.DOWN, code)) {
          const next = similarIndex + 1;
          if (next < list.length) focusAt(next, "list");
          return;
        }

        // RIGHT não faz nada (padrão)
        return;
      }

      // Drawer Episódios
      if (epsOpen) {
        const isNav =
          hasCode(KEY.LEFT, code) ||
          hasCode(KEY.RIGHT, code) ||
          hasCode(KEY.UP, code) ||
          hasCode(KEY.DOWN, code) ||
          hasCode(KEY.ENTER, code);

        if (!isNav) return;

        e.preventDefault();
        e.stopPropagation();

        if (hasCode(KEY.LEFT, code)) {
          closeEpisodesDrawer();
          return;
        }

        if (hasCode(KEY.ENTER, code)) {
          if (epsZone === "close") {
            closeEpisodesDrawer();
            return;
          }

          if (epsZone === "seasons") {
            const s = seasons?.[epsSeasonIdx];
            if (Number.isFinite(Number(s))) setActiveSeason(Number(s));
            setEpsItemIdx(0);
            setEpsZone("list");
            return;
          }

          const ep = episodesForSeason?.[epsItemIdx];
          if (ep?.public_id) openEpisodeToWatch(ep.public_id);
          return;
        }

        if (hasCode(KEY.UP, code)) {
          if (epsZone === "list") {
            if (epsItemIdx > 0) {
              setEpsItemIdx((n) => Math.max(0, n - 1));
              return;
            }
            if (seasons.length > 1) {
              setEpsZone("seasons");
              return;
            }
            setEpsZone("close");
            return;
          }

          if (epsZone === "seasons") {
            setEpsZone("close");
            return;
          }

          return;
        }

        if (hasCode(KEY.DOWN, code)) {
          if (epsZone === "close") {
            if (seasons.length > 1) {
              setEpsZone("seasons");
              return;
            }
            setEpsZone("list");
            return;
          }

          if (epsZone === "seasons") {
            setEpsZone("list");
            return;
          }

          setEpsItemIdx((n) => Math.min((episodesForSeason?.length || 1) - 1, n + 1));
          return;
        }

        if (hasCode(KEY.RIGHT, code)) {
          if (epsZone === "seasons") {
            setEpsZone("list");
            setEpsItemIdx(0);
          }
          return;
        }

        return;
      }

      // Ler mais
      if (focusZone === "readmore") {
        if (hasCode(KEY.ENTER, code)) {
          e.preventDefault();
          if (showReadMore) setExpanded((v) => !v);
          return;
        }
        if (hasCode(KEY.DOWN, code)) {
          e.preventDefault();
          setFocusZone("actions");
          setFocusIndex(firstEnabledActionIndex);
          btnRefs.current?.[firstEnabledActionIndex]?.focus?.();
          return;
        }
        if (hasCode(KEY.UP, code) || hasCode(KEY.LEFT, code) || hasCode(KEY.RIGHT, code)) {
          e.preventDefault();
        }
        return;
      }

      function nextEnabledIndex(from, step) {
        const len = actions.length;
        if (!len) return 0;
        let i = Math.max(0, Math.min(len - 1, from));
        for (let tries = 0; tries < len; tries++) {
          const cand = Math.max(0, Math.min(len - 1, i + step * (tries + 1)));
          if (!actions[cand]?.disabled) return cand;
        }
        return Math.max(0, Math.min(len - 1, i));
      }

      // botões
      if (hasCode(KEY.UP, code)) {
        e.preventDefault();

        if (focusIndex <= firstEnabledActionIndex && showReadMore) {
          setFocusZone("readmore");
          setTimeout(() => readMoreRef.current?.focus?.(), 0);
          return;
        }

        const next = nextEnabledIndex(focusIndex, -1);
        setFocusIndex(next);
        btnRefs.current?.[next]?.focus?.();
        return;
      }

      if (hasCode(KEY.DOWN, code)) {
        e.preventDefault();
        const next = nextEnabledIndex(focusIndex, 1);
        setFocusIndex(next);
        btnRefs.current?.[next]?.focus?.();
        return;
      }

      if (hasCode(KEY.ENTER, code)) {
        e.preventDefault();
        const act = actions[focusIndex];
        act?.onClick?.();
        return;
      }

      if (hasCode(KEY.LEFT, code) || hasCode(KEY.RIGHT, code)) {
        e.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false, capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    expanded,
    showReadMore,
    focusZone,
    focusIndex,
    actions,
    firstEnabledActionIndex,
    epsOpen,
    epsZone,
    epsSeasonIdx,
    epsItemIdx,
    seasons,
    episodesForSeason,
    closeEpisodesDrawer,
    openEpisodeToWatch,
    setActiveSeason,
    isSeriesCard,
    similarOpen,
    similarItems,
    similarZone,
    similarIndex,
    closeSimilarModal,
    nav,
    loc?.state?.from,
    goBack,
  ]);

  if (loading || !viewItem) {
    return (
      <div className="w-full min-h-screen bg-black text-white flex items-center justify-center">
        <div
          className="h-14 w-14 rounded-full border-4 border-white/15 border-t-red-600 animate-spin"
          aria-label="Carregando"
        />
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-screen bg-black overflow-hidden">
      {navPending ? (
        <div className="fixed inset-0 z-[999] bg-black/80 text-white flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-full border-4 border-white/15 border-t-red-600 animate-spin" />
            <div className="text-white/85 text-[18px] font-bold">Abrindo player…</div>
            <div className="text-white/55 text-[12px] text-center">
              {String(navTarget || "")}
              <br />
              {`tick=${navTick}`}
            </div>
          </div>
        </div>
      ) : null}
      {/* BACKGROUND */}
      <div className="fixed inset-0">
        <div className="absolute inset-0 overflow-hidden">
          {layerA ? (
            <img
              src={layerA}
              alt={titleName}
              draggable={false}
              decoding="async"
              fetchPriority="high"
              className={cx(
                "absolute inset-0 w-full h-full object-cover transition-opacity",
                activeLayer === "A" ? "opacity-100" : "opacity-0"
              )}
              style={{
                objectPosition: "right 18%",
                transitionDuration: `${HERO_FADE_MS}ms`,
                willChange: "opacity",
                transform: "translate3d(0,0,0)",
                backfaceVisibility: "hidden",
              }}
              onLoad={() => onImgLoaded("A")}
            />
          ) : null}

          {layerB ? (
            <img
              src={layerB}
              alt={titleName}
              draggable={false}
              decoding="async"
              fetchPriority="low"
              className={cx(
                "absolute inset-0 w-full h-full object-cover transition-opacity",
                activeLayer === "A" ? "opacity-0" : "opacity-100"
              )}
              style={{
                objectPosition: "right 18%",
                transitionDuration: `${HERO_FADE_MS}ms`,
                willChange: "opacity",
                transform: "translate3d(0,0,0)",
                backfaceVisibility: "hidden",
              }}
              onLoad={() => onImgLoaded("B")}
            />
          ) : null}
        </div>

        {/* overlays */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg," +
                "rgb(0, 0, 0) 10%," +
                "rgba(0, 0, 0, 0.93) 40%," +
                "rgba(0, 0, 0, 0.8) 60%," +
                "rgba(0, 0, 0, 0.7) 70%," +
                "rgba(0, 0, 0, 0.29) 80%," +
                "rgba(0,0,0,0.00) 90%)",
            }}
          />
        </div>
      </div>

      {/* QR (canto inferior direito) */}
      {hasTrailer && qrSrc ? (
        <div className="fixed right-10 bottom-10 z-20 pointer-events-none">
          <div className="mt-0 text-center text-[14px] font-semibold text-white/100">Escaneie com o celular</div>
          <div
            className="rounded-1xl border border-white/10 bg-black/35 backdrop-blur-sm p-3"
            style={{ boxShadow: "0 22px 70px rgba(0,0,0,1.55)" }}
          >
            <img src={qrSrc} alt="QR Code Trailer" draggable={false} className="h-[176px] w-[176px] rounded-1xl" />
          </div>
          <div className="mt-0 text-center text-[15px] font-semibold text-white/100">Trailer</div>
        </div>
      ) : null}

      {/* CONTENT */}
      <div className="relative z-10 min-h-screen px-14 pt-10 pb-14 text-white">
        {/* TOP-LEFT LOGO */}
        <div className="pointer-events-none">
          {pack?.logo ? (
            <img
              src={pack.logo}
              alt={titleName}
              draggable={false}
              className="max-h-[110px] w-auto object-contain"
              style={{ filter: "drop-shadow(0 18px 55px rgba(0,0,0,0.78))" }}
            />
          ) : (
            <div
              className="text-white text-[34px] font-extrabold tracking-tight"
              style={{ textShadow: "0 18px 55px rgba(0,0,0,0.78)" }}
            >
              {titleName}
            </div>
          )}
        </div>

        {/* META */}
        {metaLine ? <div className="mt-5 text-white/75 text-[20px]">{metaLine}</div> : null}

        {/* MATURITY */}
        <div className="mt-3 flex items-center gap-3 text-white/85">
          <span className="text-[17px] font-bold">Classificação</span>
          <span className="text-[17px] font-extrabold text-white/90">{maturity.label}</span>
          <span className="text-[15px] text-white/60">{maturity.hint}</span>
        </div>

        {/* SYNOPSIS */}
        <div className="mt-6 relative">
          <div
            className={cx(
              "text-white/88 text-[23px] leading-relaxed max-w-[980px] line-clamp-4",
              expanded ? "opacity-0 pointer-events-none select-none" : ""
            )}
          >
            {synopsis || "Sem descrição cadastrada."}
          </div>

          {expanded && synopsis ? (
            <div
              className="absolute left-0 top-0 text-white/88 text-[23px] overflow-hidden"
              style={{
                right: "120px",
                maxWidth: "none",
                lineHeight: "31px",
                maxHeight: "124px",
                pointerEvents: "none",
                textShadow: "0 18px 55px rgba(0,0,0,0.55)",
              }}
            >
              {synopsis}
            </div>
          ) : null}

          {showReadMore ? (
            <button
              ref={readMoreRef}
              tabIndex={focusZone === "readmore" ? 0 : -1}
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={cx(
                "mt-4 inline-flex items-center gap-3 rounded-2xl bg-white/12 border border-white/10 px-5 py-3 text-[15px] font-bold text-white/90 hover:bg-white/15 outline-none",
                focusZone === "readmore" ? "ring-4 ring-white/90 scale-[1.01]" : ""
              )}
            >
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              {expanded ? "Mostrar menos" : "Ler mais"}
            </button>
          ) : null}
        </div>

        {/* ACTIONS */}
        <div className="mt-10 w-[560px] flex flex-col gap-4">
          {actions.map((a, i) => (
            <ActionButton
              key={a.key}
              refCb={(el) => (btnRefs.current[i] = el)}
              focused={focusZone === "actions" && i === focusIndex}
              variant={a.variant}
              icon={a.icon}
              label={a.label}
              right={a.right}
              disabled={a.disabled}
              onClick={a.onClick}
            />
          ))}
        </div>

        <div className="mt-10 text-white/35 text-[12px]">ID para suporte: {String(id || "")}</div>
      </div>

{/* ✅ SIMILARES — Netflix-like + foco bem claro + sem piscar capas */}
{similarOpen ? (
  <div className="fixed inset-0 z-[96]">
    {/* backdrop */}
    <div
      className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      onClick={closeSimilarModal}
      role="button"
      tabIndex={-1}
      aria-label="Fechar semelhantes"
    />

    {/* modal */}
    <div className="absolute inset-0 px-12 py-10" onClick={(e) => e.stopPropagation()}>
      <div
        className="h-full rounded-[26px] border border-white/12 bg-black/55 backdrop-blur-2xl overflow-hidden flex flex-col"
        style={{ boxShadow: "0 40px 140px rgba(0,0,0,0.90)" }}
      >
        {/* header */}
        <div className="px-10 py-7 border-b border-white/10 bg-black/40">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-widest text-white/60">TÍTULOS SEMELHANTES</div>
              <div className="mt-2 text-[28px] font-extrabold text-white/95 truncate">{titleName}</div>
              <div className="mt-2 text-[14px] text-white/55">Use ↑↓←→ e OK • Back para fechar</div>
            </div>

            <button
              ref={closeModalRef}
              tabIndex={similarZone === "close" ? 0 : -1}
              onClick={closeSimilarModal}
              className={cx(
                "shrink-0 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-6 py-4 text-sm font-semibold text-white hover:bg-white/15 outline-none",
                similarZone === "close" ? "ring-4 ring-white/90" : ""
              )}
            >
              <X className="h-5 w-5" />
              Fechar
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto cs-no-scrollbar px-10 py-10">
          <div className="grid grid-cols-6 gap-x-7 gap-y-8">
            {(similarItems || []).slice(0, SIM_MAX).map((it, i) => {
              const focused = similarZone === "grid" && i === similarIndex;

              const pid = String(it?.id || "").trim();
              const vis = pid ? similarVisualRef.current?.[pid] : null;

              // ✅ ANTI-PISCAR: prioriza thumb local; só usa TMDB se não tiver thumb
              const baseThumb = pickThumb(it);
              const tmdbImg = String(vis?.img || "").trim();
              const img = baseThumb || tmdbImg || "";

              // ✅ logo só no focado (mais bonito e menos “piscada”)
              const logo = focused ? String(vis?.logo || "").trim() : "";

              const year = it?.year ? String(it.year) : "";
              const mat = it?.maturity ? String(it.maturity) : "";

              return (
                <button
                  key={it?.id || i}
                  ref={(el) => (similarRefs.current[i] = el)}
                  tabIndex={focused ? 0 : -1}
                  onClick={() => {
                    setSimilarOpen(false);
                    if (it?.id) nav(`/t/${it.id}`, { state: { item: it, from: loc?.state?.from || "/browse" } });
                  }}
                  onFocus={() => hydrateSimilarVisual(it, new AbortController().signal)}
                  onMouseEnter={() => hydrateSimilarVisual(it, new AbortController().signal)}
                  className={cx(
                    "outline-none select-none text-left transition-transform duration-150",
                    focused ? "scale-[1.04]" : "scale-100"
                  )}
                  style={{ transformOrigin: "center" }}
                >
                  {/* ✅ ring FORA do overflow (sempre visível) */}
                  <div
                    className={cx(
                      "rounded-2xl p-[3px]",
                      focused ? "ring-4 ring-white/90 bg-white/20" : "bg-white/10"
                    )}
                    style={{
                      boxShadow: focused ? "0 26px 80px rgba(0,0,0,0.85)" : "0 18px 60px rgba(0,0,0,0.70)",
                    }}
                  >
                    {/* card 16:9 */}
                    <div className="relative rounded-[18px] overflow-hidden bg-white/5 aspect-[16/9]">
                      {img ? (
                        <img
                          src={img}
                          alt=""
                          draggable={false}
                          decoding="async"
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/70" />
                      )}

                      {/* overlay legibilidade */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/0" />

                      {/* ✅ logo central apenas no foco */}
                      {logo ? (
                        <div className="absolute inset-0 flex items-center justify-center px-5">
                          <img
                            src={logo}
                            alt=""
                            draggable={false}
                            decoding="async"
                            className="max-h-[62%] w-auto object-contain"
                            style={{
                              filter:
                                "drop-shadow(0 22px 70px rgba(0,0,0,0.95)) drop-shadow(0 10px 32px rgba(0,0,0,0.90))",
                            }}
                          />
                        </div>
                      ) : null}

                      {/* bottom info */}
                      <div className="absolute left-0 right-0 bottom-0 px-4 py-3">
                        <div className="text-[14px] font-extrabold text-white/95 line-clamp-2">
                          {String(it?.title || "Sem título")}
                        </div>
                        <div className="mt-1 text-[12px] text-white/70">
                          {year}
                          {mat ? (year ? " • " : "") + mat : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-10 text-[12px] text-white/40">Dica: Back fecha • OK abre o título selecionado.</div>
        </div>
      </div>
    </div>
  </div>
) : null}

      {/* ===== EPISODES DRAWER (Netflix-like) ===== */}
      {epsOpen ? (
        <div className="fixed inset-0 z-[95]">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeEpisodesDrawer}
            role="button"
            tabIndex={-1}
            aria-label="Fechar episódios"
          />

          <div
            className="absolute right-0 top-0 h-full"
            style={{
              width: "min(54vw, 980px)",
              minWidth: 640,
              background:
                "linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.88) 45%, rgba(0,0,0,1) 100%)",
              boxShadow: "-28px 0 70px rgba(0,0,0,.75)",
              backdropFilter: "blur(10px)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold tracking-widest text-yellow-400/90">EPISÓDIOS</div>
                <div className="mt-1 text-[13px] text-white/70 truncate">
                  {titleName}
                  {seasons.length ? (
                    <span className="ml-2 text-white/40">
                      • {seasonLabel} {pad2(activeSeason)} • {episodesForSeason.length} ep(s)
                    </span>
                  ) : null}
                </div>
              </div>

              <button
                ref={epsCloseRef}
                tabIndex={epsZone === "close" ? 0 : -1}
                onClick={closeEpisodesDrawer}
                className={cx(
                  "shrink-0 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-semibold text-white hover:bg-white/15 outline-none",
                  epsZone === "close" ? "shadow-[inset_0_0_0_4px_rgba(255,255,255,0.9)]" : ""
                )}
              >
                <X className="h-5 w-5" />
                Fechar
              </button>
            </div>

            {seasons.length > 1 ? (
              <div className="px-6 pb-2">
                <div className="text-[12px] text-white/45 font-semibold">{seasonLabelPlural}</div>
                <div className="mt-2 flex gap-2 overflow-x-auto cs-no-scrollbar pb-2">
                  {seasons.map((s, i) => {
                    const selected = Number(s) === Number(activeSeason);
                    const focused = epsZone === "seasons" && i === epsSeasonIdx;

                    return (
                      <button
                        key={`season-${s}`}
                        ref={(el) => (epsSeasonRefs.current[i] = el)}
                        tabIndex={focused ? 0 : -1}
                        onClick={() => {
                          setActiveSeason(s);
                          setEpsSeasonIdx(i);
                          setEpsItemIdx(0);
                          setEpsZone("list");
                        }}
                        className={cx(
                          "rounded-full px-4 py-2 text-[13px] font-bold transition outline-none",
                          selected ? "bg-white/18 text-white" : "bg-white/8 text-white/80 hover:bg-white/12",
                          focused ? "shadow-[inset_0_0_0_4px_rgba(255,255,255,0.9)]" : ""
                        )}
                      >
                        {seasonLabel} {pad2(s)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="px-6 pt-2 pb-16 h-[calc(100%-160px)]">
              <div className="h-full overflow-y-auto cs-no-scrollbar pr-2" style={{ paddingTop: 10, paddingBottom: 18 }}>
                <div className="flex flex-col gap-3">
                  {episodesForSeason.length ? (
                    episodesForSeason.map((ep, idx) => {
                      const focused = epsZone === "list" && idx === epsItemIdx;
                      const isResumeEp = String(ep.public_id || "") === String(seriesResumePublicId || "");
                      const thumb = pickEpisodeThumb(ep);

                      return (
                        <button
                          key={ep.public_id || idx}
                          ref={(el) => (epsItemRefs.current[idx] = el)}
                          tabIndex={focused ? 0 : -1}
                          onClick={() => openEpisodeToWatch(ep.public_id)}
                          onFocus={() => resolveEpisodeThumbForEp(ep)}
                          onMouseEnter={() => resolveEpisodeThumbForEp(ep)}
                          className="w-full text-left outline-none transition rounded-2xl bg-white/7 hover:bg-white/10"
                          style={{
                            padding: 16,
                            boxShadow: focused ? "inset 0 0 0 4px rgba(255,255,255,0.92)" : "none",
                          }}
                        >
                          <div className="flex items-start gap-4">
                            <div
                              style={{
                                width: 4,
                                height: 112,
                                borderRadius: 999,
                                background: focused ? "#e50914" : "rgba(255,255,255,0.10)",
                              }}
                            />

                            <div className="rounded-2xl overflow-hidden bg-black/30 shrink-0" style={{ width: 200, height: 112 }}>
                              {thumb ? (
                                <img src={thumb} alt="" draggable={false} decoding="async" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-white/8 to-black/50" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="truncate text-[16px] font-extrabold text-white/92">
                                  <span className="text-white/55 mr-2">
                                    {seasonPrefix}
                                    {pad2(ep.season)}E{pad2(ep.episode)}
                                  </span>
                                  {String(ep.title || `Episódio ${pad2(ep.episode)}`)}
                                </div>

                                {isResumeEp ? (
                                  <span className="shrink-0 rounded-full bg-[#e50914]/20 px-3 py-1 text-[11px] font-extrabold text-white">
                                    Continuar
                                  </span>
                                ) : null}
                              </div>

                              {ep.synopsis ? (
                                <div className="mt-2 text-[13px] text-white/60 line-clamp-2">{ep.synopsis}</div>
                              ) : (
                                <div className="mt-2 text-[13px] text-white/40">Sem sinopse.</div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-white/60 text-sm">
                      Nenhum episódio encontrado neste {String(seasonLabel || "temporada").toLowerCase()}.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              className="absolute bottom-0 left-0 right-0 px-6 py-3 text-[12px] text-white/55"
              style={{ background: "linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.85))" }}
            >
              Dica: ↑↓ navega • ↑ no topo abre {seasonLabelPlural} • OK para assistir • ← Voltar • Back para sair
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
