// src/pages/admin/AdminTitleEdit.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import TopNav from "../../components/layout/TopNav.jsx";
import Footer from "../../components/layout/Footer.jsx";
import Container from "../../components/layout/Container.jsx";
import { supabase } from "../../lib/supabaseClient.js";
import { tmdbEnrichByImdb } from "../../lib/tmdbClient.js";

/* =========================
   Helpers
========================= */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ✅ OMDb API Key fixo (fica público no front-end; OMDb key é low-stakes)
const OMDB_API_KEY = "49e1a2d9";
const COVER_BUCKET = String(import.meta.env.VITE_TITLE_ASSETS_BUCKET || "titles").trim();
const MAX_COVER_MB = 8;
const GENRES = [
  "Ação",
  "Aventura",
  "Animacao",
  "Anime",
  "Brasileiros",
  "Clássicos",
  "Comédia stand-up",
  "Comédias",
  "Curtas",
  "Documentários",
  "Drama",
  "Esportes",
  "Estrangeiros",
  "Fantasia",
  "Fé e espiritualidade",
  "Gospel",
  "Ficção cientifica",
  "Hollywood",
  "Independentes",
  "Música e musicais",
  "Policial",
  "Romance",
  "Suspense",
  "Terror",
];

// Observação importante:
// "cast" é palavra reservada no Postgres. Então, se você criar coluna para elenco,
// use "cast_names" (text[]) em vez de "cast".
const SELECT_BASE =
  "id, public_id, status, imdb_id, tmdb_id, media_type, title, year, maturity, duration_label, synopsis, thumb_url, hero_image_url, hero_youtube";

const SELECT_WITH_TAGS_CATS = `${SELECT_BASE}, tags, categories`;

const SELECT_WITH_PEOPLE = `${SELECT_WITH_TAGS_CATS}, cast_names, director, creators`;

function splitList(v) {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinList(arr) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

function numOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toDateInputValue(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dt = new Date(s);
  if (!Number.isFinite(dt.getTime())) return "";
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function hasCinemaFlag(cats, tags) {
  const all = [...(cats || []), ...(tags || [])].map((x) => String(x || "").trim().toLowerCase());
  return all.includes("cinema") || all.includes("em cinema") || all.includes("nos cinemas") || all.includes("no cinema");
}

function maturityColor(m) {
  const s = String(m || "").trim();
  if (s === "L" || s === "0")
    return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
  const n = Number(s);
  if (Number.isFinite(n)) {
    if (n >= 18) return "bg-red-500/15 text-red-200 border-red-400/20";
    if (n >= 16) return "bg-orange-500/15 text-orange-200 border-orange-400/20";
    if (n >= 14) return "bg-yellow-500/15 text-yellow-200 border-yellow-400/20";
    if (n >= 12) return "bg-lime-500/15 text-lime-200 border-lime-400/20";
    if (n >= 10) return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
  }
  return "bg-white/10 text-white/80 border-white/10";
}

/* =========================
   public_id generator (IMDb -> OMDb Type -> public_id)
   Padrão:
   - movie  => mv-XXXXXXXX
   - series => sr-XXXXXXXX
   - episode=> ep-XXXXXXXX-s01e02  (XXXXXXXX = dígitos do IMDb da SÉRIE, padded 8)
========================= */

function extractImdbId(any) {
  const m = String(any || "").match(/tt\d{7,8}/i);
  return m ? m[0].toLowerCase() : null;
}

function onlyDigits(imdbId) {
  return String(imdbId || "").replace(/^tt/i, "");
}

function pad8(n) {
  return String(n || "").padStart(8, "0");
}

function pad2(n) {
  return String(n || "").padStart(2, "0");
}

function getExtFromFile(file) {
  const name = String(file?.name || "");
  const m = name.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || "jpg").toLowerCase();
}

function isImage(file) {
  return !!file && String(file.type || "").startsWith("image/");
}

function safeKeyPart(v) {
  const s = String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "item";
}

function setPreviewObject(ref, setter, file) {
  if (ref.current) {
    try {
      URL.revokeObjectURL(ref.current);
    } catch {}
    ref.current = "";
  }
  if (!file) {
    setter("");
    return;
  }
  const url = URL.createObjectURL(file);
  ref.current = url;
  setter(url);
}

function normalizeModuleName(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^m[oó]dulo\b/i.test(raw)) return raw;
  return `Modulo ${raw}`;
}

function buildR2Path({ genre, type, title, season, episode }) {
  const g = String(genre || "").trim();
  const t = String(title || "").trim();
  if (!g || !t) return "";

  const tipo = type === "series" ? "Séries" : type === "course" ? "Curso" : "Filmes";
  let out = `${g}/${tipo}/${t}`;

  if (type === "series") {
    const s = String(season || 1).padStart(2, "0");
    const e = String(episode || 1).padStart(2, "0");
    out += `/Temporada ${s}/Episodio ${e}`;
  } else if (type === "course") {
    const m = normalizeModuleName(season || "01");
    const e = String(episode || 1).padStart(2, "0");
    out += `/${m}/Episodio ${e}`;
  }

  return out;
}

function buildR2BasePrefix({ genre, type }) {
  const g = String(genre || "").trim();
  if (!g) return "";
  const tipo = type === "series" ? "Séries" : type === "course" ? "Curso" : "Filmes";
  return `${g}/${tipo}/`;
}

function buildR2TitlePrefix({ genre, type, title }) {
  const g = String(genre || "").trim();
  const t = String(title || "").trim();
  if (!g || !t) return "";
  const tipo = type === "series" ? "Séries" : type === "course" ? "Curso" : "Filmes";
  return `${g}/${tipo}/${t}/`;
}

function buildCoursePublicIdFromUuid(uuid) {
  const digits = String(uuid || "").replace(/\D+/g, "");
  const tail = digits.slice(-8).padStart(8, "0");
  return `cr-${tail}`;
}

function buildPublicId(kind, imdbDigits8, season, episode) {
  if (kind === "movie") return `mv-${imdbDigits8}`;
  if (kind === "series") return `sr-${imdbDigits8}`;

  const s = season ? pad2(season) : "01";
  const e = episode ? pad2(episode) : "01";
  return `ep-${imdbDigits8}-s${s}e${e}`;
}

async function omdbFetchById(imdbId) {
  const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(
    OMDB_API_KEY
  )}&i=${encodeURIComponent(imdbId)}&r=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OMDb HTTP ${res.status}`);
  const json = await res.json();
  if (json?.Response === "False") throw new Error(json?.Error || "OMDb sem resposta.");
  return json;
}

/* =========================
   OMDb parsing helpers (fallback)
========================= */

function parseYearAny(y) {
  const m = String(y || "").match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : "";
}

function parseRuntimeToMinutes(runtime) {
  // OMDb: "142 min"
  const m = String(runtime || "").match(/(\d+)\s*min/i);
  return m ? Number(m[1]) : null;
}

function minutesToLabel(mins) {
  const n = Number(mins);
  if (!Number.isFinite(n) || n <= 0) return "";
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function splitCleanCsv(v) {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\s*\(.*?\)\s*/g, "").trim())
    .filter(Boolean);
}

/**
 * Mapeamento simples (prático) de Rated (OMDb) -> classificação numérica
 * Ajuste se quiser um mapeamento BR mais rigoroso.
 */
function mapOmdbRatedToMaturity(rated) {
  const r = String(rated || "").trim().toUpperCase();
  if (!r || r === "N/A" || r === "NOT RATED" || r === "UNRATED") return null;

  // TV
  if (r === "TV-MA") return "18";
  if (r === "TV-14") return "14";
  if (r === "TV-PG") return "10";
  if (r === "TV-G" || r === "TV-Y" || r === "TV-Y7") return "L";

  // Movies (EUA)
  if (r === "NC-17") return "18";
  if (r === "R") return "16";
  if (r === "PG-13") return "12";
  if (r === "PG") return "10";
  if (r === "G") return "L";

  // Outros heurísticos
  if (r.includes("18")) return "18";
  if (r.includes("16")) return "16";
  if (r.includes("14")) return "14";
  if (r.includes("12")) return "12";
  if (r.includes("10")) return "10";

  return null;
}

/**
 * SELECT tolerante: tenta:
 * 1) com cast/director/creators
 * 2) com tags/categories
 * 3) base
 */
async function safeSelectTitlesBy(sb, whereFn) {
  const tries = [SELECT_WITH_PEOPLE, SELECT_WITH_TAGS_CATS, SELECT_BASE];

  let lastErr = null;

  for (const cols of tries) {
    const q = whereFn(sb.from("titles").select(cols));
    const res = await q;

    if (!res.error) return res;

    const msg = String(res.error?.message || "");
    lastErr = res.error;

    // Se for erro de coluna inexistente, tenta o próximo SELECT.
    if (msg.includes("does not exist")) continue;

    // Se for qualquer outro erro, para aqui.
    throw res.error;
  }

  // Se chegou aqui, falhou em todas as tentativas.
  if (lastErr) throw lastErr;
  return { data: null, error: new Error("Falha ao consultar titles.") };
}

/**
 * Busca 1 linha por public_id (mesmo se tiver duplicado), pegando o mais recente.
 */
async function getTitleByPublicId(sb, publicId) {
  const v = String(publicId || "").trim();
  if (!v) return null;

  const res = await safeSelectTitlesBy(sb, (q) =>
    q.eq("public_id", v).order("created_at", { ascending: false }).limit(1)
  );

  return res.data?.[0] || null;
}

/**
 * Busca 1 linha por uuid.
 */
async function getTitleByUuid(sb, uuid) {
  const v = String(uuid || "").trim();
  if (!v) return null;

  const res = await safeSelectTitlesBy(sb, (q) => q.eq("id", v).limit(1));
  return res.data?.[0] || null;
}

/**
 * Resolve UUID real do título para salvar (tolerante a duplicidade).
 */
async function resolveTitleUuid(idOrPublicId, sb) {
  const v = String(idOrPublicId || "").trim();
  if (!v) return null;

  if (UUID_RE.test(v)) return v;

  const row = await getTitleByPublicId(sb, v);
  return row?.id || null;
}

/**
 * ✅ Upsert de media_assets pelo title_id com 2 links:
 * - hls_master_url     (master com 1080 + 4K)
 * - hls_master_hd_url  (master-hd só 1080)
 *
 * Se não houver unique constraint em title_id, cai para update/insert manual (mais recente).
 */
async function upsertMediaAsset(sb, titleUuid, hlsUrl, hlsHdUrl) {
  const rawHls = String(hlsUrl || "").trim();
  const rawHd = String(hlsHdUrl || "").trim();

  // ✅ se não há nenhum HLS, não tenta gravar (evita NOT NULL)
  if (!rawHls && !rawHd) return;

  // ✅ garante hls_master_url não-nulo (usa HD como fallback)
  const hls = rawHls || rawHd;
  const hlsHd = rawHd || rawHls;

  const tryUpsert = await sb
    .from("media_assets")
    .upsert(
      { title_id: titleUuid, hls_master_url: hls, hls_master_hd_url: hlsHd },
      { onConflict: "title_id" }
    );

  if (!tryUpsert.error) return;

  const msg = String(tryUpsert.error?.message || "");
  const noConstraint = msg.includes("no unique or exclusion constraint");

  if (!noConstraint) throw tryUpsert.error;

  // fallback manual (pega o mais recente)
  const { data: existing, error: e1 } = await sb
    .from("media_assets")
    .select("id, title_id")
    .eq("title_id", titleUuid)
    .order("created_at", { ascending: false })
    .limit(1);

  if (e1) throw e1;

  if (existing?.[0]?.id) {
    const { error: eUp } = await sb
      .from("media_assets")
      .update({ hls_master_url: hls, hls_master_hd_url: hlsHd })
      .eq("id", existing[0].id);

    if (eUp) throw eUp;
  } else {
    const { error: eIns } = await sb
      .from("media_assets")
    .insert({ title_id: titleUuid, hls_master_url: hls, hls_master_hd_url: hlsHd });

    if (eIns) throw eIns;
  }
}

/**
 * Remove do payload campos que não existem no banco e tenta novamente (até N tentativas).
 * Ex: "column titles.categories does not exist" -> remove categories.
 */
async function retryWithoutMissingColumns(opFn, payload, maxRetries = 6) {
  let p = { ...payload };

  for (let i = 0; i <= maxRetries; i++) {
    const { data, error } = await opFn(p);

    if (!error) return { data, error: null, payloadUsed: p };

    const msg = String(error?.message || "");

    // tenta capturar o nome da coluna do erro
    const m1 = msg.match(/column\s+titles\.(\w+)\s+does not exist/i);
    const m2 = msg.match(/column\s+"(\w+)"\s+of relation\s+"titles"\s+does not exist/i);
    const missingCol = (m1 && m1[1]) || (m2 && m2[1]) || null;

    if (missingCol && Object.prototype.hasOwnProperty.call(p, missingCol)) {
      const next = { ...p };
      delete next[missingCol];
      p = next;
      continue;
    }

    // tags/categories às vezes vêm como mensagem genérica
    if (msg.includes("does not exist")) {
      const next = { ...p };
      delete next.tags;
      delete next.categories;
      delete next.cast_names;
      delete next.director;
      delete next.creators;
      p = next;
      continue;
    }

    throw error;
  }

  // Se esgotou tentativas, retorna o último erro
  const { data, error } = await opFn(p);
  return { data, error, payloadUsed: p };
}

/* =========================
   Page
========================= */

export default function AdminTitleEdit() {
  const { id } = useParams(); // "new", public_id, ou uuid
  const isNew = id === "new";
  const nav = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingPid, setGeneratingPid] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [row, setRow] = useState(null);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const thumbInputRef = useRef(null);
  const heroInputRef = useRef(null);
  const [thumbPreviewUrl, setThumbPreviewUrl] = useState("");
  const [heroPreviewUrl, setHeroPreviewUrl] = useState("");
  const thumbPreviewRef = useRef("");
  const heroPreviewRef = useRef("");
  const [r2Builder, setR2Builder] = useState({
    genre: "",
    type: "movie",
    title: "",
    season: "",
    episode: "",
  });
  const [r2Titles, setR2Titles] = useState([]);
  const [r2Modules, setR2Modules] = useState([]);
  const [r2Loading, setR2Loading] = useState(false);
  const [r2ModulesLoading, setR2ModulesLoading] = useState(false);
  const [r2Error, setR2Error] = useState("");
  const [coursePendingId, setCoursePendingId] = useState("");
  const prefillRef = useRef(false);

  const [form, setForm] = useState({
    public_id: "",
    status: "draft",

    imdb_id: "",
    tmdb_id: null,
    media_type: "",

    title: "",
    year: "",
    maturity: "14",
    duration_label: "",
    synopsis: "",

    thumb_url: "",
    hero_image_url: "",
    hero_youtube: "",

    tagsCsv: "",
    categoriesCsv: "",

    // ✅ novos (opcionais; só funcionam se você criar colunas no banco)
    castCsv: "",
    director: "",
    creatorsCsv: "",

    // ✅ HLS (2 links)
    hls_master_url: "",
    hls_master_hd_url: "",

    // ✅ opcionais para episode
    season: "",
    episode: "",

    // ✅ calendário (opcional)
    calendar_enabled: false,
    calendar_date: "",
  });

  const maturityBadge = useMemo(() => maturityColor(form.maturity), [form.maturity]);

  async function loadExisting() {
    setLoading(true);
    setErr("");
    setMsg("");

    try {
      if (isNew) {
        setRow(null);
        setForm((f) => ({ ...f, status: "draft" }));
        return;
      }

      // tenta por public_id primeiro (mais comum), senão por uuid
      let data = await getTitleByPublicId(supabase, id);
      if (!data) data = await getTitleByUuid(supabase, id);

      if (!data) {
        setErr("Título não encontrado.");
        return;
      }

      // media_assets (HLS) — pega o mais recente para evitar erro em maybeSingle() se houver duplicado
      const { data: mediaRow, error: eMedia } = await supabase
        .from("media_assets")
        .select("hls_master_url, hls_master_hd_url")
        .eq("title_id", data.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (eMedia) throw eMedia;

      // ✅ campos opcionais de calendário (se existirem no banco)
      let calendarEnabled = false;
      let calendarDate = "";
      try {
        const { data: calRow, error: calErr } = await supabase
          .from("titles")
          .select(
            "id, in_cinema, cinesuper_release_at, cinesuper_release_date, cs_release_at, release_at, coming_at, coming_to_cinesuper_at, coming_to_cinesuper_date"
          )
          .eq("id", data.id)
          .maybeSingle();

        if (!calErr && calRow) {
          calendarEnabled = !!calRow.in_cinema || hasCinemaFlag(data.categories, data.tags);
          const rawDate =
            calRow.cinesuper_release_at ||
            calRow.cinesuper_release_date ||
            calRow.cs_release_at ||
            calRow.release_at ||
            calRow.coming_at ||
            calRow.coming_to_cinesuper_at ||
            calRow.coming_to_cinesuper_date ||
            "";
          calendarDate = toDateInputValue(rawDate);
        } else {
          calendarEnabled = hasCinemaFlag(data.categories, data.tags);
        }
      } catch {
        calendarEnabled = hasCinemaFlag(data.categories, data.tags);
      }

      setRow(data);
      setForm((prev) => ({
        ...prev,
        public_id: data.public_id || "",
        status: data.status || "draft",

        imdb_id: data.imdb_id || "",
        tmdb_id: data.tmdb_id ?? null,
        media_type: data.media_type || "",

        title: data.title || "",
        year: data.year ? String(data.year) : "",
        maturity: data.maturity != null ? String(data.maturity) : "14",
        duration_label: data.duration_label || "",
        synopsis: data.synopsis || "",

        thumb_url: data.thumb_url || "",
        hero_image_url: data.hero_image_url || "",
        hero_youtube: data.hero_youtube || "",

        tagsCsv: joinList(data.tags),
        categoriesCsv: joinList(data.categories),

        // ✅ novos (se existirem no SELECT)
        castCsv: joinList(data.cast_names),
        director: data.director || "",
        creatorsCsv: joinList(data.creators),

        // ✅ HLS (2 links)
        hls_master_url: mediaRow?.hls_master_url || "",
        hls_master_hd_url: mediaRow?.hls_master_hd_url || "",

        // ✅ calendário
        calendar_enabled: calendarEnabled,
        calendar_date: calendarDate,
      }));
    } catch (e) {
      setErr(e?.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!isNew || prefillRef.current) return;
    const params = new URLSearchParams(location.search || "");
    const gospel = params.get("gospel");
    const typeParam = String(params.get("type") || "").trim().toLowerCase();

    if (gospel === "1" || gospel === "true") {
      setForm((f) => {
        const list = splitList(f.categoriesCsv);
        const has = list.some((c) => c.toLowerCase() === "gospel");
        return has ? f : { ...f, categoriesCsv: joinList([...list, "Gospel"]) };
      });
      setR2Builder((p) => ({ ...p, genre: p.genre || "Gospel" }));
    }

    if (typeParam === "movie" || typeParam === "course" || typeParam === "series") {
      setForm((f) => ({ ...f, media_type: typeParam }));
      if (typeParam === "course" || typeParam === "series" || typeParam === "movie") {
        setR2Builder((p) => ({ ...p, type: typeParam === "series" ? "series" : typeParam }));
      }
    }

    prefillRef.current = true;
  }, [isNew, location.search]);

  useEffect(() => {
    return () => {
      setPreviewObject(thumbPreviewRef, setThumbPreviewUrl, null);
      setPreviewObject(heroPreviewRef, setHeroPreviewUrl, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setR2Builder((prev) => {
      const next = { ...prev };

      if (!next.title && form.title) next.title = String(form.title || "").trim();

      if (!next.type) {
        const mt = String(form.media_type || "").toLowerCase();
        if (mt === "tv" || mt === "series") next.type = "series";
        else if (mt === "course" || mt === "curso") next.type = "course";
        else if (mt === "movie" || mt === "film") next.type = "movie";
      }

      if (!next.season && form.season) next.season = String(form.season || "").trim();
      if (!next.episode && form.episode) next.episode = String(form.episode || "").trim();

      return next;
    });
  }, [form.title, form.media_type, form.season, form.episode]);

  useEffect(() => {
    setR2Modules([]);
  }, [r2Builder.genre, r2Builder.type, r2Builder.title]);

  function buildPayload(nextStatus) {
    return {
      public_id: String(form.public_id || "").trim() || null,
      status: nextStatus || form.status || "draft",

      imdb_id: String(form.imdb_id || "").trim() || null,
      tmdb_id: form.tmdb_id ?? null,
      media_type: String(form.media_type || "").trim() || null,

      title: String(form.title || "").trim() || null,
      year: numOrNull(form.year),
      maturity: String(form.maturity || "").trim() || null,
      duration_label: String(form.duration_label || "").trim() || null,
      synopsis: String(form.synopsis || "").trim() || null,

      thumb_url: String(form.thumb_url || "").trim() || null,
      hero_image_url: String(form.hero_image_url || "").trim() || null,
      hero_youtube: String(form.hero_youtube || "").trim() || null,

      tags: splitList(form.tagsCsv),
      categories: splitList(form.categoriesCsv),

      // ✅ novos (se as colunas existirem)
      cast_names: splitList(form.castCsv),
      director: String(form.director || "").trim() || null,
      creators: splitList(form.creatorsCsv),

      // ✅ calendário
      in_cinema: !!form.calendar_enabled,
      cinesuper_release_at: form.calendar_date ? String(form.calendar_date).trim() : null,
    };
  }

  async function insertTitle(payload) {
    return await supabase.from("titles").insert(payload).select("id, public_id, status");
  }

  async function updateTitle(titleUuid, payload) {
    return await supabase
      .from("titles")
      .update(payload)
      .eq("id", titleUuid)
      .select("id, public_id, status");
  }

    async function onSave(publish) {
      setSaving(true);
      setErr("");
      setMsg("");

      try {
        const pid = String(form.public_id || "").trim();
        const mt = String(form.media_type || "").trim().toLowerCase();
        const isCourse = mt === "course" || mt === "curso";
        let nextPublicId = pid;
        let nextCourseId = coursePendingId;

        if (isCourse && isNew) {
          if (!nextCourseId && !nextPublicId) {
            const genId = crypto.randomUUID();
            nextCourseId = genId;
            nextPublicId = buildCoursePublicIdFromUuid(genId);
            setCoursePendingId(genId);
            setForm((f) => ({ ...f, media_type: "course", public_id: nextPublicId }));
          } else if (nextCourseId && !nextPublicId) {
            nextPublicId = buildCoursePublicIdFromUuid(nextCourseId);
            setForm((f) => ({ ...f, media_type: "course", public_id: nextPublicId }));
          }
        }

        if (isNew && !nextPublicId && !isCourse) {
          throw new Error("Informe um public_id (ex: mv-00001234) antes de salvar.");
        }

        const nextStatus = publish ? "published" : form.status || "draft";
        const payload = buildPayload(nextStatus);
        if (isCourse && isNew) {
          if (nextCourseId) payload.id = nextCourseId;
          if (!payload.public_id && nextPublicId) payload.public_id = nextPublicId;
        }

        // CREATE
        if (isNew) {
        const { data, error } = await retryWithoutMissingColumns((p) => insertTitle(p), payload);

        if (error) throw error;

        const saved = data?.[0] || null;
        if (!saved?.id) throw new Error("Falha ao criar: Supabase retornou vazio.");

        if (isCourse && !saved?.public_id) {
          const crPid = buildCoursePublicIdFromUuid(saved.id);
          const up = await supabase.from("titles").update({ public_id: crPid }).eq("id", saved.id).select("public_id");
          if (!up.error && up.data?.[0]?.public_id) saved.public_id = up.data[0].public_id;
        }

        await upsertMediaAsset(
          supabase,
          saved.id,
          form.hls_master_url,
          form.hls_master_hd_url
        );

        setRow((prev) => ({
          ...(prev || {}),
          id: saved.id,
          public_id: saved.public_id,
          status: saved.status,
        }));
        setMsg(publish ? "Título criado e publicado." : "Título criado e salvo.");

        nav(`/admin/titles/${saved.public_id || saved.id}`, { replace: true });
        return;
      }

      // UPDATE
      const titleUuid =
        row?.id ||
        (await resolveTitleUuid(id, supabase)) ||
        (pid ? await resolveTitleUuid(pid, supabase) : null);

      if (!titleUuid) {
        throw new Error(
          "Não encontrei o título para salvar. Provável causa: public_id duplicado ou o item não existe."
        );
      }

      const { data, error } = await retryWithoutMissingColumns((p) => updateTitle(titleUuid, p), payload);

      if (error) throw error;

      const saved = data?.[0] || null;

      if (!saved?.id) {
        throw new Error("Nada foi atualizado. Possíveis causas: RLS bloqueando update (403/406) ou id inválido.");
      }

      if (isCourse && !saved?.public_id) {
        const crPid = buildCoursePublicIdFromUuid(saved.id);
        const up = await supabase.from("titles").update({ public_id: crPid }).eq("id", saved.id).select("public_id");
        if (!up.error && up.data?.[0]?.public_id) saved.public_id = up.data[0].public_id;
      }

      await upsertMediaAsset(
        supabase,
        saved.id,
        form.hls_master_url,
        form.hls_master_hd_url
      );

      setRow((prev) => ({
        ...(prev || {}),
        id: saved.id,
        public_id: saved.public_id,
        status: saved.status,
      }));
      setMsg(publish ? "Alterações salvas e publicado." : "Alterações salvas.");

      if (saved?.public_id && !UUID_RE.test(id) && saved.public_id !== id) {
        nav(`/admin/titles/${saved.public_id}`, { replace: true });
      }
    } catch (e) {
      setErr(e?.message || "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onGeneratePublicId() {
    setGeneratingPid(true);
    setErr("");
    setMsg("");

      try {
        const mt = String(form.media_type || "").trim().toLowerCase();
        const isCourse = mt === "course" || mt === "curso";
        if (isCourse) {
          let baseId = row?.id || (UUID_RE.test(id) ? id : "") || coursePendingId;
          if (!baseId) {
            baseId = crypto.randomUUID();
          }
          if (isNew) setCoursePendingId(baseId);
          const publicId = buildCoursePublicIdFromUuid(baseId);
          setForm((f) => ({
            ...f,
            media_type: "course",
            public_id: publicId,
          }));
          setMsg(`public_id gerado: ${publicId}`);
          return;
        }

      const raw = String(form.imdb_id || "").trim();
      const imdb = extractImdbId(raw);

      if (!imdb) {
        throw new Error("Informe um IMDB ID (tt12345678) ou cole um link do IMDb no campo IMDB.");
      }

      const info = await omdbFetchById(imdb);
      const type = String(info?.Type || "").toLowerCase(); // movie | series | episode

      const imdbDigits8 = pad8(onlyDigits(imdb));

      let publicId = "";
      let extra = "";

      if (type === "movie") {
        publicId = buildPublicId("movie", imdbDigits8);
      } else if (type === "series") {
        publicId = buildPublicId("series", imdbDigits8);

        // Se usuário informou season/episode, já sugere também o ep-...
        const season = numOrNull(form.season);
        const episode = numOrNull(form.episode);
        if (season && episode) {
          const epPid = buildPublicId("episode", imdbDigits8, season, episode);
          extra = ` (episódio sugerido: ${epPid})`;
        }
      } else if (type === "episode") {
        const seriesId = (info?.seriesID || info?.SeriesID || "").toString().trim();
        const base = pad8(onlyDigits(seriesId || imdb));

        // OMDb costuma devolver Season/Episode quando é episódio
        const season = numOrNull(info?.Season) ?? numOrNull(form.season) ?? 1;
        const episode = numOrNull(info?.Episode) ?? numOrNull(form.episode) ?? 1;

        publicId = buildPublicId("episode", base, season, episode);
        extra = seriesId ? ` (seriesID: ${seriesId})` : "";
      } else {
        // fallback seguro
        publicId = buildPublicId("movie", imdbDigits8);
        extra = " (tipo não detectado pela OMDb; usando fallback de filme)";
      }

      setForm((f) => ({
        ...f,
        imdb_id: imdb, // normaliza
        media_type: type || f.media_type,
        public_id: publicId,
      }));

      setMsg(`public_id gerado: ${publicId}${extra}`);
    } catch (e) {
      setErr(e?.message || "Falha ao gerar public_id.");
    } finally {
      setGeneratingPid(false);
    }
  }

  // ✅ ATUALIZADO: TMDB + fallback OMDb (classificação, duração, elenco, criadores)
  async function onEnrichTmdb() {
    setSaving(true);
    setErr("");
    setMsg("");

    try {
      const imdb = String(form.imdb_id || "").trim();
      if (!imdb || !imdb.startsWith("tt")) throw new Error("Informe um IMDB ID válido. Ex: tt4574334");

      // TMDB + OMDb em paralelo (OMDb serve como fallback para rating/runtime/people)
      const [res, omdb] = await Promise.all([tmdbEnrichByImdb(imdb), omdbFetchById(imdb)]);

      // ---- Fallbacks do OMDb
      const omdbYear = parseYearAny(omdb?.Year);
      const omdbMaturity = mapOmdbRatedToMaturity(omdb?.Rated);
      const omdbRuntimeMin = parseRuntimeToMinutes(omdb?.Runtime);
      const omdbDurationLabel = minutesToLabel(omdbRuntimeMin);

      const omdbCast = splitCleanCsv(omdb?.Actors);
      const omdbDirector = String(omdb?.Director || "").trim();
      const omdbCreators = splitCleanCsv(omdb?.Writer);

      // ---- Preferências: TMDB primeiro, se não vier, usa OMDb
      const pickedMaturity =
        (res.data?.certification_br != null ? String(res.data.certification_br) : null) ||
        (res.data?.maturity != null ? String(res.data.maturity) : null) ||
        (res.data?.certification != null ? String(res.data.certification) : null) ||
        omdbMaturity ||
        null;

      const pickedDurationLabel =
        (res.data?.duration_label ? String(res.data.duration_label) : "") ||
        (Number.isFinite(res.data?.runtime_minutes) ? minutesToLabel(res.data.runtime_minutes) : "") ||
        omdbDurationLabel ||
        "";

      const pickedCast = Array.isArray(res.data?.cast) ? res.data.cast : omdbCast;
      const pickedDirector = res.data?.director ? String(res.data.director) : omdbDirector;
      const pickedCreators = Array.isArray(res.data?.creators) ? res.data.creators : omdbCreators;

      // ✅ Preenche formulário com o que vier do TMDB + fallbacks OMDb
      setForm((f) => ({
        ...f,
        tmdb_id: res.tmdb?.id ?? null,
        media_type: res.tmdb?.type ?? "",

        title: res.data?.title || f.title,
        year: res.data?.year ? String(res.data.year) : (omdbYear || f.year),

        // ✅ agora preenche!
        maturity: pickedMaturity || f.maturity,
        duration_label: pickedDurationLabel || f.duration_label,

        synopsis: res.data?.synopsis || f.synopsis,
        tagsCsv: Array.isArray(res.data?.tags) ? res.data.tags.join(", ") : f.tagsCsv,

        // ✅ categorias automáticas
        categoriesCsv: Array.isArray(res.data?.categories) ? res.data.categories.join(", ") : f.categoriesCsv,

        // ✅ pessoas (agora preenche com fallback)
        castCsv: Array.isArray(pickedCast) ? pickedCast.join(", ") : f.castCsv,
        director: pickedDirector || f.director,
        creatorsCsv: Array.isArray(pickedCreators) ? pickedCreators.join(", ") : f.creatorsCsv,

        thumb_url: res.data?.thumbUrl || f.thumb_url,
        hero_image_url: res.data?.backdropUrl || f.hero_image_url,
      }));

      // se já existe no banco, salva automaticamente o enrich
      if (!isNew) {
        const titleUuid = row?.id || (await resolveTitleUuid(id, supabase));
        if (!titleUuid) {
          setMsg("Metadados carregados. Clique em Salvar.");
          return;
        }

        const patch = {
          imdb_id: imdb,
          tmdb_id: res.tmdb?.id ?? null,
          media_type: res.tmdb?.type ?? null,

          title: res.data?.title ?? null,
          year: res.data?.year ?? (omdbYear ? Number(omdbYear) : null),

          // ✅ agora salva também
          maturity: pickedMaturity ?? null,
          duration_label: pickedDurationLabel || null,

          synopsis: res.data?.synopsis ?? null,
          thumb_url: res.data?.thumbUrl ?? null,
          hero_image_url: res.data?.backdropUrl ?? null,

          tags: Array.isArray(res.data?.tags) ? res.data.tags : [],
          categories: Array.isArray(res.data?.categories) ? res.data.categories : [],

          // ✅ pessoas (se existir coluna no banco)
          cast_names: Array.isArray(pickedCast) ? pickedCast : [],
          director: pickedDirector || null,
          creators: Array.isArray(pickedCreators) ? pickedCreators : [],

          last_synced_at: new Date().toISOString(),
        };

        const { error } = await retryWithoutMissingColumns((p) => updateTitle(titleUuid, p), patch);

        if (error) throw error;

        setMsg("Metadados sincronizados (TMDB + fallback OMDb).");
      } else {
        setMsg("Metadados carregados (TMDB + fallback OMDb). Agora clique em Salvar para criar o título.");
      }
    } catch (e) {
      setErr(e?.message || "Falha ao buscar TMDB.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteTitle() {
    if (!row?.id) return;
    const label = String(form.title || row?.public_id || row?.id || "").trim();
    const ok = window.confirm(`Tem certeza que deseja apagar este titulo?\n\n${label || "Sem titulo"}`);
    if (!ok) return;

    setDeleting(true);
    setErr("");
    setMsg("");

    try {
      // remove media_assets ligados ao title
      await supabase.from("media_assets").delete().eq("title_id", row.id);
      const { error } = await supabase.from("titles").delete().eq("id", row.id);
      if (error) throw error;
      setMsg("Titulo apagado.");
      nav("/admin/dashboard", { replace: true });
    } catch (e) {
      setErr(e?.message || "Falha ao apagar titulo.");
    } finally {
      setDeleting(false);
    }
  }

  async function uploadCover(kind, file) {
    if (!file) return;
    if (!isImage(file)) throw new Error("Selecione uma imagem valida (JPG/PNG/WebP).");
    const mb = file.size / (1024 * 1024);
    if (mb > MAX_COVER_MB) throw new Error(`Imagem muito grande. Maximo ${MAX_COVER_MB} MB.`);
    if (!COVER_BUCKET) throw new Error("Bucket de capas nao configurado.");

    const base = safeKeyPart(form.public_id || row?.id || form.title || "title");
    const ext = getExtFromFile(file);
    const path = `titles/${base}/${kind}_${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(COVER_BUCKET).upload(path, file, {
      upsert: true,
      cacheControl: "3600",
      contentType: file.type,
    });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
    const url = pub?.publicUrl || "";
    if (!url) throw new Error("Falha ao obter URL publica do arquivo.");
    return url;
  }

  async function onUploadThumb(e) {
    const file = e.target.files?.[0] || null;
    e.target.value = "";
    if (!file) return;
    setErr("");
    setMsg("");
    setUploadingThumb(true);
    setPreviewObject(thumbPreviewRef, setThumbPreviewUrl, file);
    try {
      const url = await uploadCover("thumb", file);
      if (!url) throw new Error("Upload falhou.");
      setForm((f) => ({ ...f, thumb_url: url }));
      setMsg("Poster atualizado com upload.");
      setPreviewObject(thumbPreviewRef, setThumbPreviewUrl, null);
    } catch (e2) {
      setErr(e2?.message || "Falha no upload do poster.");
    } finally {
      setUploadingThumb(false);
    }
  }

  async function onUploadHero(e) {
    const file = e.target.files?.[0] || null;
    e.target.value = "";
    if (!file) return;
    setErr("");
    setMsg("");
    setUploadingHero(true);
    setPreviewObject(heroPreviewRef, setHeroPreviewUrl, file);
    try {
      const url = await uploadCover("hero", file);
      if (!url) throw new Error("Upload falhou.");
      setForm((f) => ({ ...f, hero_image_url: url }));
      setMsg("Banner atualizado com upload.");
      setPreviewObject(heroPreviewRef, setHeroPreviewUrl, null);
    } catch (e2) {
      setErr(e2?.message || "Falha no upload do banner.");
    } finally {
      setUploadingHero(false);
    }
  }

  async function onFetchR2Titles() {
    setR2Error("");
    setR2Titles([]);
    setR2Modules([]);

    const prefix = buildR2BasePrefix({ genre: r2Builder.genre, type: r2Builder.type });
    if (!prefix) {
      setR2Error("Selecione genero e tipo para buscar no R2.");
      return;
    }

    setR2Loading(true);
    try {
      const { data, error } = await supabase.functions.invoke("r2-list-prefixes", {
        body: { prefix },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao listar pastas.");
      const list = Array.isArray(data?.prefixes) ? data.prefixes : [];
      setR2Titles(list);
      if (list.length === 1) {
        setR2Builder((p) => ({ ...p, title: list[0] }));
        if (r2Builder.type === "course") {
          const coursePrefix = buildR2TitlePrefix({
            genre: r2Builder.genre,
            type: r2Builder.type,
            title: list[0],
          });
          if (coursePrefix) {
            try {
              const res2 = await supabase.functions.invoke("r2-list-prefixes", {
                body: { prefix: coursePrefix },
              });
              if (!res2?.error && res2?.data?.ok) {
                const mods = Array.isArray(res2.data?.prefixes) ? res2.data.prefixes : [];
                setR2Modules(mods);
                if (mods.length === 1) {
                  setR2Builder((p) => ({ ...p, season: mods[0] }));
                }
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      setR2Error(e?.message || "Falha ao buscar pastas no R2.");
    } finally {
      setR2Loading(false);
    }
  }

  async function onFetchR2Modules() {
    setR2Error("");
    setR2Modules([]);

    const prefix = buildR2TitlePrefix({
      genre: r2Builder.genre,
      type: r2Builder.type,
      title: r2Builder.title,
    });
    if (!prefix) {
      setR2Error("Selecione genero e titulo para buscar modulos.");
      return;
    }

    setR2ModulesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("r2-list-prefixes", {
        body: { prefix },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Falha ao listar modulos.");
      const list = Array.isArray(data?.prefixes) ? data.prefixes : [];
      setR2Modules(list);
      if (list.length === 1) {
        setR2Builder((p) => ({ ...p, season: list[0] }));
      }
    } catch (e) {
      setR2Error(e?.message || "Falha ao buscar modulos no R2.");
    } finally {
      setR2ModulesLoading(false);
    }
  }

  function onBuildHlsFromR2() {
    setErr("");
    setMsg("");

    const genre = String(r2Builder.genre || "").trim();
    const type = String(r2Builder.type || "movie");
    const title = String(r2Builder.title || "").trim();
    const season = String(r2Builder.season || form.season || "").trim();
    const episode = String(r2Builder.episode || form.episode || "").trim();

    if (!genre || !title) {
      setErr("Informe genero e titulo para montar o caminho do R2.");
      return;
    }

    if ((type === "series" || type === "course") && (!season || !episode)) {
      setErr(type === "course" ? "Para curso, informe modulo e episodio." : "Para serie, informe temporada e episodio.");
      return;
    }

    const prefix = buildR2Path({ genre, type, title, season, episode });
    if (!prefix) {
      setErr("Nao foi possivel montar o caminho.");
      return;
    }

    const masterKey = `${prefix}/master.m3u8`;
    const hdKey = `${prefix}/master-hd.m3u8`;
    const master = masterKey;
    const hd = hdKey;

    setForm((f) => ({
      ...f,
      hls_master_url: master,
      hls_master_hd_url: hd,
    }));

    setMsg("Links HLS montados automaticamente.");
  }

  if (loading) {
    return (
      <div className="min-h-full bg-black text-white">
        <TopNav />
        <main className="pt-16">
          <Container>
            <div className="py-10 text-white/70">Carregando...</div>
          </Container>
        </main>
        <Footer />
      </div>
    );
  }

  const canPreviewWatch = String(form.public_id || "").trim().length > 0;

  return (
    <div className="min-h-full bg-black text-white">
      <TopNav />

      <main className="pt-16">
        <Container>
          <div className="py-8">
            {/* HEADER */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-widest text-yellow-400/90">ADMIN</div>
                <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">
                  {isNew ? "Novo título" : "Editar título"}
                </h1>
                <div className="mt-2 text-sm text-white/60">
                  {row?.id ? `UUID: ${row.id}` : "Crie e publique títulos no catálogo."}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  to="/admin/dashboard"
                  className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
                >
                  ← Voltar
                </Link>

                <button
                  onClick={() => onSave(false)}
                  disabled={saving}
                  className={`rounded-xl px-5 py-3 text-sm font-semibold ${
                    saving ? "bg-white/30 text-black/70" : "bg-white text-black hover:bg-white/90"
                  }`}
                >
                  {saving ? "Salvando..." : "Salvar"}
                </button>

                <button
                  onClick={() => onSave(true)}
                  disabled={saving}
                  className={`rounded-xl px-5 py-3 text-sm font-semibold border ${
                    saving
                      ? "bg-white/5 border-white/10 text-white/40"
                      : "bg-emerald-400/15 text-emerald-200 border-emerald-400/20 hover:bg-emerald-400/20"
                  }`}
                >
                  Publicar
                </button>

                {row?.id ? (
                  <button
                    onClick={onDeleteTitle}
                    disabled={saving || deleting}
                    className={`rounded-xl px-5 py-3 text-sm font-semibold border ${
                      saving || deleting
                        ? "bg-white/5 border-white/10 text-white/40"
                        : "bg-red-500/15 text-red-200 border-red-500/25 hover:bg-red-500/25"
                    }`}
                    title="Apagar titulo"
                  >
                    {deleting ? "Apagando..." : "Apagar"}
                  </button>
                ) : null}
              </div>
            </div>

            {err ? (
              <div className="mt-6 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {err}
              </div>
            ) : null}

            {msg ? (
              <div className="mt-6 rounded border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
                {msg}
              </div>
            ) : null}

            {/* PREVIEW */}
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="relative h-[280px] md:h-[340px]">
                {heroPreviewUrl || form.hero_image_url || thumbPreviewUrl || form.thumb_url ? (
                  <img
                    src={heroPreviewUrl || form.hero_image_url || thumbPreviewUrl || form.thumb_url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover opacity-95"
                  />
                ) : (
                  <div className="absolute inset-0 bg-black" />
                )}

                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/20" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />

                <div className="relative h-full p-6 md:p-10 flex items-end">
                  <div className="max-w-3xl">
                    <div className="text-xs font-semibold tracking-widest text-yellow-400/90">PREVIEW</div>

                    <div className="mt-2 text-3xl md:text-5xl font-black tracking-tight">
                      {form.title || "(Sem título)"}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/80">
                      {form.year ? <span>{form.year}</span> : null}

                      <span className={`inline-flex items-center gap-2 rounded border px-2.5 py-1 ${maturityBadge}`}>
                        <span className="text-xs font-semibold">CLASS</span>
                        <span className="text-sm font-bold">{form.maturity || "-"}</span>
                      </span>

                      {form.duration_label ? <span>{form.duration_label}</span> : null}

                      {form.tagsCsv ? (
                        <span className="text-white/50">• {splitList(form.tagsCsv).slice(0, 3).join(" • ")}</span>
                      ) : null}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        onClick={() => canPreviewWatch && nav(`/watch/${String(form.public_id).trim()}`)}
                        disabled={!canPreviewWatch}
                        className={`rounded-xl px-6 py-4 text-sm font-semibold ${
                          canPreviewWatch ? "bg-white text-black hover:bg-white/90" : "bg-white/10 text-white/40"
                        }`}
                        title={canPreviewWatch ? "Abrir Player" : "Defina public_id para testar"}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white font-black">
                            ▶
                          </span>
                          Assistir
                        </span>
                      </button>

                      <button className="rounded-xl bg-white/10 px-6 py-4 text-sm font-semibold text-white hover:bg-white/15">
                        Continuar
                      </button>

                      <Link
                        to="/admin/dashboard"
                        className="rounded-xl bg-white/10 px-6 py-4 text-sm font-semibold text-white hover:bg-white/15"
                      >
                        Voltar
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* BODY */}
              <div className="p-6 md:p-10 grid gap-8 lg:grid-cols-[280px_1fr]">
                {/* Poster */}
                <div className="w-full">
                  <div className="relative w-full aspect-[2/3] bg-black">
                    {thumbPreviewUrl || form.thumb_url ? (
                      <img
                        src={thumbPreviewUrl || form.thumb_url}
                        alt={form.title}
                        className="absolute inset-0 h-full w-full object-contain"
                        loading="eager"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-white/30">
                        sem poster
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                      HLS
                    </span>
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                      1080p
                    </span>
                    {form.media_type ? (
                      <span className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                        {String(form.media_type).toUpperCase()}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 text-xs text-white/40">
                    Para aparecer no Browse: status <b className="text-white/70">published</b>.
                  </div>
                </div>

                {/* Form */}
                <div className="min-w-0">
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* ✅ public_id + botão gerar */}
                    <div>
                      <label className="text-xs text-white/60">public_id (URL bonita)</label>

                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                          <input
                            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            value={form.public_id}
                            onChange={(e) => setForm((f) => ({ ...f, public_id: e.target.value }))}
                            placeholder="mv-00001234 / sr-00001234 / ep-00001234-s01e01 / cr-00001234"
                          />

                        <button
                          type="button"
                          onClick={onGeneratePublicId}
                          disabled={generatingPid}
                          className={`rounded-xl px-4 py-3 text-sm font-semibold whitespace-nowrap ${
                            generatingPid ? "bg-white/30 text-black/70" : "bg-yellow-400 text-black hover:bg-yellow-300"
                          }`}
                          title="Gera automaticamente usando OMDb (detecta movie/series/episode)"
                        >
                          {generatingPid ? "Gerando..." : "Gerar URL"}
                        </button>
                      </div>

                      <div className="mt-1 text-xs text-white/40">
                        Padrão: <b className="text-white/70">mv-</b> (filme),{" "}
                        <b className="text-white/70">sr-</b> (série),{" "}
                        <b className="text-white/70">ep-...-sXXeYY</b> (episódio). Usa OMDb automaticamente.
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-white/60">Status</label>
                      <select
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                        value={form.status}
                        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      >
                        <option value="draft">draft</option>
                        <option value="published">published</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-white/60">IMDB ID</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                        value={form.imdb_id}
                        onChange={(e) => setForm((f) => ({ ...f, imdb_id: e.target.value }))}
                        placeholder="tt4574334 (ou cole link do IMDb)"
                      />

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] text-white/50">Temporada / Módulo (opcional)</label>
                          <input
                            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-white/25"
                            value={form.season}
                            onChange={(e) => setForm((f) => ({ ...f, season: e.target.value }))}
                            placeholder="1"
                            inputMode="numeric"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-white/50">Episódio (opcional)</label>
                          <input
                            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-white/25"
                            value={form.episode}
                            onChange={(e) => setForm((f) => ({ ...f, episode: e.target.value }))}
                            placeholder="2"
                            inputMode="numeric"
                          />
                        </div>
                      </div>

                      <button
                        onClick={onEnrichTmdb}
                        disabled={saving}
                        className="mt-3 w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:bg-white/30"
                      >
                        Buscar do TMDB (via IMDB)
                      </button>
                    </div>

                    <div>
                      <div className="mb-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                        <div className="text-sm font-semibold text-white/90">Montar HLS pelo R2</div>
                        <div className="mt-2 text-xs text-white/50">
                          Monte o caminho usando a mesma estrutura do transcoder: Gênero / Tipo / Título / Temporada ou Módulo / Episódio.
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="text-xs text-white/60">Gênero</label>
                            <select
                              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                              value={r2Builder.genre}
                              onChange={(e) => setR2Builder((p) => ({ ...p, genre: e.target.value }))}
                            >
                              <option value="">Selecione</option>
                              {GENRES.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-xs text-white/60">Tipo</label>
                            <select
                              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                              value={r2Builder.type}
                              onChange={(e) => setR2Builder((p) => ({ ...p, type: e.target.value }))}
                            >
                              <option value="movie">Filme</option>
                              <option value="series">Série</option>
                              <option value="course">Curso</option>
                            </select>
                          </div>

                          <div className="md:col-span-2">
                            <div className="flex items-end justify-between gap-3">
                              <label className="text-xs text-white/60">Título (pasta no R2)</label>
                              <button
                                type="button"
                                onClick={onFetchR2Titles}
                                disabled={r2Loading}
                                className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                  r2Loading ? "bg-white/30 text-black/70" : "bg-white text-black hover:bg-white/90"
                                }`}
                              >
                                {r2Loading ? "Buscando..." : "Buscar no R2"}
                              </button>
                            </div>

                            <div className="mt-2 grid gap-2 md:grid-cols-2">
                              <select
                                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                                value={r2Builder.title}
                                onChange={(e) => setR2Builder((p) => ({ ...p, title: e.target.value }))}
                              >
                                <option value="">Selecione uma pasta</option>
                                {r2Titles.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>

                              <input
                                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                                value={r2Builder.title}
                                onChange={(e) => setR2Builder((p) => ({ ...p, title: e.target.value }))}
                                placeholder="Ou digite manualmente"
                              />
                            </div>

                            <div className="mt-2 text-xs text-white/45">
                              Prefixo base: {buildR2BasePrefix({ genre: r2Builder.genre, type: r2Builder.type }) || "—"}
                            </div>
                            {r2Error ? <div className="mt-1 text-xs text-red-200">{r2Error}</div> : null}
                          </div>

                          {r2Builder.type === "series" ? (
                            <>
                              <div>
                                <label className="text-xs text-white/60">Temporada</label>
                                <input
                                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                                  value={r2Builder.season}
                                  onChange={(e) => setR2Builder((p) => ({ ...p, season: e.target.value }))}
                                  placeholder="01"
                                  inputMode="numeric"
                                />
                              </div>
                              <div>
                                <label className="text-xs text-white/60">Episódio</label>
                                <input
                                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                                  value={r2Builder.episode}
                                  onChange={(e) => setR2Builder((p) => ({ ...p, episode: e.target.value }))}
                                  placeholder="01"
                                  inputMode="numeric"
                                />
                              </div>
                            </>
                          ) : r2Builder.type === "course" ? (
                            <>
                              <div>
                                <div className="flex items-center justify-between">
                                  <label className="text-xs text-white/60">Módulo (pasta no R2)</label>
                                  <button
                                    type="button"
                                    onClick={onFetchR2Modules}
                                    disabled={r2ModulesLoading}
                                    className={`rounded-xl px-3 py-2 text-[11px] font-semibold ${
                                      r2ModulesLoading
                                        ? "bg-white/30 text-black/70"
                                        : "bg-white text-black hover:bg-white/90"
                                    }`}
                                  >
                                    {r2ModulesLoading ? "Buscando..." : "Buscar módulos"}
                                  </button>
                                </div>
                                <div className="mt-2 grid gap-2">
                                  <select
                                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                                    value={r2Builder.season}
                                    onChange={(e) => setR2Builder((p) => ({ ...p, season: e.target.value }))}
                                  >
                                    <option value="">Selecione um módulo</option>
                                    {r2Modules.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>

                                  <input
                                    className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                                    value={r2Builder.season}
                                    onChange={(e) => setR2Builder((p) => ({ ...p, season: e.target.value }))}
                                    placeholder="Módulo Teste ou 01"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-white/60">Episódio</label>
                                <input
                                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                                  value={r2Builder.episode}
                                  onChange={(e) => setR2Builder((p) => ({ ...p, episode: e.target.value }))}
                                  placeholder="01"
                                  inputMode="numeric"
                                />
                              </div>
                            </>
                          ) : null}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={onBuildHlsFromR2}
                            className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90"
                          >
                            Montar links HLS
                          </button>
                        </div>
                      </div>

                      <label className="text-xs text-white/60">HLS master.m3u8 (1080p + 4K)</label>
                      <input
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                        value={form.hls_master_url}
                        onChange={(e) => setForm((f) => ({ ...f, hls_master_url: e.target.value }))}
                        placeholder="https://.../master.m3u8"
                      />
                      <div className="mt-1 text-xs text-white/40">Upsert em media_assets pelo title_id.</div>

                      <div className="mt-4">
                        <label className="text-xs text-white/60">HLS master-hd.m3u8 (somente 1080p)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.hls_master_hd_url}
                          onChange={(e) => setForm((f) => ({ ...f, hls_master_hd_url: e.target.value }))}
                          placeholder="https://.../master-hd.m3u8"
                        />
                        <div className="mt-1 text-xs text-white/40">
                          Use para planos sem 4K (ou fallback para dispositivos fracos).
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-5">
                    <div className="text-sm font-semibold text-white/90">Informações</div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-xs text-white/60">Título</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.title}
                          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-white/60">Ano</label>
                          <input
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            value={form.year}
                            onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                            placeholder="2016"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-white/60">Classificação</label>
                          <input
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            value={form.maturity}
                            onChange={(e) => setForm((f) => ({ ...f, maturity: e.target.value }))}
                            placeholder="14"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-white/60">Duração (label)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.duration_label}
                          onChange={(e) => setForm((f) => ({ ...f, duration_label: e.target.value }))}
                          placeholder="1h 10m"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-white/60">Categorias (CSV)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.categoriesCsv}
                          onChange={(e) => setForm((f) => ({ ...f, categoriesCsv: e.target.value }))}
                          placeholder="Séries, Filmes, Novidades, Em alta..."
                        />
                        <div className="mt-1 text-xs text-white/40">
                          Dica: TMDB pode preencher isso automaticamente (Filmes/Séries + Novidades/Em alta + gêneros).
                        </div>
                      </div>

                      <div className="md:col-span-2 rounded-2xl border border-white/10 bg-black/30 p-4">
                        <div className="text-sm font-semibold text-white/90">Calendário (CineSuper)</div>
                        <div className="mt-3 flex items-center gap-3">
                          <input
                            id="calendar_enabled"
                            type="checkbox"
                            className="h-4 w-4 accent-red-500"
                            checked={!!form.calendar_enabled}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, calendar_enabled: e.target.checked }))
                            }
                          />
                          <label htmlFor="calendar_enabled" className="text-sm text-white/80">
                            Mostrar no calendário (Em cinema)
                          </label>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div>
                            <label className="text-xs text-white/60">Data de chegada no CineSuper</label>
                            <input
                              type="date"
                              className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                              value={form.calendar_date}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, calendar_date: e.target.value }))
                              }
                            />
                          </div>
                          <div className="text-xs text-white/45 leading-relaxed">
                            Quando ativo, este título aparece na aba “Calendário” da TV com a data informada.
                          </div>
                        </div>
                      </div>

                      {/* ✅ novos campos (opcionais) */}
                      <div>
                        <label className="text-xs text-white/60">Elenco (CSV)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.castCsv}
                          onChange={(e) => setForm((f) => ({ ...f, castCsv: e.target.value }))}
                          placeholder="Ator 1, Ator 2, Ator 3..."
                        />
                        <div className="mt-1 text-xs text-white/40">
                          (Só vai salvar se existir coluna <b className="text-white/70">cast_names</b> no banco.)
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-white/60">Diretor</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.director}
                          onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
                          placeholder="Nome do diretor"
                        />
                        <div className="mt-1 text-xs text-white/40">
                          (Só vai salvar se existir coluna <b className="text-white/70">director</b> no banco.)
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-xs text-white/60">Creators / Criadores (CSV)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.creatorsCsv}
                          onChange={(e) => setForm((f) => ({ ...f, creatorsCsv: e.target.value }))}
                          placeholder="Criador 1, Criador 2..."
                        />
                        <div className="mt-1 text-xs text-white/40">
                          (Só vai salvar se existir coluna <b className="text-white/70">creators</b> no banco.)
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-xs text-white/60">Sinopse</label>
                        <textarea
                          rows={4}
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.synopsis}
                          onChange={(e) => setForm((f) => ({ ...f, synopsis: e.target.value }))}
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-xs text-white/60">Tags / Gêneros (CSV)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.tagsCsv}
                          onChange={(e) => setForm((f) => ({ ...f, tagsCsv: e.target.value }))}
                          placeholder="Sci-Fi, Mistério, Aventura..."
                        />
                      </div>

                      <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="text-xs text-white/60">Poster (thumb_url)</label>
                          <input
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            value={form.thumb_url}
                            onChange={(e) => setForm((f) => ({ ...f, thumb_url: e.target.value }))}
                            placeholder="https://image.tmdb.org/..."
                          />

                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => thumbInputRef.current?.click?.()}
                              disabled={uploadingThumb}
                              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                uploadingThumb ? "bg-white/30 text-black/70" : "bg-white text-black hover:bg-white/90"
                              }`}
                            >
                              {uploadingThumb ? "Enviando..." : "Upload do poster"}
                            </button>
                            <input
                              ref={thumbInputRef}
                              type="file"
                              accept="image/*"
                              onChange={onUploadThumb}
                              className="hidden"
                            />
                            <span className="text-xs text-white/40">
                              Bucket: {COVER_BUCKET || "-"} • max {MAX_COVER_MB}MB
                            </span>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-white/60">Banner (hero_image_url)</label>
                          <input
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            value={form.hero_image_url}
                            onChange={(e) => setForm((f) => ({ ...f, hero_image_url: e.target.value }))}
                            placeholder="https://image.tmdb.org/..."
                          />

                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => heroInputRef.current?.click?.()}
                              disabled={uploadingHero}
                              className={`rounded-xl px-3 py-2 text-xs font-semibold ${
                                uploadingHero ? "bg-white/30 text-black/70" : "bg-white text-black hover:bg-white/90"
                              }`}
                            >
                              {uploadingHero ? "Enviando..." : "Upload do banner"}
                            </button>
                            <input
                              ref={heroInputRef}
                              type="file"
                              accept="image/*"
                              onChange={onUploadHero}
                              className="hidden"
                            />
                            <span className="text-xs text-white/40">
                              Bucket: {COVER_BUCKET || "-"} • max {MAX_COVER_MB}MB
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-xs text-white/60">YouTube (hero_youtube) — só Home</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.hero_youtube}
                          onChange={(e) => setForm((f) => ({ ...f, hero_youtube: e.target.value }))}
                          placeholder="https://youtu.be/..."
                        />
                        <div className="mt-1 text-xs text-white/40">
                          No Title (detalhes) não aparece vídeo. Esse campo é para a Home.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 text-xs text-white/40">
                    Se continuar dando erro ao salvar, o mais comum é <b className="text-white/70">public_id duplicado</b>{" "}
                    ou <b className="text-white/70">RLS bloqueando update</b>.
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <Link to="/admin/dashboard" className="text-sm text-white/70 hover:text-white">
                ← Voltar para o Dashboard
              </Link>
            </div>
          </div>
        </Container>
      </main>

      <Footer />
    </div>
  );
}
