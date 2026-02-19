// src/hooks/player/useThumb_toggleScrub.js
import { useCallback, useRef, useState } from "react";
import { clamp } from "../../player/utils.js";
import { findCueBinary } from "../../player/thumbs.js";

export function useThumbToggleScrub({ videoRef, duration, thumbCues, noteUserSeek, armAutoHide, setCurrent }) {
  const [hover, setHover] = useState({ show: false, x: 0, time: 0, cue: null });
  const hoverRafRef = useRef(0);
  const scrubbingRef = useRef(false);
  const [scrubTime, setScrubTime] = useState(null);

  const computeTimeFromClientX = useCallback((containerEl, clientX) => {
    const rect = containerEl.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const pct = rect.width ? x / rect.width : 0;
    const time = duration ? clamp(duration * pct, 0, duration) : 0;

    const tooltipPad = 28;
    const xClamped = clamp(x, tooltipPad, rect.width - tooltipPad);

    return { rect, x, xClamped, pct, time };
  }, [duration]);

  const updateHoverAndMaybeSeek = useCallback((containerEl, clientX) => {
    if (!duration) return;

    const { xClamped, time } = computeTimeFromClientX(containerEl, clientX);
    const cue = thumbCues.length ? findCueBinary(thumbCues, time) : null;

    setHover({ show: true, x: xClamped, time, cue });

    if (scrubbingRef.current) {
      const v = videoRef.current;
      if (v) {
        try {
          v.currentTime = time;
        } catch {}
      }
      setScrubTime(time);
      setCurrent(time);
    }
  }, [duration, computeTimeFromClientX, thumbCues, videoRef, setCurrent]);

  const endScrub = useCallback(() => {
    scrubbingRef.current = false;
    setScrubTime(null);
    setHover((h) => ({ ...h, show: false }));
  }, []);

  const onProgressPointerDown = useCallback((e) => {
    if (!duration) return;
    scrubbingRef.current = true;
    noteUserSeek?.("scrub-down");

    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}

    updateHoverAndMaybeSeek(e.currentTarget, e.clientX);
    armAutoHide?.();
  }, [duration, noteUserSeek, updateHoverAndMaybeSeek, armAutoHide]);

  const onProgressPointerMove = useCallback((e) => {
    if (!duration) return;
    const el = e.currentTarget;
    const clientX = e.clientX;

    if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
    hoverRafRef.current = requestAnimationFrame(() => {
      updateHoverAndMaybeSeek(el, clientX);
    });
  }, [duration, updateHoverAndMaybeSeek]);

  const onProgressPointerUp = useCallback((e) => {
    noteUserSeek?.("scrub-up");
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
    endScrub();
  }, [noteUserSeek, endScrub]);

  const onProgressPointerCancel = useCallback((e) => {
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
    endScrub();
  }, [endScrub]);

  const onProgressPointerLeave = useCallback(() => {
    if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
    if (!scrubbingRef.current) setHover((h) => ({ ...h, show: false }));
  }, []);

  return {
    hover,
    scrubTime,
    scrubbingRef,
    setScrubTime,
    setHover,
    onProgressPointerDown,
    onProgressPointerMove,
    onProgressPointerUp,
    onProgressPointerCancel,
    onProgressPointerLeave,
  };
}
