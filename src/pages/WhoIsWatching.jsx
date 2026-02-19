// src/pages/WhoIsWatching.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient.js";
import PageTitle from "../components/PageTitle.jsx";
import { IS_TV } from "../app/target.js";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";

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

  try {
    sessionStorage.setItem(k, pid);
    if (pname) sessionStorage.setItem(kn, pname);
  } catch {}

  try {
    localStorage.setItem(k, pid);
    if (pname) localStorage.setItem(kn, pname);
  } catch {}
}

/* =========================================
   TV helpers
========================================= */

function ensureVisibleInViewport(el) {
  if (!el) return;
  // scroll do documento (vertical) para seguir o foco
  try {
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  } catch {
    // fallback
    const r = el.getBoundingClientRect();
    const y = window.scrollY + r.top - Math.max(80, (window.innerHeight - r.height) / 2);
    window.scrollTo(0, Math.max(0, y));
  }
}

function TvCard({ focusKey, autoFocus, onEnter, children }) {
  const { ref, focused, focusSelf } = useFocusable({
    focusKey,
    onFocus: () => ensureVisibleInViewport(ref.current),
    onEnterPress: () => onEnter?.(),
  });

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => focusSelf(), 0);
    return () => clearTimeout(t);
  }, [autoFocus, focusSelf]);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={[
        "outline-none transition-transform duration-150",
        focused ? "ring-4 ring-white/80 rounded-2xl scale-[1.04]" : "ring-0",
      ].join(" ")}
      style={{ transformOrigin: "center" }}
    >
      {React.isValidElement(children) ? React.cloneElement(children, { tvFocused: focused }) : children}
    </div>
  );
}

/* =========================================
   Screen
========================================= */

export default function WhoIsWatching() {
  const nav = useNavigate();
  const location = useLocation();

  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const from = useMemo(() => {
    const st = location.state || {};
    return String(st.from || "").trim();
  }, [location.state]);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

        if (!alive) return;
        if (r1.error) throw r1.error;

        let list = Array.isArray(r1.data) ? r1.data : [];

        if (!list.length) {
          await ensureDefaultProfile(uid, email);

          const r2 = await supabase
            .from("user_profiles")
            .select("id, name, avatar_url, is_kids, created_at")
            .eq("user_id", uid)
            .order("created_at", { ascending: true });

          if (!alive) return;
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

  function pickProfile(p) {
    if (!p?.id || !userId) return;

    safeSetStoredProfile(userId, p.id, p.name || "Perfil");

    try {
      window.dispatchEvent(new CustomEvent("cs:profile-changed", { detail: { profileId: String(p.id) } }));
    } catch {}

    nav(from || "/browse", { replace: true });
  }

  // ✅ Corrige o PageTitle (no seu código estava “solto”)
  // (na TV também é útil para a aba / histórico)
  // eslint-disable-next-line no-unused-vars
  const _pt = <PageTitle title="Quem está assistindo?" />;

  /* =========================================
     TV layout
  ========================================= */
  if (IS_TV) {
    const cols = 3; // 3 colunas fica bom em 1080p, e evita corte
    const list = Array.isArray(profiles) ? profiles : [];
    const hasAdd = true;
    const total = Math.min(list.length, 6) + (hasAdd ? 1 : 0);

    // Autofocus único global
    const globalAutoFocus =
      typeof window !== "undefined" && !window["__CS_TV_WHO_FOCUS_SET__"];

    useEffect(() => {
      if (!globalAutoFocus) return;
      window["__CS_TV_WHO_FOCUS_SET__"] = true;
    }, [globalAutoFocus]);

    return (
      <div className="min-h-screen bg-black text-white">
        <PageTitle title="Quem está assistindo?" />

        {/* Safe-area (evita overscan e corte) */}
        <div className="min-h-screen px-[64px] py-[48px]">
          <div className="max-w-[1200px] mx-auto">
            <div className="text-center">
              <h1 className="text-[28px] font-black tracking-tight">Quem está assistindo?</h1>
              <div className="mt-2 text-[14px] text-white/60">
                {loading ? "Carregando perfis..." : "Escolha um perfil para continuar"}
              </div>
              {err ? <div className="mt-3 text-[14px] text-red-200">{err}</div> : null}
            </div>

            <FocusContext.Provider value="tv-who">
              {/* scroll vertical do documento quando necessário */}
              <div className="mt-10">
                <div
                  className="grid gap-8 justify-items-center"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  }}
                >
                  {list.map((p, idx) => {
                    const key = `p:${p.id}`;
                    const autoFocus = globalAutoFocus && idx === 0;

                    return (
                      <TvCard
                        key={key}
                        focusKey={`who:${idx}`}
                        autoFocus={autoFocus}
                        onEnter={() => pickProfile(p)}
                      >
                        <div className="w-[260px] text-center">
                          <div
                            className={[
                              "mx-auto rounded-2xl overflow-hidden",
                              "border border-white/10 bg-white/5",
                              "w-[200px] h-[200px]",
                            ].join(" ")}
                          >
                            {p.avatar_url ? (
                              <img
                                src={p.avatar_url}
                                alt={p.name || "Perfil"}
                                className="h-full w-full object-cover"
                                draggable={false}
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-[56px] font-extrabold text-white/85">
                                {initials(p.name)}
                              </div>
                            )}

                            {p.is_kids ? (
                              <div className="absolute" />
                            ) : null}
                          </div>

                          <div className="mt-4 text-[18px] text-white/90 truncate">{p.name}</div>

                          {p.is_kids ? (
                            <div className="mt-2 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] text-white/80">
                              Infantil
                            </div>
                          ) : null}
                        </div>
                      </TvCard>
                    );
                  })}

                  {/* Adicionar perfil */}
                  <TvCard
                    focusKey={`who:add`}
                    autoFocus={globalAutoFocus && list.length === 0}
                    onEnter={() => nav("/profiles?tab=profiles")}
                  >
                    <div className="w-[260px] text-center">
                      <div
                        className={[
                          "mx-auto rounded-2xl overflow-hidden",
                          "border border-white/10 bg-white/5",
                          "w-[200px] h-[200px] flex items-center justify-center",
                        ].join(" ")}
                      >
                        <div className="h-16 w-16 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[44px] text-white/85">
                          +
                        </div>
                      </div>

                      <div className="mt-4 text-[18px] text-white/70">Adicionar perfil</div>
                    </div>
                  </TvCard>
                </div>

                {/* Botão gerenciar perfis (opcional na TV) */}
                <div className="mt-10 flex justify-center">
                  <TvCard focusKey="who:manage" onEnter={() => nav("/profiles?tab=profiles")}>
                    <button
                      type="button"
                      className="rounded-2xl border border-white/15 bg-white/0 px-8 py-4 text-[16px] text-white/80"
                      onClick={() => nav("/profiles?tab=profiles")}
                    >
                      Gerenciar perfis
                    </button>
                  </TvCard>
                </div>

                {/* Espaço final para evitar corte no último item */}
                <div className="h-10" />
              </div>
            </FocusContext.Provider>
          </div>
        </div>
      </div>
    );
  }

  /* =========================================
     WEB layout (seu original, intacto)
  ========================================= */
  return (
    <div className="min-h-[100vh] bg-black text-white">
      <PageTitle title="Quem está assistindo?" />

      <div className="mx-auto max-w-5xl px-6 pt-24 pb-16">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight">Quem está assistindo?</h1>
          <div className="mt-3 text-white/60 text-sm">
            {loading ? "Carregando perfis..." : "Escolha um perfil para continuar"}
          </div>
          {err ? <div className="mt-4 text-sm text-red-200">{err}</div> : null}
        </div>

        <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8 justify-items-center">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pickProfile(p)}
              className="group w-[170px] text-center"
              title={p.name}
            >
              <div className="relative mx-auto h-[120px] w-[120px] rounded-xl overflow-hidden border border-white/10 bg-white/5 group-hover:border-white/25 transition">
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt={p.name || "Perfil"}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-3xl font-extrabold text-white/85">
                    {initials(p.name)}
                  </div>
                )}

                {p.is_kids ? (
                  <div className="absolute bottom-2 right-2 rounded-full bg-white/10 border border-white/15 px-2 py-0.5 text-[10px] text-white/80">
                    Infantil
                  </div>
                ) : null}
              </div>

              <div className="mt-3 text-base text-white/80 group-hover:text-white transition truncate">
                {p.name}
              </div>
            </button>
          ))}

          <button
            type="button"
            onClick={() => nav("/profiles?tab=profiles")}
            className="group w-[170px] text-center"
            title="Adicionar perfil"
          >
            <div className="relative mx-auto h-[120px] w-[120px] rounded-xl overflow-hidden border border-white/10 bg-white/5 group-hover:bg-white/10 transition flex items-center justify-center">
              <div className="h-14 w-14 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-4xl text-white/80">
                +
              </div>
            </div>

            <div className="mt-3 text-base text-white/60 group-hover:text-white/80 transition">
              Adicionar perfil
            </div>
          </button>
        </div>

        <div className="mt-12 flex items-center justify-center">
          <button
            type="button"
            onClick={() => nav("/profiles?tab=profiles")}
            className="rounded-md border border-white/15 bg-white/0 px-6 py-3 text-sm text-white/70 hover:text-white hover:bg-white/10 transition"
          >
            Gerenciar perfis
          </button>
        </div>
      </div>
    </div>
  );
}
