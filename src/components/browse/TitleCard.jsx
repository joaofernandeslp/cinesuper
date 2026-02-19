// src/components/browse/TitleCard.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { Play, Plus, X, ListPlus, Check, Volume2, VolumeX, Heart } from "lucide-react";
import { IS_TV } from "../../app/target.js";
import { fetchTitleById } from "../../lib/catalogApi.js";

const SR_RE = /^sr-\d{8}$/i;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pickDurationSec(item) {
  const d =
    item?.durationSec ??
    item?.duration_sec ??
    item?.runtimeSec ??
    item?.runtime_sec ??
    item?.duration_seconds ??
    0;
  const n = Number(d);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fmtRuntime(sec) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  if (!s) return "";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${hh}h ${mm}min` : `${hh}h`;
}

function pad2(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return "01";
  return String(Math.floor(x)).padStart(2, "0");
}

function parseSeasonEpisodeFromPrefix(prefix) {
  const p = String(prefix || "");
  const ms =
    p.match(/\/temporada\s*(\d+)/i) ||
    p.match(/\/season\s*(\d+)/i) ||
    p.match(/\/m[oó]dulo\s*(\d+)/i) ||
    p.match(/\/module\s*(\d+)/i);
  const me = p.match(/\/epis[oó]dio\s*(\d+)/i) || p.match(/\/episode\s*(\d+)/i);

  const season = ms ? Number(ms[1]) : 1;
  const episode = me ? Number(me[1]) : 1;

  return {
    season: Number.isFinite(season) && season > 0 ? season : 1,
    episode: Number.isFinite(episode) && episode > 0 ? episode : 1,
  };
}

function pickAge(item) {
  return String(
    item?.age ??
      item?.age_rating ??
      item?.ageRating ??
      item?.content_rating ??
      item?.contentRating ??
      item?.rating ??
      ""
  ).trim();
}

function joinList(x, fallback = "") {
  if (!x) return fallback;
  if (Array.isArray(x)) return x.filter(Boolean).join(", ");
  return String(x || "").trim() || fallback;
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
   YouTube helpers
========================= */
function extractYouTubeId(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;

  const m1 = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/i);
  if (m1) return m1[1];

  const m2 = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/i);
  if (m2) return m2[1];

  const m3 = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i);
  if (m3) return m3[1];

  return "";
}

function pickYouTubeTrailerId(item) {
  const raw =
    item?.trailer_youtube_id ??
    item?.youtube_trailer_id ??
    item?.trailerYouTubeId ??
    item?.youtubeTrailerId ??
    item?.trailer_youtube_url ??
    item?.youtube_trailer_url ??
    item?.trailer_url ??
    item?.trailerUrl ??
    item?.trailer_youtube ??
    item?.hero_youtube ??
    item?.hero_youtube_id ??
    item?.heroYouTube ??
    item?.trailerYouTube ??
    item?.trailer ??
    "";

  return extractYouTubeId(raw);
}

function youTubeEmbedUrl(id) {
  if (!id) return "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    rel: "0",
    playsinline: "1",
    modestbranding: "1",
    iv_load_policy: "3",
    loop: "1",
    playlist: id,
    enablejsapi: "1",
  });

  if (origin) params.set("origin", origin);

  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export default function TitleCard({
  item,
  progressSec = 0,
  tvFocused = false,
  scrollerRef,
  profileId,
  titlePublicId,
  inWatchlist = false,
  onToggleWatchlist,
  liked = false,
  onToggleLike,
}) {
  const mediaType = String(item?.media_type || item?.mediaType || "").trim().toLowerCase();
  const isCourse = mediaType === "course" || mediaType === "curso";
  const isSeriesLike = mediaType === "tv" || isCourse;
  const is4k = !!item?.has4k;
  const isSeriesCard = !!item?.seriesCard || SR_RE.test(String(item?.id || ""));

  // Hydrate (resolve Continue assistindo “magro”)
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const full = useMemo(() => (details ? { ...item, ...details } : item), [item, details]);
  const categoriesArr = useMemo(() => (Array.isArray(full?.categories) ? full.categories : []), [full]);
  const tagsArr = useMemo(() => (Array.isArray(full?.tags) ? full.tags : []), [full]);

  const isCalendarItem = useMemo(() => {
    if (full?.in_cinema === true) return true;
    return hasCinemaTag([...categoriesArr, ...tagsArr]);
  }, [full, categoriesArr, tagsArr]);

  async function ensureDetails() {
    if (detailsLoading || details) return;

    const hasSomeMeta =
      !!full?.synopsis ||
      !!full?.trailer_youtube_id ||
      !!full?.trailer_youtube_url ||
      !!full?.trailer_url ||
      !!full?.trailer_youtube ||
      !!full?.hero_youtube;

    if (hasSomeMeta) return;

    const id = String(full?.id || "").trim();
    if (!id) return;

    setDetailsLoading(true);
    try {
      const data = await fetchTitleById(id);
      if (!aliveRef.current) return;
      if (data && typeof data === "object") setDetails(data);
    } finally {
      if (aliveRef.current) setDetailsLoading(false);
    }
  }

  const r2Prefix = String(full?.r2_prefix || full?.r2Prefix || "");
  const se = useMemo(() => (isSeriesLike ? parseSeasonEpisodeFromPrefix(r2Prefix) : null), [isSeriesLike, r2Prefix]);

  const dur = useMemo(() => pickDurationSec(full), [full]);
  const pos = Math.max(0, Math.floor(Number(progressSec || 0)));
  const canResume = pos > 5;
  const pct = dur > 0 ? clamp(pos / dur, 0, 1) : null;

  const ytId = useMemo(() => pickYouTubeTrailerId(full), [full]);
  const ytEmbed = useMemo(() => youTubeEmbedUrl(ytId), [ytId]);
  const hasTrailer = !!ytEmbed;

  const age = useMemo(() => pickAge(full), [full]);
  const runtimeText = useMemo(() => fmtRuntime(dur), [dur]);

  const seasonPrefix = isCourse ? "M" : "T";
  const subtitleLine =
    isSeriesLike && !isSeriesCard && se ? `${seasonPrefix}${se.season} • E${pad2(se.episode)}` : "";
  const chipText = isSeriesLike
    ? isSeriesCard
      ? isCourse
        ? "CURSO"
        : "SÉRIE"
      : isCourse
        ? "AULA"
        : "EP"
    : is4k
      ? "4K"
      : "HD";

  /* =========================
     TV: mantém seu layout atual
  ========================= */
  if (IS_TV) {
    const showOverlayTV = tvFocused;

    return (
      <Link
        to={`/t/${full.id}`}
        title={full.title}
        aria-label={full.title}
        className={[
          "group relative block w-[220px] shrink-0 text-left outline-none",
          tvFocused ? "z-20 scale-[1.06]" : "scale-100",
          "transition-transform duration-150",
        ].join(" ")}
        style={{ transformOrigin: "center" }}
      >
        <div className="relative overflow-hidden rounded-xl bg-white/5">
          {tvFocused ? (
            <div
              className="pointer-events-none absolute inset-0 z-30 rounded-xl"
              style={{
                boxShadow:
                  "inset 0 0 0 6px rgba(255,255,255,0.95), inset 0 0 22px rgba(255,255,255,0.41)",
              }}
            />
          ) : null}

          <div className="relative w-full h-[330px] bg-black/40">
            <div className="absolute right-2 top-2 z-20">
              <span className="inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold tracking-wide backdrop-blur bg-white/10 text-white/85 border-white/15">
                {chipText}
              </span>
            </div>

            {isSeriesLike && !isSeriesCard && subtitleLine ? (
              <div className="absolute left-2 top-2 z-20">
                <span className="inline-flex items-center rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[10px] font-bold tracking-wide text-white/90 backdrop-blur">
                  {subtitleLine}
                </span>
              </div>
            ) : null}

            {canResume ? (
              <div className="absolute left-0 right-0 bottom-0 z-20">
                <div className="h-[4px] bg-white/20">
                  <div
                    className="h-[4px] bg-[#e50914]"
                    style={{ width: `${pct == null ? 35 : Math.round(pct * 100)}%` }}
                  />
                </div>
                <div className="px-2 py-1 text-[11px] text-white/80 bg-black/35 backdrop-blur-sm">
                  Continuar
                </div>
              </div>
            ) : null}

            <img
              src={full.thumb}
              alt={full.title}
              className="absolute inset-0 h-full w-full object-contain"
              loading="lazy"
              draggable="false"
            />

            <div
              className={[
                "absolute inset-0 transition pointer-events-none bg-gradient-to-t from-black/45 via-transparent to-transparent",
                showOverlayTV ? "opacity-100" : "opacity-0",
              ].join(" ")}
            />
          </div>

          <div className="p-3">
            <div className="text-sm font-semibold line-clamp-1 text-white">{full.title}</div>
            <div className="mt-1 text-xs text-white/60 line-clamp-1">
              {isSeriesLike && !isSeriesCard && subtitleLine ? subtitleLine : full.tags?.join(" • ")}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  /* =========================
     WEB: popup (só YouTube)
  ========================= */
  const HOVER_DELAY_MS = 780;
  const GRACE_TO_ENTER_POPUP_MS = 140;
  const TRANSITION_MS = 220;
  const PAD = 16;

  const W_COLLAPSED = 560;
  const W_EXPANDED = 920;

  const cardRef = useRef(null);
  const popupRef = useRef(null);

  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const unmountTimerRef = useRef(null);

  const overCardRef = useRef(false);
  const overPopupRef = useRef(false);

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const [widthPx, setWidthPx] = useState(W_COLLAPSED);
  const [posPx, setPosPx] = useState({ left: PAD, top: PAD });

  const [listBusy, setListBusy] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  // 🔊 YouTube audio control
  const [soundOn, setSoundOn] = useState(false);
  const ytFrameRef = useRef(null);

  function ytCmd(func, args = []) {
    const win = ytFrameRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    } catch {}
  }

  function applyYouTubeSound(nextOn) {
    const tries = [0, 160, 420, 900];
    const f = () => {
      if (!hasTrailer) return;
      if (nextOn) {
        ytCmd("unMute");
        ytCmd("setVolume", [80]);
      } else {
        ytCmd("mute");
      }
    };
    const timers = tries.map((ms) => setTimeout(f, ms));
    return () => timers.forEach((t) => clearTimeout(t));
  }

  useEffect(() => {
    if (!mounted) return;
    if (!hasTrailer) return;

    return applyYouTubeSound(soundOn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundOn, mounted, hasTrailer, ytEmbed]);

  function clearTimers() {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
    openTimerRef.current = null;
    closeTimerRef.current = null;
    unmountTimerRef.current = null;
  }

  function desiredWidth(nextExpanded) {
    const target = nextExpanded ? W_EXPANDED : W_COLLAPSED;
    const max = Math.max(320, window.innerWidth - PAD * 2);
    return Math.min(target, max);
  }

  function computeCardCenterX() {
    const el = cardRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  }

  function reposition(nextExpanded = expanded) {
    const cx = computeCardCenterX();
    if (cx == null) return;

    const w = desiredWidth(nextExpanded);
    setWidthPx(w);

    const left = clamp(cx - w / 2, PAD, window.innerWidth - PAD - w);

    const top0 = clamp((window.innerHeight - 520) / 2, PAD, window.innerHeight - PAD - 200);
    setPosPx({ left, top: top0 });

    requestAnimationFrame(() => {
      const pop = popupRef.current;
      if (!pop) return;
      const rect = pop.getBoundingClientRect();
      const h = rect.height || 1;
      const top = clamp((window.innerHeight - h) / 2, PAD, window.innerHeight - PAD - h);
      setPosPx({ left, top });
    });
  }

  function openPopup() {
    clearTimers();
    setExpanded(false);
    setSoundOn(false); // sempre começa mutado
    setMounted(true);

    ensureDetails();

    requestAnimationFrame(() => {
      setVisible(true);
      reposition(false);
    });
  }

  function closePopup() {
    clearTimers();
    setVisible(false);
    setSoundOn(false);

    // ✅ FIX: assim que começa a fechar, não deixa overlay "invisível" capturar clique
    overPopupRef.current = false;

    unmountTimerRef.current = setTimeout(() => {
      setMounted(false);
      setExpanded(false);
    }, TRANSITION_MS);
  }

  function scheduleOpen() {
    clearTimers();
    openTimerRef.current = setTimeout(() => {
      if (overCardRef.current) openPopup();
    }, HOVER_DELAY_MS);
  }

  function scheduleCloseWithGrace() {
    clearTimers();
    closeTimerRef.current = setTimeout(() => {
      if (!overPopupRef.current) closePopup();
    }, GRACE_TO_ENTER_POPUP_MS);
  }

  useEffect(() => {
    if (!mounted) return;

    const onAny = () => reposition(expanded);
    window.addEventListener("resize", onAny);

    const scroller = scrollerRef?.current;
    if (scroller) scroller.addEventListener("scroll", onAny, { passive: true });

    return () => {
      window.removeEventListener("resize", onAny);
      if (scroller) scroller.removeEventListener("scroll", onAny);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, expanded]);

  useEffect(() => () => clearTimers(), []);

  async function handleWatchlistClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (listBusy) return;

    const pid = String(profileId || "").trim();
    const tid = String(titlePublicId || full?.public_id || full?.publicId || full?.id || "").trim();

    if (!pid || !tid || typeof onToggleWatchlist !== "function") return;

    try {
      setListBusy(true);
      await onToggleWatchlist(tid, !inWatchlist);
    } catch (err) {
      console.error("toggleWatchlist", err);
    } finally {
      setListBusy(false);
    }
  }

  async function handleLikeClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (likeBusy) return;

    const pid = String(profileId || "").trim();
    const tid = String(titlePublicId || full?.public_id || full?.publicId || full?.id || "").trim();

    if (!pid || !tid || typeof onToggleLike !== "function") return;

    try {
      setLikeBusy(true);
      await onToggleLike(tid, !liked);
    } catch (err) {
      console.error("toggleLike", err);
    } finally {
      setLikeBusy(false);
    }
  }

  const synopsis = String(full?.synopsis || "").trim();
  const cast = joinList(full?.cast_names || full?.cast || full?.actors || full?.elenco, "");
  const genres = joinList(full?.genres || full?.generos || full?.categories, "");
  const tags = Array.isArray(full?.tags) ? full.tags.join(" • ") : String(full?.tags || "").trim();

  const peekNode =
    mounted && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed z-[9999]"
            // ✅ FIX: quando NÃO está visível (opacity 0), desliga pointer events imediatamente
            style={{
              left: posPx.left,
              top: posPx.top,
              pointerEvents: visible ? "auto" : "none",
            }}
            onPointerEnter={() => {
              // só faz sentido marcar "overPopup" quando ele está interativo
              if (!visible) return;
              overPopupRef.current = true;
              clearTimers();
            }}
            onPointerLeave={() => {
              overPopupRef.current = false;
              closePopup();
            }}
          >
            <div
              ref={popupRef}
              className={[
                "overflow-hidden rounded-2xl",
                "bg-black/92 backdrop-blur-md",
                "shadow-[0_28px_90px_rgba(0,0,0,0.72)]",
                "transition-[opacity,transform] duration-200 ease-out will-change-transform",
                visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-[0.985]",
              ].join(" ")}
              style={{ width: widthPx }}
            >
              <div className="relative w-full aspect-video bg-black">
                {hasTrailer ? (
                  <iframe
                    ref={ytFrameRef}
                    className="absolute inset-0 h-full w-full"
                    src={ytEmbed}
                    title={`Trailer: ${full.title}`}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    style={{ border: 0, pointerEvents: "none" }}
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : full.thumb ? (
                  <img
                    src={full.thumb}
                    alt={full.title}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                    draggable="false"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-white/70 text-sm">
                    {detailsLoading ? "Carregando..." : "Sem trailer"}
                  </div>
                )}

                <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/70 via-black/15 to-transparent" />

                {hasTrailer ? (
                  <button
                    type="button"
                    aria-label={soundOn ? "Desativar som" : "Ativar som"}
                    title={soundOn ? "Desativar som" : "Ativar som"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSoundOn((v) => !v);
                    }}
                    className="absolute right-14 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white/90 hover:bg-black/70"
                  >
                    {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                  </button>
                ) : null}

                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    closePopup();
                  }}
                  className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white/90 hover:bg-black/70"
                >
                  <X className="h-5 w-5" />
                </button>

                {!hasTrailer ? (
                  <div className="absolute left-4 bottom-4 z-20">
                    <div className="inline-flex items-center rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/85 border border-white/10 backdrop-blur">
                      Trailer indisponível
                    </div>
                  </div>
                ) : null}

                <div className="absolute left-4 bottom-4 z-20 flex items-center gap-2">
                  <Link
                    to={`/t/${full.id}`}
                    className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
                    onClick={() => closePopup()}
                  >
                    <Play className="h-4 w-4" />
                    Assistir
                  </Link>

                  <button
                    type="button"
                    onClick={handleWatchlistClick}
                    aria-label={inWatchlist ? "Remover da minha lista" : "Adicionar à minha lista"}
                    title={inWatchlist ? "Na minha lista (clique para remover)" : "Adicionar à minha lista"}
                    className={[
                      "grid h-10 w-10 place-items-center rounded-full",
                      inWatchlist ? "bg-white text-black" : "bg-white/12 text-white hover:bg-white/18",
                      listBusy ? "opacity-60 pointer-events-none" : "",
                      !profileId || typeof onToggleWatchlist !== "function" ? "opacity-50 pointer-events-none" : "",
                    ].join(" ")}
                  >
                    {inWatchlist ? <Check className="h-5 w-5" /> : <ListPlus className="h-5 w-5" />}
                  </button>

                  <button
                    type="button"
                    onClick={handleLikeClick}
                    aria-label={liked ? "Descurtir" : "Curtir"}
                    title={liked ? "Curtido (clique para remover)" : "Curtir"}
                    className={[
                      "grid h-10 w-10 place-items-center rounded-full",
                      liked ? "bg-[#e50914] text-white" : "bg-white/12 text-white hover:bg-white/18",
                      likeBusy ? "opacity-60 pointer-events-none" : "",
                      !profileId || typeof onToggleLike !== "function" ? "opacity-50 pointer-events-none" : "",
                    ].join(" ")}
                  >
                    <Heart className="h-5 w-5" fill={liked ? "currentColor" : "none"} />
                  </button>

                  <button
                    type="button"
                    aria-label={expanded ? "Recolher detalhes" : "Mais informações"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const next = !expanded;
                      setExpanded(next);
                      requestAnimationFrame(() => reposition(next));
                    }}
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/12 text-white hover:bg-white/18"
                    title={expanded ? "Recolher" : "Mais informações"}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>

                <div className="absolute left-4 top-4 z-20">
                  <div className="text-white/90 text-sm font-semibold drop-shadow-[0_10px_30px_rgba(0,0,0,0.65)] line-clamp-1">
                    {full.title}
                  </div>
                </div>
              </div>

              <div className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/70">
                  {full?.year ? <span className="text-white/80">{full.year}</span> : null}
                  {runtimeText ? <span>{runtimeText}</span> : null}

                  <span className="inline-flex items-center rounded px-2 py-0.5 bg-white/10 text-white/85">
                    {chipText}
                  </span>

                  {age ? (
                    <span className="inline-flex items-center rounded px-2 py-0.5 bg-red-600/90 text-white font-bold">
                      {age}
                    </span>
                  ) : null}

                  {isSeriesLike && !isSeriesCard && subtitleLine ? (
                    <span className="inline-flex items-center rounded px-2 py-0.5 bg-white/10 text-white/85">
                      {subtitleLine}
                    </span>
                  ) : null}
                </div>

                {!expanded && synopsis ? (
                  <div className="mt-3 text-sm text-white/78 line-clamp-2">{synopsis}</div>
                ) : null}

                {!expanded && (genres || tags) ? (
                  <div className="mt-3 text-xs text-white/55 line-clamp-1">{genres || tags}</div>
                ) : null}

                {expanded ? (
                  <div className="mt-4 grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-8">
                      <div className="text-xs font-semibold text-white/70 mb-1">Sinopse</div>
                      <div className="text-sm text-white/75">
                        {synopsis || (detailsLoading ? "Carregando..." : "Sem sinopse disponível.")}
                      </div>
                    </div>

                    <div className="col-span-12 md:col-span-4 space-y-3">
                      {cast ? (
                        <div>
                          <div className="text-xs font-semibold text-white/70">Elenco</div>
                          <div className="text-sm text-white/75 line-clamp-3">{cast}</div>
                        </div>
                      ) : null}

                      {genres ? (
                        <div>
                          <div className="text-xs font-semibold text-white/70">Gêneros</div>
                          <div className="text-sm text-white/75 line-clamp-3">{genres}</div>
                        </div>
                      ) : null}

                      {tags ? (
                        <div>
                          <div className="text-xs font-semibold text-white/70">Tags</div>
                          <div className="text-sm text-white/75 line-clamp-3">{tags}</div>
                        </div>
                      ) : null}

                      {full?.director ? (
                        <div>
                          <div className="text-xs font-semibold text-white/70">Direção</div>
                          <div className="text-sm text-white/75 line-clamp-2">{String(full.director)}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <Link
        ref={(el) => {
          cardRef.current = el;
        }}
        to={`/t/${full.id}`}
        title={full.title}
        aria-label={full.title}
        onPointerEnter={() => {
          overCardRef.current = true;
          scheduleOpen();
        }}
        onPointerLeave={() => {
          overCardRef.current = false;
          if (mounted) scheduleCloseWithGrace();
          else clearTimers();
        }}
        className="group relative block w-[220px] shrink-0 text-left outline-none transition-transform duration-150 hover:scale-[1.02]"
        style={{ transformOrigin: "center" }}
      >
        <div className="relative w-full h-[330px] bg-black/35 overflow-hidden">
          {isCalendarItem ? (
            <div className="absolute left-2 top-2 z-20 rounded-full border border-yellow-400/30 bg-yellow-400/15 px-2.5 py-1 text-[10px] font-semibold text-yellow-200">
              Em breve
            </div>
          ) : null}

          {canResume ? (
            <div className="absolute left-0 right-0 bottom-0 z-20">
              <div className="h-[3px] bg-white/15">
                <div
                  className="h-[3px] bg-[#e50914]"
                  style={{ width: `${pct == null ? 35 : Math.round(pct * 100)}%` }}
                />
              </div>
            </div>
          ) : null}

          {full.thumb ? (
            <img
              src={full.thumb}
              alt={full.title}
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              draggable="false"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-white/60 text-sm">Sem capa</div>
          )}

          <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition bg-black/10" />
        </div>
      </Link>

      {peekNode}
    </>
  );
}
