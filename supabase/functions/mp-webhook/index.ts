/// <reference lib="deno.ns" />
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function ok() { return new Response("OK", { status: 200 }); }

function entitlementsForPlan(plan: string) {
  if (plan === "prata") return { plan, max_quality: "1080p", max_screens: 2, max_profiles: 2 };
  if (plan === "ouro") return { plan, max_quality: "1080p", max_screens: 4, max_profiles: 4 };
  return { plan, max_quality: "4k", max_screens: 6, max_profiles: 6 };
}

function parseExternalRef(ref: string) {
  const parts = String(ref || "").split("|");
  if (parts.length < 3) return null;
  const [userId, planRaw, cycleRaw] = parts;
  const plan = String(planRaw || "").toLowerCase();
  const cycle = String(cycleRaw || "").toLowerCase() === "anual" ? "anual" : "mensal";
  if (!userId || !plan) return null;
  return { userId, plan, cycle };
}

serve(async (req) => {
  const isDebug = new URL(req.url).searchParams.get("debug") === "1";
  const json = (data: unknown) =>
    new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });

  try {
    const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!MP_ACCESS_TOKEN || !SUPABASE_URL || !SRK) {
      console.error("[mp-webhook] Missing secrets", {
        hasToken: !!MP_ACCESS_TOKEN,
        hasUrl: !!SUPABASE_URL,
        hasSrk: !!SRK,
      });
      return isDebug ? json({ ok: false, error: "Missing secrets" }) : ok();
    }

    const admin = createClient(SUPABASE_URL, SRK);

    const payload = await req.json().catch(() => ({}));

    // MP envia type/topic e data.id em webhooks :contentReference[oaicite:9]{index=9}
    const type = String(payload?.type || payload?.topic || "").toLowerCase();
    const dataId = String(payload?.data?.id || payload?.id || "");

    console.log("[mp-webhook] incoming", { type, dataId });
    if (!dataId) return isDebug ? json({ ok: false, error: "Missing data.id" }) : ok();

    // PIX: eventos do tipo payment
    if (type.includes("payment")) {
      const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const payJson = await payRes.json().catch(() => ({}));
      console.log("[mp-webhook] payment lookup", { ok: payRes.ok, status: payRes.status });
      if (!payRes.ok) return isDebug ? json({ ok: false, error: "Payment lookup failed", status: payRes.status }) : ok();

      const status = String(payJson?.status || "").toLowerCase();
      const paymentMethod = String(payJson?.payment_method_id || "").toLowerCase();
      const externalRef = String(payJson?.external_reference || "");

      console.log("[mp-webhook] payment data", { status, paymentMethod, externalRef });

      if (paymentMethod && paymentMethod !== "pix") {
        return isDebug ? json({ ok: false, error: "Not pix", paymentMethod }) : ok();
      }
      if (status !== "approved") {
        return isDebug ? json({ ok: false, error: "Not approved", status }) : ok();
      }

      const parsed = parseExternalRef(externalRef);
      if (!parsed) {
        console.error("[mp-webhook] invalid external_reference", { externalRef });
        return isDebug ? json({ ok: false, error: "Invalid external_reference", externalRef }) : ok();
      }

      const { userId, plan, cycle } = parsed;
      const ent = entitlementsForPlan(plan);

      const now = new Date();
      const days = cycle === "anual" ? 365 : 30;
      const exp = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

      const { error: upsertErr } = await admin.from("user_entitlements").upsert(
        {
          user_id: userId,
          status: "active",
          plan: ent.plan,
          cycle,
          max_screens: ent.max_screens,
          max_profiles: ent.max_profiles,
          max_quality: ent.max_quality,
          expires_at: exp,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (upsertErr) {
        console.error("[mp-webhook] entitlement upsert error", { upsertErr, userId, plan, cycle });
        return isDebug ? json({ ok: false, error: "Upsert failed", details: upsertErr }) : ok();
      }

      console.log("[mp-webhook] entitlement upserted", { userId, plan, cycle });
      return isDebug ? json({ ok: true, userId, plan, cycle }) : ok();
    }

    // Assinaturas (preapproval)
    // busca detalhes da assinatura (preapproval)
    const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const mpJson = await mpRes.json();
    if (!mpRes.ok) return isDebug ? json({ ok: false, error: "Preapproval lookup failed", status: mpRes.status }) : ok();

    const preapprovalId = String(mpJson?.id || "");
    const status = String(mpJson?.status || "").toLowerCase(); // authorized/paused/cancelled/pending...
    const externalRef = String(mpJson?.external_reference || ""); // nosso mp_subscriptions.id

    if (!externalRef) return isDebug ? json({ ok: false, error: "Missing external_reference" }) : ok();

    // atualiza mp_subscriptions
    const { data: subRow } = await admin
      .from("mp_subscriptions")
      .select("*")
      .eq("id", externalRef)
      .maybeSingle();

    if (!subRow) return isDebug ? json({ ok: false, error: "Subscription not found", externalRef }) : ok();

    await admin
      .from("mp_subscriptions")
      .update({ mp_preapproval_id: preapprovalId, mp_status: status, mp_init_point: String(mpJson?.init_point || "") })
      .eq("id", externalRef);

    // aplica entitlement
    // Se autorizado => active; senão => inactive
    const active = status === "authorized";

    // expire simplificado (depois refinamos com datas do MP)
    const now = new Date();
    const days = subRow.cycle === "anual" ? 365 : 30;
    const exp = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const plan = subRow.plan; // prata|ouro|diamante
    const ent = entitlementsForPlan(plan);

    const { error: upsertErr } = await admin.from("user_entitlements").upsert({
      user_id: subRow.user_id,
      status: active ? "active" : "inactive",
      plan,
      cycle: subRow.cycle,
      max_screens: ent.max_screens,
      max_profiles: ent.max_profiles,
      max_quality: ent.max_quality,
      expires_at: active ? exp : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    if (upsertErr) {
      console.error("[mp-webhook] entitlement upsert error (preapproval)", { upsertErr });
      return isDebug ? json({ ok: false, error: "Upsert failed", details: upsertErr }) : ok();
    }

    return isDebug ? json({ ok: true, userId: subRow.user_id, plan, cycle: subRow.cycle }) : ok();
  } catch {
    return isDebug ? json({ ok: false, error: "Unhandled error" }) : ok();
  }
});
