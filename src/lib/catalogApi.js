// src/lib/catalogApi.js
import { supabase } from "./supabaseClient.js";

// ✅ só tenta buscar por titles.id quando realmente for UUID
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SR_RE = /^sr-\d{8}$/i;

/**
 * Detecta se o valor parece ser YouTube (url/id/yt:)
 */
function isProbablyYouTube(v) {
  const s = String(v || "").trim().toLowerCase();
  if (!s) return false;
  if (s.startsWith("yt:")) return true;
  return s.includes("youtube.com") || s.includes("youtu.be") || s.includes("music.youtube.com");
}

/**
 * Retorna o primeiro candidato que pareça YouTube.
 */
function firstYouTube(...candidates) {
  for (const c of candidates) {
    if (isProbablyYouTube(c)) return String(c || "").trim();
  }
  return "";
}

/* =========================
   TV helpers (series aggregation)
========================= */

function onlyDigits(imdbId) {
  return String(imdbId || "").replace(/^tt/i, "").replace(/\D+/g, "");
}
function pad8(n) {
  const s = String(n || "");
  return s.padStart(8, "0");
}
function buildSeriesPublicIdFromImdb(imdbId) {
  const d = onlyDigits(imdbId);
  if (!d) return "";
  return `sr-${pad8(d)}`;
}
function seriesPublicIdToImdbId(srPublicId) {
  const s = String(srPublicId || "").trim().toLowerCase();
  if (!SR_RE.test(s)) return "";
  const digits8 = s.replace(/^sr-/, "");
  const digits = digits8.replace(/^0+/, "") || "0";
  return `tt${digits}`;
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

/**
 * Fallback estável: pega o menor SxxEyy (normalmente S01E01),
 * ao invés de pegar o "último publicado".
 */
function pickRepresentativeEpisode(episodes) {
  let best = null;
  for (const ep of episodes || []) {
    const se = parseSeasonEpisodeFromPrefix(ep?.r2_prefix || ep?.r2Prefix || "");
    if (!best) best = { ep, se };
    else {
      if (se.season < best.se.season) best = { ep, se };
      else if (se.season === best.se.season && se.episode < best.se.episode) best = { ep, se };
    }
  }
  return best?.ep || null;
}

/* =========================
   HLS / R2 helpers
========================= */

function isHttpUrl(v) {
  return /^https?:\/\//i.test(String(v || "").trim());
}

function safePrefix(p) {
  let s = String(p || "").trim();
  if (!s) return "";
  s = s.replace(/\\/g, "/");
  s = s.replace(/^\/+/, "");
  if (!s.endsWith("/")) s += "/";
  return s;
}

function urlToR2Key(maybeUrl) {
  const s = String(maybeUrl || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return decodeURIComponent(String(u.pathname || "")).replace(/^\/+/, "");
  } catch {
    return "";
  }
}

function resolveR2Key(value, r2Prefix) {
  const v = String(value || "").trim();
  if (!v) return "";

  if (isHttpUrl(v)) {
    const key = urlToR2Key(v);
    return key || "";
  }

  if (v.includes("/") && /\.m3u8(\?|$)/i.test(v)) {
    return v.replace(/^\/+/, "").replace(/\\/g, "/");
  }

  const prefix = safePrefix(r2Prefix);
  if (prefix) return `${prefix}${v.replace(/^\/+/, "")}`;

  return v;
}

function pickHlsKey(mediaRow, allow4k) {
  const prefix = mediaRow?.r2_prefix || "";

  const masterKey = resolveR2Key(mediaRow?.hls_master_url, prefix);
  const hdKey = resolveR2Key(mediaRow?.hls_master_hd_url, prefix);

  if (allow4k) return masterKey || hdKey || "";
  return hdKey || masterKey || "";
}

/**
 * Detecta se o erro do PostgREST é "coluna não existe" (ou schema cache).
 */
function isMissingColumnError(err, colName) {
  const msg = String(err?.message || "").toLowerCase();
  const details = String(err?.details || "").toLowerCase();
  const hint = String(err?.hint || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase();
  const raw = `${msg} ${details} ${hint} ${code}`;

  if (raw.includes("does not exist")) return true;
  if (raw.includes("schema cache")) return true;
  if (raw.includes("could not find") && raw.includes("column")) return true;
  if (colName && raw.includes(String(colName).toLowerCase())) return true;

  if (code.startsWith("pgrst")) {
    if (colName && raw.includes(String(colName).toLowerCase())) return true;
  }

  return false;
}

function splitSelectCols(cols) {
  const raw = String(cols || "").trim();
  if (!raw) return [];
  if (raw === "*") return ["*"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinSelectCols(cols) {
  if (!cols || cols.length === 0) return "";
  if (cols.length === 1 && cols[0] === "*") return "*";
  return cols.join(", ");
}

function normalizeColName(col) {
  return String(col || "")
    .replace(/["']/g, "")
    .split(".")
    .pop()
    .trim()
    .toLowerCase();
}

function extractMissingColumn(err) {
  const msg = String(err?.message || "");
  const details = String(err?.details || "");
  const hint = String(err?.hint || "");
  const raw = `${msg} ${details} ${hint}`;

  const patterns = [
    /column\s+titles\.(\w+)\s+does not exist/i,
    /column\s+"?(\w+)"?\s+of relation\s+"?titles"?\s+does not exist/i,
    /could not find the ['"](\w+)['"] column/i,
    /column\s+"?(\w+)"?\s+does not exist/i,
  ];

  for (const re of patterns) {
    const m = raw.match(re);
    if (m && m[1]) return normalizeColName(m[1]);
  }

  return "";
}

async function selectWithMissingColumnRetry(runQuery, cols, { maxRetries = 8 } = {}) {
  let colList = splitSelectCols(cols);
  let lastErr = null;

  if (colList.length === 1 && colList[0] === "*") {
    return await runQuery("*");
  }

  for (let i = 0; i <= maxRetries; i++) {
    const res = await runQuery(joinSelectCols(colList));
    if (!res.error) return res;

    lastErr = res.error;

    const missing = extractMissingColumn(res.error);
    if (!missing) break;
    if (missing === "id") break;

    const next = colList.filter((c) => normalizeColName(c) !== missing);
    if (next.length === colList.length) break;
    if (next.length === 0) break;
    colList = next;
  }

  if (lastErr && isMissingColumnError(lastErr)) {
    const resAll = await runQuery("*");
    if (!resAll.error) return resAll;
    lastErr = resAll.error;
  }

  throw lastErr || new Error("Falha ao consultar titles.");
}

/* =========================
   Normalize
========================= */

function normalizeTitle(row, mediaRow, subtitlesRows, { allow4k } = {}) {
  const heroYoutube = firstYouTube(row.hero_youtube);
  const trailerYoutube = firstYouTube(row.trailer_youtube, row.trailer_image_url, row.hero_youtube);

  const trailerImage =
    row.trailer_image_url && !isProbablyYouTube(row.trailer_image_url)
      ? String(row.trailer_image_url).trim()
      : "";

  const pickedHlsKey = pickHlsKey(mediaRow, !!allow4k);

  const heroImageUrl = String(row.hero_image_url || "").trim();
  const thumbUrl = String(row.thumb_url || "").trim();

  // ✅ preview vindo do ingest (R2 privado: normalmente é KEY)
  const heroPreviewUrl = String(row.hero_preview_url || "").trim();
  const heroPreviewPosterUrl = String(row.hero_preview_poster_url || "").trim();

  const durationSecRaw = Number(row?.duration_sec || 0);
  const durationSec = Number.isFinite(durationSecRaw) && durationSecRaw > 0 ? durationSecRaw : 0;

  const bannerImage = heroImageUrl || thumbUrl || "";

  const r2PrefixMedia = safePrefix(mediaRow?.r2_prefix || "");
  const r2PrefixTitle = safePrefix(row?.r2_prefix || "");
  const r2Prefix = r2PrefixMedia || r2PrefixTitle;

  const hlsMasterKey = resolveR2Key(mediaRow?.hls_master_url, r2Prefix);
  const hlsMasterHdKey = resolveR2Key(mediaRow?.hls_master_hd_url, r2Prefix);

  const has4k = mediaRow?.has_4k === true;

  const publicId = row.public_id ? String(row.public_id).trim() : null;
  const dbId = row.id ? String(row.id).trim() : null;

  return {
    id: publicId || dbId,
    publicId,
    dbId,

    media_type: row.media_type || null,
    imdb_id: row.imdb_id || null,
    tmdb_id: row.tmdb_id || null,
    tmdbId: row.tmdb_id || null,
    r2_prefix: row.r2_prefix || null,
    r2_prefix_base: row.r2_prefix_base || null,
    r2PrefixBase: row.r2_prefix_base || null,
    series_id: row.series_id || null,
    seriesId: row.series_id || null,

    // ✅ fundamental para distinguir série vs episódio
    is_series: row?.is_series === true,

    created_at: row.created_at || null,
    status: row.status || null,

    title: row.title,
    year: row.year,
    maturity: String(row.maturity ?? ""),
    duration: row.duration_label || "",
    durationSec,
    synopsis: row.synopsis || "",

    heroImage: heroYoutube || heroImageUrl || thumbUrl || "",
    heroYoutube,

    bannerImage,
    hero_image_url: heroImageUrl || "",
    thumb_url: thumbUrl || "",

    trailer: trailerYoutube,
    trailerYoutube,
    trailerImage,

    thumb: thumbUrl || "",

    // ✅ preview (para o Billboard)
    heroPreviewUrl,
    heroPreviewPosterUrl,
    hero_preview_url: heroPreviewUrl, // compat
    hero_preview_poster_url: heroPreviewPosterUrl, // compat

    // compat
    hlsMasterUrl: pickedHlsKey,
    hlsMasterUrl4k: hlsMasterKey,
    hlsMasterUrlHd: hlsMasterHdKey,

    // explícitos
    r2Prefix,
    hlsMasterKey,
    hlsMasterHdKey,

    has4k,

    subtitles: (subtitlesRows || []).map((s) => ({
      label: s.label,
      lang: s.lang,
      src: s.src,
      default: !!s.is_default,
    })),

    categories: Array.isArray(row.categories) ? row.categories : [],
    tags: Array.isArray(row.tags) ? row.tags : [],

    cast: Array.isArray(row.cast_names) ? row.cast_names : [],
    director: row.director || "",
    creators: Array.isArray(row.creators) ? row.creators : [],

    // ✅ calendário
    in_cinema: row?.in_cinema === true,
    cinesuper_release_at: row?.cinesuper_release_at || null,
  };
}

/* =========================
   DB selects (tolerant)
========================= */

async function safeSelectTitlesPublished() {
  // 1) full (pode quebrar em schema antigo/cache)
  const SELECT_RICH =
    "id, public_id, imdb_id, tmdb_id, media_type, is_series, series_id, r2_prefix, r2_prefix_base, title, year, maturity, duration_label, duration_sec, synopsis, hero_youtube, hero_image_url, trailer_youtube, trailer_image_url, thumb_url, hero_preview_url, hero_preview_poster_url, status, created_at, tags, categories, cast_names, director, creators, in_cinema, cinesuper_release_at";

  const run = async (cols) =>
    supabase.from("titles").select(cols).eq("status", "published").order("created_at", { ascending: false });

  return selectWithMissingColumnRetry(run, SELECT_RICH);
}

/* =========================
   Aggregation: 1 card por série
========================= */

function aggregateSeriesCards(normalizedItems) {
  const out = [];
  const buckets = new Map();

  function normalizeMediaType(v) {
    const mt = String(v || "").trim().toLowerCase();
    if (mt === "curso") return "course";
    return mt;
  }

  function groupKeyFromItem(it, mt) {
    const seriesId = String(it?.seriesId || it?.series_id || "").trim();
    if (seriesId) return `series:${seriesId}`;

    const imdb = String(it?.imdb_id || "").trim().toLowerCase();
    if (mt === "tv" && imdb.startsWith("tt")) return `imdb:${imdb}`;

    const base =
      String(it?.r2_prefix_base || it?.r2PrefixBase || "").trim() ||
      extractSeriesBaseFromPrefix(String(it?.r2_prefix || it?.r2Prefix || "").trim());
    if (base) return `r2:${base.toLowerCase()}`;

    return "";
  }

  for (const it of normalizedItems || []) {
    const mt = normalizeMediaType(it?.media_type);
    const isSeriesLike = mt === "tv" || mt === "course";

    if (!isSeriesLike) {
      out.push(it);
      continue;
    }

    const key = groupKeyFromItem(it, mt);
    if (!key) {
      out.push(it);
      continue;
    }

    const imdb = String(it?.imdb_id || "").trim().toLowerCase();
    const bucket = buckets.get(key) || { seriesRow: null, episodes: [], mt, imdb };

    const isSrId = mt === "tv" && SR_RE.test(String(it?.publicId || it?.id || ""));
    const isSeriesRow = it?.is_series === true || isSrId;

    if (isSeriesRow) bucket.seriesRow = it;
    else bucket.episodes.push(it);

    buckets.set(key, bucket);
  }

  for (const bucket of buckets.values()) {
    if (bucket.seriesRow) {
      out.push({
        ...bucket.seriesRow,
        id: bucket.seriesRow.publicId || bucket.seriesRow.id,
        publicId: bucket.seriesRow.publicId || bucket.seriesRow.id,
        seriesCard: true,
        seriesImdbId: bucket.mt === "tv" ? bucket.imdb : null,
      });
      continue;
    }

    if (bucket.mt === "course") {
      out.push(...bucket.episodes);
      continue;
    }

    const rep = pickRepresentativeEpisode(bucket.episodes);
    if (!rep) continue;

    const seriesId = buildSeriesPublicIdFromImdb(bucket.imdb || "");
    out.push({
      ...rep,
      id: seriesId,
      publicId: seriesId,
      seriesCard: true,
      seriesImdbId: bucket.imdb || "",
    });
  }

  return out;
}

let HAS_IN_CINEMA_COL = true;

async function safeSelectTitlesDraftCalendar() {
  const SELECT_RICH =
    "id, public_id, imdb_id, tmdb_id, media_type, is_series, series_id, r2_prefix, r2_prefix_base, title, year, maturity, duration_label, duration_sec, synopsis, hero_youtube, hero_image_url, trailer_youtube, trailer_image_url, thumb_url, hero_preview_url, hero_preview_poster_url, status, created_at, tags, categories, cast_names, director, creators, in_cinema, cinesuper_release_at";

  if (!HAS_IN_CINEMA_COL) return { data: [], error: null };

  const run = async (cols) =>
    supabase
      .from("titles")
      .select(cols)
      .eq("status", "draft")
      .eq("in_cinema", true)
      .order("created_at", { ascending: false });

  try {
    return await selectWithMissingColumnRetry(run, SELECT_RICH);
  } catch (e) {
    const missing = extractMissingColumn(e);
    if (missing === "in_cinema" || isMissingColumnError(e, "in_cinema")) {
      HAS_IN_CINEMA_COL = false;
      return { data: [], error: null };
    }
    return { data: [], error: null };
  }
}

/* =========================
   Public API
========================= */

export async function fetchCatalog({ allow4k = true, includeDraftCalendar = false } = {}) {
  const { data: titles, error: e1 } = await safeSelectTitlesPublished();
  if (e1) throw e1;

  let draftTitles = [];
  if (includeDraftCalendar) {
    const { data: drafts } = await safeSelectTitlesDraftCalendar();
    draftTitles = Array.isArray(drafts) ? drafts : [];
  }

  const allTitles = [...(titles || []), ...(draftTitles || [])];
  if (!allTitles.length) return [];

  const ids = allTitles.map((t) => t.id);

  const { data: medias, error: e2 } = await supabase
    .from("media_assets")
    .select("title_id, hls_master_url, hls_master_hd_url, r2_prefix, has_4k, created_at")
    .in("title_id", ids)
    .order("created_at", { ascending: false });

  if (e2) throw e2;

  const { data: subs, error: e3 } = await supabase
    .from("subtitles")
    .select("title_id, label, lang, src, is_default")
    .in("title_id", ids)
    .order("is_default", { ascending: false });

  if (e3) throw e3;

  const mediaByTitle = new Map();
  for (const m of medias || []) {
    if (!mediaByTitle.has(m.title_id)) mediaByTitle.set(m.title_id, m);
  }

  const subsByTitle = new Map();
  for (const s of subs || []) {
    const arr = subsByTitle.get(s.title_id) || [];
    arr.push(s);
    subsByTitle.set(s.title_id, arr);
  }

  const normalized = (allTitles || []).map((t) =>
    normalizeTitle(t, mediaByTitle.get(t.id), subsByTitle.get(t.id), { allow4k })
  );

  return aggregateSeriesCards(normalized);
}

export async function fetchTitleById(
  idOrPublicId,
  { allow4k = true, includeDraftCalendar = false } = {}
) {
  const value = String(idOrPublicId || "").trim();
  if (!value) return null;

  // ✅ caso especial: abrir série agregada (sr-XXXXXXXX)
  if (SR_RE.test(value)) {
    const imdb = seriesPublicIdToImdbId(value);
    if (!imdb) return null;

    const SELECT_RICH =
      "id, public_id, imdb_id, tmdb_id, media_type, is_series, series_id, r2_prefix, r2_prefix_base, title, year, maturity, duration_label, duration_sec, synopsis, hero_youtube, hero_image_url, trailer_youtube, trailer_image_url, thumb_url, hero_preview_url, hero_preview_poster_url, status, created_at, tags, categories, cast_names, director, creators, in_cinema, cinesuper_release_at";

    async function tryGetSeriesRow() {
      const run = (cols) =>
        supabase.from("titles").select(cols).eq("status", "published").eq("public_id", value).maybeSingle();
      return selectWithMissingColumnRetry(run, SELECT_RICH);
    }

    let row = null;

    try {
      const r = await tryGetSeriesRow();
      if (r.error) throw r.error;
      row = r.data || null;
    } catch {
      row = null;
    }

    // fallback: S01E01
    if (!row) {
      const run = (cols) =>
        supabase
          .from("titles")
          .select(cols)
          .eq("status", "published")
          .eq("media_type", "tv")
          .eq("imdb_id", imdb);

      const { data } = await selectWithMissingColumnRetry(run, SELECT_RICH);
      row = pickRepresentativeEpisode(data || []);
    }

    if (!row) return null;

    const rep = normalizeTitle(row, null, [], { allow4k });

    return {
      ...rep,
      id: value,
      publicId: value,
      seriesCard: true,
      seriesImdbId: imdb,
      is_series: true,
    };
  }

  // ✅ normal (ep-/mv-... ou UUID)
  const SELECT_RICH =
    "id, public_id, imdb_id, tmdb_id, media_type, is_series, series_id, r2_prefix, r2_prefix_base, title, year, maturity, duration_label, duration_sec, synopsis, hero_youtube, hero_image_url, trailer_youtube, trailer_image_url, thumb_url, hero_preview_url, hero_preview_poster_url, status, tags, categories, cast_names, director, creators, in_cinema, cinesuper_release_at";

  async function getByPublicId(cols) {
    return supabase.from("titles").select(cols).eq("status", "published").eq("public_id", value).maybeSingle();
  }

  async function getByUuid(cols) {
    if (!UUID_RE.test(value)) return { data: null, error: null, status: 200 };
    return supabase.from("titles").select(cols).eq("status", "published").eq("id", value).maybeSingle();
  }

  async function getByPublicIdDraft(cols) {
    return supabase
      .from("titles")
      .select(cols)
      .eq("status", "draft")
      .eq("in_cinema", true)
      .eq("public_id", value)
      .maybeSingle();
  }

  async function getByUuidDraft(cols) {
    if (!UUID_RE.test(value)) return { data: null, error: null, status: 200 };
    return supabase
      .from("titles")
      .select(cols)
      .eq("status", "draft")
      .eq("in_cinema", true)
      .eq("id", value)
      .maybeSingle();
  }

  async function safeGet(getterFn) {
    try {
      return await selectWithMissingColumnRetry(getterFn, SELECT_RICH);
    } catch (e) {
      const missing = extractMissingColumn(e);
      if (missing === "in_cinema" || isMissingColumnError(e, "in_cinema")) {
        HAS_IN_CINEMA_COL = false;
        return { data: null, error: null, status: 200 };
      }
      throw e;
    }
  }

  let row = null;

  // 1) tenta public_id
  {
    const r = await safeGet(getByPublicId);
    if (r.error) throw r.error;
    row = r.data;
  }

  // 2) tenta UUID
  if (!row) {
    const r = await safeGet(getByUuid);
    if (r.error) throw r.error;
    row = r.data;
  }

  // 3) ✅ fallback: draft do calendário (em cinema)
  if (!row && includeDraftCalendar) {
    const r = await safeGet(getByPublicIdDraft);
    if (r.error) throw r.error;
    row = r.data;
  }

  if (!row && includeDraftCalendar) {
    const r = await safeGet(getByUuidDraft);
    if (r.error) throw r.error;
    row = r.data;
  }

  if (!row) return null;

  const { data: mediaRows, error: e3 } = await supabase
    .from("media_assets")
    .select("title_id, hls_master_url, hls_master_hd_url, r2_prefix, has_4k, created_at")
    .eq("title_id", row.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (e3) throw e3;
  const mediaRow = mediaRows?.[0] || null;

  const { data: subtitlesRows, error: e4 } = await supabase
    .from("subtitles")
    .select("title_id, label, lang, src, is_default")
    .eq("title_id", row.id)
    .order("is_default", { ascending: false });

  if (e4) throw e4;

  return normalizeTitle(row, mediaRow, subtitlesRows, { allow4k });
}

// stubs
export async function fetchSeasonEpisodes() {
  return [];
}
export async function fetchContinueWatching() {
  return [];
}
