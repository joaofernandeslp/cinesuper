// src/components/DomainGate.jsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const ROOT_HOST = "cinesuper.com.br";
const APP_HOST  = "app.cinesuper.com.br";

function isRootOnlyPath(pathname) {
  const p = String(pathname || "");
  return p === "/" || p === "/landing" || p === "/contato";
}

function isAppOnlyPath(pathname) {
  const p = String(pathname || "");
  return (
    p === "/login" ||
    p.startsWith("/signup") ||   // ✅ signup no APP
    p.startsWith("/browse") ||
    p.startsWith("/t/") ||
    p.startsWith("/watch/") ||
    p.startsWith("/admin")
  );
}

function normalizeHost(h) {
  return String(h || "").toLowerCase().replace(/^www\./, "");
}

export default function DomainGate({ children }) {
  const loc = useLocation();

  useEffect(() => {
    const host = normalizeHost(window.location.hostname);
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    const hash = window.location.hash || "";

    const isRootHost = host === ROOT_HOST;
    const isAppHost = host === APP_HOST;

    if (!isRootHost && !isAppHost) return;

    const here = `https://${host}${pathname}${search}${hash}`;

    if (isAppHost && isRootOnlyPath(pathname)) {
      const to = `https://${ROOT_HOST}${pathname}${search}${hash}`;
      if (to !== here) window.location.replace(to);
      return;
    }

    if (isRootHost && isAppOnlyPath(pathname)) {
      const to = `https://${APP_HOST}${pathname}${search}${hash}`;
      if (to !== here) window.location.replace(to);
      return;
    }
  }, [loc.pathname, loc.search, loc.hash]);

  return children;
}
