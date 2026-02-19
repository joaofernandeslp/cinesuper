// src/components/home/Billboard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Container from "../layout/Container.jsx";
import { getHeroMedia } from "../../data/mockCatalog.js";
import { supabase } from "../../lib/supabaseClient.js";

function isHttpUrl(v) {
  return /^https?:\/\//i.test(String(v || "").trim());
}

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY;

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

function normMediaType(v) {
  const s = String(v || "").toLowerCase().trim();
  if (s === "movie" || s === "tv") return s;
  return "";
}

function tmdbImg(path, size = "w500") {
  if (!path) return "";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function pickBestLogo(logos = []) {
  if (!Array.isArray(logos) || logos.length === 0) return null;

  // ordena por qualidade (vote_average), depois por largura (mais nítida)
  const sorted = [...logos].sort((a, b) => {
    const va = Number(a?.vote_average ?? 0);
    const vb = Number(b?.vote_average ?? 0);
    if (vb !== va) return vb - va;

    const wa = Number(a?.width ?? 0);
    const wb = Number(b?.width ?? 0);
    return wb - wa;
  });

  // prioriza PNG (logos TMDB geralmente são png)
  const pngFirst = sorted.find((l) => String(l?.file_path || "").toLowerCase().endsWith(".png"));
  return pngFirst || sorted[0] || null;
}

async function tmdbFetchJson(path) {
  const url = `https://api.themoviedb.org/3${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(
    TMDB_KEY || ""
  )}`;

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`TMDB ${res.status} ${res.statusText}`);
  return res.json();
}

export default function Billboard({ item }) {
  const nav = useNavigate();

  const [videoOk, setVideoOk] = useState(true);
  const [signedPreviewUrl, setSignedPreviewUrl] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [logoUrl, setLogoUrl] = useState("");
  const [loadingLogo, setLoadingLogo] = useState(false);

  const hero = useMemo(() => getHeroMedia(item?.heroImage), [item?.heroImage]);

  // no seu caso isso é KEY: ".../preview.mp4"
  const previewKey = useMemo(() => {
    return String(item?.heroPreviewUrl || item?.hero_preview_url || "").trim();
  }, [item?.heroPreviewUrl, item?.hero_preview_url]);

  // poster: usa thumb/hero_image_url (geralmente público via TMDB)
  const previewPoster = useMemo(() => {
    return (
      String(item?.thumb_url || item?.thumb || "").trim() ||
      String(item?.hero_image_url || item?.bannerImage || "").trim()
    );
  }, [item?.thumb_url, item?.thumb, item?.hero_image_url, item?.bannerImage]);

  // presign do preview (R2)
  useEffect(() => {
    let alive = true;

    setSignedPreviewUrl("");
    setVideoOk(true);

    async function run() {
      const key = String(previewKey || "").trim();
      if (!key) return;

      // se por acaso vier URL http, usa direto
      if (isHttpUrl(key)) {
        setSignedPreviewUrl(key);
        return;
      }

      setLoadingPreview(true);
      try {
        const { data, error } = await supabase.functions.invoke("r2-presign", {
          body: { key, expiresIn: 900 },
        });

        if (!alive) return;
        if (error || !data?.ok) return;

        setSignedPreviewUrl(String(data.url || ""));
      } catch {
        if (!alive) return;
      } finally {
        if (!alive) return;
        setLoadingPreview(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [previewKey]);

  // LOGO via TMDB (fallback para texto)
  // Ordem:
  // 1) item.logo_url (se você já gravar no catálogo)
  // 2) item.tmdb_id (+ media_type) -> /images
  // 3) item.imdb_id -> /find/{imdb_id} -> /images
  const lastLogoKeyRef = useRef("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLogoUrl("");

      // Se você já guardar uma logo no item, usa direto.
      const directLogo =
        String(item?.logo_url || item?.logoUrl || "").trim() ||
        String(item?.tmdb_logo_url || "").trim();

      if (directLogo) {
        setLogoUrl(directLogo);
        return;
      }

      if (!TMDB_KEY || !item) return;

      const tmdbIdRaw = String(item?.tmdb_id || item?.tmdbId || "").trim();
      const imdbIdRaw = String(item?.imdb_id || item?.imdbId || "").trim();
      const mediaTypeRaw = normMediaType(item?.media_type || item?.mediaType || item?.type);

      const dedupeKey = `${tmdbIdRaw}|${imdbIdRaw}|${mediaTypeRaw}`;
      if (lastLogoKeyRef.current === dedupeKey) return;
      lastLogoKeyRef.current = dedupeKey;

      setLoadingLogo(true);

      try {
        let tmdbId = tmdbIdRaw ? Number(tmdbIdRaw) : 0;
        let mediaType = mediaTypeRaw; // "movie" | "tv"

        // Se não tiver tmdb_id, tenta resolver via imdb_id
        if (!tmdbId && imdbIdRaw) {
          const find = await tmdbFetchJson(`/find/${encodeURIComponent(imdbIdRaw)}?external_source=imdb_id`);
          const movieHit = Array.isArray(find?.movie_results) ? find.movie_results[0] : null;
          const tvHit = Array.isArray(find?.tv_results) ? find.tv_results[0] : null;

          if (movieHit?.id) {
            tmdbId = Number(movieHit.id);
            mediaType = "movie";
          } else if (tvHit?.id) {
            tmdbId = Number(tvHit.id);
            mediaType = "tv";
          }
        }

        if (!tmdbId || !mediaType) return;

        // pega logos (pt/en/null)
        const img = await tmdbFetchJson(
          `/${mediaType}/${tmdbId}/images?include_image_language=pt,en,null`
        );

        const best = pickBestLogo(img?.logos || []);
        if (!best?.file_path) return;

        if (!alive) return;

        // w500 costuma ficar ótimo; se quiser mais nítido, troque por "w780" ou "original"
        setLogoUrl(tmdbImg(best.file_path, "w500"));
      } catch {
        // silencioso: cai no fallback de texto
      } finally {
        if (!alive) return;
        setLoadingLogo(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [item]);

  // skeleton
  if (!item) {
    return (
      <section className="relative w-screen left-1/2 -translate-x-1/2">
        <div id="cs-nav-sentinel" className="absolute top-16 left-0 h-px w-px opacity-0 pointer-events-none" />
        <div className="relative h-[72vh] min-h-[520px] w-screen">
          <div className="absolute -top-16 inset-x-0 bottom-0 overflow-hidden">
            <div className="absolute inset-0 bg-black" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/45 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            <div className="absolute inset-0 [background:radial-gradient(70%_60%_at_70%_35%,rgba(255,255,255,0.08),rgba(0,0,0,0)_55%)]" />
          </div>
        </div>
      </section>
    );
  }

  const canPlayPreview = !!signedPreviewUrl && videoOk;

  function handleVideoError(e) {
    const v = e?.currentTarget;
    const err = v?.error || null;

    console.log("[Billboard] video error", {
      code: err?.code ?? null,
      message: err?.message ?? null,
      networkState: v?.networkState ?? null,
      readyState: v?.readyState ?? null,
      currentSrc: v?.currentSrc ?? null,
      src: signedPreviewUrl,
    });

    setVideoOk(false);
  }

  return (
    <section className="relative w-screen left-1/2 -translate-x-1/2">
      <div id="cs-nav-sentinel" className="absolute top-[72px] left-0 h-2 w-2 opacity-0 pointer-events-none" />

      <div className="relative h-[72vh] min-h-[520px] w-screen">
        {/* BACKDROP (igual “vibe” da TV) */}
        <div className="absolute -top-16 inset-x-0 bottom-0 overflow-hidden">
          {canPlayPreview ? (
            <video
              src={signedPreviewUrl}
              poster={previewPoster || undefined}
              autoPlay
              muted
              playsInline
              loop
              preload="auto"
              crossOrigin="anonymous"
              onError={handleVideoError}
              onCanPlay={(e) => console.log("[Billboard] canplay:", e.currentTarget?.currentSrc)}
              onPlaying={() => console.log("[Billboard] playing")}
              className="
                pointer-events-none
                absolute left-1/2 top-1/2
                h-[192%] w-[130%]
                -translate-x-1/2 -translate-y-1/2
                object-cover
                opacity-90
              "
            />
          ) : hero?.type === "youtube" ? (
            <div className="absolute inset-0">
              <iframe
                src={hero.src}
                title={item.title || "CineSuper"}
                frameBorder="0"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="
                  pointer-events-none
                  absolute left-1/2 top-1/2
                  h-[192%] w-[130%]
                  -translate-x-1/2 -translate-y-1/2
                "
              />
            </div>
          ) : hero?.src ? (
            <img
              src={hero.src}
              alt={item.title || "CineSuper"}
              className="absolute inset-0 h-full w-full object-cover opacity-90"
              loading="eager"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 bg-black" />
          )}

          {/* OVERLAYS (menos “seco”, mais cinema) */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/45 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
          <div className="absolute inset-0 [background:radial-gradient(70%_60%_at_70%_35%,rgba(255,255,255,0.08),rgba(0,0,0,0)_55%)]" />
          <div className="absolute inset-0 [box-shadow:inset_0_-120px_160px_rgba(0,0,0,0.75)]" />

          {loadingPreview ? (
            <div className="absolute bottom-3 right-3 text-xs text-white/45 bg-black/40 border border-white/10 rounded-md px-2 py-1">
              Carregando preview...
            </div>
          ) : null}
        </div>

        {/* CONTEÚDO */}
        <div className="absolute bottom-20 md:bottom-16 left-0 right-0">
          <Container>
            <div className="max-w-[680px]">
              {/* Logo do título (TMDB) no lugar do texto */}
              {logoUrl ? (
                <div className="mt-2">
                  <img
                    src={logoUrl}
                    alt={item.title || "CineSuper"}
                    draggable={false}
                    loading="eager"
                    className={cx(
                      "max-h-[108px] md:max-h-[128px] w-auto object-contain",
                      "drop-shadow-[0_10px_24px_rgba(0,0,0,0.70)]"
                    )}
                  />
                  {loadingLogo ? (
                    <div className="mt-2 text-xs text-white/45">Carregando logo...</div>
                  ) : null}
                </div>
              ) : (
                <h1 className="mt-2 text-4xl md:text-6xl font-black tracking-tight">
                  {item.title}
                </h1>
              )}

              <div className="mt-4 flex items-center gap-3 text-sm text-white/80">
                {item.year ? <span>{item.year}</span> : null}
                {item.maturity ? <span className="rounded bg-white/10 px-2 py-0.5">{item.maturity}</span> : null}
                {item.duration ? <span>{item.duration}</span> : null}
              </div>

              {item.synopsis ? (
                <p className="mt-4 text-base md:text-lg text-white/80 line-clamp-3">{item.synopsis}</p>
              ) : null}

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => nav(`/watch/${item.id}`)}
                  className="rounded bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-white/90"
                >
                  Assistir
                </button>
                <button
                  onClick={() => nav(`/t/${item.id}`)}
                  className="rounded bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
                >
                  Mais informações
                </button>
              </div>

              {/* Debug opcional: se quiser ver quais IDs tem no item */}
              {/* <pre className="mt-4 text-xs text-white/40">{JSON.stringify({ tmdb_id: item.tmdb_id, imdb_id: item.imdb_id, media_type: item.media_type }, null, 2)}</pre> */}
            </div>
          </Container>
        </div>
      </div>
    </section>
  );
}
