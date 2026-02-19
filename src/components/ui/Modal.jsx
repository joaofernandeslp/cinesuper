// src/components/ui/Modal.jsx
import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({ open, title, children, onClose }) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKey);

    // trava scroll do body
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* overlay */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/80"
        aria-label="Fechar"
      />

      {/* panel */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-black">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold tracking-widest text-yellow-400/90">
                DOCUMENTO
              </div>
              <div className="truncate text-sm text-white/85">{title}</div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10"
            >
              <X className="h-4 w-4" />
              Fechar
            </button>
          </div>

          <div className="max-h-[75vh] overflow-auto px-4 py-4">
            <div className="prose prose-invert max-w-none prose-p:text-white/80 prose-li:text-white/80 prose-strong:text-white">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
