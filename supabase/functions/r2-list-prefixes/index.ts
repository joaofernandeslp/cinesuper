/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { S3Client, ListObjectsV2Command } from "npm:@aws-sdk/client-s3@3.536.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function corsHeaders(origin: string | null) {
  const allowOrigin = origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, content-type, apikey, x-client-info, x-supabase-authorization, x-supabase-api-version",
  };
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function ensurePrefix(p: string) {
  let s = String(p || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (s && !s.endsWith("/")) s += "/";
  return s;
}

serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, origin);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("ANON_KEY") || "";
    const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT") || "";
    const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") || "";
    const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
    const R2_BUCKET = Deno.env.get("R2_BUCKET") || "";

    if (!SUPABASE_URL || !ANON) return json({ ok: false, error: "Missing Supabase env" }, 500, origin);
    if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
      return json({ ok: false, error: "Missing R2 env" }, 500, origin);
    }

    const auth = req.headers.get("Authorization") || "";
    const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!accessToken) return json({ ok: false, error: "Missing Bearer token" }, 401, origin);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) return json({ ok: false, error: "Invalid session" }, 401, origin);

    const body = await req.json().catch(() => ({}));
    const prefixRaw = String(body?.prefix || "").trim();
    if (!prefixRaw) return json({ ok: false, error: "prefix obrigatório" }, 400, origin);
    const prefix = ensurePrefix(prefixRaw);

    const client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    const prefixes = new Set<string>();
    let token: string | undefined = undefined;

    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET,
          Prefix: prefix,
          Delimiter: "/",
          ContinuationToken: token,
        })
      );

      for (const p of res.CommonPrefixes || []) {
        const raw = String(p.Prefix || "");
        if (!raw.startsWith(prefix)) continue;
        const trimmed = raw.slice(prefix.length).replace(/\/+$/, "");
        if (trimmed) prefixes.add(trimmed);
      }

      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);

    return json({ ok: true, prefix, prefixes: Array.from(prefixes).sort() }, 200, origin);
  } catch (e) {
    return json({ ok: false, error: e?.message || "Unknown error" }, 500, origin);
  }
});
