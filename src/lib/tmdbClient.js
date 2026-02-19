// src/lib/tmdbClient.js
import { supabase } from "./supabaseClient.js";

const IMDB_RE = /^tt\d{5,}$/i;

function normalizeInvokeError(err) {
  // Supabase JS pode retornar erros diferentes para Edge Functions
  if (!err) return new Error("Falha desconhecida ao chamar a Edge Function.");

  // Alguns erros vêm como objetos (FunctionsHttpError / FunctionsFetchError / etc)
  const msg =
    err.message ||
    err.name ||
    (typeof err === "string" ? err : "") ||
    "Falha ao chamar a Edge Function.";

  return new Error(msg);
}

/**
 * Chama a Edge Function `tmdb-enrich` passando imdbId.
 * Espera um retorno como:
 * { ok: true, imdbId, tmdb:{id,type}, data:{...} }
 *
 * O campo data pode conter:
 * - title, year, synopsis, tags, thumbUrl, backdropUrl
 * - e opcionalmente: categories, cast, director, creators, etc.
 */
export async function tmdbEnrichByImdb(imdbId) {
  const clean = String(imdbId || "").trim();

  if (!IMDB_RE.test(clean)) {
    throw new Error("Informe um IMDB ID válido. Ex: tt4574334");
  }

  const { data, error } = await supabase.functions.invoke("tmdb-enrich", {
    body: { imdbId: clean },
  });

  if (error) {
    throw normalizeInvokeError(error);
  }

  if (!data) {
    throw new Error("TMDB enrich falhou: resposta vazia da Edge Function.");
  }

  if (data?.ok !== true) {
    // A função pode devolver { error: "...", ... }
    throw new Error(data?.error || "TMDB enrich falhou.");
  }

  // Segurança: garante o shape mínimo
  return {
    ok: true,
    imdbId: data.imdbId || clean,
    tmdb: data.tmdb || null,
    data: data.data || {},
  };
}
