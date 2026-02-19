// src/components/browse/Top10Hero.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";

const TMDB_KEY = import.meta.env.VITE_TMDB_KEY;

function normMediaType(v) {
  const s = String(v || "").toLowerCase().trim();
  if (s === "movie" || s === "tv") return s;
  if (s === "film") return "movie";
  if (s === "series" || s === "show") return "tv";
  return "";
}

function tmdbImg(path, size = "w780") {
  if (!path) return "";
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function pickBestLogo(logos = []) {
  if (!Array.isArray(logos) || logos.length === 0) return null;

  const sorted = [...logos].sort((a, b) => {
    const va = Number(a?.vote_average ?? 0);
    const vb = Number(b?.vote_average ?? 0);
    if (vb !== va) return vb - va;

    const wa = Number(a?.width ?? 0);
    const wb = Number(b?.width ?? 0);
    return wb - wa;
  });

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

function pickBackdrop(item) {
  return (
    String(item?.hero_image_url || "").trim() ||
    String(item?.bannerImage || "").trim() ||
    String(item?.backdrop_url || "").trim() ||
    String(item?.backdrop || "").trim() ||
    String(item?.thumb || "").trim()
  );
}

function pickThumb(item) {
  return String(item?.thumb || item?.poster || item?.poster_url || "").trim() || pickBackdrop(item);
}

function pickTitleId(item) {
  return String(item?.public_id || item?.publicId || item?.id || "").trim();
}

export default function Top10Hero({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return null;

  const [activeIndex, setActiveIndex] = useState(0);
  const SIDE_STACK_SIZE = 4;
  const HERO_H = "h-[300px] lg:h-[340px]";

  useEffect(() => {
    if (activeIndex >= list.length) setActiveIndex(0);
  }, [activeIndex, list.length]);

  const hero = list[activeIndex] || list[0];
  const rank = activeIndex + 1;
  const leftItems = list.slice(0, activeIndex);
  const rightItems = list.slice(activeIndex + 1, 10);
  const leftStack = leftItems.slice(-SIDE_STACK_SIZE);
  const rightStack = rightItems.slice(0, SIDE_STACK_SIZE);
  const rightColWidth = rightStack.length ? Math.min(200, 48 + rightStack.length * 48) : 0;

  const heroBackdrop = useMemo(() => pickBackdrop(hero), [hero]);
  const heroTitle = String(hero?.title || "").trim();

  const [logoUrl, setLogoUrl] = useState("");
  const logoKeyRef = useRef("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setLogoUrl("");

      const directLogo =
        String(hero?.logo_url || hero?.logoUrl || "").trim() || String(hero?.tmdb_logo_url || "").trim();
      if (directLogo) {
        setLogoUrl(directLogo);
        return;
      }

      if (!TMDB_KEY || !hero) return;

      const tmdbIdRaw = String(hero?.tmdb_id || hero?.tmdbId || "").trim();
      const imdbIdRaw = String(hero?.imdb_id || hero?.imdbId || "").trim();
      const mediaTypeRaw = normMediaType(hero?.media_type || hero?.mediaType || hero?.type);

      const dedupeKey = `${tmdbIdRaw}|${imdbIdRaw}|${mediaTypeRaw}`;
      if (logoKeyRef.current === dedupeKey) return;
      logoKeyRef.current = dedupeKey;

      try {
        let tmdbId = tmdbIdRaw ? Number(tmdbIdRaw) : 0;
        let mediaType = mediaTypeRaw;

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

        const img = await tmdbFetchJson(`/${mediaType}/${tmdbId}/images?include_image_language=pt,en,null`);
        const best = pickBestLogo(img?.logos || []);
        if (!best?.file_path) return;

        if (!alive) return;
        setLogoUrl(tmdbImg(best.file_path, "original"));
      } catch {
        // silencioso
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [hero]);

  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.25em] text-white/70">Top 10 CineSuper</div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-black/70">
        <div
          className="grid grid-cols-1 lg:[grid-template-columns:200px_minmax(0,1fr)_var(--cs-top10-right)]"
          style={{
            "--cs-top10-right": `${rightColWidth}px`,
            gridTemplateColumns: rightColWidth ? "200px minmax(0,1fr) var(--cs-top10-right)" : undefined,
          }}
        >
          {/* Left rank panel */}
          <div className={`relative hidden lg:flex flex-col bg-gradient-to-b from-black/80 via-black/60 to-black/90 overflow-hidden ${HERO_H}`}>
            <div className="absolute inset-0 bg-[radial-gradient(90%_120%_at_50%_10%,rgba(255,255,255,0.08),transparent_60%)]" />
            <div className="relative z-10 h-[96px] shrink-0 flex items-center justify-center">
              <div className="text-[72px] font-black leading-none text-white/20 select-none">#{rank}</div>
            </div>
            <div className="relative z-10 flex-1 w-full flex items-stretch justify-start pl-4 pr-2 pb-3">
              {leftStack.map((it, idx) => {
                const n = leftItems.length - leftStack.length + idx + 1;
                const tid = pickTitleId(it);
                const thumb = pickThumb(it);
                const title = String(it?.title || "").trim();
                return (
                  <button
                    key={`${tid || "top"}:${n}`}
                    type="button"
                    onClick={() => setActiveIndex(n - 1)}
                    className={[
                      "group relative h-full w-[92px] -mr-5 rounded-md overflow-hidden",
                      "transition-all duration-200 ease-out hover:w-[124px] hover:z-20",
                    ].join(" ")}
                    title={title}
                    aria-label={title}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={title}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/15 to-transparent" />
                    <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    <div className="absolute top-2 left-2 text-[11px] font-black text-black/90 bg-white/85 rounded px-1.5 py-0.5">
                      {n}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Center hero */}
          <div className={`relative ${HERO_H} overflow-hidden`}>
            {heroBackdrop ? (
              <div
                className="absolute inset-0 bg-center bg-cover"
                style={{ backgroundImage: `url(${heroBackdrop})` }}
              />
            ) : (
              <div className="absolute inset-0 bg-black" />
            )}

            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute inset-0 [box-shadow:inset_0_-160px_180px_rgba(0,0,0,0.85)]" />

            <div className="absolute left-4 top-4 lg:hidden">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-xs font-black text-black">
                TOP {rank}
              </div>
            </div>

            <div className="relative z-10 p-6 md:p-10 h-full flex flex-col justify-end">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={heroTitle}
                  className="max-h-[110px] md:max-h-[132px] w-auto object-contain drop-shadow-[0_12px_26px_rgba(0,0,0,0.7)]"
                />
              ) : (
                <div className="text-3xl md:text-5xl font-black tracking-tight text-white">{heroTitle}</div>
              )}

              {hero?.synopsis ? (
                <p className="mt-3 text-sm md:text-base text-white/75 line-clamp-3 max-w-[720px]">
                  {String(hero.synopsis)}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  to={`/watch/${hero?.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-base font-semibold text-black hover:bg-white/90"
                >
                  <Play className="h-4 w-4" />
                  Assistir
                </Link>

                <Link
                  to={`/t/${hero?.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-6 py-3 text-base font-semibold text-white hover:bg-white/15"
                >
                  Mais informações
                </Link>
              </div>
            </div>
          </div>

          {/* Right stack */}
          {rightStack.length ? (
            <div className={`relative ${HERO_H} border-t border-white/5 lg:border-t-0 lg:border-l border-white/5 bg-black/80 overflow-hidden`}>
              <div className="absolute inset-0 bg-gradient-to-l from-black/35 via-black/70 to-black/95" />
              <div className="relative z-10 h-full flex items-stretch justify-end gap-0 pr-4 pl-2">
                {rightStack.map((it, idx) => {
                  const n = activeIndex + 2 + idx;
                  const tid = pickTitleId(it);
                  const thumb = pickThumb(it);
                  const title = String(it?.title || "").trim();

                  return (
                    <button
                      key={`${tid || "top"}:${n}`}
                      type="button"
                      onClick={() => setActiveIndex(activeIndex + 1 + idx)}
                      className={[
                        "group relative h-full w-[96px] -ml-5 first:ml-0 rounded-md overflow-hidden",
                        "transition-all duration-200 ease-out hover:w-[132px] hover:z-20",
                        "opacity-85 hover:opacity-100",
                      ].join(" ")}
                      title={title}
                      aria-label={title}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={title}
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-l from-black/75 via-black/15 to-transparent" />
                      <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                      <div className="absolute top-2 right-2 text-[11px] font-black text-black/90 bg-white/85 rounded px-1.5 py-0.5">
                        {n}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
