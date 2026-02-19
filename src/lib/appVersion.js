export function getAppVersionName() {
  try {
    if (typeof __APP_VERSION__ !== "undefined" && __APP_VERSION__) {
      return String(__APP_VERSION__).trim();
    }
  } catch {}

  try {
    const envVersion = String(import.meta?.env?.VITE_APP_VERSION || "").trim();
    if (envVersion) return envVersion;
  } catch {}

  return "0.0.0";
}

export const APP_VERSION_NAME = getAppVersionName();
export const APP_VERSION = `v${APP_VERSION_NAME.replace(/^v/i, "")}`;
