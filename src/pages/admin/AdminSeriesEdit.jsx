import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import TopNav from "../../components/layout/TopNav.jsx";
import Footer from "../../components/layout/Footer.jsx";
import Container from "../../components/layout/Container.jsx";
import { supabase } from "../../lib/supabaseClient.js";
import { Play, ListVideo, ChevronDown } from "lucide-react";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COVER_BUCKET = String(import.meta.env.VITE_TITLE_ASSETS_BUCKET || "titles").trim();
const MAX_COVER_MB = 8;

function splitCsv(v) {
  return String(v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinCsv(arr) {
  return Array.isArray(arr) ? arr.join(", ") : "";
}

function numOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function buildCoursePublicIdFromUuid(uuid) {
  const digits = String(uuid || "").replace(/\D+/g, "");
  const tail = digits.slice(-8).padStart(8, "0");
  return `cr-${tail}`;
}

function safeLower(v) {
  return String(v || "").trim().toLowerCase();
}

function pad2(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "01";
  return String(Math.floor(x)).padStart(2, "0");
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

function parseSeasonEpisodeFromPrefix(prefix) {
  const p = String(prefix || "");
  const mSeason =
    p.match(/\/temporada\s*(\d+)/i) ||
    p.match(/\/season\s*(\d+)/i) ||
    p.match(/\/m[oó]dulo\s*(\d+)/i) ||
    p.match(/\/module\s*(\d+)/i);
  const mEp = p.match(/\/epis[oó]dio\s*(\d+)/i) || p.match(/\/episode\s*(\d+)/i);

  const season = mSeason ? Number(mSeason[1]) : null;
  const episode = mEp ? Number(mEp[1]) : null;

  return {
    season: Number.isFinite(season) && season > 0 ? season : null,
    episode: Number.isFinite(episode) && episode > 0 ? episode : null,
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

/**
 * Tenta buscar a série por:
 * - public_id (sr-xxxx)
 * - uuid
 */
async function fetchSeriesRow(idOrPublicId) {
  const v = String(idOrPublicId || "").trim();
  if (!v) return null;

  // 1) por public_id
  {
    const { data, error } = await supabase
      .from("titles")
      .select(
        "id, public_id, status, media_type, is_series, imdb_id, tmdb_id, title, year, maturity, synopsis, thumb_url, hero_image_url, hero_youtube, tags, categories, r2_prefix_base, created_at"
      )
      .eq("public_id", v)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data?.[0]) return data[0];
  }

  // 2) por uuid
  if (UUID_RE.test(v)) {
    const { data, error } = await supabase
      .from("titles")
      .select(
        "id, public_id, status, media_type, is_series, imdb_id, tmdb_id, title, year, maturity, synopsis, thumb_url, hero_image_url, hero_youtube, tags, categories, r2_prefix_base, created_at"
      )
      .eq("id", v)
      .limit(1)
      .maybeSingle();

    if (!error && data) return data;
  }

  return null;
}

export default function AdminSeriesEdit() {
  const { id } = useParams(); // sr-xxxx ou uuid
  const isNew = id === "new";
  const nav = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [coursePendingId, setCoursePendingId] = useState("");
  const prefillRef = useRef(false);

  const [row, setRow] = useState(null);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const thumbInputRef = useRef(null);
  const heroInputRef = useRef(null);
  const [thumbPreviewUrl, setThumbPreviewUrl] = useState("");
  const [heroPreviewUrl, setHeroPreviewUrl] = useState("");
  const thumbPreviewRef = useRef("");
  const heroPreviewRef = useRef("");

  const [form, setForm] = useState({
    public_id: "",
    status: "draft",

    imdb_id: "",
    tmdb_id: null,
    media_type: "tv",

    title: "",
    year: "",
    maturity: "14",
    synopsis: "",

    thumb_url: "",
    hero_image_url: "",
    hero_youtube: "",

    tagsCsv: "",
    categoriesCsv: "",

    // base da série no R2 (sem temporada/módulo/episódio)
    r2_prefix_base: "",
  });

  // Episódios
  const [epsLoading, setEpsLoading] = useState(false);
  const [epsErr, setEpsErr] = useState("");
  const [episodes, setEpisodes] = useState([]);
  const [activeSeason, setActiveSeason] = useState(1);
  const [seasonOpen, setSeasonOpen] = useState(false);

  const maturityBadge = useMemo(() => maturityColor(form.maturity), [form.maturity]);
  const mediaType = safeLower(form.media_type || row?.media_type || "");
  const isCourse = mediaType === "course" || mediaType === "curso";
  const seasonLabel = isCourse ? "Módulo" : "Temporada";
  const seasonLabelPlural = isCourse ? "Módulos" : "Temporadas";
  const seasonPrefix = isCourse ? "M" : "T";
  const adminLabel = isCourse ? "CURSO" : "SÉRIE";

  async function load() {
    setLoading(true);
    setErr("");
    setMsg("");

    try {
      if (isNew) {
        setRow(null);
        setLoading(false);
        return;
      }
      const data = await fetchSeriesRow(id);
      if (!data) {
        setErr("Série/Curso não encontrado.");
        setRow(null);
        return;
      }

      // ✅ garantia: é tv e é série global
      const mt = safeLower(data.media_type);
      const isSeries = !!data.is_series;
      const isSeriesLike = (mt === "tv" || mt === "course" || mt === "curso") && isSeries;
      if (!isSeriesLike) {
        setErr("Este item não é uma Série/Curso global.");
        setRow(data);
        // ainda carrega, mas avisa
      }

      setRow(data);
      setForm((f) => ({
        ...f,
        public_id: data.public_id || "",
        status: data.status || "draft",
        imdb_id: data.imdb_id || "",
        tmdb_id: data.tmdb_id ?? null,
        media_type: data.media_type || "tv",
        title: data.title || "",
        year: data.year ? String(data.year) : "",
        maturity: data.maturity != null ? String(data.maturity) : "14",
        synopsis: data.synopsis || "",
        thumb_url: data.thumb_url || "",
        hero_image_url: data.hero_image_url || "",
        hero_youtube: data.hero_youtube || "",
        tagsCsv: joinCsv(data.tags),
        categoriesCsv: joinCsv(data.categories),
        r2_prefix_base: data.r2_prefix_base || data.r2_prefix || "",
      }));
    } catch (e) {
      setErr(e?.message || "Falha ao carregar série.");
      setRow(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!isNew || prefillRef.current) return;
    const params = new URLSearchParams(location.search || "");
    const gospel = params.get("gospel");
    const typeParam = String(params.get("type") || "").trim().toLowerCase();

    setForm((f) => {
      let next = { ...f };
      if (typeParam === "course" || typeParam === "tv") {
        next.media_type = typeParam === "course" ? "course" : "tv";
      }
      if (gospel === "1" || gospel === "true") {
        const list = splitCsv(next.categoriesCsv);
        const has = list.some((c) => c.toLowerCase() === "gospel");
        if (!has) next.categoriesCsv = joinCsv([...list, "Gospel"]);
      }
      return next;
    });

    prefillRef.current = true;
  }, [isNew, location.search]);

  useEffect(() => {
    return () => {
      setPreviewObject(thumbPreviewRef, setThumbPreviewUrl, null);
      setPreviewObject(heroPreviewRef, setHeroPreviewUrl, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Carrega episódios da série (preferencialmente por series_id; fallback por imdb_id)
  useEffect(() => {
    let alive = true;

    async function loadEpisodes() {
      try {
        setEpsErr("");
        setEpsLoading(true);

        const seriesUuid = String(row?.id || "").trim();
        const imdbId = String(row?.imdb_id || form.imdb_id || "").trim().toLowerCase();
        const seriesTypeRaw = safeLower(row?.media_type || form.media_type || "tv");
        const seriesType = seriesTypeRaw === "course" || seriesTypeRaw === "curso" ? "course" : "tv";

        if (!seriesUuid) {
          if (alive) setEpisodes([]);
          return;
        }

        // Tentativa 1: por series_id (se coluna existir)
        let data = null;
        let error = null;

        {
          const res = await supabase
            .from("titles")
            .select("id, public_id, status, title, r2_prefix, season, episode, thumb_url, hero_image_url, created_at")
            .eq("status", "published")
            .eq("media_type", seriesType)
            .eq("is_series", false)
            .eq("series_id", seriesUuid)
            .order("created_at", { ascending: true });

          if (!res.error) {
            data = res.data || [];
          } else {
            // se erro de coluna inexistente, ignora e usa fallback
            if (String(res.error?.message || "").includes("series_id")) {
              error = null;
            } else {
              error = res.error;
            }
          }
        }

        // Fallback: por imdb_id (se series_id não existe no schema ou veio vazio)
        if ((!data || data.length === 0) && imdbId && seriesType === "tv") {
          const res2 = await supabase
            .from("titles")
            .select("id, public_id, status, title, r2_prefix, season, episode, thumb_url, hero_image_url, created_at")
            .eq("status", "published")
            .eq("media_type", seriesType)
            .eq("is_series", false)
            .eq("imdb_id", imdbId)
            .order("created_at", { ascending: true });

          if (res2.error) throw res2.error;
          data = res2.data || [];
        }

        // Fallback: por r2_prefix (curso)
        if ((!data || data.length === 0) && seriesType === "course") {
          const basePrefixRaw = String(row?.r2_prefix_base || form.r2_prefix_base || "").trim();
          const basePrefix = normalizePrefix(extractSeriesBaseFromPrefix(basePrefixRaw));
          if (basePrefix) {
            const res3 = await supabase
              .from("titles")
              .select("id, public_id, status, title, r2_prefix, season, episode, thumb_url, hero_image_url, created_at")
              .eq("status", "published")
              .eq("media_type", "course")
              .eq("is_series", false)
              .like("r2_prefix", `${basePrefix}%`)
              .order("created_at", { ascending: true });

            if (res3.error) throw res3.error;
            data = res3.data || [];
          }
        }

        if (!data && error && !imdbId) {
          throw error;
        }

        const list = Array.isArray(data) ? data : [];

        const normalized = list
          .map((r) => {
            // usa colunas season/episode se existirem, senão parseia do prefix
            const parsed = parseSeasonEpisodeFromPrefix(r?.r2_prefix || "");
            const season = Number(r?.season || 0) > 0 ? Number(r.season) : parsed.season || 1;
            const episode = Number(r?.episode || 0) > 0 ? Number(r.episode) : parsed.episode || 1;

            return {
              id: r.id,
              public_id: r.public_id,
              status: r.status,
              title: r.title || "",
              r2_prefix: r.r2_prefix || "",
              season,
              episode,
              thumb_url: r.thumb_url || "",
              hero_image_url: r.hero_image_url || "",
            };
          })
          .filter((x) => x.public_id); // só os episódios válidos

        normalized.sort((a, b) => {
          if (a.season !== b.season) return a.season - b.season;
          return a.episode - b.episode;
        });

        if (!alive) return;

        setEpisodes(normalized);

        const firstSeason = normalized[0]?.season ?? 1;
        setActiveSeason(firstSeason);
      } catch (e) {
        if (!alive) return;
        setEpisodes([]);
        setEpsErr(e?.message || "Falha ao carregar episódios.");
      } finally {
        if (alive) setEpsLoading(false);
      }
    }

    if (row) loadEpisodes();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

  const seasons = useMemo(() => {
    const set = new Set();
    for (const ep of episodes) set.add(ep.season);
    return Array.from(set).sort((a, b) => a - b);
  }, [episodes]);

  const episodesForSeason = useMemo(() => {
    return episodes.filter((e) => e.season === activeSeason).sort((a, b) => a.episode - b.episode);
  }, [episodes, activeSeason]);

  function buildPayload(nextStatus) {
    return {
      public_id: String(form.public_id || "").trim() || null,
      status: nextStatus || form.status || "draft",
      imdb_id: String(form.imdb_id || "").trim() || null,
      tmdb_id: form.tmdb_id ?? null,
      media_type: safeLower(form.media_type) === "course" ? "course" : "tv",
      is_series: true,
      title: String(form.title || "").trim() || null,
      year: numOrNull(form.year),
      maturity: String(form.maturity || "").trim() || null,
      synopsis: String(form.synopsis || "").trim() || null,
      thumb_url: String(form.thumb_url || "").trim() || null,
      hero_image_url: String(form.hero_image_url || "").trim() || null,
      hero_youtube: String(form.hero_youtube || "").trim() || null,
      tags: splitCsv(form.tagsCsv),
      categories: splitCsv(form.categoriesCsv),
      r2_prefix_base: String(form.r2_prefix_base || "").trim() || null,
    };
  }

  async function onSave(publish) {
    setSaving(true);
    setErr("");
    setMsg("");

    try {
      const mt = safeLower(form.media_type || "tv");
      const isCourseLocal = mt === "course" || mt === "curso";
      let nextPublicId = String(form.public_id || "").trim();
      let nextCourseId = coursePendingId;

      if (isNew && isCourseLocal) {
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

      if (isNew && !nextPublicId && !isCourseLocal) {
        throw new Error("Informe um public_id (ex: sr-00001234) antes de salvar.");
      }

      const nextStatus = publish ? "published" : form.status || "draft";
      const payload = buildPayload(nextStatus);

      if (isNew) {
        if (nextCourseId) payload.id = nextCourseId;
        if (!payload.public_id && nextPublicId) payload.public_id = nextPublicId;

        const { data, error } = await supabase.from("titles").insert(payload).select("id, public_id, status");
        if (error) throw error;
        const saved = data?.[0] || null;
        if (!saved?.id) throw new Error("Falha ao criar série/curso.");

        setRow((r) => ({ ...(r || {}), id: saved.id, public_id: saved.public_id, status: saved.status }));
        setMsg(publish ? "Série/Curso criado e publicado." : "Série/Curso criado.");
        nav(`/admin/series/${saved.public_id || saved.id}`, { replace: true });
        return;
      }

      if (!row?.id) {
        throw new Error("Série/Curso não encontrado para atualizar.");
      }

      const { error } = await supabase.from("titles").update(payload).eq("id", row.id);
      if (error) throw error;

      setRow((r) => ({ ...(r || {}), ...payload }));
      setMsg(publish ? "Série/Curso salvo e publicado." : "Série/Curso salvo.");
    } catch (e) {
      setErr(e?.message || "Falha ao salvar série.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteSeries() {
    if (!row?.id) return;
    const label = String(form.title || row?.public_id || row?.id || "").trim();
    const ok = window.confirm(`Tem certeza que deseja apagar esta série/curso?\n\n${label || "Sem título"}`);
    if (!ok) return;

    setDeleting(true);
    setErr("");
    setMsg("");

    try {
      await supabase.from("media_assets").delete().eq("title_id", row.id);
      const { error } = await supabase.from("titles").delete().eq("id", row.id);
      if (error) throw error;
      setMsg("Série/Curso apagado.");
      nav("/admin/dashboard", { replace: true });
    } catch (e) {
      setErr(e?.message || "Falha ao apagar serie.");
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

    const base = safeKeyPart(form.public_id || row?.id || form.title || "series");
    const ext = getExtFromFile(file);
    const path = `series/${base}/${kind}_${Date.now()}.${ext}`;

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

  const totalEpisodes = episodes.length;

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

  return (
    <div className="min-h-full bg-black text-white">
      <TopNav />

      <main className="pt-16">
        <Container>
          <div className="py-8">
            {/* HEADER */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold tracking-widest text-yellow-400/90">ADMIN • {adminLabel}</div>
                <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight truncate">
                  {form.title || "(Sem título)"}
                </h1>
                <div className="mt-2 text-sm text-white/60">
                  {row?.id ? `UUID: ${row.id}` : null}{" "}
                  {form.public_id ? `• ${form.public_id}` : null}{" "}
                  {totalEpisodes ? `• ${totalEpisodes} episódio(s)` : null}
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
                    onClick={onDeleteSeries}
                    disabled={saving || deleting}
                    className={`rounded-xl px-5 py-3 text-sm font-semibold border ${
                      saving || deleting
                        ? "bg-white/5 border-white/10 text-white/40"
                        : "bg-red-500/15 text-red-200 border-red-500/25 hover:bg-red-500/25"
                    }`}
                    title="Apagar serie"
                  >
                    {deleting ? "Apagando..." : "Apagar"}
                  </button>
                ) : null}

                {/* ✅ opcional: Sync (plugar seu Worker /sync-series)
                <button
                  onClick={async () => {
                    // implemente aqui quando seu worker tiver /sync-series
                  }}
                  className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
                >
                  Sincronizar episódios
                </button>
                */}
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

            {/* FORM */}
            <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="p-6 md:p-10 grid gap-8 lg:grid-cols-[340px_1fr]">
                {/* LEFT */}
                <div className="min-w-0">
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                    <div className="text-sm font-semibold text-white/90">Identificação</div>

                    <div className="mt-4 grid gap-4">
                        <div>
                          <label className="text-xs text-white/60">
                            public_id ({isCourse ? "cr-..." : "sr-..."})
                          </label>
                          <input
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            value={form.public_id}
                            onChange={(e) => setForm((f) => ({ ...f, public_id: e.target.value }))}
                            placeholder={isCourse ? "cr-06504681" : "sr-19244304"}
                          />
                          <div className="mt-1 text-xs text-white/40">
                            Deve ser <b className="text-white/70">{isCourse ? "cr-XXXXXXXX" : "sr-XXXXXXXX"}</b>{" "}
                            ({isCourse ? "curso" : "série global"}).
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
                        <label className="text-xs text-white/60">IMDB ID (da série)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.imdb_id}
                          onChange={(e) => setForm((f) => ({ ...f, imdb_id: e.target.value }))}
                          placeholder="tt19244304"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-white/60">R2 prefix base (série/curso)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.r2_prefix_base}
                          onChange={(e) => setForm((f) => ({ ...f, r2_prefix_base: e.target.value }))}
                          placeholder="Terror/Séries/It: Bem-Vindos a Derry [tt19244304]/"
                        />
                        <div className="mt-1 text-xs text-white/40">
                          Sem <b className="text-white/70">Temporada/Módulo/Episódio</b>. Serve para sync.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Episódios */}
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                        <ListVideo className="h-4 w-4 text-white/70" />
                        Episódios
                      </div>

                      {seasons.length > 0 ? (
                        <button
                          onClick={() => setSeasonOpen((v) => !v)}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                          title={`Selecionar ${seasonLabel.toLowerCase()}`}
                        >
                          {seasonLabel} {activeSeason}
                          <ChevronDown className={`h-4 w-4 transition ${seasonOpen ? "rotate-180" : ""}`} />
                        </button>
                      ) : null}
                    </div>

                    {epsLoading ? (
                      <div className="mt-3 text-sm text-white/60">Carregando episódios...</div>
                    ) : epsErr ? (
                      <div className="mt-3 text-sm text-red-200">{epsErr}</div>
                    ) : seasons.length === 0 ? (
                      <div className="mt-3 text-sm text-white/60">
                        Nenhum episódio publicado encontrado para este {isCourse ? "curso" : "série"}.
                      </div>
                    ) : (
                      <>
                        {seasonOpen ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {seasons.map((s) => (
                              <button
                                key={`season-${s}`}
                                onClick={() => {
                                  setActiveSeason(s);
                                  setSeasonOpen(false);
                                }}
                                className={`text-xs rounded-full border px-3 py-1 ${
                                  s === activeSeason
                                    ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
                                    : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                                }`}
                              >
                                {seasonLabel} {s}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10 bg-black/25 overflow-hidden">
                          {episodesForSeason.slice(0, 40).map((ep) => {
                            const label = `${seasonPrefix}${ep.season}E${pad2(ep.episode)}`;
                            return (
                              <div
                                key={ep.public_id}
                                className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/80">
                                      {label}
                                    </span>
                                    <div className="truncate text-sm text-white/85">
                                      {ep.title || label}
                                    </div>
                                  </div>

                                  <div className="mt-1 text-[11px] text-white/45 truncate">
                                    {ep.public_id}
                                  </div>
                                </div>

                                <div className="shrink-0 flex items-center gap-2">
                                  <button
                                    onClick={() => nav(`/watch/${ep.public_id}`)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                                    title="Abrir no player"
                                  >
                                    <Play className="h-4 w-4" />
                                    Ver
                                  </button>
                                  <Link
                                    to={`/admin/titles/${ep.public_id}`}
                                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
                                    title="Editar episódio (avançado)"
                                  >
                                    Editar
                                  </Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {episodesForSeason.length > 40 ? (
                          <div className="mt-3 text-xs text-white/50">
                            Mostrando 40 episódios. (Se quiser, eu coloco paginação.)
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>

                {/* RIGHT */}
                <div className="min-w-0">
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                    <div className="text-sm font-semibold text-white/90">Metadados globais da série</div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="text-xs text-white/60">Título</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.title}
                          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="text-xs text-white/60">Ano</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.year}
                          onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                          placeholder="2025"
                          inputMode="numeric"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-white/60">Classificação</label>
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            value={form.maturity}
                            onChange={(e) => setForm((f) => ({ ...f, maturity: e.target.value }))}
                            placeholder="14"
                          />
                          <span className={`shrink-0 inline-flex items-center rounded border px-2.5 py-2 text-xs font-semibold ${maturityBadge}`}>
                            {form.maturity || "-"}
                          </span>
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-xs text-white/60">Sinopse</label>
                        <textarea
                          rows={5}
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.synopsis}
                          onChange={(e) => setForm((f) => ({ ...f, synopsis: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="text-xs text-white/60">Categorias (CSV)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.categoriesCsv}
                          onChange={(e) => setForm((f) => ({ ...f, categoriesCsv: e.target.value }))}
                          placeholder="Terror, Séries, Novidades..."
                        />
                      </div>

                      <div>
                        <label className="text-xs text-white/60">Tags (CSV)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.tagsCsv}
                          onChange={(e) => setForm((f) => ({ ...f, tagsCsv: e.target.value }))}
                          placeholder="Mistério, Suspense..."
                        />
                      </div>

                      <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="text-xs text-white/60">Poster (thumb_url)</label>
                          <input
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            value={form.thumb_url}
                            onChange={(e) => setForm((f) => ({ ...f, thumb_url: e.target.value }))}
                            placeholder="https://..."
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
                          <div className="mt-3">
                            {thumbPreviewUrl || form.thumb_url ? (
                              <div className="relative w-full max-w-[220px] aspect-[2/3] bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                                <img
                                  src={thumbPreviewUrl || form.thumb_url}
                                  alt={form.title || "Poster"}
                                  className="absolute inset-0 h-full w-full object-contain"
                                />
                              </div>
                            ) : (
                              <div className="text-xs text-white/40">sem poster</div>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-white/60">Banner (hero_image_url)</label>
                          <input
                            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                            value={form.hero_image_url}
                            onChange={(e) => setForm((f) => ({ ...f, hero_image_url: e.target.value }))}
                            placeholder="https://..."
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
                          <div className="mt-3">
                            {heroPreviewUrl || form.hero_image_url ? (
                              <div className="relative w-full aspect-[16/9] bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                                <img
                                  src={heroPreviewUrl || form.hero_image_url}
                                  alt={form.title || "Banner"}
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="text-xs text-white/40">sem banner</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-xs text-white/60">YouTube (hero_youtube)</label>
                        <input
                          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-white/25"
                          value={form.hero_youtube}
                          onChange={(e) => setForm((f) => ({ ...f, hero_youtube: e.target.value }))}
                          placeholder="https://youtu.be/..."
                        />
                      </div>

                      <div className="md:col-span-2 text-xs text-white/45">
                        Os episódios (ep-...) não aparecem no Dashboard. Eles ficam aqui dentro da série.
                      </div>
                    </div>
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
