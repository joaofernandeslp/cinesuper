// src/pages/admin/AdminDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import TopNav from "../../components/layout/TopNav.jsx";
import Footer from "../../components/layout/Footer.jsx";
import Container from "../../components/layout/Container.jsx";
import { supabase } from "../../lib/supabaseClient.js";

const TRANSCODER_URL = String(import.meta.env.VITE_TRANSCODER_URL || "").trim();

function badge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "published") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (s === "draft") return "border-yellow-400/20 bg-yellow-400/10 text-yellow-200";
  return "border-white/10 bg-white/5 text-white/70";
}

function typePill(mediaType, isSeries) {
  const mt = String(mediaType || "").toLowerCase();
  if (mt === "movie")
    return "border-sky-400/20 bg-sky-400/10 text-sky-200";
  if ((mt === "tv" || mt === "course" || mt === "curso") && isSeries)
    return "border-violet-400/20 bg-violet-400/10 text-violet-200";
  return "border-white/10 bg-white/5 text-white/70";
}

function typeLabel(mediaType, isSeries) {
  const mt = String(mediaType || "").toLowerCase();
  if (mt === "movie") return "FILME";
  if (mt === "tv" && isSeries) return "SÉRIE";
  if (mt === "tv") return "EP";
  if ((mt === "course" || mt === "curso") && isSeries) return "CURSO";
  if (mt === "course" || mt === "curso") return "AULA";
  return "—";
}

function normalizeArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === "string") {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function uniqSorted(arr) {
  const set = new Set((arr || []).map((s) => String(s).trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function EditListModal({
  open,
  onClose,
  titleLabel,
  label,
  items,
  value,
  saving,
  onChangePreview,
  onSave,
}) {
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const selected = useMemo(() => new Set(value || []), [value]);

  const filtered = useMemo(() => {
    const qq = String(q || "").trim().toLowerCase();
    if (!qq) return items || [];
    return (items || []).filter((x) => String(x).toLowerCase().includes(qq));
  }, [items, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-950 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-widest text-yellow-400/90">
              {label?.toUpperCase() || "EDITAR"}
            </div>
            <div className="mt-1 text-lg font-bold text-white truncate">
              {titleLabel || "Editar"}
            </div>
            <div className="mt-1 text-xs text-white/60">Marque e clique em salvar.</div>
          </div>

          <button
            onClick={onClose}
            className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
          >
            Fechar
          </button>
        </div>

        <div className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Buscar ${label || "itens"}...`}
              className="w-full sm:w-80 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
            />

            <button
              onClick={() => onSave(Array.from(selected))}
              disabled={saving}
              className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>

          <div className="mt-4 max-h-[52vh] overflow-auto rounded-2xl border border-white/10 bg-white/5 p-3">
            {filtered.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {filtered.map((x) => {
                  const checked = selected.has(x);
                  return (
                    <label
                      key={x}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 hover:bg-black/30 cursor-pointer"
                      onClick={(e) => {
                        e.preventDefault();
                        if (checked) selected.delete(x);
                        else selected.add(x);
                        onChangePreview(Array.from(selected));
                      }}
                    >
                      <input type="checkbox" checked={checked} readOnly className="h-4 w-4 accent-yellow-400" />
                      <span className="text-sm text-white/90">{x}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-white/60">Nada para mostrar.</div>
            )}
          </div>

          <div className="mt-3 text-xs text-white/50">
            Selecionados: {Array.from(selected).length}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);

  // filtros
  const [statusFilter, setStatusFilter] = useState("all"); // all | published | draft
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all"); // all | movie | series

  // seções recolhíveis
  const [openPublished, setOpenPublished] = useState(true);
  const [openDraft, setOpenDraft] = useState(true);
  const [openCalendar, setOpenCalendar] = useState(true);

  // listas disponíveis
  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);

  // modal (reutilizável)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalField, setModalField] = useState(null); // "categories" | "tags"
  const [modalLabel, setModalLabel] = useState("");
  const [modalTitle, setModalTitle] = useState(null); // item do título
  const [modalValue, setModalValue] = useState([]);
  const [savingModal, setSavingModal] = useState(false);

  // ✅ categorias seed via env (ex: Gospel)
  const ENV_CATEGORIES = useMemo(() => {
    return String(import.meta.env.VITE_CATEGORIES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, []);

  const counts = useMemo(() => {
    const c = { all: items.length, published: 0, draft: 0 };
    for (const it of items) {
      if (it.status === "published") c.published++;
      if (it.status === "draft") c.draft++;
    }
    return c;
  }, [items]);

  function getCategories(it) {
    return normalizeArray(it?.categories);
  }
  function getTags(it) {
    return normalizeArray(it?.tags);
  }

  function recomputeLists(list) {
    const cats = [];
    const tags = [];
    for (const it of list || []) {
      cats.push(...getCategories(it));
      tags.push(...getTags(it));
    }
    const seededCats = Array.isArray(ENV_CATEGORIES) ? ENV_CATEGORIES : [];
    setAvailableCategories(uniqSorted([...seededCats, ...cats]));
    setAvailableTags(uniqSorted(tags));
  }

  async function load() {
    setLoading(true);
    setErr("");
    try {
      // ✅ Mostra:
      // - tudo que NÃO é TV (ex: movie, course, null, etc)
      // - TV apenas se is_series=true
      // - esconde episódios (tv + is_series=false)
      const base = supabase
        .from("titles")
        .select(
          "id, public_id, title, year, status, thumb_url, created_at, categories, tags, media_type, is_series, in_cinema, cinesuper_release_at"
        )
        .order("created_at", { ascending: false });

      const { data, error } = await base.or("and(media_type.eq.tv,is_series.eq.true),media_type.neq.tv,media_type.is.null");

      if (error) throw error;

      const list = (data || []).filter((it) => {
        const mt = String(it?.media_type || "").toLowerCase();
        const isSeries = !!it?.is_series;
        if ((mt === "tv" || mt === "course" || mt === "curso") && !isSeries) return false;
        return true;
      });
      setItems(list);
      recomputeLists(list);
    } catch (e) {
      setErr(e?.message || "Falha ao carregar títulos.");
      setItems([]);
      setAvailableCategories([]);
      setAvailableTags([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    nav("/admin", { replace: true });
  }

  function openTranscoder() {
    if (!TRANSCODER_URL) {
      alert("Configure VITE_TRANSCODER_URL no .env para abrir o transcoder.");
      return;
    }
    window.open(TRANSCODER_URL, "_blank", "noopener,noreferrer");
  }

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();

    return (items || []).filter((it) => {
      const st = String(it.status || "").toLowerCase();
      if (statusFilter !== "all" && st !== statusFilter) return false;

      // ✅ type filter
      if (typeFilter !== "all") {
        const mt = String(it.media_type || "").toLowerCase();
        const isSeries = !!it.is_series;
        if (typeFilter === "movie" && mt !== "movie") return false;
        if (typeFilter === "series" && !(isSeries && (mt === "tv" || mt === "course" || mt === "curso"))) return false;
      }

      if (q) {
        const hay = `${it.title || ""} ${it.public_id || ""} ${it.id || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (categoryFilter !== "all") {
        const cats = getCategories(it);
        if (!cats.includes(categoryFilter)) return false;
      }

      if (tagFilter !== "all") {
        const tgs = getTags(it);
        if (!tgs.includes(tagFilter)) return false;
      }

      return true;
    });
  }, [items, search, statusFilter, categoryFilter, tagFilter, typeFilter]);

  const groups = useMemo(() => {
    const calendar = [];
    const published = [];
    const draft = [];
    const other = [];

    for (const it of filtered) {
      if (it?.in_cinema === true) {
        calendar.push(it);
        continue;
      }
      if (it.status === "published") published.push(it);
      else if (it.status === "draft") draft.push(it);
      else other.push(it);
    }
    return { calendar, published, draft, other };
  }, [filtered]);

  function StatusPill({ value, label }) {
    const active = statusFilter === value;
    return (
      <button
        onClick={() => setStatusFilter(value)}
        className={[
          "rounded-full border px-4 py-2 text-xs font-semibold transition",
          active
            ? "border-white/20 bg-white text-black"
            : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
        ].join(" ")}
      >
        {label}
      </button>
    );
  }

  function TypePill({ value, label }) {
    const active = typeFilter === value;
    return (
      <button
        onClick={() => setTypeFilter(value)}
        className={[
          "rounded-full border px-4 py-2 text-xs font-semibold transition",
          active
            ? "border-white/20 bg-white text-black"
            : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10",
        ].join(" ")}
      >
        {label}
      </button>
    );
  }

  function Section({ title, count, open, setOpen, children }) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
        <button
          onClick={() => setOpen(!open)}
          className="w-full px-5 py-4 flex items-center justify-between gap-3 hover:bg-white/5 transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-sm font-bold text-white/90 truncate">{title}</div>
            <span className="text-[11px] rounded-full border border-white/10 bg-black/20 px-2 py-1 text-white/70">
              {count}
            </span>
          </div>
          <div className="text-xs text-white/60">{open ? "Recolher" : "Abrir"}</div>
        </button>
        {open ? <div className="p-5 pt-0">{children}</div> : null}
      </div>
    );
  }

  function openEditor(it, field) {
    const label = field === "categories" ? "Categorias" : "Tags";
    const current = field === "categories" ? getCategories(it) : getTags(it);

    setModalTitle(it);
    setModalField(field);
    setModalLabel(label);
    setModalValue(current);
    setModalOpen(true);
  }

  async function saveEditor(next) {
    if (!modalTitle || !modalField) return;

    setSavingModal(true);
    setErr("");

    try {
      const payload = { [modalField]: next };

      const { error } = await supabase
        .from("titles")
        .update(payload)
        .eq("id", modalTitle.id);

      if (error) throw error;

      const updated = items.map((x) =>
        x.id === modalTitle.id ? { ...x, ...payload } : x
      );

      setItems(updated);
      recomputeLists(updated);

      setModalOpen(false);
      setModalTitle(null);
      setModalField(null);
      setModalLabel("");
      setModalValue([]);
    } catch (e) {
      setErr(e?.message || "Falha ao salvar.");
    } finally {
      setSavingModal(false);
    }
  }

  function Card({ it }) {
    const cats = getCategories(it);
    const tgs = getTags(it);

    const mt = String(it.media_type || "").toLowerCase();
    const isSeries = !!it.is_series;

    // ✅ Para série global, você pode (no futuro) criar uma tela própria:
    // por enquanto, abre o mesmo AdminTitleEdit (ele edita a série sr-... normalmente).
    const to =
    isSeries && (mt === "tv" || mt === "course" || mt === "curso")
    ? `/admin/series/${it.public_id || it.id}`
    : `/admin/titles/${it.public_id || it.id}`;

    return (
      <Link
        to={to}
        className="group rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition overflow-hidden"
      >
        <div className="flex">
          <div className="w-24 h-32 bg-black/40 shrink-0 overflow-hidden">
            {it.thumb_url ? (
              <img src={it.thumb_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-white/30">
                sem capa
              </div>
            )}
          </div>

          <div className="p-4 min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-white/90 truncate">
                {it.title || "(sem título)"}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] rounded-full border px-2 py-1 ${typePill(mt, isSeries)}`}>
                  {typeLabel(mt, isSeries)}
                </span>
                <span className={`text-[11px] rounded-full border px-2 py-1 ${badge(it.status)}`}>
                  {it.status || "—"}
                </span>
              </div>
            </div>

            <div className="mt-1 text-xs text-white/60">
              {it.year ? `Ano ${it.year}` : "Ano —"} • {it.public_id || it.id}
              {it?.in_cinema ? " • Calendário" : ""}
            </div>

            {/* Chips de categorias */}
            <div className="mt-3 flex flex-wrap gap-2">
              {cats.slice(0, 3).map((c) => (
                <span
                  key={c}
                  className="text-[11px] rounded-full border border-white/10 bg-black/20 px-2 py-1 text-white/70"
                >
                  {c}
                </span>
              ))}
              {cats.length > 3 ? (
                <span className="text-[11px] text-white/50">+{cats.length - 3}</span>
              ) : null}

              {/* contador de tags */}
              {tgs.length ? (
                <span className="text-[11px] rounded-full border border-white/10 bg-black/20 px-2 py-1 text-white/60">
                  tags: {tgs.length}
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-white/50 group-hover:text-white/70">
                Abrir edição →
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openEditor(it, "categories");
                  }}
                  className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Editar categorias
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openEditor(it, "tags");
                  }}
                  className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15"
                >
                  Editar tags
                </button>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="min-h-full bg-black text-white">
      <TopNav />

      <main className="pt-16">
        <Container>
          <div className="py-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-xs font-semibold tracking-widest text-yellow-400/90">ADMIN</div>
                <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">Catálogo</h1>
                <div className="mt-2 text-sm text-white/60">
                  Total: {counts.all} • Publicados: {counts.published} • Rascunhos: {counts.draft}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => nav("/admin/titles/new")}
                  className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
                >
                  + Novo título
                </button>
                <button
                  onClick={() => nav("/admin/gospel/new")}
                  className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
                >
                  + Gospel / Curso
                </button>
                <button
                  onClick={openTranscoder}
                  className="rounded-xl bg-emerald-500/90 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Transcoder
                </button>
                <button
                  onClick={load}
                  className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
                >
                  Atualizar
                </button>
                <button
                  onClick={logout}
                  className="rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15"
                >
                  Sair
                </button>
              </div>
            </div>

            {/* Filtros */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <StatusPill value="all" label="Todos" />
                  <StatusPill value="published" label="Publicados" />
                  <StatusPill value="draft" label="Rascunhos" />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar (título / public_id)..."
                    className="w-full sm:w-80 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/20"
                  />

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{ colorScheme: "dark" }}
                    className="w-full sm:w-56 rounded-xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none focus:border-white/20"
                  >
                    <option value="all" className="bg-zinc-950 text-white">
                      Categoria: Todas
                    </option>
                    {availableCategories.map((c) => (
                      <option key={c} value={c} className="bg-zinc-950 text-white">
                        {c}
                      </option>
                    ))}
                  </select>

                  {/* ✅ filtro de tipo (Filme/Série) */}
                  <div className="hidden lg:flex items-center gap-2">
                    <TypePill value="all" label="Tudo" />
                    <TypePill value="movie" label="Filmes" />
                    <TypePill value="series" label="Séries" />
                  </div>
                </div>
              </div>

              {/* ✅ versão mobile do filtro de tipo */}
              <div className="mt-3 flex flex-wrap gap-2 lg:hidden">
                <TypePill value="all" label="Tudo" />
                <TypePill value="movie" label="Filmes" />
                <TypePill value="series" label="Séries" />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setOpenPublished((v) => !v)}
                  className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
                >
                  {openPublished ? "Recolher Publicados" : "Abrir Publicados"}
                </button>
                <button
                  onClick={() => setOpenDraft((v) => !v)}
                  className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
                >
                  {openDraft ? "Recolher Rascunhos" : "Abrir Rascunhos"}
                </button>
                <button
                  onClick={() => setOpenCalendar((v) => !v)}
                  className="rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
                >
                  {openCalendar ? "Recolher Calendário" : "Abrir Calendário"}
                </button>
              </div>
            </div>

            {err ? (
              <div className="mt-6 rounded border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {err}
              </div>
            ) : null}

            <div className="mt-6">
              {loading ? (
                <div className="text-white/60">Carregando...</div>
              ) : filtered.length ? (
                <div className="grid gap-4">
                  {/* Calendário */}
                  {groups.calendar.length ? (
                    <Section
                      title="Calendário"
                      count={groups.calendar.length}
                      open={openCalendar}
                      setOpen={setOpenCalendar}
                    >
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {groups.calendar.map((it) => (
                          <Card key={it.id} it={it} />
                        ))}
                      </div>
                    </Section>
                  ) : null}

                  {/* Publicados */}
                  {statusFilter !== "draft" ? (
                    <Section
                      title="Publicados"
                      count={groups.published.length}
                      open={openPublished}
                      setOpen={setOpenPublished}
                    >
                      {groups.published.length ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {groups.published.map((it) => (
                            <Card key={it.id} it={it} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-white/60 text-sm">Nenhum publicado neste filtro.</div>
                      )}
                    </Section>
                  ) : null}

                  {/* Rascunhos */}
                  {statusFilter !== "published" ? (
                    <Section
                      title="Rascunhos"
                      count={groups.draft.length}
                      open={openDraft}
                      setOpen={setOpenDraft}
                    >
                      {groups.draft.length ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          {groups.draft.map((it) => (
                            <Card key={it.id} it={it} />
                          ))}
                        </div>
                      ) : (
                        <div className="text-white/60 text-sm">Nenhum rascunho neste filtro.</div>
                      )}
                    </Section>
                  ) : null}

                  {/* Outros */}
                  {groups.other.length ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                      <div className="text-sm font-bold text-white/90">Outros</div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {groups.other.map((it) => (
                          <Card key={it.id} it={it} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-white/60">
                  Nenhum título encontrado. Clique em “Novo título” ou limpe os filtros.
                </div>
              )}
            </div>
          </div>
        </Container>
      </main>

      <Footer />

      {/* Modal */}
      <EditListModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalTitle(null);
          setModalField(null);
          setModalLabel("");
          setModalValue([]);
        }}
        titleLabel={modalTitle?.title}
        label={modalLabel}
        items={modalField === "categories" ? availableCategories : availableTags}
        value={modalValue}
        saving={savingModal}
        onChangePreview={(v) => setModalValue(v)}
        onSave={(v) => saveEditor(v)}
      />
    </div>
  );
}
