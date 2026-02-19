export const WATCH_BASE = "/watch";
export const HLS_DEBUG_TO_WINDOW = true;
export const DEBUG = true;

export const INTRO_SRC = String(import.meta.env.VITE_PLAYER_INTRO_URL || "/intro.mp4").trim();
export const INTRO_MODE = String(import.meta.env.VITE_PLAYER_INTRO_MODE || "per_title").trim();

export const STREAM_BASE = String(import.meta.env.VITE_STREAM_BASE_URL || "https://stream.cinesuper.com.br").replace(/\/+$/, "");

export const DEVICE_KEY_STORAGE = "cs_device_key:v1";
export const DEVICE_LABEL_STORAGE = "cs_device_label:v1";

export const PROGRESS_SAVE_EVERY_MS = 10_000;
export const PROGRESS_MIN_SAVE_DELTA_SEC = 2;
