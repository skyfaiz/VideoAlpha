(() => {
  const SAMPLE_SCRIPTS = {
    video_intro: {
      title: "VideoAlpha Studio Intro",
      textType: "text",
      text: "Welcome to VideoAlpha Studio. With Amazon Polly, you can generate natural voiceovers and synchronized lip-sync audio for any video workflow in seconds.",
    },
    newscaster: {
      title: "AI Production News Bulletin",
      textType: "text",
      text: "Breaking update from the studio: multi-modal video pipelines now combine Amazon Polly neural speech synthesis with high-definition talking-avatar generation on demand.",
    },
    storytelling: {
      title: "Cinematic Sci-Fi Narration",
      textType: "ssml",
      text: '<speak>Across the neon horizon, the orbital relay flickered to life. <break time="600ms"/> Every signal carried a story waiting to be seen and heard.</speak>',
    },
    ssml_showcase: {
      title: "SSML Prosody & Bookmark Showcase",
      textType: "ssml",
      text: '<speak>Ready for <mark name="intro_mark"/>precision lip-sync? <break time="350ms"/> <prosody rate="95%">You can fine-tune pacing, pronunciation, and pauses</prosody> right from the dashboard.</speak>',
    },
  };

  const SAMPLE_PLS_LEXICON = `<?xml version="1.0" encoding="UTF-8"?>
<lexicon version="1.0"
      xmlns="http://www.w3.org/2005/01/pronunciation-lexicon"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.w3.org/2005/01/pronunciation-lexicon
        http://www.w3.org/TR/2007/CR-pronunciation-lexicon-20071212/pls.xsd"
      alphabet="ipa" xml:lang="en-US">
  <lexeme>
    <grapheme>VideoAlpha</grapheme>
    <alias>Video Alpha</alias>
  </lexeme>
  <lexeme>
    <grapheme>RunPod</grapheme>
    <alias>Run Pod</alias>
  </lexeme>
</lexicon>`;

  const state = {
    options: null,
    region: "us-east-1",
    engine: "generative",
    voices: [],
    allLanguages: [],
    engineCounts: {},
    selectedVoice: null,
    languageFilter: "",
    genderFilter: "",
    searchQuery: "",
    includeAdditionalLangs: true,
    bilingualOverride: "",
    textType: "text",
    outputFormat: "wav",
    sampleRate: "16000",
    includeSpeechMarks: true,
    selectedLexicons: new Set(),
    installedLexicons: [],
    activeRecord: null,
    activeWordMarks: [],
    activeVisemeMarks: [],
    history: [],
  };

  const el = (id) => document.getElementById(id);

  async function apiFetch(path, options = {}) {
    const resp = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.detail || data.message || `Request failed (${resp.status})`);
    }
    return data;
  }

  function getSelectedEngineMeta() {
    if (!state.options) return null;
    return (
      state.options.engines.find((e) => e.id === state.engine) ||
      state.options.engines[0]
    );
  }

  function getSelectedFormatMeta() {
    if (!state.options) return null;
    return (
      state.options.output_formats.find((f) => f.id === state.outputFormat) ||
      state.options.output_formats[0]
    );
  }

  function getProsodyFromForm() {
    return {
      rate: el("prosody-rate-select").value,
      pitch: el("prosody-pitch-select").value,
      volume: el("prosody-volume-select").value,
      domain: el("prosody-domain-select").value,
      vocal_tract_length: el("prosody-timbre-select").value,
      effect_drc: el("effect-drc-checkbox").checked,
      effect_whispered: el("effect-whispered-checkbox").checked,
      effect_soft: el("effect-soft-checkbox").checked,
      auto_breaths: el("effect-breaths-checkbox").checked,
    };
  }

  function getSelectedSpeechMarkTypes() {
    return Array.from(document.querySelectorAll(".speech-mark-type-cb"))
      .filter((cb) => cb.checked)
      .map((cb) => cb.value);
  }

  function updateAwsStatusUI(statusData) {
    const badge = el("aws-status-badge");
    const warnBanner = el("aws-warning-banner");
    const aws = statusData.aws || {};
    if (aws.configured) {
      badge.className = "status-badge status-ready";
      badge.textContent = `AWS Ready · ${aws.source || "credentials"} (${aws.access_key_hint || "active"})`;
      warnBanner.hidden = true;
    } else {
      badge.className = "status-badge status-warn";
      badge.textContent = "AWS Credentials Not Detected · Browsing Fallback Catalog";
      warnBanner.hidden = false;
      warnBanner.innerHTML =
        "<strong>Server Credentials Notice:</strong> Add <code>AWS_ACCESS_KEY_ID</code>, <code>AWS_SECRET_ACCESS_KEY</code>, and <code>AWS_DEFAULT_REGION</code> to <code>backend/.env</code> (or attach an EC2 IAM Role with <code>AmazonPollyFullAccess</code>) to enable live audio synthesis.";
    }
  }

  function renderRegionsSelect() {
    const select = el("region-select");
    select.innerHTML = "";
    (state.options?.regions || []).forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.label;
      if (r.id === state.region) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function renderEnginePills() {
    const bar = el("engine-pills-bar");
    bar.innerHTML = "";
    const engines = state.options?.engines || [];
    engines.forEach((eng) => {
      const count = state.engineCounts[eng.id] ?? "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `engine-card-btn ${
        eng.id === state.engine ? "engine-card-btn-active" : ""
      }`;
      btn.innerHTML = `
        <div class="engine-card-top">
          <span class="engine-card-title">${eng.label}</span>
          <span class="count-chip">${count !== "" ? `${count} voices` : eng.id}</span>
        </div>
        <div class="engine-card-sub">${eng.badge}</div>
      `;
      btn.addEventListener("click", () => {
        state.engine = eng.id;
        renderEnginePills();
        updateEngineMetaAndControls();
        loadVoices();
      });
      bar.appendChild(btn);
    });
  }

  function updateEngineMetaAndControls() {
    const eng = getSelectedEngineMeta();
    if (!eng) return;

    el("engine-price-badge").textContent = `$${eng.price_per_1m_chars.toFixed(2)} / 1M chars`;
    el("engine-badge-name").textContent = `${eng.label} Engine`;
    el("engine-badge-rates").textContent = `Default ${Number(eng.default_sample_rate).toLocaleString()} Hz`;
    el("engine-badge-marks").textContent = `Speech Marks: ${eng.speech_mark_types.join(", ")}`;
    el("engine-description").textContent = eng.description;
    el("async-selected-engine").textContent = eng.label;

    renderSampleRateOptions();
    renderSsmlToolbar();
    updateProsodyCompatibilityState();
    updateCharAndCostMeter();
    updatePayloadPreview();
  }

  function renderOutputFormats() {
    const select = el("output-format-select");
    select.innerHTML = "";
    (state.options?.output_formats || []).forEach((fmt) => {
      const opt = document.createElement("option");
      opt.value = fmt.id;
      opt.textContent = fmt.label;
      if (fmt.id === state.outputFormat) opt.selected = true;
      select.appendChild(opt);
    });
    renderSampleRateOptions();
  }

  function renderSampleRateOptions() {
    const select = el("sample-rate-select");
    const eng = getSelectedEngineMeta();
    const fmt = getSelectedFormatMeta();
    if (!eng || !fmt) return;

    const allowed = eng.sample_rates[fmt.id] || [];
    select.innerHTML = "";
    if (allowed.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Not applicable (JSON Speech Marks)";
      select.appendChild(opt);
      select.disabled = true;
      state.sampleRate = "";
      return;
    }

    select.disabled = false;
    if (!allowed.includes(state.sampleRate)) {
      state.sampleRate = allowed.includes(fmt.default_sample_rate)
        ? fmt.default_sample_rate
        : allowed[allowed.length - 1];
    }

    allowed.forEach((rate) => {
      const opt = document.createElement("option");
      opt.value = rate;
      opt.textContent = `${Number(rate).toLocaleString()} Hz`;
      if (rate === state.sampleRate) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function renderSsmlToolbar() {
    const bar = el("ssml-toolbar");
    bar.innerHTML = "";
    (state.options?.ssml_snippets || []).forEach((item) => {
      const compatible = item.engines.includes(state.engine);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ssml-chip-btn ${compatible ? "" : "ssml-chip-incompatible"}`;
      btn.textContent = item.label;
      btn.title = compatible
        ? `Insert ${item.snippet}`
        : `Supported on: ${item.engines.join(", ")}`;
      btn.addEventListener("click", () => insertSsmlSnippet(item));
      bar.appendChild(btn);
    });
  }

  function insertSsmlSnippet(item) {
    const textarea = el("synthesis-textarea");
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const current = textarea.value;
    const selected = current.slice(start, end) || "emphasized phrase";

    let replacement = item.snippet;
    if (item.wrap) {
      replacement = item.snippet.replace("{text}", selected);
    }

    const updated = current.slice(0, start) + replacement + current.slice(end);
    textarea.value = updated;
    if (state.textType !== "ssml") {
      setTextType("ssml");
    }
    if (!textarea.value.trim().startsWith("<speak")) {
      textarea.value = `<speak>${textarea.value.trim()}</speak>`;
    }
    updateCharAndCostMeter();
    updatePayloadPreview();
  }

  function setTextType(type) {
    state.textType = type;
    document.querySelectorAll("#text-type-group .seg-btn").forEach((btn) => {
      btn.classList.toggle("seg-btn-active", btn.dataset.textType === type);
    });
    const textarea = el("synthesis-textarea");
    const val = textarea.value.trim();
    if (type === "ssml" && val && !val.startsWith("<speak")) {
      textarea.value = `<speak>${val}</speak>`;
    } else if (type === "text" && val.startsWith("<speak>") && val.endsWith("</speak>")) {
      textarea.value = val.slice(7, -8).trim();
    }
    updateCharAndCostMeter();
    updatePayloadPreview();
  }

  function updateProsodyCompatibilityState() {
    const isStd = state.engine === "standard";
    const isNeural = state.engine === "neural";
    el("prosody-pitch-select").disabled = !(isStd || isNeural);
    el("prosody-domain-select").disabled = !isNeural;
    el("prosody-timbre-select").disabled = !isStd;
    el("effect-drc-checkbox").disabled = !(isStd || isNeural);
    el("effect-whispered-checkbox").disabled = !isStd;
    el("effect-soft-checkbox").disabled = !isStd;
    el("effect-breaths-checkbox").disabled = !isStd;
  }

  function updateCharAndCostMeter() {
    const raw = el("synthesis-textarea").value || "";
    const stripped = raw.replace(/<[^>]+>/g, "");
    const billed = state.textType === "ssml" ? stripped.length : raw.length;
    const total = raw.length;
    const words = Math.max(0, stripped.trim().split(/\s+/).filter(Boolean).length);
    const estSeconds = words > 0 ? (words / 2.6).toFixed(1) : "0.0";
    const eng = getSelectedEngineMeta();
    const ratePerMillion = eng ? eng.price_per_1m_chars : 16.0;
    const cost = (billed / 1_000_000) * ratePerMillion;

    el("billed-chars-count").textContent = billed.toLocaleString();
    el("total-chars-count").textContent = total.toLocaleString();
    el("est-duration-label").textContent = `~${estSeconds}s`;
    el("est-cost-label").textContent = `$${cost.toFixed(5)}`;

    const pct = Math.min(100, Math.round((billed / 3000) * 100));
    const fill = el("char-progress-fill");
    fill.style.width = `${pct}%`;
    fill.style.background =
      billed > 3000
        ? "linear-gradient(90deg, #ef4444, #f59e0b)"
        : "linear-gradient(90deg, #8b5cf6, #06b6d4)";
  }

  function buildSynthesizeRequestPayload() {
    const voiceId = state.selectedVoice ? state.selectedVoice.Id : "Ruth";
    return {
      title: el("synthesis-title-input").value.trim(),
      text: el("synthesis-textarea").value,
      text_type: state.textType,
      voice_id: voiceId,
      engine: state.engine,
      region: state.region,
      output_format: state.outputFormat,
      sample_rate: state.sampleRate,
      language_code: state.bilingualOverride,
      lexicon_names: Array.from(state.selectedLexicons),
      speech_mark_types: getSelectedSpeechMarkTypes(),
      include_speech_marks: el("include-speech-marks-checkbox").checked,
      prosody: getProsodyFromForm(),
    };
  }

  function updatePayloadPreview() {
    const payload = buildSynthesizeRequestPayload();
    el("payload-preview-code").textContent = JSON.stringify(payload, null, 2);
  }

  async function loadVoices(refresh = false) {
    const params = new URLSearchParams({
      region: state.region,
      engine: state.engine,
      language_code: state.languageFilter,
      gender: state.genderFilter,
      search: state.searchQuery,
      include_additional: String(state.includeAdditionalLangs),
      refresh: String(refresh),
    });

    const data = await apiFetch(`api/voices?${params.toString()}`);
    state.voices = data.voices || [];
    state.allLanguages = data.languages || [];
    state.engineCounts = data.engine_counts || {};

    const srcBadge = el("voice-source-badge");
    srcBadge.hidden = false;
    if (data.source === "aws-live") {
      srcBadge.className = "status-badge status-info";
      srcBadge.textContent = `Live AWS Catalog (${data.total_count} total)`;
    } else {
      srcBadge.className = "status-badge status-idle";
      srcBadge.textContent = `Built-in Catalog (${data.total_count} voices)`;
    }

    el("voices-count-chip").textContent = `${state.voices.length} voices`;
    renderEnginePills();
    renderLanguageFilterOptions();

    if (
      !state.selectedVoice ||
      !state.voices.some((v) => v.Id === state.selectedVoice.Id)
    ) {
      const preferred =
        state.voices.find((v) => v.Id === "Ruth") ||
        state.voices.find((v) => v.Id === "Matthew") ||
        state.voices.find((v) => v.Id === "Joanna") ||
        state.voices[0] ||
        null;
      state.selectedVoice = preferred;
    }

    updateSelectedVoiceUI();
    renderVoicesGrid();
    updatePayloadPreview();
  }

  function renderLanguageFilterOptions() {
    const select = el("language-filter-select");
    const current = state.languageFilter;
    select.innerHTML = '<option value="">All Languages & Locales</option>';
    state.allLanguages.forEach((lang) => {
      const opt = document.createElement("option");
      opt.value = lang.code;
      opt.textContent = `${lang.name} (${lang.code}) · ${lang.count}`;
      if (lang.code === current) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function updateSelectedVoiceUI() {
    const v = state.selectedVoice;
    const overrideSelect = el("bilingual-override-select");
    overrideSelect.innerHTML = '<option value="">Default Voice Locale</option>';

    if (!v) {
      el("selected-voice-label").textContent = "None";
      return;
    }
    el("selected-voice-label").textContent = `${v.Name} (${v.LanguageCode} · ${v.Gender})`;
    el("async-selected-voice").textContent = `${v.Name} (${v.LanguageCode})`;

    const codes = [v.LanguageCode, ...(v.AdditionalLanguageCodes || [])].filter(Boolean);
    codes.forEach((code) => {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code === v.LanguageCode ? `${code} (Native)` : `${code} (Additional)`;
      if (code === state.bilingualOverride) opt.selected = true;
      overrideSelect.appendChild(opt);
    });
  }

  function renderVoicesGrid() {
    const grid = el("voices-grid");
    grid.innerHTML = "";
    if (state.voices.length === 0) {
      grid.innerHTML =
        '<div class="empty-state-box" style="grid-column: 1 / -1;">No voices match the current engine/locale filters. Try switching engine or clearing the search box.</div>';
      return;
    }

    state.voices.forEach((v) => {
      const isSelected = state.selectedVoice && state.selectedVoice.Id === v.Id;
      const card = document.createElement("div");
      card.className = `voice-card ${isSelected ? "voice-card-selected" : ""}`;
      const addLangs = (v.AdditionalLanguageCodes || []).length
        ? ` + ${v.AdditionalLanguageCodes.join(", ")}`
        : "";
      const engineChips = (v.SupportedEngines || [])
        .map(
          (e) =>
            `<span class="eng-mini-chip eng-${e}">${
              e === "generative" ? "Gen" : e === "long-form" ? "Long" : e === "neural" ? "Neural" : "Std"
            }</span>`
        )
        .join("");

      card.innerHTML = `
        <div class="voice-card-header">
          <span class="voice-name">${v.Name}</span>
          <span class="voice-gender-tag">${v.Gender}</span>
        </div>
        <div class="voice-lang">${v.LanguageName || v.LanguageCode} · <code>${v.LanguageCode}${addLangs}</code></div>
        <div class="voice-card-footer">
          <div class="voice-engines-row">${engineChips}</div>
          <button type="button" class="voice-preview-btn" data-preview-voice="${v.Id}">▶ Sample</button>
        </div>
      `;

      card.addEventListener("click", (evt) => {
        if (evt.target.closest("[data-preview-voice]")) return;
        state.selectedVoice = v;
        state.bilingualOverride = "";
        updateSelectedVoiceUI();
        renderVoicesGrid();
        updatePayloadPreview();
      });

      const previewBtn = card.querySelector("[data-preview-voice]");
      previewBtn.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        await previewVoiceSample(v, previewBtn);
      });

      grid.appendChild(card);
    });
  }

  async function previewVoiceSample(voice, btn) {
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "⏳...";
    try {
      const engineToUse = (voice.SupportedEngines || []).includes(state.engine)
        ? state.engine
        : (voice.SupportedEngines || ["neural"])[0];
      const data = await apiFetch("api/preview", {
        method: "POST",
        body: JSON.stringify({
          voice_id: voice.Id,
          engine: engineToUse,
          region: state.region,
          language_code: voice.LanguageCode || "en-US",
        }),
      });
      loadAudioIntoPlayer({
        title: `${voice.Name} · Voice Preview (${engineToUse})`,
        url: data.url,
        download_url: data.url,
        server_path: "(Voice Preview Stream)",
        voice_id: voice.Id,
        engine: engineToUse,
        output_format: "mp3",
        sample_rate: "24000",
        size_display: data.cached ? "Cached" : "Stream",
        speech_marks: [],
      });
    } catch (err) {
      showSynthesisError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }

  function showSynthesisError(msg) {
    const box = el("synthesis-error-box");
    if (!msg) {
      box.hidden = true;
      box.textContent = "";
      return;
    }
    box.hidden = false;
    box.textContent = msg;
  }

  async function handleSynthesize() {
    showSynthesisError("");
    const btn = el("synthesize-btn");
    const origLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "⏳ Synthesizing with Amazon Polly...";

    try {
      const payload = buildSynthesizeRequestPayload();
      const record = await apiFetch("api/synthesize", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      loadAudioIntoPlayer(record);
      await loadHistory();
    } catch (err) {
      showSynthesisError(err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origLabel;
    }
  }

  function loadAudioIntoPlayer(record) {
    state.activeRecord = record;
    el("player-empty-state").hidden = true;
    el("player-active-content").hidden = false;

    el("player-title").textContent = record.title || `${record.voice_id} (${record.engine})`;
    el("player-meta-badge").className = "status-badge status-ready";
    el("player-meta-badge").textContent = `${record.voice_id} · ${record.engine.toUpperCase()} · ${record.output_format.toUpperCase()} · ${record.size_display || ""}`;

    const audio = el("studio-audio-player");
    if (record.output_format === "json" || record.output_format === "pcm") {
      audio.hidden = true;
    } else {
      audio.hidden = false;
      audio.src = record.url;
      audio.play().catch(() => {});
    }

    const dlBtn = el("player-download-btn");
    dlBtn.href = record.download_url || record.url;
    dlBtn.download = record.filename || "polly_voice.mp3";

    el("bridge-server-path").textContent = record.server_path || record.url;

    renderSpeechMarksInspector(record.speech_marks || []);
  }

  function renderSpeechMarksInspector(marks) {
    const wrap = el("viseme-inspector-wrap");
    if (!marks || marks.length === 0) {
      wrap.hidden = true;
      state.activeWordMarks = [];
      state.activeVisemeMarks = [];
      return;
    }

    wrap.hidden = false;
    state.activeWordMarks = marks.filter((m) => m.type === "word");
    state.activeVisemeMarks = marks.filter((m) => m.type === "viseme");
    el("marks-count-label").textContent = String(marks.length);

    const transcriptEl = el("synchronized-transcript");
    transcriptEl.innerHTML = "";
    state.activeWordMarks.forEach((wm, idx) => {
      const span = document.createElement("span");
      span.className = "transcript-word";
      span.dataset.wordIndex = String(idx);
      span.textContent = wm.value + " ";
      span.title = `${wm.time} ms`;
      span.addEventListener("click", () => {
        const audio = el("studio-audio-player");
        if (!audio.hidden) {
          audio.currentTime = wm.time / 1000;
          audio.play().catch(() => {});
        }
      });
      transcriptEl.appendChild(span);
    });

    const tbody = el("marks-table-body");
    tbody.innerHTML = "";
    marks.slice(0, 250).forEach((m) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${m.time ?? "-"}</td>
        <td><code>${m.type || "-"}</code></td>
        <td><strong>${m.value || "-"}</strong></td>
        <td>${m.start ?? "-"}–${m.end ?? "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function bindAudioTimeSync() {
    const audio = el("studio-audio-player");
    audio.addEventListener("timeupdate", () => {
      const ms = audio.currentTime * 1000;
      let currentWordIdx = -1;
      for (let i = 0; i < state.activeWordMarks.length; i++) {
        if (state.activeWordMarks[i].time <= ms) {
          currentWordIdx = i;
        } else {
          break;
        }
      }
      document.querySelectorAll(".transcript-word").forEach((node, idx) => {
        node.classList.toggle("transcript-word-active", idx === currentWordIdx);
      });
      if (currentWordIdx >= 0 && state.activeWordMarks[currentWordIdx]) {
        el("active-word-text").textContent = state.activeWordMarks[currentWordIdx].value;
      }

      let currentViseme = "-";
      for (let i = 0; i < state.activeVisemeMarks.length; i++) {
        if (state.activeVisemeMarks[i].time <= ms) {
          currentViseme = state.activeVisemeMarks[i].value;
        } else {
          break;
        }
      }
      el("active-viseme-code").textContent = currentViseme;
    });
  }

  async function loadHistory() {
    const data = await apiFetch("api/history");
    state.history = data.items || [];
    el("history-count-chip").textContent = String(state.history.length);
    const list = el("history-list");
    list.innerHTML = "";

    if (state.history.length === 0) {
      list.innerHTML =
        '<div class="empty-state-box">No synthesized voices saved yet. Your generated clips will appear here with instant playback and server paths.</div>';
      return;
    }

    state.history.forEach((item) => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `
        <div class="history-item-main">
          <div class="history-item-title">${item.title || item.filename}</div>
          <div class="history-item-meta">
            <span>Voice: <strong>${item.voice_id}</strong></span>
            <span>Engine: <strong>${item.engine}</strong></span>
            <span>Format: <strong>${(item.output_format || "").toUpperCase()} (${item.sample_rate || "-"} Hz)</strong></span>
            <span>Chars: <strong>${item.billed_characters || 0}</strong></span>
            <span>Size: <strong>${item.size_display || "-"}</strong></span>
            <span>Marks: <strong>${item.speech_marks_count || 0}</strong></span>
          </div>
        </div>
        <div class="history-item-actions">
          <button type="button" class="studio-btn studio-btn-secondary" data-play-id="${item.id}">▶ Load</button>
          <a class="studio-btn studio-btn-secondary" href="${item.download_url}" download="${item.filename}">⬇ Download</a>
          <button type="button" class="studio-btn studio-btn-ghost" data-delete-id="${item.id}">✕</button>
        </div>
      `;

      row.querySelector(`[data-play-id="${item.id}"]`).addEventListener("click", () => {
        loadAudioIntoPlayer(item);
      });
      row.querySelector(`[data-delete-id="${item.id}"]`).addEventListener("click", async () => {
        await apiFetch(`api/history/${item.id}`, { method: "DELETE" });
        await loadHistory();
      });

      list.appendChild(row);
    });
  }

  async function loadLexicons() {
    const data = await apiFetch(`api/lexicons?region=${encodeURIComponent(state.region)}`);
    state.installedLexicons = data.lexicons || [];
    renderLexiconsList();
    renderActiveLexiconsPills();
  }

  function renderActiveLexiconsPills() {
    const wrap = el("active-lexicons-pills");
    wrap.innerHTML = "";
    if (state.installedLexicons.length === 0) {
      wrap.innerHTML =
        '<span class="muted-note">No custom lexicons in this region (open Pronunciation Lexicons tab to add one)</span>';
      return;
    }

    state.installedLexicons.forEach((lex) => {
      const active = state.selectedLexicons.has(lex.name);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `ssml-chip-btn ${active ? "seg-btn-active" : ""}`;
      btn.textContent = `${active ? "✓ " : ""}${lex.name} (${lex.language_code || "PLS"})`;
      btn.addEventListener("click", () => {
        if (state.selectedLexicons.has(lex.name)) {
          state.selectedLexicons.delete(lex.name);
        } else if (state.selectedLexicons.size < 5) {
          state.selectedLexicons.add(lex.name);
        }
        renderActiveLexiconsPills();
        updatePayloadPreview();
      });
      wrap.appendChild(btn);
    });
  }

  function renderLexiconsList() {
    const container = el("lexicons-list-container");
    container.innerHTML = "";
    if (state.installedLexicons.length === 0) {
      container.innerHTML =
        '<div class="empty-state-box">No pronunciation lexicons stored in this AWS region yet.</div>';
      return;
    }

    state.installedLexicons.forEach((lex) => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `
        <div class="history-item-main">
          <div class="history-item-title">${lex.name}</div>
          <div class="history-item-meta">
            <span>Lang: <strong>${lex.language_code || "-"}</strong></span>
            <span>Alphabet: <strong>${lex.alphabet || "-"}</strong></span>
            <span>Lexemes: <strong>${lex.lexemes_count ?? 0}</strong></span>
          </div>
        </div>
        <div class="history-item-actions">
          <button type="button" class="studio-btn studio-btn-secondary" data-inspect-lex="${lex.name}">Inspect XML</button>
          <button type="button" class="studio-btn studio-btn-ghost" data-del-lex="${lex.name}">Delete</button>
        </div>
      `;

      row.querySelector(`[data-inspect-lex="${lex.name}"]`).addEventListener("click", async () => {
        const detail = await apiFetch(
          `api/lexicons/${encodeURIComponent(lex.name)}?region=${encodeURIComponent(state.region)}`
        );
        el("lexicon-name-input").value = detail.name || lex.name;
        el("lexicon-content-textarea").value = detail.content || "";
      });

      row.querySelector(`[data-del-lex="${lex.name}"]`).addEventListener("click", async () => {
        await apiFetch(
          `api/lexicons/${encodeURIComponent(lex.name)}?region=${encodeURIComponent(state.region)}`,
          { method: "DELETE" }
        );
        state.selectedLexicons.delete(lex.name);
        await loadLexicons();
      });

      container.appendChild(row);
    });
  }

  async function loadAsyncTasks() {
    const container = el("async-tasks-container");
    const data = await apiFetch(`api/tasks?region=${encodeURIComponent(state.region)}`);
    const tasks = data.tasks || [];
    if (tasks.length === 0) {
      container.innerHTML =
        '<div class="empty-state-box">No S3 synthesis tasks found in this region.</div>';
      return;
    }

    container.innerHTML = "";
    tasks.forEach((t) => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.innerHTML = `
        <div class="history-item-main">
          <div class="history-item-title">Task ${t.task_id} · ${t.voice_id} (${t.engine})</div>
          <div class="history-item-meta">
            <span>Status: <strong>${t.task_status}</strong></span>
            <span>Format: <strong>${t.output_format}</strong></span>
            <span>Chars: <strong>${t.request_characters ?? "-"}</strong></span>
            <span>S3 URI: <code>${t.output_uri || "-"}</code></span>
          </div>
        </div>
      `;
      container.appendChild(row);
    });
  }

  function bindEvents() {
    el("region-select").addEventListener("change", async (e) => {
      state.region = e.target.value;
      const status = await apiFetch(`api/status?region=${encodeURIComponent(state.region)}`);
      updateAwsStatusUI(status);
      await loadVoices();
      await loadLexicons();
    });

    el("refresh-voices-btn").addEventListener("click", () => loadVoices(true));

    el("voice-search-input").addEventListener("input", (e) => {
      state.searchQuery = e.target.value;
      loadVoices();
    });

    el("language-filter-select").addEventListener("change", (e) => {
      state.languageFilter = e.target.value;
      loadVoices();
    });

    document.querySelectorAll("#gender-filter-group .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.genderFilter = btn.dataset.gender || "";
        document.querySelectorAll("#gender-filter-group .seg-btn").forEach((b) => {
          b.classList.toggle("seg-btn-active", b === btn);
        });
        loadVoices();
      });
    });

    el("include-additional-langs-checkbox").addEventListener("change", (e) => {
      state.includeAdditionalLangs = e.target.checked;
      loadVoices();
    });

    el("bilingual-override-select").addEventListener("change", (e) => {
      state.bilingualOverride = e.target.value;
      updatePayloadPreview();
    });

    // Workspace tabs
    document.querySelectorAll(".workspace-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;
        document.querySelectorAll(".workspace-tab").forEach((t) => {
          t.classList.toggle("workspace-tab-active", t === tab);
        });
        el("tab-panel-realtime").hidden = target !== "realtime";
        el("tab-panel-async").hidden = target !== "async";
        el("tab-panel-lexicons").hidden = target !== "lexicons";
        if (target === "async") loadAsyncTasks();
        if (target === "lexicons") loadLexicons();
      });
    });

    el("manage-lexicons-link").addEventListener("click", () => {
      document.querySelector('.workspace-tab[data-tab="lexicons"]').click();
    });

    document.querySelectorAll("#text-type-group .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => setTextType(btn.dataset.textType));
    });

    el("sample-preset-select").addEventListener("change", (e) => {
      const preset = SAMPLE_SCRIPTS[e.target.value];
      if (!preset) return;
      el("synthesis-title-input").value = preset.title;
      el("synthesis-textarea").value = preset.text;
      setTextType(preset.textType);
    });

    el("synthesis-textarea").addEventListener("input", () => {
      updateCharAndCostMeter();
      updatePayloadPreview();
    });

    el("synthesis-title-input").addEventListener("input", updatePayloadPreview);

    [
      "prosody-rate-select",
      "prosody-pitch-select",
      "prosody-volume-select",
      "prosody-domain-select",
      "prosody-timbre-select",
      "effect-drc-checkbox",
      "effect-whispered-checkbox",
      "effect-soft-checkbox",
      "effect-breaths-checkbox",
      "include-speech-marks-checkbox",
    ].forEach((id) => {
      el(id).addEventListener("change", updatePayloadPreview);
    });

    document.querySelectorAll(".speech-mark-type-cb").forEach((cb) => {
      cb.addEventListener("change", updatePayloadPreview);
    });

    el("reset-prosody-btn").addEventListener("click", () => {
      el("prosody-rate-select").value = "100%";
      el("prosody-pitch-select").value = "0%";
      el("prosody-volume-select").value = "default";
      el("prosody-domain-select").value = "none";
      el("prosody-timbre-select").value = "default";
      el("effect-drc-checkbox").checked = false;
      el("effect-whispered-checkbox").checked = false;
      el("effect-soft-checkbox").checked = false;
      el("effect-breaths-checkbox").checked = false;
      updatePayloadPreview();
    });

    el("output-format-select").addEventListener("change", (e) => {
      state.outputFormat = e.target.value;
      renderSampleRateOptions();
      updatePayloadPreview();
    });

    el("sample-rate-select").addEventListener("change", (e) => {
      state.sampleRate = e.target.value;
      updatePayloadPreview();
    });

    el("synthesize-btn").addEventListener("click", handleSynthesize);

    el("copy-server-path-btn").addEventListener("click", () => {
      if (!state.activeRecord) return;
      navigator.clipboard.writeText(state.activeRecord.server_path || "");
      const btn = el("copy-server-path-btn");
      btn.textContent = "✓ Copied Path!";
      setTimeout(() => (btn.textContent = "📋 Copy Server Path"), 1600);
    });

    el("copy-audio-url-btn").addEventListener("click", () => {
      if (!state.activeRecord) return;
      const fullUrl = new URL(state.activeRecord.url, window.location.href).href;
      navigator.clipboard.writeText(fullUrl);
      const btn = el("copy-audio-url-btn");
      btn.textContent = "✓ Copied URL!";
      setTimeout(() => (btn.textContent = "🔗 Copy Audio URL"), 1600);
    });

    // Async S3 tasks
    el("start-async-task-btn").addEventListener("click", async () => {
      const errBox = el("async-task-error");
      errBox.hidden = true;
      try {
        const voiceId = state.selectedVoice ? state.selectedVoice.Id : "Ruth";
        await apiFetch("api/tasks", {
          method: "POST",
          body: JSON.stringify({
            text: el("synthesis-textarea").value,
            text_type: state.textType,
            voice_id: voiceId,
            engine: state.engine,
            region: state.region,
            output_format: el("async-format-select").value,
            sample_rate: state.sampleRate || "24000",
            language_code: state.bilingualOverride,
            lexicon_names: Array.from(state.selectedLexicons),
            speech_mark_types: getSelectedSpeechMarkTypes(),
            output_s3_bucket_name: el("async-s3-bucket-input").value.trim(),
            output_s3_key_prefix: el("async-s3-prefix-input").value.trim(),
            sns_topic_arn: el("async-sns-arn-input").value.trim(),
          }),
        });
        await loadAsyncTasks();
      } catch (err) {
        errBox.hidden = false;
        errBox.textContent = err.message;
      }
    });

    el("refresh-tasks-btn").addEventListener("click", loadAsyncTasks);

    // Lexicons
    el("load-sample-lexicon-btn").addEventListener("click", () => {
      el("lexicon-name-input").value = "VideoAlphaTerms";
      el("lexicon-content-textarea").value = SAMPLE_PLS_LEXICON;
    });

    el("save-lexicon-btn").addEventListener("click", async () => {
      const msgBox = el("lexicon-status-msg");
      msgBox.hidden = true;
      try {
        await apiFetch("api/lexicons", {
          method: "POST",
          body: JSON.stringify({
            name: el("lexicon-name-input").value.trim(),
            content: el("lexicon-content-textarea").value,
            region: state.region,
          }),
        });
        await loadLexicons();
      } catch (err) {
        msgBox.hidden = false;
        msgBox.textContent = err.message;
      }
    });

    el("refresh-lexicons-btn").addEventListener("click", loadLexicons);

    bindAudioTimeSync();
  }

  async function init() {
    el("lexicon-content-textarea").value = SAMPLE_PLS_LEXICON;
    const [options, status] = await Promise.all([
      apiFetch("api/options"),
      apiFetch("api/status"),
    ]);
    state.options = options;
    state.region = options.default_region || "us-east-1";
    el("async-s3-bucket-input").value = options.default_s3_bucket || "";
    el("async-s3-prefix-input").value = options.default_s3_prefix || "polly-outputs/";

    updateAwsStatusUI(status);
    renderRegionsSelect();
    renderOutputFormats();
    updateEngineMetaAndControls();
    bindEvents();

    await Promise.all([loadVoices(), loadHistory(), loadLexicons()]);
  }

  init().catch((err) => {
    console.error("Polly Studio initialization error:", err);
  });
})();
