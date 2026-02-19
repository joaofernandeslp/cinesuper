// src/pages/Profiles.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import TopNav from "../components/layout/TopNav.jsx";
import Footer from "../components/layout/Footer.jsx";
import Container from "../components/layout/Container.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { SideButton, RightCard, Modal, ProfileCard } from "../components/profiles/ProfilesUI.jsx";
import {
  Plus,
  Shield,
  Lock,
  Search,
  AlertTriangle,
  LayoutGrid,
  Ban,
  ArrowLeft,
  ImagePlus,
  Upload,
  Trash,
  Home,
  CreditCard,
  ShieldCheck,
  Monitor,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_MB = 6;

// ===== Devices tracking =====
const DEVICE_KEY_STORAGE = "cs_device_key:v1";
const DEVICE_LABEL_STORAGE = "cs_device_label:v1";
const HEARTBEAT_MS = 25000; // 25s
const ONLINE_WINDOW_SEC = 90; // online se last_seen_at <= 90s

// ✅ gêneros (mesma lista do app)
const GENRES = [
  "Ação",
  "Aventura",
  "Animacao",
  "Anime",
  "Brasileiros",
  "Clássicos",
  "Comédia stand-up",
  "Comédias",
  "Curtas",
  "Documentários",
  "Drama",
  "Esportes",
  "Estrangeiros",
  "Fantasia",
  "Fé e espiritualidade",
  "Ficção cientifica",
  "Hollywood",
  "Independentes",
  "Música e musicais",
  "Policial",
  "Romance",
  "Suspense",
  "Terror",
];

const MATURITY_OPTIONS = [
  { label: "Livre", value: 0 },
  { label: "10", value: 10 },
  { label: "12", value: 12 },
  { label: "14", value: 14 },
  { label: "16", value: 16 },
  { label: "18", value: 18 },
];

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  const a = parts[0]?.[0] || "U";
  const b = parts.length >= 2 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
}

function storageKeyActiveProfile(uid) {
  return `cs_active_profile:${uid || "anon"}`;
}

function normPin(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 6);
}

function maturityLabel(v) {
  const n = Number(v);
  if (n === 0) return "Livre";
  if (!Number.isFinite(n)) return "18";
  return String(n);
}

function clsx(...arr) {
  return arr.filter(Boolean).join(" ");
}

function getExtFromFile(file) {
  const name = String(file?.name || "");
  const m = name.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || "jpg").toLowerCase();
}

function isImage(file) {
  return !!file && String(file.type || "").startsWith("image/");
}

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}

// (DD) 9XXXX-XXXX ou (DD) XXXX-XXXX
function formatPhoneBR(v) {
  const d = digitsOnly(v).slice(0, 11);
  if (!d) return "";
  const dd = d.slice(0, 2);
  const rest = d.slice(2);

  if (d.length <= 2) return `(${dd}`;
  if (d.length <= 6) return `(${dd}) ${rest}`;
  if (d.length <= 10) {
    const p1 = rest.slice(0, 4);
    const p2 = rest.slice(4, 8);
    return `(${dd}) ${p1}${p2 ? "-" + p2 : ""}`;
  }
  const p1 = rest.slice(0, 5);
  const p2 = rest.slice(5, 9);
  return `(${dd}) ${p1}${p2 ? "-" + p2 : ""}`;
}

function safeStr(v) {
  return String(v || "");
}

// ===== Devices helpers =====
function randomHex(bytes = 16) {
  try {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  }
}

function getOrCreateDeviceKey() {
  try {
    const cur = String(localStorage.getItem(DEVICE_KEY_STORAGE) || "").trim();
    if (cur) return cur;
    const next = randomHex(16);
    localStorage.setItem(DEVICE_KEY_STORAGE, next);
    return next;
  } catch {
    return randomHex(16);
  }
}

function getOrCreateDeviceLabel() {
  try {
    const cur = String(localStorage.getItem(DEVICE_LABEL_STORAGE) || "").trim();
    if (cur) return cur;
    const next = "Navegador";
    localStorage.setItem(DEVICE_LABEL_STORAGE, next);
    return next;
  } catch {
    return "Navegador";
  }
}

function guessPlatform() {
  const ua = String(navigator?.userAgent || "");
  const low = ua.toLowerCase();

  if (low.includes("tizen")) return "tizen";
  if (low.includes("webos")) return "webos";
  if (low.includes("android") && (low.includes("tv") || low.includes("aft"))) return "android_tv";
  if (low.includes("iphone") || low.includes("ipad")) return "ios";
  if (low.includes("android")) return "android";
  return "web";
}

function relTime(ts) {
  const t = ts ? new Date(ts).getTime() : 0;
  if (!t) return "—";
  const diff = Date.now() - t;
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 10) return "agora";
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t) || t <= 0) return false;
  return Date.now() - t <= ONLINE_WINDOW_SEC * 1000;
}

/* =========================
   EditorPanel (TOP-LEVEL)
========================= */

function EditorPanel({
  editorMode,
  selectedProfile,
  busy,

  fName,
  setFName,
  fGender,
  setFGender,
  fKids,
  setFKids,
  fMaturity,
  setFMaturity,
  fRequirePin,
  setFRequirePin,
  fPin,
  setFPin,
  fPinSet,
  setFPinClear,
  fPinClear,

  fKidsGenres,
  setFKidsGenres,
  toggleKidsGenre,

  fAvatarPreviewUrl,
  fAvatarFile,
  onPickAvatarClick,
  onRemoveAvatar,

  saveEditor,
  setActive,
  deleteProfile,
}) {
  const isCreate = editorMode === "create";
  const isEdit = editorMode === "edit";

  if (!isCreate && !isEdit) {
    return (
      <RightCard title="Editor de perfil" subtitle="Selecione um perfil no grid para editar, ou clique em “Adicionar perfil”.">
        <div className="text-sm text-black/60">Dica: ao selecionar um perfil, o editor abre automaticamente aqui.</div>
      </RightCard>
    );
  }

  const title = isCreate ? "Novo perfil" : `Editando: ${selectedProfile?.name || "Perfil"}`;

  return (
    <RightCard title={title} subtitle="As alterações são aplicadas ao salvar.">
      <div className="space-y-4 min-w-0">
        {/* Avatar */}
        <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-4">
          <div className="text-sm font-semibold text-black flex items-center gap-2">
            <ImagePlus className="h-4 w-4" />
            Avatar do perfil
          </div>

          <div className="mt-3 flex items-start gap-3 min-w-0">
            <div className="h-14 w-14 shrink-0 rounded-2xl border border-black/10 bg-black/[0.04] overflow-hidden flex items-center justify-center">
              {fAvatarPreviewUrl ? (
                <img src={fAvatarPreviewUrl} alt="Avatar preview" className="h-full w-full object-cover" />
              ) : (
                <div className="text-sm font-bold text-black">{initials(fName || "U")}</div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-xs text-black/50">PNG/JPG/WebP até {MAX_AVATAR_MB}MB</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onPickAvatarClick}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 transition disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Enviar imagem
                </button>

                <button
                  type="button"
                  onClick={onRemoveAvatar}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 transition disabled:opacity-50"
                  title="Remover avatar"
                >
                  <Trash className="h-4 w-4" />
                  Remover
                </button>
              </div>

              {fAvatarFile ? (
                <div className="mt-2 text-[11px] text-black/50 break-words">Selecionado: {fAvatarFile.name}</div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Nome / gênero */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block min-w-0">
            <div className="text-xs text-black/50 mb-1">Nome</div>
            <input
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Ex: João, Kids, Maria..."
            />
          </label>

          <label className="block min-w-0">
            <div className="text-xs text-black/50 mb-1">Gênero (opcional)</div>
            <input
              value={fGender}
              onChange={(e) => setFGender(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Opcional"
            />
          </label>
        </div>

        {/* Kids / PIN */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm text-black/80">Perfil Kids</div>
              <div className="text-[11px] text-black/50">Ativa proteções padrão (maturidade até 12).</div>
            </div>
            <input
              type="checkbox"
              checked={fKids}
              onChange={(e) => {
                const next = e.target.checked;
                setFKids(next);
                if (!next) setFKidsGenres([]);
                if (next) setFMaturity((m) => Math.min(Number(m || 18), 12));
              }}
              className="h-4 w-4"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-black/[0.02] px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm text-black/80">Exigir PIN</div>
              <div className="text-[11px] text-black/50">Solicita PIN para conteúdos restritos.</div>
            </div>
            <input
              type="checkbox"
              checked={fRequirePin}
              onChange={(e) => setFRequirePin(e.target.checked)}
              className="h-4 w-4"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <label className="block min-w-0">
            <div className="text-xs text-black/50 mb-1">Limite etário</div>
            <select
              value={fMaturity}
              onChange={(e) => setFMaturity(Number(e.target.value))}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            >
              {MATURITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {fKids ? <div className="mt-1 text-[11px] text-black/50">Kids limita recomendado até 12.</div> : null}
          </label>

          <label className="block min-w-0">
            <div className="text-xs text-black/50 mb-1">PIN (4-6 dígitos)</div>
            <input
              value={fPin}
              onChange={(e) => {
                setFPin(normPin(e.target.value));
                setFPinClear(false);
              }}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              placeholder={fPinSet ? "Digite para trocar (ou deixe vazio)" : "Opcional"}
              inputMode="numeric"
            />
            <div className="mt-1 text-[11px] text-black/50 flex items-center gap-2">
              <Lock className="h-3 w-3" />
              {fPinSet ? "PIN já definido. Preencha para trocar." : "Defina um PIN se quiser restringir o perfil."}
            </div>

            {fPinSet ? (
              <button
                type="button"
                onClick={() => {
                  setFPin("");
                  setFPinClear(true);
                  setFRequirePin(false);
                }}
                className="mt-2 inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs hover:bg-black/5 transition"
                title="Remover PIN deste perfil"
              >
                <Trash className="h-3.5 w-3.5" />
                Remover PIN
              </button>
            ) : null}
          </label>
        </div>

        {/* Kids: gêneros permitidos */}
        {fKids ? (
          <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-4">
            <div className="text-sm font-semibold text-black">Gêneros permitidos (Kids)</div>
            <div className="mt-1 text-xs text-black/50">
              Se você não selecionar nada, o Kids verá todos os gêneros (respeitando o limite etário).
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {GENRES.map((g) => {
                const active = fKidsGenres.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleKidsGenre(g)}
                    className={clsx(
                      "px-3 py-1.5 rounded-full text-xs border transition",
                      active ? "bg-black text-white border-black" : "bg-white text-black/80 border-black/10 hover:bg-black/5"
                    )}
                  >
                    {g}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-xs text-black/50">
                Selecionados: <span className="text-black font-semibold">{fKidsGenres.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFKidsGenres(GENRES)}
                  className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs hover:bg-black/5 transition"
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  onClick={() => setFKidsGenres([])}
                  className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs hover:bg-black/5 transition"
                >
                  Limpar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Actions editor */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            {editorMode === "edit" && selectedProfile?.id ? (
              <button
                type="button"
                onClick={() => setActive(selectedProfile.id)}
                disabled={busy}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 transition disabled:opacity-50"
              >
                Definir como ativo
              </button>
            ) : null}

            {editorMode === "edit" && selectedProfile?.id ? (
              <button
                type="button"
                onClick={() => deleteProfile(selectedProfile)}
                disabled={busy}
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 hover:bg-red-500/15 transition disabled:opacity-50"
              >
                Remover
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={saveEditor}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-black/90 transition disabled:opacity-60"
          >
            {busy ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Salvar
              </>
            )}
          </button>
        </div>
      </div>
    </RightCard>
  );
}

/* =========================
   Page
========================= */

export default function Profiles() {
  const nav = useNavigate();
  const location = useLocation();

  // ===== Auth / Entitlements =====
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [maxProfiles, setMaxProfiles] = useState(6);
  const [maxDevices, setMaxDevices] = useState(0);

  const [planInfo, setPlanInfo] = useState({
    plan: "",
    status: "",
    max_profiles: null,
    max_quality: "",
    pending_plan: "",
    pending_plan_effective_at: "",
    pending_delete: false,
    pending_delete_at: "",
    phone: "",
  });

  // ===== Perfis =====
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState([]);

  const [activeProfileId, setActiveProfileId] = useState("");
  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) || profiles[0] || null,
    [profiles, activeProfileId]
  );

  const [selectedId, setSelectedId] = useState("");
  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId) || null,
    [profiles, selectedId]
  );

  // ===== Devices =====
  const [deviceKey, setDeviceKey] = useState("");
  const [thisDeviceId, setThisDeviceId] = useState("");
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devices, setDevices] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [renameMap, setRenameMap] = useState({}); // {deviceId: labelDraft}
  const hbRef = useRef(null);
  const deviceLimit = maxDevices > 0 ? maxDevices : 10;

  // ===== Sidebar nav =====
  const [section, setSection] = useState("overview"); // overview | subscription | security | devices | profiles | parental | blocked

  // ===== Inline editor mode =====
  const [editorMode, setEditorMode] = useState("view"); // view | create | edit

  // ===== Feedback / busy =====
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  function toastError(msg) {
    setErrorMsg(String(msg || "Falha inesperada."));
    setTimeout(() => setErrorMsg(""), 4500);
  }
  function toastOk(msg) {
    setOkMsg(String(msg || "Salvo."));
    setTimeout(() => setOkMsg(""), 2500);
  }

  // ✅ NOVO: suporta deep-link do TopNav: /profiles?tab=profiles (ou /account?tab=profiles)
  useEffect(() => {
    const qs = new URLSearchParams(location.search || "");
    const tab = String(qs.get("tab") || "").trim().toLowerCase();
    if (!tab) return;

    const allowed = new Set(["overview", "subscription", "security", "devices", "profiles", "parental", "blocked"]);
    if (allowed.has(tab)) {
      setSection(tab);
      // ao entrar direto em "profiles", deixa o editor em view
      if (tab === "profiles") setEditorMode("view");
    }
  }, [location.search]);

  // ===== Form (create/edit) =====
  const [fName, setFName] = useState("");
  const [fGender, setFGender] = useState("");
  const [fKids, setFKids] = useState(false);
  const [fMaturity, setFMaturity] = useState(18);
  const [fRequirePin, setFRequirePin] = useState(false);
  const [fPin, setFPin] = useState("");
  const [fPinSet, setFPinSet] = useState(false);
  const [fPinClear, setFPinClear] = useState(false);

  const [fKidsGenres, setFKidsGenres] = useState([]);

  const [fAvatarExistingUrl, setFAvatarExistingUrl] = useState("");
  const [fAvatarPreviewUrl, setFAvatarPreviewUrl] = useState("");
  const [fAvatarFile, setFAvatarFile] = useState(null);
  const [fAvatarRemove, setFAvatarRemove] = useState(false);
  const fileInputRef = useRef(null);

  const [blocked, setBlocked] = useState([]);
  const [blockLoading, setBlockLoading] = useState(false);
  const [titleQuery, setTitleQuery] = useState("");
  const [titleResults, setTitleResults] = useState([]);
  const [searchingTitles, setSearchingTitles] = useState(false);

  const canAddMore = profiles.length < maxProfiles;

  // ===== Security form =====
  const [secEmail, setSecEmail] = useState("");
  const [secPhone, setSecPhone] = useState("");
  const [secPassword1, setSecPassword1] = useState("");
  const [secPassword2, setSecPassword2] = useState("");
  const [showPass1, setShowPass1] = useState(false);
  const [showPass2, setShowPass2] = useState(false);

  // ===== Plan change modal =====
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [nextPlan, setNextPlan] = useState("");

  // =========================
  // Data loaders
  // =========================
  async function loadAuth() {
    const { data } = await supabase.auth.getUser();
    const u = data?.user || null;
    setUserId(u?.id || "");
    setUserEmail(u?.email || "");
    setSecEmail(u?.email || "");
  }

  async function loadEntitlements(uid) {
    try {
      const fullSel =
        "plan,status,max_profiles,max_screens,max_quality,pending_plan,pending_plan_effective_at,pending_delete,pending_delete_at,phone";

      const { data, error } = await supabase
        .from("user_entitlements")
        .select(fullSel)
        .eq("user_id", uid)
        .maybeSingle();

      if (error) throw error;

      const mp = Number(data?.max_profiles);
      if (Number.isFinite(mp) && mp > 0) setMaxProfiles(mp);
      const md = Number(data?.max_screens);
      if (Number.isFinite(md) && md > 0) setMaxDevices(md);

      setPlanInfo((prev) => ({
        ...prev,
        plan: safeStr(data?.plan),
        status: safeStr(data?.status),
        max_profiles: data?.max_profiles ?? null,
        max_quality: safeStr(data?.max_quality),
        pending_plan: safeStr(data?.pending_plan),
        pending_plan_effective_at: safeStr(data?.pending_plan_effective_at),
        pending_delete: !!data?.pending_delete,
        pending_delete_at: safeStr(data?.pending_delete_at),
        phone: safeStr(data?.phone),
      }));

      setSecPhone(formatPhoneBR(data?.phone || ""));
      return;
    } catch {
      try {
        const { data, error } = await supabase
          .from("user_entitlements")
          .select("plan,status,max_profiles,max_screens,max_quality")
          .eq("user_id", uid)
          .maybeSingle();

        if (error) return;

        const mp = Number(data?.max_profiles);
        if (Number.isFinite(mp) && mp > 0) setMaxProfiles(mp);
        const md = Number(data?.max_screens);
        if (Number.isFinite(md) && md > 0) setMaxDevices(md);

        setPlanInfo((prev) => ({
          ...prev,
          plan: safeStr(data?.plan),
          status: safeStr(data?.status),
          max_profiles: data?.max_profiles ?? null,
          max_quality: safeStr(data?.max_quality),
        }));
      } catch {}
    }
  }

  async function ensureDefaultProfile(uid) {
    const fallbackName = (() => {
      const e = String(userEmail || "").trim();
      if (e.includes("@")) return e.split("@")[0] || "Perfil 1";
      return "Perfil 1";
    })();

    await supabase.from("user_profiles").insert({
      user_id: uid,
      name: fallbackName,
      avatar_url: null,
      gender: null,
      is_kids: false,
      maturity_limit: 18,
      require_pin: false,
      pin_set: false,
      kids_allowed_genres: null,
    });
  }

  async function loadProfiles(uid) {
    setLoading(true);

    const { data, error } = await supabase
      .from("user_profiles")
      .select(
        "id, user_id, name, avatar_url, gender, is_kids, maturity_limit, require_pin, pin_set, kids_allowed_genres, created_at"
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: true });

    if (error) {
      setProfiles([]);
      setLoading(false);
      toastError("Não foi possível carregar os perfis (RLS/policy ou conexão).");
      return;
    }

    if (!data || data.length === 0) {
      await ensureDefaultProfile(uid);
      return loadProfiles(uid);
    }

    const list = data.slice(0, 6);
    setProfiles(list);
    setLoading(false);

    try {
      const key = storageKeyActiveProfile(uid);
      const saved = String(localStorage.getItem(key) || "").trim();
      const valid = saved && list.some((p) => p.id === saved) ? saved : list[0]?.id || "";
      setActiveProfileId(valid);
      if (valid) localStorage.setItem(key, valid);
    } catch {
      setActiveProfileId(list[0]?.id || "");
    }

    setSelectedId((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id || ""));
  }

  async function loadBlocked(profileId) {
    if (!profileId) return;
    setBlockLoading(true);

    const { data, error } = await supabase
      .from("profile_blocked_titles")
      .select("id, title_id, created_at, titles:titles(id, title, maturity)")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false });

    if (error) {
      setBlocked([]);
      setBlockLoading(false);
      return;
    }
    setBlocked(Array.isArray(data) ? data : []);
    setBlockLoading(false);
  }

  async function searchTitles(q) {
    const query = String(q || "").trim();
    if (query.length < 2) {
      setTitleResults([]);
      return;
    }
    setSearchingTitles(true);

    const { data, error } = await supabase
      .from("titles")
      .select("id, title, maturity, thumb_url")
      .ilike("title", `%${query}%`)
      .order("title", { ascending: true })
      .limit(8);

    setSearchingTitles(false);

    if (error) {
      setTitleResults([]);
      return;
    }

    const blockedIds = new Set((blocked || []).map((b) => b?.title_id));
    setTitleResults((data || []).filter((t) => !blockedIds.has(t.id)));
  }

  // =========================
  // Devices: register + heartbeat + list
  // =========================
  async function ensureDevice(uid) {
    const dk = getOrCreateDeviceKey();
    setDeviceKey(dk);

    const platform = guessPlatform();
    const ua = String(navigator?.userAgent || "");
    const label = getOrCreateDeviceLabel();

    const { data: existingDev, error: existingErr } = await supabase
      .from("user_devices")
      .select("id,is_revoked")
      .eq("user_id", uid)
      .eq("device_key", dk)
      .maybeSingle();

    if (existingErr) throw existingErr;

    if (existingDev?.is_revoked) {
      try {
        localStorage.removeItem(DEVICE_KEY_STORAGE);
        localStorage.removeItem(DEVICE_LABEL_STORAGE);
      } catch {}
      try {
        await supabase.auth.signOut();
      } catch {}
      nav("/login?reason=device_revoked", { replace: true });
      return null;
    }

    if (!existingDev?.id && maxDevices > 0) {
      const { data: devs, error: dErr } = await supabase
        .from("user_devices")
        .select("id")
        .eq("user_id", uid)
        .eq("is_revoked", false);
      if (dErr) throw dErr;
      const count = Array.isArray(devs) ? devs.length : 0;
      if (count >= maxDevices) {
        toastError(`Limite de aparelhos atingido (${count}/${maxDevices}). Desconecte um aparelho para continuar.`);
        setSection("devices");
        return null;
      }
    }

    // upsert device (inclui is_revoked)
    const { data, error } = await supabase
      .from("user_devices")
      .upsert(
        {
          user_id: uid,
          device_key: dk,
          label,
          platform,
          ua,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_key" }
      )
      .select("id,label,last_seen_at,platform,is_revoked,revoked_at")
      .single();

    if (error) throw error;

    // se este device está revogado, força sair e troca o device_key local
    if (data?.is_revoked) {
      try {
        localStorage.removeItem(DEVICE_KEY_STORAGE);
        localStorage.removeItem(DEVICE_LABEL_STORAGE);
      } catch {}
      try {
        await supabase.auth.signOut();
      } catch {}
      nav("/login?reason=device_revoked", { replace: true });
      return null;
    }

    setThisDeviceId(data?.id || "");
    setRenameMap((prev) => ({
      ...prev,
      [data?.id]: String(data?.label || ""),
    }));

    // upsert session (1 por device) — SEM started_at (sua tabela não tem)
    const nowIso = new Date().toISOString();
    const { error: sErr } = await supabase
      .from("device_sessions")
      .upsert(
        {
          user_id: uid,
          device_id: data?.id,
          last_seen_at: nowIso,
          status: "active",
          is_playing: false,
          playback_updated_at: nowIso,
        },
        { onConflict: "device_id" }
      );

    if (sErr) throw sErr;

    return data?.id || null;
  }

  async function heartbeat(uid, devId) {
    const now = new Date().toISOString();
    await supabase.from("user_devices").update({ last_seen_at: now }).eq("id", devId).eq("user_id", uid);
    await supabase.from("device_sessions").update({ last_seen_at: now, status: "active" }).eq("device_id", devId).eq("user_id", uid);
  }

  async function loadDevicesAndSessions(uid) {
    setDevicesLoading(true);
    try {
      const { data: devs, error: dErr } = await supabase
        .from("user_devices")
        .select("id, device_key, label, platform, ua, created_at, last_seen_at, is_revoked, revoked_at")
        .eq("user_id", uid)
        .order("last_seen_at", { ascending: false });

      if (dErr) throw dErr;

      const { data: sess, error: sErr } = await supabase
        .from("device_sessions")
        .select("id, device_id, user_id, started_at, last_seen_at, status, profile_id, current_title_id, is_playing, playback_updated_at")
        .eq("user_id", uid)
        .order("last_seen_at", { ascending: false });

      if (sErr) throw sErr;

      setDevices(Array.isArray(devs) ? devs : []);
      setSessions(Array.isArray(sess) ? sess : []);

      // garantir renameMap com labels atuais
      setRenameMap((prev) => {
        const next = { ...prev };
        (devs || []).forEach((d) => {
          if (next[d.id] === undefined) next[d.id] = String(d.label || "");
        });
        return next;
      });
    } finally {
      setDevicesLoading(false);
    }
  }

  function stopHeartbeat() {
    if (hbRef.current) {
      clearInterval(hbRef.current);
      hbRef.current = null;
    }
  }

  function startHeartbeat(uid, devId) {
    stopHeartbeat();
    hbRef.current = setInterval(() => {
      heartbeat(uid, devId).catch(() => {});
    }, HEARTBEAT_MS);
  }

  async function saveDeviceLabel(devId) {
    const label = String(renameMap?.[devId] || "").trim() || null;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("user_devices")
        .update({ label })
        .eq("id", devId)
        .eq("user_id", userId);
      if (error) throw error;
      await loadDevicesAndSessions(userId);
      toastOk("Nome do aparelho atualizado.");
    } catch (e) {
      toastError(e?.message || "Falha ao salvar nome do aparelho.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectDevice(dev) {
    if (!dev?.id) return;
    const ok = window.confirm("Desconectar este aparelho? Ele será forçado a sair na próxima atualização.");
    if (!ok) return;

    setBusy(true);
    try {
      // revoga
      const { error } = await supabase
        .from("user_devices")
        .update({ is_revoked: true, revoked_at: new Date().toISOString() })
        .eq("id", dev.id)
        .eq("user_id", userId);
      if (error) throw error;

      // remove sessão
      await supabase.from("device_sessions").delete().eq("device_id", dev.id).eq("user_id", userId);

      // se for este aparelho, faz signOut imediato
      if (dev.id === thisDeviceId) {
        try {
          localStorage.removeItem(DEVICE_KEY_STORAGE);
          localStorage.removeItem(DEVICE_LABEL_STORAGE);
        } catch {}
        await supabase.auth.signOut();
        nav("/login?reason=self_disconnect", { replace: true });
        return;
      }

      await loadDevicesAndSessions(userId);
      toastOk("Aparelho desconectado.");
    } catch (e) {
      toastError(e?.message || "Falha ao desconectar aparelho.");
    } finally {
      setBusy(false);
    }
  }

  async function cleanupOldDevices() {
    const active = (devices || []).filter((d) => !d?.is_revoked);
    if (!active.length) return;

    const sorted = [...active].sort((a, b) => {
      if (a.id === thisDeviceId) return -1;
      if (b.id === thisDeviceId) return 1;
      const ta = new Date(a.last_seen_at || a.created_at || 0).getTime();
      const tb = new Date(b.last_seen_at || b.created_at || 0).getTime();
      return tb - ta;
    });

    const toRevoke = sorted.slice(deviceLimit);
    if (!toRevoke.length) return;

    const ok = window.confirm(
      `Desconectar ${toRevoke.length} aparelho(s) antigos e manter apenas os ${deviceLimit} mais recentes?`
    );
    if (!ok) return;

    setBusy(true);
    try {
      const ids = toRevoke.map((d) => d.id);
      const { error } = await supabase
        .from("user_devices")
        .update({ is_revoked: true, revoked_at: new Date().toISOString() })
        .in("id", ids)
        .eq("user_id", userId);
      if (error) throw error;

      await supabase.from("device_sessions").delete().in("device_id", ids).eq("user_id", userId);
      await loadDevicesAndSessions(userId);
      toastOk("Aparelhos antigos desconectados.");
    } catch (e) {
      toastError(e?.message || "Falha ao limpar aparelhos antigos.");
    } finally {
      setBusy(false);
    }
  }

  // =========================
  // Form helpers
  // =========================
  function resetAvatarState(existingUrl) {
    setFAvatarExistingUrl(existingUrl || "");
    setFAvatarPreviewUrl(existingUrl || "");
    setFAvatarFile(null);
    setFAvatarRemove(false);
  }

  function resetFormFromProfile(p) {
    setFName(p?.name || "");
    setFGender(p?.gender || "");
    setFKids(!!p?.is_kids);
    setFMaturity(Number.isFinite(Number(p?.maturity_limit)) ? Number(p?.maturity_limit) : 18);
    setFRequirePin(!!p?.require_pin);
    setFPin("");
    setFPinSet(!!p?.pin_set);
    setFPinClear(false);
    setFKidsGenres(Array.isArray(p?.kids_allowed_genres) ? p.kids_allowed_genres : []);
    resetAvatarState(p?.avatar_url || "");
  }

  function openCreateInline() {
    setSection("profiles");
    setEditorMode("create");
    setErrorMsg("");
    setOkMsg("");

    setSelectedId("");
    setFName("");
    setFGender("");
    setFKids(false);
    setFMaturity(18);
    setFRequirePin(false);
    setFPin("");
    setFPinSet(false);
    setFPinClear(false);
    setFKidsGenres([]);
    resetAvatarState("");
  }

  function openEditInline(profile) {
    if (!profile?.id) return;
    setSection("profiles");
    setEditorMode("edit");
    setErrorMsg("");
    setOkMsg("");

    setSelectedId(profile.id);
    resetFormFromProfile(profile);
  }

  async function setActive(pid) {
    setActiveProfileId(pid);
    try {
      if (userId) localStorage.setItem(storageKeyActiveProfile(userId), pid);
    } catch {}
    toastOk("Perfil ativo atualizado.");
  }

  function onPickAvatarClick() {
    fileInputRef.current?.click?.();
  }

  function onAvatarFileChange(e) {
    const file = e.target.files?.[0] || null;
    e.target.value = "";
    if (!file) return;

    if (!isImage(file)) return toastError("Selecione uma imagem válida (JPG/PNG/WebP).");

    const mb = file.size / (1024 * 1024);
    if (mb > MAX_AVATAR_MB) return toastError(`Imagem muito grande. Máximo ${MAX_AVATAR_MB} MB.`);

    const url = URL.createObjectURL(file);
    setFAvatarFile(file);
    setFAvatarPreviewUrl(url);
    setFAvatarRemove(false);
  }

  function onRemoveAvatar() {
    setFAvatarFile(null);
    setFAvatarPreviewUrl("");
    setFAvatarRemove(true);
  }

  async function uploadAvatar(uid, profileId, file) {
    const ext = getExtFromFile(file);
    const path = `${uid}/${profileId}/avatar_${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
      upsert: true,
      cacheControl: "3600",
      contentType: file.type,
    });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const url = pub?.publicUrl || "";
    if (!url) throw new Error("Falha ao obter URL pública do avatar.");
    return url;
  }

  function toggleKidsGenre(g) {
    setFKidsGenres((prev) => {
      const set = new Set(Array.isArray(prev) ? prev : []);
      if (set.has(g)) set.delete(g);
      else set.add(g);
      return Array.from(set);
    });
  }

  // =========================
  // Subscription actions (UI + placeholder)
  // =========================
  async function schedulePlanChange(nextPlanKey) {
    const effectiveAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    try {
      const { error } = await supabase
        .from("user_entitlements")
        .update({
          pending_plan: nextPlanKey,
          pending_plan_effective_at: effectiveAt.toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;

      await loadEntitlements(userId);
      toastOk("Troca de plano agendada para a próxima renovação.");
      return true;
    } catch {
      toastError("Não consegui agendar a troca (colunas pending_plan/pending_plan_effective_at ou RLS).");
      return false;
    }
  }

  // =========================
  // Security actions
  // =========================
  async function saveSecurity() {
    if (!userId) return toastError("Sessão inválida.");

    const email = String(secEmail || "").trim();
    const phone = formatPhoneBR(secPhone || "");
    const pass1 = String(secPassword1 || "");
    const pass2 = String(secPassword2 || "");

    setBusy(true);
    setErrorMsg("");
    setOkMsg("");

    try {
      if (email && email !== userEmail) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
        toastOk("E-mail atualizado (pode exigir confirmação).");
      }

      const wantsPassChange = pass1.length > 0 || pass2.length > 0;
      if (wantsPassChange) {
        if (pass1.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres.");
        if (pass1 !== pass2) throw new Error("As senhas não conferem.");
        const { error } = await supabase.auth.updateUser({ password: pass1 });
        if (error) throw error;
        setSecPassword1("");
        setSecPassword2("");
        toastOk("Senha atualizada.");
      }

      if (phone !== formatPhoneBR(planInfo.phone || "")) {
        const { error } = await supabase
          .from("user_entitlements")
          .update({ phone: digitsOnly(phone) })
          .eq("user_id", userId);

        if (error) {
          toastError("Não consegui salvar o celular (coluna phone ou RLS).");
        } else {
          toastOk("Celular atualizado.");
        }
      }

      await loadAuth();
      await loadEntitlements(userId);
    } catch (e) {
      toastError(e?.message || "Falha ao salvar segurança.");
    } finally {
      setBusy(false);
    }
  }

  async function requestDeleteAccount() {
    if (!userId) return toastError("Sessão inválida.");

    const ok = window.confirm(
      "Tem certeza? Sua assinatura continuará ativa até o fim do ciclo. Ao terminar, sua conta será excluída automaticamente."
    );
    if (!ok) return;

    const deleteAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    setBusy(true);
    try {
      const { error } = await supabase
        .from("user_entitlements")
        .update({
          pending_delete: true,
          pending_delete_at: deleteAt.toISOString(),
        })
        .eq("user_id", userId);

      if (error) throw error;

      await loadEntitlements(userId);
      toastOk("Exclusão agendada para o fim do ciclo.");
    } catch {
      toastError("Não consegui agendar exclusão (colunas pending_delete/pending_delete_at ou RLS).");
    } finally {
      setBusy(false);
    }
  }

  // =========================
  // Save / Delete / Block (profiles)
  // =========================
  async function saveEditor() {
    if (!userId) return toastError("Sessão inválida. Faça login novamente.");

    const name = String(fName || "").trim();
    if (!name) return toastError("Informe um nome para o perfil.");

    if (editorMode === "create" && !canAddMore) return toastError("Você já atingiu o limite de perfis do seu plano.");

    setBusy(true);
    setErrorMsg("");
    setOkMsg("");

    const pin = normPin(fPin);
    const hasPinInput = pin.length >= 4;
    const requirePinNext = !!fRequirePin && !fPinClear;

    if (requirePinNext && !hasPinInput && !fPinSet) {
      return toastError("Defina um PIN (4 a 6 dígitos) para habilitar a proteção.");
    }

    try {
      if (editorMode === "create") {
        const insertPayload = {
          user_id: userId,
          name,
          gender: String(fGender || "").trim() || null,
          avatar_url: null,
          is_kids: !!fKids,
          maturity_limit: Number(fKids ? Math.min(fMaturity, 12) : fMaturity) || 18,
          require_pin: requirePinNext,
          kids_allowed_genres: fKids ? (fKidsGenres.length ? fKidsGenres : null) : null,
        };

        const { data: created, error: insErr } = await supabase
          .from("user_profiles")
          .insert(insertPayload)
          .select("id")
          .single();
        if (insErr) throw insErr;

        const profileId = created?.id;

        if (fAvatarFile && profileId) {
          const url = await uploadAvatar(userId, profileId, fAvatarFile);
          const { error: upErr } = await supabase.from("user_profiles").update({ avatar_url: url }).eq("id", profileId);
          if (upErr) throw upErr;
        }

        if (profileId && hasPinInput) {
          const { error: pinErr } = await supabase.rpc("set_profile_pin", { profile_id: profileId, pin });
          if (pinErr) throw pinErr;
        }

        await loadProfiles(userId);

        if (profileId) {
          setSelectedId(profileId);
          setEditorMode("edit");
        } else {
          setEditorMode("view");
        }

        setFPin("");
        setFPinClear(false);
        if (hasPinInput) setFPinSet(true);

        toastOk("Perfil criado.");
      } else if (editorMode === "edit") {
        if (!selectedProfile?.id) throw new Error("Selecione um perfil.");

        let nextAvatarUrl = fAvatarExistingUrl || null;
        if (fAvatarRemove) nextAvatarUrl = null;
        if (fAvatarFile) nextAvatarUrl = await uploadAvatar(userId, selectedProfile.id, fAvatarFile);

        const payload = {
          name,
          gender: String(fGender || "").trim() || null,
          avatar_url: nextAvatarUrl,
          is_kids: !!fKids,
          maturity_limit: Number(fKids ? Math.min(fMaturity, 12) : fMaturity) || 18,
          require_pin: requirePinNext,
          kids_allowed_genres: fKids ? (fKidsGenres.length ? fKidsGenres : null) : null,
        };

        const { error } = await supabase.from("user_profiles").update(payload).eq("id", selectedProfile.id);
        if (error) throw error;

        if (hasPinInput) {
          const { error: pinErr } = await supabase.rpc("set_profile_pin", {
            profile_id: selectedProfile.id,
            pin,
          });
          if (pinErr) throw pinErr;
        } else if (fPinClear) {
          const { error: pinErr } = await supabase.rpc("set_profile_pin", {
            profile_id: selectedProfile.id,
            pin: null,
          });
          if (pinErr) throw pinErr;
        }

        await loadProfiles(userId);
        await loadBlocked(selectedProfile.id);

        setFPin("");
        setFPinClear(false);
        if (hasPinInput) setFPinSet(true);
        else if (fPinClear) setFPinSet(false);

        toastOk("Alterações salvas.");
      } else {
        toastError("Selecione um perfil para editar ou crie um novo.");
      }
    } catch (e) {
      toastError(e?.message || "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile(p) {
    if (!p?.id) return;
    if (profiles.length <= 1) return toastError("Você precisa ter pelo menos 1 perfil.");

    const ok = window.confirm(`Remover o perfil "${p.name}"?`);
    if (!ok) return;

    setBusy(true);
    try {
      const { error } = await supabase.from("user_profiles").delete().eq("id", p.id);
      if (error) throw error;

      if (selectedId === p.id) {
        setSelectedId("");
        setEditorMode("view");
      }

      await loadProfiles(userId);
      toastOk("Perfil removido.");
    } catch (e) {
      toastError(e?.message || "Falha ao remover perfil.");
    } finally {
      setBusy(false);
    }
  }

  async function blockTitle(titleId) {
    if (!selectedProfile?.id || !titleId) return;

    setBusy(true);
    try {
      const { error } = await supabase.from("profile_blocked_titles").insert({
        profile_id: selectedProfile.id,
        title_id: titleId,
      });
      if (error) throw error;

      setTitleQuery("");
      setTitleResults([]);
      await loadBlocked(selectedProfile.id);
      toastOk("Título bloqueado.");
    } catch (e) {
      toastError(e?.message || "Falha ao bloquear título.");
    } finally {
      setBusy(false);
    }
  }

  async function unblockTitle(titleId) {
    if (!selectedProfile?.id || !titleId) return;

    setBusy(true);
    try {
      const { error } = await supabase
        .from("profile_blocked_titles")
        .delete()
        .eq("profile_id", selectedProfile.id)
        .eq("title_id", titleId);
      if (error) throw error;

      await loadBlocked(selectedProfile.id);
      toastOk("Título desbloqueado.");
    } catch (e) {
      toastError(e?.message || "Falha ao desbloquear título.");
    } finally {
      setBusy(false);
    }
  }

  // =========================
  // Effects
  // =========================
  useEffect(() => {
    (async () => {
      await loadAuth();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!userId) return;

    (async () => {
      await loadEntitlements(userId);
      await loadProfiles(userId);

      try {
        const devId = await ensureDevice(userId);
        if (devId) {
          startHeartbeat(userId, devId);
          await loadDevicesAndSessions(userId);
        }
      } catch (e) {
        setThisDeviceId("");
      }
    })();

    return () => stopHeartbeat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!selectedId) return;
    loadBlocked(selectedId);
    setTitleQuery("");
    setTitleResults([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const debounceRef = useRef(null);
  useEffect(() => {
    if (!selectedProfile?.id) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTitles(titleQuery), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleQuery, blocked, selectedProfile?.id]);

  const used = profiles.length;
  const quotaText = `${used} / ${maxProfiles}`;

  const handleSelectProfile = useCallback(
    (p) => {
      openEditInline(p);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId]
  );

  // latest session per device
  const sessionByDevice = useMemo(() => {
    const map = new Map();
    (sessions || []).forEach((s) => {
      if (!s?.device_id) return;
      if (!map.has(s.device_id)) map.set(s.device_id, s);
    });
    return map;
  }, [sessions]);

  // =========================
  // Render
  // =========================
  return (
    <div className="min-h-[100svh] bg-white text-black flex flex-col">
      <TopNav />
      <div id="cs-nav-sentinel" className="h-1 w-full" />

      <main className="pt-20 pb-10 flex-1">
        <Container>
          <div className="mx-auto w-full max-w-7xl">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => nav("/browse")}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/10 bg-white hover:bg-black/5 transition"
                    title="Voltar"
                  >
                    <ArrowLeft className="h-4 w-4 text-black/70" />
                  </button>

                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold">Conta</h1>
                    <p className="mt-1 text-sm text-black/60">
                      Perfis e configurações. <span className="text-black/40">({quotaText} perfis)</span>
                    </p>
                    {userEmail ? <p className="mt-1 text-xs text-black/45 truncate">{userEmail}</p> : null}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {section === "profiles" ? (
                  <button
                    type="button"
                    onClick={openCreateInline}
                    disabled={!canAddMore}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition border",
                      canAddMore ? "bg-black text-white border-black hover:bg-black/90" : "bg-black/5 text-black/40 border-black/10 cursor-not-allowed"
                    )}
                    title={!canAddMore ? "Limite de perfis atingido" : "Adicionar perfil"}
                  >
                    <Plus className="h-4 w-4" />
                    Adicionar perfil
                  </button>
                ) : null}
              </div>
            </div>

            {/* alerts */}
            {errorMsg ? (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  {errorMsg}
                </div>
              </div>
            ) : null}
            {okMsg ? (
              <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
                {okMsg}
              </div>
            ) : null}

            {/* ==== SEU RENDER RESTANTE CONTINUA IGUAL DAQUI PRA BAIXO ==== */}
            {/* (mantive tudo como você enviou; sem alteração na UI/sections) */}

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
              {/* Sidebar */}
              <aside className="rounded-2xl border border-black/10 bg-white p-3 shadow-sm">
                <div className="space-y-1">
                  <SideButton icon={Home} label="Visão geral" value="overview" active={section === "overview"} onClick={setSection} />
                  <SideButton icon={CreditCard} label="Assinatura" value="subscription" active={section === "subscription"} onClick={setSection} />
                  <SideButton icon={ShieldCheck} label="Segurança" value="security" active={section === "security"} onClick={setSection} />
                  <SideButton icon={Monitor} label="Aparelhos" value="devices" active={section === "devices"} onClick={setSection} />
                </div>

                <div className="my-3 h-px bg-black/10" />

                <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-3">
                  <div className="text-xs font-semibold tracking-widest text-black/50">PERFIL ATIVO</div>

                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl border border-black/10 bg-black/[0.04] overflow-hidden flex items-center justify-center">
                      {activeProfile?.avatar_url ? (
                        <img src={activeProfile.avatar_url} alt={activeProfile?.name || "Perfil"} className="h-full w-full object-cover" />
                      ) : (
                        <div className="text-sm font-bold text-black">{initials(activeProfile?.name)}</div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{activeProfile?.name || "—"}</div>
                      <div className="text-[11px] text-black/50">
                        Limite: <span className="text-black font-semibold">{maturityLabel(activeProfile?.maturity_limit ?? 18)}</span>
                        {activeProfile?.is_kids ? <span className="ml-2">• Kids</span> : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  <button
                    type="button"
                    onClick={() => setSection("profiles")}
                    className={clsx(
                      "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-left transition",
                      section === "profiles" ? "bg-black text-white" : "hover:bg-black/5 text-black/80"
                    )}
                  >
                    <LayoutGrid className={clsx("h-4 w-4", section === "profiles" ? "text-white" : "text-black/60")} />
                    Perfis
                  </button>

                  <button
                    type="button"
                    onClick={() => setSection("parental")}
                    disabled={!selectedProfile}
                    className={clsx(
                      "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-left transition",
                      !selectedProfile ? "opacity-40 cursor-not-allowed" : "",
                      section === "parental" ? "bg-black text-white" : "hover:bg-black/5 text-black/80"
                    )}
                    title={!selectedProfile ? "Selecione um perfil primeiro" : "Controle parental"}
                  >
                    <Shield className={clsx("h-4 w-4", section === "parental" ? "text-white" : "text-black/60")} />
                    Controle parental
                  </button>

                  <button
                    type="button"
                    onClick={() => setSection("blocked")}
                    disabled={!selectedProfile}
                    className={clsx(
                      "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-left transition",
                      !selectedProfile ? "opacity-40 cursor-not-allowed" : "",
                      section === "blocked" ? "bg-black text-white" : "hover:bg-black/5 text-black/80"
                    )}
                    title={!selectedProfile ? "Selecione um perfil primeiro" : "Bloqueios"}
                  >
                    <Ban className={clsx("h-4 w-4", section === "blocked" ? "text-white" : "text-black/60")} />
                    Bloqueios
                  </button>
                </div>

                <div className="mt-3 rounded-2xl border border-black/10 bg-black/[0.02] p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-black/60">Perfis</div>
                    <div className="text-xs text-black font-semibold">{quotaText}</div>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-black/10 overflow-hidden">
                    <div className="h-full bg-black/40" style={{ width: `${Math.min(100, (used / Math.max(1, maxProfiles)) * 100)}%` }} />
                  </div>
                </div>
              </aside>

              {/* Conteúdo */}
              <section className="min-w-0 space-y-4">
                {/* Aparelhos */}
                {section === "devices" ? (
                  <RightCard title="Aparelhos" subtitle="Veja onde sua conta está conectada e desconecte quando necessário.">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-black/50">
                        Este aparelho: <span className="text-black/70 font-semibold">{thisDeviceId ? "Registrado" : "—"}</span>
                        {deviceKey ? <span className="ml-2 text-black/40">(device_key ok)</span> : null}
                      </div>

                      <button
                        type="button"
                        disabled={devicesLoading || !userId}
                        onClick={() => loadDevicesAndSessions(userId).catch(() => {})}
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 transition disabled:opacity-60"
                      >
                        Atualizar
                      </button>
                    </div>

                    {!thisDeviceId ? (
                      <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                        Não consegui registrar este aparelho. Verifique se você rodou o SQL das tabelas e RLS.
                      </div>
                    ) : null}

                    {(() => {
                      const active = (devices || []).filter((d) => !d?.is_revoked);
                      const sorted = [...active].sort((a, b) => {
                        if (a.id === thisDeviceId) return -1;
                        if (b.id === thisDeviceId) return 1;
                        const ta = new Date(a.last_seen_at || a.created_at || 0).getTime();
                        const tb = new Date(b.last_seen_at || b.created_at || 0).getTime();
                        return tb - ta;
                      });
                      const visible = sorted.slice(0, deviceLimit);
                      const hidden = sorted.length - visible.length;

                      return (
                        <>
                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs text-black/60">
                              Aparelhos: <span className="font-semibold text-black/80">{sorted.length}</span> • Limite do plano:{" "}
                              <span className="font-semibold text-black/80">{deviceLimit}</span>
                            </div>
                            {hidden > 0 ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={cleanupOldDevices}
                                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs hover:bg-black/5 transition disabled:opacity-60"
                              >
                                Limpar antigos
                              </button>
                            ) : null}
                          </div>

                          {hidden > 0 ? (
                            <div className="mt-2 text-xs text-black/50">
                              Mostrando apenas os {deviceLimit} mais recentes. Existem {hidden} aparelhos antigos.
                            </div>
                          ) : null}

                          <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
                            {visible.map((d) => {
                        const s = sessionByDevice.get(d.id);
                        const online = isOnline(s?.last_seen_at || d?.last_seen_at);
                        const playing = !!s?.is_playing && online;

                        const label = String(d.label || "").trim() || (d.id === thisDeviceId ? "Este aparelho" : "Aparelho");

                              return (
                                <div key={d.id} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-black truncate">{label}</div>
                                <div className="mt-1 text-[11px] text-black/50">
                                  Plataforma: <span className="text-black/70">{d.platform || "—"}</span>
                                </div>
                                <div className="mt-1 text-[11px] text-black/50">
                                  Visto: <span className="text-black/70">{relTime(s?.last_seen_at || d?.last_seen_at)}</span>
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-2 shrink-0">
                                <span
                                  className={clsx(
                                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px]",
                                    online ? "bg-emerald-600/10 text-emerald-700" : "bg-black/5 text-black/60"
                                  )}
                                >
                                  {online ? "Online" : "Offline"}
                                </span>

                                {playing ? (
                                  <span className="inline-flex items-center rounded-full bg-blue-600/10 px-2.5 py-1 text-[11px] text-blue-700">
                                    Em uso
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-black/60">
                                    {online ? "Ativo" : "Inativo"}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 gap-2">
                              <label className="block">
                                <div className="text-xs text-black/50 mb-1">Nome do aparelho</div>
                                <input
                                  value={renameMap[d.id] ?? ""}
                                  onChange={(e) => setRenameMap((p) => ({ ...p, [d.id]: e.target.value }))}
                                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                  placeholder="Ex: TV Sala, PC, TV do Quarto..."
                                />
                              </label>

                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => saveDeviceLabel(d.id)}
                                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 transition disabled:opacity-60"
                                >
                                  Salvar nome
                                </button>

                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => disconnectDevice(d)}
                                  className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 hover:bg-red-500/15 transition disabled:opacity-60"
                                >
                                  Desconectar
                                </button>
                              </div>

                              {d.id === thisDeviceId ? (
                                <div className="text-[11px] text-black/50">
                                  Este é o aparelho atual. Se você clicar em “Desconectar”, você será deslogado aqui imediatamente.
                                </div>
                              ) : null}

                            </div>
                          </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}

                    {!devicesLoading && (!devices || devices.filter((d) => !d?.is_revoked).length === 0) ? (
                      <div className="mt-4 text-sm text-black/60">Nenhum aparelho registrado ainda.</div>
                    ) : null}
                  </RightCard>
                ) : null}

                {/* Visão geral */}
                {section === "overview" ? (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <RightCard title="Resumo" subtitle="Informações gerais da sua conta.">
                      <div className="space-y-2 text-sm text-black/70">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-black/50">E-mail</span>
                          <span className="truncate">{userEmail || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-black/50">Plano</span>
                          <span className="truncate">{planInfo.plan || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-black/50">Status</span>
                          <span className="truncate">{planInfo.status || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-black/50">Perfis</span>
                          <span className="truncate">{quotaText}</span>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSection("profiles")}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 transition"
                        >
                          Gerenciar perfis
                        </button>
                        <button
                          type="button"
                          onClick={() => setSection("subscription")}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 transition"
                        >
                          Ver assinatura
                        </button>
                      </div>
                    </RightCard>

                    <RightCard title="Perfil ativo" subtitle="Perfil atualmente selecionado no app.">
                      {!activeProfile ? (
                        <div className="text-sm text-black/60">Nenhum perfil.</div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-xl border border-black/10 bg-black/[0.04] overflow-hidden flex items-center justify-center">
                            {activeProfile.avatar_url ? (
                              <img src={activeProfile.avatar_url} alt={activeProfile.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="text-sm font-bold text-black">{initials(activeProfile.name)}</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{activeProfile.name}</div>
                            <div className="text-xs text-black/50">
                              Limite: {maturityLabel(activeProfile.maturity_limit ?? 18)} {activeProfile.is_kids ? "• Kids" : ""}
                            </div>
                          </div>
                        </div>
                      )}
                    </RightCard>
                  </div>
                ) : null}

                {/* Assinatura */}
                {section === "subscription" ? (
                  <RightCard title="Assinatura" subtitle="Você pode trocar de plano. O plano atual segue ativo até o fim do ciclo.">
                    <div className="space-y-2 text-sm text-black/70">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-black/50">Plano atual</span>
                        <span>{planInfo.plan || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-black/50">Status</span>
                        <span>{planInfo.status || "—"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-black/50">Perfis permitidos</span>
                        <span>{maxProfiles}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-black/50">Qualidade máxima</span>
                        <span>{planInfo.max_quality || "—"}</span>
                      </div>

                      {planInfo.pending_plan ? (
                        <div className="mt-3 rounded-xl border border-black/10 bg-black/[0.02] px-4 py-3 text-sm text-black/70">
                          Troca agendada: <span className="font-semibold">{planInfo.pending_plan}</span>
                          {planInfo.pending_plan_effective_at ? (
                            <>
                              {" "}
                              (entra em vigor em{" "}
                              <span className="font-semibold">
                                {new Date(planInfo.pending_plan_effective_at).toLocaleDateString("pt-BR")}
                              </span>
                              )
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setNextPlan("");
                          setPlanModalOpen(true);
                        }}
                        className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-black/90 transition"
                      >
                        Trocar plano
                      </button>
                    </div>

                    <Modal open={planModalOpen} title="Trocar plano" onClose={() => setPlanModalOpen(false)}>
                      <div className="text-sm text-black/70">
                        O seu plano atual continua ativo até o fim do ciclo. O novo plano começa a valer na próxima renovação.
                      </div>

                      <div className="mt-4 space-y-2">
                        <label className="block">
                          <div className="text-xs text-black/50 mb-1">Selecione o novo plano</div>
                          <select
                            value={nextPlan}
                            onChange={(e) => setNextPlan(e.target.value)}
                            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                          >
                            <option value="">Selecione...</option>
                            <option value="prata">CineSuper Prata</option>
                            <option value="ouro">CineSuper Ouro</option>
                            <option value="diamante">CineSuper Diamante</option>
                          </select>
                        </label>

                        <div className="text-xs text-black/50">
                          Após confirmar, você continua com o plano atual até completar os 30 dias.
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPlanModalOpen(false)}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm hover:bg-black/5 transition"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={!nextPlan || busy}
                          onClick={async () => {
                            if (!nextPlan) return;
                            setBusy(true);
                            try {
                              const ok = await schedulePlanChange(nextPlan);
                              if (ok) setPlanModalOpen(false);
                            } finally {
                              setBusy(false);
                            }
                          }}
                          className={clsx(
                            "rounded-xl px-3 py-2 text-sm transition",
                            !nextPlan ? "bg-black/10 text-black/40 cursor-not-allowed" : "bg-black text-white hover:bg-black/90"
                          )}
                        >
                          Confirmar
                        </button>
                      </div>
                    </Modal>
                  </RightCard>
                ) : null}

                {/* Segurança */}
                {section === "security" ? (
                  <RightCard title="Segurança" subtitle="Atualize e-mail, celular e senha. Você também pode agendar exclusão da conta.">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-4">
                        <div className="text-sm font-semibold text-black">Dados da conta</div>

                        <div className="mt-3 space-y-3">
                          <label className="block">
                            <div className="text-xs text-black/50 mb-1">E-mail</div>
                            <input
                              value={secEmail}
                              onChange={(e) => setSecEmail(e.target.value)}
                              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                              placeholder="seuemail@dominio.com"
                            />
                            <div className="mt-1 text-[11px] text-black/50">
                              Alterar e-mail pode exigir confirmação no e-mail antigo/novo.
                            </div>
                          </label>

                          <label className="block">
                            <div className="text-xs text-black/50 mb-1">Celular</div>
                            <input
                              value={secPhone}
                              onChange={(e) => setSecPhone(formatPhoneBR(e.target.value))}
                              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                              placeholder="(11) 91234-5678"
                              inputMode="tel"
                            />
                          </label>
                        </div>

                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={saveSecurity}
                            disabled={busy}
                            className="rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-black/90 transition disabled:opacity-60"
                          >
                            Salvar
                          </button>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-4">
                        <div className="text-sm font-semibold text-black">Senha</div>

                        <div className="mt-3 space-y-3">
                          <label className="block">
                            <div className="text-xs text-black/50 mb-1">Nova senha</div>
                            <div className="relative">
                              <input
                                value={secPassword1}
                                onChange={(e) => setSecPassword1(e.target.value)}
                                type={showPass1 ? "text" : "password"}
                                className="w-full rounded-xl border border-black/10 bg-white pl-3 pr-11 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                placeholder="Mínimo 8 caracteres"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPass1((v) => !v)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-black/5"
                                aria-label="Mostrar/ocultar senha"
                              >
                                {showPass1 ? <EyeOff className="h-4 w-4 text-black/60" /> : <Eye className="h-4 w-4 text-black/60" />}
                              </button>
                            </div>
                          </label>

                          <label className="block">
                            <div className="text-xs text-black/50 mb-1">Confirmar senha</div>
                            <div className="relative">
                              <input
                                value={secPassword2}
                                onChange={(e) => setSecPassword2(e.target.value)}
                                type={showPass2 ? "text" : "password"}
                                className="w-full rounded-xl border border-black/10 bg-white pl-3 pr-11 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                placeholder="Repita a senha"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPass2((v) => !v)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-black/5"
                                aria-label="Mostrar/ocultar senha"
                              >
                                {showPass2 ? <EyeOff className="h-4 w-4 text-black/60" /> : <Eye className="h-4 w-4 text-black/60" />}
                              </button>
                            </div>
                            {(secPassword1 || secPassword2) && secPassword1 !== secPassword2 ? (
                              <div className="mt-1 text-[11px] text-red-700">As senhas não conferem.</div>
                            ) : null}
                          </label>

                          <div className="text-[11px] text-black/50">
                            Para trocar a senha, preencha os 2 campos e clique em “Salvar”.
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                          <div className="text-sm font-semibold text-red-800">Excluir conta</div>
                          <div className="mt-1 text-xs text-red-800/80">
                            Sua assinatura permanece ativa até o fim do ciclo. Ao finalizar, a conta é excluída automaticamente.
                          </div>

                          {planInfo.pending_delete ? (
                            <div className="mt-2 text-xs text-red-900">
                              Exclusão agendada para{" "}
                              <span className="font-semibold">
                                {planInfo.pending_delete_at
                                  ? new Date(planInfo.pending_delete_at).toLocaleDateString("pt-BR")
                                  : "o fim do ciclo"}
                              </span>
                              .
                            </div>
                          ) : null}

                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={requestDeleteAccount}
                              disabled={busy || planInfo.pending_delete}
                              className={clsx(
                                "rounded-xl px-4 py-2 text-sm transition",
                                planInfo.pending_delete ? "bg-red-900/10 text-red-900/40 cursor-not-allowed" : "bg-red-700 text-white hover:bg-red-800"
                              )}
                            >
                              Excluir conta
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </RightCard>
                ) : null}

                {/* Perfis */}
                {section === "profiles" ? (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_520px]">
                    <RightCard title="Perfis" subtitle="Clique em um perfil para editar (abre ao lado).">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-black/50">Seus perfis</div>
                        {loading ? <div className="text-xs text-black/40">Carregando...</div> : null}
                      </div>

                      <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                        {(profiles || []).map((p) => (
                          <ProfileCard
                            key={p.id}
                            p={p}
                            isSelected={p.id === selectedId}
                            isActive={p.id === activeProfileId}
                            onSelect={handleSelectProfile}
                            onSetActive={setActive}
                            onEdit={openEditInline}
                            onDelete={deleteProfile}
                            initials={initials}
                            maturityLabel={maturityLabel}
                          />
                        ))}
                      </div>

                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={openCreateInline}
                          disabled={!canAddMore}
                          className={clsx(
                            "w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition border",
                            canAddMore ? "bg-black text-white border-black hover:bg-black/90" : "bg-black/5 text-black/40 border-black/10 cursor-not-allowed"
                          )}
                        >
                          <Plus className="h-4 w-4" />
                          Adicionar perfil
                        </button>
                      </div>
                    </RightCard>

                    <EditorPanel
                      editorMode={editorMode}
                      selectedProfile={selectedProfile}
                      busy={busy}
                      fName={fName}
                      setFName={setFName}
                      fGender={fGender}
                      setFGender={setFGender}
                      fKids={fKids}
                      setFKids={setFKids}
                      fMaturity={fMaturity}
                      setFMaturity={setFMaturity}
                      fRequirePin={fRequirePin}
                      setFRequirePin={setFRequirePin}
                      fPin={fPin}
                      setFPin={setFPin}
                      fPinSet={fPinSet}
                      fPinClear={fPinClear}
                      setFPinClear={setFPinClear}
                      fKidsGenres={fKidsGenres}
                      setFKidsGenres={setFKidsGenres}
                      toggleKidsGenre={toggleKidsGenre}
                      fAvatarPreviewUrl={fAvatarPreviewUrl}
                      fAvatarFile={fAvatarFile}
                      onPickAvatarClick={onPickAvatarClick}
                      onRemoveAvatar={onRemoveAvatar}
                      saveEditor={saveEditor}
                      setActive={setActive}
                      deleteProfile={deleteProfile}
                    />
                  </div>
                ) : null}

                {/* Controle parental */}
                {section === "parental" ? (
                  <RightCard
                    title="Controle parental"
                    subtitle={!selectedProfile ? "Selecione um perfil em “Perfis”." : `Configurando: ${selectedProfile.name}`}
                  >
                    {!selectedProfile ? (
                      <div className="text-sm text-black/60">Vá em “Perfis”, clique em um perfil e volte aqui.</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-4">
                          <div className="text-sm font-semibold text-black">Classificação etária</div>
                          <div className="mt-1 text-xs text-black/50">Máximo de maturidade permitido.</div>

                          <div className="mt-3">
                            <select
                              value={selectedProfile.maturity_limit ?? 18}
                              onChange={async (e) => {
                                const v = Number(e.target.value);
                                const next = selectedProfile.is_kids ? Math.min(v, 12) : v;

                                const { error } = await supabase
                                  .from("user_profiles")
                                  .update({ maturity_limit: next })
                                  .eq("id", selectedProfile.id);

                                if (error) return toastError("Falha ao atualizar limite etário.");
                                await loadProfiles(userId);
                                toastOk("Limite etário atualizado.");
                              }}
                              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            >
                              {MATURITY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {selectedProfile.is_kids ? (
                            <div className="mt-2 text-[11px] text-black/50">Perfil Kids: recomendado manter no máximo 12.</div>
                          ) : null}
                        </div>

                        <div className="rounded-2xl border border-black/10 bg-black/[0.02] p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-black">
                            <Lock className="h-4 w-4" />
                            PIN e segurança
                          </div>

                          <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-3 py-2">
                            <div className="min-w-0">
                              <div className="text-sm text-black/80">Exigir PIN</div>
                              <div className="text-[11px] text-black/50">Solicita PIN para restrições.</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={!!selectedProfile.require_pin}
                              onChange={async (e) => {
                                if (e.target.checked && !selectedProfile.pin_set) {
                                  toastError("Defina um PIN no perfil antes de ativar.");
                                  return;
                                }
                                const { error } = await supabase
                                  .from("user_profiles")
                                  .update({ require_pin: e.target.checked })
                                  .eq("id", selectedProfile.id);
                                if (error) return toastError("Falha ao atualizar configuração de PIN.");
                                await loadProfiles(userId);
                                toastOk("Configuração de PIN atualizada.");
                              }}
                              className="h-4 w-4"
                            />
                          </label>

                          <div className="mt-3 text-xs text-black/50">
                            Para alterar PIN e gêneros Kids, abra o perfil em “Perfis” (editor ao lado).
                          </div>
                        </div>
                      </div>
                    )}
                  </RightCard>
                ) : null}

                {/* Bloqueios */}
                {section === "blocked" ? (
                  <RightCard
                    title="Títulos bloqueados"
                    subtitle={!selectedProfile ? "Selecione um perfil em “Perfis”." : `Configurando: ${selectedProfile.name}`}
                  >
                    {!selectedProfile ? (
                      <div className="text-sm text-black/60">Selecione um perfil na seção Perfis.</div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-black">Bloquear títulos</div>
                          {blockLoading ? <div className="text-xs text-black/50">Carregando...</div> : null}
                        </div>

                        <div className="mt-3 rounded-2xl border border-black/10 bg-black/[0.02] p-4">
                          <div className="text-xs text-black/50 mb-2">Buscar título</div>

                          <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40">
                              <Search className="h-4 w-4" />
                            </div>
                            <input
                              value={titleQuery}
                              onChange={(e) => setTitleQuery(e.target.value)}
                              placeholder="Digite pelo menos 2 letras..."
                              className="w-full rounded-xl border border-black/10 bg-white pl-10 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            />
                          </div>

                          {searchingTitles ? <div className="mt-2 text-xs text-black/50">Buscando...</div> : null}

                          {titleResults.length ? (
                            <div className="mt-3 rounded-xl border border-black/10 bg-white overflow-hidden">
                              {titleResults.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => blockTitle(t.id)}
                                  className="w-full px-3 py-2 text-left hover:bg-black/5 transition flex items-center justify-between gap-3 disabled:opacity-60"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm text-black truncate">{t.title}</div>
                                    <div className="text-[11px] text-black/50">Maturity: {maturityLabel(t.maturity)}</div>
                                  </div>
                                  <span className="text-xs text-black/60">Bloquear</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div className="mt-4 rounded-2xl border border-black/10 bg-black/[0.02] p-4">
                          <div className="text-xs text-black/50 mb-2">Bloqueados</div>

                          {blocked.length === 0 ? (
                            <div className="text-sm text-black/60">Nenhum título bloqueado.</div>
                          ) : (
                            <div className="space-y-2">
                              {blocked.map((b) => (
                                <div
                                  key={b.id}
                                  className="rounded-xl border border-black/10 bg-white px-3 py-2 flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm text-black truncate">{b?.titles?.title || "Título"}</div>
                                    <div className="text-[11px] text-black/50">Maturity: {maturityLabel(b?.titles?.maturity)}</div>
                                  </div>

                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => unblockTitle(b.title_id)}
                                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs hover:bg-black/5 transition disabled:opacity-60"
                                  >
                                    Remover
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </RightCard>
                ) : null}
              </section>
            </div>
          </div>
        </Container>
      </main>

      <Footer />
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onAvatarFileChange} />
    </div>
  );
}
