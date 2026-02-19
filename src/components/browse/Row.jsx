// src/components/browse/Row.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import TitleCard from "./TitleCard.jsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useWatchProgressForItems } from "../../hooks/browse/useWatchProgressForItems.js";
import { IS_TV } from "../../app/target.js";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pickVideoUuid(item) {
  return String(
    item?.dbId ??
      item?.db_id ??
      item?.video_uuid ??
      item?.videoUuid ??
      item?.video_id ??
      item?.videoId ??
      ""
  ).trim();
}

function pickTitlePublicId(item) {
  return String(item?.public_id || item?.publicId || item?.id || "").trim();
}

function ensureVisibleInScroller(scrollerEl, itemEl) {
  if (!scrollerEl || !itemEl) return;

  const pad = IS_TV ? 96 : 48;
  const c = scrollerEl.getBoundingClientRect();
  const r = itemEl.getBoundingClientRect();

  if (r.left < c.left + pad) {
    const delta = r.left - (c.left + pad);
    scrollerEl.scrollBy({ left: delta, behavior: "smooth" });
    return;
  }

  if (r.right > c.right - pad) {
    const delta = r.right - (c.right - pad);
    scrollerEl.scrollBy({ left: delta, behavior: "smooth" });
  }
}

function ensureRowVisibleFromItem(itemEl) {
  if (!itemEl) return;
  const rowEl = itemEl.closest("section");
  if (!rowEl) return;
  rowEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
}

function TvCard({ focusKey, scrollerRef, autoFocus, children }) {
  const { ref, focused, focusSelf } = useFocusable({
    focusKey,
    onFocus: () => {
      ensureRowVisibleFromItem(ref.current);
      ensureVisibleInScroller(scrollerRef.current, ref.current);
    },
    onEnterPress: () => {
      const el = ref.current;
      if (!el) return;
      const clickable = el.querySelector("a,button,[role='button']");
      if (clickable) return clickable.click();
      el.click();
    },
  });

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => focusSelf(), 0);
    return () => clearTimeout(t);
  }, [autoFocus, focusSelf]);

  const child = React.isValidElement(children)
    ? React.cloneElement(children, { tvFocused: focused })
    : children;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={["relative outline-none shrink-0", focused ? "z-20" : "z-10"].join(" ")}
    >
      {child}
    </div>
  );
}

export default function Row({
  title,
  items,
  tvRowKey,
  tvAutoFocus,
  profileId,
  watchlistIds,
  onToggleWatchlist,
  likedIds,
  onToggleLike,
}) {
  const scrollerRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const MAX_ITEMS = 35;

  if (!items?.length) return null;

  const sliced = useMemo(() => items.slice(0, MAX_ITEMS), [items]);
  const { progressByVideoId } = useWatchProgressForItems(sliced);

  const pageScroll = useMemo(() => {
    const el = scrollerRef.current;
    if (!el) return 900;
    return Math.floor(el.clientWidth * 0.9);
  }, [items?.length]);

  function updateArrows() {
    const el = scrollerRef.current;
    if (!el) return;

    const maxScroll = el.scrollWidth - el.clientWidth;
    const x = el.scrollLeft;

    setCanLeft(x > 6);
    setCanRight(x < maxScroll - 6);
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    updateArrows();

    const onScroll = () => updateArrows();
    el.addEventListener("scroll", onScroll, { passive: true });

    const ro = new ResizeObserver(() => updateArrows());
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items?.length]);

  function scrollByDir(dir) {
    const el = scrollerRef.current;
    if (!el) return;

    el.scrollTo({
      left: clamp(el.scrollLeft + dir * pageScroll, 0, el.scrollWidth),
      behavior: "smooth",
    });
  }

  const rowFocusKey = String(tvRowKey || `row:${title || "row"}`);

  const { ref: rowRef, focusKey } = useFocusable(
    IS_TV
      ? { focusKey: rowFocusKey, saveLastFocusedChild: true, trackChildren: true }
      : { focusKey: rowFocusKey }
  );

  const globalAutoFocus =
    IS_TV && (tvAutoFocus || (typeof window !== "undefined" && !window["__CS_TV_FOCUS_SET__"]));

  useEffect(() => {
    if (!globalAutoFocus) return;
    window["__CS_TV_FOCUS_SET__"] = true;
  }, [globalAutoFocus]);

  return (
    <section
      className="relative"
      ref={rowRef}
      style={IS_TV ? { scrollMarginTop: 140, scrollMarginBottom: 120 } : undefined}
    >
      <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-white">
  {title}
</h2>

      <div className="relative">
        {!IS_TV && canLeft ? (
          <button
            type="button"
            aria-label="Voltar"
            onClick={() => scrollByDir(-1)}
            className="
              absolute left-0 top-0 z-30 h-full w-16
              flex items-center justify-center
              opacity-0 hover:opacity-100 transition-opacity duration-150
              bg-gradient-to-r from-black/85 via-black/35 to-transparent
            "
          >
            <span
              className="
                flex items-center justify-center
                h-14 w-14
                text-white/95
                drop-shadow-[0_6px_18px_rgba(0,0,0,0.75)]
                transition-transform duration-150
                hover:scale-110
              "
            >
              <ChevronLeft className="h-12 w-12" />
            </span>
          </button>
        ) : null}

        {!IS_TV && canRight ? (
          <button
            type="button"
            aria-label="Avançar"
            onClick={() => scrollByDir(1)}
            className="
              absolute right-0 top-0 z-30 h-full w-16
              flex items-center justify-center
              opacity-0 hover:opacity-100 transition-opacity duration-150
              bg-gradient-to-l from-black/85 via-black/35 to-transparent
            "
          >
            <span
              className="
                flex items-center justify-center
                h-14 w-14
                text-white/95
                drop-shadow-[0_6px_18px_rgba(0,0,0,0.75)]
                transition-transform duration-150
                hover:scale-110
              "
            >
              <ChevronRight className="h-12 w-12" />
            </span>
          </button>
        ) : null}

        <FocusContext.Provider value={IS_TV ? focusKey : undefined}>
          <div
            ref={scrollerRef}
            className={[
              "cs-hide-scrollbar flex gap-3 overflow-x-auto overflow-y-visible scroll-smooth",
              IS_TV ? "pt-10 pb-6 px-10" : "py-6 pr-6",
            ].join(" ")}
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <style>{`.cs-hide-scrollbar::-webkit-scrollbar{display:none;}`}</style>

            {sliced.map((it, idx) => {
              const vid = pickVideoUuid(it);

              const progressFromItem = Number(it?.progressSec || 0);
              const progressFromMap = vid ? Number(progressByVideoId.get(vid) || 0) : 0;
              const progressSec = progressFromItem > 0 ? progressFromItem : progressFromMap;

              const titlePublicId = pickTitlePublicId(it);
              const inWatchlist = !!(watchlistIds && titlePublicId && watchlistIds.has(titlePublicId));
              const liked = !!(likedIds && titlePublicId && likedIds.has(titlePublicId));

              const key = `${titlePublicId || it?.id || "item"}:${idx}`;

              if (IS_TV) {
                const cardKey = `${rowFocusKey}:${idx}`;
                const autoFocus = globalAutoFocus && idx === 0;

                return (
                  <TvCard key={key} focusKey={cardKey} scrollerRef={scrollerRef} autoFocus={autoFocus}>
                    <TitleCard
                      item={it}
                      progressSec={progressSec}
                      scrollerRef={scrollerRef}
                      profileId={profileId}
                      titlePublicId={titlePublicId}
                      inWatchlist={inWatchlist}
                      onToggleWatchlist={onToggleWatchlist}
                      liked={liked}
                      onToggleLike={onToggleLike}
                    />
                  </TvCard>
                );
              }

              return (
                <TitleCard
                  key={key}
                  item={it}
                  progressSec={progressSec}
                  scrollerRef={scrollerRef}
                  profileId={profileId}
                  titlePublicId={titlePublicId}
                  inWatchlist={inWatchlist}
                  onToggleWatchlist={onToggleWatchlist}
                  liked={liked}
                  onToggleLike={onToggleLike}
                />
              );
            })}
          </div>
        </FocusContext.Provider>
      </div>
    </section>
  );
}
