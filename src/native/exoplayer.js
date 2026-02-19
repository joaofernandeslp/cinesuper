import { Capacitor, registerPlugin } from "@capacitor/core";

const ExoPlayerPlugin = registerPlugin("ExoPlayerPlugin");

const DISABLE_EXO = (() => {
  const raw = String(import.meta?.env?.VITE_TV_DISABLE_EXO || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
})();

function isAndroidUa() {
  return /android/i.test(navigator.userAgent || "");
}

export function isNativeAndroid() {
  return !!Capacitor?.isNativePlatform?.() && isAndroidUa();
}

export function isNativeExoAvailable() {
  return !!Capacitor?.isNativePlatform?.() && !!ExoPlayerPlugin && !DISABLE_EXO;
}

export function isExoDisabled() {
  return DISABLE_EXO;
}

async function safeCall(method, args = {}) {
  try {
    const fn = ExoPlayerPlugin?.[method];
    if (!fn) return { ok: false, error: "missing_method" };
    const res = await fn(args);
    return res || { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

export const exoPlayer = {
  init: (opts = {}) => safeCall("init", opts),
  setSource: (opts = {}) => safeCall("setSource", opts),
  play: () => safeCall("play"),
  pause: () => safeCall("pause"),
  seek: (positionSec) => safeCall("seek", { position: Number(positionSec || 0) }),
  setVolume: (volume) => safeCall("setVolume", { volume: Number(volume ?? 1) }),
  setPlaybackRate: (rate) => safeCall("setPlaybackRate", { rate: Number(rate || 1) }),
  setTextTrack: (indexOrOff) => safeCall("setTextTrack", { index: indexOrOff }),
  setAudioTrack: (index) => safeCall("setAudioTrack", { index: Number(index) }),
  setVisible: (visible) => safeCall("setVisible", { visible: !!visible }),
  setVideoOffset: (offsetY) => safeCall("setVideoOffset", { offsetY: Number(offsetY || 0) }),
  destroy: () => safeCall("destroy"),
  addListener: (event, cb) => ExoPlayerPlugin?.addListener?.(event, cb),
};
