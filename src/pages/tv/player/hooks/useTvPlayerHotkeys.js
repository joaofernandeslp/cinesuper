import { useEffect, useRef } from "react";
import { KEY, BACK_KEYCODES, hasCode } from "../../_tvKeys.js";
import { stopEvent } from "../helpers.js";
import { WATCH_BASE } from "../../../../player/env.js";

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "LIMPAR", "0", "OK"];

export function useTvPlayerHotkeys(ctx) {
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  });

  useEffect(() => {
    function isNavKey(code) {
      return (
        hasCode(KEY.UP, code) ||
        hasCode(KEY.DOWN, code) ||
        hasCode(KEY.LEFT, code) ||
        hasCode(KEY.RIGHT, code) ||
        hasCode(KEY.ENTER, code)
      );
    }

    function onKeyDown(e) {
      const c = ctxRef.current;
      if (!c || c.isLoading) return;

      const code = e.keyCode ?? e.which;

      const isBack =
        BACK_KEYCODES.includes(code) ||
        code === 8 ||
        e.key === "Backspace" ||
        e.key === "Escape" ||
        e.key === "GoBack" ||
        e.key === "BrowserBack";

      const {
        // state
        hasItem,
        panel,
        overlayOpen,
        gateBlocked,
        gateNeedPin,
        isIntroPlaying,
        uiVisible,
        stuckOverlay,
        stuckFocus,

        // focus
        focusArea,
        focusIndex,
        controlsMaxIndex,
        topFocus,
        topActions,

        // menus
        menuIndex,
        episodesMenu,
        subsMenu,
        audioMenu,

        // pin
        pinFocus,
        pinInput,

        // refs
        btnRefs,
        topRefs,

        // actions setters
        setPanel,
        setMenuIndex,
        setFocusArea,
        setFocusIndex,
        setTopFocus,
        setPinFocus,
        setPinInput,

        // actions
        closeOverlay,
        goBack,
        finishIntro,
        togglePlay,
        seekBy,
        applySubsIdx,
        applyAudioIdx,
        submitPin,
        armAutoHide,
        setStuckFocus,
        onStuckRetry,
        onStuckBack,

        // next up
        showNextUpButton,
        nextBtnIndex,
        goNextEpisode,

        // navigation for episodes selection
        navigate,
        location,
        item,
        id,
      } = c;

      if (stuckOverlay) {
        const curFocus = Number.isFinite(Number(stuckFocus)) ? Number(stuckFocus) : 0;

        if (isBack) {
          stopEvent(e);
          onStuckBack?.();
          return;
        }
        if (hasCode(KEY.LEFT, code)) {
          stopEvent(e);
          setStuckFocus?.(0);
          return;
        }
        if (hasCode(KEY.RIGHT, code)) {
          stopEvent(e);
          setStuckFocus?.(1);
          return;
        }
        if (hasCode(KEY.ENTER, code)) {
          stopEvent(e);
          if (curFocus === 0) onStuckRetry?.();
          else onStuckBack?.();
          return;
        }
        if (isNavKey(code)) stopEvent(e);
        return;
      }

      if (isBack) {
        stopEvent(e);

        if (panel === "gatepin") {
          setPanel("none");
          armAutoHide();
          return;
        }
        if (overlayOpen) {
          closeOverlay();
          return;
        }
        goBack();
        return;
      }

      if (!hasItem) return;

      if (!overlayOpen && panel !== "gatepin" && !gateBlocked && !isIntroPlaying && isNavKey(code)) {
        armAutoHide();
      }

      // Intro
      if (isIntroPlaying) {
        if (hasCode(KEY.DOWN, code)) {
          stopEvent(e);
          finishIntro();
          return;
        }
        if (hasCode(KEY.ENTER, code)) {
          stopEvent(e);
          togglePlay();
          return;
        }
        if (isNavKey(code)) stopEvent(e);
        return;
      }

      // PIN
      if (panel === "gatepin") {
        if (hasCode(KEY.LEFT, code)) {
          stopEvent(e);
          setPinFocus((n) => Math.max(0, n - 1));
          return;
        }
        if (hasCode(KEY.RIGHT, code)) {
          stopEvent(e);
          setPinFocus((n) => Math.min(11, n + 1));
          return;
        }
        if (hasCode(KEY.UP, code)) {
          stopEvent(e);
          setPinFocus((n) => Math.max(0, n - 3));
          return;
        }
        if (hasCode(KEY.DOWN, code)) {
          stopEvent(e);
          setPinFocus((n) => Math.min(11, n + 3));
          return;
        }
        if (hasCode(KEY.ENTER, code)) {
          stopEvent(e);
          const k = PIN_KEYS[pinFocus] || "";
          if (k === "OK") submitPin();
          else if (k === "LIMPAR") setPinInput("");
          else setPinInput(String(pinInput || "").concat(k).replace(/\D/g, "").slice(0, 6));
          return;
        }
        return;
      }

      // Overlay menus
      if (overlayOpen) {
        const list = panel === "episodes" ? episodesMenu : panel === "bubble-audio" ? audioMenu : panel === "bubble-subs" ? subsMenu : [];

        if (hasCode(KEY.UP, code)) {
          stopEvent(e);
          setMenuIndex((n) => Math.max(0, n - 1));
          return;
        }
        if (hasCode(KEY.DOWN, code)) {
          stopEvent(e);
          setMenuIndex((n) => Math.min((list?.length || 1) - 1, n + 1));
          return;
        }
        if (hasCode(KEY.ENTER, code)) {
          stopEvent(e);

          if (panel === "episodes") {
            const it = episodesMenu[menuIndex];
            if (it?.id) {
              closeOverlay();
              navigate(`${WATCH_BASE}/${it.id}`, {
                state: { from: location?.state?.from || "/browse", item: location?.state?.item || item },
              });
            }
            return;
          }

          if (panel === "bubble-subs") {
            const it = subsMenu[menuIndex];
            if (!it) return;

            if (it.id === "off") {
              applySubsIdx("off");
              closeOverlay();
              return;
            }
            applySubsIdx(Number(it.id));
            closeOverlay();
            return;
          }

          if (panel === "bubble-audio") {
            const it = audioMenu[menuIndex];
            const idx = Number(it?.id);
            if (!Number.isFinite(idx)) return;
            applyAudioIdx(idx);
            closeOverlay();
            return;
          }

          return;
        }

        if (hasCode(KEY.LEFT, code) || hasCode(KEY.RIGHT, code)) stopEvent(e);
        return;
      }

      // Gate blocked (sem pin)
      if (gateBlocked && !gateNeedPin) {
        if (isNavKey(code)) stopEvent(e);
        return;
      }

      // UI hidden
      if (!uiVisible) {
        if (hasCode(KEY.ENTER, code)) {
          stopEvent(e);
          togglePlay();
          return;
        }
        if (hasCode(KEY.LEFT, code)) {
          stopEvent(e);
          setFocusArea("progress");
          seekBy(-10, "tv-left");
          return;
        }
        if (hasCode(KEY.RIGHT, code)) {
          stopEvent(e);
          setFocusArea("progress");
          seekBy(10, "tv-right");
          return;
        }
        if (hasCode(KEY.DOWN, code)) {
          stopEvent(e);
          setFocusArea("controls");
          setFocusIndex(0);
          btnRefs.current?.[0]?.focus?.();
          return;
        }
        if (hasCode(KEY.UP, code)) {
          stopEvent(e);
          setFocusArea("progress");
          return;
        }
        return;
      }

      // UI visible navigation
      if (hasCode(KEY.UP, code)) {
        stopEvent(e);
        if (focusArea === "controls") {
          setFocusArea("progress");
          return;
        }
        if (focusArea === "progress") {
          setFocusArea("top");
          setTimeout(() => topRefs.current?.[topFocus]?.focus?.(), 0);
          return;
        }
        return;
      }

      if (hasCode(KEY.DOWN, code)) {
        stopEvent(e);
        if (focusArea === "top") {
          setFocusArea("progress");
          return;
        }
        if (focusArea === "progress") {
          setFocusArea("controls");
          setTimeout(() => btnRefs.current?.[focusIndex]?.focus?.(), 0);
          return;
        }
        setFocusArea("controls");
        return;
      }

      if (hasCode(KEY.ENTER, code)) {
        stopEvent(e);

        if (focusArea === "top") {
          const b = topActions[topFocus];
          if (b && !b.disabled) b.onClick?.();
          return;
        }

        if (focusArea === "controls") {
          if (focusIndex === 0) {
            togglePlay();
            return;
          }

          if (showNextUpButton && focusIndex === nextBtnIndex) {
            goNextEpisode();
            return;
          }

          const chipIdx = focusIndex - 1;
          const chips = c.chips || [];
          if (chipIdx >= 0 && chipIdx < chips.length) {
            chips[chipIdx]?.onSelect?.();
          }
          return;
        }

        if (focusArea === "progress") {
          setFocusArea("controls");
          setFocusIndex(0);
          setTimeout(() => btnRefs.current?.[0]?.focus?.(), 0);
          return;
        }

        return;
      }

      if (hasCode(KEY.LEFT, code) || hasCode(KEY.RIGHT, code)) {
        stopEvent(e);
        const dir = hasCode(KEY.LEFT, code) ? -1 : 1;

        if (focusArea === "top") {
          const max = topActions.length - 1;
          let next = Math.max(0, Math.min(max, topFocus + dir));

          for (let i = 0; i < topActions.length; i++) {
            const cand = topActions[next];
            if (cand && !cand.disabled) break;
            next = Math.max(0, Math.min(max, next + dir));
          }

          setTopFocus(next);
          setTimeout(() => topRefs.current?.[next]?.focus?.(), 0);
          return;
        }

        if (focusArea === "controls") {
          const next = Math.max(0, Math.min(controlsMaxIndex, focusIndex + dir));
          setFocusIndex(next);
          setTimeout(() => btnRefs.current?.[next]?.focus?.(), 0);
          return;
        }

        if (focusArea === "progress") {
          seekBy(dir * 10, "tv-scrub");
          return;
        }
      }
    }

    window.addEventListener("keydown", onKeyDown, { passive: false, capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
