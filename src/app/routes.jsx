// src/app/routes.jsx
import { Navigate } from "react-router-dom";

import Title from "../pages/Title.jsx";
import Player from "../pages/Player.jsx";
import NotFound from "../pages/NotFound.jsx";
import Contact from "../pages/Contact.jsx";
import Landing from "../pages/Landing.jsx";
import Signup from "../pages/Signup.jsx";
import BillingReturn from "../pages/account/BillingReturn.jsx";
import Profiles from "../pages/Profiles.jsx";
import TvPairWeb from "../pages/TvPairWeb.jsx";

import LoginEntry from "../pages/entries/LoginEntry.jsx";
import WhoEntry from "../pages/entries/WhoEntry.jsx";
import BrowseEntry from "../pages/entries/BrowseEntry.jsx";
import SplashTv from "../pages/tv/SplashTv.jsx";
import TvWelcome from "../pages/tv/TvWelcome.jsx";
import SignupTv from "../pages/tv/SignupTv.jsx";

// ✅ TV: Title
import TitleTv from "../pages/tv/TitleTv.jsx";

// ✅ TV: Player
import PlayerTv from "../pages/tv/PlayerTv.jsx";

import AdminRouter from "../pages/admin/AdminRouter.jsx";
import RequireAuth from "../components/auth/RequireAuth.jsx";

export const routes = [
  // =========
  // TV START
  // =========
  { path: "/", element: <Navigate to="/splash" replace />, targets: ["tv"] },
  { path: "/splash", element: <SplashTv />, targets: ["tv"] },
  { path: "/landing", element: <Navigate to="/login" replace />, targets: ["tv"] },
  { path: "/welcome", element: <TvWelcome />, targets: ["tv"] },
  { path: "/signup-tv", element: <SignupTv />, targets: ["tv"] },

  // =========
  // WEB ONLY
  // =========
  { path: "/", element: <Landing />, targets: ["web"] },
  { path: "/landing", element: <Landing />, targets: ["web"] },
  { path: "/tv", element: <TvPairWeb />, targets: ["web"] },

  // ✅ login entra por Entry (web/tv)
  { path: "/login", element: <LoginEntry />, targets: ["web", "tv"] },

  { path: "/signup", element: <Signup />, targets: ["web"] },
  { path: "/account/billing-return", element: <BillingReturn />, targets: ["web"] },
  { path: "/contato", element: <Contact />, targets: ["web"] },

  {
    path: "/admin/*",
    targets: ["web"],
    element: (
      <RequireAuth>
        <AdminRouter />
      </RequireAuth>
    ),
  },

  // =========
  // WEB + TV
  // =========
  {
    path: "/who",
    targets: ["web", "tv"],
    element: (
      <RequireAuth>
        <WhoEntry />
      </RequireAuth>
    ),
  },

  {
    path: "/browse",
    targets: ["web", "tv"],
    element: (
      <RequireAuth>
        <BrowseEntry />
      </RequireAuth>
    ),
  },

  {
    path: "/profiles",
    targets: ["web", "tv"],
    element: (
      <RequireAuth>
        <Profiles />
      </RequireAuth>
    ),
  },

  // ✅ WEB: Title
  {
    path: "/t/:id",
    targets: ["web"],
    element: (
      <RequireAuth>
        <Title />
      </RequireAuth>
    ),
  },

  // ✅ TV: Title
  {
    path: "/t/:id",
    targets: ["tv"],
    element: (
      <RequireAuth>
        <TitleTv />
      </RequireAuth>
    ),
  },

  // ✅ WEB: Player
  {
    path: "/watch/:id",
    targets: ["web"],
    element: (
      <RequireAuth>
        <Player />
      </RequireAuth>
    ),
  },

  // ✅ TV: Player
  {
    path: "/watch/:id",
    targets: ["tv"],
    element: (
      <RequireAuth>
        <PlayerTv />
      </RequireAuth>
    ),
  },

  { path: "*", element: <NotFound />, targets: ["web", "tv"] },
];
