// src/pages/tv/components/TvPreviewOverlay.jsx
import React, { useMemo } from "react";
import { Play, Check, Plus } from "lucide-react";

function cx(...a) {
  return a.filter(Boolean).join(" ");
}

/* ===== trailer helpers (somente para QR) ===== */
function cleanYtId(x) {
  const s = String(x || "").trim();
  if (!s) return "";
  return s.split("?")[0].split("&")[0].split("#")[0].trim();
}

function extractYouTubeId(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (raw.toLowerCase().startsWith("yt:")) return cleanYtId(raw.slice(3).trim());

  try {
    const u = new URL(raw);

    if (u.hostname.includes("youtu.be")) {
      const parts = (u.pathname || "").split("/").filter(Boolean);
      return cleanYtId(parts[0] || "");
    }

    const v = u.searchParams.get("v");
    if (v) return cleanYtId(v);

    const parts = (u.pathname || "").split("/").filter(Boolean);
    const embedIdx = parts.indexOf("embed");
    if (embedIdx >= 0 && parts[embedIdx + 1]) return cleanYtId(parts[embedIdx + 1]);
    const shortsIdx = parts.indexOf("shorts");
    if (shortsIdx >= 0 && parts[shortsIdx + 1]) return cleanYtId(parts[shortsIdx + 1]);
    const liveIdx = parts.indexOf("live");
    if (liveIdx >= 0 && parts[liveIdx + 1]) return cleanYtId(parts[liveIdx + 1]);

    return "";
  } catch {
    const id = cleanYtId(raw);
    return id.length >= 8 ? id : "";
  }
}

export default function TvPreviewOverlay({
  open,
  item,

  // foco (0=Assistir, 1=Minha Lista)
  focusIndex = -1,
  setBtnRef,

  inWatchlist = false,
  listBusy = false,

  onPlay,
  onToggleList,
  onClose,
}) {
  const title = useMemo(() => String(item?.title || ""), [item?.title]);
  const synopsis = useMemo(() => String(item?.synopsis || "").trim(), [item?.synopsis]);

  const meta = useMemo(() => {
    return [
      item?.year ? String(item.year) : "",
      item?.maturity ? String(item.maturity) : "",
      item?.duration ? String(item.duration) : "",
    ]
      .filter(Boolean)
      .join(" • ");
  }, [item?.year, item?.maturity, item?.duration]);

  /* ===== trailer -> QR (igual TitleTv) ===== */
  const trailerRaw = useMemo(() => {
    return String(
      item?.trailer ||
        item?.trailer_url ||
        item?.trailerUrl ||
        item?.trailer_youtube ||
        item?.hero_youtube ||
        item?.heroYoutube ||
        item?.hero_youtube_url ||
        item?.heroYoutubeUrl ||
        ""
    ).trim();
  }, [item]);

  const trailerYtId = useMemo(() => extractYouTubeId(trailerRaw), [trailerRaw]);
  const hasTrailer = Boolean(trailerYtId);

  const trailerUrl = useMemo(() => {
    if (!trailerYtId) return "";
    return `https://youtu.be/${encodeURIComponent(trailerYtId)}`;
  }, [trailerYtId]);

  const qrSrc = useMemo(() => {
    if (!trailerUrl) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(trailerUrl)}`;
  }, [trailerUrl]);

  if (!open || !item) return null;

  return (
    <div className="fixed inset-0" style={{ zIndex: 9999 }}>
      {/* ✅ fundo translúcido (não chapado) */}
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/20" />

      {/* Conteúdo */}
      <div className="absolute left-14 right-14 bottom-14">
        <div className="flex items-end gap-10">
          {/* Poster */}
          <div className="shrink-0">
            <div className="relative w-[260px] h-[390px] rounded-2xl overflow-hidden bg-white/5 border border-white/10">
              {item?.thumb ? (
                <img
                  src={item.thumb}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-white/55">
                  Sem capa
                </div>
              )}
            </div>
          </div>

          {/* Infos */}
          <div className="min-w-0 max-w-[980px]">
            {meta ? <div className="text-white/70 text-[15px]">{meta}</div> : null}

            <div className="mt-2 text-[48px] font-extrabold text-white truncate">
              {title || "Título"}
            </div>

            {synopsis ? (
              <div className="mt-4 text-white/90 text-[19px] leading-relaxed line-clamp-4">
                {synopsis}
              </div>
            ) : (
              <div className="mt-4 text-white/55 text-[16px]">
                Sem sinopse disponível.
              </div>
            )}

            {/* ✅ Botões */}
            <div className="mt-8 flex items-center gap-4">
              <button
                ref={(el) => setBtnRef?.(0, el)}
                tabIndex={focusIndex === 0 ? 0 : -1}
                type="button"
                onClick={onPlay}
                className={cx(
                  "outline-none select-none rounded-2xl",
                  "inline-flex items-center gap-3 px-9 py-4 font-bold text-[18px]",
                  "bg-white text-black",
                  focusIndex === 0 ? "ring-4 ring-white/90 scale-[1.02]" : ""
                )}
              >
                <Play className="h-6 w-6" />
                Assistir
              </button>

              <button
                ref={(el) => setBtnRef?.(1, el)}
                tabIndex={focusIndex === 1 ? 0 : -1}
                type="button"
                onClick={onToggleList}
                disabled={listBusy}
                className={cx(
                  "outline-none select-none rounded-2xl",
                  "inline-flex items-center gap-3 px-9 py-4 font-bold text-[18px]",
                  inWatchlist ? "bg-white text-black" : "bg-white/18 text-white backdrop-blur",
                  focusIndex === 1 ? "ring-4 ring-white/90 scale-[1.02]" : "",
                  listBusy ? "opacity-70" : ""
                )}
              >
                {inWatchlist ? <Check className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
                {inWatchlist ? "Na minha lista" : "Adicionar à minha lista"}
              </button>

              <div className="ml-3 text-white/45 text-[13px]">
                Voltar fecha o preview
              </div>
            </div>
          </div>

          {/* ✅ QR no canto direito (reserva de layout) */}
          <div className="ml-auto w-[520px] h-[292px] flex items-end justify-end">
            {hasTrailer && qrSrc ? (
              <div className="pointer-events-none">
                <div className="text-center text-[14px] font-semibold text-white/100">
                  Escaneie com o celular
                </div>

                <div
                  className="mt-2 rounded-2xl border border-white/10 bg-black/35 backdrop-blur-sm p-3"
                  style={{ boxShadow: "0 22px 70px rgba(0,0,0,1.55)" }}
                >
                  <img
                    src={qrSrc}
                    alt="QR Code Trailer"
                    draggable={false}
                    className="h-[176px] w-[176px] rounded-2xl"
                  />
                </div>

                <div className="mt-2 text-center text-[15px] font-semibold text-white/100">
                  Trailer
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 opacity-0"
        aria-label="Fechar preview"
        tabIndex={-1}
      />
    </div>
  );
}
