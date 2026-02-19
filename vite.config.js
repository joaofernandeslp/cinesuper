import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

function readGradleVersionName() {
  try {
    const gradlePath = path.resolve("android/app/build.gradle");
    const raw = fs.readFileSync(gradlePath, "utf8");
    const m = raw.match(/versionName\s+"([^"]+)"/);
    return m?.[1] || "";
  } catch {
    return "";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(readGradleVersionName() || "0.0.0"),
  },
  build: {
    target: "es2019",
    minify: "esbuild",
    sourcemap: false,
  },
});
