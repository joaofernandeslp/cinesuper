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

function planPriceMap() {
  return {
    prata: {
      mensal: Deno.env.get("STRIPE_PRICE_PRATA_MENSAL") || "",
      anual: Deno.env.get("STRIPE_PRICE_PRATA_ANUAL") || "",
    },
    ouro: {
      mensal: Deno.env.get("STRIPE_PRICE_OURO_MENSAL") || "",
      anual: Deno.env.get("STRIPE_PRICE_OURO_ANUAL") || "",
    },
    diamante: {
      mensal: Deno.env.get("STRIPE_PRICE_DIAMANTE_MENSAL") || "",
      anual: Deno.env.get("STRIPE_PRICE_DIAMANTE_ANUAL") || "",
    },
  } as const;
}

function normalizeCycle(cycle: string) {
  const c = String(cycle || "").toLowerCase();
  return c === "anual" ? "anual" : "mensal";
}

function priceFor(plan: string, cycle: string) {
  const map = planPriceMap();
  const p = String(plan || "").toLowerCase() as keyof typeof map;
  const c = normalizeCycle(cycle) as "mensal" | "anual";
  return map?.[p]?.[c] || "";
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

async function fetchInvoiceWithIntent(invoiceId: string) {
  if (!invoiceId) return null;
  const params = new URLSearchParams();
  params.append("expand[]", "payment_intent");
  return await stripeRequest("GET", `invoices/${invoiceId}`, params);
}

async function finalizeInvoice(invoiceId: string) {
  if (!invoiceId) return null;
  const params = new URLSearchParams();
  params.set("auto_advance", "true");
  try {
    return await stripeRequest("POST", `invoices/${invoiceId}/finalize`, params);
  } catch {
    return null;
  }
}

async function payInvoice(invoiceId: string, paymentMethodId: string) {
  if (!invoiceId || !paymentMethodId) return null;
  const params = new URLSearchParams();
  params.set("payment_method", paymentMethodId);
  params.append("expand[]", "payment_intent");
  try {
    return await stripeRequest("POST", `invoices/${invoiceId}/pay`, params);
  } catch {
    return null;
  }
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
    const plan = String(body?.plan || "").toLowerCase();
    const cycle = normalizeCycle(body?.cycle || "mensal");
    const promo = String(body?.promo || "").trim();
    const email = String(body?.email || userData.user.email || "").trim();
    const paymentMethodId = String(body?.payment_method_id || "").trim();

    const priceId = priceFor(plan, cycle);
    if (!priceId) {
      return json({ ok: false, error: "Invalid plan/cycle or missing Stripe price ID" }, 400);
    }

    const customerId = await findOrCreateCustomer(email, userData.user.id);
    if (!customerId) {
      return json({ ok: false, error: "Failed to create Stripe customer" }, 500);
    }

    const params = new URLSearchParams();
    params.set("customer", customerId);
    params.set("items[0][price]", priceId);
    params.set("collection_method", "charge_automatically");
    params.set("payment_behavior", "default_incomplete");
    params.set("payment_settings[save_default_payment_method]", "on_subscription");
    params.set("payment_settings[payment_method_types][0]", "card");
    if (paymentMethodId) params.set("default_payment_method", paymentMethodId);
    params.append("expand[]", "latest_invoice");
    params.append("expand[]", "latest_invoice.payment_intent");

    params.set("metadata[user_id]", userData.user.id);
    params.set("metadata[plan]", plan);
    params.set("metadata[cycle]", cycle);
    if (promo && cycle === "mensal") params.set("metadata[promo]", promo);

    const promoCoupon = Deno.env.get("STRIPE_COUPON_PROMO_ID") || "";
    if (promo && cycle === "mensal" && promoCoupon) {
      params.set("discounts[0][coupon]", promoCoupon);
    }

    const sub = await stripeRequest("POST", "subscriptions", params);
    let clientSecret = sub?.latest_invoice?.payment_intent?.client_secret || "";
    const latestInvoice = sub?.latest_invoice;
    const latestInvoiceId =
      typeof latestInvoice === "string" ? latestInvoice : String(latestInvoice?.id || "");

    if (!clientSecret && typeof latestInvoice === "string") {
      try {
        const invoice = await fetchInvoiceWithIntent(latestInvoice);
        clientSecret = invoice?.payment_intent?.client_secret || "";
      } catch {}
    }

    if (!clientSecret && latestInvoiceId) {
      try {
        await finalizeInvoice(latestInvoiceId);
        const invoice = await fetchInvoiceWithIntent(latestInvoiceId);
        clientSecret = invoice?.payment_intent?.client_secret || "";
      } catch {}
    }

    if (!clientSecret && latestInvoiceId && paymentMethodId) {
      try {
        const paid = await payInvoice(latestInvoiceId, paymentMethodId);
        clientSecret = paid?.payment_intent?.client_secret || "";
      } catch {}
    }

    if (!clientSecret) {
      return json({
        ok: true,
        client_secret: null,
        warning: "Missing client_secret in Stripe response. Subscription created; payment will be attempted automatically.",
        sub_status: sub?.status,
        latest_invoice: latestInvoice || null,
        subscription_id: sub?.id,
        customer_id: customerId,
      });
    }

    return json({
      ok: true,
      client_secret: clientSecret,
      subscription_id: sub?.id,
      customer_id: customerId,
    });
  } catch (e) {
    return json({ ok: false, error: e?.message || "Unknown error" }, 500);
  }
});
