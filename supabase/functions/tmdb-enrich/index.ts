// supabase/functions/tmdb-enrich/index.ts
// Deno runtime (Supabase Edge Functions)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type MediaType = "movie" | "tv";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function uniq(arr: string[]) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function normalizeStr(s: string) {
  return String(s || "").trim();
}

function yearFromDate(dateStr?: string | null) {
  const s = String(dateStr || "").trim();
  if (!s || s.length < 4) return null;
  const y = Number(s.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function takeNames(arr: any[], max = 12) {
  return (Array.isArray(arr) ? arr : [])
    .map((x) => normalizeStr(x?.name || x?.original_name))
    .filter(Boolean)
    .slice(0, max);
}

/**
 * ✅ Diretor correto (apenas FILMES):
 * - movie: crew.job === "Director"
 */
function pickMovieDirector(credits: any) {
  const crew = Array.isArray(credits?.crew) ? credits.crew : [];
  const dirs = takeNames(crew.filter((c: any) => c?.job === "Director"), 2);
  return dirs.join(", ") || "";
}

/**
 * Formata duração em label: 142 -> "2h 22m"
 */
function minutesToLabel(mins: number | null) {
  const n = typeof mins === "number" ? mins : null;
  if (!n || !Number.isFinite(n) || n <= 0) return "";
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Normaliza rating BR do TMDB para um "maturity" compatível com seu sistema
 * Exemplos possíveis: "L", "Livre", "10", "12", "14", "16", "18", "0"
 */
function normalizeBrRatingToMaturity(raw: string | null | undefined): string | null {
  const s0 = String(raw || "").trim();
  if (!s0) return null;

  const s = s0.toUpperCase();

  if (s === "L" || s === "LIVRE" || s === "0") return "L";

  // pega primeiro número (10/12/14/16/18)
  const m = s.match(/\b(10|12|14|16|18)\b/);
  if (m?.[1]) return m[1];

  // alguns formatos podem vir como "16 ANOS"
  const m2 = s.match(/(10|12|14|16|18)/);
  if (m2?.[1]) return m2[1];

  return null;
}

/**
 * Normaliza rating US para maturity (fallback quando não existir BR)
 */
function normalizeUsRatingToMaturity(raw: string | null | undefined): string | null {
  const r = String(raw || "").trim().toUpperCase();
  if (!r || r === "N/A" || r === "NOT RATED" || r === "UNRATED") return null;

  // TV
  if (r === "TV-MA") return "18";
  if (r === "TV-14") return "14";
  if (r === "TV-PG") return "10";
  if (r === "TV-G" || r === "TV-Y" || r === "TV-Y7") return "L";

  // Movies (MPA)
  if (r === "NC-17") return "18";
  if (r === "R") return "16";
  if (r === "PG-13") return "12";
  if (r === "PG") return "10";
  if (r === "G") return "L";

  // heurística
  if (r.includes("18")) return "18";
  if (r.includes("16")) return "16";
  if (r.includes("14")) return "14";
  if (r.includes("12")) return "12";
  if (r.includes("10")) return "10";

  return null;
}

/**
 * Regras de categorias:
 * - Sempre adiciona "Filmes" ou "Séries" baseado no tipo
 * - "Novidades" se ano >= (ano atual - 1)
 * - "Em alta" se popularity >= 80 (ajuste se quiser)
 * - Mapeia gêneros (tags) para categorias PT-BR
 */
function buildCategories(params: {
  type: MediaType;
  year?: number | null;
  genres?: string[];
  popularity?: number | null;
}) {
  const { type, year, genres = [], popularity } = params;

  const cats: string[] = [];
  cats.push(type === "tv" ? "Séries" : "Filmes");

  const nowYear = new Date().getFullYear();
  if (year && year >= nowYear - 1) cats.push("Novidades");

  if (typeof popularity === "number" && popularity >= 80) cats.push("Em alta");

  const map: Record<string, string> = {
    Action: "Ação",
    "Action & Adventure": "Ação",
    Adventure: "Aventura",
    Animation: "Animação",
    Comedy: "Comédia",
    Crime: "Crime",
    Documentary: "Documentários",
    Drama: "Drama",
    Family: "Família",
    Fantasy: "Fantasia",
    History: "História",
    Horror: "Terror",
    Music: "Música",
    Mystery: "Mistério",
    Romance: "Romance",
    "Science Fiction": "Ficção científica",
    "Sci-Fi & Fantasy": "Ficção científica",
    Thriller: "Suspense",
    "TV Movie": "Filmes",
    War: "Guerra",
    Western: "Faroeste",
  };

  for (const g of genres) {
    const key = normalizeStr(g);
    if (map[key]) cats.push(map[key]);
  }

  return uniq(cats);
}

/**
 * Busca certificação BR/US no TMDB:
 * - movie: /movie/{id}/release_dates
 * - tv:    /tv/{id}/content_ratings
 */
async function fetchMovieCertifications(tmdbId: number, headers: Record<string, string>) {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}/release_dates`;
  const res = await fetch(url, { headers });
  if (!res.ok) return { br: null as string | null, us: null as string | null };

  const j = await res.json().catch(() => ({} as any));
  const results = Array.isArray(j?.results) ? j.results : [];

  function pick(iso: string): string | null {
    const bucket = results.find((x: any) => String(x?.iso_3166_1 || "").toUpperCase() === iso);
    const rel = Array.isArray(bucket?.release_dates) ? bucket.release_dates : [];
    // pega o primeiro certification não-vazio
    for (const r of rel) {
      const c = String(r?.certification || "").trim();
      if (c) return c;
    }
    return null;
  }

  return {
    br: pick("BR"),
    us: pick("US"),
  };
}

async function fetchTvCertifications(tmdbId: number, headers: Record<string, string>) {
  const url = `https://api.themoviedb.org/3/tv/${tmdbId}/content_ratings`;
  const res = await fetch(url, { headers });
  if (!res.ok) return { br: null as string | null, us: null as string | null };

  const j = await res.json().catch(() => ({} as any));
  const results = Array.isArray(j?.results) ? j.results : [];

  function pick(iso: string): string | null {
    const row = results.find((x: any) => String(x?.iso_3166_1 || "").toUpperCase() === iso);
    const rating = String(row?.rating || "").trim();
    return rating || null;
  }

  return {
    br: pick("BR"),
    us: pick("US"),
  };
}

// 1) /find/{imdb_id} -> tmdb_id e tipo (movie/tv)
// 2) /movie/{id} ou /tv/{id} -> detalhes
// 3) /movie/{id}/credits ou /tv/{id}/credits -> elenco (e diretor só para filmes)
// 4) ✅ certificação BR/US (release_dates/content_ratings)
Deno.serve(async (req) => {
  try {
    // Preflight CORS
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return json({ error: "Use POST" }, 405);
    }

    const token = Deno.env.get("TMDB_READ_TOKEN");
    if (!token) return json({ error: "Missing TMDB_READ_TOKEN secret" }, 500);

    const body = await req.json().catch(() => ({}));
    const imdbId = String(body?.imdbId || "").trim();

    if (!imdbId || !imdbId.startsWith("tt")) {
      return json({ error: "Envie imdbId válido. Ex: tt4574334" }, 400);
    }

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json;charset=utf-8",
    };

    // 1) discover via /find
    const findUrl = `https://api.themoviedb.org/3/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`;

    const findRes = await fetch(findUrl, { headers });
    if (!findRes.ok) {
      const t = await findRes.text().catch(() => "");
      return json({ error: "TMDB find failed", status: findRes.status, details: t }, 502);
    }

    const findJson = await findRes.json();

    const movie = Array.isArray(findJson?.movie_results) ? findJson.movie_results[0] : null;
    const tv = Array.isArray(findJson?.tv_results) ? findJson.tv_results[0] : null;

    let mediaType: MediaType | null = null;
    let tmdbId: number | null = null;

    if (movie?.id) {
      mediaType = "movie";
      tmdbId = Number(movie.id);
    } else if (tv?.id) {
      mediaType = "tv";
      tmdbId = Number(tv.id);
    }

    if (!mediaType || !tmdbId) {
      return json({ error: "Não encontrado no TMDB", imdbId }, 404);
    }

    // 2) details
    const detailsUrl =
      mediaType === "movie"
        ? `https://api.themoviedb.org/3/movie/${tmdbId}?language=pt-BR`
        : `https://api.themoviedb.org/3/tv/${tmdbId}?language=pt-BR`;

    // 3) credits
    const creditsUrl =
      mediaType === "movie"
        ? `https://api.themoviedb.org/3/movie/${tmdbId}/credits?language=pt-BR`
        : `https://api.themoviedb.org/3/tv/${tmdbId}/credits?language=pt-BR`;

    // 4) certifications
    const certPromise =
      mediaType === "movie"
        ? fetchMovieCertifications(tmdbId, headers)
        : fetchTvCertifications(tmdbId, headers);

    const [detRes, credRes, cert] = await Promise.all([
      fetch(detailsUrl, { headers }),
      fetch(creditsUrl, { headers }),
      certPromise,
    ]);

    if (!detRes.ok) {
      const t = await detRes.text().catch(() => "");
      return json({ error: "TMDB details failed", status: detRes.status, details: t }, 502);
    }
    if (!credRes.ok) {
      const t = await credRes.text().catch(() => "");
      return json({ error: "TMDB credits failed", status: credRes.status, details: t }, 502);
    }

    const det = await detRes.json();
    const credits = await credRes.json();

    const title = mediaType === "movie" ? det?.title : det?.name;

    const year =
      mediaType === "movie"
        ? yearFromDate(det?.release_date)
        : yearFromDate(det?.first_air_date);

    const synopsis = det?.overview || "";
    const popularity = typeof det?.popularity === "number" ? det.popularity : null;

    const genres = Array.isArray(det?.genres)
      ? det.genres.map((g: any) => g?.name).filter(Boolean)
      : [];

    const posterPath = det?.poster_path ? String(det.poster_path) : "";
    const backdropPath = det?.backdrop_path ? String(det.backdrop_path) : "";

    const posterUrl = posterPath ? `https://image.tmdb.org/t/p/w780${posterPath}` : "";
    const backdropUrl = backdropPath ? `https://image.tmdb.org/t/p/w1280${backdropPath}` : "";

    // ✅ runtime
    let runtime_minutes: number | null = null;
    if (mediaType === "movie") {
      runtime_minutes = typeof det?.runtime === "number" ? det.runtime : null;
    } else {
      // tv: episode_run_time geralmente é array
      const arr = Array.isArray(det?.episode_run_time) ? det.episode_run_time : [];
      const first = typeof arr?.[0] === "number" ? arr[0] : null;
      runtime_minutes = first && Number.isFinite(first) ? first : null;
    }
    const duration_label = minutesToLabel(runtime_minutes);

    // ✅ elenco (top 12)
    const castNames = takeNames(credits?.cast, 12);

    // ✅ diretor APENAS para FILMES
    const director = mediaType === "movie" ? pickMovieDirector(credits) : "";

    // ✅ criadores (apenas TV)
    const creators = mediaType === "tv" ? takeNames(det?.created_by, 8) : [];

    // ✅ categorias automáticas
    const categories = buildCategories({
      type: mediaType,
      year,
      genres,
      popularity,
    });

    // ✅ certificação (BR primeiro, depois US)
    const certification_br = cert?.br || null;
    const certification_us = cert?.us || null;

    const maturity_br = normalizeBrRatingToMaturity(certification_br);
    const maturity_us = normalizeUsRatingToMaturity(certification_us);

    const maturity = maturity_br || maturity_us || null;

    return json({
      ok: true,
      imdbId,
      tmdb: { id: tmdbId, type: mediaType },
      data: {
        title: title || "",
        year,
        synopsis,

        tags: genres,
        categories,

        thumbUrl: posterUrl,
        backdropUrl,

        // ✅ runtime
        runtime_minutes,
        duration_label,

        // ✅ classificação (preferindo BR)
        maturity, // <- seu front já lê res.data.maturity
        certification_br,
        certification_us,

        // ✅ pessoas (ALINHADO com seu AdminTitleEdit.jsx)
        cast: castNames,
        // compat (caso você tenha algo antigo lendo cast_names)
        cast_names: castNames,

        director,   // filme
        creators,   // tv
      },
    });
  } catch (e: any) {
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
