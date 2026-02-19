/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function pickEmail(payload: any): string {
  const candidates = [
    payload?.customer?.email,
    payload?.buyer?.email,
    payload?.client?.email,
    payload?.data?.customer?.email,
    payload?.data?.buyer?.email,
    payload?.data?.client?.email,
    payload?.payload?.customer?.email,
    payload?.payload?.buyer?.email,
    payload?.payload?.client?.email,
    payload?.email,
    payload?.data?.email,
    payload?.payload?.email,
  ];
  for (const v of candidates) {
    const s = String(v || "").trim().toLowerCase();
    if (s && s.includes("@")) return s;
  }
  return "";
}

function pickProductId(payload: any): string {
  const candidates = [
    payload?.product?.id,
    payload?.product_id,
    payload?.offer?.product_id,
    payload?.data?.product?.id,
    payload?.data?.product_id,
    payload?.data?.offer?.product_id,
    payload?.payload?.product?.id,
    payload?.payload?.product_id,
    payload?.payload?.offer?.product_id,
  ];
  for (const v of candidates) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}

function pickEvent(payload: any): string {
  const candidates = [
    payload?.event,
    payload?.type,
    payload?.name,
    payload?.custom_id,
    payload?.data?.event,
    payload?.data?.type,
    payload?.data?.name,
    payload?.data?.custom_id,
    payload?.payload?.event,
    payload?.payload?.type,
    payload?.payload?.name,
    payload?.payload?.custom_id,
  ];
  for (const v of candidates) {
    const s = String(v || "").trim().toLowerCase();
    if (s) return s;
  }
  return "";
}

function pickSecret(payload: any): string {
  const candidates = [payload?.secret, payload?.payload?.secret, payload?.data?.secret];
  for (const v of candidates) {
    const s = String(v || "").trim();
    if (s) return s;
  }
  return "";
}

// Plano -> limites (ajuste se quiser)
function entitlementsForPlan(plan: "prata" | "ouro" | "diamante") {
  if (plan === "prata") return { plan, max_quality: "1080p", max_screens: 2, max_profiles: 2 };
  if (plan === "ouro") return { plan, max_quality: "1080p", max_screens: 4, max_profiles: 4 };
  return { plan, max_quality: "4k", max_screens: 6, max_profiles: 6 };
}

function mapProductToPlan(productId: string) {
  const PRATA = String(Deno.env.get("CAKTO_PRODUCT_PRATA_ID") || "").trim();
  const OURO = String(Deno.env.get("CAKTO_PRODUCT_OURO_ID") || "").trim();
  const DIAMANTE = String(Deno.env.get("CAKTO_PRODUCT_DIAMANTE_ID") || "").trim();

  if (productId && PRATA && productId === PRATA) return "prata" as const;
  if (productId && OURO && productId === OURO) return "ouro" as const;
  if (productId && DIAMANTE && productId === DIAMANTE) return "diamante" as const;

  return null;
}

/**
 * Supabase JS v2 não tem getUserByEmail no admin.
 * Então fazemos lookup via listUsers paginado.
 */
async function getUserIdByEmail(admin: any, email: string) {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return "";

  const PER_PAGE = 1000;
  const MAX_PAGES = 25; // segurança

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`listUsers failed: ${error.message}`);

    const users = data?.users || [];
    const found = users.find((u: any) => String(u?.email || "").trim().toLowerCase() === target);
    if (found?.id) return found.id;

    // se veio menos que PER_PAGE, acabou a lista
    if (users.length < PER_PAGE) break;
  }

  return "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const EXPECTED_SECRET = Deno.env.get("CAKTO_WEBHOOK_SECRET") || "";

    if (!SUPABASE_URL || !SRK) {
      return json({ ok: false, error: "Missing secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const payload = await req.json().catch(() => ({}));

    // 1) valida secret do webhook (se configurado)
    if (EXPECTED_SECRET) {
      const incomingSecret = pickSecret(payload);
      if (!incomingSecret || incomingSecret !== EXPECTED_SECRET) {
        return json({ ok: false, error: "Invalid webhook secret" }, 401);
      }
    }

    const admin = createClient(SUPABASE_URL, SRK, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const event = pickEvent(payload);
    const email = pickEmail(payload);
    const productId = pickProductId(payload);

    // 2) log (best-effort)
    try {
      await admin.from("cakto_webhook_logs").insert({
        event,
        email,
        product_id: productId,
        payload,
      });
    } catch {
      // ignore
    }

    // 3) se não tiver email, não dá pra linkar usuário
    if (!email) return json({ ok: true, warning: "No email in payload", event }, 200);

    // 4) achar usuário pelo email (via listUsers)
    let userId = "";
    try {
      userId = await getUserIdByEmail(admin, email);
    } catch (e) {
      return json({ ok: false, error: e?.message || "Failed to lookup user by email" }, 500);
    }
    if (!userId) return json({ ok: true, warning: "User not found for email", email, event }, 200);

    // 5) só ativa entitlement quando for evento de aprovação
    const approved =
      event.includes("approved") ||
      event.includes("paid") ||
      event.includes("purchase_approved") ||
      event.includes("payment_approved");

    if (!approved) return json({ ok: true, note: "Event not activating entitlement", event }, 200);

    // 6) mapear produto -> plano
    const plan = mapProductToPlan(productId);
    if (!plan) {
      return json(
        { ok: true, warning: "Product not mapped to plan. Set CAKTO_PRODUCT_*_ID secrets.", productId, event },
        200
      );
    }

    const ent = entitlementsForPlan(plan);

    // 7) Upsert em user_entitlements
    const now = new Date().toISOString();
    const { error: upErr } = await admin
      .from("user_entitlements")
      .upsert(
        {
          user_id: userId,
          plan: ent.plan,
          max_quality: ent.max_quality,
          max_screens: ent.max_screens,
          max_profiles: ent.max_profiles,
          status: "active",
          updated_at: now,
        },
        { onConflict: "user_id" }
      );

    if (upErr) return json({ ok: false, error: `Failed to upsert user_entitlements: ${upErr.message}` }, 500);

    return json({
      ok: true,
      event,
      email,
      user_id: userId,
      plan: ent.plan,
      status: "active",
      warning: EXPECTED_SECRET ? undefined : "CAKTO_WEBHOOK_SECRET not set yet (set it ASAP)",
    });
  } catch (e) {
    return json({ ok: false, error: e?.message || "Unknown error" }, 500);
  }
});
