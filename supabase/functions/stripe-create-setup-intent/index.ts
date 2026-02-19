/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getAuthToken(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function stripeRequest(method: "GET" | "POST", path: string, params?: URLSearchParams) {
  const key = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");

  const base = "https://api.stripe.com/v1/";
  const url = method === "GET" && params ? `${base}${path}?${params.toString()}` : `${base}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method === "POST" ? params : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || "Stripe request failed";
    throw new Error(msg);
  }
  return data;
}

async function findOrCreateCustomer(email: string, userId: string) {
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (cleanEmail) {
    const search = new URLSearchParams();
    search.set("email", cleanEmail);
    search.set("limit", "1");
    const list = await stripeRequest("GET", "customers", search);
    if (list?.data?.length) return String(list.data[0].id || "");
  }

  const params = new URLSearchParams();
  if (cleanEmail) params.set("email", cleanEmail);
  if (userId) params.set("metadata[supabase_user_id]", userId);

  const created = await stripeRequest("POST", "customers", params);
  return String(created?.id || "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SRK) {
      return json({ ok: false, error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const token = getAuthToken(req);
    if (!token) return json({ ok: false, error: "Missing Authorization token" }, 401);

    const admin = createClient(SUPABASE_URL, SRK, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return json({ ok: false, error: "Invalid session" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || userData.user.email || "").trim();

    const customerId = await findOrCreateCustomer(email, userData.user.id);
    if (!customerId) {
      return json({ ok: false, error: "Failed to create Stripe customer" }, 500);
    }

    const params = new URLSearchParams();
    params.set("customer", customerId);
    params.set("usage", "off_session");
    params.set("payment_method_types[0]", "card");
    params.set("metadata[user_id]", userData.user.id);

    const si = await stripeRequest("POST", "setup_intents", params);
    const clientSecret = String(si?.client_secret || "");
    if (!clientSecret) return json({ ok: false, error: "Missing client_secret in SetupIntent" }, 500);

    return json({
      ok: true,
      client_secret: clientSecret,
      customer_id: customerId,
      setup_intent_id: si?.id,
    });
  } catch (e) {
    return json({ ok: false, error: e?.message || "Unknown error" }, 500);
  }
});
