// ============================================================
// Stay – Userscript Manager
// All data lives in localStorage as JSON. No native alert/confirm
// is used anywhere — see showToast() and openConfirm() below.
// ============================================================

const STORAGE_KEY = "stay_scripts_v1";

const el = (id) => document.getElementById(id);

const homeScreen   = el("homeScreen");
const editorScreen = el("editorScreen");
const scriptList   = el("scriptList");
const emptyState   = el("emptyState");
const searchInput  = el("searchInput");

let scripts = loadScripts();
let editingId = null; // null = creating a new script

// ---------- storage helpers ----------
function loadScripts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveScripts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

function uid() {
  return "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- toast system (replaces alert()) ----------
function showToast(message, type = "info", duration = 2600) {
  const container = el("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="dot-status"></span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("out");
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

// ---------- confirm modal (replaces confirm()) ----------
function openConfirm(text, onConfirm) {
  const modal = el("confirmModal");
  el("confirmText").textContent = text;
  modal.hidden = false;

  const ok = el("confirmOk");
  const cancel = el("confirmCancel");

  const cleanup = () => {
    modal.hidden = true;
    ok.removeEventListener("click", okHandler);
    cancel.removeEventListener("click", cancelHandler);
  };
  const okHandler = () => { cleanup(); onConfirm(); };
  const cancelHandler = () => cleanup();

  ok.addEventListener("click", okHandler);
  cancel.addEventListener("click", cancelHandler);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ---------- rendering ----------
function renderList() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = scripts.filter(
    (s) => s.name.toLowerCase().includes(query) || s.match.toLowerCase().includes(query)
  );

  scriptList.innerHTML = "";
  emptyState.hidden = scripts.length !== 0;

  if (scripts.length === 0) return;

  filtered.forEach((script) => {
    const card = document.createElement("div");
    card.className = "script-card" + (script.enabled ? " enabled" : "");
    card.innerHTML = `
      <div class="bar"></div>
      <div class="script-main">
        <div class="script-name">${escapeHtml(script.name || "untitled")}</div>
        <div class="script-match">${escapeHtml(script.match || "*://*/*")}</div>
        <div class="script-status">${script.enabled ? "● active" : "○ paused"}</div>
      </div>
      <div class="toggle ${script.enabled ? "on" : ""}" data-id="${script.id}"></div>
    `;
    card.querySelector(".script-main").addEventListener("click", () => openEditor(script.id));
    card.querySelector(".toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleScript(script.id);
    });
    scriptList.appendChild(card);
  });
}

function toggleScript(id) {
  const s = scripts.find((x) => x.id === id);
  if (!s) return;
  s.enabled = !s.enabled;
  saveScripts();
  renderList();
  showToast(s.enabled ? `"${s.name}" activated` : `"${s.name}" paused`, s.enabled ? "success" : "info");
}

searchInput.addEventListener("input", renderList);

// ---------- navigation ----------
function showHome() {
  editorScreen.hidden = true;
  homeScreen.hidden = false;
  renderList();
}

function openEditor(id) {
  editingId = id;
  const s = id ? scripts.find((x) => x.id === id) : null;

  el("editorTitle").textContent = s ? s.name || "untitled" : "new_script";
  el("nameInput").value = s ? s.name : "";
  el("matchInput").value = s ? s.match : "*://*/*";
  el("runAtInput").value = s ? s.runAt : "document-idle";
  el("codeInput").value = s ? s.code : "";
  el("deleteBtn").hidden = !s;

  homeScreen.hidden = true;
  editorScreen.hidden = false;
}

el("fabAdd").addEventListener("click", () => openEditor(null));
el("backBtn").addEventListener("click", showHome);

// ---------- save / delete ----------
el("saveBtn").addEventListener("click", () => {
  const name = el("nameInput").value.trim();
  const match = el("matchInput").value.trim() || "*://*/*";
  const runAt = el("runAtInput").value;
  const code = el("codeInput").value;

  if (!name) {
    showToast("Give the script a name first", "error");
    return;
  }
  if (!code.trim()) {
    showToast("Script code is empty", "error");
    return;
  }

  if (editingId) {
    const s = scripts.find((x) => x.id === editingId);
    Object.assign(s, { name, match, runAt, code });
    showToast("Script updated", "success");
  } else {
    scripts.push({
      id: uid(),
      name, match, runAt, code,
      enabled: true,
      createdAt: Date.now(),
    });
    showToast("Script saved", "success");
  }
  saveScripts();
  showHome();
});

el("deleteBtn").addEventListener("click", () => {
  const s = scripts.find((x) => x.id === editingId);
  if (!s) return;
  openConfirm(`Delete "${s.name}"? This can't be undone.`, () => {
    scripts = scripts.filter((x) => x.id !== editingId);
    saveScripts();
    showToast("Script deleted", "info");
    showHome();
  });
});

// ---------- bookmarklet ----------
function buildBookmarklet(code) {
  // Wraps the user's script so it runs in an IIFE on the current page.
  const wrapped = `(function(){try{${code}}catch(e){console.error('Stay script error:',e);}})();`;
  return "javascript:" + encodeURIComponent(wrapped);
}

el("bookmarkletBtn").addEventListener("click", () => {
  const code = el("codeInput").value;
  if (!code.trim()) {
    showToast("Write some code first", "error");
    return;
  }
  el("bmCode").value = buildBookmarklet(code);
  el("bmModal").hidden = false;
});

el("bmCloseBtn").addEventListener("click", () => (el("bmModal").hidden = true));

el("bmCopyBtn").addEventListener("click", async () => {
  const text = el("bmCode").value;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Bookmarklet link copied", "success");
  } catch (e) {
    el("bmCode").select();
    document.execCommand("copy");
    showToast("Copied", "success");
  }
});

// ---------- how it works modal ----------
el("howBtn").addEventListener("click", () => {
  el("menuSheet").hidden = true;
  el("howModal").hidden = false;
});
el("howCloseBtn").addEventListener("click", () => (el("howModal").hidden = true));

// ---------- menu sheet ----------
el("menuBtn").addEventListener("click", () => (el("menuSheet").hidden = false));
el("sheetCancel").addEventListener("click", () => (el("menuSheet").hidden = true));
el("menuSheet").addEventListener("click", (e) => {
  if (e.target.id === "menuSheet") el("menuSheet").hidden = true;
});

// ---------- export / import JSON ----------
el("exportBtn").addEventListener("click", () => {
  el("menuSheet").hidden = true;
  if (scripts.length === 0) {
    showToast("No scripts to export yet", "error");
    return;
  }
  const blob = new Blob([JSON.stringify(scripts, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "stay-scripts.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Exported stay-scripts.json", "success");
});

el("importBtn").addEventListener("click", () => {
  el("menuSheet").hidden = true;
  el("importFile").click();
});

el("importFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming)) throw new Error("bad format");
      let added = 0;
      incoming.forEach((item) => {
        if (item && item.name && typeof item.code === "string") {
          scripts.push({
            id: uid(),
            name: item.name,
            match: item.match || "*://*/*",
            runAt: item.runAt || "document-idle",
            code: item.code,
            enabled: item.enabled !== false,
            createdAt: Date.now(),
          });
          added++;
        }
      });
      saveScripts();
      renderList();
      showToast(`Imported ${added} script${added === 1 ? "" : "s"}`, "success");
    } catch (err) {
      showToast("That file isn't valid Stay JSON", "error");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

// ---------- service worker (installable PWA) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

// ---------- init ----------
renderList();
