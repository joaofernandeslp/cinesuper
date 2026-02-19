// src/lib/playbackPolicy.js

function normalizePlan(raw) {
  const s = String(raw || "").trim().toLowerCase();

  // tolerância para variações comuns
  if (s === "prata" || s === "silver") return "prata";
  if (s === "ouro" || s === "gold") return "ouro";
  if (s === "diamante" || s === "diamond") return "diamante";

  return "";
}

function parseBoolFromStorage(v) {
  if (v == null) return null;
  const s = String(v).trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes" || s === "y") return true;
  if (s === "0" || s === "false" || s === "no" || s === "n") return false;
  return null;
}

export function getPlan() {
  return normalizePlan(localStorage.getItem("cs_plan"));
}

export function getAllow4k() {
  // Prioridade 1: flag direta (pra testes rápidos)
  // Aceita: "1"/"0", "true"/"false"
  const allowOverride = parseBoolFromStorage(localStorage.getItem("cs_allow4k"));
  if (allowOverride !== null) return allowOverride;

  // Prioridade 2: plano
  const plan = getPlan();
  if (!plan) return false;

  // REGRA OFICIAL:
  // - Prata: até 1080p
  // - Ouro: até 1080p
  // - Diamante: até 4K
  return plan === "diamante";
}

/**
 * (Opcional, mas recomendado) retorna um perfil de capacidades do plano.
 * Isso te ajuda depois a aplicar:
 * - telas simultâneas
 * - perfis
 * - qualidade máxima
 */
export function getPlanCapabilities() {
  const plan = getPlan();

  // fallback conservador
  const caps = {
    plan: plan || "prata",
    maxScreens: 2,
    maxProfiles: 2,
    maxQuality: "1080p", // "1080p" | "4k"
    allow4k: false,
  };

  if (plan === "ouro") {
    return { ...caps, plan, maxScreens: 4, maxProfiles: 4, maxQuality: "1080p", allow4k: false };
  }

  if (plan === "diamante") {
    return { ...caps, plan, maxScreens: 6, maxProfiles: 6, maxQuality: "4k", allow4k: true };
  }

  // prata ou desconhecido
  return { ...caps, plan: plan || "prata" };
}
