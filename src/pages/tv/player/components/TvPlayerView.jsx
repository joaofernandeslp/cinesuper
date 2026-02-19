// src/pages/tv/player/components/TvPlayerView.jsx
import React from "react";
import { createPortal } from "react-dom";
import { Lock, Play, Pause } from "lucide-react";

import { UI, s } from "../uiScale.js";
import { cx } from "../../_tvKeys.js";
import { fmtTime } from "../../../../player/utils.js";

// componentes já modularizados
import {
  NfxIconButton,
  NfxPillButton,
  NfxPlayButton,
  NfxSpinner,
  NfxChip,
  // NfxNextUpCornerButton, // ❌ não vamos depender dele p/ visibilidade
} from "./NfxControls.jsx";

import TvPanel from "./TvPanel.jsx";
import TvList from "./TvList.jsx";
import TvPinPad from "./TvPinPad.jsx";
import TvBubbleMenu from "./TvBubbleMenu.jsx";

export default function TvPlayerView(p) {
  const portalTarget = p.portalTarget;
  const useNativePlayer = !!p.useNativePlayer;

  // 1) loading screen
  if (p.isLoading) {
    const node = (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-14 w-14 rounded-full border-4 border-white/15 border-t-red-600 animate-spin"
            aria-label={p.resumeLoading ? "Retomando" : "Carregando"}
          />
          {p.loadingStage ? (
            <div className="text-white/60" style={{ fontSize: s(UI.meta) }}>
              Etapa: {String(p.loadingStage)}
            </div>
          ) : null}
          {p.loadingTooLong ? (
            <div className="text-white/70 text-center" style={{ fontSize: s(UI.meta) }}>
              Carregamento demorando. Verifique a conexao e tente novamente.
            </div>
          ) : null}
          {p.debugInfo ? (
            <div className="text-white/45 text-center" style={{ fontSize: s(UI.meta) }}>
              {`id=${String(p.debugInfo.id || "-")}`}<br />
              {`path=${String(p.debugInfo.path || "-")}`}<br />
              {`search=${String(p.debugInfo.search || "-")}`}<br />
              {`native=${String(p.debugInfo.nativePlayer || "-")}`}<br />
              {`net=${String(p.debugInfo.online || "-")}`}
            </div>
          ) : null}
          <div className="text-white/35 text-center" style={{ fontSize: s(UI.meta) }}>
            {`bootEffect=${p.bootEffectAlive ? "yes" : "no"} • tick=${Number(p.jsTick || 0)}`}
          </div>
          {p.error ? (
            <div className="text-red-200 text-center" style={{ fontSize: s(UI.meta) }}>
              {String(p.error)}
            </div>
          ) : null}
        </div>
      </div>
    );
    return portalTarget ? createPortal(node, portalTarget) : node;
  }

  // 2) not found
  if (!p.item) {
    const node = (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center gap-3">
        <div className="font-extrabold" style={{ fontSize: s(20) }}>
          Vídeo não encontrado
        </div>
        <div className="text-white/60" style={{ fontSize: s(UI.meta) }}>
          (id: {String(p.id)})
        </div>
        {p.error ? (
          <div className="text-red-200" style={{ fontSize: s(UI.meta) }}>
            {p.error}
          </div>
        ) : null}
        <button
          onClick={p.goBack}
          className="mt-2 rounded-2xl border border-white/10 bg-white/10 font-extrabold"
          style={{
            paddingLeft: s(18),
            paddingRight: s(18),
            paddingTop: s(12),
            paddingBottom: s(12),
            fontSize: s(UI.meta),
          }}
        >
          Voltar
        </button>
      </div>
    );
    return portalTarget ? createPortal(node, portalTarget) : node;
  }

  const item = p.item || {};
  const gate = p.gate || { blocked: false, needPin: false, profile: null };
  const subtitleFiles = Array.isArray(p.subtitleFiles) ? p.subtitleFiles : [];
  const m3uSubsMap = p.m3uSubsMap || {};

  const isIntroPlaying = !!p.isIntroPlaying;
  const isPausedOverlayOn = !!p.isPausedOverlayOn;
  const chromeVisible = !!p.chromeVisible;
  const lowPower = !!p.lowPower;
  const stuckOverlay = !!p.stuckOverlay;
  const stuckFocus = Number.isFinite(Number(p.stuckFocus)) ? Number(p.stuckFocus) : 0;

  const focusArea = String(p.focusArea || "none");
  const topFocus = Number.isFinite(Number(p.topFocus)) ? Number(p.topFocus) : 0;
  const focusIndex = Number.isFinite(Number(p.focusIndex)) ? Number(p.focusIndex) : 0;

  const seekPreview = p.seekPreview || { show: false, time: 0, cue: null };
  const cue = seekPreview?.cue || null;

  // ✅ NextUp normalize
  const showNextUp = !!p.showNextUpButton;
  const nextBtnIndex = Number.isFinite(Number(p.nextBtnIndex)) ? Number(p.nextBtnIndex) : 999999;
  const nextFocused = focusArea === "controls" && focusIndex === nextBtnIndex;
  const remainingSec = Math.max(0, Math.floor(Number(p.remainingSec || 0)));

  // texto curtinho pro countdown
  const remainingLabel =
    remainingSec <= 0
      ? ""
      : remainingSec <= 60
      ? `${remainingSec}s`
      : `${Math.ceil(remainingSec / 60)}min`;

  const screenNode = (
    <div
      id="cs-tv-player-root"
      className={cx(
        "fixed inset-0 text-white overflow-hidden",
        useNativePlayer ? "bg-transparent" : "bg-black",
        lowPower ? "cs-tv-lowpower" : ""
      )}
      style={{ width: "100vw", height: "100vh" }}
    >
      {lowPower ? (
        <style>{`
          #cs-tv-player-root.cs-tv-lowpower,
          #cs-tv-player-root.cs-tv-lowpower * {
            animation: none !important;
            transition: none !important;
          }
        `}</style>
      ) : null}
      {p.crash ? (
        <div className="absolute inset-0 z-[99999] bg-black text-white" style={{ padding: s(18) }}>
          <div className="font-extrabold" style={{ fontSize: s(20) }}>
            CRASH
          </div>
          <pre className="mt-3 whitespace-pre-wrap opacity-90" style={{ fontSize: s(12) }}>
            {String(p.crash)}
          </pre>
        </div>
      ) : null}

      {stuckOverlay ? (
        <div className="absolute inset-0 z-[99998] bg-black/85 text-white flex items-center justify-center" style={{ padding: s(18) }}>
          <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl" style={{ padding: s(22) }}>
            <div className="font-extrabold" style={{ fontSize: s(22) }}>
              Nao conseguimos iniciar o video
            </div>
            <div className="mt-2 text-white/70" style={{ fontSize: s(UI.meta) }}>
              Verifique a conexao e tente novamente.
            </div>
            {p.error ? (
              <div className="mt-3 text-red-200" style={{ fontSize: s(UI.meta) }}>
                {String(p.error)}
              </div>
            ) : null}

            <div className="mt-6 flex items-center gap-4">
              <button
                type="button"
                onClick={p.onStuckRetry}
                className={cx(
                  "rounded-2xl border border-white/10 bg-white/10 font-extrabold hover:bg-white/15",
                  stuckFocus === 0 ? "ring-4 ring-white/90" : "ring-0"
                )}
                style={{
                  paddingLeft: s(18),
                  paddingRight: s(18),
                  paddingTop: s(12),
                  paddingBottom: s(12),
                  fontSize: s(UI.meta),
                }}
              >
                Tentar novamente
              </button>

              <button
                type="button"
                onClick={p.onStuckBack}
                className={cx(
                  "rounded-2xl border border-white/10 bg-white/10 font-extrabold hover:bg-white/15",
                  stuckFocus === 1 ? "ring-4 ring-white/90" : "ring-0"
                )}
                style={{
                  paddingLeft: s(18),
                  paddingRight: s(18),
                  paddingTop: s(12),
                  paddingBottom: s(12),
                  fontSize: s(UI.meta),
                }}
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ Debug opcional (DEV): mostra se o NextUp está ON de verdade */}
      {import.meta?.env?.DEV ? (
        <div className="absolute z-[99998] left-3 bottom-3 text-[11px] text-white/55">
          nextUp={String(showNextUp)} • nextIdx={String(nextBtnIndex)} • rem={String(remainingSec)}
          {p.nextEpisodeRouteId ? ` • nextId=${String(p.nextEpisodeRouteId)}` : ""}
        </div>
      ) : null}

      {/* Subtitle style (TV) */}
      {!isIntroPlaying && !useNativePlayer ? (
        <style>{`
          #cs-tv-player-root video::cue {
            color: #ffd54a;
            background: transparent;
            font-weight: 800;
            font-size: 80%;
            line-height: 1.25;
            text-shadow:
              0 2px 0 rgba(0,0,0,0.95),
              0 0 6px rgba(0,0,0,0.85),
              0 0 14px rgba(0,0,0,0.65);
          }
          #cs-tv-player-root video::cue(b) { font-weight: 900; }
        `}</style>
      ) : null}

      {/* VIDEO */}
      {!useNativePlayer ? (
        <video
          ref={p.videoRef}
          crossOrigin="anonymous"
          className="absolute inset-0 h-full w-full object-contain"
          style={{ backgroundColor: "#000" }}
          playsInline
          autoPlay
          controls={false}
          tabIndex={-1}
        >
          {!isIntroPlaying
            ? subtitleFiles.map((sFile, idx) => {
                const resolved = p.subtitleToGatewayUrl ? p.subtitleToGatewayUrl(sFile?.src) : sFile?.src;
                const src = m3uSubsMap?.[resolved] || resolved;
                return (
                  <track
                    key={`${String(p.subsTokenBump || 0)}:${sFile?.lang || "sub"}-${idx}`}
                    kind="subtitles"
                    label={sFile?.label || (sFile?.lang ? String(sFile.lang).toUpperCase() : `Legenda ${idx + 1}`)}
                    srcLang={sFile?.lang || ""}
                    src={src}
                    default={!!sFile?.default}
                  />
                );
              })
            : null}
        </video>
      ) : (
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true" />
      )}

      {/* Intro overlay */}
      {isIntroPlaying ? (
        <div className="absolute inset-0 z-[60] pointer-events-none">
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between"
            style={{ paddingLeft: s(UI.topPadX), paddingRight: s(UI.topPadX), paddingTop: s(UI.topPadY) }}
          >
            <div className="text-white/85 font-extrabold" style={{ fontSize: s(UI.meta) }}>
              Introdução
            </div>
          </div>
          <div className="absolute left-0 right-0 text-center text-white/55" style={{ bottom: s(28), fontSize: s(UI.meta) }}>
            Dica: aperte <span className="text-white/80 font-extrabold">↓</span> para pular a intro
          </div>
        </div>
      ) : null}

      {/* Gate overlay (sem PIN) */}
      {gate.blocked && !gate.needPin ? (
        <div
          className="absolute inset-0 z-[70] bg-black/80 flex items-center justify-center"
          style={{ paddingLeft: s(UI.panelPadX), paddingRight: s(UI.panelPadX) }}
        >
          <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl" style={{ padding: s(22) }}>
            <div className="flex items-center gap-3">
              <Lock style={{ width: s(22), height: s(22) }} className="text-white/80" />
              <div className="font-extrabold" style={{ fontSize: s(22) }}>
                Conteúdo bloqueado
              </div>
            </div>

            <div className="mt-3 text-white/70" style={{ fontSize: s(UI.meta) }}>
              {p.gateReason || ""}
            </div>

            <div className="mt-4 text-white/70" style={{ fontSize: s(UI.meta) }}>
              Perfil: <span className="text-white/90 font-extrabold">{gate.profile?.name || "—"}</span>
            </div>

            {p.error ? (
              <div className="mt-3 text-red-200" style={{ fontSize: s(UI.meta) }}>
                {String(p.error)}
              </div>
            ) : null}

            <div className="mt-7 flex items-center gap-4">
              <button
                type="button"
                onClick={() => p.navigate?.("/profiles")}
                className="rounded-2xl border border-white/10 bg-white/10 font-extrabold hover:bg-white/15"
                style={{
                  paddingLeft: s(18),
                  paddingRight: s(18),
                  paddingTop: s(12),
                  paddingBottom: s(12),
                  fontSize: s(UI.meta),
                }}
              >
                Trocar perfil
              </button>

              <button
                type="button"
                onClick={p.goBack}
                className="rounded-2xl border border-white/10 bg-white/10 font-extrabold hover:bg-white/15"
                style={{
                  paddingLeft: s(18),
                  paddingRight: s(18),
                  paddingTop: s(12),
                  paddingBottom: s(12),
                  fontSize: s(UI.meta),
                }}
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* PIN PAD */}
      <TvPinPad
        open={p.panel === "gatepin"}
        profileName={gate.profile?.name || ""}
        reasonText={p.gateReason || ""}
        pinValue={p.pinInput || ""}
        setPinValue={p.setPinInput || (() => {})}
        errorText={p.pinError || ""}
        focusIndex={Number.isFinite(Number(p.pinFocus)) ? Number(p.pinFocus) : 0}
        setKeyRef={p.setPinKeyRef || (() => {})}
        onSubmit={p.onPinSubmit || (() => {})}
        onClose={p.onPinClose || (() => {})}
      />

      {/* Paused overlay */}
      {isPausedOverlayOn && !useNativePlayer ? (
        <div className="absolute inset-0 z-[20] pointer-events-none">
          <div className="absolute inset-0 bg-black/55" />
          <div
            className="absolute"
            style={{
              left: s(UI.pausedLeft),
              top: `${Math.round(UI.pausedTopPct * 100)}%`,
              maxWidth: s(UI.pausedMaxW),
            }}
          >
            <div className="text-white/70" style={{ fontSize: s(UI.pausedLabel) }}>
              Você está assistindo a
            </div>

            <div className="mt-2 font-extrabold tracking-tight" style={{ fontSize: s(UI.pausedTitle), lineHeight: 1.08 }}>
              {p.mainTitle || item?.title || ""}
            </div>

            {p.episodeLine ? (
              <div className="mt-3 font-extrabold text-white/90" style={{ fontSize: s(UI.pausedEpisode) }}>
                {p.episodeLine}
              </div>
            ) : null}

            {p.synopsis ? (
              <div className="mt-3 text-white/65 leading-relaxed line-clamp-4" style={{ fontSize: s(UI.pausedSynopsis) }}>
                {p.synopsis}
              </div>
            ) : null}
          </div>

          <div
            className="absolute text-white/75 font-extrabold"
            style={{
              right: s(UI.pausedRightBottom),
              bottom: s(UI.pausedRightBottom),
              fontSize: s(UI.meta),
            }}
          >
            Pausado
          </div>
        </div>
      ) : null}

      {/* Rating */}
      {!isIntroPlaying ? (
        <div
          className={cx("absolute z-[40] pointer-events-none transition-opacity duration-500", p.ratingVisible ? "opacity-100" : "opacity-0")}
          style={{ left: s(UI.topPadX), top: s(UI.topPadY) }}
        >
          <div className="flex items-center gap-3">
            <div style={{ width: s(3), height: s(34) }} className="bg-[#e50914] rounded" />
            <div className="text-white/90 font-extrabold" style={{ fontSize: s(UI.meta) }}>
              Classificação
            </div>

            {p.ratingPayload?.age ? (
              <div
                className="rounded-1xl bg-yellow-400 text-black font-extrabold"
                style={{ paddingLeft: s(10), paddingRight: s(10), paddingTop: s(6), paddingBottom: s(6), fontSize: s(UI.meta) }}
              >
                {String(p.ratingPayload.age)}
              </div>
            ) : (
              <div
                className="rounded-1xl bg-white/10 text-white/90 font-extrabold"
                style={{ paddingLeft: s(10), paddingRight: s(10), paddingTop: s(6), paddingBottom: s(6), fontSize: s(UI.meta) }}
              >
                Não informada
              </div>
            )}

            {p.ratingPayload?.descText ? (
              <div className="text-white/80 font-semibold" style={{ fontSize: s(UI.meta) }}>
                {String(p.ratingPayload.descText)}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ===== NETFLIX-LIKE OVERLAY ===== */}
      <div className={cx("absolute inset-0 z-[45] transition-opacity duration-200", chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none")}>
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent" style={{ height: s(UI.gradTop) }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent" style={{ height: s(UI.gradBottom) }} />

        {/* Top bar */}
        <div
          className="absolute inset-x-0 top-0 flex items-start justify-between gap-6"
          style={{ paddingLeft: s(UI.topPadX), paddingRight: s(UI.topPadX), paddingTop: s(UI.topPadY) }}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {(p.topActions || []).map((b, i) => {
                const focused = focusArea === "top" && i === topFocus;

                if (b.kind === "pill") {
                  return (
                    <NfxPillButton
                      key={b.key}
                      refCb={(el) => (p.topRefs.current[i] = el)}
                      focused={focused}
                      disabled={!!b.disabled}
                      icon={b.icon}
                      label={b.label}
                      onClick={b.onClick}
                    />
                  );
                }

                return (
                  <NfxIconButton
                    key={b.key}
                    refCb={(el) => (p.topRefs.current[i] = el)}
                    focused={focused}
                    disabled={!!b.disabled}
                    icon={b.icon}
                    ariaLabel={b.ariaLabel}
                    onClick={b.onClick}
                  />
                );
              })}
            </div>
          </div>

          <div className="text-right max-w-[52vw]">
            <div className="text-white/95 font-extrabold truncate" style={{ fontSize: s(UI.title) }}>
              {p.mainTitle || item?.title || ""}
            </div>

            {p.episodeLine ? (
              <div className="mt-1 text-white/70 font-semibold truncate" style={{ fontSize: s(UI.meta) }}>
                {p.episodeLine}
              </div>
            ) : null}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="absolute inset-x-0 bottom-0"
          style={{
            paddingLeft: s(UI.bottomPadX),
            paddingRight: s(UI.bottomPadX),
            paddingBottom: `calc(${s(UI.bottomPadB)}px + env(safe-area-inset-bottom))`,
          }}
        >
          {/* Seek preview */}
          {seekPreview?.show ? (
            <div className="absolute left-1/2 -translate-x-1/2 z-[60] pointer-events-none" style={{ bottom: s(150) }}>
              <div className="flex flex-col items-center gap-2">
                {cue?.url ? (
                  cue?.xywh ? (
                    <div
                      className="rounded-2xl overflow-hidden border border-white/12 bg-black/40"
                      style={{
                        width: Math.min(s(210), cue.xywh?.w || s(210)),
                        height: Math.min(s(118), cue.xywh?.h || s(118)),
                        backgroundImage: `url(${cue.url})`,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: `-${cue.xywh.x}px -${cue.xywh.y}px`,
                        backgroundSize: "auto",
                      }}
                    />
                  ) : (
                    <div className="rounded-2xl overflow-hidden border border-white/12 bg-black/40">
                      <img src={cue.url} alt="" draggable={false} className="block object-cover" style={{ width: s(210), height: s(118) }} />
                    </div>
                  )
                ) : null}

                <div
                  className="rounded-2xl bg-black/70 border border-white/10 font-extrabold text-white/90"
                  style={{ paddingLeft: s(10), paddingRight: s(10), paddingTop: s(6), paddingBottom: s(6), fontSize: s(UI.meta) }}
                >
                  {fmtTime(Number(seekPreview.time || 0))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Progress */}
          <div className="flex items-center" style={{ gap: s(UI.progressGap) }}>
            <div className="text-white/85 font-extrabold" style={{ width: s(UI.timeW), fontSize: s(UI.timeFont), textAlign: "right" }}>
              {fmtTime(Number(p.displayCurrent || 0))}
            </div>

            <div
              style={{
                position: "relative",
                flex: 1,
                maxWidth: `${Math.round(UI.progMaxVW)}vw`,
                height: focusArea === "progress" ? s(UI.progHFocus) : s(UI.progH),
                borderRadius: 9999,
                background: "rgba(255,255,255,0.25)",
                overflow: "visible",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${(Number(p.progressPct || 0) * 100) || 0}%`,
                  borderRadius: 9999,
                  background: "#e50914",
                  zIndex: 1,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: `${(Number(p.progressPct || 0) * 100) || 0}%`,
                  top: "50%",
                  width: s(UI.thumb),
                  height: s(UI.thumb),
                  transform: "translate(-50%, -50%)",
                  borderRadius: 9999,
                  background: "#fff",
                  border: `${Math.max(1, Math.round(s(UI.thumb) * 0.18))}px solid #e50914`,
                  boxShadow: "0 6px 16px rgba(0,0,0,.45)",
                  zIndex: 2,
                  opacity: 1,
                }}
              />
            </div>

            <div className="text-white/60 font-extrabold" style={{ width: s(UI.timeW), fontSize: s(UI.timeFont), textAlign: "left" }}>
              {fmtTime(Number(p.duration || 0))}
            </div>
          </div>

          {/* Controls row */}
          <div
            className="grid items-center"
            style={{
              gridTemplateColumns: `${s(UI.play)}px 1fr ${s(UI.play)}px`,
              columnGap: s(14),
              marginTop: s(UI.controlsRowTopNudge),
            }}
          >
            <div style={{ justifySelf: "start" }}>
              <NfxPlayButton
                refCb={(el) => (p.btnRefs.current[0] = el)}
                focused={focusArea === "controls" && focusIndex === 0}
                disabled={!!gate.blocked}
                icon={p.isPlaying ? Pause : Play}
                onClick={p.togglePlay}
              />
            </div>

            <div style={{ justifySelf: "center", width: "100%", overflow: "visible" }}>
              {p.showChips ? (
                <div className="relative" style={{ width: "100%" }}>
                  <TvBubbleMenu
                    open={!!p.isBubbleAudio}
                    title="IDIOMAS"
                    items={p.audioMenu || []}
                    focusIndex={Number.isFinite(Number(p.menuIndex)) ? Number(p.menuIndex) : 0}
                    setItemRef={p.menuRefs}
                    onPick={p.onPickAudio}
                  />

                  <TvBubbleMenu
                    open={!!p.isBubbleSubs}
                    title="LEGENDAS"
                    items={p.subsMenu || []}
                    focusIndex={Number.isFinite(Number(p.menuIndex)) ? Number(p.menuIndex) : 0}
                    setItemRef={p.menuRefs}
                    onPick={p.onPickSubs}
                  />

                  <div
                    className="cs-no-scrollbar"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: s(10),
                      padding: s(12),
                      maxWidth: "92vw",
                      overflowX: "auto",
                      overflowY: "visible",
                      scrollbarWidth: "none",
                      msOverflowStyle: "none",
                    }}
                  >
                    {(p.chips || []).map((c, i) => {
                      const idx = 1 + i;
                      const focused = focusArea === "controls" && focusIndex === idx;

                      return (
                        <NfxChip
                          key={c.key}
                          refCb={(el) => (p.btnRefs.current[idx] = el)}
                          focused={focused}
                          selected={!!c.selected}
                          disabled={false}
                          label={c.label}
                          onClick={c.onSelect}
                          isIcon={!!c.isIcon}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div />
          </div>

          {p.error ? (
            <div style={{ marginTop: s(14) }}>
              <div
                className="rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200 font-semibold"
                style={{ paddingLeft: s(14), paddingRight: s(14), paddingTop: s(10), paddingBottom: s(10), fontSize: s(UI.meta) }}
              >
                {String(p.error)}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ✅ NEXT UP CORNER (agora VISÍVEL com texto) */}
      {showNextUp ? (
        <div
          className="absolute z-[220] pointer-events-auto"
          style={{
            right: `calc(${s(UI.bottomPadX)}px + env(safe-area-inset-right))`,
            bottom: `calc(${s(UI.bottomPadB)}px + env(safe-area-inset-bottom))`,
          }}
        >
          <button
            type="button"
            ref={(el) => {
              if (!p.btnRefs?.current) return;
              p.btnRefs.current[nextBtnIndex] = el;
            }}
            onClick={p.onNextUp}
            disabled={!!gate.blocked || !!isIntroPlaying}
            className={cx(
              "rounded-2xl border shadow-[0_12px_40px_rgba(0,0,0,.65)] backdrop-blur-md",
              "bg-black/65 border-white/15 hover:bg-black/75 transition",
              nextFocused ? "ring-4 ring-white/90" : "ring-0"
            )}
            style={{
              paddingLeft: s(16),
              paddingRight: s(16),
              paddingTop: s(12),
              paddingBottom: s(12),
              minWidth: s(260),
            }}
            title="Próximo episódio"
          >
            <div className="flex items-center gap-4">
              <div className="min-w-0">
                <div className="text-white/65 font-semibold" style={{ fontSize: s(UI.meta) }}>
                  Próximo episódio {remainingLabel ? `• em ${remainingLabel}` : ""}
                </div>
                <div className="text-white font-extrabold truncate" style={{ fontSize: s(UI.meta + 3) }}>
                  Próximo episódio
                </div>
              </div>

              <span
                className="shrink-0 inline-flex items-center justify-center rounded-xl bg-white text-black"
                style={{ width: s(44), height: s(44) }}
              >
                <Play style={{ width: s(20), height: s(20) }} fill="currentColor" />
              </span>
            </div>
          </button>
        </div>
      ) : null}

      {/* EPISODES */}
      <TvPanel open={!!p.isEpisodesOpen} title="EPISÓDIOS" subtitle={p.mainTitle || item?.title || ""}>
        <TvList
          items={p.episodesMenu || []}
          focusIndex={Number.isFinite(Number(p.menuIndex)) ? Number(p.menuIndex) : 0}
          setItemRef={p.menuRefs}
          onPick={(it) => p.onPickEpisode?.(it)}
          onClose={p.onCloseOverlay}
          hint="↑↓ para escolher • OK para assistir • Back para fechar"
        />
      </TvPanel>
    </div>
  );

  return portalTarget ? createPortal(screenNode, portalTarget) : screenNode;
}
