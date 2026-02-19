import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { HelmetProvider } from "@dr.pogodin/react-helmet";
import App from "./app/App.jsx";
import { IS_TV, TV_HOME } from "./app/target.js";
import "./styles/index.css";

function TargetBootstrap() {
  const loc = useLocation();
  const nav = useNavigate();

  React.useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.dataset.target = IS_TV ? "tv" : "web";
    root.classList.toggle("is-tv", IS_TV);
    body.classList.toggle("is-tv", IS_TV);
  }, []);

  React.useEffect(() => {
    if (!IS_TV) return;

    // evita cair em rotas web-only na TV
    const WEB_ONLY = new Set(["/", "/landing", "/planos", "/signup", "/register"]);
    if (WEB_ONLY.has(loc.pathname)) {
      nav(TV_HOME, { replace: true });
    }
  }, [loc.pathname, nav]);

  return null;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <TargetBootstrap />
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
);
