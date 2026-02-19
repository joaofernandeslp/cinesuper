// src/pages/Title.jsx
import { supabase } from "../lib/supabaseClient.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopNav from "../components/layout/TopNav.jsx";
import Footer from "../components/layout/Footer.jsx";
import Container from "../components/layout/Container.jsx";
import { fetchTitleById } from "../lib/catalogApi.js";
import {
  Calendar,
  Clock,
  Shield,
  Hash,
  Subtitles,
  Play,
  ArrowLeft,
  Users,
  Film,
  X,
  ListVideo,
  ChevronDown,
  Heart,
} from "lucide-react";
import PageTitle from "../components/PageTitle.jsx";

const SR_RE = /^sr-\d{8}$/i;

/* =========================
   Helpers
========================= */
function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
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

  if (v === "L" || v === "LIVRE" || v === "0") {
    return {
      label: "L",
      hint: "Livre",
      cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/35",
    };
  }

  const n = Number(v);
  if (Number.isFinite(n)) {
    if (n <= 10)
      return {
        label: "A10",
        hint: "Não recomendado para menores de 10",
        cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/35",
      };
    if (n === 12)
      return {
        label: "A12",
        hint: "Não recomendado para menores de 12",
        cls: "bg-yellow-500/15 text-yellow-200 border-yellow-500/35",
      };
    if (n === 14)
      return {
        label: "A14",
        hint: "Não recomendado para menores de 14",
        cls: "bg-orange-500/15 text-orange-200 border-orange-500/35",
      };
    if (n === 16)
      return {
        label: "A16",
        hint: "Não recomendado para menores de 16",
        cls: "bg-red-500/15 text-red-200 border-red-500/35",
      };
    if (n >= 18)
      return {
        label: "A18",
        hint: "Não recomendado para menores de 18",
        cls: "bg-red-600/20 text-red-100 border-red-500/45",
      };
  }

  return {
    label: raw || "-",
    hint: "Classificação indicativa",
    cls: "bg-white/10 text-white/80 border-white/15",
  };
}

function isProbablyYouTube(v) {
  const s = String(v || "").toLowerCase();
  return s.includes("youtube.com") || s.includes("youtu.be") || s.includes("music.youtube.com") || s.startsWith("yt:");
}

function isProbablyImageUrl(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return false;
  if (isProbablyYouTube(s)) return false;
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:image/") || s.startsWith("blob:");
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

function pickBannerImage(item) {
  if (!item) return "";
  if (isProbablyImageUrl(item.bannerImage)) return item.bannerImage;
  if (isProbablyImageUrl(item.hero_image_url)) return item.hero_image_url;
  if (isProbablyImageUrl(item.thumb)) return item.thumb;
  if (isProbablyImageUrl(item.thumb_url)) return item.thumb_url;
  return "";
}

function pickPosterImage(item, bannerFallback) {
  const thumb =
    item?.thumb_url || item?.thumbUrl || item?.thumb || item?.posterUrl || item?.poster_url || item?.poster || "";
  if (isProbablyImageUrl(thumb)) return thumb;
  if (isProbablyImageUrl(bannerFallback)) return bannerFallback;
  return "";
}

// Trailer helpers
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
function ytEmbedUrl(id) {
  const v = String(id || "").trim();
  if (!v) return "";
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    v
  )}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}
function ytThumbUrl(id) {
  const v = String(id || "").trim();
  if (!v) return "";
  return `https://i.ytimg.com/vi/${encodeURIComponent(v)}/hqdefault.jpg`;
}

// UI
function StatCard({ icon, label, value, right }) {
  const Icon = icon;
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Icon className="h-4 w-4" />
            {label}
          </div>
          <div className="mt-2 text-sm text-white/85 truncate">{value || "-"}</div>
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
    </div>
  );
}
function Chips({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((t) => (
        <span key={t} className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
          {t}
        </span>
      ))}
    </div>
  );
}

function TrailerModal({ open, onClose, title, embedUrl }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      <div
        className="absolute inset-0 bg-black/80"
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Fechar trailer"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-widest text-yellow-400/90">TRAILER</div>
              <div className="truncate text-sm text-white/85">{title || "Trailer"}</div>
            </div>

            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
              Fechar
            </button>
          </div>

          <div className="relative w-full aspect-video bg-black">
            {embedUrl ? (
              <iframe
                title="Trailer"
                src={embedUrl}
                className="absolute inset-0 h-full w-full"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
                Trailer indisponível.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Episodes Modal
========================= */
function EpisodesModal({
  open,
  onClose,
  title,
  seasons,
  activeSeason,
  setActiveSeason,
  episodesForSeason,
  currentPublicId,
  onPlayEpisode,
  seasonLabel,
  seasonLabelPlural,
  seasonLabelUpper,
  seasonPrefix,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85]">
      <div
        className="absolute inset-0 bg-black/80"
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Fechar episódios"
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-xl">
          <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-widest text-yellow-400/90">
                {seasonLabelUpper || "TEMPORADAS"}
              </div>
              <div className="mt-1 text-lg font-bold text-white truncate">{title || "Série"}</div>
              <div className="mt-1 text-xs text-white/60">
                Escolha o {String(seasonLabel || "temporada").toLowerCase()} e o episódio para assistir.
              </div>
            </div>

            <button
              onClick={onClose}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
            >
              <X className="h-4 w-4" />
              Fechar
            </button>
          </div>

          <div className="p-5">
            <div className="flex flex-wrap gap-2">
              {seasons.map((s) => (
                <button
                  key={`season-${s}`}
                  onClick={() => setActiveSeason(s)}
                  className={`text-xs rounded-full border px-3 py-2 font-semibold transition ${
                    s === activeSeason
                      ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  }`}
                >
                  {seasonLabel || "Temporada"} {s}
                </button>
              ))}
            </div>

            <div className="mt-4 max-h-[55vh] overflow-auto rounded-2xl border border-white/10 bg-black/25">
              {episodesForSeason.length ? (
                <div className="divide-y divide-white/10">
                  {episodesForSeason.map((ep) => {
                    const isCurrent = String(ep.public_id) === String(currentPublicId);
                    return (
                      <button
                        key={ep.public_id}
                        onClick={() => onPlayEpisode?.(ep.public_id)}
                        className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/5 transition ${
                          isCurrent ? "bg-white/5" : ""
                        }`}
                        title={`${seasonLabel || "Temporada"} ${ep.season} • Episódio ${ep.episode}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center justify-center rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                                isCurrent
                                  ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
                                  : "border-white/10 bg-white/5 text-white/80"
                              }`}
                            >
                              E{pad2(ep.episode)}
                            </span>

                            <div className="truncate text-sm text-white/85">{ep.title || "Episódio"}</div>
                          </div>

                          <div className="mt-1 text-[11px] text-white/45 truncate">
                            {seasonLabel || "Temporada"} {ep.season} • Episódio {ep.episode}
                          </div>
                        </div>

                        <span
                          className={`shrink-0 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                            isCurrent
                              ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
                              : "border-white/10 bg-white/5 text-white/80"
                          }`}
                        >
                          <Play className="h-4 w-4" />
                          Ver
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-sm text-white/60">
                  Nenhum episódio encontrado neste {String(seasonLabel || "temporada").toLowerCase()}.
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-white/50">
              {seasonLabel || "Temporada"} {activeSeason} • {episodesForSeason.length} episódio(s)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Entitlement / Quality helpers
========================= */
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
  if (item?.has4k === true) return true;
  if (item?.has4k === false) return false;

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

/* =========================
   Page
========================= */
export default function Title() {
  const { id } = useParams();
  const nav = useNavigate();

  const isSeriesParam = useMemo(() => SR_RE.test(String(id || "").trim()), [id]);

  const [resumeSec, setResumeSec] = useState(0);
  const [resumeLoading, setResumeLoading] = useState(false);

  // ✅ resume do GLOBAL da série (último ep assistido)
  const [seriesResumePublicId, setSeriesResumePublicId] = useState("");
  const [seriesResumeSec, setSeriesResumeSec] = useState(0);

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

  const [item, setItem] = useState(null);
  const [seriesMeta, setSeriesMeta] = useState(null); // ✅ metadados do sr-...
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [trailerOpen, setTrailerOpen] = useState(false);

  // Episódios (TV)
  const [epsLoading, setEpsLoading] = useState(false);
  const [epsErr, setEpsErr] = useState("");

  // Curtidas
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeProfileId, setLikeProfileId] = useState("");
  const [episodes, setEpisodes] = useState([]);
  const [activeSeason, setActiveSeason] = useState(1);

  // Modal episódios
  const [episodesOpen, setEpisodesOpen] = useState(false);

  // ✅ detectar se está na página de SÉRIE agregada
  const isSeriesCard = useMemo(() => {
    return isSeriesParam || !!item?.seriesCard || item?.is_series === true;
  }, [isSeriesParam, item]);

  // Carrega item base (catálogo)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    fetchTitleById(id, { allow4k, includeDraftCalendar: true })
      .then((data) => {
        if (!alive) return;
        if (!data) {
          setItem(null);
          setErr("Título não encontrado.");
          return;
        }
        setItem(data);
      })
      .catch((e) => {
        console.error("fetchTitleById", e);
        if (!alive) return;
        setItem(null);
        setErr(e?.message || "Falha ao carregar o título.");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [id, allow4k]);

  // ✅ Se for sr-..., tenta carregar metadados “globais” da série na tabela titles
  useEffect(() => {
    let alive = true;

    async function loadSeriesMeta() {
      try {
        setSeriesMeta(null);

        if (!isSeriesParam) return;

        const pid = String(id || "").trim();
        if (!pid) return;

        const { data, error } = await supabase
          .from("titles")
          .select(
            "public_id, title, year, maturity, duration_label, synopsis, hero_image_url, thumb_url, tags, categories, cast_names, director, creators, trailer_youtube, hero_youtube"
          )
          .eq("public_id", pid)
          .maybeSingle();

        if (!alive) return;

        if (error) {
          console.warn("[TITLE][SERIES] series meta error:", error);
          setSeriesMeta(null);
          return;
        }

        if (data) setSeriesMeta(data);
      } catch {
        if (!alive) return;
        setSeriesMeta(null);
      }
    }

    loadSeriesMeta();

    return () => {
      alive = false;
    };
  }, [isSeriesParam, id]);

  // ✅ viewItem: quando for série, dá preferência para metadados do sr-...
  const viewItem = useMemo(() => {
    if (!item) return null;
    if (!isSeriesCard || !seriesMeta) return item;

    const hero = String(seriesMeta.hero_image_url || "").trim();
    const thumb = String(seriesMeta.thumb_url || "").trim();
    const bannerImage = hero || thumb || item.bannerImage || item.hero_image_url || item.thumb_url || "";

    return {
      ...item,
      title: seriesMeta.title ?? item.title,
      year: seriesMeta.year ?? item.year,
      maturity: seriesMeta.maturity ?? item.maturity,
      duration: seriesMeta.duration_label ?? item.duration,
      synopsis: seriesMeta.synopsis ?? item.synopsis,

      hero_image_url: hero || item.hero_image_url,
      thumb_url: thumb || item.thumb_url,
      bannerImage,

      tags: Array.isArray(seriesMeta.tags) ? seriesMeta.tags : item.tags,
      categories: Array.isArray(seriesMeta.categories) ? seriesMeta.categories : item.categories,

      cast: Array.isArray(seriesMeta.cast_names) ? seriesMeta.cast_names : item.cast,
      director: seriesMeta.director ?? item.director,
      creators: Array.isArray(seriesMeta.creators) ? seriesMeta.creators : item.creators,

      trailer_youtube: seriesMeta.trailer_youtube ?? item.trailer_youtube,
      hero_youtube: seriesMeta.hero_youtube ?? item.hero_youtube,
    };
  }, [item, isSeriesCard, seriesMeta]);

  const refreshLike = useCallback(async () => {
    const tid = String(viewItem?.id || "").trim();
    if (!tid) {
      setLiked(false);
      setLikeProfileId("");
      return;
    }

    const uid = await getAuthUserId();
    const pid = getActiveProfileIdFromStorage(uid);
    setLikeProfileId(pid || "");

    if (!uid || !pid) {
      setLiked(false);
      return;
    }

    const { data, error } = await supabase
      .from("user_likes")
      .select("title_public_id")
      .eq("profile_id", pid)
      .eq("title_public_id", tid)
      .maybeSingle();

    if (error) {
      setLiked(false);
      return;
    }

    setLiked(!!data);
  }, [viewItem?.id]);

  useEffect(() => {
    if (!viewItem) return;
    refreshLike();
  }, [viewItem, refreshLike]);

  useEffect(() => {
    const onProfileChanged = () => refreshLike();
    window.addEventListener("cs:profile-changed", onProfileChanged);
    return () => window.removeEventListener("cs:profile-changed", onProfileChanged);
  }, [refreshLike]);

  const handleLikeToggle = useCallback(async () => {
    if (likeBusy) return;

    const tid = String(viewItem?.id || "").trim();
    const pid = String(likeProfileId || "").trim();
    if (!tid || !pid) return;

    try {
      setLikeBusy(true);

      if (!liked) {
        const { error } = await supabase
          .from("user_likes")
          .upsert({ profile_id: pid, title_public_id: tid }, { onConflict: "profile_id,title_public_id" });
        if (error) throw error;
        setLiked(true);
      } else {
        const { error } = await supabase
          .from("user_likes")
          .delete()
          .eq("profile_id", pid)
          .eq("title_public_id", tid);
        if (error) throw error;
        setLiked(false);
      }
    } catch {
      // silêncio: UI permanece no estado anterior
    } finally {
      setLikeBusy(false);
    }
  }, [liked, likeBusy, likeProfileId, viewItem?.id]);

  const titleName = useMemo(() => String(viewItem?.title || "").trim(), [viewItem]);

  // load episodes (filtra is_series=false)
  useEffect(() => {
    let alive = true;

    async function loadEpisodes() {
      try {
        setEpsErr("");
        setEpsLoading(true);

          const mediaTypeRaw = String(viewItem?.media_type || viewItem?.mediaType || "").trim().toLowerCase();
          const mediaType = mediaTypeRaw === "curso" ? "course" : mediaTypeRaw;
          const imdbId = String(viewItem?.imdb_id || viewItem?.imdbId || "").trim().toLowerCase();
          const seriesId = String(
            viewItem?.series_id || viewItem?.seriesId || (viewItem?.is_series ? viewItem?.dbId : "") || ""
          ).trim();
          const basePrefixRaw = String(
            viewItem?.r2_prefix_base || viewItem?.r2PrefixBase || viewItem?.r2_prefix || viewItem?.r2Prefix || ""
          ).trim();
          const basePrefix = normalizePrefix(extractSeriesBaseFromPrefix(basePrefixRaw));

          if (mediaType !== "tv" && mediaType !== "course") {
            if (alive) setEpisodes([]);
            return;
          }

          let data = null;
          let error = null;

          if (seriesId) {
            const res = await supabase
              .from("titles")
              .select("id, public_id, title, r2_prefix, thumb_url, hero_image_url, status")
              .eq("media_type", mediaType)
              .eq("status", "published")
              .eq("is_series", false)
              .eq("series_id", seriesId);
            data = res.data;
            error = res.error;
            if (error && String(error.message || "").includes("series_id")) {
              data = null;
              error = null;
            }
          }

          if ((!data || data.length === 0) && mediaType === "tv" && imdbId.startsWith("tt")) {
            const res = await supabase
              .from("titles")
              .select("id, public_id, title, r2_prefix, thumb_url, hero_image_url, status")
              .eq("media_type", "tv")
              .eq("imdb_id", imdbId)
              .eq("status", "published")
              .eq("is_series", false);
            data = res.data;
            error = res.error;
          }

          if ((!data || data.length === 0) && mediaType === "course" && basePrefix) {
            const res = await supabase
              .from("titles")
              .select("id, public_id, title, r2_prefix, thumb_url, hero_image_url, status")
              .eq("media_type", "course")
              .eq("status", "published")
              .eq("is_series", false)
              .like("r2_prefix", `${basePrefix}%`);
            data = res.data;
            error = res.error;
          }

          if (error) throw error;

        const list = Array.isArray(data) ? data : [];

        const normalized = list
          .map((r) => {
            const se = parseSeasonEpisodeFromPrefix(r?.r2_prefix);
            return {
              dbId: r.id,
              public_id: r.public_id,
              title: r.title || viewItem?.title || "",
              thumb_url: r.thumb_url || "",
              hero_image_url: r.hero_image_url || "",
              r2_prefix: r.r2_prefix || "",
              season: se.season,
              episode: se.episode,
            };
          })
          .filter((x) => x.public_id);

        normalized.sort((a, b) => {
          if (a.season !== b.season) return a.season - b.season;
          return a.episode - b.episode;
        });

        if (!alive) return;

        setEpisodes(normalized);

        // temporada default: se for episódio, tenta pela pasta; se for sr-, cai no primeiro
        const curSe = parseSeasonEpisodeFromPrefix(viewItem?.r2_prefix || viewItem?.r2Prefix || "");
        const fallbackSeason =
          normalized.find((x) => x.season === curSe.season)?.season ?? normalized[0]?.season ?? 1;

        setActiveSeason(fallbackSeason);
      } catch (e) {
        if (!alive) return;
        setEpisodes([]);
        setEpsErr(e?.message || "Falha ao carregar episódios.");
      } finally {
        if (alive) setEpsLoading(false);
      }
    }

    if (viewItem) loadEpisodes();

    return () => {
      alive = false;
    };
  }, [viewItem]);

  // ✅ Resume:
  // - normal: usa item.dbId
  // - série global: pega último episódio assistido do perfil entre episodes[].dbId
  useEffect(() => {
    let alive = true;

    async function loadResume() {
      try {
        setResumeLoading(true);

        const uid = await getAuthUserId();
        const profileId = getActiveProfileIdFromStorage(uid);

        if (!uid || !profileId) {
          if (!alive) return;
          setResumeSec(0);
          setSeriesResumePublicId("");
          setSeriesResumeSec(0);
          return;
        }

        // ✅ SÉRIE GLOBAL
        if (isSeriesCard) {
          const eps = Array.isArray(episodes) ? episodes : [];
          const episodeDbIds = eps.map((e) => String(e.dbId || "").trim()).filter(Boolean);

          if (!episodeDbIds.length) {
            if (!alive) return;
            setResumeSec(0);
            setSeriesResumePublicId("");
            setSeriesResumeSec(0);
            return;
          }

          // tenta updated_at; se não existir na sua tabela, troque por created_at
          const { data, error } = await supabase
            .from("watch_progress")
            .select("video_id, position_sec, updated_at")
            .eq("user_id", uid)
            .eq("profile_id", profileId)
            .in("video_id", episodeDbIds)
            .order("updated_at", { ascending: false })
            .limit(1);

          if (!alive) return;

          if (error) {
            console.warn("[TITLE][SERIES] watch_progress load error:", error);
            setResumeSec(0);
            setSeriesResumePublicId("");
            setSeriesResumeSec(0);
            return;
          }

          const row = Array.isArray(data) ? data[0] : null;
          const lastDbId = String(row?.video_id || "").trim();
          const lastSec = Number(row?.position_sec || 0);

          const lastEp = eps.find((e) => String(e.dbId) === lastDbId);
          const lastPid = String(lastEp?.public_id || "").trim();

          setSeriesResumePublicId(lastPid);
          setSeriesResumeSec(Number.isFinite(lastSec) ? lastSec : 0);

          // mantém compatível com seu UI atual
          setResumeSec(Number.isFinite(lastSec) ? lastSec : 0);
          return;
        }

        // ✅ FILME / EP NORMAL
        const videoUuid = String(viewItem?.dbId || "").trim();
        if (!videoUuid) {
          if (!alive) return;
          setResumeSec(0);
          return;
        }

        const { data, error } = await supabase
          .from("watch_progress")
          .select("position_sec")
          .eq("user_id", uid)
          .eq("profile_id", profileId)
          .eq("video_id", videoUuid)
          .maybeSingle();

        if (!alive) return;

        if (error) {
          console.warn("[TITLE] watch_progress load error:", error);
          setResumeSec(0);
          return;
        }

        setResumeSec(Number(data?.position_sec || 0));
      } catch {
        if (!alive) return;
        setResumeSec(0);
        setSeriesResumePublicId("");
        setSeriesResumeSec(0);
      } finally {
        if (alive) setResumeLoading(false);
      }
    }

    if (viewItem) {
      // série global precisa de episodes carregados
      if (isSeriesCard) {
        if (Array.isArray(episodes) && episodes.length) loadResume();
      } else {
        loadResume();
      }
    }

    return () => {
      alive = false;
    };
  }, [viewItem, isSeriesCard, episodes]);

  // reload on profile change
  useEffect(() => {
    const onProfileChanged = () => {
      setResumeSec(0);
      setSeriesResumePublicId("");
      setSeriesResumeSec(0);
    };

    window.addEventListener("cs:profile-changed", onProfileChanged);
    return () => window.removeEventListener("cs:profile-changed", onProfileChanged);
  }, []);

  // Derived
  const bannerImage = useMemo(() => pickBannerImage(viewItem), [viewItem]);
  const posterImage = useMemo(() => pickPosterImage(viewItem, bannerImage), [viewItem, bannerImage]);

  const subtitles = useMemo(() => {
    const s1 = Array.isArray(viewItem?.subtitles) ? viewItem.subtitles : [];
    if (s1.length) return s1;
    const s2 = Array.isArray(viewItem?.subtitleFiles) ? viewItem.subtitleFiles : [];
    if (s2.length) return s2;
    const s3 = Array.isArray(viewItem?.subs) ? viewItem.subs : [];
    return s3;
  }, [viewItem]);

  const hasSubs = subtitles.length > 0;

  const maturity = viewItem?.maturity ? maturityBadge(viewItem.maturity) : maturityBadge("");
  const categories = Array.isArray(viewItem?.categories) ? viewItem.categories : [];
  const tags = Array.isArray(viewItem?.tags) ? viewItem.tags : [];
  const cast = Array.isArray(viewItem?.cast) ? viewItem.cast : [];
  const creators = Array.isArray(viewItem?.creators) ? viewItem.creators : [];
  const director = String(viewItem?.director || "").trim();
  const durationLabel = String(viewItem?.duration || "").trim();

  const isCalendarItem = useMemo(() => {
    if (!viewItem) return false;
    if (viewItem?.in_cinema === true) return true;
    return hasCinemaTag([...(categories || []), ...(tags || [])]);
  }, [viewItem, categories, tags]);

  const releaseDateLabel = useMemo(() => {
    const raw = String(viewItem?.cinesuper_release_at || "").trim();
    if (!raw) return "";
    const dt = new Date(raw);
    if (!Number.isFinite(dt.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(dt);
    } catch {
      return "";
    }
  }, [viewItem]);

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
  const trailerEmbed = useMemo(() => ytEmbedUrl(trailerYtId), [trailerYtId]);
  const trailerThumb = useMemo(() => ytThumbUrl(trailerYtId), [trailerYtId]);
  const hasTrailer = Boolean(trailerYtId);

  const canShow4k = userCan4k && titleHas4k(viewItem);
  const qualityLabel = canShow4k ? "4K" : "FULL HD";

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

  const seasons = useMemo(() => {
    const set = new Set();
    for (const ep of episodes) set.add(ep.season);
    return Array.from(set).sort((a, b) => a - b);
  }, [episodes]);

  const episodesForSeason = useMemo(() => {
    return episodes.filter((e) => e.season === activeSeason).sort((a, b) => a.episode - b.episode);
  }, [episodes, activeSeason]);

  const firstEpisode = useMemo(() => (Array.isArray(episodes) && episodes.length ? episodes[0] : null), [episodes]);

  // ✅ ID correto para Assistir/Continuar
  const primaryWatchId = useMemo(() => {
    if (!isTv) return String(viewItem?.id || "").trim();

    if (isSeriesCard) {
      const last = String(seriesResumePublicId || "").trim();
      if (last) return last;
      return String(firstEpisode?.public_id || "").trim();
    }

    return String(viewItem?.id || "").trim();
  }, [isTv, isSeriesCard, seriesResumePublicId, firstEpisode, viewItem]);

  // ✅ destaque no modal: último assistido (série) ou item atual (episódio)
  const currentPublicId = useMemo(() => {
    if (isSeriesCard) return String(seriesResumePublicId || primaryWatchId || "").trim();
    return String(viewItem?.id || "").trim();
  }, [isSeriesCard, seriesResumePublicId, primaryWatchId, viewItem]);

  const currentSE = useMemo(() => {
    if (isSeriesCard) return { season: 1, episode: 1 };
    return parseSeasonEpisodeFromPrefix(viewItem?.r2_prefix || viewItem?.r2Prefix || "");
  }, [isSeriesCard, viewItem]);

  // Page states
  if (loading) {
    return (
      <div className="min-h-full bg-black text-white">
        <PageTitle title={titleName || "Detalhes"} />
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

  if (err || !viewItem) {
    return (
      <div className="min-h-full bg-black text-white">
        <PageTitle title="Detalhes" />
        <TopNav />
        <main className="pt-16">
          <Container>
            <div className="py-10">
              <div className="text-white/90 text-lg font-semibold">{err || "Título não encontrado."}</div>
              <Link to="/" className="inline-flex items-center gap-2 mt-4 text-white/70 hover:text-white">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            </div>
          </Container>
        </main>
        <Footer />
      </div>
    );
  }

  const canResume = Number(resumeSec || 0) > 5;
  const resumeLabel = resumeLoading ? "Continuar..." : canResume ? `Continuar • ${fmtTime(resumeSec)}` : "Continuar";

  const canWatch = !isCalendarItem && (!isTv || (isSeriesCard ? !!primaryWatchId : true));
  const watchDisabledHint = isCalendarItem ? "Em breve no CineSuper" : "Aguardando episódios publicados";
  const btnSize = isTv
    ? "h-11 md:h-12 px-5 md:px-6 text-sm md:text-base"
    : "h-12 md:h-14 px-7 md:px-9 text-base md:text-lg";

  return (
    <div className="min-h-full bg-black text-white">
      <PageTitle title={titleName || "Detalhes"} />
      <TopNav />

      <TrailerModal
        open={trailerOpen}
        onClose={() => setTrailerOpen(false)}
        title={viewItem?.title}
        embedUrl={trailerEmbed}
      />

      <EpisodesModal
        open={episodesOpen}
        onClose={() => setEpisodesOpen(false)}
        title={viewItem?.title}
        seasons={seasons}
        activeSeason={activeSeason}
        setActiveSeason={setActiveSeason}
        episodesForSeason={episodesForSeason}
        currentPublicId={currentPublicId}
        seasonLabel={seasonLabel}
        seasonLabelPlural={seasonLabelPlural}
        seasonLabelUpper={seasonLabelUpper}
        seasonPrefix={seasonPrefix}
        onPlayEpisode={(pid) => {
          setEpisodesOpen(false);
          nav(`/watch/${pid}`);
        }}
      />

      <main className="pt-16">
        <section className="relative w-full">
          <div id="cs-nav-sentinel" className="absolute top-0 left-0 h-px w-px opacity-0" />

          <div className="relative h-[42vh] min-h-[360px] w-full">
            <div className="absolute -top-16 inset-x-0 bottom-0 z-0 overflow-hidden">
              {bannerImage ? (
                <img
                  src={bannerImage}
                  alt={viewItem.title}
                  className="absolute inset-0 h-full w-full object-cover object-center opacity-90"
                />
              ) : (
                <div className="absolute inset-0 bg-black" />
              )}

              <div className="absolute inset-0 bg-gradient-to-r from-black via-black/65 to-black/10" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0)_0%,rgba(0,0,0,.35)_55%,rgba(0,0,0,.92)_100%)]" />
            </div>

            <Container>
              <div className="relative z-20 h-full pb-16 md:pb-20 flex items-end">
                <div className="w-full grid gap-8 lg:grid-cols-[1fr_360px] items-end">
                  <div className="max-w-[980px]">
                    <div className="text-xs font-semibold text-yellow-400/90 tracking-widest">DETALHES</div>

                    <h1 className="mt-2 text-4xl md:text-6xl font-black tracking-tight">{viewItem.title}</h1>

                    {isCalendarItem ? (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-yellow-400/30 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-200">
                        Em breve no CineSuper
                        {releaseDateLabel ? <span className="text-yellow-100/90">• {releaseDateLabel}</span> : null}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/80">
                      {viewItem.year ? <span>{viewItem.year}</span> : null}

                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${maturity.cls}`}
                        title={maturity.hint}
                      >
                        {maturity.label}
                      </span>

                      {durationLabel ? <span>{durationLabel}</span> : null}

                      {isTv && !isSeriesCard ? (
                        <span className="text-white/60">
                          • {seasonLabel} {currentSE.season} • Episódio {currentSE.episode}
                        </span>
                      ) : isTv && isSeriesCard ? (
                        <span className="text-white/60">
                          • {seasons.length} {String(seasonLabelPlural || "temporadas").toLowerCase()} • {episodes.length} episódio(s)
                        </span>
                      ) : null}

                      {tags.length ? <span className="text-white/50">• {tags.slice(0, 4).join(" • ")}</span> : null}
                    </div>

                    <div
                      className={[
                        "mt-6 flex items-center",
                        isTv ? "cs-hide-scrollbar flex-nowrap overflow-x-auto gap-2 md:gap-3 pr-4 pb-1" : "flex-wrap gap-3",
                      ].join(" ")}
                      style={isTv ? { scrollbarWidth: "none", msOverflowStyle: "none" } : undefined}
                    >
                      {isTv ? <style>{`.cs-hide-scrollbar::-webkit-scrollbar{display:none;}`}</style> : null}
                      <button
                        onClick={() => primaryWatchId && nav(`/watch/${primaryWatchId}`)}
                        disabled={!canWatch}
                        className={`
                          inline-flex items-center gap-2
                          ${btnSize}
                          rounded-xl
                          font-semibold
                          active:scale-[0.99]
                          transition
                          ${
                            canWatch
                              ? "bg-white text-black hover:bg-white/90"
                              : "bg-white/10 text-white/40 border border-white/10 cursor-not-allowed"
                          }
                        `}
                        title={canWatch ? "Assistir" : watchDisabledHint}
                      >
                        <Play className="h-5 w-5 md:h-6 md:w-6" fill="currentColor" />
                        Assistir
                      </button>

                      <button
                        onClick={() => {
                          const start = Number(resumeSec || 0);
                          const qs = start > 5 ? `?start=${encodeURIComponent(Math.floor(start))}` : "";
                          if (!primaryWatchId) return;
                          nav(`/watch/${primaryWatchId}${qs}`);
                        }}
                          disabled={!canWatch || resumeLoading}
                        className={`
                          inline-flex items-center justify-center
                          ${btnSize}
                          rounded-xl
                          bg-white/10 text-white
                          font-semibold
                          hover:bg-white/15
                          border border-white/10
                          active:scale-[0.99]
                          transition
                          disabled:bg-white/5 disabled:text-white/40 disabled:hover:bg-white/5
                        `}
                        title={canWatch ? (canResume ? `Retomar em ${fmtTime(resumeSec)}` : "Continuar") : watchDisabledHint}
                      >
                        {resumeLabel}
                      </button>

                      <button
                        onClick={handleLikeToggle}
                        disabled={!likeProfileId || likeBusy}
                        className={[
                          "inline-flex items-center justify-center gap-2",
                          btnSize,
                          "rounded-xl",
                          liked ? "bg-[#e50914] text-white" : "bg-white/10 text-white hover:bg-white/15",
                          "font-semibold",
                          "border border-white/10",
                          "active:scale-[0.99] transition",
                          !likeProfileId ? "opacity-50 cursor-not-allowed" : "",
                        ].join(" ")}
                        title={liked ? "Curtido (clique para remover)" : "Curtir"}
                      >
                        <Heart className="h-5 w-5 md:h-6 md:w-6" fill={liked ? "currentColor" : "none"} />
                        {liked ? "Curtido" : "Curtir"}
                      </button>

                      {isTv ? (
                        <button
                          onClick={() => setEpisodesOpen(true)}
                          disabled={epsLoading || !!epsErr || episodes.length === 0}
                          className={`
                            inline-flex items-center justify-center gap-2
                            ${btnSize}
                            rounded-xl
                            bg-white/10 text-white
                            font-semibold
                            hover:bg-white/15
                            border border-white/10
                            active:scale-[0.99]
                            transition
                            disabled:bg-white/5 disabled:text-white/40 disabled:hover:bg-white/5
                          `}
                          title={
                            episodes.length
                              ? `Ver ${String(seasonLabelPlural || "temporadas").toLowerCase()} e episódios`
                              : "Sem episódios publicados"
                          }
                        >
                          <ListVideo className="h-5 w-5 md:h-6 md:w-6" />
                          Episódios
                          <ChevronDown className="h-5 w-5" />
                        </button>
                      ) : null}

                      {hasTrailer ? (
                        <button
                          onClick={() => setTrailerOpen(true)}
                          className={`
                            inline-flex items-center justify-center gap-2
                            ${btnSize}
                            rounded-xl
                            bg-white/10 text-white
                            font-semibold
                            hover:bg-white/15
                            border border-white/10
                            active:scale-[0.99]
                            transition
                          `}
                          title="Assistir trailer"
                        >
                          <Film className="h-5 w-5 md:h-6 md:w-6" />
                          Trailer
                        </button>
                      ) : null}

                      <Link
                        to={`/browse`}
                        className={`
                          inline-flex items-center justify-center
                          ${btnSize}
                          rounded-xl
                          bg-white/5 text-white/90
                          font-semibold
                          hover:bg-white/10
                          border border-white/10
                          active:scale-[0.99]
                          transition
                        `}
                      >
                        Voltar
                      </Link>
                    </div>

                    {isTv ? (
                      <div className="mt-3 text-xs text-white/50">
                        {epsLoading
                          ? "Carregando episódios..."
                          : epsErr
                          ? epsErr
                          : episodes.length
                          ? `${seasonLabelPlural}: ${seasons.length} • Episódios: ${episodes.length}`
                          : "Nenhum episódio publicado ainda."}
                      </div>
                    ) : null}
                  </div>

                  {hasTrailer ? (
                    <div className="hidden lg:block relative z-20 mt-6 md:mt-10">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md overflow-hidden">
                        <div className="px-4 pt-4">
                          <div className="text-xs font-semibold tracking-widest text-yellow-400/90">TRAILER</div>
                          <div className="mt-1 text-sm text-white/80">Assista antes de começar</div>
                        </div>

                        <button
                          onClick={() => setTrailerOpen(true)}
                          className="relative mt-3 w-full aspect-video bg-black group"
                          title="Abrir trailer"
                        >
                          <img
                            src={trailerThumb}
                            alt="Trailer"
                            className="absolute inset-0 h-full w-full object-cover opacity-95"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-black/10" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-sm font-semibold text-white/90 group-hover:bg-black/55 transition">
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black font-black">
                                ▶
                              </span>
                              Ver trailer
                            </span>
                          </div>
                        </button>

                        <div className="p-4">
                          <div className="text-xs text-white/50">
                            Dica: pressione <span className="text-white/70">ESC</span> para fechar.
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </Container>
          </div>

          <div className="relative z-20 pb-20">
            <Container>
              <div className="grid gap-8 lg:grid-cols-[360px_1fr] items-start">
                <div className="w-full max-w-[380px]">
                  <div className="relative w-full aspect-[2/3] bg-black">
                    {posterImage ? (
                      <>
                        <img
                          src={posterImage}
                          alt=""
                          aria-hidden="true"
                          className="absolute inset-0 h-full w-full object-cover blur-2xl opacity-40 scale-110"
                          loading="eager"
                        />
                        <img
                          src={posterImage}
                          alt={viewItem.title}
                          className="relative z-10 h-full w-full object-contain"
                          loading="eager"
                        />
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-white/30">
                        sem poster
                      </div>
                    )}

                    {hasTrailer ? (
                      <button
                        onClick={() => setTrailerOpen(true)}
                        className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/45 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-black/60 transition"
                        title="Assistir trailer"
                      >
                        <Film className="h-4 w-4" />
                        Trailer
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                      {qualityLabel}
                    </span>
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                      HLS
                    </span>
                    {hasSubs ? (
                      <span className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                        Legendas
                      </span>
                    ) : null}

                    {!userCan4k && titleHas4k(viewItem) ? (
                      <span className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/50">
                        4K no Diamante
                      </span>
                    ) : null}

                    {isTv ? (
                      <span className="text-xs rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/80">
                        {isCourse ? "CURSO" : "SÉRIE"}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-6">
                    <div className="text-sm font-semibold text-white/90">Sinopse</div>
                    <div className="mt-2 text-sm md:text-base text-white/75 leading-relaxed">
                      {viewItem.synopsis || "Sem descrição cadastrada."}
                    </div>

                    {categories.length || tags.length ? (
                      <div className="mt-6 grid gap-5 md:grid-cols-2">
                        {categories.length ? (
                          <div>
                            <div className="text-sm font-semibold text-white/90">Categorias</div>
                            <div className="mt-2">
                              <Chips items={categories} />
                            </div>
                          </div>
                        ) : null}

                        {tags.length ? (
                          <div>
                            <div className="text-sm font-semibold text-white/90">Gêneros</div>
                            <div className="mt-2">
                              <Chips items={tags} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-6">
                      <div className="text-sm font-semibold text-white/90">Informações</div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <StatCard icon={Calendar} label="Ano" value={viewItem.year || "-"} />
                        <StatCard icon={Clock} label="Duração" value={durationLabel || "-"} />
                        <StatCard
                          icon={Shield}
                          label="Classificação"
                          value={maturity.hint || "Classificação indicativa"}
                          right={
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${maturity.cls}`}
                              title={maturity.hint}
                            >
                              {maturity.label}
                            </span>
                          }
                        />
                        <StatCard icon={Hash} label="ID público" value={viewItem.id} />
                      </div>
                    </div>

                    {director || creators.length || cast.length ? (
                      <div className="mt-6">
                        <div className="text-sm font-semibold text-white/90">Créditos</div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {director ? <StatCard icon={Users} label="Direção" value={director} /> : null}
                          {creators.length ? (
                            <StatCard icon={Users} label="Criação" value={creators.slice(0, 4).join(" • ")} />
                          ) : null}
                        </div>

                        {cast.length ? (
                          <div className="mt-4">
                            <div className="text-sm font-semibold text-white/90">Elenco</div>
                            <div className="mt-2 text-sm text-white/75 leading-relaxed">
                              {cast.slice(0, 18).join(" • ")}
                              {cast.length > 18 ? <span className="text-white/50"> • …</span> : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-6">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                        <Subtitles className="h-4 w-4 text-white/70" />
                        Idiomas e legendas
                      </div>

                      {hasSubs ? (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-4">
                          <div className="divide-y divide-white/10">
                            {subtitles.map((s, idx) => {
                              const label = s.label || (s.lang ? s.lang.toUpperCase() : `Legenda ${idx + 1}`);
                              return (
                                <div
                                  key={`${s.lang || "sub"}-${idx}`}
                                  className="py-3 flex items-start justify-between gap-3"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm text-white/85 truncate">{label}</div>
                                    <div className="mt-1 text-xs text-white/50">
                                      {s.lang ? `lang: ${s.lang}` : "lang: -"}
                                    </div>
                                  </div>
                                  {s.default ? (
                                    <span className="shrink-0 text-[10px] uppercase tracking-wider rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-white/80">
                                      padrão
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-white/60">
                          Nenhuma legenda cadastrada para este título.
                        </div>
                      )}
                    </div>
                  </div>

                  {categories.length === 0 && tags.length === 0 && cast.length === 0 && !director && creators.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md p-6">
                      <div className="text-sm font-semibold text-white/90">Mais detalhes</div>
                      <div className="mt-2 text-sm text-white/60">
                        Ainda não há metadados completos (categorias, elenco, direção). Assim que você puxar do TMDB, isso aparece aqui automaticamente.
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </Container>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
