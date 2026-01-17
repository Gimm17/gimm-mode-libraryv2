// app.js (public)
// - Loads prompts from ./content/library.json (creator-managed via /admin)
// - Falls back to data.js if library.json fails
// - Adds: pinned, favorites, popular/newest, tag chips, copy link/share, export JSON, about modal

const $ = (sel) => document.querySelector(sel);
const root = document.documentElement;

// Main UI
const cardsEl = $("#cards");
const searchInput = $("#searchInput");
const filterSelect = $("#filterSelect");
const sortSelect = $("#sortSelect");
const toastWrap = $("#toastWrap");
const btnTheme = $("#btnTheme");
const btnAbout = $("#btnAbout");
const brandBtn = $("#brandBtn");
const statusBar = $("#statusBar");
const tagChips = $("#tagChips");
const popularRow = $("#popularRow");
const newestRow = $("#newestRow");

// Modal
const modalBackdrop = $("#modalBackdrop");
const closeModalBtn = $("#closeModal");
const modalTitle = $("#modalTitle");
const modalDesc = $("#modalDesc");
const modalTags = $("#modalTags");
const modalPrompt = $("#modalPrompt");
const modalHow = $("#modalHow");
const modalExamples = $("#modalExamples");
const copyPromptBtn = $("#copyPromptBtn");
const usePromptBtn = $("#usePromptBtn");
const copyCommandBtn = $("#copyCommandBtn");
const copyLinkBtn = $("#copyLinkBtn");
const shareBtn = $("#shareBtn");
const favBtn = $("#favBtn");
const pinBtn = $("#pinBtn");

// Quick buttons
const copyMasterBtn = $("#copyMasterBtn");
const useMasterBtn = $("#useMasterBtn");
const copyCIBtn = $("#copyCIBtn");
const exportJsonBtn = $("#exportJsonBtn");

// About modal
const aboutBackdrop = $("#aboutBackdrop");
const closeAboutBtn = $("#closeAbout");
const copySiteLinkBtn = $("#copySiteLinkBtn");

// Keys
const KEY_THEME = "gimm_theme";
const KEY_FAVS = "gimm_favs";
const KEY_PINS = "gimm_pins";
const KEY_USAGE = "gimm_usage"; // { [id]: number }

// State
let currentMode = null;
let masterPrompt = "";
let modes = [];

// ------------------------------
// Toast
// ------------------------------
function showToast(text) {
  toastWrap.classList.remove("hidden");
  toastWrap.innerHTML = `
    <div class="toast px-4 py-3 rounded-2xl bg-white text-black border border-black/10 shadow-xl text-sm font-semibold">
      ${text}
    </div>
  `;
  setTimeout(() => toastWrap.classList.add("hidden"), 1400);
}

// ------------------------------
// Clipboard
// ------------------------------
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied ✅");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("Copied ✅");
  }
}

// Use prompt: copy then open ChatGPT (most reliable)
async function usePromptSmart(promptText) {
  if (!promptText) return showToast("Prompt kosong / belum diisi.");
  await copyToClipboard(promptText);
  const w = window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
  if (!w) {
    showToast("Popup diblokir. Prompt sudah dicopy ✅ Buka chatgpt.com lalu paste.");
  } else {
    showToast("Prompt dicopy ✅ tinggal paste di ChatGPT.");
  }
}

// ------------------------------
// Local storage helpers
// ------------------------------
function safeGetJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const obj = JSON.parse(raw);
    return obj ?? fallback;
  } catch {
    return fallback;
  }
}

function safeSetJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

// Favorites
function getFavs() {
  const arr = safeGetJSON(KEY_FAVS, []);
  return Array.isArray(arr) ? arr : [];
}
function isFav(id) {
  return getFavs().includes(id);
}
function toggleFav(id) {
  const favs = getFavs();
  const i = favs.indexOf(id);
  if (i >= 0) favs.splice(i, 1);
  else favs.push(id);
  safeSetJSON(KEY_FAVS, favs);
}

// Pins (separate from fav)
function getPins() {
  const arr = safeGetJSON(KEY_PINS, []);
  return Array.isArray(arr) ? arr : [];
}
function isPinned(id) {
  return getPins().includes(id);
}
function togglePin(id) {
  const pins = getPins();
  const i = pins.indexOf(id);
  if (i >= 0) pins.splice(i, 1);
  else pins.push(id);
  safeSetJSON(KEY_PINS, pins);
}

// Usage
function getUsage() {
  const obj = safeGetJSON(KEY_USAGE, {});
  return obj && typeof obj === "object" ? obj : {};
}
function bumpUsage(id, add = 1) {
  const u = getUsage();
  u[id] = (u[id] || 0) + add;
  safeSetJSON(KEY_USAGE, u);
}
function usageCount(id) {
  const u = getUsage();
  return Number(u[id] || 0);
}

// ------------------------------
// Filters / Sort
// ------------------------------
function matchesQuery(mode, q) {
  if (!q) return true;
  const hay = (
    (mode.name || "") +
    " " +
    (mode.desc || "") +
    " " +
    (mode.command || "") +
    " " +
    (mode.tags || []).join(" ")
  ).toLowerCase();
  return hay.includes(q.toLowerCase());
}

function matchesFilter(mode, f) {
  if (!f || f === "all") return true;
  if (f === "favorites") return isFav(mode.id);
  if (f === "pinned") return isPinned(mode.id);
  return mode.category === f;
}

function compareSmart(a, b) {
  // 1) pinned
  const ap = isPinned(a.id) ? 1 : 0;
  const bp = isPinned(b.id) ? 1 : 0;
  if (ap !== bp) return bp - ap;

  // 2) favorites
  const af = isFav(a.id) ? 1 : 0;
  const bf = isFav(b.id) ? 1 : 0;
  if (af !== bf) return bf - af;

  // 3) popular (usage)
  const au = usageCount(a.id);
  const bu = usageCount(b.id);
  if (au !== bu) return bu - au;

  // 4) name
  return (a.name || "").localeCompare(b.name || "");
}

function compareNewest(a, b) {
  // Prefer updatedAt if exists; else fallback to original order
  const at = Date.parse(a.updatedAt || "") || 0;
  const bt = Date.parse(b.updatedAt || "") || 0;
  if (at !== bt) return bt - at;
  return (b._order || 0) - (a._order || 0);
}

function comparePopular(a, b) {
  const au = usageCount(a.id);
  const bu = usageCount(b.id);
  if (au !== bu) return bu - au;
  return compareSmart(a, b);
}

function compareName(a, b) {
  return (a.name || "").localeCompare(b.name || "");
}

function getComparator() {
  const s = sortSelect?.value || "smart";
  if (s === "newest") return compareNewest;
  if (s === "popular") return comparePopular;
  if (s === "name") return compareName;
  return compareSmart;
}

// ------------------------------
// URL helpers: #mode=lyra
// ------------------------------
function modeLink(id) {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#mode=${encodeURIComponent(id)}`;
}

function readModeFromHash() {
  const h = (location.hash || "").replace(/^#/, "");
  if (!h) return null;
  const params = new URLSearchParams(h);
  return params.get("mode");
}

function setHashMode(id) {
  const params = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  if (id) params.set("mode", id);
  else params.delete("mode");
  const str = params.toString();
  history.replaceState(null, "", str ? `#${str}` : location.pathname);
}

// ------------------------------
// Render helpers
// ------------------------------
function renderTagChips() {
  if (!tagChips) return;
  const map = new Map();
  modes.forEach((m) => {
    (m.tags || []).forEach((t) => {
      const key = String(t || "").trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + 1);
    });
  });

  const list = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([t]) => t);

  tagChips.innerHTML = list
    .map(
      (t) =>
        `<button class="chip-btn btn-press text-[11px] px-2 py-1 rounded-full bg-black/30 border border-soft muted" data-tag="${encodeURIComponent(
          t,
        )}">${t}</button>`,
    )
    .join("");
}

function renderHighlights() {
  // Popular (local)
  if (popularRow) {
    const top = [...modes]
      .sort(comparePopular)
      .filter((m) => usageCount(m.id) > 0)
      .slice(0, 8);

    popularRow.innerHTML = top.length
      ? top
          .map(
            (m) =>
              `<button class="chip-btn btn-press px-3 py-2 rounded-2xl panel-dark border border-soft text-sm" data-open="${m.id}">${m.icon || "✨"} ${m.name} <span class="muted text-xs">(${usageCount(
                m.id,
              )})</span></button>`,
          )
          .join("")
      : `<span class="muted text-sm">Belum ada. Coba klik “Use Prompt” beberapa kali dulu 😄</span>`;
  }

  // Newest
  if (newestRow) {
    const top = [...modes].sort(compareNewest).slice(0, 8);
    newestRow.innerHTML = top
      .map(
        (m) =>
          `<button class="chip-btn btn-press px-3 py-2 rounded-2xl panel-dark border border-soft text-sm" data-open="${m.id}">${m.icon || "✨"} ${m.name}</button>`,
      )
      .join("");
  }
}

function renderCards() {
  const q = searchInput.value.trim();
  const f = filterSelect.value;
  const comparator = getComparator();

  const filtered = modes
    .filter((m) => matchesQuery(m, q) && matchesFilter(m, f))
    .sort(comparator);

  cardsEl.innerHTML =
    filtered
      .map((m, idx) => {
        const star = isFav(m.id) ? "⭐" : "☆";
        const pin = isPinned(m.id) ? "📌" : "📍";
        const usage = usageCount(m.id);
        const delay = Math.min(idx, 18) * 25; // ms

        return `
      <article class="card-hover card-enter rounded-3xl border border-white/10 border-soft bg-white/5 panel-dark p-5" style="animation-delay:${delay}ms">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-black/30 border border-soft flex items-center justify-center">
              <span class="text-lg">${m.icon || "✨"}</span>
            </div>
            <div>
              <h3 class="font-bold text-lg">${m.name || "MODE"}</h3>
              <p class="text-xs muted">${m.desc || ""}</p>
              ${
                usage > 0
                  ? `<div class="mt-1 text-[11px] muted">dipakai: ${usage}x</div>`
                  : ``
              }
            </div>
          </div>

          <div class="flex flex-col items-end gap-2">
            <div class="flex items-center gap-2">
              <button class="btn-press px-2 py-1 rounded-xl panel-dark border border-soft text-xs" data-action="pin" data-id="${m.id}" title="Pin">
                ${pin}
              </button>
              <button class="btn-press px-2 py-1 rounded-xl panel-dark border border-soft text-xs" data-action="fav" data-id="${m.id}" title="Favorite">
                ${star}
              </button>
            </div>
            <span class="text-xs px-2 py-1 rounded-full bg-black/30 border border-soft muted">${m.category || "misc"}</span>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          ${(m.tags || [])
            .slice(0, 6)
            .map(
              (t) =>
                `<button class="chip-btn btn-press text-[11px] px-2 py-1 rounded-full bg-black/30 border border-soft muted" data-tag="${encodeURIComponent(
                  t,
                )}">${t}</button>`,
            )
            .join("")}
        </div>

        <div class="mt-5 grid grid-cols-2 gap-2">
          <button class="btn-press px-3 py-2 rounded-xl bg-white text-black text-sm font-semibold hover:opacity-90" data-action="open" data-id="${m.id}">
            Open
          </button>
          <button class="btn-press px-3 py-2 rounded-xl panel-dark border border-soft text-sm" data-action="quickUse" data-id="${m.id}">
            Use Prompt
          </button>
        </div>
      </article>
    `;
      })
      .join("") ||
    `
    <div class="muted text-sm p-6 rounded-3xl border border-soft panel-dark">
      Tidak ada hasil. Coba kata kunci lain.
    </div>
  `;
}

// ------------------------------
// Modal
// ------------------------------
function refreshFavBtn() {
  if (!currentMode) return;
  favBtn.textContent = isFav(currentMode.id) ? "⭐ Remove Favorite" : "⭐ Favorite";
}

function refreshPinBtn() {
  if (!currentMode) return;
  pinBtn.textContent = isPinned(currentMode.id) ? "📌 Unpin" : "📌 Pin";
}

function openModalById(id, opts = {}) {
  const m = modes.find((x) => x.id === id);
  if (!m) return;
  currentMode = m;

  // bump usage lightly on open
  bumpUsage(id, 1);

  modalTitle.textContent = `${m.icon || "✨"} ${m.name || ""}`;
  modalDesc.textContent = m.desc || "";

  modalTags.innerHTML = (m.tags || [])
    .map(
      (t) =>
        `<button class="chip-btn btn-press text-[11px] px-2 py-1 rounded-full bg-black/30 border border-soft muted" data-tag="${encodeURIComponent(
          t,
        )}">${t}</button>`,
    )
    .join("");

  modalPrompt.value = m.prompt || "";
  modalHow.innerHTML = (m.how || []).map((x) => `<li>${x}</li>`).join("");
  modalExamples.textContent = m.examples || "";

  refreshFavBtn();
  refreshPinBtn();

  modalBackdrop.classList.remove("hidden");

  // keep hash so shareable
  if (!opts.noHash) setHashMode(id);

  renderHighlights();
  renderCards();
}

function closeModal() {
  modalBackdrop.classList.add("hidden");
  currentMode = null;
  // clear mode hash, keep other hash params if any
  setHashMode(null);
}

// ------------------------------
// About modal
// ------------------------------
function openAbout() {
  aboutBackdrop.classList.remove("hidden");
}
function closeAbout() {
  aboutBackdrop.classList.add("hidden");
}

// ------------------------------
// Theme
// ------------------------------
function setTheme(theme) {
  if (theme === "light") {
    root.setAttribute("data-theme", "light");
    btnTheme.textContent = "☀️ Light";
  } else {
    root.removeAttribute("data-theme");
    btnTheme.textContent = "🌙 Dark";
  }
  localStorage.setItem(KEY_THEME, theme);
}

// ------------------------------
// Load library from CMS-managed JSON
// ------------------------------
async function loadLibrary() {
  // defaults from data.js fallback
  masterPrompt = typeof DEFAULT_MASTER_CONTROL_PROMPT === "string" ? DEFAULT_MASTER_CONTROL_PROMPT : "";
  modes = Array.isArray(DEFAULT_MODES) ? DEFAULT_MODES : [];

  try {
    const res = await fetch("./content/library.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load library.json");
    const data = await res.json();

    if (typeof data.masterPrompt === "string") masterPrompt = data.masterPrompt;
    if (Array.isArray(data.modes)) modes = data.modes;

    statusBar.textContent = "✅ Library loaded (creator-managed).";
  } catch {
    statusBar.textContent = "⚠️ Gagal load library.json, pakai fallback default.";
  }

  // attach stable order index
  modes = modes.map((m, i) => ({ ...m, _order: i }));
}

// ------------------------------
// Export JSON
// ------------------------------
function exportJSON() {
  const payload = {
    masterPrompt: masterPrompt || "",
    modes: modes.map((m) => {
      const { _order, ...rest } = m;
      return rest;
    }),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gimm-mode-library.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Exported ✅");
}

// ------------------------------
// Events
// ------------------------------
cardsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id;

  // tag click from cards
  if (btn.dataset.tag) {
    const tag = decodeURIComponent(btn.dataset.tag);
    searchInput.value = tag;
    renderCards();
    showToast(`Cari: ${tag}`);
    return;
  }

  if (!action) return;

  if (action === "open") {
    openModalById(id);
    return;
  }

  if (action === "quickUse") {
    const m = modes.find((x) => x.id === id);
    if (!m?.prompt) return showToast("Prompt belum diisi.");
    bumpUsage(id, 2);
    usePromptSmart(m.prompt);
    renderHighlights();
    renderCards();
    return;
  }

  if (action === "fav") {
    toggleFav(id);
    renderCards();
    showToast(isFav(id) ? "Added ⭐" : "Removed ☆");
    return;
  }

  if (action === "pin") {
    togglePin(id);
    renderCards();
    showToast(isPinned(id) ? "Pinned 📌" : "Unpinned");
    return;
  }
});

// tag chips row click
if (tagChips) {
  tagChips.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b?.dataset.tag) return;
    const tag = decodeURIComponent(b.dataset.tag);
    searchInput.value = tag;
    renderCards();
    showToast(`Cari: ${tag}`);
  });
}

// highlights click -> open modal
function bindHighlights(container) {
  if (!container) return;
  container.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const id = b.dataset.open;
    if (!id) return;
    openModalById(id);
  });
}
bindHighlights(popularRow);
bindHighlights(newestRow);

// Modal events
closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!modalBackdrop.classList.contains("hidden")) closeModal();
    if (!aboutBackdrop.classList.contains("hidden")) closeAbout();
  }
});

// Tag chips inside modal
modalTags.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b?.dataset.tag) return;
  const tag = decodeURIComponent(b.dataset.tag);
  // close modal, search by tag
  closeModal();
  searchInput.value = tag;
  renderCards();
  showToast(`Cari: ${tag}`);
});

copyPromptBtn.addEventListener("click", () => {
  if (!currentMode) return;
  bumpUsage(currentMode.id, 2);
  copyToClipboard(currentMode.prompt || "");
  renderHighlights();
  renderCards();
});

usePromptBtn.addEventListener("click", () => {
  if (!currentMode) return;
  bumpUsage(currentMode.id, 3);
  usePromptSmart(currentMode.prompt || "");
  renderHighlights();
  renderCards();
});

copyCommandBtn.addEventListener("click", () => {
  if (!currentMode) return;
  copyToClipboard(currentMode.command || `Mode: ${currentMode.name}`);
});

copyLinkBtn.addEventListener("click", () => {
  if (!currentMode) return;
  copyToClipboard(modeLink(currentMode.id));
});

shareBtn.addEventListener("click", async () => {
  if (!currentMode) return;
  const url = modeLink(currentMode.id);
  const title = `Gimm Mode Library — ${currentMode.name}`;
  const text = `Nih mode ${currentMode.name}. Tinggal buka, copy prompt, paste ke ChatGPT.`;

  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      showToast("Shared ✅");
    } else {
      await copyToClipboard(url);
      showToast("Link dicopy ✅");
    }
  } catch {
    // user cancelled or blocked
    await copyToClipboard(url);
    showToast("Link dicopy ✅");
  }
});

favBtn.addEventListener("click", () => {
  if (!currentMode) return;
  toggleFav(currentMode.id);
  refreshFavBtn();
  renderCards();
  showToast(isFav(currentMode.id) ? "Added ⭐" : "Removed ☆");
});

pinBtn.addEventListener("click", () => {
  if (!currentMode) return;
  togglePin(currentMode.id);
  refreshPinBtn();
  renderCards();
  showToast(isPinned(currentMode.id) ? "Pinned 📌" : "Unpinned");
});

// Quick buttons
copyMasterBtn.addEventListener("click", () =>
  masterPrompt ? copyToClipboard(masterPrompt) : showToast("Master prompt kosong."),
);
useMasterBtn.addEventListener("click", () =>
  masterPrompt ? usePromptSmart(masterPrompt) : showToast("Master prompt kosong."),
);
copyCIBtn.addEventListener("click", () => {
  if (typeof CUSTOM_INSTRUCTIONS_SNIPPET !== "string") return showToast("CI snippet kosong.");
  copyToClipboard(CUSTOM_INSTRUCTIONS_SNIPPET);
});
exportJsonBtn.addEventListener("click", exportJSON);

// Search / filter / sort
searchInput.addEventListener("input", renderCards);
filterSelect.addEventListener("change", renderCards);
sortSelect?.addEventListener("change", renderCards);

// Theme
btnTheme.addEventListener("click", () => {
  const cur = localStorage.getItem(KEY_THEME) || "dark";
  setTheme(cur === "dark" ? "light" : "dark");
});

// About
btnAbout.addEventListener("click", openAbout);
closeAboutBtn.addEventListener("click", closeAbout);
aboutBackdrop.addEventListener("click", (e) => {
  if (e.target === aboutBackdrop) closeAbout();
});
copySiteLinkBtn.addEventListener("click", () => copyToClipboard(`${location.origin}${location.pathname}`));

// Hidden admin link: click logo 7x -> /admin
let brandClicks = 0;
let brandTimer = null;
brandBtn.addEventListener("click", () => {
  brandClicks++;
  clearTimeout(brandTimer);
  brandTimer = setTimeout(() => {
    brandClicks = 0;
  }, 1200);

  if (brandClicks >= 7) {
    brandClicks = 0;
    window.location.href = "/admin/";
  }
});

// ------------------------------
// Init
// ------------------------------
(async function init() {
  setTheme(localStorage.getItem(KEY_THEME) || "dark");
  await loadLibrary();

  renderTagChips();
  renderHighlights();
  renderCards();

  // If URL has #mode=..., open it
  const id = readModeFromHash();
  if (id) {
    const exists = modes.some((m) => m.id === id);
    if (exists) openModalById(id, { noHash: true });
  }

  // Also respond to hash changes (share link)
  window.addEventListener("hashchange", () => {
    const newId = readModeFromHash();
    if (newId && modes.some((m) => m.id === newId)) openModalById(newId, { noHash: true });
  });
})();
