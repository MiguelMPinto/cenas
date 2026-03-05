const ENDPOINT_URL = "https://script.google.com/macros/s/AKfycby8wVuCrdDdQojdxRAFu30RtZGtw5wdu8WwMdM8IpiJnd2eKNLunEKSxoTzASohAiLd/exec";

const CLOUDINARY_CLOUD_NAME = "diyjurp0k";
const CLOUDINARY_UPLOAD_PRESET = "ai_images_unsigned";
const CLOUDINARY_BASE_FOLDER = "ai_images";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

const PHOTO_FIELD_NAMES = ["facePhotos", "fullBodyPhotos", "outfit1Photos", "outfit2Photos", "bg2Photo"];
const TEXT_FIELD_NAMES = ["email", "bg1", "pose", "notes"];
const REQUIRED_TEXT_FIELDS = ["email", "bg1", "pose"];

const FILE_RULES = {
  facePhotos: { min: 1, max: 5, label: "Fotos do rosto" },
  fullBodyPhotos: { min: 1, max: 5, label: "Fotos de corpo inteiro" },
  outfit1Photos: { min: 1, max: 5, label: "Fotos do Outfit 1" },
  outfit2Photos: { min: 1, max: 5, label: "Fotos do Outfit 2" },
  bg2Photo: { min: 1, max: 1, label: "Foto do fundo do Outfit 2" }
};

const WIZARD_STEPS = [
  { index: 1, path: "step-1.html", requiredText: ["email"], requiredFiles: [] },
  { index: 2, path: "step-2.html", requiredText: [], requiredFiles: ["facePhotos", "fullBodyPhotos"] },
  { index: 3, path: "step-3.html", requiredText: [], requiredFiles: ["outfit1Photos", "outfit2Photos"] },
  { index: 4, path: "step-4.html", requiredText: ["bg1", "pose"], requiredFiles: ["bg2Photo"] },
  { index: 5, path: "step-5.html", requiredText: [], requiredFiles: [] },
  { index: 6, path: "step-6.html", requiredText: [], requiredFiles: [] }
];

const WIZARD_TOTAL_STEPS = WIZARD_STEPS.length;

const WIZARD_STORAGE_KEY = "aiimages_wizard_state_v1";
const IDB_NAME = "aiimages_wizard_db";
const IDB_STORE = "files";
const IDB_VERSION = 1;

const EMPTY_STATE = {
  text: {
    email: "",
    bg1: "",
    pose: "",
    notes: ""
  },
  files: {
    facePhotos: [],
    fullBodyPhotos: [],
    outfit1Photos: [],
    outfit2Photos: [],
    bg2Photo: []
  }
};

function createEmptyState() {
  return JSON.parse(JSON.stringify(EMPTY_STATE));
}

let wizardState = loadWizardState();

document.querySelectorAll('a[href^="#"]').forEach((a) => {
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
initWizard();

function loadWizardState() {
  try {
    const raw = localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return createEmptyState();

    const parsed = JSON.parse(raw);
    return {
      text: { ...EMPTY_STATE.text, ...(parsed?.text || {}) },
      files: {
        facePhotos: Array.isArray(parsed?.files?.facePhotos) ? parsed.files.facePhotos : [],
        fullBodyPhotos: Array.isArray(parsed?.files?.fullBodyPhotos) ? parsed.files.fullBodyPhotos : [],
        outfit1Photos: Array.isArray(parsed?.files?.outfit1Photos) ? parsed.files.outfit1Photos : [],
        outfit2Photos: Array.isArray(parsed?.files?.outfit2Photos) ? parsed.files.outfit2Photos : [],
        bg2Photo: Array.isArray(parsed?.files?.bg2Photo) ? parsed.files.bg2Photo : []
      }
    };
  } catch {
    return createEmptyState();
  }
}

function saveWizardState() {
  localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(wizardState));
}

function getCurrentStepIndex() {
  const body = document.body;
  const attr = Number(body?.dataset?.stepIndex || 0);
  if (attr >= 1 && attr <= WIZARD_TOTAL_STEPS) return attr;
  return 0;
}

function getCurrentStep() {
  const idx = getCurrentStepIndex();
  return WIZARD_STEPS.find((step) => step.index === idx) || null;
}

function getStepPath(stepIndex) {
  const found = WIZARD_STEPS.find((step) => step.index === stepIndex);
  return found ? found.path : null;
}

function navigateToStep(stepIndex) {
  const targetPath = getStepPath(stepIndex);
  if (!targetPath) return;
  window.location.href = targetPath;
}

function setTextField(name, value) {
  if (!TEXT_FIELD_NAMES.includes(name)) return;
  wizardState.text[name] = String(value || "");
  saveWizardState();
}

function filePreviewUrl(file) {
  const url = URL.createObjectURL(file);
  return url;
}

function randomId(prefix) {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function openWizardDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Erro ao abrir IndexedDB."));
  });
}

async function idbPut(record) {
  const db = await openWizardDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Erro a gravar ficheiro no IndexedDB."));
  });
  db.close();
}

async function idbGet(id) {
  const db = await openWizardDb();
  const result = await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("Erro a ler ficheiro do IndexedDB."));
  });
  db.close();
  return result;
}

async function idbDelete(id) {
  const db = await openWizardDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    store.delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Erro a remover ficheiro do IndexedDB."));
  });
  db.close();
}

async function setFieldFiles(fieldName, files) {
  const previous = wizardState.files[fieldName] || [];
  for (const item of previous) {
    await idbDelete(item.id);
  }

  const nextMeta = [];
  for (const file of files) {
    const id = randomId(fieldName);
    await idbPut({
      id,
      fieldName,
      file,
      createdAt: Date.now()
    });
    nextMeta.push({
      id,
      name: file.name,
      size: file.size,
      type: file.type
    });
  }

  wizardState.files[fieldName] = nextMeta;
  saveWizardState();
}

async function clearFieldFiles(fieldName) {
  const current = wizardState.files[fieldName] || [];
  for (const item of current) {
    await idbDelete(item.id);
  }
  wizardState.files[fieldName] = [];
  saveWizardState();
}

function getFileCount(fieldName) {
  return Array.isArray(wizardState.files[fieldName]) ? wizardState.files[fieldName].length : 0;
}

function setFieldError(fieldName, message) {
  const el = document.querySelector(`[data-error-for="${fieldName}"]`);
  if (!el) return;
  el.textContent = message || "";
}

function clearStepErrors(step) {
  if (!step) return;
  [...step.requiredText, ...step.requiredFiles].forEach((fieldName) => setFieldError(fieldName, ""));
}

function validateTextField(fieldName) {
  const value = String(wizardState.text[fieldName] || "").trim();

  if (fieldName === "email") {
    if (!value) return "Email e obrigatorio.";
    const emailInput = document.getElementById("email");
    if (emailInput) {
      emailInput.value = value;
      if (!emailInput.checkValidity()) return "Email invalido.";
    } else {
      const simpleEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!simpleEmail.test(value)) return "Email invalido.";
    }
    return "";
  }

  if (!value) {
    return "Campo obrigatorio.";
  }
  return "";
}

function validateFileField(fieldName) {
  const rules = FILE_RULES[fieldName];
  if (!rules) return "";
  const count = getFileCount(fieldName);
  if (count < rules.min) return `${rules.label}: minimo ${rules.min} ficheiro(s).`;
  if (count > rules.max) return `${rules.label}: maximo ${rules.max} ficheiro(s).`;
  return "";
}

function validateStep(step) {
  if (!step) return false;
  clearStepErrors(step);
  let hasError = false;

  step.requiredText.forEach((fieldName) => {
    const error = validateTextField(fieldName);
    if (error) {
      setFieldError(fieldName, error);
      hasError = true;
    }
  });

  step.requiredFiles.forEach((fieldName) => {
    const error = validateFileField(fieldName);
    if (error) {
      setFieldError(fieldName, error);
      hasError = true;
    }
  });

  return !hasError;
}

function validateAllRequiredFields() {
  let hasError = false;

  REQUIRED_TEXT_FIELDS.forEach((fieldName) => {
    const error = validateTextField(fieldName);
    setFieldError(fieldName, error);
    if (error) hasError = true;
  });

  PHOTO_FIELD_NAMES.forEach((fieldName) => {
    const error = validateFileField(fieldName);
    setFieldError(fieldName, error);
    if (error) hasError = true;
  });

  return !hasError;
}

function fillStepInputsFromState() {
  TEXT_FIELD_NAMES.forEach((name) => {
    const el = document.getElementById(name);
    if (!el) return;

    if (el instanceof HTMLInputElement && el.type === "radio") return;

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.value = wizardState.text[name] || "";
    }
  });

  const poseRadios = document.querySelectorAll('input[name="pose"]');
  if (poseRadios.length) {
    const pose = wizardState.text.pose || "";
    poseRadios.forEach((radio) => {
      radio.checked = radio.value === pose;
    });
  }
}

async function renderFileField(fieldName) {
  const previewsEl = document.getElementById(`${fieldName}Previews`);
  if (!previewsEl) return;

  previewsEl.innerHTML = "";
  const filesMeta = wizardState.files[fieldName] || [];

  const statusEl = document.getElementById(`${fieldName}Status`);
  if (statusEl) {
    statusEl.textContent = filesMeta.length ? `${filesMeta.length} ficheiro(s) guardado(s).` : "Nenhum ficheiro guardado.";
  }

  const displayItems = filesMeta.slice(0, 10);
  for (const meta of displayItems) {
    const row = document.createElement("div");
    row.className = "preview";

    const record = await idbGet(meta.id);
    const file = record?.file;

    if (file && String(file.type || "").startsWith("image/")) {
      const img = document.createElement("img");
      img.alt = meta.name || "imagem";
      const url = filePreviewUrl(file);
      img.src = url;
      img.onload = () => URL.revokeObjectURL(url);
      row.appendChild(img);
    } else {
      const label = document.createElement("div");
      label.className = "preview-file-label";
      label.textContent = meta.name || "ficheiro";
      row.appendChild(label);
    }

    previewsEl.appendChild(row);
  }
}

function wireTextInputs() {
  TEXT_FIELD_NAMES.forEach((name) => {
    const el = document.getElementById(name);
    if (!el) return;

    el.addEventListener("input", () => {
      setTextField(name, el.value || "");
      setFieldError(name, "");
      refreshWizardProgress();
    });

    el.addEventListener("change", () => {
      setTextField(name, el.value || "");
      setFieldError(name, "");
      refreshWizardProgress();
    });
  });

  const poseRadios = document.querySelectorAll('input[name="pose"]');
  poseRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        setTextField("pose", radio.value);
        setFieldError("pose", "");
        refreshWizardProgress();
      }
    });
  });
}

function wireFileInputs() {
  PHOTO_FIELD_NAMES.forEach((fieldName) => {
    const input = document.getElementById(fieldName);
    if (!input) return;

    input.addEventListener("change", async () => {
      const files = Array.from(input.files || []);
      const rules = FILE_RULES[fieldName];

      let msg = "";
      if (files.length < rules.min) msg = `Minimo ${rules.min} ficheiro(s).`;
      if (files.length > rules.max) msg = `Maximo ${rules.max} ficheiro(s).`;

      input.setCustomValidity(msg);
      if (msg) {
        input.reportValidity();
        setFieldError(fieldName, msg);
        return;
      }

      await setFieldFiles(fieldName, files);
      setFieldError(fieldName, "");
      await renderFileField(fieldName);
      refreshWizardProgress();
    });

    const clearBtn = document.querySelector(`[data-clear-files="${fieldName}"]`);
    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        await clearFieldFiles(fieldName);
        input.value = "";
        setFieldError(fieldName, "");
        await renderFileField(fieldName);
        refreshWizardProgress();
      });
    }
  });
}

function getCompletionMap() {
  const email = !validateTextField("email");
  const bg1 = !validateTextField("bg1");
  const pose = !validateTextField("pose");

  return {
    email,
    facePhotos: !validateFileField("facePhotos"),
    fullBodyPhotos: !validateFileField("fullBodyPhotos"),
    outfit1Photos: !validateFileField("outfit1Photos"),
    outfit2Photos: !validateFileField("outfit2Photos"),
    bg1,
    bg2Photo: !validateFileField("bg2Photo"),
    pose
  };
}

function getProgressHint(percent) {
  if (percent <= 0) return "Comeca pelo contacto e primeiro bloco de fotos.";
  if (percent < 40) return "Bom arranque. Fecha os blocos de fotos.";
  if (percent < 70) return "Ja passaste metade.";
  if (percent < 100) return "Ultimos detalhes antes de submeter.";
  return "Tudo pronto para submissao.";
}

function refreshWizardProgress() {
  const status = getCompletionMap();
  const keys = Object.keys(status);
  const done = keys.filter((key) => status[key]).length;
  const total = keys.length || 1;
  const percent = Math.round((done / total) * 100);

  const progressText = document.getElementById("progressText");
  const progressPct = document.getElementById("progressPct");
  const progressFill = document.getElementById("progressFill");
  const progressTrack = document.querySelector(".progress-track");
  const progressHint = document.getElementById("progressHint");
  const wizardStepLabel = document.getElementById("wizardStepLabel");

  const currentStepIndex = getCurrentStepIndex();
  if (wizardStepLabel && currentStepIndex) {
    wizardStepLabel.textContent = `Step ${currentStepIndex} de ${WIZARD_TOTAL_STEPS}`;
  }

  if (progressText) progressText.textContent = `${done} de ${total} campos obrigatorios completos`;
  if (progressPct) progressPct.textContent = `${percent}%`;
  if (progressFill) progressFill.style.width = `${percent}%`;
  if (progressTrack) progressTrack.setAttribute("aria-valuenow", String(percent));
  if (progressHint) progressHint.textContent = getProgressHint(percent);
}

function setMsg(text, type = "info") {
  const msg = document.getElementById("formMsg");
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
    .filter((v) => v instanceof File && v.size > 0);
}

function countSelectedFiles(formData, fieldName) {
  return getSelectedFiles(formData, fieldName).length;
}

function buildSubmissionPayload(formData) {
  const submissionId = generateSubmissionId();

  return {
    submissionId,
    email: String(formData.get("email") || "").trim(),
    timestamp: new Date().toISOString(),
    bg1: String(formData.get("bg1") || ""),
    pose: String(formData.get("pose") || ""),
    notes: String(formData.get("notes") || "").trim(),
    cloudinary_folder: `${CLOUDINARY_BASE_FOLDER}/${submissionId}`,
    cloudinary_json_public_id: "",
    cloudinary_json_url: "",
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

  PHOTO_FIELD_NAMES.forEach((fieldName) => {
    uploads[fieldName] = [];
    total += getSelectedFiles(formData, fieldName).length;
  });

  let uploaded = 0;

  for (const fieldName of PHOTO_FIELD_NAMES) {
    const files = getSelectedFiles(formData, fieldName);
    for (let i = 0; i < files.length; i += 1) {
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

async function buildFormDataFromWizardState() {
  const data = new FormData();

  TEXT_FIELD_NAMES.forEach((fieldName) => {
    data.append(fieldName, wizardState.text[fieldName] || "");
  });

  for (const fieldName of PHOTO_FIELD_NAMES) {
    const items = wizardState.files[fieldName] || [];
    for (const item of items) {
      const record = await idbGet(item.id);
      if (record?.file) {
        data.append(fieldName, record.file, record.file.name || item.name || "file");
      }
    }
  }

  return data;
}

async function clearAllWizardData() {
  for (const fieldName of PHOTO_FIELD_NAMES) {
    const items = wizardState.files[fieldName] || [];
    for (const item of items) {
      await idbDelete(item.id);
    }
  }

  localStorage.removeItem(WIZARD_STORAGE_KEY);
  wizardState = createEmptyState();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderReview() {
  const host = document.getElementById("reviewContent");
  if (!host) return;

  const rows = [
    ["Email", wizardState.text.email || "-"],
    ["Fundo corporate", wizardState.text.bg1 || "-"],
    ["Posicao", wizardState.text.pose || "-"],
    ["Observacoes", wizardState.text.notes || "-"],
    ["Fotos rosto", String(getFileCount("facePhotos"))],
    ["Fotos corpo inteiro", String(getFileCount("fullBodyPhotos"))],
    ["Fotos outfit 1", String(getFileCount("outfit1Photos"))],
    ["Fotos outfit 2", String(getFileCount("outfit2Photos"))],
    ["Foto fundo outfit 2", String(getFileCount("bg2Photo"))]
  ];

  host.innerHTML = rows
    .map(([k, v]) => `<div class="review-row"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div>`)
    .join("");
}

async function handleFinalSubmit() {
  if (!validateAllRequiredFields()) {
    setMsg("Revê os campos obrigatorios antes de submeter.", "error");
    return;
  }

  try {
    setMsg("A preparar dados...", "info");
    const data = await buildFormDataFromWizardState();
    const payload = buildSubmissionPayload(data);

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

    const res = await fetch(ENDPOINT_URL, {
      method: "POST",
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
      await clearAllWizardData();
      setMsg("Pedido enviado com sucesso.", "success");
      renderReview();
      refreshWizardProgress();
    } else {
      const errorText = json?.error || `HTTP ${res.status}`;
      setMsg(`Erro ao enviar: ${errorText}`, "error");
      console.error("Erro ao enviar pedido:", { status: res.status, body: json });
    }
  } catch (err) {
    setMsg(`Erro de rede: ${err.message}`, "error");
    console.error("Erro de rede no envio do formulario:", err);
  }
}

function wireNavigation(step) {
  const backBtn = document.querySelector("[data-action='back']");
  const nextBtn = document.querySelector("[data-action='next']");
  const submitBtn = document.querySelector("[data-action='submit']");

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      if (step.index <= 1) return;
      navigateToStep(step.index - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      const valid = validateStep(step);
      if (!valid) {
        setMsg("Preenche os campos obrigatorios para continuar.", "error");
        return;
      }
      setMsg("", "info");
      navigateToStep(step.index + 1);
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      await handleFinalSubmit();
    });
  }
}

function wireGoToStepButtons() {
  const buttons = document.querySelectorAll("[data-goto-step]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const stepIndex = Number(btn.getAttribute("data-goto-step") || 0);
      if (stepIndex >= 1 && stepIndex <= WIZARD_TOTAL_STEPS) {
        navigateToStep(stepIndex);
      }
    });
  });
}

async function hydrateFilePreviewsForCurrentPage() {
  for (const fieldName of PHOTO_FIELD_NAMES) {
    if (document.getElementById(`${fieldName}Previews`)) {
      await renderFileField(fieldName);
    }
  }
}

function initWizard() {
  const step = getCurrentStep();
  if (!step) return;

  fillStepInputsFromState();
  wireTextInputs();
  wireFileInputs();
  wireNavigation(step);
  wireGoToStepButtons();
  hydrateFilePreviewsForCurrentPage().then(() => {
    refreshWizardProgress();
  });

  if (step.index === WIZARD_TOTAL_STEPS) {
    renderReview();
  }
}
