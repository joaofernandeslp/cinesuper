// src/player/overlay.js
import { DEBUG } from "./env.js";

export function gateReasonText(reason) {
  if (reason === "blocked_title") return "Este título foi bloqueado neste perfil.";
  if (reason === "maturity") return "A classificação etária do título é maior que o limite do perfil.";
  if (reason === "genre") return "Este perfil não permite o gênero deste título.";
  return "Conteúdo bloqueado para este perfil.";
}

export function getMainTitle(item) {
  return item?.seriesTitle || item?.showTitle || item?.title || "";
}

export function getEpisodeLine(item) {
  const epNo = item?.episodeNumber ?? item?.episode ?? null;
  const seasonNo = item?.seasonNumber ?? item?.season ?? null;
  const mt = String(item?.media_type || item?.mediaType || "").trim().toLowerCase();
  const isCourse = mt === "course" || mt === "curso";

  const maybeEpisodeTitle = item?.episodeTitle || (item?.seriesTitle || item?.showTitle ? item?.title : "") || "";

  if (epNo == null && seasonNo == null) return "";

  const sPart = seasonNo != null ? `${isCourse ? "M" : "T"}${seasonNo}` : "";
  const ePart = epNo != null ? `E: ${epNo}` : "";
  const se = [sPart, ePart].filter(Boolean).join(" · ");

  if (maybeEpisodeTitle) return `Capítulo: ${maybeEpisodeTitle}${se ? ` · ${se}` : ""}`;
  return `Capítulo${se ? ` · ${se}` : ""}`;
}

export function getClassification(item) {
  const pick = (obj, keys) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return { key: k, value: v };
    }
    return { key: null, value: null };
  };

  const agePick = pick(item, [
    "maturity",
    "ratingAge",
    "ageRating",
    "contentRating",
    "classificationAge",
    "classificacao_idade",
    "classificacaoIdade",
    "idade_classificacao",
    "idadeClassificacao",
    "faixa_etaria",
    "faixaEtaria",
    "idade",
    "rating",
    "rated",
    "mpaa",
    "tvRating",
  ]);

  const descPick = pick(item, [
    "maturity_descriptors",
    "maturityDescriptors",
    "ratingDescriptors",
    "contentDescriptors",
    "classificationDescriptors",
    "classificacao_descritores",
    "classificacaoDescritores",
    "descritores",
    "descritores_classificacao",
    "descritoresClassificacao",
  ]);

  const normalizeAgeLabel = (v) => {
    if (v == null) return "";
    const s = String(v).trim();
    if (!s) return "";

    const m = s.match(/\d{1,2}/);
    if (m) return m[0];

    const low = s.toLowerCase();
    if (low === "l" || low.includes("livre")) return "L";

    return s.toUpperCase().replace(/\s+/g, "").slice(0, 10);
  };

  const age = normalizeAgeLabel(agePick.value);

  let descText = "";
  const raw = descPick.value;
  if (Array.isArray(raw)) descText = raw.filter(Boolean).map(String).join(", ");
  else if (typeof raw === "string") descText = raw.trim();
  else if (raw && typeof raw === "object") descText = Object.keys(raw).filter((k) => !!raw[k]).join(", ");

  if (DEBUG) {
    console.log("[PLAYER] classification computed:", {
      age,
      descText,
      foundAge: agePick.key,
      foundDesc: descPick.key,
      rawAge: agePick.value,
      rawDesc: descPick.value,
    });
  }

  return { age, descText };
}

export function pickBest1080pCapIndex(levels) {
  if (!Array.isArray(levels) || !levels.length) return -1;

  let cap = -1;
  for (let i = 0; i < levels.length; i++) {
    const h = Number(levels[i]?.height || 0);
    if (Number.isFinite(h) && h > 0 && h <= 1080) cap = i;
  }
  return cap;
}
