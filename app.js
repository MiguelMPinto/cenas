document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

function clearPreviews(container) {
  container.innerHTML = "";
}

function addPreview(container, file) {
  const wrap = document.createElement("div");
  wrap.className = "preview";

  const img = document.createElement("img");
  img.alt = file.name;

  wrap.appendChild(img);
  container.appendChild(wrap);

  const url = URL.createObjectURL(file);
  img.src = url;

  img.onload = () => URL.revokeObjectURL(url);
}

function handleFileInput(input, previewsEl) {
  const files = Array.from(input.files || []);
  const min = Number(input.dataset.min || 0);
  const max = Number(input.dataset.max || files.length);

  clearPreviews(previewsEl);
  files.slice(0, 10).forEach(f => addPreview(previewsEl, f));

  // validação simples por contagem
  let msg = "";
  if (files.length < min) msg = `Precisas de pelo menos ${min} ficheiros.`;
  if (files.length > max) msg = `Máximo de ${max} ficheiros.`;

  input.setCustomValidity(msg);
}

function wireFile(idInput, idPreviews) {
  const input = document.getElementById(idInput);
  const previews = document.getElementById(idPreviews);
  if (!input || !previews) return;

  input.addEventListener("change", () => handleFileInput(input, previews));
}

wireFile("facePhotos", "facePreviews");
wireFile("fullBodyPhotos", "fullBodyPreviews");
wireFile("outfit1Photos", "outfit1Previews");
wireFile("outfit2Photos", "outfit2Previews");
wireFile("bg2Photo", "bg2Previews");

const form = document.getElementById("leadForm");
const msg = document.getElementById("formMsg");
const saveDraftBtn = document.getElementById("saveDraft");

function setMsg(text) {
  msg.textContent = text;
}

function collectDraft() {
  const data = new FormData(form);
  // Só guardamos texto (ficheiros não dá para persistir em V1)
  return {
    email: data.get("email") || "",
    bg1: data.get("bg1") || "",
    pose: data.get("pose") || "",
    notes: data.get("notes") || ""
  };
}

function applyDraft(d) {
  if (!d) return;
  const email = document.getElementById("email");
  const bg1 = document.getElementById("bg1");
  const notes = document.getElementById("notes");

  email.value = d.email || "";
  bg1.value = d.bg1 || "";
  notes.value = d.notes || "";

  // radio
  const radios = document.querySelectorAll('input[name="pose"]');
  radios.forEach(r => r.checked = (r.value === d.pose));
}

saveDraftBtn?.addEventListener("click", () => {
  const draft = collectDraft();
  localStorage.setItem("aiimages_draft", JSON.stringify(draft));
  setMsg("Rascunho guardado (texto apenas).");
});

(function loadDraft() {
  try {
    const raw = localStorage.getItem("aiimages_draft");
    if (!raw) return;
    applyDraft(JSON.parse(raw));
  } catch {}
})();

form?.addEventListener("submit", (e) => {
  e.preventDefault();

  // força validações HTML5 + custom validity
  if (!form.checkValidity()) {
    form.reportValidity();
    setMsg("Há campos por preencher/ajustar.");
    return;
  }

  // V1: simula envio
  setMsg("Pedido submetido (V1). Nesta versão ainda não existe envio para Excel/Drive.");
  form.reset();

  // limpar previews
  ["facePreviews","fullBodyPreviews","outfit1Previews","outfit2Previews","bg2Previews"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ""; });
});