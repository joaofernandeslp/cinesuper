// Update helpers for Capacitor/Android TV builds.
// Safe to import on web; Capacitor provides web fallbacks.

import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

type UpdateInfo = {
  latestVersionCode: number;
  latestVersionName?: string;
  apkUrl: string;
  mandatory?: boolean;
  notes?: string;
};

type UpdateCheckResult = {
  updateAvailable: boolean;
  currentVersionCode: number;
  currentVersionName?: string;
  latestVersionCode?: number;
  latestVersionName?: string;
  info?: UpdateInfo | null;
};

type UpdateDebug = {
  url: string;
  status?: number;
  ok?: boolean;
  error?: string;
  raw?: unknown;
  mode?: "fetch" | "capacitor_http";
  meta?: {
    isNative: boolean;
    hasCapHttp: boolean;
  };
};

type DownloadProgress = {
  progress: number; // 0..1
  received?: number;
  total?: number;
};

type DownloadResult =
  | { ok: true; method: "native-bridge" | "external" }
  | { ok: false; method: "external"; reason: string };

const UPDATE_URL =
  (import.meta as any)?.env?.VITE_TV_UPDATE_URL ||
  (import.meta as any)?.env?.VITE_APP_UPDATE_URL ||
  "";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      resolve(fallback);
    }, timeoutMs);

    promise
      .then((val) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve(val);
      })
      .catch(() => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        resolve(fallback);
      });
  });
}

export async function getCurrentVersion() {
  const isNative = !!Capacitor?.isNativePlatform?.();

  if (isNative && CapApp?.getInfo) {
    const info = await withTimeout(CapApp.getInfo(), 2000, null);
    const versionName = String(info?.version || "");
    const build = Number(info?.build || 0);
    return { versionName, versionCode: Number.isFinite(build) ? build : 0 };
  }

  return { versionName: isNative ? "native" : "web", versionCode: 0 };
}

const UpdatePlugin = registerPlugin("UpdatePlugin");

async function fetchJsonWithTimeout(url: string, timeoutMs = 8000, preferNative = true) {
  let timeoutId: number | null = null;
  const timeoutPromise = new Promise<{ res: Response | null; raw: unknown; error: string }>((resolve) => {
    timeoutId = window.setTimeout(() => resolve({ res: null, raw: null, error: "timeout" }), timeoutMs);
  });

  const useNative = preferNative && Capacitor?.isNativePlatform?.() && CapacitorHttp?.get;

  const nativePromise = useNative
    ? (async () => {
        const maxRedirects = 2;
        let currentUrl = url;
        let redirectCount = 0;

        while (redirectCount <= maxRedirects) {
          try {
            const out = await CapacitorHttp.get({ url: currentUrl });
            const status = Number(out?.status || 0);
            const ok = status >= 200 && status < 300;

            if (status >= 300 && status < 400) {
              const headers = out?.headers || {};
              const location =
                headers?.location || headers?.Location || headers?.LOCATION || headers?.["Location"] || "";
              if (location) {
                currentUrl = String(location);
                redirectCount += 1;
                continue;
              }
              if (String(currentUrl).startsWith("http://")) {
                currentUrl = String(currentUrl).replace(/^http:\/\//i, "https://");
                redirectCount += 1;
                continue;
              }
              return {
                res: { ok: false, status } as Response,
                raw: null,
                error: "redirect_no_location",
                mode: "capacitor_http",
              };
            }

            let raw = out?.data ?? null;
            let parseError: string | null = null;
            if (typeof raw === "string") {
              const trimmed = raw.trim();
              if (!trimmed) {
                raw = null;
              } else {
                try {
                  raw = JSON.parse(trimmed);
                } catch {
                  parseError = "invalid_json";
                  raw = null;
                }
              }
            }
            return {
              res: { ok, status } as Response,
              raw,
              error: parseError,
              mode: "capacitor_http",
            };
          } catch (e) {
            return {
              res: null,
              raw: null,
              error: String(e?.message || e || "native_fetch_failed"),
              mode: "capacitor_http",
            };
          }
        }

        return {
          res: null,
          raw: null,
          error: "redirect_limit",
          mode: "capacitor_http",
        };
      })()
    : null;

  const fetchPromise = !useNative
    ? (async () => {
        try {
          const res = await fetch(url, { cache: "no-store" });
          const raw = await res.json().catch(() => null);
          return { res, raw, error: null as string | null, mode: "fetch" };
        } catch (e) {
          return { res: null, raw: null, error: String(e?.message || e || "fetch_failed"), mode: "fetch" };
        }
      })()
    : null;

  const raceList = [timeoutPromise];
  if (nativePromise) raceList.unshift(nativePromise);
  if (fetchPromise) raceList.unshift(fetchPromise);

  const result = (await Promise.race(raceList)) as {
    res: Response | null;
    raw: unknown;
    error: string | null;
    mode?: "fetch" | "capacitor_http";
  };

  if (timeoutId !== null) window.clearTimeout(timeoutId);
  return result;
}

export async function fetchUpdateInfo(url = UPDATE_URL): Promise<UpdateInfo | null> {
  if (!url) return null;
  const bustUrl = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const { res, raw } = await fetchJsonWithTimeout(bustUrl, 8000, true);
  if (!res || !res.ok || !raw) return null;
  if (!raw) return null;

  const latestVersionCode = Number(raw.latestVersionCode || raw.versionCode || raw.build || 0);
  const latestVersionName = raw.latestVersionName || raw.versionName || raw.version || "";
  const apkUrl = String(raw.apkUrl || raw.url || "");
  if (!latestVersionCode || !apkUrl) return null;

  return {
    latestVersionCode,
    latestVersionName: String(latestVersionName || ""),
    apkUrl,
    mandatory: !!raw.mandatory,
    notes: raw.notes ? String(raw.notes) : undefined,
  };
}

export async function checkForUpdate(url = UPDATE_URL): Promise<UpdateCheckResult> {
  const current = await getCurrentVersion();
  const info = await fetchUpdateInfo(url);
  if (!info) {
    return {
      updateAvailable: false,
      currentVersionCode: current.versionCode,
      currentVersionName: current.versionName,
      info: null,
    };
  }

  const updateAvailable = Number(info.latestVersionCode) > Number(current.versionCode || 0);
  return {
    updateAvailable,
    currentVersionCode: current.versionCode,
    currentVersionName: current.versionName,
    latestVersionCode: info.latestVersionCode,
    latestVersionName: info.latestVersionName,
    info,
  };
}

export async function checkForUpdateWithDebug(
  url = UPDATE_URL
): Promise<UpdateCheckResult & { debug: UpdateDebug }> {
  const current = await getCurrentVersion();
  const debug: UpdateDebug = {
    url,
    meta: {
      isNative: !!Capacitor?.isNativePlatform?.(),
      hasCapHttp: !!CapacitorHttp?.get,
    },
  };

  if (!url) {
    debug.error = "missing_update_url";
    return {
      updateAvailable: false,
      currentVersionCode: current.versionCode,
      currentVersionName: current.versionName,
      info: null,
      debug,
    };
  }

  const bustUrl = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const { res, raw, error, mode } = await fetchJsonWithTimeout(bustUrl, 8000, true);
  if (!res) {
    debug.error = error || "fetch_failed";
    debug.mode = mode;
    return {
      updateAvailable: false,
      currentVersionCode: current.versionCode,
      currentVersionName: current.versionName,
      info: null,
      debug,
    };
  }

  debug.status = res.status;
  debug.ok = res.ok;
  debug.mode = mode;
  debug.raw = raw;

  if (!res.ok || !raw) {
    debug.error = res.ok ? "bad_response" : "http_error";
    return {
      updateAvailable: false,
      currentVersionCode: current.versionCode,
      currentVersionName: current.versionName,
      info: null,
      debug,
    };
  }

  const latestVersionCode = Number(raw.latestVersionCode || raw.versionCode || raw.build || 0);
  const latestVersionName = raw.latestVersionName || raw.versionName || raw.version || "";
  const apkUrl = String(raw.apkUrl || raw.url || "");
  if (!latestVersionCode || !apkUrl) {
    debug.error = "missing_fields";
    return {
      updateAvailable: false,
      currentVersionCode: current.versionCode,
      currentVersionName: current.versionName,
      info: null,
      debug,
    };
  }

  const info: UpdateInfo = {
    latestVersionCode,
    latestVersionName: String(latestVersionName || ""),
    apkUrl,
    mandatory: !!raw.mandatory,
    notes: raw.notes ? String(raw.notes) : undefined,
  };

  const updateAvailable = Number(info.latestVersionCode) > Number(current.versionCode || 0);
  return {
    updateAvailable,
    currentVersionCode: current.versionCode,
    currentVersionName: current.versionName,
    latestVersionCode: info.latestVersionCode,
    latestVersionName: info.latestVersionName,
    info,
    debug,
  };
}

function listenNativeProgress(onProgress?: (p: DownloadProgress) => void) {
  if (!onProgress) return () => {};
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent)?.detail || {};
    const progress = Number(detail?.progress ?? detail?.pct ?? 0);
    const received = Number(detail?.received ?? 0);
    const total = Number(detail?.total ?? 0);
    const safeProgress = Number.isFinite(progress) ? progress : 0;
    onProgress({ progress: safeProgress, received, total });
  };
  window.addEventListener("cs:update-progress", handler as EventListener);
  return () => window.removeEventListener("cs:update-progress", handler as EventListener);
}

export async function downloadUpdate(
  apkUrl: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<DownloadResult> {
  if (!apkUrl) return { ok: false, method: "external", reason: "missing_apk_url" };

  const cleanup = listenNativeProgress(onProgress);
  const isNative = !!Capacitor?.isNativePlatform?.();
  // Prefer Capacitor native plugin if available.
  if (isNative) {
    try {
      await (UpdatePlugin as any)?.downloadApk?.({ url: String(apkUrl) });
      return { ok: true, method: "native-bridge" };
    } catch {
      cleanup();
      return { ok: false, method: "native-bridge", reason: "native_download_failed" };
    }
  }

  cleanup();
  try {
    window.open(String(apkUrl), "_system");
  } catch {
    window.location.href = String(apkUrl);
  }

  return { ok: false, method: "external", reason: "no_native_bridge" };
}

export type { UpdateInfo, UpdateCheckResult, DownloadProgress, DownloadResult, UpdateDebug };
