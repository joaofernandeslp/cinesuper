// src/pages/tv/components/TvHero.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Info } from "lucide-react";
import { cx } from "../_tvKeys.js";

const TMDB_KEY = (import.meta?.env?.VITE_TMDB_KEY || "").trim();
const OMDB_KEY = (import.meta?.env?.VITE_IMDB_KEY || "").trim(); // chave do OMDb

// Em TV, "original" costuma causar stutter (decode + scale). Use w1280 (rápido) ou w1920 (mais nítido).
const TMDB_BACKDROP_SIZE = "w1280"; // "w1280" | "w1920" | "original"
const TMDB_BACKDROP_BASE = `https://image.tmdb.org/t/p/${TMDB_BACKDROP_SIZE}`;

// Logo não precisa ser "original" (você exibe pequeno). Isso reduz custo de decode/memória.
const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/w500";

const DEV = Boolean(import.meta.env.DEV);

// knobs
const MAX_SLIDES = 4;          // antes: 8
const PRELOAD_FIRST = 2;       // antes: preload de todos
const ROTATE_MS = 6500;
const FADE_MS = 900;

function isProbablyImageUrl(v) {
  const s = String(v || "").trim();
  if (!s) return false;
  if (!/^https?:\/\//i.test(s) && !/^\/|^\.\//.test(s)) return false;
  return /\.(png|jpe?g|webp|gif)$/i.test(s) || s.includes("image");
}

function pickHeroBackdropFromCatalog(item) {
  if (!item) return "";
  const hero = String(item?.heroImage || item?.hero_image_url || "").trim();
  if (isProbablyImageUrl(hero)) return hero;
  const thumb = String(item?.thumb || item?.thumb_url || "").trim();
  if (isProbablyImageUrl(thumb)) return thumb;
  return "";
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

// 1) Se não tiver imdb_id no item, tenta achar no OMDb por título/ano
async function resolveImdbIdViaOmdb(item, signal) {
  if (!OMDB_KEY) return "";
  const title = guessTitle(item);
  if (!title) return "";
  const year = guessYear(item);

  const cacheKey = `cs_tvhero_omdb_imdb:${title.toLowerCase()}:${year || ""}`;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) return String(raw || "");
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

// 2) Resolve TMDB id/type via tmdb_id (se existir) -> imdb_id (/find) -> search
async function resolveTmdbId(item, signal) {
  // a) se você já tiver no item
  const tmdbId = item?.tmdb_id || item?.tmdbId || item?.tmdb || null;
  const tmdbType = String(item?.tmdb_type || item?.tmdbType || item?.media_type || "").trim();
  if (tmdbId && (tmdbType === "movie" || tmdbType === "tv")) {
    return { id: Number(tmdbId), type: tmdbType, via: "item.tmdb" };
  }

  // b) imdb_id do item ou OMDb
  let imdb = getImdbIdFromItem(item);
  if (!imdb) imdb = await resolveImdbIdViaOmdb(item, signal);

  if (imdb && TMDB_KEY) {
    const url = `https://api.themoviedb.org/3/find/${encodeURIComponent(imdb)}?api_key=${encodeURIComponent(
      TMDB_KEY
    )}&external_source=imdb_id`;

    const j = await tmdbFetchJson(url, signal);
    const mv = Array.isArray(j?.movie_results) ? j.movie_results : [];
    const tv = Array.isArray(j?.tv_results) ? j.tv_results : [];

    if (mv[0]?.id) return { id: Number(mv[0].id), type: "movie", via: "tmdb.find(imdb)" };
    if (tv[0]?.id) return { id: Number(tv[0].id), type: "tv", via: "tmdb.find(imdb)" };
  }

  // c) fallback por título
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

    if (scored[0]) return { id: scored[0].id, type: scored[0].type, via: "tmdb.search" };
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

function pickTopBackdrops(backdrops, n = 8) {
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

  // prefer 16:9
  const a169 = all.filter((x) => x.aspect >= 1.55 && x.aspect <= 2.05);
  const base = a169.length ? a169 : all;

  base.sort((a, b) => {
    if (b.vote !== a.vote) return b.vote - a.vote;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return b.w - a.w;
  });

  return uniq(base.slice(0, n).map((x) => `${TMDB_BACKDROP_BASE}${x.path}`));
}

function pickTopPosters(posters, n = 8) {
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

// Pack: backdrops (prefer) + posters (fallback) + logo
async function fetchTmdbHeroPack(item, signal) {
  if (!TMDB_KEY) return null;

  const resolved = await resolveTmdbId(item, signal);
  if (!resolved?.id || !resolved?.type) return null;

  const cacheKey = `cs_tvhero_pack_v4:${resolved.type}:${resolved.id}:${TMDB_BACKDROP_SIZE}`;
  try {
    const raw = sessionStorage.getItem(cacheKey);
    if (raw) {
      const j = JSON.parse(raw);
      if (Array.isArray(j?.slides) && j.slides.length) return { ...j, resolved };
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

  // reduz para 4 (menos decode/memória)
  const slides = uniq([detailsBackdrop, ...backdrops, ...posters]).filter(Boolean).slice(0, MAX_SLIDES);

  const out = { slides, logo: logo || "" };
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(out));
  } catch {}

  return { ...out, resolved };
}

export default function TvHero({
  item,
  focusIndex, // 0=play, 1=info, -1=not focused
  setBtnRef,
  onPlay,
  onInfo,
  visible,
}) {
  if (!visible || !item) return null;

  const title = useMemo(() => String(item?.title || ""), [item?.title]);
  const synopsis = useMemo(() => String(item?.synopsis || "").trim(), [item?.synopsis]);

  const meta = useMemo(() => {
    return [item?.year ? String(item.year) : "", item?.maturity ? String(item.maturity) : "", item?.duration ? String(item.duration) : ""]
      .filter(Boolean)
      .join(" • ");
  }, [item?.year, item?.maturity, item?.duration]);

  const [slides, setSlides] = useState([]);
  const [filmLogo, setFilmLogo] = useState("");
  const [debug, setDebug] = useState({ via: "", n: 0 });

  // 1) resolve pack (TMDB primeiro). Só cai pro catálogo se TMDB falhar.
  // Importante: inclui "visible" para limpar/pausar quando o Hero não está na tela.
  useEffect(() => {
    if (!visible) return;

    let alive = true;
    const ctrl = new AbortController();

    async function run() {
      try {
        const pack = await fetchTmdbHeroPack(item, ctrl.signal);
        if (!alive) return;

        if (pack?.slides?.length) {
          // preload só das primeiras 2 (o resto entra sob demanda na rotação)
          pack.slides.slice(0, PRELOAD_FIRST).forEach(preload);
          if (pack.logo) preload(pack.logo);

          setSlides(pack.slides);
          setFilmLogo(pack.logo || "");

          if (DEV) setDebug({ via: pack?.resolved?.via || "tmdb", n: pack.slides.length });
          return;
        }
      } catch (e) {
        if (DEV) console.warn("[TvHero] TMDB pack failed:", e);
      }

      const catalogBg = pickHeroBackdropFromCatalog(item);
      if (!alive) return;

      if (catalogBg) {
        preload(catalogBg);
        setSlides([catalogBg]);
        setFilmLogo("");
        if (DEV) setDebug({ via: "catalog", n: 1 });
      } else {
        setSlides([]);
        setFilmLogo("");
        if (DEV) setDebug({ via: "none", n: 0 });
      }
    }

    run();

    return () => {
      alive = false;
      try {
        ctrl.abort();
      } catch {}
    };
  }, [item, visible]);

  // 2) crossfade A/B + rotação (pausa quando visible=false)
  const [layerA, setLayerA] = useState("");
  const [layerB, setLayerB] = useState("");
  const [activeLayer, setActiveLayer] = useState("A");
  const activeRef = useRef("A");
  const pendingRef = useRef(null);
  const idxRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    // se saiu da tela, mata o timer
    if (!visible) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    const list = Array.isArray(slides) ? slides : [];
    if (!list.length) return;

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;

    idxRef.current = 0;
    activeRef.current = "A";
    pendingRef.current = null;

    setLayerA(list[0]);
    setLayerB(list[1] || list[0]);
    setActiveLayer("A");

    // roda só se >=2
    if (list.length >= 2) {
      idxRef.current = 2;

      timerRef.current = setInterval(() => {
        const urls = Array.isArray(slides) ? slides : [];
        if (urls.length < 2) return;

        const next = urls[idxRef.current % urls.length];
        idxRef.current = (idxRef.current + 1) % urls.length;

        const cur = activeRef.current;
        const target = cur === "A" ? "B" : "A";
        pendingRef.current = target;

        if (target === "A") setLayerA(next);
        else setLayerB(next);

        // preload do próximo “na hora certa”
        preload(next);
      }, ROTATE_MS);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [slides, visible]);

  function onImgLoaded(which) {
    if (pendingRef.current !== which) return;
    setActiveLayer(which);
    activeRef.current = which;
    pendingRef.current = null;
  }

  const showA = activeLayer === "A";

  return (
    <section className="relative w-full">
      <div className="relative w-full h-[740px] bg-black">
        {/* BACKGROUNDS */}
        <div className="absolute inset-0 overflow-hidden">
          {layerA ? (
            <img
              src={layerA}
              alt={title}
              draggable={false}
              decoding="async"
              fetchPriority="high"
              className={cx(
                "absolute inset-0 w-full h-full object-cover transition-opacity",
                `duration-[${FADE_MS}ms]`,
                showA ? "opacity-100" : "opacity-0"
              )}
              style={{
                objectPosition: "right 18%",
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
              alt={title}
              draggable={false}
              decoding="async"
              className={cx(
                "absolute inset-0 w-full h-full object-cover transition-opacity",
                `duration-[${FADE_MS}ms]`,
                showA ? "opacity-0" : "opacity-100"
              )}
              style={{
                objectPosition: "right 18%",
                willChange: "opacity",
                transform: "translate3d(0,0,0)",
                backfaceVisibility: "hidden",
              }}
              onLoad={() => onImgLoaded("B")}
            />
          ) : null}
        </div>

        {/* OVERLAYS (mantive seu visual) */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-black/10" />

          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg," +
                "rgba(0,0,0,0.92) 0%," +
                "rgba(0,0,0,0.92) 36%," +
                "rgba(0,0,0,0.74) 50%," +
                "rgba(0,0,0,0.46) 62%," +
                "rgba(0,0,0,0.20) 72%," +
                "rgba(0,0,0,0.00) 84%)",
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: "radial-gradient(62% 78% at 52% 52%, rgba(0,0,0,0.26), rgba(0,0,0,0) 68%)",
            }}
          />

          <div className="absolute left-0 right-0 bottom-0 h-[340px] bg-gradient-to-t from-black via-black/85 to-transparent" />
        </div>

        {/* LOGO (canto superior direito) */}
        <div className="absolute right-14 top-10 z-10 pointer-events-none">
          <div className="inline-block rounded-3xl border border-white/0 bg-black/0 px-5 py-4" style={{ backdropFilter: "blur(0px)" }}>
            {filmLogo ? (
              <img
                src={filmLogo}
                alt={title || "Destaque"}
                draggable={false}
                className="max-h-[150px] w-auto object-contain"
                style={{ filter: "drop-shadow(0 18px 55px rgba(0,0,0,0.75))" }}
              />
            ) : (
              <div className="text-white text-[30px] font-extrabold tracking-tight" style={{ textShadow: "0 18px 55px rgba(0,0,0,0.75)" }}>
                {title || "Destaque"}
              </div>
            )}
          </div>
        </div>

        {/* CONTENT */}
        <div className="relative z-10 h-full flex flex-col justify-end px-14 pb-16">
          <div className="max-w-[920px] ml-10">
            {meta ? <div className="text-white/70 text-[18px] mb-3">{meta}</div> : null}

            <div className="text-[62px] leading-[1.02] font-extrabold text-white drop-shadow">{title || "Destaque"}</div>

            {synopsis ? (
              <div className="mt-5 text-white/85 text-[22px] leading-relaxed line-clamp-3">{synopsis}</div>
            ) : null}

            <div className="mt-8 flex items-center gap-4">
              <button
                ref={(el) => setBtnRef(0, el)}
                tabIndex={focusIndex === 0 ? 0 : -1}
                type="button"
                onClick={onPlay}
                className={cx(
                  "outline-none select-none rounded-2xl",
                  "inline-flex items-center gap-3 px-9 py-4 font-bold text-[18px]",
                  "bg-white text-black",
                  focusIndex === 0 ? "ring-4 ring-white/90 scale-[1.02]" : ""
                )}
              >
                <Play className="h-6 w-6" />
                Assistir
              </button>

              <button
                ref={(el) => setBtnRef(1, el)}
                tabIndex={focusIndex === 1 ? 0 : -1}
                type="button"
                onClick={onInfo}
                className={cx(
                  "outline-none select-none rounded-2xl",
                  "inline-flex items-center gap-3 px-9 py-4 font-bold text-[18px]",
                  "bg-white/20 text-white",
                  focusIndex === 1 ? "ring-4 ring-white/90 scale-[1.02]" : ""
                )}
              >
                <Info className="h-6 w-6" />
                Mais informações
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
