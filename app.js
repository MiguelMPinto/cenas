const ENDPOINT_URL = "https://script.google.com/macros/s/AKfycby8wVuCrdDdQojdxRAFu30RtZGtw5wdu8WwMdM8IpiJnd2eKNLunEKSxoTzASohAiLd/exec";

const CLOUDINARY_CLOUD_NAME = "diyjurp0k"; // confirma no dashboard
const CLOUDINARY_UPLOAD_PRESET = "ai_images_unsigned";
const CLOUDINARY_BASE_FOLDER = "ai_images";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const PHOTO_FIELD_NAMES = ["facePhotos", "fullBodyPhotos", "outfit1Photos", "outfit2Photos", "bg2Photo"];

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

function initBeforeAfterSliders() {
  const ranges = document.querySelectorAll(".ba-range");
  if (!ranges.length) return;

  ranges.forEach((range) => {
    const slider = range.closest(".ba-slider");
    if (!slider) return;

    const update = () => {
      const value = Number(range.value || 50);
      slider.style.setProperty("--pos", `${value}%`);
    };

    range.addEventListener("input", update);
    update();
  });
}

initBeforeAfterSliders();

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

function getSelectedFiles(formData, fieldName) {
  return formData
    .getAll(fieldName)
    .filter(v => v instanceof File && v.size > 0);
}

function countSelectedFiles(formData, fieldName) {
  return getSelectedFiles(formData, fieldName).length;
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
    cloudinary_folder: `${CLOUDINARY_BASE_FOLDER}/${submissionId}`,
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

function sanitizeFileBaseName(name) {
  return String(name || "file")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "file";
}

async function uploadFileToCloudinary(file, { submissionId, fieldName, index }) {
  const cloudData = new FormData();
  const safeName = sanitizeFileBaseName(file.name);
  const publicId = `${submissionId}_${fieldName}_${String(index + 1).padStart(2, "0")}_${safeName}`;
  const assetFolder = `${CLOUDINARY_BASE_FOLDER}/${submissionId}/${fieldName}`;

  cloudData.append("file", file);
  cloudData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  cloudData.append("asset_folder", assetFolder);
  cloudData.append("public_id", publicId);

  const res = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: cloudData
  });

  let body = null;
  try {
    body = await res.json();
  } catch {}

  if (!res.ok || body?.error) {
    const reason = body?.error?.message || `Cloudinary HTTP ${res.status}`;
    throw new Error(`Falha no upload (${fieldName} / ${file.name}): ${reason}`);
  }

  return {
    field: fieldName,
    name: file.name,
    bytes: body.bytes,
    public_id: body.public_id,
    secure_url: body.secure_url,
    asset_folder: body.asset_folder || assetFolder
  };
}

async function uploadAllPhotosToCloudinary(formData, submissionId, onProgress) {
  const uploads = {};
  let total = 0;

  PHOTO_FIELD_NAMES.forEach(fieldName => {
    uploads[fieldName] = [];
    total += getSelectedFiles(formData, fieldName).length;
  });

  let uploaded = 0;

  for (const fieldName of PHOTO_FIELD_NAMES) {
    const files = getSelectedFiles(formData, fieldName);

    for (let i = 0; i < files.length; i++) {
      if (typeof onProgress === "function") {
        onProgress({
          uploaded,
          total,
          next: uploaded + 1,
          fieldName,
          fileName: files[i].name
        });
      }

      const result = await uploadFileToCloudinary(files[i], {
        submissionId,
        fieldName,
        index: i
      });

      uploads[fieldName].push(result);
      uploaded += 1;
    }
  }

  if (typeof onProgress === "function") {
    onProgress({ uploaded, total, done: true });
  }

  return uploads;
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
    setMsg("A carregar fotos para Cloudinary...", "info");

    const cloudinaryUploads = await uploadAllPhotosToCloudinary(
      data,
      payload.submissionId,
      ({ next, total, done }) => {
        if (done) {
          setMsg("Fotos carregadas. A enviar dados...", "info");
          return;
        }
        setMsg(`A carregar fotos para Cloudinary (${next}/${total})...`, "info");
      }
    );

    payload.face_photos_count = cloudinaryUploads.facePhotos?.length || 0;
    payload.full_body_photos_count = cloudinaryUploads.fullBodyPhotos?.length || 0;
    payload.outfit1_photos_count = cloudinaryUploads.outfit1Photos?.length || 0;
    payload.outfit2_photos_count = cloudinaryUploads.outfit2Photos?.length || 0;
    payload.bg2_photos_count = cloudinaryUploads.bg2Photo?.length || 0;

    console.log("Uploads Cloudinary (debug):", cloudinaryUploads);
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



