// src/pages/tv/player/uiScale.js

export const UI_SCALE = 0.72; // ajuste fino: 0.70 ~ 0.78

export const UI = {
  // safe padding (afasta da borda)
  topPadX: 30,
  topPadY: 18,
  bottomPadX: 30,
  bottomPadB: 18,

  // botões
  icon: 40,
  iconI: 20,

  pillH: 36,
  pillPx: 14,
  pillText: 12,

  play: 60,
  playI: 28,

  chipH: 34,
  chipPx: 14,
  chipText: 12,
  chipIcon: 16,
  chipCheck: 14,

  // títulos topo
  title: 16,
  meta: 12,

  // gradientes
  gradTop: 170,
  gradBottom: 220,

  // progress
  progH: 6,
  progHFocus: 10,
  thumb: 20,

  // paused overlay
  pausedLeft: 56,
  pausedTopPct: 0.24, // 24%
  pausedMaxW: 860,
  pausedLabel: 12,
  pausedTitle: 30,
  pausedEpisode: 16,
  pausedSynopsis: 12,
  pausedRightBottom: 40,

  // panel/list/pin
  panelPadX: 28,
  panelPadY: 24,
  panelHeaderPadX: 20,
  panelHeaderPadY: 16,
  panelBodyPad: 18,
  listItemPadX: 18,
  listItemPadY: 14,
  listHint: 12,
  pinKeyH: 56,
  pinKeyText: 18,
  pinMask: 18,

  // progress layout
  timeW: 150, // menor = mais perto da barra
  timeFont: 12,
  progressGap: 40,
  progMaxVW: 100, // encurta a barra (vw)

  // controls layout
  controlsRowTopNudge: 2, // sobe a linha de chips/play
  playNudgeUp: 41, // play sobe para alinhar com barra (px escalado)
};

export function s(n) {
  return Math.round(n * UI_SCALE);
}
