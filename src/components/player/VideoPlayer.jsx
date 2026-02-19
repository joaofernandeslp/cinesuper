import { useEffect, useMemo, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import "./player.css";

/**
 * Props:
 * - src: URL do master.m3u8
 * - title: string
 * - seasonEpisodes: array [{ id, title, durationLabel, hlsUrl }]
 * - currentEpisodeId: string
 * - onSelectEpisode: (episodeId) => void
 * - onNextEpisode: () => void
 */
export default function VideoPlayer({
  src,
  title,
  seasonEpisodes = [],
  currentEpisodeId,
  onSelectEpisode,
  onNextEpisode,
}) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [showEpisodes, setShowEpisodes] = useState(false);

  const currentIndex = useMemo(() => {
    return seasonEpisodes.findIndex((e) => e.id === currentEpisodeId);
  }, [seasonEpisodes, currentEpisodeId]);

  const nextEpisode = useMemo(() => {
    if (currentIndex < 0) return null;
    return seasonEpisodes[currentIndex + 1] || null;
  }, [seasonEpisodes, currentIndex]);

  useEffect(() => {
    if (!videoRef.current) return;

    // Se já existe player, só troca a source
    if (playerRef.current) {
      const p = playerRef.current;
      p.src({ src, type: "application/x-mpegURL" });
      p.play().catch(() => {});
      return;
    }

    // Cria player
    const player = (playerRef.current = videojs(
      videoRef.current,
      {
        controls: true,
        preload: "auto",
        autoplay: false,
        fluid: true,
        responsive: true,
        controlBar: {
          volumePanel: { inline: false },
          pictureInPictureToggle: true,
        },
        sources: [{ src, type: "application/x-mpegURL" }],
      },
      () => {}
    ));

    // ====== Botões custom (Netflix-like) ======
    const Button = videojs.getComponent("Button");

    const SkipBack10 = videojs.extend(Button, {
      constructor: function (...args) {
        Button.apply(this, args);
        this.controlText("Voltar 10s");
        this.addClass("cs-btn");
        this.addClass("cs-skipback");
      },
      handleClick: function () {
        const t = player.currentTime() || 0;
        player.currentTime(Math.max(0, t - 10));
      },
    });

    const SkipFwd10 = videojs.extend(Button, {
      constructor: function (...args) {
        Button.apply(this, args);
        this.controlText("Avançar 10s");
        this.addClass("cs-btn");
        this.addClass("cs-skipfwd");
      },
      handleClick: function () {
        const t = player.currentTime() || 0;
        player.currentTime(t + 10);
      },
    });

    const NextEpisodeBtn = videojs.extend(Button, {
      constructor: function (...args) {
        Button.apply(this, args);
        this.controlText("Próximo");
        this.addClass("cs-btn");
        this.addClass("cs-next");
      },
      handleClick: function () {
        onNextEpisode?.();
      },
    });

    const EpisodesBtn = videojs.extend(Button, {
      constructor: function (...args) {
        Button.apply(this, args);
        this.controlText("Episódios");
        this.addClass("cs-btn");
        this.addClass("cs-episodes");
      },
      handleClick: function () {
        setShowEpisodes(true);
      },
    });

    videojs.registerComponent("SkipBack10", SkipBack10);
    videojs.registerComponent("SkipFwd10", SkipFwd10);
    videojs.registerComponent("NextEpisodeBtn", NextEpisodeBtn);
    videojs.registerComponent("EpisodesBtn", EpisodesBtn);

    // Insere na barra (ordem)
    const cb = player.getChild("controlBar");
    cb.addChild("SkipBack10", {}, 0);
    cb.addChild("SkipFwd10", {}, 2);

    // Botões da direita (perto do fullscreen)
    cb.addChild("EpisodesBtn", {}, cb.children().length - 1);
    cb.addChild("NextEpisodeBtn", {}, cb.children().length - 1);

    // Auto-play do próximo no fim (opcional)
    player.on("ended", () => {
      if (nextEpisode) onNextEpisode?.();
    });

    return () => {
      try {
        player.dispose();
      } catch {}
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <div className="cs-player-wrap">
      {/* Top overlay (back / report etc. igual Netflix) */}
      <div className="cs-topbar">
        <button className="cs-topbar-btn" onClick={() => window.history.back()}>
          ←
        </button>

        <div className="cs-topbar-title">{title}</div>

        <button className="cs-topbar-btn" title="Reportar">
          ⚑
        </button>
      </div>

      <div data-vjs-player>
        <video
          ref={videoRef}
          className="video-js vjs-big-play-centered cs-video"
        />
      </div>

      {/* Drawer de episódios */}
      {showEpisodes && (
        <EpisodesDrawer
          episodes={seasonEpisodes}
          currentId={currentEpisodeId}
          onClose={() => setShowEpisodes(false)}
          onPick={(id) => {
            setShowEpisodes(false);
            onSelectEpisode?.(id);
          }}
        />
      )}
    </div>
  );
}

function EpisodesDrawer({ episodes, currentId, onClose, onPick }) {
  return (
    <div className="cs-drawer-backdrop" onClick={onClose}>
      <div className="cs-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cs-drawer-header">
          <div className="cs-drawer-title">Episódios</div>
          <button className="cs-drawer-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cs-drawer-list">
          {episodes.map((ep, idx) => {
            const active = ep.id === currentId;
            return (
              <button
                key={ep.id}
                className={`cs-ep ${active ? "is-active" : ""}`}
                onClick={() => onPick(ep.id)}
              >
                <div className="cs-ep-left">
                  <div className="cs-ep-num">{idx + 1}</div>
                </div>
                <div className="cs-ep-mid">
                  <div className="cs-ep-title">{ep.title}</div>
                  {ep.durationLabel ? (
                    <div className="cs-ep-sub">{ep.durationLabel}</div>
                  ) : null}
                </div>
                <div className="cs-ep-right">{active ? "▶" : ""}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
