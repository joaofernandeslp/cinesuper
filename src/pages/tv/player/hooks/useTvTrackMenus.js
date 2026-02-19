import { useCallback, useMemo } from "react";

// Helpers locais (ficavam no PlayerTv)
function findIdxByLabel(list, rx) {
  const arr = Array.isArray(list) ? list : [];
  for (let i = 0; i < arr.length; i++) {
    const str = String(arr[i]?.label || arr[i]?.name || arr[i]?.lang || "").toLowerCase();
    if (rx.test(str)) return i;
  }
  return -1;
}

function getActiveSubIdxFromTextTracks(tt) {
  const arr = Array.isArray(tt) ? tt : [];
  const showing = arr.find((t) => String(t?.mode || "").toLowerCase() === "showing");
  return Number.isFinite(Number(showing?.idx)) ? Number(showing.idx) : -1;
}

export function useTvTrackMenus({
  videoRef,
  hlsRef,
  anti,

  // tracks state
  textTracks,
  audioTracks,
  activeAudioTrack,
  setActiveAudioTrack,

  // sync
  syncTextTracks,

  // abrir bolhas
  clearHideTimer,
  setPanel,
  setMenuIndex,

  // native overrides (ExoPlayer)
  setTextTrack,
  setAudioTrack,
}) {
  const subsMenu = useMemo(() => {
    const active = textTracks.find((t) => t.mode === "showing");
    return [
      { key: "off", id: "off", label: "Desativado", right: active ? "" : "✓" },
      ...textTracks.map((t) => ({
        key: `${t.idx}-${t.label}`,
        id: String(t.idx),
        label: t.label,
        right: t.mode === "showing" ? "✓" : "",
      })),
    ];
  }, [textTracks]);

  const audioMenu = useMemo(() => {
    return (audioTracks || []).map((t, idx) => ({
      key: `${idx}-${t?.name || t?.lang || "audio"}`,
      id: String(idx),
      label: t?.name || t?.lang || `Faixa ${idx + 1}`,
      right: activeAudioTrack === idx ? "✓" : "",
    }));
  }, [audioTracks, activeAudioTrack]);

  const applySubsIdx = useCallback(
    (subIdxOrOff) => {
      if (setTextTrack) {
        setTextTrack(subIdxOrOff);
        syncTextTracks?.();
        return;
      }

      const v = videoRef.current;
      if (!v?.textTracks) return;

      const idx = Number(subIdxOrOff);
      if (subIdxOrOff === "off" || !Number.isFinite(idx)) {
        for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = "disabled";
        syncTextTracks();
        return;
      }

      for (let i = 0; i < v.textTracks.length; i++) {
        v.textTracks[i].mode = i === idx ? "showing" : "disabled";
      }
      syncTextTracks();
    },
    [videoRef, syncTextTracks, setTextTrack]
  );

  const applyAudioIdx = useCallback(
    (idx) => {
      if (setAudioTrack) {
        const n = Number(idx);
        if (!Number.isFinite(n)) return;
        setAudioTrack(n);
        setActiveAudioTrack(n);
        return;
      }

      const hls = hlsRef.current;
      const v = videoRef.current;
      if (!hls || !v) return;

      const n = Number(idx);
      if (!Number.isFinite(n)) return;

      try {
        const tt = Number(v.currentTime || 0);
        if (tt > 0.5 && !anti.userSeekRecently()) {
          anti.pendingRestoreRef.current = { time: tt, reason: "tv-audio-pick", tries: 0 };
        }
        hls.audioTrack = n;
        setActiveAudioTrack(n);
      } catch {}
    },
    [hlsRef, videoRef, anti, setActiveAudioTrack, setAudioTrack]
  );

  const hasTracks = (audioTracks?.length || 0) + (textTracks?.length || 0) > 0;

  const chips = useMemo(() => {
    const aMenu = audioMenu;
    const sMenu = subsMenu;

    const audioPt = findIdxByLabel(aMenu, /(portugu|pt-?br|\bpt\b)/i);
    const audioOrig = (() => {
      const orig = findIdxByLabel(aMenu, /(original|corean|korean|japan|english|\ben\b)/i);
      if (orig >= 0) return orig;
      for (let i = 0; i < aMenu.length; i++) {
        if (i === audioPt) continue;
        return i;
      }
      return -1;
    })();

    const activeSubIdx = getActiveSubIdxFromTextTracks(textTracks);
    const subsOn = activeSubIdx >= 0;

    const ptLabel = aMenu[audioPt]?.label || "Português";
    const origLabel = aMenu[audioOrig]?.label || "Original";

    const subPtId = (() => {
      const found = sMenu.find((x) => x?.id !== "off" && /(portugu|pt-?br|\bpt\b)/i.test(String(x?.label || "")));
      return found ? found.id : null;
    })();

    const list = [];

    if (audioPt >= 0) {
      list.push({
        key: "pt-no-subs",
        label: ptLabel,
        selected: activeAudioTrack === audioPt && !subsOn,
        onSelect: () => {
          applyAudioIdx(audioPt);
          applySubsIdx("off");
        },
      });
    }

    if (audioOrig >= 0 && subPtId != null) {
      list.push({
        key: "orig-subs",
        label: `${origLabel} + legendas`,
        selected: activeAudioTrack === audioOrig && subsOn,
        onSelect: () => {
          applyAudioIdx(audioOrig);
          applySubsIdx(Number(subPtId));
        },
      });
    }

    if (audioPt >= 0 && subPtId != null) {
      list.push({
        key: "pt-subs",
        label: `${ptLabel} + legendas`,
        selected: activeAudioTrack === audioPt && subsOn,
        onSelect: () => {
          applyAudioIdx(audioPt);
          applySubsIdx(Number(subPtId));
        },
      });
    }

    list.push({
      key: "audio-more",
      label: "Idiomas",
      selected: false,
      onSelect: () => {
        clearHideTimer();
        setPanel("bubble-audio");
        setMenuIndex(0);
      },
    });

    list.push({
      key: "subs-cc",
      label: "CC",
      selected: subsOn,
      onSelect: () => {
        clearHideTimer();
        setPanel("bubble-subs");
        setMenuIndex(0);
      },
      isIcon: true,
    });

    return list;
  }, [
    audioMenu,
    subsMenu,
    textTracks,
    activeAudioTrack,
    applyAudioIdx,
    applySubsIdx,
    clearHideTimer,
    setPanel,
    setMenuIndex,
  ]);

  return {
    hasTracks,
    showChips: hasTracks,
    subsMenu,
    audioMenu,
    chips,
    applySubsIdx,
    applyAudioIdx,
  };
}
