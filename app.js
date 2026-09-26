const KEY = "knowledge-vault-v1";

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
        tags: ["inicio"],
        body: "# Knowledge Vault\n\nEscribe notas en **Markdown**. Usa carpetas y etiquetas para organizarte.\n\n- Busca en el panel izquierdo\n- Vista previa en tiempo real\n",
        updated: Date.now(),
      },
    ],
    activeNoteId: noteId,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  return defaultState();
}

function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

let state = load();

function getActiveNote() {
  return state.notes.find((n) => n.id === state.activeNoteId);
}

function renderTree() {
  const q = (document.getElementById("search").value || "").trim().toLowerCase();
  const tree = document.getElementById("folder-tree");
  let html = "";

  for (const folder of state.folders) {
    let notes = state.notes.filter((n) => n.folderId === folder.id);
    if (q) {
      notes = notes.filter((n) => {
        const hay = `${n.title} ${n.body} ${(n.tags || []).join(" ")}`.toLowerCase();
        return hay.includes(q);
      });
    }
    if (q && !notes.length) continue;

    html += `<div class="folder-block" data-folder="${folder.id}">`;
    html += `<div class="folder-name" data-rename-folder="${folder.id}">${escapeHtml(folder.name)}</div>`;
    if (!notes.length) html += '<p class="empty-hint">Sin notas</p>';
    else {
      html += notes
        .sort((a, b) => b.updated - a.updated)
        .map(
          (n) =>
            `<button type="button" class="note-item ${n.id === state.activeNoteId ? "active" : ""}" data-note="${n.id}">${escapeHtml(n.title || "Sin título")}</button>`
        )
        .join("");
    }
    html += "</div>";
  }
  tree.innerHTML = html || '<p class="empty-hint">No hay resultados.</p>';
}

function renderEditor() {
  const note = getActiveNote();
  const title = document.getElementById("note-title");
  const tags = document.getElementById("note-tags");
  const body = document.getElementById("note-body");
  const preview = document.getElementById("preview");

  if (!note) {
    title.value = "";
    tags.value = "";
    body.value = "";
    preview.innerHTML = "<p class='empty-hint'>Crea o selecciona una nota.</p>";
    return;
  }
  title.value = note.title;
  tags.value = (note.tags || []).join(", ");
  body.value = note.body;
  preview.innerHTML = marked.parse(note.body || "");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
  document.getElementById("preview").innerHTML = marked.parse(note.body || "");
}

function refresh() {
  renderTree();
  renderEditor();
}

document.getElementById("search").addEventListener("input", renderTree);

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

["note-title", "note-tags", "note-body"].forEach((id) => {
  document.getElementById(id).addEventListener("input", persistNoteFields);
});

refresh();
