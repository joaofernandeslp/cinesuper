// src/pages/tv/components/TvSidebar.jsx
import React, { useEffect, useState } from "react";
import { Search, Home, CalendarDays, Film, Tv2, UserRound, ListPlus } from "lucide-react";
import { cx } from "../_tvKeys.js";
import { APP_VERSION } from "../../../lib/appVersion.js";

export const TV_SIDEBAR_ITEMS = [
  { key: "search", label: "Pesquisa", Icon: Search },
  { key: "home", label: "Início", Icon: Home },

  // ✅ NOVO
  { key: "watchlist", label: "Minha lista", Icon: ListPlus },

  { key: "calendar", label: "Calendário", Icon: CalendarDays },
  { key: "movies", label: "Filmes", Icon: Film },
  { key: "series", label: "Séries", Icon: Tv2 },
];

export default function TvSidebar({
  expanded,
  activeKey,
  focusIndex,
  setBtnRef,
  onClickItem,
  profile, // { name, avatar_url }
}) {
  const profileFocused = focusIndex === 0;
  const profileName = String(profile?.name || "").trim();
  const avatarUrl = String(profile?.avatar_url || "").trim();

  const [avatarOk, setAvatarOk] = useState(true);
  useEffect(() => {
    setAvatarOk(true);
  }, [avatarUrl]);

  const asideW = expanded ? "w-[280px]" : "w-[120px]";
  const btnW = expanded ? "w-full" : "w-[96px]";

  const btnPX = expanded ? "px-4" : "px-0";
  const rowLayout = expanded ? "justify-start gap-3" : "justify-center gap-0";

  const menuIconCls = "h-[22px] w-[22px] shrink-0 text-white/90";
  const profileBoxCls =
    "relative h-11 w-11 rounded-2xl overflow-hidden border border-white/15 bg-white/10";

  // ✅ CRÍTICO:
  // sidebar minimizado (expanded=false) => nada focável
  const canFocus = !!expanded;

  // ✅ quando estiver minimizado, a tarja deve seguir a TELA ATUAL (activeKey), não o foco antigo
  const activeMenuIdx = (() => {
    const i = TV_SIDEBAR_ITEMS.findIndex((it) => it.key === activeKey);
    return i >= 0 ? i + 1 : -1; // +1 porque menu começa no index 1 (perfil é 0)
  })();

  function btnClass({ focused }) {
    return cx(
      "relative select-none rounded-2xl",
      "py-[10px]",
      btnW,
      btnPX,
      expanded ? "" : "self-center",

      "!outline-none !shadow-none !ring-0 !ring-offset-0",
      "focus:!outline-none focus:!shadow-none focus:!ring-0 focus:!ring-offset-0",
      "focus-visible:!outline-none focus-visible:!shadow-none focus-visible:!ring-0 focus-visible:!ring-offset-0",
      "focus-visible:!outline-offset-0",

      "[webkit-tap-highlight-color:transparent]",
      "bg-white/0"
    );
  }

  const backdropCls = expanded
    ? "bg-black/85 bg-gradient-to-r from-black via-black/95 to-black/60"
    : "bg-gradient-to-r from-black/60 via-black/35 to-transparent";

  return (
    <aside
      className={cx(
        "absolute left-0 top-0 z-50 h-full",
        "transition-all duration-200",
        asideW
      )}
      aria-label="Menu"
    >
      <div className={cx("absolute inset-0", backdropCls)} />

      <div className="relative h-full flex flex-col px-4">
        <div className="h-[76px]" />

        {/* PERFIL (index 0) */}
        <button
          ref={(el) => setBtnRef?.(0, el)}
          tabIndex={canFocus && profileFocused ? 0 : -1}
          type="button"
          onClick={() => onClickItem?.(0)}
          className={btnClass({ focused: profileFocused })}
          aria-label="Trocar perfil"
          title="Trocar perfil"
        >
          <span
            className={cx(
              "absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[4px] rounded-full",
              // perfil só mostra tarja quando o sidebar está focável
              canFocus && profileFocused ? "bg-red-600" : "bg-transparent"
            )}
          />

          <div className={cx("w-full flex items-center", rowLayout)}>
            <div className={profileBoxCls}>
              {avatarUrl && avatarOk ? (
                <img
                  src={avatarUrl}
                  alt={profileName || "Perfil"}
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setAvatarOk(false)}
                />
              ) : (
                // ✅ Sem iniciais: só ícone quando não tem avatar (ou falhou)
                <div className="absolute inset-0 grid place-items-center">
                  <UserRound className="h-[20px] w-[20px] text-white/85" />
                </div>
              )}
            </div>

            {expanded ? (
              <span className="font-semibold text-[15px] whitespace-nowrap min-w-0 truncate">
                {profileName || "Selecionar"}
              </span>
            ) : null}
          </div>
        </button>

        <div className="h-5" />

        {/* MENUS (index 1..N) */}
        <div className="flex-1 flex flex-col justify-center">
          <nav className="flex flex-col gap-3">
            {TV_SIDEBAR_ITEMS.map(({ key, label, Icon }, i) => {
              const idx = i + 1;
              const focused = focusIndex === idx;
              const isActive = activeKey === key;

              // ✅ regra:
              // - expanded=true  => tarja segue foco (navegação)
              // - expanded=false => tarja segue activeKey (tela real)
              const barOn = canFocus ? focused : idx === activeMenuIdx;

              return (
                <button
                  key={key}
                  ref={(el) => setBtnRef?.(idx, el)}
                  tabIndex={canFocus && focused ? 0 : -1}
                  type="button"
                  onClick={() => onClickItem?.(idx)}
                  className={btnClass({ focused })}
                  aria-label={label}
                  title={label}
                >
                  <span
                    className={cx(
                      "absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[4px] rounded-full",
                      barOn ? "bg-red-600" : "bg-transparent"
                    )}
                  />

                  <div className={cx("w-full flex items-center", rowLayout)}>
                    <Icon className={menuIconCls} />
                    {expanded ? (
                      <span className="font-semibold text-[25px] whitespace-nowrap">
                        {label}
                      </span>
                    ) : null}
                  </div>

                  {expanded && isActive && !focused ? (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-white/35" />
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pb-8 text-[12px] text-white/25 px-2">{APP_VERSION}</div>
      </div>
    </aside>
  );
}
