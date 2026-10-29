const state = {
  workflows: [],
  activeCategory: "i2v",
  activeWorkflowId: "minimax-h3-image-to-video",
  aspectRatio: "9:16",
  fps: 24,
  quantProfile: "int8",
  file: null,
  filePreviewUrl: "",
  r2vReferences: [],
  refmodSlots: Array.from({ length: 8 }, (_, idx) => ({
    slot: idx + 1,
    name: "(none)",
    strength: idx === 0 ? 0.9 : 1.0,
    copies: 1,
  })),
  availableRefmods: ["(none)"],
  studioFiles: [],
  payload: null,
  payloadJson: "",
  pod: null,
  podActionBusy: false,
  gpuOptionsEmpty: false,
};

const ratioDimensions = {
  "9:16": { width: 640, height: 1120 },
  "16:9": { width: 1120, height: 640 },
  "1:1": { width: 832, height: 832 },
  "2:3": { width: 672, height: 1024 },
  "3:2": { width: 1024, height: 672 },
  "3:4": { width: 736, height: 960 },
  "4:3": { width: 960, height: 736 },
  "21:9": { width: 1280, height: 544 },
};

const form = document.querySelector("#payload-form");
const promptPanel = document.querySelector("#prompt-panel");
const promptFloatingLabel = document.querySelector("#prompt-floating-label");
const promptField = document.querySelector("#prompt");
const openrouterKeyWrap = document.querySelector("#openrouter-key-wrap");
const openrouterKeyInput = document.querySelector("#openrouter-api-key");
const secondsField = document.querySelector("#seconds");
const secondsNumberField = document.querySelector("#seconds-number");
const secondsMinLabel = document.querySelector("#seconds-min-label");
const secondsMaxLabel = document.querySelector("#seconds-max-label");
const framesValue = document.querySelector("#frames-value");
const fpsValue = document.querySelector("#fps-value");
const resolutionValue = document.querySelector("#resolution-value");
const charCount = document.querySelector("#char-count");
const feedback = document.querySelector("#feedback");

const categoryButtons = document.querySelectorAll("[data-category]");
const variantPillsContainer = document.querySelector("#workflow-variant-pills");
const wfFileLabel = document.querySelector("#wf-file-label");
const wfDifficultyBadge = document.querySelector("#wf-difficulty-badge");
const wfUpscaleBadge = document.querySelector("#wf-upscale-badge");
const wfAutopromptBadge = document.querySelector("#wf-autoprompt-badge");
const wfTitle = document.querySelector("#wf-title");
const wfDescription = document.querySelector("#wf-description");

const uploadPanelI2v = document.querySelector("#upload-panel-i2v");
const uploadPanelT2v = document.querySelector("#upload-panel-t2v");
const uploadPanelR2v = document.querySelector("#upload-panel-r2v");
const uploadPanelRefmod = document.querySelector("#upload-panel-refmod");
const uploadPanelStudio = document.querySelector("#upload-panel-studio");

const uploadIcon = document.querySelector("#upload-icon");
const uploadTitle = document.querySelector("#upload-title");
const uploadCopy = document.querySelector("#upload-copy");
const sourceImageInput = document.querySelector("#source-image");
const imagePreviewCard = document.querySelector("#image-preview-card");
const imagePreview = document.querySelector("#image-preview");
const previewName = document.querySelector("#preview-name");

const r2vFileInput = document.querySelector("#r2v-file-input");
const r2vAddBtn = document.querySelector("#r2v-add-btn");
const r2vList = document.querySelector("#r2v-list");

const refmodSyncBtn = document.querySelector("#refmod-sync-btn");
const refmodSlotsList = document.querySelector("#refmod-slots-list");

const studioKindLabel = document.querySelector("#studio-kind-label");
const studioPanelTitle = document.querySelector("#studio-panel-title");
const studioPanelHint = document.querySelector("#studio-panel-hint");
const studioFileInput = document.querySelector("#studio-file-input");
const studioAddBtn = document.querySelector("#studio-add-btn");
const studioFileList = document.querySelector("#studio-file-list");

const durationSettingBlock = document.querySelector("#duration-setting-block");
const settingsDivider = document.querySelector("#settings-divider");
const aspectSettingBlock = document.querySelector("#aspect-setting-block");
const aspectButtons = document.querySelectorAll("[data-aspect-ratio]");

const advancedPanel = document.querySelector("#advanced-panel");
const advancedFieldsContainer = document.querySelector("#advanced-fields");
const advancedResetButton = document.querySelector("#advanced-reset");

const generateButton = document.querySelector("#generate-button");
const submitButton = document.querySelector("#submit-button");
const copyButton = document.querySelector("#copy-button");
const downloadButton = document.querySelector("#download-button");

const payloadPanel = document.querySelector("#payload-panel");
const payloadOutput = document.querySelector("#payload-output");
const payloadSummary = document.querySelector("#payload-summary");

const responsePanel = document.querySelector("#response-panel");
const responseSummary = document.querySelector("#response-summary");
const responseStatus = document.querySelector("#response-status");
const responseTexts = document.querySelector("#response-texts");
const responseMedia = document.querySelector("#response-media");
const responseOutput = document.querySelector("#response-output");

const podStatusBadge = document.querySelector("#pod-status-badge");
const podTitle = document.querySelector("#pod-title");
const podSubtitle = document.querySelector("#pod-subtitle");
const podMeta = document.querySelector("#pod-meta");
const podGpuSelect = document.querySelector("#pod-gpu-select");
const podQuantSelect = document.querySelector("#pod-quant-select");
const podDeployBtn = document.querySelector("#pod-deploy-btn");
const podStartBtn = document.querySelector("#pod-start-btn");
const podStopBtn = document.querySelector("#pod-stop-btn");
const podTerminateBtn = document.querySelector("#pod-terminate-btn");
const podComfyLink = document.querySelector("#pod-comfy-link");
const podJupyterLink = document.querySelector("#pod-jupyter-link");
const podRefreshBtn = document.querySelector("#pod-refresh-btn");
const podLogsDetails = document.querySelector("#pod-logs-details");
const podLogsOutput = document.querySelector("#pod-logs-output");
const podCostHistoryDetails = document.querySelector("#pod-cost-history-details");
const podCostHistoryOutput = document.querySelector("#pod-cost-history-output");

const POD_STATUS_POLL_INTERVAL_MS = 2500;
const POD_STATUS_POLL_TIMEOUT_MS = 25 * 60 * 1000;
let podLifecyclePollTimer = null;
let gpuOptionsPollTimer = null;

function secondsToFrames(seconds) {
  const raw = Math.max(5, Math.round(seconds * state.fps));
  return raw + ((5 - (raw % 17)) % 17);
}

function setFeedback(message, type = "") {
  feedback.textContent = message;
  feedback.className = type ? `feedback ${type}` : "feedback";
}

function updatePromptCounter() {
  charCount.textContent = String(promptField.value.length);
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getActiveWorkflow() {
  return (
    state.workflows.find((w) => w.id === state.activeWorkflowId) ||
    state.workflows[0] ||
    null
  );
}

function updateDurationSummary() {
  const wf = getActiveWorkflow();
  const seconds = Number.parseFloat(secondsField.value) || 5;
  const dimensions = ratioDimensions[state.aspectRatio] || ratioDimensions["9:16"];
  secondsNumberField.value = String(seconds);
  framesValue.textContent = wf?.is_refmod_studio ? "—" : String(secondsToFrames(seconds));
  fpsValue.textContent = String(state.fps);
  if (wf?.is_upscale) {
    resolutionValue.textContent = `${dimensions.width} × ${dimensions.height} → ${dimensions.width * 2} × ${dimensions.height * 2} (2×)`;
  } else {
    resolutionValue.textContent = `${dimensions.width} × ${dimensions.height}`;
  }
}

function updateDurationFromNumber() {
  const seconds = Number.parseFloat(secondsNumberField.value);
  if (!Number.isFinite(seconds)) return;
  const minimum = Number.parseFloat(secondsField.min);
  const maximum = Number.parseFloat(secondsField.max);
  secondsField.value = String(Math.min(maximum, Math.max(minimum, Math.round(seconds))));
  updateDurationSummary();
}

function updateAspectButtons() {
  aspectButtons.forEach((button) => {
    const isActive = button.dataset.aspectRatio === state.aspectRatio;
    button.classList.toggle("aspect-button-active", isActive);
    button.setAttribute("aria-checked", String(isActive));
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function setFile(file) {
  if (state.filePreviewUrl) {
    URL.revokeObjectURL(state.filePreviewUrl);
    state.filePreviewUrl = "";
  }
  state.file = file;
  if (!file) {
    imagePreviewCard.hidden = true;
    imagePreview.removeAttribute("src");
    previewName.textContent = "";
    uploadIcon.hidden = false;
    uploadTitle.hidden = false;
    uploadCopy.hidden = false;
    uploadPanelI2v.classList.remove("has-preview");
    return;
  }
  state.filePreviewUrl = URL.createObjectURL(file);
  imagePreview.src = state.filePreviewUrl;
  previewName.textContent = file.name;
  imagePreviewCard.hidden = false;
  uploadIcon.hidden = true;
  uploadTitle.hidden = true;
  uploadCopy.hidden = true;
  uploadPanelI2v.classList.add("has-preview");
}

function computeR2vTags() {
  let imgIdx = 0;
  let vidIdx = 0;
  let audIdx = 0;

  const images = state.r2vReferences.filter((r) => r.kind === "image");
  const videos = state.r2vReferences.filter((r) => r.kind === "video");
  const audios = state.r2vReferences.filter((r) => r.kind === "audio");

  images.forEach((r) => {
    imgIdx += 1;
    r.tag = `<Picture ${imgIdx}>`;
    r.audioTag = null;
  });
  videos.forEach((r) => {
    vidIdx += 1;
    r.tag = `<Video ${vidIdx}>`;
    if (r.use_soundtrack) {
      audIdx += 1;
      r.audioTag = `<Audio ${audIdx}>`;
    } else {
      r.audioTag = null;
    }
  });
  audios.forEach((r) => {
    audIdx += 1;
    r.tag = `<Audio ${audIdx}>`;
    r.audioTag = null;
  });
}

function renderR2vList() {
  computeR2vTags();
  r2vList.innerHTML = "";
  if (!state.r2vReferences.length) {
    const empty = document.createElement("p");
    empty.className = "multi-media-hint";
    empty.textContent = "No references added yet. Click '+ Add Reference' to attach character photos, motion clips, or voice audio.";
    r2vList.appendChild(empty);
    return;
  }

  state.r2vReferences.forEach((ref, idx) => {
    const row = document.createElement("div");
    row.className = "media-ref-row";

    const tagBtn = document.createElement("button");
    tagBtn.type = "button";
    tagBtn.className = "ref-tag-chip";
    tagBtn.textContent = ref.audioTag ? `${ref.tag} + ${ref.audioTag}` : ref.tag;
    tagBtn.title = "Click to insert tag into prompt";
    tagBtn.addEventListener("click", () => {
      promptField.value = `${promptField.value}${promptField.value.endsWith(" ") || !promptField.value ? "" : " "}${ref.tag} `;
      promptField.focus();
      updatePromptCounter();
    });

    const nameSpan = document.createElement("span");
    nameSpan.className = "ref-file-name";
    nameSpan.textContent = `${ref.name} (${ref.kind})`;

    row.appendChild(tagBtn);
    row.appendChild(nameSpan);

    if (ref.kind === "video") {
      const stLabel = document.createElement("label");
      stLabel.className = "multi-media-hint";
      stLabel.style.display = "inline-flex";
      stLabel.style.alignItems = "center";
      stLabel.style.gap = "4px";
      const stCheck = document.createElement("input");
      stCheck.type = "checkbox";
      stCheck.checked = Boolean(ref.use_soundtrack);
      stCheck.addEventListener("change", () => {
        ref.use_soundtrack = stCheck.checked;
        renderR2vList();
      });
      stLabel.appendChild(stCheck);
      stLabel.append("Audio");
      row.appendChild(stLabel);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ref-remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      state.r2vReferences.splice(idx, 1);
      renderR2vList();
    });

    row.appendChild(removeBtn);
    r2vList.appendChild(row);
  });
}

function renderRefmodSlots() {
  refmodSlotsList.innerHTML = "";
  state.refmodSlots.forEach((slotObj) => {
    const row = document.createElement("div");
    row.className = "refmod-slot-row";

    const label = document.createElement("span");
    label.className = "refmod-slot-label";
    label.textContent = `Slot ${slotObj.slot}`;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "refmod-slot-input";
    nameInput.setAttribute("list", "refmod-datalist");
    nameInput.value = slotObj.name;
    nameInput.placeholder = "(none) or people/name_v1";
    nameInput.addEventListener("input", () => {
      slotObj.name = nameInput.value.trim() || "(none)";
    });

    const strengthInput = document.createElement("input");
    strengthInput.type = "number";
    strengthInput.className = "refmod-slot-input";
    strengthInput.min = "0";
    strengthInput.max = "1";
    strengthInput.step = "0.05";
    strengthInput.value = String(slotObj.strength);
    strengthInput.title = "Strength (0.0 - 1.0)";
    strengthInput.addEventListener("input", () => {
      slotObj.strength = Number.parseFloat(strengthInput.value) || 0;
    });

    const copiesInput = document.createElement("input");
    copiesInput.type = "number";
    copiesInput.className = "refmod-slot-input";
    copiesInput.min = "1";
    copiesInput.max = "10";
    copiesInput.step = "1";
    copiesInput.value = String(slotObj.copies);
    copiesInput.title = "Copies (1 - 10)";
    copiesInput.addEventListener("input", () => {
      slotObj.copies = Number.parseInt(copiesInput.value, 10) || 1;
    });

    row.appendChild(label);
    row.appendChild(nameInput);
    row.appendChild(strengthInput);
    row.appendChild(copiesInput);
    refmodSlotsList.appendChild(row);
  });

  let datalist = document.querySelector("#refmod-datalist");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "refmod-datalist";
    document.body.appendChild(datalist);
  }
  datalist.innerHTML = "";
  state.availableRefmods.forEach((modName) => {
    const opt = document.createElement("option");
    opt.value = modName;
    datalist.appendChild(opt);
  });
}

function renderStudioFileList() {
  studioFileList.innerHTML = "";
  if (!state.studioFiles.length) {
    const empty = document.createElement("p");
    empty.className = "multi-media-hint";
    empty.textContent = "No files selected yet. Click '+ Select Files' above.";
    studioFileList.appendChild(empty);
    return;
  }
  state.studioFiles.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "media-ref-row";

    const chip = document.createElement("span");
    chip.className = "ref-tag-chip";
    chip.textContent = `#${idx + 1}`;

    const nameSpan = document.createElement("span");
    nameSpan.className = "ref-file-name";
    nameSpan.textContent = item.name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ref-remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      state.studioFiles.splice(idx, 1);
      renderStudioFileList();
    });

    row.appendChild(chip);
    row.appendChild(nameSpan);
    row.appendChild(removeBtn);
    studioFileList.appendChild(row);
  });
}

function renderCategoryAndVariants() {
  categoryButtons.forEach((btn) => {
    const active = btn.dataset.category === state.activeCategory;
    btn.classList.toggle("mode-pill-active", active);
  });

  const catWorkflows = state.workflows.filter(
    (w) => w.category === state.activeCategory
  );
  if (
    catWorkflows.length &&
    !catWorkflows.some((w) => w.id === state.activeWorkflowId)
  ) {
    state.activeWorkflowId = catWorkflows[0].id;
  }

  variantPillsContainer.innerHTML = "";
  catWorkflows.forEach((wf) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `variant-btn ${
      wf.id === state.activeWorkflowId ? "variant-btn-active" : ""
    }`;
    btn.textContent = wf.title.replace(/^MiniMax H3\s*/i, "");
    btn.addEventListener("click", () => {
      selectWorkflow(wf.id);
    });
    variantPillsContainer.appendChild(btn);
  });

  applyActiveWorkflowUi();
}

function selectWorkflow(workflowId) {
  const wf = state.workflows.find((w) => w.id === workflowId);
  if (!wf) return;
  state.activeWorkflowId = wf.id;
  state.activeCategory = wf.category;
  renderCategoryAndVariants();
}

function applyActiveWorkflowUi() {
  const wf = getActiveWorkflow();
  if (!wf) return;

  wfFileLabel.textContent = wf.file;
  wfDifficultyBadge.textContent = wf.difficulty || "Beginner";
  wfUpscaleBadge.hidden = !wf.is_upscale;
  wfAutopromptBadge.hidden = !wf.is_auto_prompt;
  wfTitle.textContent = wf.title;
  wfDescription.textContent = wf.description;

  // Update defaults from workflow
  if (wf.defaults?.aspect_ratio && ratioDimensions[wf.defaults.aspect_ratio]) {
    state.aspectRatio = wf.defaults.aspect_ratio;
    updateAspectButtons();
  }
  if (wf.defaults?.seconds) {
    secondsField.value = String(wf.defaults.seconds);
    secondsNumberField.value = String(wf.defaults.seconds);
  }

  // Toggle media panels by category
  uploadPanelI2v.hidden = wf.category !== "i2v";
  uploadPanelT2v.hidden = wf.category !== "t2v";
  uploadPanelR2v.hidden = wf.category !== "r2v";
  uploadPanelRefmod.hidden = wf.category !== "refmod";
  uploadPanelStudio.hidden = wf.category !== "refmod_studio";

  // Prompt label & placeholder
  openrouterKeyWrap.hidden = !(wf.is_auto_prompt || wf.category === "r2v");

  if (wf.category === "refmod_studio") {
    promptFloatingLabel.textContent = "RefMod Pack Name";
    promptField.placeholder =
      wf.studio_kind === "image"
        ? "person_reference_v1"
        : wf.studio_kind === "video"
        ? "video_reference_v1"
        : "audio_reference_v1";
    if (!promptField.value.trim()) {
      promptField.value = wf.defaults?.default_prompt || `${wf.studio_kind}_reference_v1`;
    }
    studioKindLabel.textContent = `RefMod Studio · ${wf.studio_kind.toUpperCase()} Pack`;
    if (wf.studio_kind === "image") {
      studioPanelTitle.textContent = "Upload Character Portraits (1–8 Images)";
      studioPanelHint.textContent =
        "Upload 3–5 clear photos of the same person/character. Saved under /workspace/ComfyUI/models/refmods/people/.";
      studioFileInput.accept = "image/*";
      studioFileInput.multiple = true;
    } else if (wf.studio_kind === "video") {
      studioPanelTitle.textContent = "Upload Reference Video Clip";
      studioPanelHint.textContent =
        "Upload 1 short video clip of the appearance/motion you want to capture. Saved under /workspace/ComfyUI/models/refmods/video/.";
      studioFileInput.accept = "video/*";
      studioFileInput.multiple = false;
    } else {
      studioPanelTitle.textContent = "Upload Reference Audio (Voice / Music / SFX)";
      studioPanelHint.textContent =
        "Upload 1 clean audio clip (first 30 seconds used by default). Saved under /workspace/ComfyUI/models/refmods/audio/.";
      studioFileInput.accept = "audio/*";
      studioFileInput.multiple = false;
    }
    submitButton.textContent = "Build & Save RefMod Pack";
    durationSettingBlock.hidden = true;
    settingsDivider.hidden = true;
    aspectSettingBlock.hidden = true;
    renderStudioFileList();
  } else {
    durationSettingBlock.hidden = false;
    settingsDivider.hidden = false;
    aspectSettingBlock.hidden = false;
    submitButton.textContent = wf.is_upscale
      ? "Generate Video (Base + 2× Upscale)"
      : "Generate Video";

    if (wf.category === "r2v") {
      promptFloatingLabel.textContent = "Scene Direction (R2V)";
      promptField.placeholder =
        "Describe what happens using reference tags, e.g. 'The woman from <Picture 1> walks through the room with the camera motion of <Video 1>, speaking in the voice of <Audio 1>...'";
      renderR2vList();
    } else if (wf.category === "refmod") {
      promptFloatingLabel.textContent = "Scene Prompt (with loaded RefMods)";
      promptField.placeholder =
        "Describe your scene, action, dialogue, and sound effects for your loaded RefMod character/style...";
      renderRefmodSlots();
    } else if (wf.is_auto_prompt) {
      promptFloatingLabel.textContent = "Short Prompt Idea (AI Auto Prompt)";
      promptField.placeholder =
        "Type a short scene idea — Gemini 3 Flash via OpenRouter will expand it into a full MiniMax H3 visual + audio prompt...";
    } else {
      promptFloatingLabel.textContent = "Prompt";
      promptField.placeholder =
        "Describe your scene, camera movement, dialogue in quotes, room tone, and sound effects in detail...";
    }
  }

  updatePromptCounter();
  updateDurationSummary();
  renderAdvancedFields(wf.advanced_fields || []);
}

function renderAdvancedFields(fields) {
  if (!advancedFieldsContainer || !Array.isArray(fields) || !fields.length) {
    if (advancedPanel) advancedPanel.hidden = true;
    return;
  }
  advancedPanel.hidden = false;
  advancedFieldsContainer.innerHTML = "";
  const groups = new Map();
  fields.forEach((field) => {
    const groupName = field.group || "Workflow";
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName).push(field);
  });

  groups.forEach((groupFields, groupName) => {
    const groupEl = document.createElement("div");
    groupEl.className = "advanced-group";

    const groupTitle = document.createElement("p");
    groupTitle.className = "advanced-group-title";
    groupTitle.textContent = groupName;
    groupEl.appendChild(groupTitle);

    const grid = document.createElement("div");
    grid.className = "advanced-grid";

    groupFields.forEach((field) => {
      const label = document.createElement("label");
      label.className = "field-group";

      const labelText = document.createElement("span");
      labelText.className = "field-label";
      labelText.textContent = field.label || field.id;
      label.appendChild(labelText);

      let input;
      if (field.type === "select") {
        input = document.createElement("select");
        input.className = "advanced-input";
        (field.options || []).forEach((option) => {
          const opt = document.createElement("option");
          opt.value = option;
          opt.textContent = option;
          input.appendChild(opt);
        });
        input.value = String(field.value);
      } else if (field.type === "textarea") {
        input = document.createElement("textarea");
        input.className = "advanced-input advanced-textarea";
        input.rows = 2;
        input.value = field.value ?? "";
      } else {
        input = document.createElement("input");
        input.className = "advanced-input";
        input.type = field.type === "number" ? "number" : "text";
        if (field.min !== undefined) input.min = String(field.min);
        if (field.max !== undefined) input.max = String(field.max);
        if (field.step !== undefined) input.step = String(field.step);
        input.value = String(field.value ?? "");
      }

      input.dataset.fieldId = field.id;
      input.dataset.defaultValue = String(field.value ?? "");
      label.appendChild(input);

      if (field.help) {
        const help = document.createElement("span");
        help.className = "advanced-help";
        help.textContent = field.help;
        label.appendChild(help);
      }

      grid.appendChild(label);
    });

    groupEl.appendChild(grid);
    advancedFieldsContainer.appendChild(groupEl);
  });
}

function collectOverrides() {
  const overrides = {};
  if (!advancedFieldsContainer) return overrides;
  advancedFieldsContainer.querySelectorAll("[data-field-id]").forEach((input) => {
    overrides[input.dataset.fieldId] = input.value;
  });
  return overrides;
}

function resetAdvancedFields() {
  if (!advancedFieldsContainer) return;
  advancedFieldsContainer.querySelectorAll("[data-field-id]").forEach((input) => {
    input.value = input.dataset.defaultValue;
  });
  setFeedback("Advanced workflow settings reset to defaults.", "success");
}

function renderSummary(summary) {
  const chips = [
    summary.workflow_title || summary.workflow_id,
    summary.frames ? `${summary.frames} frames` : "RefMod Pack",
    summary.seconds ? `${summary.seconds.toFixed(1)}s @ ${summary.fps}fps` : "",
    summary.width && summary.height ? `${summary.width} × ${summary.height} (${summary.aspect_ratio})` : "",
    summary.is_upscale ? "2× Latent Upscale" : "",
    summary.is_auto_prompt ? "AI Auto Prompt" : "",
    `Quant: ${summary.quant_profile || "int8"}`,
  ].filter(Boolean);

  payloadSummary.innerHTML = "";
  chips.forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "payload-summary-chip";
    chip.textContent = text;
    payloadSummary.appendChild(chip);
  });
}

async function buildPayload({
  scroll = true,
  showPreview = true,
  successMessage = "Compiled API payload ready.",
} = {}) {
  const wf = getActiveWorkflow();
  if (!wf) throw new Error("No workflow selected.");

  if (wf.requires_prompt && !promptField.value.trim()) {
    setFeedback("Prompt is required for this workflow.", "error");
    promptField.focus();
    return null;
  }

  let imageDataUrl = "";
  let imageName = "";
  if (wf.category === "i2v") {
    if (!state.file) {
      setFeedback("First-frame source image is required for Image-to-Video workflows.", "error");
      return null;
    }
    imageName = state.file.name;
    imageDataUrl = await readFileAsDataUrl(state.file);
  }

  if (wf.category === "refmod_studio" && !state.studioFiles.length) {
    setFeedback("Please select at least one reference file to build a RefMod pack.", "error");
    return null;
  }

  const quantProfile = state.pod?.quant_profile || podQuantSelect.value || "int8";

  const response = await fetch("api/payload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workflow_id: wf.id,
      prompt: promptField.value,
      seconds: Number.parseFloat(secondsField.value) || 5,
      aspect_ratio: state.aspectRatio,
      image_name: imageName,
      image_data_url: imageDataUrl,
      openrouter_api_key: openrouterKeyInput.value.trim(),
      references: state.r2vReferences,
      refmods: state.refmodSlots,
      studio_files: state.studioFiles,
      quant_profile: quantProfile,
      overrides: collectOverrides(),
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "Failed to build workflow payload.");
  }

  state.payload = data.payload;
  state.payloadJson = JSON.stringify(data.payload, null, 2);
  payloadOutput.textContent = state.payloadJson;
  renderSummary(data.summary);
  payloadPanel.hidden = !showPreview;
  if (scroll && showPreview) {
    payloadPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (successMessage) {
    setFeedback(successMessage, "success");
  }
  return data.payload;
}

function renderResponse(result) {
  const chips = [
    result.ok ? `HTTP ${result.status_code} ok` : `HTTP ${result.status_code}`,
    result.response_json?.pod_id ? `Pod ${result.response_json.pod_id}` : "ComfyUI :8188",
  ];
  responseSummary.innerHTML = "";
  chips.forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "payload-summary-chip";
    chip.textContent = text;
    responseSummary.appendChild(chip);
  });

  const output = result.response_json?.output || null;
  renderResponseTexts(output?.texts || []);
  renderResponseMedia(output);
  renderPodJobStatus(result.response_json || {});
  responsePanel.hidden = false;
}

function renderPodJobStatus(responseJson) {
  const status = responseJson?.status || "";
  const hasOutput = Boolean(responseJson?.output);
  const renderTimeSec = responseJson?.metadata?.render_time_sec;
  const completedClock =
    responseJson?.metadata?.completed_clock ||
    formatClock(responseJson?.metadata?.completed_at);

  if (hasOutput) {
    const timeCopy =
      typeof renderTimeSec === "number" ? ` in ${renderTimeSec.toFixed(2)}s` : "";
    const clockCopy = completedClock ? ` at ${completedClock}` : "";
    responseStatus.textContent = `Generation complete${timeCopy}${clockCopy}.`;
    responseStatus.hidden = false;
    return;
  }

  const statusCopy = {
    queued: "Workflow queued on MiniMax H3 Pod.",
    running: "ComfyUI is running the MiniMax H3 workflow...",
    completed: "Execution completed.",
  };
  responseStatus.textContent = statusCopy[status] || "Working on your request...";
  responseStatus.hidden = false;
}

function renderResponseTexts(texts) {
  responseTexts.innerHTML = "";
  if (!Array.isArray(texts) || !texts.length) {
    responseTexts.hidden = true;
    return;
  }
  texts.forEach((item) => {
    const card = document.createElement("div");
    card.className = "response-text-card";
    card.textContent = item.text;
    responseTexts.appendChild(card);
  });
  responseTexts.hidden = false;
}

function renderResponseMedia(output) {
  responseMedia.innerHTML = "";
  const hasVideos = Boolean(output?.videos?.length);
  const hasImages = Boolean(output?.images?.length);
  const hasAudios = Boolean(output?.audios?.length);

  if (!hasVideos && !hasImages && !hasAudios) {
    responseMedia.hidden = true;
    return;
  }

  const renderArtifactCard = (artifact, mediaKind) => {
    const card = document.createElement("article");
    card.className = "response-media-card";

    const header = document.createElement("div");
    header.className = "response-media-header";

    const title = document.createElement("p");
    title.className = "response-media-title";
    title.textContent = artifact.filename;

    const saveLink = document.createElement("a");
    saveLink.className = "response-media-link";
    saveLink.href = artifact.download_url || artifact.url;
    saveLink.textContent =
      mediaKind === "video"
        ? "Save video"
        : mediaKind === "audio"
        ? "Save audio"
        : "Save image";
    saveLink.setAttribute("download", artifact.filename);

    header.appendChild(title);
    header.appendChild(saveLink);
    card.appendChild(header);

    if (mediaKind === "video") {
      const video = document.createElement("video");
      video.className = "response-video";
      video.src = artifact.url;
      video.controls = true;
      video.preload = "metadata";
      card.appendChild(video);
    } else if (mediaKind === "audio") {
      const audio = document.createElement("audio");
      audio.className = "response-audio";
      audio.src = artifact.url;
      audio.controls = true;
      card.appendChild(audio);
    } else {
      const image = document.createElement("img");
      image.className = "response-image";
      image.src = artifact.url;
      image.alt = artifact.filename;
      card.appendChild(image);
    }

    return card;
  };

  output.videos?.forEach((v) => responseMedia.appendChild(renderArtifactCard(v, "video")));
  output.audios?.forEach((a) => responseMedia.appendChild(renderArtifactCard(a, "audio")));
  output.images?.forEach((i) => responseMedia.appendChild(renderArtifactCard(i, "image")));
  responseMedia.hidden = false;
}

async function pollPodSubmitStatus(promptId, podId) {
  const deadline = Date.now() + POD_STATUS_POLL_TIMEOUT_MS;
  const qs = podId ? `?pod_id=${encodeURIComponent(podId)}` : "";
  const statusUrl = `api/pod-submit/${encodeURIComponent(promptId)}${qs}`;

  while (Date.now() < deadline) {
    const response = await fetch(statusUrl);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || "Failed to poll Pod workflow status.");
    }
    renderResponse(result);
    if (result.response_json?.status === "completed") {
      return result;
    }
    await sleep(POD_STATUS_POLL_INTERVAL_MS);
  }
  throw new Error("Pod workflow timed out while waiting for ComfyUI completion.");
}

function formatClock(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString();
}

function formatCountdown(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}m ${String(secs).padStart(2, "0")}s`;
}

function describeRun(run) {
  if (!run) return "";
  const duration = run.duration_display || formatCountdown(run.duration_seconds);
  const reason =
    run.reason === "idle-timeout"
      ? "auto-terminated after idle timeout"
      : run.reason === "stopped"
      ? "stopped"
      : "terminated";
  const clock = run.terminated_clock || formatClock(run.terminated_at);
  const cost = typeof run.cost === "number" ? ` · $${run.cost.toFixed(2)}` : "";
  return `Last Pod run: ${duration} (${reason}${clock ? ` at ${clock}` : ""})${cost}`;
}

function renderCostHistory(history, totalCost) {
  if (!podCostHistoryDetails || !podCostHistoryOutput) return;
  const runs = Array.isArray(history) ? history : [];
  if (!runs.length) {
    podCostHistoryDetails.hidden = true;
    return;
  }
  const lines = runs.map((run) => {
    const clock = run.terminated_clock || formatClock(run.terminated_at);
    const duration = run.duration_display || formatCountdown(run.duration_seconds);
    const cost = typeof run.cost === "number" ? `$${run.cost.toFixed(2)}` : "—";
    const gpu = run.gpu_name || "";
    const reason =
      run.reason === "idle-timeout" ? "idle-timeout" : run.reason || "terminated";
    return `${clock || "—"} · ${cost} · ${duration} · ${reason}${gpu ? ` · ${gpu}` : ""}`;
  });
  if (typeof totalCost === "number") {
    lines.push(`— total to date $${totalCost.toFixed(2)} —`);
  }
  podCostHistoryOutput.textContent = lines.join("\n");
  podCostHistoryDetails.hidden = false;
}

function renderPodMeta(data, tickOnly = false) {
  if (!podMeta) return;
  const idle = data?.idle || {};
  const pod = data?.pod || null;
  const parts = [];

  if (pod && pod.runtime_display) {
    const costCopy =
      typeof pod.runtime_cost === "number"
        ? ` · cost so far $${pod.runtime_cost.toFixed(2)}`
        : "";
    parts.push(`Pod running for ${pod.runtime_display}${costCopy}`);
  }
  if (idle.enabled) {
    if (pod && pod.phase === "READY") {
      let remaining =
        typeof idle.remaining_seconds === "number"
          ? idle.remaining_seconds
          : idle.timeout_seconds;
      if (typeof state.podIdleDeadline === "number") {
        remaining = Math.max(0, (state.podIdleDeadline - Date.now()) / 1000);
      }
      parts.push(
        `Auto-terminate in ${formatCountdown(remaining)} with no job (idle timeout ${formatCountdown(idle.timeout_seconds)})`
      );
    } else if (!pod && idle.auto_terminated_at) {
      parts.push(
        `Auto-terminated ${formatClock(idle.auto_terminated_at)} after ${formatCountdown(idle.timeout_seconds)} idle`
      );
    } else {
      parts.push(`Idle auto-terminate: ${formatCountdown(idle.timeout_seconds)}`);
    }
  } else {
    parts.push("Idle auto-terminate disabled");
  }

  const lastRun = data?.last_run;
  if (!pod && lastRun) {
    parts.push(describeRun(lastRun));
  }
  if (typeof data?.total_cost === "number") {
    parts.push(`Total compute cost to date $${data.total_cost.toFixed(2)}`);
  }

  podMeta.textContent = parts.join(" · ");
  podMeta.hidden = parts.length === 0;
  if (!tickOnly) {
    podMeta.classList.toggle(
      "pod-meta-warn",
      Boolean(idle.enabled && pod && pod.phase === "READY" && state.podIdleDeadline)
    );
  }
}

function startPodIdleTicker() {
  if (state.podIdleTicker) return;
  state.podIdleTicker = window.setInterval(() => {
    if (typeof state.podIdleDeadline !== "number") return;
    if (Date.now() >= state.podIdleDeadline) {
      state.podIdleDeadline = null;
      refreshPodStatus();
      return;
    }
    if (state.lastPodStatusData) {
      renderPodMeta(state.lastPodStatusData, true);
    }
  }, 1000);
}

function renderPodControlState(data) {
  const pod = data?.pod || null;
  state.pod = pod;
  state.lastPodStatusData = data;
  const vol = data?.default_volume || {};
  const logs = data?.logs || [];
  const idle = data?.idle || {};
  state.podIdleDeadline =
    idle.enabled && pod && pod.phase === "READY" &&
    typeof idle.remaining_seconds === "number"
      ? Date.now() + idle.remaining_seconds * 1000
      : null;
  startPodIdleTicker();
  renderPodMeta(data);
  renderCostHistory(data?.run_history, data?.total_cost);

  if (!pod) {
    podStatusBadge.textContent = "Not Deployed ($0/hr compute)";
    podStatusBadge.className = "pod-status-badge pod-status-idle";
    podTitle.textContent = "No MiniMax H3 Pod Active";
    const volLabel =
      vol.kind === "global"
        ? `${vol.name || "videoalpha-models"} (${vol.id || "cmvtrnt3d000207jq49ta8tvj"} · global · mounts at ${vol.mount_path || "/workspace"})`
        : `${vol.name || "ltx25-models"} (${vol.id || "vkqbtcijow"} · ${vol.size_gb || 165} GB · ${vol.data_center_id || "EUR-IS-2"} → ${vol.mount_path || "/workspace"})`;
    podSubtitle.innerHTML = `Shared models volume ready: <code>${volLabel}</code>`;
    podGpuSelect.hidden = false;
    podQuantSelect.hidden = false;
    podDeployBtn.hidden = false;
    podDeployBtn.disabled = state.podActionBusy || state.gpuOptionsEmpty;
    podStartBtn.hidden = true;
    podStopBtn.hidden = true;
    podTerminateBtn.hidden = true;
    podComfyLink.hidden = true;
    podJupyterLink.hidden = true;
    podLogsDetails.hidden = true;
    return;
  }

  const priceStr =
    typeof pod.cost_per_hr === "number" ? `$${pod.cost_per_hr.toFixed(2)}/hr` : "";
  podTitle.textContent = `${pod.name} · ${pod.gpu_name} (${pod.id})`;
  podSubtitle.innerHTML = `Data Center: <code>${pod.data_center_id}</code> · Volume: <code>${pod.volume_id} → ${pod.mount_path}</code> · Quant: <code>${pod.quant_profile || "int8"}</code>`;

  podGpuSelect.hidden = true;
  podQuantSelect.hidden = true;
  podDeployBtn.hidden = true;

  if (pod.phase === "READY") {
    podStatusBadge.textContent = `Ready · ${priceStr}`;
    podStatusBadge.className = "pod-status-badge pod-status-ready";
    podStartBtn.hidden = true;
    podStopBtn.hidden = false;
    podTerminateBtn.hidden = false;
    podComfyLink.hidden = false;
    podComfyLink.href = pod.comfy_url;
    podJupyterLink.hidden = false;
    podJupyterLink.href = pod.jupyter_url;
  } else if (pod.phase === "STOPPED") {
    podStatusBadge.textContent = "Stopped (GPU Released)";
    podStatusBadge.className = "pod-status-badge pod-status-stopped";
    podStartBtn.hidden = false;
    podStopBtn.hidden = true;
    podTerminateBtn.hidden = false;
    podComfyLink.hidden = true;
    podJupyterLink.hidden = true;
  } else {
    podStatusBadge.textContent = `Bootstrapping Models & ComfyUI... (${priceStr})`;
    podStatusBadge.className = "pod-status-badge pod-status-booting";
    podStartBtn.hidden = true;
    podStopBtn.hidden = false;
    podTerminateBtn.hidden = false;
    podComfyLink.hidden = true;
    podJupyterLink.hidden = false;
    podJupyterLink.href = pod.jupyter_url;
  }

  podStartBtn.disabled = state.podActionBusy;
  podStopBtn.disabled = state.podActionBusy;
  podTerminateBtn.disabled = state.podActionBusy;

  if (logs.length > 0) {
    podLogsDetails.hidden = false;
    if (pod.phase === "BOOTSTRAPPING") {
      podLogsDetails.open = true;
    }
    podLogsOutput.textContent = logs.join("\n");
  } else {
    podLogsDetails.hidden = pod.phase !== "BOOTSTRAPPING";
  }
}

function renderGpuOptions(gpus) {
  const previous = podGpuSelect.value;
  podGpuSelect.innerHTML = "";
  state.gpuOptionsEmpty = !gpus.length;
  if (!gpus.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No GPUs currently available — retrying…";
    podGpuSelect.appendChild(opt);
  } else {
    for (const gpu of gpus) {
      const opt = document.createElement("option");
      opt.value = gpu.id;
      opt.textContent = gpu.label || gpu.id;
      podGpuSelect.appendChild(opt);
    }
    if (previous && gpus.some((gpu) => gpu.id === previous)) {
      podGpuSelect.value = previous;
    }
  }
  if (!podGpuSelect.hidden) {
    podDeployBtn.disabled = state.podActionBusy || state.gpuOptionsEmpty;
  }
}

async function refreshGpuOptions() {
  try {
    const resp = await fetch("api/pod/gpus");
    if (resp.ok) {
      const data = await resp.json();
      renderGpuOptions(data?.gpus || []);
    }
  } catch (_err) {}
  gpuOptionsPollTimer = window.setTimeout(refreshGpuOptions, 30000);
}

async function refreshPodStatus() {
  try {
    const resp = await fetch("api/pod/status");
    if (!resp.ok) return;
    const data = await resp.json();
    renderPodControlState(data);
    const nextDelay =
      data?.pod && data.pod.phase === "BOOTSTRAPPING" ? 5000 : 12000;
    window.clearTimeout(podLifecyclePollTimer);
    podLifecyclePollTimer = window.setTimeout(refreshPodStatus, nextDelay);
  } catch (_err) {
    window.clearTimeout(podLifecyclePollTimer);
    podLifecyclePollTimer = window.setTimeout(refreshPodStatus, 15000);
  }
}

async function deployPodFromUi() {
  state.podActionBusy = true;
  podDeployBtn.disabled = true;
  podDeployBtn.textContent = "Deploying...";
  setFeedback(
    "Provisioning MiniMax H3 GPU Pod with the shared models volume attached...",
    "success"
  );
  try {
    const resp = await fetch("api/pod/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gpu_id: podGpuSelect.value,
        quant_profile: podQuantSelect.value,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.detail || "Failed to deploy MiniMax H3 Pod.");
    }
    renderPodControlState(data);
    setFeedback(
      "MiniMax H3 Pod deployed! Waiting for ComfyUI and MiniMax models to finish provisioning...",
      "success"
    );
    window.clearTimeout(podLifecyclePollTimer);
    podLifecyclePollTimer = window.setTimeout(refreshPodStatus, 4000);
  } catch (err) {
    setFeedback(err.message, "error");
  } finally {
    state.podActionBusy = false;
    podDeployBtn.disabled = false;
    podDeployBtn.textContent = "Deploy Pod";
  }
}

async function triggerPodActionFromUi(action) {
  if (action === "terminate") {
    const ok = window.confirm(
      "Terminate the MiniMax H3 Pod? Compute billing stops immediately and all MiniMax H3 & LTX models remain safely persisted on the shared models volume."
    );
    if (!ok) return;
  }
  state.podActionBusy = true;
  podStartBtn.disabled = true;
  podStopBtn.disabled = true;
  podTerminateBtn.disabled = true;
  setFeedback(`Executing Pod action: ${action}...`, "success");
  try {
    const resp = await fetch("api/pod/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        pod_id: state.pod?.id || "",
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.detail || `Pod ${action} failed.`);
    }
    renderPodControlState(data);
    setFeedback(
      action === "terminate"
        ? "Pod terminated. Models remain saved on the shared models volume."
        : `Pod ${action} succeeded.`,
      "success"
    );
    window.clearTimeout(podLifecyclePollTimer);
    podLifecyclePollTimer = window.setTimeout(refreshPodStatus, 4000);
  } catch (err) {
    setFeedback(err.message, "error");
  } finally {
    state.podActionBusy = false;
    podStartBtn.disabled = false;
    podStopBtn.disabled = false;
    podTerminateBtn.disabled = false;
  }
}

async function syncRefmodsFromPod() {
  refmodSyncBtn.disabled = true;
  refmodSyncBtn.textContent = "Syncing...";
  try {
    const resp = await fetch("api/pod/live-options");
    const data = await resp.json();
    if (Array.isArray(data.refmods) && data.refmods.length) {
      state.availableRefmods = data.refmods;
      renderRefmodSlots();
      setFeedback(
        `Synced ${data.refmods.length - 1} RefMod(s) from running Pod.`,
        "success"
      );
    } else {
      setFeedback("Pod is not ready or no saved RefMods found yet.", "error");
    }
  } catch (err) {
    setFeedback(`Failed to sync RefMods: ${err.message}`, "error");
  } finally {
    refmodSyncBtn.disabled = false;
    refmodSyncBtn.textContent = "↻ Sync from Pod";
  }
}

async function initializeConfig() {
  const response = await fetch("api/config");
  if (!response.ok) {
    throw new Error("Failed to load MiniMax H3 configuration.");
  }
  const config = await response.json();
  state.fps = config.fps || 24;
  state.workflows = config.workflows || [];
  state.activeWorkflowId = config.default_workflow_id || "minimax-h3-image-to-video";
  secondsField.min = String(config.seconds.min);
  secondsField.max = String(config.seconds.max);
  secondsField.step = String(config.seconds.step);
  secondsField.value = String(config.seconds.default);
  secondsNumberField.min = String(config.seconds.min);
  secondsNumberField.max = String(config.seconds.max);
  secondsNumberField.step = String(config.seconds.step);
  secondsNumberField.value = String(config.seconds.default);
  secondsMinLabel.textContent = `${config.seconds.min}s`;
  secondsMaxLabel.textContent = `${config.seconds.max}s`;

  if (config.has_openrouter_key) {
    openrouterKeyInput.placeholder = "Configured on server (optional override)";
  }

  renderCategoryAndVariants();
}

// Event Listeners
categoryButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    state.activeCategory = btn.dataset.category;
    renderCategoryAndVariants();
  });
});

aspectButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.aspectRatio = button.dataset.aspectRatio;
    updateAspectButtons();
    updateDurationSummary();
  });
});

promptField.addEventListener("input", updatePromptCounter);
secondsField.addEventListener("input", updateDurationSummary);
secondsNumberField.addEventListener("input", updateDurationFromNumber);

copyButton.addEventListener("click", async () => {
  if (!state.payloadJson) return;
  await navigator.clipboard.writeText(state.payloadJson);
  setFeedback("Payload JSON copied to clipboard.", "success");
});

downloadButton.addEventListener("click", () => {
  if (!state.payloadJson) return;
  const blob = new Blob([state.payloadJson], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.activeWorkflowId}-payload.json`;
  link.click();
  URL.revokeObjectURL(url);
});

uploadPanelI2v.addEventListener("click", () => sourceImageInput.click());
sourceImageInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  setFile(file || null);
});

["dragenter", "dragover"].forEach((eventName) => {
  uploadPanelI2v.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadPanelI2v.classList.add("drag-active");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadPanelI2v.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadPanelI2v.classList.remove("drag-active");
  });
});

uploadPanelI2v.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file && file.type.startsWith("image/")) {
    setFile(file);
  }
});

r2vAddBtn.addEventListener("click", () => r2vFileInput.click());
r2vFileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    let kind = "image";
    if (file.type.startsWith("video/")) kind = "video";
    else if (file.type.startsWith("audio/")) kind = "audio";
    const dataUrl = await readFileAsDataUrl(file);
    state.r2vReferences.push({
      kind,
      name: file.name,
      data_url: dataUrl,
      use_soundtrack: kind === "video",
    });
  }
  r2vFileInput.value = "";
  renderR2vList();
});

refmodSyncBtn.addEventListener("click", syncRefmodsFromPod);

studioAddBtn.addEventListener("click", () => studioFileInput.click());
studioFileInput.addEventListener("change", async (event) => {
  const wf = getActiveWorkflow();
  const files = Array.from(event.target.files || []);
  if (wf?.studio_kind !== "image") {
    state.studioFiles = [];
  }
  for (const file of files) {
    const dataUrl = await readFileAsDataUrl(file);
    state.studioFiles.push({
      name: file.name,
      data_url: dataUrl,
    });
  }
  studioFileInput.value = "";
  renderStudioFileList();
});

advancedResetButton?.addEventListener("click", resetAdvancedFields);

podDeployBtn?.addEventListener("click", deployPodFromUi);
podStartBtn?.addEventListener("click", () => triggerPodActionFromUi("start"));
podStopBtn?.addEventListener("click", () => triggerPodActionFromUi("stop"));
podTerminateBtn?.addEventListener("click", () => triggerPodActionFromUi("terminate"));
podRefreshBtn?.addEventListener("click", refreshPodStatus);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setFeedback("");
  generateButton.disabled = true;
  generateButton.textContent = "Compiling...";
  try {
    await buildPayload({ scroll: true, showPreview: true });
  } catch (err) {
    setFeedback(err.message, "error");
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = "Preview Compiled API Payload";
  }
});

submitButton.addEventListener("click", async () => {
  setFeedback("");
  submitButton.disabled = true;
  generateButton.disabled = true;
  const origLabel = submitButton.textContent;
  submitButton.textContent = "Submitting to Pod...";

  try {
    const payload = await buildPayload({
      scroll: false,
      showPreview: false,
      successMessage: "",
    });
    if (!payload) return;

    const response = await fetch("api/pod-submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload,
        timeout_seconds: 900,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.detail || "Pod workflow submission failed.");
    }

    renderResponse(result);
    responsePanel.scrollIntoView({ behavior: "smooth", block: "start" });

    if (result.response_json?.prompt_id) {
      setFeedback("Workflow queued on ComfyUI. Waiting for completion...", "success");
      const finalResult = await pollPodSubmitStatus(
        result.response_json.prompt_id,
        result.response_json.pod_id || ""
      );
      if (finalResult.ok) {
        setFeedback("Workflow execution completed!", "success");
      }
    }
  } catch (err) {
    setFeedback(err.message, "error");
  } finally {
    submitButton.disabled = false;
    generateButton.disabled = false;
    submitButton.textContent = origLabel;
  }
});

initializeConfig()
  .then(() => {
    refreshPodStatus();
    refreshGpuOptions();
  })
  .catch((err) => {
    setFeedback(err.message, "error");
  });
