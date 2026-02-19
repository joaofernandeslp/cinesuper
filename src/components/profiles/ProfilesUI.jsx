// src/components/profiles/ProfilesUI.jsx
import { Pencil, Trash2, X } from "lucide-react";

function cx(...arr) {
  return arr.filter(Boolean).join(" ");
}

export function SideButton({ icon: Icon, label, value, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cx(
        "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-left transition",
        active ? "bg-black text-white" : "hover:bg-black/5 text-black/80"
      )}
    >
      <Icon className={cx("h-4 w-4", active ? "text-white" : "text-black/60")} />
      {label}
    </button>
  );
}

export function RightCard({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-black">{title}</div>
        {subtitle ? <div className="mt-1 text-xs text-black/50">{subtitle}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-black/10 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
            <div className="text-sm font-semibold text-black">{title}</div>
            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-black/10 bg-white hover:bg-black/5 transition"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ProfileCard({
  p,
  isSelected,
  isActive,
  onSelect,
  onSetActive,
  onEdit,
  onDelete,
  initials,
  maturityLabel,
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(p)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(p);
        }
      }}
      className={cx(
        "rounded-2xl border p-5 transition cursor-pointer select-none bg-white shadow-sm min-w-0 overflow-hidden",
        isSelected ? "border-black/25 ring-2 ring-black/10" : "border-black/10 hover:border-black/20"
      )}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="h-14 w-14 shrink-0 rounded-2xl border border-black/10 bg-black/[0.04] overflow-hidden flex items-center justify-center">
          {p.avatar_url ? (
            <img src={p.avatar_url} alt={p.name || "Perfil"} className="h-full w-full object-cover" />
          ) : (
            <div className="text-sm font-bold text-black">{initials(p.name)}</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold truncate text-black">{p.name}</div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-black/70">
              {maturityLabel(p.maturity_limit ?? 18)}
            </span>

            {p.is_kids ? (
              <span className="inline-flex items-center rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-black/70">
                Kids
              </span>
            ) : null}

            {isActive ? (
              <span className="inline-flex items-center rounded-full bg-emerald-600/10 px-2.5 py-1 text-[11px] text-emerald-700">
                Ativo
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSetActive(p.id);
          }}
          className="h-10 w-full rounded-xl border border-black/10 bg-white px-4 text-sm hover:bg-black/5 transition"
          title="Definir como perfil ativo"
        >
          Usar
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(p);
            }}
            className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-black/10 bg-white hover:bg-black/5 transition"
            title="Editar"
          >
            <Pencil className="h-4 w-4 text-black/70" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(p);
            }}
            className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/15 transition"
            title="Remover"
          >
            <Trash2 className="h-4 w-4 text-red-700" />
          </button>
        </div>
      </div>
    </div>
  );
}
