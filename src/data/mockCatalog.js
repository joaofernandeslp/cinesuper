// src/data/mockCatalog.js
// OBS: Este arquivo agora NÃO guarda mais catálogo hardcoded.
// Ele fica apenas com utilitários (YouTube/hero) e rows (UI).
// O catálogo real deve vir do Supabase (ver src/lib/catalogApi.js).

function extractYouTubeId(input = "") {
  if (!input) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    const v = url.searchParams.get("v");
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

    if (url.pathname.includes("/embed/")) {
      const id = url.pathname.split("/embed/")[1]?.split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    return null;
  } catch {
    return null;
  }
}

export function buildYouTubeEmbedUrl(youtubeUrlOrId) {
  const id = extractYouTubeId(youtubeUrlOrId);
  if (!id) return null;

  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
    loop: "1",
    playlist: id,
  });

  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export function getHeroMedia(heroImageValue) {
  const yt = buildYouTubeEmbedUrl(heroImageValue);
  if (yt) return { type: "youtube", src: yt };
  return { type: "image", src: heroImageValue };
}

// Catálogo hardcoded foi removido (migrado para Supabase)
export const catalog = [];

export const rows = [
  { key: "continue", title: "Continuar assistindo", filter: () => false }, // será via watch_progress depois
  { key: "trending", title: "Em alta", filter: (t) => t.categories?.includes("Em alta") },
  { key: "new", title: "Novidades", filter: (t) => t.categories?.includes("Novidades") },
  { key: "rec", title: "Recomendados", filter: (t) => t.categories?.includes("Recomendados") },
  { key: "start", title: "Para começar", filter: (t) => t.categories?.includes("Para começar") },
];
