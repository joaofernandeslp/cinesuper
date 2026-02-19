// src/hooks/player/useAutoHideUi.js
import { useEffect, useRef, useState, useCallback } from "react";

export function useAutoHideUi({ delayMs = 2500 } = {}) {
  const [showUI, setShowUI] = useState(true);
  const hideUiTimerRef = useRef(null);

  const clearHideTimer = useCallback(() => {
    if (hideUiTimerRef.current) {
      clearTimeout(hideUiTimerRef.current);
      hideUiTimerRef.current = null;
    }
  }, []);

  const armAutoHide = useCallback(() => {
    clearHideTimer();
    setShowUI(true);
    hideUiTimerRef.current = setTimeout(() => setShowUI(false), delayMs);
  }, [clearHideTimer, delayMs]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return { showUI, setShowUI, armAutoHide, clearHideTimer };
}
