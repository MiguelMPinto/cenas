const ENDPOINT_URL = "https://script.google.com/macros/s/AKfycby8wVuCrdDdQojdxRAFu30RtZGtw5wdu8WwMdM8IpiJnd2eKNLunEKSxoTzASohAiLd/exec";

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

  // validaÃ§Ã£o simples por contagem
  let msg = "";
  if (files.length < min) msg = `Precisas de pelo menos ${min} ficheiros.`;
  if (files.length > max) msg = `MÃ¡ximo de ${max} ficheiros.`;

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

function setMsg(text, type = "info") {
  if (!msg) return;
  msg.textContent = text;
  msg.dataset.state = type;
}

function generateSubmissionId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `sub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function countSelectedFiles(formData, fieldName) {
  return formData
    .getAll(fieldName)
    .filter(v => v instanceof File && v.size > 0).length;
}

function buildSubmissionPayload(formData) {
  const submissionId = generateSubmissionId();

  return {
    submissionId,
    email: String(formData.get("email") || "").trim(),
    // Timestamp do cliente; no Apps Script podes continuar a gravar também um timestamp do servidor.
    timestamp: new Date().toISOString(),
    bg1: String(formData.get("bg1") || ""),
    pose: String(formData.get("pose") || ""),
    notes: String(formData.get("notes") || "").trim(),

    // Metadados para ligar a submissão às fotos no Cloudinary (sem enviar fotos para o Apps Script).
    cloudinary_folder: `ai_images/${submissionId}`,
    cloudinary_json_public_id: "",
    cloudinary_json_url: "",

    // Contagens úteis para controlo/debug no Sheets.
    face_photos_count: countSelectedFiles(formData, "facePhotos"),
    full_body_photos_count: countSelectedFiles(formData, "fullBodyPhotos"),
    outfit1_photos_count: countSelectedFiles(formData, "outfit1Photos"),
    outfit2_photos_count: countSelectedFiles(formData, "outfit2Photos"),
    bg2_photos_count: countSelectedFiles(formData, "bg2Photo")
  };
}

function collectDraft() {
  const data = new FormData(form);
  // SÃ³ guardamos texto (ficheiros nÃ£o dÃ¡ para persistir em V1)
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

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const data = new FormData(form);

  const payload = buildSubmissionPayload(data);

  try {
    setMsg("A enviar pedido...", "info");
    console.log("Payload de texto enviado ao Apps Script:", payload);

    const res = await fetch(ENDPOINT_URL, {
      method: "POST",
      // `text/plain` evita preflight CORS e mantém o corpo em JSON para o Apps Script
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    let json = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      json = await res.json();
    }

    if (res.ok && json?.success !== false) {
      setMsg("Pedido enviado com sucesso.", "success");
      form.reset();
      localStorage.removeItem("aiimages_draft");
    } else {
      const errorText = json?.error || `HTTP ${res.status}`;
      setMsg("Erro ao enviar: " + errorText, "error");
      console.error("Erro ao enviar pedido:", { status: res.status, body: json });
    }

  } catch (err) {
    setMsg("Erro de rede: " + err.message, "error");
    console.error("Erro de rede no envio do formulário:", err);
  }
});



