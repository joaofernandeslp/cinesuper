/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { SignJWT } from "npm:jose@5.9.6";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* =========================
   CORS
========================= */
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://app.cinesuper.com.br",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-supabase-authorization, x-supabase-api-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function parseR2KeyFromUrl(u: string) {
  // Ex: https://pub-xxxx.r2.dev/Terror/Filmes/.../master.m3u8?v=...
  // => "Terror/Filmes/.../master.m3u8"
  const url = new URL(u);
  const path = decodeURIComponent(url.pathname || "").replace(/^\/+/, "");
  return path;
}

function dirOfKey(key: string) {
  const clean = String(key || "").replace(/\\/g, "/");
  const idx = clean.lastIndexOf("/");
  if (idx < 0) return "";
  return clean.slice(0, idx + 1); // com "/" no final
}

function isAllowedMasterUrl(masterUrl: string) {
  // Segurança mínima: só aceitar URLs r2.dev
  try {
    const u = new URL(masterUrl);
    if (u.protocol !== "https:") return false;
    if (!u.hostname.endsWith(".r2.dev")) return false;
    return true;
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SRK = Deno.env.get("SERVICE_ROLE_KEY") || "";
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("ANON_KEY") || "";
    const JWT_SECRET = Deno.env.get("PLAYBACK_JWT_SECRET") || "";

    const STREAM_BASE =
      Deno.env.get("STREAM_BASE") ||
      "https://still-poetry-330dcinesuper-stream.cinesuper.workers.dev";

    if (!SUPABASE_URL || !SRK || !ANON || !JWT_SECRET) {
      return json({ ok: false, error: "Missing secrets" }, 500);
    }

    const auth = req.headers.get("Authorization") || "";
    const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!accessToken) return json({ ok: false, error: "Missing Bearer token" }, 401);

    const body = await req.json().catch(() => ({}));

    const titleId = String(body?.titleId || "").trim();
    const allow4kRequested = !!body?.allow4k;
    const masterUrl = String(body?.masterUrl || "").trim();
    const deviceKey = String(body?.deviceKey || "").trim();

    if (!titleId) return json({ ok: false, error: "Missing titleId" }, 400);
    if (!masterUrl) return json({ ok: false, error: "Missing masterUrl" }, 400);
    if (!isAllowedMasterUrl(masterUrl)) {
      return json({ ok: false, error: "masterUrl not allowed (must be https://*.r2.dev/...)" }, 400);
    }

    // identifica usuário pela sessão
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const userId = userData?.user?.id || "";
    if (userErr || !userId) return json({ ok: false, error: "Invalid session" }, 401);

    // entitlement
    const admin = createClient(SUPABASE_URL, SRK, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: ent, error: entErr } = await admin
      .from("user_entitlements")
      .select("status, max_quality, max_screens")
      .eq("user_id", userId)
      .maybeSingle();

    if (entErr) return json({ ok: false, error: entErr.message }, 500);
    if (!ent || ent.status !== "active") return json({ ok: false, error: "No active plan" }, 403);

    const maxDevices = Number(ent?.max_screens || 0);

    if (deviceKey && maxDevices > 0) {
      const { data: existingDev, error: dErr } = await admin
        .from("user_devices")
        .select("id,is_revoked")
        .eq("user_id", userId)
        .eq("device_key", deviceKey)
        .maybeSingle();

      if (dErr) return json({ ok: false, error: dErr.message }, 500);

      if (existingDev?.is_revoked) {
        return json({ ok: false, error: "Device revoked" }, 403);
      }

      if (!existingDev?.id) {
        const { data: devs, error: listErr } = await admin
          .from("user_devices")
          .select("id")
          .eq("user_id", userId)
          .eq("is_revoked", false);

        if (listErr) return json({ ok: false, error: listErr.message }, 500);

        const count = Array.isArray(devs) ? devs.length : 0;
        if (count >= maxDevices) {
          return json(
            {
              ok: false,
              error: "Device limit reached",
              limit: maxDevices,
              count,
            },
            403
          );
        }
      }
    }

    const allow4k =
      allow4kRequested && String(ent?.max_quality || "").toLowerCase() === "4k";

    // ✅ extrai caminho real do R2
    const masterKey = parseR2KeyFromUrl(masterUrl);
    const basePrefix = dirOfKey(masterKey);

    if (!masterKey || !basePrefix) {
      return json({ ok: false, error: "Could not parse R2 key/basePrefix from masterUrl" }, 400);
    }

    // token 1h
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60;

    const token = await new SignJWT({
      titleId,
      maxQuality: allow4k ? "4k" : "1080p",
      masterKey,
      basePrefix,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(new TextEncoder().encode(JWT_SECRET));

    // “fachada” fixa
    const master = `${STREAM_BASE}/v/${encodeURIComponent(titleId)}/master.m3u8?t=${encodeURIComponent(token)}`;
    const thumbs = `${STREAM_BASE}/v/${encodeURIComponent(titleId)}/thumbs/thumbnails.vtt?t=${encodeURIComponent(token)}`;

    return json({ ok: true, titleId, allow4k, master, thumbs, exp });
  } catch (e) {
    return json({ ok: false, error: e?.message || "Unknown error" }, 500);
  }
});
