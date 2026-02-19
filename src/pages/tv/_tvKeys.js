// src/pages/tv/_tvKeys.js
export const KEY = {
  LEFT: [37, 21, 65361],
  UP: [38, 19, 65362],
  RIGHT: [39, 22, 65363],
  DOWN: [40, 20, 65364],
  ENTER: [13, 23, 66, 16777221],
};

// ⚠️ Backspace (8) NÃO pode ser BACK, senão "APAGAR" vira voltar página
export const BACK_KEYCODES = [
  10009, // Samsung Tizen BACK
  461,   // LG webOS BACK
  4,     // Android TV BACK
  111,   // Android KEYCODE_ESCAPE (muito comum em controles)
  27,    // Escape
];

export function hasCode(list, code) {
  return Array.isArray(list) && list.includes(code);
}

export function cx(...a) {
  return a.filter(Boolean).join(" ");
}
