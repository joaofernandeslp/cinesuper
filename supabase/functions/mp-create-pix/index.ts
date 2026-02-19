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

function normalizeCycle(cycle: string) {
  const c = String(cycle || "").toLowerCase();
  return c === "anual" ? "anual" : "mensal";
}

function amountFor(plan: string, cycle: string, promo: string) {
  const p = String(plan || "").toLowerCase();
  const c = normalizeCycle(cycle);

  const table = {
    prata: { mensal: 18.9, mensalPromo: 18.9, anual: 189.9 },
    ouro: { mensal: 22.9, mensalPromo: 22.9, anual: 229.9 },
    diamante: { mensal: 26.9, mensalPromo: 26.9, anual: 269.9 },
  } as const;

  const row = (table as any)[p];
  if (!row) return 0;

  if (c === "anual") return row.anual;
  if (promo) return row.mensalPromo;
  return row.mensal;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SRK) {
      return json({ ok: false, error: "Missing secrets" }, 500);
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
    const email = String(body?.email || userData.user.email || "").trim().toLowerCase();

    const amount = amountFor(plan, cycle, promo && cycle === "mensal" ? promo : "");
    if (!amount) return json({ ok: false, error: "Invalid plan/cycle amount" }, 400);

    const externalReference = `${userData.user.id}|${plan}|${cycle}|${promo ? "promo" : "normal"}`;

    const payload = {
      transaction_amount: Number(amount),
      description: `CineSuper ${plan} (${cycle})`,
      payment_method_id: "pix",
      payer: { email },
      external_reference: externalReference,
    };

    const idempotencyKey = `${userData.user.id}-${plan}-${cycle}-${Date.now()}`;

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    const mpJson = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok) {
      const msg = mpJson?.message || mpJson?.error || "Mercado Pago error";
      return json({ ok: false, error: msg }, 500);
    }

    const tx = mpJson?.point_of_interaction?.transaction_data || {};
    return json({
      ok: true,
      payment_id: mpJson?.id,
      status: mpJson?.status,
      qr_code: tx?.qr_code || "",
      qr_code_base64: tx?.qr_code_base64 || "",
    });
  } catch (e) {
    return json({ ok: false, error: e?.message || "Unknown error" }, 500);
  }
});
