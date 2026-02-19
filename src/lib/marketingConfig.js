// src/lib/marketingConfig.js

function envStr(key, fallback = "") {
  const v = import.meta?.env?.[key];
  return v != null && String(v).trim() ? String(v).trim() : fallback;
}

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}

export const marketingConfig = {
  whatsappNumberE164: digitsOnly(envStr("VITE_CS_WHATSAPP_NUMBER_E164", "")) || "5514981117310",

  tv: {
    downloaderCode: envStr("VITE_CS_TV_DOWNLOADER_CODE", "4628736"),
    apkUrl: envStr("VITE_CS_TV_APK_URL", "http://app.cinesuper.com.br/apk_tv/app-debug.apk"),
    youtubeId: envStr("VITE_CS_TV_YT_ID", "EoQX1MDhX20"),
  },

  plans: {
    prata: {
      price: envStr("VITE_CS_PLAN_PRATA_M", "R$ 13,90/mês"),
      annualPrice: envStr("VITE_CS_PLAN_PRATA_A", "R$ 139,00/ano"),
      annualSubLabel: envStr("VITE_CS_PLAN_PRATA_A_SUB", "Equivale a R$ 11,58/mês"),
      annualBadge: envStr("VITE_CS_PLAN_PRATA_A_BADGE", "2 meses grátis"),
    },
    ouro: {
      price: envStr("VITE_CS_PLAN_OURO_M", "R$ 16,90/mês"),
      annualPrice: envStr("VITE_CS_PLAN_OURO_A", "R$ 169,00/ano"),
      annualSubLabel: envStr("VITE_CS_PLAN_OURO_A_SUB", "Equivale a R$ 14,08/mês"),
      annualBadge: envStr("VITE_CS_PLAN_OURO_A_BADGE", "2 meses grátis"),
    },
    diamante: {
      price: envStr("VITE_CS_PLAN_DIAMANTE_M", "R$ 19,90/mês"),
      annualPrice: envStr("VITE_CS_PLAN_DIAMANTE_A", "R$ 199,00/ano"),
      annualSubLabel: envStr("VITE_CS_PLAN_DIAMANTE_A_SUB", "Equivale a R$ 16,58/mês"),
      annualBadge: envStr("VITE_CS_PLAN_DIAMANTE_A_BADGE", "2 meses grátis"),
    },
  },
};
