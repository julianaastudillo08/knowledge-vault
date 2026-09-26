const KEY = "knowledge-vault-v2";

function defaultState() {
  const folderId = crypto.randomUUID();
  const noteId = crypto.randomUUID();
  return {
    folders: [{ id: folderId, name: "General" }],
    notes: [
      {
        id: noteId,
        folderId,
        title: "Bienvenida",
        tags: ["inicio", "markdown"],
        body: "# Knowledge Vault\n\nEscribe notas en **Markdown**. Usa carpetas, etiquetas y favoritos.\n\n- Vista previa en tiempo real\n- Búsqueda con resaltado\n- Exporta e importa JSON\n\n> Modo lectura con **R** para concentrarte.",
        updated: Date.now(),
        pinned: true,
      },
    ],
    activeNoteId: noteId,
    activeTagFilter: null,
    readingMode: false,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      s.notes = (s.notes || []).map((n) => ({ pinned: false, ...n }));
      return { ...defaultState(), ...s, folders: s.folders || defaultState().folders };
    }
    const legacy = localStorage.getItem("knowledge-vault-v1");
    if (legacy) {
      const s = JSON.parse(legacy);
      localStorage.setItem(KEY, JSON.stringify(s));
      return load();
    }
  } catch { /* */ }
  return defaultState();
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

let state = load();
let searchQuery = "";

function getActiveNote() {
  return state.notes.find((n) => n.id === state.activeNoteId);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text, q) {
  if (!q) return escapeHtml(text);
  const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  return escapeHtml(text).replace(re, "<mark>$1</mark>");
}

function renderMarkdown(body, q) {
  let html = marked.parse(body || "");
  if (q && q.length > 1) {
    const re = new RegExp(`(${escapeRegExp(q)})`, "gi");
    html = html.replace(/>([^<]+)</g, (match, chunk) => {
      if (!chunk.trim()) return match;
      return `>${chunk.replace(re, "<mark>$1</mark>")}<`;
    });
  }
  return html;
}

function allTags() {
  const counts = {};
  for (const n of state.notes) {
    for (const t of n.tags || []) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function noteMatches(n, q, tagFilter) {
  if (tagFilter && !(n.tags || []).includes(tagFilter)) return false;
  if (!q) return true;
  const hay = `${n.title} ${n.body} ${(n.tags || []).join(" ")}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderTagCloud() {
  const cloud = document.getElementById("tag-cloud");
  const tags = allTags();
  if (!tags.length) {
    cloud.innerHTML = '<span class="empty-hint">Sin etiquetas</span>';
    return;
  }
  const max = tags[0][1];
  cloud.innerHTML = tags
    .map(([tag, count]) => {
      const size = 0.75 + (count / max) * 0.45;
      const active = state.activeTagFilter === tag ? " active" : "";
      return `<button type="button" class="tag-pill${active}" data-tag="${escapeHtml(tag)}" style="font-size:${size}rem">${escapeHtml(tag)} <em>${count}</em></button>`;
    })
    .join("");
}

function renderFavorites() {
  const list = document.getElementById("favorites-list");
  const pinned = state.notes.filter((n) => n.pinned).sort((a, b) => b.updated - a.updated);
  if (!pinned.length) {
    list.innerHTML = '<span class="empty-hint">Marca notas con ☆</span>';
    return;
  }
  list.innerHTML = pinned
    .map(
      (n) =>
        `<button type="button" class="note-item fav ${n.id === state.activeNoteId ? "active" : ""}" data-note="${n.id}">${highlightText(n.title || "Sin título", searchQuery)}</button>`
    )
    .join("");
}

function renderTree() {
  const q = searchQuery.trim().toLowerCase();
  const tree = document.getElementById("folder-tree");
  let html = "";

  for (const folder of state.folders) {
    let notes = state.notes.filter((n) => n.folderId === folder.id);
    notes = notes.filter((n) => noteMatches(n, q, state.activeTagFilter));
    if (q && !notes.length) continue;

    html += `<div class="folder-block" data-folder="${folder.id}">`;
    html += `<div class="folder-name" data-rename-folder="${folder.id}">${escapeHtml(folder.name)}</div>`;
    if (!notes.length) html += '<p class="empty-hint">Sin notas</p>';
    else {
      html += notes
        .sort((a, b) => b.updated - a.updated)
        .map(
          (n) =>
            `<button type="button" class="note-item ${n.id === state.activeNoteId ? "active" : ""}" data-note="${n.id}">${highlightText(n.title || "Sin título", q)}${n.pinned ? " <span class='pin-dot'>★</span>" : ""}</button>`
        )
        .join("");
    }
    html += "</div>";
  }
  tree.innerHTML = html || '<p class="empty-hint">No hay resultados.</p>';
}

function updatePinButton() {
  const note = getActiveNote();
  const btn = document.getElementById("pin-note");
  btn.textContent = note?.pinned ? "★" : "☆";
  btn.classList.toggle("pinned", !!note?.pinned);
}

function renderEditor() {
  const note = getActiveNote();
  const title = document.getElementById("note-title");
  const tags = document.getElementById("note-tags");
  const body = document.getElementById("note-body");
  const preview = document.getElementById("preview");
  const split = document.getElementById("editor-split");

  split.classList.toggle("reading-only", state.readingMode);

  if (!note) {
    title.value = "";
    tags.value = "";
    body.value = "";
    preview.innerHTML = "<p class='empty-hint'>Crea o selecciona una nota.</p>";
    updatePinButton();
    return;
  }
  title.value = note.title;
  tags.value = (note.tags || []).join(", ");
  body.value = note.body;
  preview.innerHTML = renderMarkdown(note.body, searchQuery.trim());
  updatePinButton();
}

function persistNoteFields() {
  const note = getActiveNote();
  if (!note) return;
  note.title = document.getElementById("note-title").value.trim() || "Sin título";
  note.tags = document
    .getElementById("note-tags")
    .value.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  note.body = document.getElementById("note-body").value;
  note.updated = Date.now();
  save(state);
  renderTree();
  renderTagCloud();
  renderFavorites();
  document.getElementById("preview").innerHTML = renderMarkdown(note.body, searchQuery.trim());
}

function refresh() {
  renderTagCloud();
  renderFavorites();
  renderTree();
  renderEditor();
}

function visibleNotesFlat() {
  const q = searchQuery.trim().toLowerCase();
  return state.notes
    .filter((n) => noteMatches(n, q, state.activeTagFilter))
    .sort((a, b) => b.updated - a.updated);
}

function navigateNote(dir) {
  const list = visibleNotesFlat();
  if (!list.length) return;
  const idx = list.findIndex((n) => n.id === state.activeNoteId);
  const next = list[(idx + dir + list.length) % list.length];
  state.activeNoteId = next.id;
  save(state);
  refresh();
}

document.getElementById("search").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  refresh();
});

document.getElementById("tag-cloud").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-tag]");
  if (!btn) return;
  const tag = btn.dataset.tag;
  state.activeTagFilter = state.activeTagFilter === tag ? null : tag;
  save(state);
  refresh();
});

document.getElementById("folder-tree").addEventListener("click", (e) => {
  const noteBtn = e.target.closest("[data-note]");
  if (noteBtn) {
    state.activeNoteId = noteBtn.dataset.note;
    save(state);
    refresh();
    return;
  }
  const folderEl = e.target.closest("[data-rename-folder]");
  if (folderEl) {
    const id = folderEl.dataset.renameFolder;
    const folder = state.folders.find((f) => f.id === id);
    const name = prompt("Nombre de la carpeta:", folder?.name);
    if (name && folder) {
      folder.name = name.trim();
      save(state);
      refresh();
    }
  }
});

document.getElementById("favorites-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-note]");
  if (btn) {
    state.activeNoteId = btn.dataset.note;
    save(state);
    refresh();
  }
});

document.getElementById("new-folder").addEventListener("click", () => {
  const name = prompt("Nueva carpeta:");
  if (!name?.trim()) return;
  state.folders.push({ id: crypto.randomUUID(), name: name.trim() });
  save(state);
  refresh();
});

document.getElementById("new-note").addEventListener("click", () => {
  const folderId = state.folders[0]?.id;
  if (!folderId) return;
  const id = crypto.randomUUID();
  state.notes.push({
    id,
    folderId,
    title: "Nueva nota",
    tags: [],
    body: "",
    updated: Date.now(),
    pinned: false,
  });
  state.activeNoteId = id;
  save(state);
  refresh();
});

document.getElementById("delete-note").addEventListener("click", () => {
  if (!state.activeNoteId || !confirm("¿Eliminar esta nota?")) return;
  state.notes = state.notes.filter((n) => n.id !== state.activeNoteId);
  state.activeNoteId = state.notes[0]?.id || null;
  save(state);
  refresh();
});

document.getElementById("pin-note").addEventListener("click", () => {
  const note = getActiveNote();
  if (!note) return;
  note.pinned = !note.pinned;
  save(state);
  refresh();
});

document.getElementById("reading-mode").addEventListener("click", () => {
  state.readingMode = !state.readingMode;
  save(state);
  renderEditor();
});

document.getElementById("export-json").addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    folders: state.folders,
    notes: state.notes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `knowledge-vault-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("import-json").addEventListener("click", () => {
  document.getElementById("import-file").click();
});

document.getElementById("import-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed.notes || !parsed.folders) throw new Error("Formato inválido");
    if (!confirm("¿Reemplazar todas las notas con el archivo importado?")) return;
    state = {
      ...state,
      folders: parsed.folders,
      notes: parsed.notes.map((n) => ({ pinned: false, ...n })),
      activeNoteId: parsed.notes[0]?.id || null,
    };
    save(state);
    refresh();
  } catch {
    alert("No se pudo importar el JSON.");
  }
  e.target.value = "";
});

document.getElementById("sidebar-toggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

["note-title", "note-tags", "note-body"].forEach((id) => {
  document.getElementById(id).addEventListener("input", persistNoteFields);
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea") && !["j", "k", "r", "R"].includes(e.key)) return;
  if (e.key === "j" || e.key === "J") {
    e.preventDefault();
    navigateNote(1);
  }
  if (e.key === "k" || e.key === "K") {
    e.preventDefault();
    navigateNote(-1);
  }
  if (e.key === "r" || e.key === "R") {
    if (e.target.matches("textarea")) return;
    e.preventDefault();
    state.readingMode = !state.readingMode;
    save(state);
    renderEditor();
  }
});

refresh();
