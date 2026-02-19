/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function ok() {
  return new Response("OK", { status: 200 });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseStripeSignature(header: string) {
  const parts = String(header || "").split(",");
  const parsed: Record<string, string[]> = {};
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (!k || !v) continue;
    if (!parsed[k]) parsed[k] = [];
    parsed[k].push(v);
  }
  const t = parsed["t"]?.[0] || "";
  const v1 = parsed["v1"]?.[0] || "";
  return { t, v1 };
}

async function stripeRequest(method: "GET" | "POST", path: string) {
  const key = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || "Stripe request failed";
    throw new Error(msg);
  }
  return data;
}

function entitlementsForPlan(plan: string) {
  if (plan === "prata") return { plan, max_quality: "1080p", max_screens: 2, max_profiles: 2 };
  if (plan === "ouro") return { plan, max_quality: "1080p", max_screens: 4, max_profiles: 4 };
  return { plan, max_quality: "4k", max_screens: 6, max_profiles: 6 };
}

serve(async (req) => {
  try {
    const SIGNING_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SIGNING_SECRET || !SUPABASE_URL || !SRK) return ok();

    const sigHeader = req.headers.get("Stripe-Signature") || "";
    const { t, v1 } = parseStripeSignature(sigHeader);
    if (!t || !v1) return ok();

    const rawBody = await req.text();
    const signedPayload = `${t}.${rawBody}`;
    const expected = await hmacHex(SIGNING_SECRET, signedPayload);
    if (!timingSafeEqual(expected, v1)) return ok();

    const event = JSON.parse(rawBody);
    const type = String(event?.type || "").toLowerCase();

    const admin = createClient(SUPABASE_URL, SRK, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
      const invoice = event?.data?.object || {};
      const subId = String(invoice?.subscription || "");
      if (!subId) return ok();

      const sub = await stripeRequest("GET", `subscriptions/${subId}`);
      const meta = sub?.metadata || {};
      const userId = String(meta?.user_id || "");
      const plan = String(meta?.plan || "").toLowerCase();
      const cycle = String(meta?.cycle || "");

      if (!userId || !plan) return ok();

      const ent = entitlementsForPlan(plan);
      await admin.from("user_entitlements").upsert(
        {
          user_id: userId,
          status: "active",
          plan: ent.plan,
          cycle,
          max_screens: ent.max_screens,
          max_profiles: ent.max_profiles,
          max_quality: ent.max_quality,
          expires_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      return ok();
    }

    if (type === "customer.subscription.deleted" || type === "customer.subscription.updated") {
      const sub = event?.data?.object || {};
      const status = String(sub?.status || "").toLowerCase();
      const meta = sub?.metadata || {};
      const userId = String(meta?.user_id || "");
      const plan = String(meta?.plan || "").toLowerCase();
      const cycle = String(meta?.cycle || "");

      if (!userId || !plan) return ok();

      const active = status === "active" || status === "trialing";
      if (active) return ok();

      const ent = entitlementsForPlan(plan);
      await admin.from("user_entitlements").upsert(
        {
          user_id: userId,
          status: "inactive",
          plan: ent.plan,
          cycle,
          max_screens: ent.max_screens,
          max_profiles: ent.max_profiles,
          max_quality: ent.max_quality,
          expires_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      return ok();
    }

    return ok();
  } catch {
    return ok();
  }
});
