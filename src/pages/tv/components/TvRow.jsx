// src/pages/tv/components/TvRow.jsx
import React, { useMemo, useRef, useCallback, useEffect } from "react";
import { cx } from "../_tvKeys.js";
import { useWatchProgressForItems } from "../../../hooks/browse/useWatchProgressForItems.js";

const CARD_W = 232;
const CARD_H = 348;
const GAP_PX = 20;

// Quantos itens no máximo por row (pode subir se quiser mais catálogo na mesma row)
const MAX_ROW_ITEMS = 60;

// Janela virtual (mais itens = mais bonito; ainda leve no DOM)
const WINDOW_BEFORE = 6;
const WINDOW_AFTER = 12;

// Preload mais leve
const PRELOAD_RADIUS = 8;

// respiro lateral p/ não cortar o card focado
const PAD_L = 48; // px
const PAD_R = 64; // px

// Cache simples para não criar Image() repetidamente
const _thumbPreloadCache = new Set();
function preloadThumb(src) {
  const url = String(src || "").trim();
  if (!url) return;
  if (_thumbPreloadCache.has(url)) return;

  _thumbPreloadCache.add(url);
  if (_thumbPreloadCache.size > 220) {
    const first = _thumbPreloadCache.values().next().value;
    _thumbPreloadCache.delete(first);
  }

  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  } catch {}
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

function progressPctFromItem(item, progressSec) {
  const p = Math.max(0, Number(progressSec || 0));
  const d =
    Number(item?.durationSec || 0) ||
    Number(item?.duration_sec || 0) ||
    Number(item?.runtimeSec || 0) ||
    Number(item?.runtime_sec || 0);

  if (d > 30 && p > 0) return Math.max(2, Math.min(98, (p / d) * 100));
  return 0;
}

function pickStableKey(it, idx) {
  const k = String(it?.id || it?.publicId || it?.public_id || it?.dbId || it?.db_id || "").trim();
  return k ? k : `idx:${idx}`;
}

const CoverCard = React.memo(function CoverCard({
  item,
  progressSec,
  focused,
  tabIndex,
  index,
  setCardRef,
  onOpenTitle,
}) {
  const title = String(item?.title || "Título");

  const pos = Math.max(0, Math.floor(Number(progressSec || 0)));
  const canResume = pos > 5;
  const pct = canResume ? progressPctFromItem(item, progressSec) : 0;

  const setBtnRef = useCallback(
    (el) => {
      setCardRef?.(index, el);
    },
    [setCardRef, index]
  );

  const handleOpen = useCallback(() => {
    onOpenTitle?.(item);
  }, [onOpenTitle, item]);

  const eager = focused || index < 6;

  return (
    <button
      ref={setBtnRef}
      tabIndex={tabIndex}
      type="button"
      onClick={handleOpen}
      className={cx(
        "relative outline-none select-none transition-transform duration-150",
        focused ? "z-20 scale-[1.035]" : "z-0 opacity-95"
      )}
      aria-label={title}
      title={title}
      style={{
        contain: "layout paint",
        transform: "translate3d(0,0,0)",
        willChange: focused ? "transform" : "auto",
      }}
    >
      <div
        className="relative overflow-hidden bg-white/5 border border-white/10"
        style={{ width: CARD_W, height: CARD_H }}
      >
        {item?.thumb ? (
          <img
            src={item.thumb}
            alt=""
            width={CARD_W}
            height={CARD_H}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            decoding="async"
            loading={eager ? "eager" : "lazy"}
          />
        ) : null}

        {/* ✅ FOCUS FRAME */}
        {focused ? (
          <>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                boxShadow: "inset 0 0 0 6px rgba(255,255,255,0.95)",
              }}
            />
            <div
              className="absolute -inset-2 pointer-events-none"
              style={{
                boxShadow: "0 0 0 2px rgba(255,255,255,0.35), 0 18px 55px rgba(0,0,0,0.85)",
              }}
            />
          </>
        ) : null}

        {canResume && pct > 0 ? (
          <div className="absolute left-0 right-0 bottom-0">
            <div className="h-[5px] bg-white/20">
              <div className="h-[5px] bg-red-600" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </button>
  );
});

function TvRowImpl({
  title,
  items,
  rowRefSetter,
  scrollerRefSetter,
  focusedCardIndex,
  setCardRef,
  onOpenTitle,
}) {
  const scrollerRef = useRef(null);

  const sliced = useMemo(
    () => (Array.isArray(items) ? items.slice(0, MAX_ROW_ITEMS) : []),
    [items]
  );

  const { progressByVideoId } = useWatchProgressForItems(sliced);

  const len = sliced.length;

  // ✅ janela estável: sempre tenta renderizar (BEFORE+AFTER+1) itens,
  // mesmo quando o foco está no começo/fim (não fica “pobre”)
  const windowRange = useMemo(() => {
    if (!len) return { start: 0, end: 0 };

    const f = Math.max(0, Math.min(len - 1, Number(focusedCardIndex || 0)));
    const desired = WINDOW_BEFORE + WINDOW_AFTER + 1;

    // mantém janela cheia o máximo possível
    const maxStart = Math.max(0, len - desired);
    const start = Math.min(Math.max(0, f - WINDOW_BEFORE), maxStart);
    const end = Math.min(len, start + desired);

    return { start, end };
  }, [len, focusedCardIndex]);

  const visibleItems = useMemo(() => {
    if (!len) return [];
    return sliced.slice(windowRange.start, windowRange.end);
  }, [sliced, len, windowRange.start, windowRange.end]);

  const leftSpacerW = windowRange.start * (CARD_W + GAP_PX);
  const rightSpacerW = Math.max(0, (len - windowRange.end) * (CARD_W + GAP_PX));

  // Preload leve + cache
  useEffect(() => {
    if (!len) return;

    const f = Math.max(0, Math.min(len - 1, Number(focusedCardIndex || 0)));
    const a = Math.max(0, f - PRELOAD_RADIUS);
    const b = Math.min(len - 1, f + PRELOAD_RADIUS);

    const doPreload = () => {
      for (let i = a; i <= b; i++) {
        preloadThumb(sliced[i]?.thumb);
      }
    };

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(doPreload, { timeout: 250 });
      return () => window.cancelIdleCallback?.(id);
    } else {
      const t = setTimeout(doPreload, 90);
      return () => clearTimeout(t);
    }
  }, [focusedCardIndex, len, sliced]);

  return (
    <section
      ref={rowRefSetter}
      className="mt-6"
      style={{
        minHeight: 420,
      }}
    >
      <div className="mb-3 text-[28px] font-extrabold text-white/95">{title}</div>

      <div className="relative">
        <div
          ref={(el) => {
            scrollerRef.current = el;
            scrollerRefSetter?.(el);
          }}
          className={cx("flex overflow-x-auto overflow-y-visible py-5", "gap-5 pl-12 pr-16")}
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            scrollBehavior: "auto",
            WebkitOverflowScrolling: "auto",
            overscrollBehaviorX: "contain",
            scrollPaddingLeft: `${PAD_L}px`,
            scrollPaddingRight: `${PAD_R}px`,
          }}
        >
          {leftSpacerW > 0 ? <div style={{ width: leftSpacerW, flex: "0 0 auto" }} /> : null}

          {visibleItems.map((it, localIdx) => {
            const idx = windowRange.start + localIdx;

            const vid = pickVideoUuid(it);
            const progressFromItem = Number(it?.progressSec || 0);
            const progressFromMap = vid ? Number(progressByVideoId.get(vid) || 0) : 0;
            const progressSec = progressFromItem > 0 ? progressFromItem : progressFromMap;

            const focused = idx === focusedCardIndex;

            return (
              <CoverCard
                key={pickStableKey(it, idx)}
                item={it}
                index={idx}
                progressSec={progressSec}
                focused={focused}
                tabIndex={focused ? 0 : -1}
                setCardRef={setCardRef}
                onOpenTitle={onOpenTitle}
              />
            );
          })}

          {rightSpacerW > 0 ? <div style={{ width: rightSpacerW, flex: "0 0 auto" }} /> : null}
        </div>
      </div>
    </section>
  );
}

export default React.memo(TvRowImpl);
