// src/pages/tv/_tvScroll.js
export function ensureVisibleH(scrollerEl, itemEl) {
  if (!scrollerEl || !itemEl) return;

  const pad = 36;
  const c = scrollerEl.getBoundingClientRect();
  const r = itemEl.getBoundingClientRect();

  if (r.left < c.left + pad) {
    const delta = r.left - (c.left + pad);
    scrollerEl.scrollBy({ left: delta, behavior: "smooth" });
  } else if (r.right > c.right - pad) {
    const delta = r.right - (c.right - pad);
    scrollerEl.scrollBy({ left: delta, behavior: "smooth" });
  }
}

export function scrollRowToCenter(containerEl, rowEl, anchor = 0.52) {
  if (!containerEl || !rowEl) return;

  const c = containerEl.getBoundingClientRect();
  const r = rowEl.getBoundingClientRect();

  const targetY = c.top + c.height * anchor;
  const rowMid = r.top + r.height * 0.5;

  const delta = rowMid - targetY;
  if (Math.abs(delta) < 3) return;

  containerEl.scrollBy({ top: delta, behavior: "auto" });
}

export function scrollTopHard(containerEl) {
  if (!containerEl) return;
  try {
    containerEl.scrollTo({ top: 0, behavior: "auto" });
  } catch {
    try {
      containerEl.scrollTop = 0;
    } catch {}
  }
  setTimeout(() => {
    try {
      containerEl.scrollTo({ top: 0, behavior: "auto" });
    } catch {
      try {
        containerEl.scrollTop = 0;
      } catch {}
    }
  }, 40);
}
