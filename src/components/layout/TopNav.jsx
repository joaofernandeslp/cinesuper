// src/components/layout/TopNav.jsx
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Container from "./Container.jsx";
import Logo from "../../assets/Logo.png";
import { Search, X, ChevronDown, User, HelpCircle, LogOut, Shield, Tags } from "lucide-react";
import { supabase } from "../../lib/supabaseClient.js";

const navItem = (active) =>
  `text-sm transition ${active ? "text-white" : "text-white/70 hover:text-white"}`;

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  const a = parts[0]?.[0] || "U";
  const b = parts.length >= 2 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
}

function parseAdminEmails(envValue) {
  return String(envValue || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
const ADMIN_EMAILS = parseAdminEmails(import.meta.env.VITE_ADMIN_EMAILS);

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 8;
const MIN_SEARCH_CHARS = 3;

// ✅ Categorias (Gêneros) via env opcional
function parseCategoriesEnv(envValue) {
  return String(envValue || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ id: name.toLowerCase(), name }));
}
const ENV_CATEGORIES = parseCategoriesEnv(import.meta.env.VITE_CATEGORIES);

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function storageKeyActiveProfile(uid) {
  return `cs_active_profile:${uid || "anon"}`;
}
function storageKeyActiveProfileName(uid) {
  return `cs_active_profile_name:${uid || "anon"}`;
}

function safeGetStoredProfileId(uid) {
  if (!uid) return "";
  const k = storageKeyActiveProfile(uid);
  try {
    const ss = String(sessionStorage.getItem(k) || "").trim();
    if (ss) return ss;
  } catch {}
  try {
    const ls = String(localStorage.getItem(k) || "").trim();
    if (ls) return ls;
  } catch {}
  return "";
}

function safeSetStoredProfile(uid, profileId, profileName) {
  if (!uid) return;
  const k = storageKeyActiveProfile(uid);
  const kn = storageKeyActiveProfileName(uid);
  const pid = String(profileId || "").trim();
  const pname = String(profileName || "").trim();

  try {
    sessionStorage.setItem(k, pid);
    if (pname) sessionStorage.setItem(kn, pname);
  } catch {}

  // Compatibilidade com código legado que ainda lê localStorage
  try {
    localStorage.setItem(k, pid);
    if (pname) localStorage.setItem(kn, pname);
  } catch {}
}

function safeClearStoredProfile(uid) {
  if (!uid) return;
  const k = storageKeyActiveProfile(uid);
  const kn = storageKeyActiveProfileName(uid);

  try {
    sessionStorage.removeItem(k);
    sessionStorage.removeItem(kn);
  } catch {}
  try {
    localStorage.removeItem(k);
    localStorage.removeItem(kn);
  } catch {}
}

function buildBrowseUrl(params = {}) {
  const sp = new URLSearchParams();

  if (params.search) sp.set("search", String(params.search));
  if (params.type) sp.set("type", String(params.type)); // movie | series
  if (params.trending) sp.set("trending", "1");
  if (params.list) sp.set("list", "1");
  if (params.calendar) sp.set("calendar", "1");
  if (params.cat) sp.set("cat", String(params.cat));

  const qs = sp.toString();
  return `/browse${qs ? `?${qs}` : ""}`;
}

export default function TopNav() {
  const location = useLocation();
  const nav = useNavigate();

  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [scrolled, setScrolled] = useState(false);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Perfil dropdown
  const [profileOpen, setProfileOpen] = useState(false);
  const profileWrapRef = useRef(null);

  // ✅ Gêneros dropdown
  const [catOpen, setCatOpen] = useState(false);
  const catWrapRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [catsLoading, setCatsLoading] = useState(true);

  // Perfis reais (Supabase)
  const [profiles, setProfiles] = useState([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState("");

  // Auth
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const lastUserIdRef = useRef("");

  // Search results
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);

  const isAdmin = useMemo(() => {
    const e = String(userEmail || "").trim().toLowerCase();
    if (!e) return false;
    return ADMIN_EMAILS.includes(e);
  }, [userEmail]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || null,
    [profiles, activeProfileId]
  );

  // Estado de filtros
  const browseParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const isBrowse = location.pathname === "/browse";
  const pType = (browseParams.get("type") || "").toLowerCase();
  const pTrending = browseParams.get("trending") === "1";
  const pList = browseParams.get("list") === "1";
  const pSearch = (browseParams.get("search") || "").trim();
  const pCat = (browseParams.get("cat") || "").trim();
  const pCalendar = browseParams.get("calendar") === "1";

  const activeHome = isBrowse && !pType && !pTrending && !pList && !pSearch && !pCat && !pCalendar;
  const activeMovies = isBrowse && pType === "movie";
  const activeSeries = isBrowse && (pType === "series" || pType === "tv");
  const activeTrending = isBrowse && pTrending;
  const activeMyList = isBrowse && pList;
  const activeCalendar = isBrowse && pCalendar;
  const activeGospel = isBrowse && norm(pCat) === "gospel";

  function openSearch() {
    setSearchOpen(true);
    setProfileOpen(false);
    setCatOpen(false);
  }

  function closeSearch() {
    setSearchOpen(false);
    setQ("");
    setResults([]);
    setSearching(false);
  }

  function toggleProfile() {
    setProfileOpen((v) => !v);
    setSearchOpen(false);
    setCatOpen(false);
  }

  function closeProfile() {
    setProfileOpen(false);
  }

  function toggleCats() {
    setCatOpen((v) => !v);
    setSearchOpen(false);
    setProfileOpen(false);
  }

  function closeCats() {
    setCatOpen(false);
  }

  function pickCategory(catName) {
    const c = String(catName || "").trim();
    closeCats();
    closeSearch();
    closeProfile();

    if (!c) {
      nav(buildBrowseUrl({}));
      return;
    }

    nav(buildBrowseUrl({ cat: c }));
  }

  function pickProfile(pid) {
    const next = String(pid || "").trim();
    if (!next) return;

    if (next === String(activeProfileId || "").trim()) {
      closeProfile();
      return;
    }

    setActiveProfileId(next);

    const p = (profiles || []).find((x) => x.id === next);
    safeSetStoredProfile(userId, next, p?.name || "");

    try {
      window.dispatchEvent(new CustomEvent("cs:profile-changed", { detail: { profileId: next } }));
    } catch {}

    closeProfile();
  }

  async function onLogout() {
    safeClearStoredProfile(userId);

    try {
      await supabase.auth.signOut();
    } catch {}

    closeProfile();
    nav("/login", { replace: true });
  }

  function goBrowseWithFilter(nextUrl) {
    closeSearch();
    closeProfile();
    closeCats();
    nav(nextUrl);
  }

  function goBrowseSearch(term) {
    const t = String(term || "").trim();
    if (t.length < MIN_SEARCH_CHARS) return;
    goBrowseWithFilter(buildBrowseUrl({ search: t }));
  }

  function goTitle(id) {
    const tid = String(id || "").trim();
    if (!tid) return;
    closeSearch();
    nav(`/t/${encodeURIComponent(tid)}`);
  }

  function onSearchIconClick() {
    if (!searchOpen) {
      openSearch();
      return;
    }

    const t = String(q || "").trim();
    if (t.length >= MIN_SEARCH_CHARS) {
      goBrowseSearch(t);
      return;
    }

    inputRef.current?.focus?.();
  }

  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  // ✅ Carregar categorias
  useEffect(() => {
    let alive = true;

    async function loadCats() {
      setCatsLoading(true);

      try {
        const seed = Array.isArray(ENV_CATEGORIES) ? ENV_CATEGORIES : [];
        const { data, error } = await supabase.from("titles").select("categories").limit(2000);

        if (!alive) return;

        if (error) {
          setCategories(seed);
          setCatsLoading(false);
          return;
        }

        const skip = new Set(["filmes", "filme", "series", "séries"]);
        const map = new Map();

        const addCat = (name) => {
          const label = String(name || "").trim();
          if (!label) return;
          const key = norm(label);
          if (!key || skip.has(key)) return;
          if (!map.has(key)) map.set(key, label);
        };

        for (const c of seed) {
          if (!c) continue;
          if (typeof c === "string") addCat(c);
          else addCat(c.name || c.id);
        }

        for (const r of data || []) {
          const cats = Array.isArray(r?.categories) ? r.categories : [];
          for (const c of cats) {
            addCat(c);
          }
        }

        const list = Array.from(map.entries())
          .map(([key, name]) => ({ id: key, name }))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 80);

        setCategories(list);
        setCatsLoading(false);
      } catch {
        if (!alive) return;
        setCategories(Array.isArray(ENV_CATEGORIES) ? ENV_CATEGORIES : []);
        setCatsLoading(false);
      }
    }

    loadCats();

    return () => {
      alive = false;
    };
  }, []);

  // Auth load + updates
  useEffect(() => {
    let alive = true;

    async function loadAuth() {
      try {
        const { data } = await supabase.auth.getUser();
        const u = data?.user || null;
        if (!alive) return;
        setUserEmail(u?.email || "");
        setUserId(u?.id || "");
        lastUserIdRef.current = u?.id || "";
      } catch {
        if (!alive) return;
        setUserEmail("");
        setUserId("");
        lastUserIdRef.current = "";
      }
    }

    loadAuth();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user || null;
      const nextUid = u?.id || "";

      if (lastUserIdRef.current && lastUserIdRef.current !== nextUid) {
        safeClearStoredProfile(lastUserIdRef.current);
      }

      setUserEmail(u?.email || "");
      setUserId(nextUid);
      lastUserIdRef.current = nextUid;
    });

    return () => {
      alive = false;
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  // Carrega perfis
  useEffect(() => {
    let alive = true;

    async function ensureDefaultProfile(uid) {
      const fallbackName = (() => {
        const e = String(userEmail || "").trim();
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

    async function loadProfiles(uid) {
      if (!uid) {
        setProfiles([]);
        setActiveProfileId("");
        setProfilesLoading(false);
        return;
      }

      setProfilesLoading(true);

      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, name, avatar_url, is_kids, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: true });

      if (!alive) return;

      if (error) {
        setProfiles([]);
        setActiveProfileId("");
        setProfilesLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        await ensureDefaultProfile(uid);

        const retry = await supabase
          .from("user_profiles")
          .select("id, name, avatar_url, is_kids, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: true });

        if (!alive) return;

        const list = Array.isArray(retry.data) ? retry.data : [];
        setProfiles(list.slice(0, 6));
        setProfilesLoading(false);
        return;
      }

      setProfiles(data.slice(0, 6));
      setProfilesLoading(false);
    }

    loadProfiles(userId);

    return () => {
      alive = false;
    };
  }, [userId, userEmail]);

  // Resolve perfil ativo
  useEffect(() => {
    if (!userId) return;
    if (profilesLoading) return;

    const saved = safeGetStoredProfileId(userId);
    const valid = saved && profiles.some((p) => String(p.id) === saved) ? saved : "";

    setActiveProfileId(valid);

    if (valid) {
      const p = profiles.find((x) => String(x.id) === valid);
      safeSetStoredProfile(userId, valid, p?.name || "");
    }
  }, [profilesLoading, profiles, userId]);

  // Se algum lugar disparar profile-changed, sincroniza o TopNav
  useEffect(() => {
    function onProfileChanged() {
      if (!userId) return;
      const saved = safeGetStoredProfileId(userId);
      if (!saved) {
        setActiveProfileId("");
        return;
      }
      if (profiles?.length && profiles.some((p) => String(p.id) === saved)) {
        setActiveProfileId(saved);
      }
    }

    window.addEventListener("cs:profile-changed", onProfileChanged);
    return () => window.removeEventListener("cs:profile-changed", onProfileChanged);
  }, [userId, profiles]);

  // Busca no Supabase conforme digita
  useEffect(() => {
    let alive = true;
    let timer = null;

    if (!searchOpen) {
      setResults([]);
      setSearching(false);
      return () => {};
    }

    const term = String(q || "").trim();
    if (term.length < MIN_SEARCH_CHARS) {
      setResults([]);
      setSearching(false);
      return () => {};
    }

    setSearching(true);

    timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("titles")
          .select("id, public_id, title, year, thumb_url")
          .ilike("title", `%${term}%`)
          .order("title", { ascending: true })
          .limit(SEARCH_LIMIT);

        if (!alive) return;

        setSearching(false);
        if (error) {
          setResults([]);
          return;
        }

        const list = (data || []).map((r) => ({
          id: r.public_id || r.id,
          title: r.title,
          year: r.year,
          thumb: r.thumb_url || "",
        }));

        setResults(list);
      } catch {
        if (!alive) return;
        setSearching(false);
        setResults([]);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [q, searchOpen]);

  // click fora
  useEffect(() => {
    function onDocMouseDown(e) {
      if (searchOpen) {
        if (wrapRef.current && !wrapRef.current.contains(e.target)) closeSearch();
      }
      if (profileOpen) {
        if (profileWrapRef.current && !profileWrapRef.current.contains(e.target)) closeProfile();
      }
      if (catOpen) {
        if (catWrapRef.current && !catWrapRef.current.contains(e.target)) closeCats();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [searchOpen, profileOpen, catOpen]);

  // ESC
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        if (searchOpen) closeSearch();
        if (profileOpen) closeProfile();
        if (catOpen) closeCats();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [searchOpen, profileOpen, catOpen]);

  // =========================
  // ✅ Navbar scrolled (robusto em rotas sem scroll)
  // =========================
  const lastScrollElRef = useRef(null);

  const isScrollableEl = useCallback((el) => {
    if (!el || el === document || el === window) return false;
    if (!el.isConnected) return false;

    try {
      const st = window.getComputedStyle(el);
      const oy = st.overflowY;
      if (oy !== "auto" && oy !== "scroll") return false;
      return el.scrollHeight > el.clientHeight + 2;
    } catch {
      return false;
    }
  }, []);

  const updateScrolled = useCallback(
    (el = null) => {
      const doc = document.scrollingElement || document.documentElement;

      const yWin = Number(window.scrollY || 0);
      const yDoc = Number(doc?.scrollTop || 0);

      const yEl =
        isScrollableEl(el) && typeof el.scrollTop === "number" ? Number(el.scrollTop || 0) : 0;

      const y = Math.max(yWin, yDoc, yEl);
      setScrolled(y > 12); // ajuste: 24~48 se quiser mais “Netflix”
    },
    [isScrollableEl]
  );

  useEffect(() => {
    // ✅ ao mudar de rota/query: não herdar scroll do container anterior (ex.: Browse)
    lastScrollElRef.current = null;

    // ✅ recalcula depois da navegação/render (2 frames deixa bem estável)
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => updateScrolled(null));
    });

    const onWinScroll = () => updateScrolled(lastScrollElRef.current);

    const onAnyScrollCapture = (e) => {
      const t = e.target;

      // ✅ só grava se o target for realmente rolável
      if (isScrollableEl(t)) {
        lastScrollElRef.current = t;

        // ✅ IMPORTANTE: NÃO REMOVER ISSO (serve pro ScrollToTop achar o container certo)
        try {
          window.__CS_LAST_SCROLL_EL__ = t;
        } catch {}
      }

      // recalcula usando o target atual (se não for rolável, cai no window/doc)
      updateScrolled(t);
    };

    window.addEventListener("scroll", onWinScroll, { passive: true });
    document.addEventListener("scroll", onAnyScrollCapture, { passive: true, capture: true });

    return () => {
      try {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      } catch {}

      window.removeEventListener("scroll", onWinScroll);
      // ✅ remove correto quando add foi capture: true
      document.removeEventListener("scroll", onAnyScrollCapture, true);
    };
  }, [updateScrolled, isScrollableEl, location.key, location.search]);

  function onSubmit(e) {
    e.preventDefault();
    goBrowseSearch(q);
  }

  // ✅ /profiles: sempre preto
  const forceSolid = location.pathname.startsWith("/profiles");
  const headerSolid = forceSolid || scrolled;

  const shellClass = headerSolid
    ? "bg-black/95 border-b border-white/5"
    : "bg-transparent border-transparent";

  const qTrim = String(q || "").trim();
  const canSearchNow = qTrim.length >= MIN_SEARCH_CHARS;

  const activeCatObj = useMemo(() => {
    if (!pCat) return null;
    const key = norm(pCat);
    return (categories || []).find((c) => norm(c.name) === key) || { id: key, name: pCat };
  }, [pCat, categories]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className={`transition-colors duration-300 ${shellClass}`}>
        <Container className="flex h-16 items-center gap-6">
          <Link to="/browse" className="flex items-center">
            <img src={Logo} alt="CineSuper" className="h-12 w-auto select-none" draggable={false} />
          </Link>

          <nav className="hidden md:flex items-center gap-4">
            <button
              type="button"
              onClick={() => goBrowseWithFilter(buildBrowseUrl())}
              className={navItem(activeHome)}
            >
              Início
            </button>

            <button
              type="button"
              onClick={() => goBrowseWithFilter(buildBrowseUrl({ type: "series" }))}
              className={navItem(activeSeries)}
            >
              Séries
            </button>

            <button
              type="button"
              onClick={() => goBrowseWithFilter(buildBrowseUrl({ type: "movie" }))}
              className={navItem(activeMovies)}
            >
              Filmes
            </button>

            <button
              type="button"
              onClick={() => goBrowseWithFilter(buildBrowseUrl({ cat: "Gospel" }))}
              className={navItem(activeGospel)}
            >
              Gospel
            </button>

            <button
              type="button"
              onClick={() => goBrowseWithFilter(buildBrowseUrl({ trending: true }))}
              className={navItem(activeTrending)}
              title='Categoria "em alta"'
            >
              Bombando
            </button>

            <button
              type="button"
              onClick={() => goBrowseWithFilter(buildBrowseUrl({ list: true }))}
              className={navItem(activeMyList)}
              title="Sua lista"
            >
              Minha lista
            </button>

            <button
              type="button"
              onClick={() => goBrowseWithFilter(buildBrowseUrl({ calendar: true }))}
              className={navItem(activeCalendar)}
              title="Em breve no CineSuper"
            >
              Calendário
            </button>

            {/* ✅ Gêneros (categories[]) */}
            <div className="relative" ref={catWrapRef}>
              <button
                type="button"
                onClick={toggleCats}
                className={[
                  "inline-flex items-center gap-2",
                  "rounded-md px-2 py-1.5",
                  isBrowse && pCat ? "text-white" : "text-white/70 hover:text-white",
                  "hover:bg-white/5 transition",
                ].join(" ")}
                title="Filtrar por gênero"
              >
                <Tags className="h-4 w-4" />
                <span className="text-sm">{activeCatObj?.name ? activeCatObj.name : "Gêneros"}</span>
                <ChevronDown className={`h-4 w-4 text-white/60 transition ${catOpen ? "rotate-180" : ""}`} />
              </button>

              {catOpen ? (
                <div
                  className="
                    absolute left-0 mt-2 w-[260px]
                    rounded-2xl border border-white/10 bg-[#0b0b0b]/95 backdrop-blur-md
                    shadow-[0_20px_60px_rgba(0,0,0,.55)]
                    overflow-hidden z-[70]
                  "
                >
                  <div className="px-4 py-3 border-b border-white/10">
                    <div className="text-xs font-semibold tracking-widest text-yellow-400/90">GÊNEROS</div>
                    <div className="mt-1 text-sm text-white/60">
                      {catsLoading ? "Carregando..." : "Escolha um gênero"}
                    </div>
                  </div>

                  <div className="p-2 max-h-[420px] overflow-auto">
                    <button
                      type="button"
                      onClick={() => pickCategory("")}
                      className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left ${
                        !pCat ? "bg-white/10" : "hover:bg-white/10"
                      }`}
                    >
                      <div className="text-sm text-white/85">Todos</div>
                      {!pCat ? <span className="text-white/70 text-sm">✓</span> : null}
                    </button>

                    {!catsLoading && (categories || []).length ? (
                      <div className="mt-1">
                        {(categories || []).map((c) => {
                          const active = norm(c.name) === norm(pCat);
                          return (
                            <button
                              key={c.id || c.name}
                              type="button"
                              onClick={() => pickCategory(c.name)}
                              className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left ${
                                active ? "bg-white/10" : "hover:bg-white/10"
                              }`}
                            >
                              <div className="text-sm text-white/85">{c.name}</div>
                              {active ? <span className="text-white/70 text-sm">✓</span> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {!catsLoading && (!categories || categories.length === 0) ? (
                      <div className="px-3 py-3 text-sm text-white/60">
                        Nenhum gênero disponível. Defina <span className="text-white/80">VITE_CATEGORIES</span> ou
                        verifique se <span className="text-white/80">titles.categories</span> está populado.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => nav("/admin")}
                className="ml-2 inline-flex items-center gap-2 rounded-md bg-red-600/15 border border-red-500/25 px-3 py-1.5 text-sm text-red-100 hover:bg-red-600/25 transition"
                title="Admin"
              >
                <Shield className="h-4 w-4" />
                Admin
              </button>
            ) : null}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* Search */}
            <div className="flex items-center gap-3" ref={wrapRef}>
              <button
                type="button"
                onClick={onSearchIconClick}
                className="
                  inline-flex h-9 w-9 items-center justify-center rounded-md
                  bg-white/0 text-white/80 hover:text-white hover:bg-white/10
                  transition outline-none focus:outline-none focus-visible:outline-none
                "
                aria-label="Buscar"
                title={searchOpen ? (canSearchNow ? "Buscar" : "Digite 3+ letras") : "Abrir busca"}
              >
                <Search className="h-5 w-5" />
              </button>

              <div
                className={[
                  "relative transition-all duration-200 ease-out",
                  searchOpen
                    ? "w-[320px] opacity-100 translate-y-0 overflow-visible"
                    : "w-0 opacity-0 -translate-y-1 overflow-hidden pointer-events-none",
                ].join(" ")}
              >
                <form onSubmit={onSubmit} className="relative">
                  <input
                    ref={inputRef}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar títulos..."
                    className="
                      h-9 w-[320px] rounded-md bg-white/10
                      px-3 pr-9 text-sm text-white placeholder:text-white/50
                      outline-none ring-0 focus:ring-0 focus:outline-none
                    "
                  />

                  <button
                    type="button"
                    onClick={closeSearch}
                    className="
                      absolute right-2 top-1/2 -translate-y-1/2
                      text-white/70 hover:text-white
                      outline-none focus:outline-none focus-visible:outline-none
                    "
                    aria-label="Fechar busca"
                    title="Fechar"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  {searchOpen && qTrim.length > 0 && qTrim.length < MIN_SEARCH_CHARS ? (
                    <div className="absolute left-0 right-0 mt-2 rounded-xl border border-white/10 bg-[#0b0b0b]/95 px-3 py-2 text-sm text-white/60">
                      Digite pelo menos {MIN_SEARCH_CHARS} letras para buscar.
                    </div>
                  ) : null}

                  {searchOpen && (searching || results.length > 0) ? (
                    <div
                      className="
                        absolute left-0 right-0 top-full mt-2 z-[60]
                        rounded-xl border border-white/10 bg-[#0b0b0b]/95 backdrop-blur-md
                        shadow-[0_20px_60px_rgba(0,0,0,.55)]
                        overflow-hidden
                      "
                    >
                      {searching ? (
                        <div className="px-3 py-3 text-sm text-white/60">Buscando...</div>
                      ) : (
                        <>
                          {results.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => goTitle(r.id)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/10 transition"
                            >
                              <div className="h-10 w-7 rounded bg-white/10 border border-white/10 overflow-hidden shrink-0">
                                {r.thumb ? (
                                  <img src={r.thumb} alt="" className="h-full w-full object-cover" draggable={false} />
                                ) : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-white/90 truncate">{r.title}</div>
                                <div className="text-[11px] text-white/50">{r.year ? r.year : ""}</div>
                              </div>
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={() => goBrowseSearch(String(q || "").trim())}
                            disabled={String(q || "").trim().length < 3}
                            className="w-full px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10 transition border-t border-white/10 disabled:text-white/35 disabled:cursor-not-allowed"
                          >
                            Ver resultados para “{String(q || "").trim()}”
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </form>
              </div>
            </div>

            {/* Profile */}
            <div className="relative" ref={profileWrapRef}>
              <button
                type="button"
                onClick={toggleProfile}
                className="
                  inline-flex h-9 items-center gap-2 rounded-md
                  bg-white/0 px-2 text-white/85 hover:text-white hover:bg-white/10
                  transition outline-none focus:outline-none
                "
                title={activeProfile?.name ? `Perfil: ${activeProfile.name}` : "Perfil"}
                aria-label="Perfil"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded bg-white/10 border border-white/10 overflow-hidden">
                  {activeProfile?.avatar_url ? (
                    <img
                      src={activeProfile.avatar_url}
                      alt={activeProfile.name || "Perfil"}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <span className="text-xs font-bold">{initials(activeProfile?.name)}</span>
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 text-white/70 transition ${profileOpen ? "rotate-180" : ""}`} />
              </button>

              {profileOpen ? (
                <div
                  className="
                    absolute right-0 mt-2 w-[280px]
                    rounded-2xl border border-white/10 bg-[#0b0b0b]/95 backdrop-blur-md
                    shadow-[0_20px_60px_rgba(0,0,0,.55)]
                    overflow-hidden
                  "
                >
                  <div className="px-4 py-3 border-b border-white/10">
                    <div className="text-xs font-semibold tracking-widest text-yellow-400/90">PERFIS</div>
                    <div className="mt-1 text-sm text-white/60">
                      {profilesLoading ? "Carregando..." : "Escolha um perfil"}
                    </div>
                  </div>

                  <div className="p-2">
                    {(profiles || []).map((p) => {
                      const active = p.id === activeProfileId;
                      return (
                        <button
                          key={p.id}
                          onClick={() => pickProfile(p.id)}
                          className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left ${
                            active ? "bg-white/10" : "hover:bg-white/10"
                          }`}
                        >
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 border border-white/10 overflow-hidden">
                            {p.avatar_url ? (
                              <img
                                src={p.avatar_url}
                                alt={p.name || "Perfil"}
                                className="h-full w-full object-cover"
                                draggable={false}
                              />
                            ) : (
                              <span className="text-xs font-bold">{initials(p.name)}</span>
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-white/90 truncate">
                              {p.name}
                              {p.is_kids ? <span className="ml-2 text-[11px] text-white/50">(Kids)</span> : null}
                            </div>
                            <div className="text-[11px] text-white/45">{active ? "Ativo" : "Selecionar"}</div>
                          </div>

                          {active ? <span className="text-white/70 text-sm">✓</span> : null}
                        </button>
                      );
                    })}

                    {!profilesLoading && (!profiles || profiles.length === 0) ? (
                      <div className="px-3 py-3 text-sm text-white/60">Nenhum perfil encontrado.</div>
                    ) : null}
                  </div>

                  <div className="border-t border-white/10 p-2">
                    <button
                      onClick={() => {
                        closeProfile();
                        nav("/profiles?tab=profiles");
                      }}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/10"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                        <User className="h-4 w-4 text-white/80" />
                      </span>
                      <div className="text-sm text-white/85">Gerenciar perfis</div>
                    </button>

                    <button
                      onClick={() => {
                        closeProfile();
                        nav("/profiles?tab=overview");
                      }}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/10"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                        <span className="text-xs font-semibold text-white/80">⚙</span>
                      </span>
                      <div className="text-sm text-white/85">Conta</div>
                    </button>

                    <button
                      onClick={() => {
                        closeProfile();
                        nav("/TV");
                      }}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/10"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                        <Shield className="h-4 w-4 text-white/80" />
                      </span>
                      <div className="text-sm text-white/85">Parear TV</div>
                    </button>

                    <button
                      onClick={() => {
                        closeProfile();
                        nav("/contato");
                      }}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white/10"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                        <HelpCircle className="h-4 w-4 text-white/80" />
                      </span>
                      <div className="text-sm text-white/85">Central de ajuda</div>
                    </button>

                    <button
                      onClick={onLogout}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-red-500/10"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 border border-white/10">
                        <LogOut className="h-4 w-4 text-red-200" />
                      </span>
                      <div className="text-sm text-red-200">Sair do CineSuper</div>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Container>
      </div>
    </header>
  );
}
