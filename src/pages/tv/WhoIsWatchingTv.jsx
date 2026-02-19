// src/pages/tv/WhoIsWatchingTv.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Pencil, Plus, X, LogOut } from "lucide-react";
import { supabase } from "../../lib/supabaseClient.js";
import Logo from "../../assets/Logo.png";
import { APP_VERSION } from "../../lib/appVersion.js";

/* =========================
   Helpers
========================= */
function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  const a = parts[0]?.[0] || "U";
  const b = parts.length >= 2 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
}

function storageKeyActiveProfile(uid) {
  return `cs_active_profile:${uid || "anon"}`;
}
function storageKeyActiveProfileName(uid) {
  return `cs_active_profile_name:${uid || "anon"}`;
}

function safeSetStoredProfile(uid, profileId, profileName) {
  if (!uid) return;
  const k = storageKeyActiveProfile(uid);
  const kn = storageKeyActiveProfileName(uid);

  const pid = String(profileId || "").trim();
  const pname = String(profileName || "").trim();

  // ✅ persistir em localStorage (mantém após fechar/ligar TV)
  try {
    localStorage.setItem(k, pid);
    if (pname) localStorage.setItem(kn, pname);
  } catch {}

  // compat: também escreve em sessionStorage (rápido no runtime)
  try {
    sessionStorage.setItem(k, pid);
    if (pname) sessionStorage.setItem(kn, pname);
  } catch {}
}

function clearStoredProfile(uid) {
  if (!uid) return;
  const k = storageKeyActiveProfile(uid);
  const kn = storageKeyActiveProfileName(uid);

  try {
    localStorage.removeItem(k);
    localStorage.removeItem(kn);
  } catch {}

  try {
    sessionStorage.removeItem(k);
    sessionStorage.removeItem(kn);
  } catch {}
}

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

function isTextInput(el) {
  if (!el) return false;
  const tag = String(el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if (el.isContentEditable) return true;
  return false;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function preload(url) {
  try {
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = url;
  } catch {}
}

/* =========================
   Keymaps (TV)
========================= */
const KEY = {
  LEFT: [37, 21, 65361],
  UP: [38, 19, 65362],
  RIGHT: [39, 22, 65363],
  DOWN: [40, 20, 65364],
  ENTER: [13, 23, 66, 16777221],
};

const BACK_KEYCODES = [
  10009, // Samsung Tizen BACK
  461, // LG webOS BACK
  4, // Android TV BACK
  111, // Android ESC
  27, // Escape
];

function hasCode(list, code) {
  return list.includes(code);
}

function isBackLike(e) {
  const code = e?.keyCode ?? e?.which;
  const key = e?.key;
  const backspaceAsBack = code === 8 && !isTextInput(document.activeElement);

  return (
    BACK_KEYCODES.includes(code) ||
    backspaceAsBack ||
    key === "Escape" ||
    key === "BrowserBack" ||
    key === "GoBack"
  );
}

/* =========================
   TMDB Hero Background + Logos
========================= */
const TMDB_KEY = (import.meta?.env?.VITE_TMDB_KEY || "").trim();
const TMDB_BACKDROP_SIZE = "original"; // "original" | "w1280"
const TMDB_BACKDROP_BASE = `https://image.tmdb.org/t/p/${TMDB_BACKDROP_SIZE}`;
const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/original";

const HERO_CACHE_KEY = "cs_tmdb_hero_v1";
const LOGO_CACHE_KEY = "cs_tmdb_logo_v1";

function readHeroCache() {
  try {
    const raw = sessionStorage.getItem(HERO_CACHE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    const t = Number(j?.t || 0);
    const items = Array.isArray(j?.items) ? j.items : [];
    if (!t || !items.length) return null;
    if (Date.now() - t > 6 * 60 * 60 * 1000) return null;
    return items;
  } catch {
    return null;
  }
}
function writeHeroCache(items) {
  try {
    sessionStorage.setItem(HERO_CACHE_KEY, JSON.stringify({ t: Date.now(), items }));
  } catch {}
}

function readLogoCache() {
  try {
    const raw = sessionStorage.getItem(LOGO_CACHE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw);
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}
function writeLogoCache(obj) {
  try {
    sessionStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(obj));
  } catch {}
}

async function tmdbFetchJson(url, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`TMDB HTTP ${r.status}`);
  return r.json();
}

async function fetchTrendingHeroItems(signal) {
  if (!TMDB_KEY) return [];

  const uMovie = `https://api.themoviedb.org/3/trending/movie/week?api_key=${encodeURIComponent(
    TMDB_KEY
  )}&language=pt-BR`;

  const uTv = `https://api.themoviedb.org/3/trending/tv/week?api_key=${encodeURIComponent(
    TMDB_KEY
  )}&language=pt-BR`;

  const [jm, jt] = await Promise.all([tmdbFetchJson(uMovie, signal), tmdbFetchJson(uTv, signal)]);

  const toItem = (x, mediaType) => {
    const id = x?.id;
    const backdrop = x?.backdrop_path || "";
    if (!id || !backdrop) return null;

    const title =
      mediaType === "movie"
        ? String(x?.title || x?.original_title || "").trim()
        : String(x?.name || x?.original_name || "").trim();

    return {
      id: Number(id),
      media_type: mediaType,
      title: title || "Título",
      backdrop_url: `${TMDB_BACKDROP_BASE}${backdrop}`,
    };
  };

  const movies = (Array.isArray(jm?.results) ? jm.results : []).map((x) => toItem(x, "movie")).filter(Boolean);
  const tvs = (Array.isArray(jt?.results) ? jt.results : []).map((x) => toItem(x, "tv")).filter(Boolean);

  const map = new Map();
  [...movies, ...tvs].forEach((it) => map.set(`${it.media_type}:${it.id}`, it));
  const all = Array.from(map.values());

  const top = all.slice(0, 18);
  const rest = all.slice(18);
  return [...top, ...shuffle(rest)].slice(0, 40);
}

async function fetchBestLogoUrl({ media_type, id }, signal) {
  if (!TMDB_KEY) return "";

  const url = `https://api.themoviedb.org/3/${media_type}/${id}/images?api_key=${encodeURIComponent(
    TMDB_KEY
  )}&include_image_language=pt,en,null`;

  const j = await tmdbFetchJson(url, signal);
  const logos = Array.isArray(j?.logos) ? j.logos : [];
  if (!logos.length) return "";

  const langScore = (iso) => {
    if (iso === "pt") return 3;
    if (iso === "en") return 2;
    if (!iso) return 1;
    return 0;
  };

  const sorted = logos
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

/* =========================
   UI Pieces
========================= */
function Modal({ open, title, children, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-0 flex items-center justify-center p-8">
        <div className="w-full max-w-3xl rounded-[30px] border border-white/10 bg-[#0b0b0b] shadow-2xl">
          <div className="flex items-center justify-between px-8 py-6 border-b border-white/10">
            <div className="text-xl font-semibold text-white">{title}</div>
            <button
              type="button"
              onClick={onClose}
              tabIndex={-1}
              className="h-11 w-11 rounded-2xl grid place-items-center bg-white/5 hover:bg-white/10 border border-white/10"
              aria-label="Fechar"
            >
              <X className="h-5 w-5 text-white/80" />
            </button>
          </div>
          <div className="px-8 py-7">{children}</div>
        </div>
      </div>
    </div>
  );
}

function AvatarTile({ p, focused, setRef, tabIndex, onClick }) {
  const name = p?.name || "Perfil";
  return (
    <button
      ref={setRef}
      tabIndex={tabIndex}
      type="button"
      onClick={onClick}
      className={cx(
        "relative outline-none select-none",
        "h-[96px] w-[96px] rounded-2xl overflow-hidden",
        "border bg-white/[0.06] border-white/15",
        "transition",
        focused ? "ring-4 ring-white/85 scale-[1.06]" : "opacity-90 hover:opacity-100"
      )}
      aria-label={name}
      title={name}
    >
      {p?.avatar_url ? (
        <img src={p.avatar_url} alt={name} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="h-full w-full grid place-items-center">
          <div className="text-3xl font-black text-white/90">{initials(name)}</div>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/55" />
    </button>
  );
}

function AddTile({ focused, setRef, tabIndex, onClick }) {
  return (
    <button
      ref={setRef}
      tabIndex={tabIndex}
      type="button"
      onClick={onClick}
      className={cx(
        "outline-none select-none",
        "h-[96px] w-[96px] rounded-2xl grid place-items-center",
        "border border-white/15 bg-white/[0.04]",
        "transition",
        focused ? "ring-4 ring-white/85 scale-[1.06]" : "opacity-85 hover:opacity-100"
      )}
      aria-label="Adicionar perfil"
      title="Adicionar perfil"
    >
      <Plus className="h-9 w-9 text-white/85" />
    </button>
  );
}

function EditToggle({ focused, setRef, tabIndex, onClick, active }) {
  return (
    <button
      ref={setRef}
      tabIndex={tabIndex}
      type="button"
      onClick={onClick}
      className={cx(
        "outline-none select-none",
        "h-10 w-10 rounded-xl grid place-items-center",
        "border border-white/15 bg-black/20",
        "transition",
        focused ? "ring-4 ring-white/85 scale-[1.06]" : "opacity-80 hover:opacity-100",
        active ? "bg-white/10" : ""
      )}
      aria-label={active ? "Sair do modo edição" : "Editar perfis"}
      title={active ? "Sair do modo edição" : "Editar perfis"}
    >
      <Pencil className="h-5 w-5 text-white/90" />
    </button>
  );
}

function LogoutButton({ focused, setRef, tabIndex, onClick }) {
  return (
    <button
      ref={setRef}
      tabIndex={tabIndex}
      type="button"
      onClick={onClick}
      className={cx(
        "outline-none select-none inline-flex items-center gap-2",
        "rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-2",
        "text-[12px] font-semibold text-white/85",
        focused ? "ring-2 ring-white/70 scale-[1.02]" : "opacity-80 hover:opacity-100"
      )}
      aria-label="Sair"
      title="Sair"
    >
      <LogOut className="h-5 w-13" />
      Sair
    </button>
  );
}

/* =========================
   Screen
========================= */
export default function WhoIsWatchingTv() {
  const nav = useNavigate();
  const location = useLocation();

  const DEV = Boolean(import.meta.env.DEV);

  // ✅ evita “tela preta” sem diagnóstico
  const [crash, setCrash] = useState("");
  useEffect(() => {
    const onErr = (e) => setCrash(String(e?.message || e?.error?.message || e));
    const onRej = (e) => setCrash(String(e?.reason?.message || e?.reason || e));
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  const from = useMemo(() => {
    const st = location.state || {};
    let raw = String(st.from || "").trim();

    if (!raw) return "/browse";
    if (/\/login/i.test(raw) || raw === "/tv") return "/browse";
    if (raw.startsWith("/tv/")) raw = raw.replace(/^\/tv/, "") || "/browse";

    if (raw === "/browse" || raw === "/who") return raw;
    if (raw.startsWith("/watch/")) return raw;
    if (raw.startsWith("/t/")) return raw;

    return "/browse";
  }, [location.state]);

  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // focus model: footer/logout | edit | list
  const [focusArea, setFocusArea] = useState("list"); // "footer" | "edit" | "list"
  const [activeIndex, setActiveIndex] = useState(0);

  const logoutRef = useRef(null);
  const editBtnRef = useRef(null);
  const tileRefs = useRef([]); // profiles + add

  const [editMode, setEditMode] = useState(false);

  // Hero background state (2 layers crossfade)
  const [layerA, setLayerA] = useState({ backdrop: "", title: "", logo: "" });
  const [layerB, setLayerB] = useState({ backdrop: "", title: "", logo: "" });
  const [activeLayer, setActiveLayer] = useState("A"); // A/B
  const activeLayerRef = useRef("A");

  const heroListRef = useRef([]);
  const heroIdxRef = useRef(0);
  const heroTimerRef = useRef(null);

  const [heroInfo, setHeroInfo] = useState({ total: 0, logos: 0, err: "" });

  const selectedProfile = profiles[activeIndex] || null;

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editTargetId, setEditTargetId] = useState("");
  const [modalFocus, setModalFocus] = useState("input"); // input | save | cancel
  const inputRef = useRef(null);
  const saveBtnRef = useRef(null);
  const cancelBtnRef = useRef(null);

  const doLogout = useCallback(async () => {
    try {
      clearStoredProfile(userId);
    } catch {}

    try {
      await supabase.auth.signOut();
    } catch {}

    nav("/login", { replace: true });
  }, [nav, userId]);

  // Hint ✅ (era isso que estava faltando e te dava tela preta)
  const hint = editOpen
    ? "↑↓: navegar • OK: confirmar • Back: fechar"
    : editMode

  // Freeze scroll
  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  // HERO init + rotation
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const logoCache = readLogoCache();

    async function ensureLogo(item) {
      if (!item?.id || !item?.media_type) return "";
      const key = `${item.media_type}:${item.id}`;

      if (Object.prototype.hasOwnProperty.call(logoCache, key)) return logoCache[key] || "";

      try {
        const url = await fetchBestLogoUrl(item, ctrl.signal);
        logoCache[key] = url || "";
        writeLogoCache(logoCache);
        if (url) preload(url);
        return url || "";
      } catch {
        logoCache[key] = "";
        writeLogoCache(logoCache);
        return "";
      }
    }

    async function setLayer(which, item) {
      if (!item) return;
      preload(item.backdrop_url);

      const logo = await ensureLogo(item);
      const payload = {
        backdrop: item.backdrop_url,
        title: item.title || "Título",
        logo: logo || "",
      };

      if (!alive) return;
      if (which === "A") setLayerA(payload);
      else setLayerB(payload);
    }

    async function rotate() {
      const list = heroListRef.current || [];
      if (list.length < 2) return;

      const next = list[heroIdxRef.current % list.length];
      heroIdxRef.current = (heroIdxRef.current + 1) % list.length;

      const peek = list[heroIdxRef.current % list.length];
      if (peek?.backdrop_url) preload(peek.backdrop_url);

      const cur = activeLayerRef.current;
      if (cur === "A") {
        await setLayer("B", next);
        setActiveLayer("B");
        activeLayerRef.current = "B";
      } else {
        await setLayer("A", next);
        setActiveLayer("A");
        activeLayerRef.current = "A";
      }

      const cached = readLogoCache();
      const logosCount = Object.values(cached).filter((v) => !!v).length;
      setHeroInfo((s) => ({ ...s, logos: logosCount }));
    }

    async function init() {
      setHeroInfo({ total: 0, logos: 0, err: "" });

      try {
        let items = readHeroCache();
        if (!items) {
          items = await fetchTrendingHeroItems(ctrl.signal);
          writeHeroCache(items);
        }

        if (!alive) return;

        if (!items || !items.length) {
          setHeroInfo({
            total: 0,
            logos: 0,
            err: "Sem itens do TMDB (verifique VITE_TMDB_KEY / rede).",
          });
          return;
        }

        heroListRef.current = items;
        heroIdxRef.current = 0;
        setHeroInfo((s) => ({ ...s, total: items.length }));

        const first = items[0];
        const second = items[1] || items[0];

        await setLayer("A", first);
        await setLayer("B", second);

        setActiveLayer("A");
        activeLayerRef.current = "A";
        heroIdxRef.current = 2;

        for (let i = 2; i < Math.min(10, items.length); i++) preload(items[i].backdrop_url);

        if (heroTimerRef.current) clearInterval(heroTimerRef.current);
        heroTimerRef.current = setInterval(() => rotate(), 9000);
      } catch (e) {
        if (!alive) return;
        setHeroInfo({ total: 0, logos: 0, err: String(e?.message || "Erro ao carregar TMDB.") });
      }
    }

    init();

    return () => {
      alive = false;
      try {
        ctrl.abort();
      } catch {}
      if (heroTimerRef.current) {
        clearInterval(heroTimerRef.current);
        heroTimerRef.current = null;
      }
    };
  }, []);

  // Prevent browser back to /tv
  useEffect(() => {
    const lockState = { __cs_who_lock: true };
    try {
      window.history.pushState(lockState, "", window.location.href);
    } catch {}

    const onPopState = () => {
      try {
        window.history.pushState(lockState, "", window.location.href);
      } catch {}
      if (editOpen) closeEditModal();
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen]);

  // cs:tv-back
  useEffect(() => {
    function onTvBack(e) {
      try {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        e?.stopImmediatePropagation?.();
      } catch {}
      if (editOpen) closeEditModal();
    }
    window.addEventListener("cs:tv-back", onTvBack);
    return () => window.removeEventListener("cs:tv-back", onTvBack);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen]);

  // Load profiles (com “nudge” de sessão ao abrir Who)
  useEffect(() => {
    let alive = true;

    async function ensureDefaultProfile(uid, email) {
      const fallbackName = (() => {
        const e = String(email || "").trim();
        if (e.includes("@")) return e.split("@")[0] || "Perfil 1";
        return "Perfil 1";
      })();

      await supabase.from("user_profiles").insert({
        user_id: uid,
        name: fallbackName,
        avatar_url: null,
        pin_set: false,
        is_kids: false,
      });
    }

    async function load() {
      setLoading(true);
      setErr("");

      try {
        const { data: s0 } = await supabase.auth.getSession();
        if (!s0?.session) {
          try {
            await supabase.auth.refreshSession?.();
          } catch {}
        }

        const { data } = await supabase.auth.getUser();
        const u = data?.user || null;
        if (!alive) return;

        const uid = u?.id || "";
        const email = u?.email || "";
        setUserId(uid);

        if (!uid) {
          setErr("Sessão inválida. Faça login novamente.");
          setProfiles([]);
          setLoading(false);
          return;
        }

        const r1 = await supabase
          .from("user_profiles")
          .select("id, name, avatar_url, is_kids, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: true });

        if (r1.error) throw r1.error;

        let list = Array.isArray(r1.data) ? r1.data : [];
        if (!list.length) {
          await ensureDefaultProfile(uid, email);
          const r2 = await supabase
            .from("user_profiles")
            .select("id, name, avatar_url, is_kids, created_at")
            .eq("user_id", uid)
            .order("created_at", { ascending: true });
          if (r2.error) throw r2.error;
          list = Array.isArray(r2.data) ? r2.data : [];
        }

        setProfiles(list.slice(0, 6));
      } catch (e) {
        setErr(String(e?.message || "Falha ao carregar perfis."));
        setProfiles([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  // Focus init
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      setFocusArea("list");
      setActiveIndex(0);
      requestAnimationFrame(() => {
        try {
          tileRefs.current[0]?.focus?.();
        } catch {}
      });
    }, 80);
    return () => clearTimeout(t);
  }, [loading]);

  function pickProfile(p) {
    if (!p?.id || !userId) return;
    safeSetStoredProfile(userId, p.id, p.name || "Perfil");
    try {
      window.dispatchEvent(new CustomEvent("cs:profile-changed", { detail: { profileId: String(p.id) } }));
    } catch {}
    nav(from, { state: { from: "/who" } });
  }

  function openEditModalFor(profile) {
    if (!profile?.id || !userId) return;
    setEditTargetId(String(profile.id));
    setEditName(String(profile.name || "").trim());
    setEditOpen(true);
    setSaving(false);
    setModalFocus("input");
    requestAnimationFrame(() => inputRef.current?.focus?.());
  }

  function closeEditModal() {
    setEditOpen(false);
    setSaving(false);
    requestAnimationFrame(() => {
      setFocusArea("list");
      try {
        tileRefs.current[activeIndex]?.focus?.();
      } catch {}
    });
  }

  async function saveEdit() {
    if (!editTargetId || !userId) return;
    const name = String(editName || "").trim();
    if (!name) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ name })
        .eq("id", editTargetId)
        .eq("user_id", userId);

      if (error) throw error;

      setProfiles((prev) => prev.map((x) => (String(x.id) === String(editTargetId) ? { ...x, name } : x)));
      closeEditModal();
    } catch (e) {
      alert(String(e?.message || "Falha ao salvar perfil."));
      setSaving(false);
    }
  }

  async function addProfile() {
    if (!userId) return;
    if (profiles.length >= 6) return;

    const name = `Perfil ${profiles.length + 1}`;
    try {
      const { error } = await supabase.from("user_profiles").insert({
        user_id: userId,
        name,
        avatar_url: null,
        pin_set: false,
        is_kids: false,
      });
      if (error) throw error;

      const r = await supabase
        .from("user_profiles")
        .select("id, name, avatar_url, is_kids, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (r.error) throw r.error;
      const list = Array.isArray(r.data) ? r.data.slice(0, 6) : [];
      setProfiles(list);

      const newIndex = Math.max(0, list.length - 1);
      setActiveIndex(newIndex);
      setFocusArea("list");
      requestAnimationFrame(() => tileRefs.current[newIndex]?.focus?.());
    } catch (e) {
      alert(String(e?.message || "Falha ao criar perfil."));
    }
  }

  // Key handler (↓ no final vai para Sair)
  useEffect(() => {
    function focusListAt(idx) {
      setFocusArea("list");
      requestAnimationFrame(() => tileRefs.current[idx]?.focus?.());
    }

    function onKeyDown(e) {
      const code = e.keyCode ?? e.which;

      // evita “scroll” do browser com setas (fora de inputs)
      const ae = document.activeElement;
      const inInput = isTextInput(ae);
      if (
        !inInput &&
        (hasCode(KEY.LEFT, code) || hasCode(KEY.UP, code) || hasCode(KEY.RIGHT, code) || hasCode(KEY.DOWN, code))
      ) {
        e.preventDefault();
      }

      if (isBackLike(e)) {
        e.preventDefault();
        e.stopPropagation();
        try {
          e.stopImmediatePropagation?.();
        } catch {}
        if (editOpen) closeEditModal();
        return;
      }

      // modal
      if (editOpen) {
        if (hasCode(KEY.UP, code)) {
          e.preventDefault();
          setModalFocus("input");
          requestAnimationFrame(() => inputRef.current?.focus?.());
          return;
        }
        if (hasCode(KEY.DOWN, code)) {
          e.preventDefault();
          setModalFocus("save");
          requestAnimationFrame(() => saveBtnRef.current?.focus?.());
          return;
        }
        if (hasCode(KEY.LEFT, code) || hasCode(KEY.RIGHT, code)) {
          e.preventDefault();
          if (modalFocus === "save") {
            setModalFocus("cancel");
            requestAnimationFrame(() => cancelBtnRef.current?.focus?.());
          } else if (modalFocus === "cancel") {
            setModalFocus("save");
            requestAnimationFrame(() => saveBtnRef.current?.focus?.());
          }
          return;
        }
        if (hasCode(KEY.ENTER, code)) {
          e.preventDefault();
          if (modalFocus === "save") {
            if (!saving) saveEdit();
          } else if (modalFocus === "cancel") {
            closeEditModal();
          } else {
            setModalFocus("save");
            requestAnimationFrame(() => saveBtnRef.current?.focus?.());
          }
        }
        return;
      }

      const showAdd = profiles.length < 6;
      const listCount = profiles.length + (showAdd ? 1 : 0);
      const lastIndex = Math.max(0, listCount - 1);

      // FOOTER
      if (focusArea === "footer") {
        if (hasCode(KEY.UP, code)) {
          e.preventDefault();
          focusListAt(Math.min(activeIndex, lastIndex));
          return;
        }
        if (hasCode(KEY.ENTER, code)) {
          e.preventDefault();
          doLogout();
          return;
        }
        if (hasCode(KEY.LEFT, code) || hasCode(KEY.RIGHT, code) || hasCode(KEY.DOWN, code)) {
          e.preventDefault();
          return;
        }
      }

      // LEFT/RIGHT: apenas Edit ⇄ List
      if (hasCode(KEY.LEFT, code)) {
        e.preventDefault();
        if (focusArea === "list") {
          setFocusArea("edit");
          requestAnimationFrame(() => editBtnRef.current?.focus?.());
        }
        return;
      }
      if (hasCode(KEY.RIGHT, code)) {
        e.preventDefault();
        if (focusArea === "edit") {
          setFocusArea("list");
          requestAnimationFrame(() => tileRefs.current[activeIndex]?.focus?.());
        }
        return;
      }

      // UP/DOWN
      if (hasCode(KEY.UP, code)) {
        e.preventDefault();
        if (focusArea === "list") {
          const next = Math.max(0, activeIndex - 1);
          setActiveIndex(next);
          requestAnimationFrame(() => tileRefs.current[next]?.focus?.());
        }
        return;
      }

      if (hasCode(KEY.DOWN, code)) {
        e.preventDefault();

        if (focusArea === "edit") {
          setFocusArea("footer");
          requestAnimationFrame(() => logoutRef.current?.focus?.());
          return;
        }

        if (focusArea === "list") {
          // se estiver no último tile -> vai para o Sair
          if (activeIndex >= lastIndex) {
            setFocusArea("footer");
            requestAnimationFrame(() => logoutRef.current?.focus?.());
            return;
          }

          const next = Math.min(lastIndex, activeIndex + 1);
          setActiveIndex(next);
          requestAnimationFrame(() => tileRefs.current[next]?.focus?.());
          return;
        }
        return;
      }

      // ENTER
      if (hasCode(KEY.ENTER, code)) {
        e.preventDefault();

        if (focusArea === "edit") {
          setEditMode((v) => !v);
          return;
        }

        if (focusArea === "list") {
          if (showAdd && activeIndex === profiles.length) {
            addProfile();
            return;
          }

          const p = profiles[activeIndex];
          if (!p) return;

          if (editMode) openEditModalFor(p);
          else pickProfile(p);
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false, capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [profiles, activeIndex, focusArea, editMode, editOpen, modalFocus, saving, userId, editName, from, doLogout]);

  const showA = activeLayer === "A";
  const A = layerA;
  const B = layerB;

  const showAdd = profiles.length < 6;
  const selectedName =
    focusArea === "list" && showAdd && activeIndex === profiles.length
      ? "Criar um perfil"
      : selectedProfile?.name || (loading ? "Carregando..." : "Escolha um perfil");

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
      {/* Crash overlay */}
      {crash ? (
        <div className="absolute inset-0 z-[9999] bg-black text-white p-6">
          <div className="text-lg font-extrabold">CRASH (Who)</div>
          <pre className="mt-3 text-xs whitespace-pre-wrap text-white/80">{crash}</pre>
        </div>
      ) : null}

      {/* HERO BACKGROUND */}
      <div className="absolute inset-0">
        {/* Layer A */}
        {A.backdrop ? (
          <div className={cx("absolute inset-0 transition-opacity duration-[900ms]", showA ? "opacity-100" : "opacity-0")}>
            <img
              src={A.backdrop}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover object-right"
              style={{ transform: "scale(1.04)", filter: "brightness(0.95)" }}
            />

            <div className="absolute inset-0 bg-black/25" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg," +
                  "rgba(0,0,0,0.88) 0%," +
                  "rgba(0,0,0,0.88) 42%," +
                  "rgba(0,0,0,0.72) 52%," +
                  "rgba(0,0,0,0.42) 62%," +
                  "rgba(0,0,0,0.18) 70%," +
                  "rgba(0,0,0,0.00) 78%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(55% 70% at 52% 50%, rgba(0,0,0,0.22), rgba(0,0,0,0) 65%)",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/75" />

            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute right-14 bottom-14 max-w-[760px] text-right">
                {A.logo ? (
                  <img
                    src={A.logo}
                    alt={A.title}
                    draggable={false}
                    className="ml-auto max-h-[140px] w-auto object-contain"
                    style={{ filter: "drop-shadow(0 18px 55px rgba(0,0,0,0.75))" }}
                  />
                ) : (
                  <div className="text-4xl font-black tracking-tight leading-tight text-white">{A.title}</div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Layer B */}
        {B.backdrop ? (
          <div className={cx("absolute inset-0 transition-opacity duration-[900ms]", showA ? "opacity-0" : "opacity-100")}>
            <img
              src={B.backdrop}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover object-right"
              style={{ transform: "scale(1.04)", filter: "brightness(0.95)" }}
            />

            <div className="absolute inset-0 bg-black/25" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg," +
                  "rgba(0,0,0,0.88) 0%," +
                  "rgba(0,0,0,0.88) 42%," +
                  "rgba(0,0,0,0.72) 52%," +
                  "rgba(0,0,0,0.42) 62%," +
                  "rgba(0,0,0,0.18) 70%," +
                  "rgba(0,0,0,0.00) 78%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: "radial-gradient(55% 70% at 52% 50%, rgba(0,0,0,0.22), rgba(0,0,0,0) 65%)",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/75" />

            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute right-14 bottom-14 max-w-[760px] text-right">
                {B.logo ? (
                  <img
                    src={B.logo}
                    alt={B.title}
                    draggable={false}
                    className="ml-auto max-h-[140px] w-auto object-contain"
                    style={{ filter: "drop-shadow(0 18px 55px rgba(0,0,0,0.75))" }}
                  />
                ) : (
                  <div className="text-4xl font-black tracking-tight leading-tight text-white">{B.title}</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-black" />
            <div className="absolute left-0 top-0 h-full w-[52%] bg-black/80" />
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className="relative z-10 h-full pl-16 pr-0 py-14">
        <div className="w-[52%] max-w-[820px]">
          <div className="flex items-center gap-4">
            <img src={Logo} alt="CineSuper" className="h-20 w-auto" draggable={false} />
          </div>

          <div className="mt-8">
            <div className="text-white/80 text-3xl font-semibold">Escolha um perfil</div>
            <div className="mt-2 text-xs text-white/55">{hint}</div>
          </div>

          {err ? (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-5 text-red-200">
              {err}
            </div>
          ) : null}

          <div className="mt-10 flex items-start gap-8">
            <div className="pt-2">
              <EditToggle
                focused={focusArea === "edit"}
                setRef={(el) => (editBtnRef.current = el)}
                tabIndex={focusArea === "edit" ? 0 : -1}
                onClick={() => setEditMode((v) => !v)}
                active={editMode}
              />
            </div>

            <div className="flex flex-col gap-4">
              {profiles.map((p, idx) => (
                <AvatarTile
                  key={p.id}
                  p={p}
                  focused={focusArea === "list" && idx === activeIndex}
                  setRef={(el) => {
                    tileRefs.current[idx] = el;
                  }}
                  tabIndex={focusArea === "list" && idx === activeIndex ? 0 : -1}
                  onClick={() => {
                    setFocusArea("list");
                    setActiveIndex(idx);
                    if (editMode) openEditModalFor(p);
                    else pickProfile(p);
                  }}
                />
              ))}

              {showAdd ? (
                <AddTile
                  focused={focusArea === "list" && activeIndex === profiles.length}
                  setRef={(el) => {
                    tileRefs.current[profiles.length] = el;
                  }}
                  tabIndex={focusArea === "list" && activeIndex === profiles.length ? 0 : -1}
                  onClick={addProfile}
                />
              ) : null}
            </div>

            <div className="pt-3">
              <div className="text-5xl font-semibold tracking-tight text-white">{selectedName}</div>
              <div className="mt-3 text-sm text-white/60">{editMode ? "Modo edição ativado" : "Pressione OK para entrar"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Logout + debug/version */}
      <div className="absolute left-6 bottom-6 flex items-center gap-3">
        <LogoutButton
          focused={focusArea === "footer"}
          setRef={(el) => (logoutRef.current = el)}
          tabIndex={focusArea === "footer" ? 0 : -1}
          onClick={doLogout}
        />
      </div>

      {/* Edit modal */}
      <Modal open={editOpen} title="Editar perfil" onClose={closeEditModal}>
        <div className="space-y-6">
          <div className="text-sm text-white/60">Altere o nome do perfil.</div>

          <div className="grid gap-2">
            <label className="text-xs text-white/60">Nome do perfil</label>
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-14 rounded-2xl bg-white/5 border border-white/10 px-5 text-white text-lg outline-none focus:border-white/25"
              placeholder="Ex: Marcos, Crianças, Família..."
              onFocus={() => setModalFocus("input")}
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              ref={saveBtnRef}
              type="button"
              onClick={saveEdit}
              disabled={saving || !String(editName || "").trim()}
              className={cx(
                "h-14 px-6 rounded-2xl font-semibold outline-none text-base",
                modalFocus === "save" ? "ring-4 ring-white/70" : "",
                saving || !String(editName || "").trim()
                  ? "bg-white/10 text-white/40 cursor-not-allowed"
                  : "bg-white text-black hover:bg-white/90"
              )}
              onFocus={() => setModalFocus("save")}
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>

            <button
              ref={cancelBtnRef}
              type="button"
              onClick={closeEditModal}
              className={cx(
                "h-14 px-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 outline-none text-base",
                modalFocus === "cancel" ? "ring-4 ring-white/70" : ""
              )}
              onFocus={() => setModalFocus("cancel")}
            >
              Cancelar
            </button>

            <div className="ml-auto text-xs text-white/45">OK: salvar • Back: fechar</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
