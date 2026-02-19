// src/player/device.js
import { DEVICE_KEY_STORAGE, DEVICE_LABEL_STORAGE } from "./env.js";

export function randomHex(bytes = 16) {
  try {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  }
}

export function getOrCreateDeviceKey() {
  try {
    const cur = String(localStorage.getItem(DEVICE_KEY_STORAGE) || "").trim();
    if (cur) return cur;
    const next = randomHex(16);
    localStorage.setItem(DEVICE_KEY_STORAGE, next);
    return next;
  } catch {
    return randomHex(16);
  }
}

export function guessPlatform() {
  const ua = navigator.userAgent || "";
  const low = ua.toLowerCase();

  if (low.includes("smart-tv") || low.includes("smarttv") || low.includes("tizen") || low.includes("webos")) return "tv";
  if (low.includes("playstation") || low.includes("xbox") || low.includes("nintendo")) return "console";
  if (/android|iphone|ipad|ipod/i.test(ua)) return "mobile";
  return "web";
}

export function defaultDeviceLabel() {
  const p = guessPlatform();
  if (p === "tv") return "TV";
  if (p === "console") return "Console";
  if (p === "mobile") return "Celular";
  return "Navegador";
}

export function readStoredDeviceLabel() {
  try {
    return String(localStorage.getItem(DEVICE_LABEL_STORAGE) || "").trim();
  } catch {
    return "";
  }
}
