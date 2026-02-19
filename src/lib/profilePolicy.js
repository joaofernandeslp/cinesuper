// src/lib/profilePolicy.js
import { supabase } from "./supabaseClient.js";

function normId(x) {
  return String(x || "").trim();
}

function normStr(x) {
  return String(x || "").trim();
}

function normLower(x) {
  return normStr(x).toLowerCase();
}

/**
 * Retorna:
 * - userId
 * - profile (perfil ativo)
 * - blockedPublicIds (Set)
 */
export async function getActiveProfileContext() {
  const { data: udata } = await supabase.auth.getUser();
  const user = udata?.user;
  if (!user?.id) return { userId: "", profile: null, blockedPublicIds: new Set() };

  const key = `cs_active_profile:${user.id}`;
  let activeProfileId = "";
  try {
    activeProfileId = normId(localStorage.getItem(key));
  } catch {}

  // ✅ inclui o novo campo kids_allowed_genres
  // mantém compat com os antigos (genre_policy / allowed_genres)
  const selectCols =
    "id,user_id,name,is_kids,maturity_limit,require_pin,pin_set,kids_allowed_genres,genre_policy,allowed_genres,created_at";

  // 1) tenta carregar o perfil ativo pelo id salvo
  let profile = null;
  if (activeProfileId) {
    const { data } = await supabase
      .from("user_profiles")
      .select(selectCols)
      .eq("id", activeProfileId)
      .maybeSingle();
    if (data) profile = data;
  }

  // 2) fallback: primeiro perfil do usuário
  if (!profile) {
    const { data } = await supabase
      .from("user_profiles")
      .select(selectCols)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data) {
      profile = data;
      try {
        localStorage.setItem(key, profile.id);
      } catch {}
    }
  }

  // 3) bloqueios -> Set de public_id (porque no app item.id geralmente é public_id)
  const blockedPublicIds = new Set();
  if (profile?.id) {
    const { data } = await supabase
      .from("profile_blocked_titles")
      .select("title_id, titles:titles(public_id)")
      .eq("profile_id", profile.id);

    if (Array.isArray(data)) {
      for (const r of data) {
        const pid = normId(r?.titles?.public_id);
        if (pid) blockedPublicIds.add(pid);
      }
    }
  }

  return { userId: user.id, profile, blockedPublicIds };
}

/**
 * Usa as categorias do título como "gêneros" do seu catálogo.
 * (Você já está usando categories no Browse/Title normalize)
 */
export function titleGenres(title) {
  const cats = Array.isArray(title?.categories) ? title.categories : [];
  return cats.map((c) => normStr(c)).filter(Boolean);
}

/**
 * Regra genérica (compatibilidade):
 * - profile.allowed_genres + profile.genre_policy ("allow"|"block")
 */
export function isGenreAllowed(profile, title) {
  const list = profile?.allowed_genres;

  // sem restrição
  if (!Array.isArray(list) || list.length === 0) return true;

  const policy = normLower(profile?.genre_policy || "allow");
  const set = new Set(list.map((s) => normLower(s)));

  const genres = titleGenres(title).map((g) => g.toLowerCase());
  const hasAny = genres.some((g) => set.has(g));

  if (policy === "block") return !hasAny;
  return hasAny; // allow
}

/**
 * ✅ Regra Kids (nova):
 * - se profile.is_kids e kids_allowed_genres tiver itens:
 *   exige interseção entre categories do title e kids_allowed_genres
 * - se kids_allowed_genres vazio/null: não restringe por gênero (apenas maturity + bloqueios etc)
 */
export function isKidsGenreAllowed(profile, title) {
  if (!profile?.is_kids) return true;

  const allowed = profile?.kids_allowed_genres;
  if (!Array.isArray(allowed) || allowed.length === 0) return true;

  const allowSet = new Set(allowed.map((s) => normLower(s)));
  const genres = titleGenres(title).map((g) => normLower(g));

  // se o título não tem categoria, por segurança bloqueia (Kids) quando há lista definida
  if (!genres.length) return false;

  return genres.some((g) => allowSet.has(g));
}

/**
 * Checagem principal:
 * - bloqueios por título (public_id)
 * - maturidade
 * - Kids gênero
 * - regra genérica allow/block (se você usar)
 */
export function checkTitleAccess({ profile, title, blockedPublicIds }) {
  const publicId = normId(title?.id); // no seu app, geralmente é public_id

  if (blockedPublicIds?.has?.(publicId)) return { ok: false, reason: "blocked_title" };

  const tMat = Number(title?.maturity ?? 18);
  const limit = Number(profile?.maturity_limit ?? 18);
  if (Number.isFinite(tMat) && Number.isFinite(limit) && tMat > limit) {
    return { ok: false, reason: "maturity" };
  }

  // ✅ Kids: gêneros permitidos
  if (!isKidsGenreAllowed(profile, title)) return { ok: false, reason: "kids_genre" };

  // (opcional/compat) allow/block de gêneros genérico
  if (!isGenreAllowed(profile, title)) return { ok: false, reason: "genre" };

  return { ok: true, reason: "" };
}

export function canUnlockWithPin(profile) {
  const hasPin = profile?.pin_set === true;
  return !!(profile?.require_pin && hasPin);
}

export async function verifyPin(profile, input) {
  const pid = String(profile?.id || "").trim();
  const pin = String(input || "").replace(/\D/g, "");
  if (!pid || pin.length < 4) return false;

  try {
    const { data, error } = await supabase.rpc("verify_profile_pin", {
      profile_id: pid,
      pin,
    });

    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

export function unlockKey(profileId, titlePublicId) {
  return `cs_unlock:${normId(profileId)}:${normId(titlePublicId)}`;
}

export function isUnlocked(profileId, titlePublicId) {
  try {
    return sessionStorage.getItem(unlockKey(profileId, titlePublicId)) === "1";
  } catch {
    return false;
  }
}

export function setUnlocked(profileId, titlePublicId) {
  try {
    sessionStorage.setItem(unlockKey(profileId, titlePublicId), "1");
  } catch {}
}
