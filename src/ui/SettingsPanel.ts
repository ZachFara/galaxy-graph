import { getAllTags, type App } from "obsidian";
import { DEFAULT_SETTINGS, type GalaxySettings } from "../settings";

export interface SettingsPanelPlugin {
  settings: GalaxySettings;
  saveSettings(): Promise<void>;
}

export interface SettingsPanelCallbacks {
  closeSettingsPanel(): void;
  refreshNodeColors(): void;
  refreshLinkColors(): void;
  rebuildFog(): void;
  rebuildLabels(): void;
  refreshSparklineIfSelected(): void;
  updateGridOpacities(): void;
  toggleStars(enabled: boolean): void;
  rebuildStars(): void;
  refreshForces(): void;
  recomputeActivityHeat(): void;
  flashSaved(): void;
  setSavedEl(el: HTMLElement | null): void;
}

export function buildSettingsPanel(
  panel: HTMLElement,
  plugin: SettingsPanelPlugin,
  app: App,
  cb: SettingsPanelCallbacks
) {
  panel.empty();
  const s = plugin.settings;
  const tagSet = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache) continue;
    for (const t of getAllTags(cache) ?? []) tagSet.add(t.replace(/^#/, ""));
  }
  const vaultTags = [...tagSet].sort((a, b) => a.localeCompare(b));

  const header = panel.createDiv();
  header.style.cssText =
    `display:flex;justify-content:space-between;align-items:center;` +
    `padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0;`;
  const headerTitle = header.createEl("span");
  headerTitle.style.cssText = `font-size:14px;font-weight:600;color:#dcddde;`;
  headerTitle.textContent = "Graph settings";
  const closeBtn = header.createEl("button", { text: "✕" });
  closeBtn.style.cssText =
    `background:none;border:none;color:#888;cursor:pointer;font-size:16px;padding:0;`;
  closeBtn.onclick = () => cb.closeSettingsPanel();

  const body = panel.createDiv();
  body.style.cssText = `flex:1;overflow-y:auto;padding:16px;`;

  const section = (title: string) => {
    const sectionEl = body.createDiv();
    sectionEl.style.cssText = `margin-bottom:20px;`;
    const h = sectionEl.createDiv();
    h.style.cssText =
      `font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;` +
      `color:#8ab4f8;margin:0 0 10px;opacity:0.9;`;
    h.textContent = title;
    return sectionEl;
  };

  const label = (parent: HTMLElement, labelText: string) => {
    const labelEl = parent.createEl("label");
    labelEl.style.cssText = `display:block;font-size:12px;color:#aaa;margin-bottom:4px;`;
    labelEl.textContent = labelText;
    return labelEl;
  };

  const inputStyle =
    `background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);` +
    `color:#dcddde;border-radius:4px;padding:5px 8px;font-size:12px;width:100%;box-sizing:border-box;`;

  const save = async () => {
    await plugin.saveSettings();
    cb.flashSaved();
  };

  const popSec = section("Popularity dimension");
  const popOpts: Array<[GalaxySettings["popularityDimension"], string]> = [
    ["ctime", "Created time (ctime)"],
    ["mtime", "Modified time (mtime)"],
    ["frontmatter", "Frontmatter field"],
  ];
  for (const [val, lbl] of popOpts) {
    const row = popSec.createDiv();
    row.style.cssText = `display:flex;align-items:center;gap:8px;margin-bottom:6px;`;
    const radio = row.createEl("input") as HTMLInputElement;
    radio.type = "radio";
    radio.name = "pop-dim";
    radio.value = val;
    radio.checked = s.popularityDimension === val;
    radio.style.cssText = `cursor:pointer;`;
    const rowLabel = row.createEl("span");
    rowLabel.textContent = lbl;
    rowLabel.style.cssText = `font-size:12px;color:#dcddde;cursor:pointer;`;
    rowLabel.onclick = () => { radio.click(); };
    radio.onchange = async () => {
      if (radio.checked) {
        s.popularityDimension = val;
        fmRow.style.display = val === "frontmatter" ? "block" : "none";
        cb.refreshSparklineIfSelected();
        await save();
      }
    };
  }
  const fmRow = popSec.createDiv();
  fmRow.style.cssText = `margin-top:6px;display:${s.popularityDimension === "frontmatter" ? "block" : "none"};`;
  label(fmRow, "Field name:");
  const fmInput = fmRow.createEl("input") as HTMLInputElement;
  fmInput.type = "text";
  fmInput.value = s.popularityFrontmatterKey;
  fmInput.style.cssText = inputStyle;
  fmInput.onchange = async () => {
    s.popularityFrontmatterKey = fmInput.value.trim() || "updated";
    cb.refreshSparklineIfSelected();
    await save();
  };

  const rotSec = section("Rotation speed");
  const rotRow = rotSec.createDiv();
  rotRow.style.cssText = `display:flex;align-items:center;gap:8px;`;
  const rotSlider = rotRow.createEl("input") as HTMLInputElement;
  rotSlider.type = "range";
  rotSlider.min = "0";
  rotSlider.max = "0.01";
  rotSlider.step = "0.0001";
  rotSlider.value = String(s.rotationSpeed);
  rotSlider.style.cssText = `flex:1;cursor:pointer;`;
  const rotVal = rotRow.createEl("span");
  rotVal.style.cssText = `font-size:11px;color:#8ab4f8;min-width:40px;text-align:right;`;
  rotVal.textContent = s.rotationSpeed.toFixed(4);
  rotSlider.oninput = async () => {
    s.rotationSpeed = parseFloat(rotSlider.value);
    rotVal.textContent = s.rotationSpeed.toFixed(4);
    await save();
  };

  const colSec = section("Color mapping");
  const colOpts: Array<[GalaxySettings["colorBy"], string]> = [
    ["folder", "By folder"],
    ["index", "By index vs normal"],
    ["tag", "By tag"],
    ["activity", "Activity heat"],
  ];
  for (const [val, lbl] of colOpts) {
    const row = colSec.createDiv();
    row.style.cssText = `display:flex;align-items:center;gap:8px;margin-bottom:6px;`;
    const radio = row.createEl("input") as HTMLInputElement;
    radio.type = "radio";
    radio.name = "color-by";
    radio.value = val;
    radio.checked = s.colorBy === val;
    radio.style.cssText = `cursor:pointer;`;
    const rowLabel = row.createEl("span");
    rowLabel.textContent = lbl;
    rowLabel.style.cssText = `font-size:12px;color:#dcddde;`;
    radio.onchange = async () => {
      if (radio.checked) {
        s.colorBy = val;
        indexThreshRow.style.display = val === "index" ? "block" : "none";
        tagMapRow.style.display = val === "tag" ? "block" : "none";
        activityRow.style.display = val === "activity" ? "block" : "none";
        if (val === "activity") cb.recomputeActivityHeat();
        else cb.refreshNodeColors();
        cb.rebuildLabels();
        await save();
      }
    };
  }
  const indexThreshRow = colSec.createDiv();
  indexThreshRow.style.cssText = `margin-top:6px;display:${s.colorBy === "index" ? "block" : "none"};`;
  label(indexThreshRow, "Min connections to be index:");
  const threshInput = indexThreshRow.createEl("input") as HTMLInputElement;
  threshInput.type = "number";
  threshInput.min = "1";
  threshInput.value = String(s.indexDegreeThreshold);
  threshInput.style.cssText = inputStyle;
  threshInput.onchange = async () => {
    s.indexDegreeThreshold = Math.max(1, parseInt(threshInput.value) || 10);
    cb.refreshNodeColors();
    if (s.fogEnabled) cb.rebuildFog();
    cb.rebuildLabels();
    await save();
  };

  const tagMapRow = colSec.createDiv();
  tagMapRow.style.cssText = `margin-top:6px;display:${s.colorBy === "tag" ? "block" : "none"};`;
  label(tagMapRow, "Tag → color:");
  const tagList = tagMapRow.createDiv();
  tagList.style.cssText = `margin-bottom:6px;`;

  const renderTagList = () => {
    tagList.empty();
    for (const [tag, color] of Object.entries(s.tagColorMap)) {
      const row = tagList.createDiv();
      row.style.cssText = `display:flex;align-items:center;gap:6px;margin-bottom:4px;`;
      const tagSpan = row.createEl("span");
      tagSpan.textContent = tag;
      tagSpan.style.cssText = `flex:1;font-size:11px;color:#dcddde;`;
      const colorPicker = row.createEl("input") as HTMLInputElement;
      colorPicker.type = "color";
      colorPicker.value = color;
      colorPicker.style.cssText = `width:32px;height:22px;border:none;cursor:pointer;border-radius:3px;`;
      colorPicker.onchange = async () => {
        s.tagColorMap[tag] = colorPicker.value;
        cb.refreshNodeColors();
        await save();
      };
      const removeBtn = row.createEl("button", { text: "×" });
      removeBtn.style.cssText = `background:none;border:none;color:#888;cursor:pointer;font-size:14px;`;
      removeBtn.onclick = async () => {
        delete s.tagColorMap[tag];
        renderTagList();
        cb.refreshNodeColors();
        await save();
      };
    }
  };
  renderTagList();

  const addTagRow = tagMapRow.createDiv();
  addTagRow.style.cssText = `display:flex;gap:6px;align-items:center;position:relative;`;
  const newTagInput = addTagRow.createEl("input") as HTMLInputElement;
  newTagInput.type = "text";
  newTagInput.placeholder = "tag name";
  newTagInput.style.cssText = inputStyle.replace("width:100%", "flex:1");

  const suggestionDropdown = addTagRow.createDiv();
  suggestionDropdown.style.cssText =
    `position:absolute;left:0;top:32px;display:none;max-height:220px;overflow-y:auto;` +
    `background:#0d1117;border:1px solid rgba(255,255,255,0.12);border-radius:6px;` +
    `box-shadow:0 8px 20px rgba(0,0,0,0.35);z-index:30;padding:4px;`;

  let selectedSuggestion = -1;
  let activeSuggestions: string[] = [];

  const highlightSuggestion = () => {
    const items = Array.from(suggestionDropdown.children) as HTMLElement[];
    items.forEach((item, index) => {
      item.style.background = index === selectedSuggestion ? "rgba(138,180,248,0.18)" : "transparent";
    });
  };

  const hideSuggestions = () => {
    suggestionDropdown.style.display = "none";
    suggestionDropdown.empty();
    activeSuggestions = [];
    selectedSuggestion = -1;
  };

  const chooseSuggestion = (tag: string) => {
    newTagInput.value = tag;
    hideSuggestions();
  };

  const renderSuggestions = () => {
    const query = newTagInput.value.trim().toLowerCase();
    if (!query) {
      hideSuggestions();
      return;
    }

    activeSuggestions = vaultTags
      .filter((tag) => tag.toLowerCase().includes(query))
      .slice(0, 8);

    if (activeSuggestions.length === 0) {
      hideSuggestions();
      return;
    }

    suggestionDropdown.empty();
    suggestionDropdown.style.display = "block";
    suggestionDropdown.style.width = `${newTagInput.offsetWidth}px`;
    selectedSuggestion = 0;

    for (const tag of activeSuggestions) {
      const item = suggestionDropdown.createDiv();
      item.textContent = tag;
      item.style.cssText =
        `padding:6px 8px;border-radius:4px;color:#dcddde;font-size:12px;cursor:pointer;`;
      item.onmouseenter = () => {
        selectedSuggestion = activeSuggestions.indexOf(tag);
        highlightSuggestion();
      };
      item.onmousedown = (evt) => {
        evt.preventDefault();
        chooseSuggestion(tag);
      };
    }

    highlightSuggestion();
  };

  newTagInput.oninput = () => renderSuggestions();
  newTagInput.onkeydown = (evt) => {
    if (suggestionDropdown.style.display === "none") return;
    if (evt.key === "ArrowDown") {
      evt.preventDefault();
      selectedSuggestion = (selectedSuggestion + 1) % activeSuggestions.length;
      highlightSuggestion();
    } else if (evt.key === "ArrowUp") {
      evt.preventDefault();
      selectedSuggestion = (selectedSuggestion - 1 + activeSuggestions.length) % activeSuggestions.length;
      highlightSuggestion();
    } else if (evt.key === "Enter") {
      if (selectedSuggestion >= 0 && activeSuggestions[selectedSuggestion]) {
        evt.preventDefault();
        chooseSuggestion(activeSuggestions[selectedSuggestion]);
      }
    } else if (evt.key === "Escape") {
      evt.preventDefault();
      hideSuggestions();
    }
  };
  newTagInput.onblur = () => window.setTimeout(hideSuggestions, 100);

  const newTagColor = addTagRow.createEl("input") as HTMLInputElement;
  newTagColor.type = "color";
  newTagColor.value = "#4fc3f7";
  newTagColor.style.cssText = `width:32px;height:26px;border:none;cursor:pointer;border-radius:3px;`;
  const addTagBtn = addTagRow.createEl("button", { text: "Add" });
  addTagBtn.style.cssText =
    `background:rgba(79,195,247,0.15);border:1px solid rgba(79,195,247,0.3);` +
    `color:#4fc3f7;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px;`;
  addTagBtn.onclick = async () => {
    const tag = newTagInput.value.trim();
    if (!tag) return;
    s.tagColorMap[tag] = newTagColor.value;
    newTagInput.value = "";
    hideSuggestions();
    renderTagList();
    cb.refreshNodeColors();
    await save();
  };

  const activityRow = colSec.createDiv();
  activityRow.style.cssText = `margin-top:6px;display:${s.colorBy === "activity" ? "block" : "none"};`;
  label(activityRow, "Activity window (days):");
  const activityWindowRow = activityRow.createDiv();
  activityWindowRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-bottom:4px;`;
  const activitySlider = activityWindowRow.createEl("input") as HTMLInputElement;
  activitySlider.type = "range";
  activitySlider.min = "7";
  activitySlider.max = "365";
  activitySlider.step = "1";
  activitySlider.value = String(s.activityWindowDays);
  activitySlider.style.cssText = `flex:1;cursor:pointer;`;
  const activityVal = activityWindowRow.createEl("span");
  activityVal.style.cssText = `font-size:11px;color:#8ab4f8;min-width:32px;text-align:right;`;
  activityVal.textContent = `${s.activityWindowDays}d`;
  activitySlider.oninput = async () => {
    s.activityWindowDays = parseInt(activitySlider.value);
    activityVal.textContent = `${s.activityWindowDays}d`;
    cb.recomputeActivityHeat();
    await save();
  };
  const activityDesc = activityRow.createEl("div");
  activityDesc.style.cssText = `font-size:11px;color:#888;margin-top:2px;`;
  activityDesc.textContent = "Index heat = notes added to cluster within this window";

  label(activityRow, "Leaf note heat based on:");
  const leafFieldRow = activityRow.createDiv();
  leafFieldRow.style.cssText = `display:flex;gap:12px;margin-top:4px;`;
  for (const [val, lbl] of [["mtime", "Last modified"], ["ctime", "Created"]] as const) {
    const optRow = leafFieldRow.createDiv();
    optRow.style.cssText = `display:flex;align-items:center;gap:6px;`;
    const radio = optRow.createEl("input") as HTMLInputElement;
    radio.type = "radio";
    radio.name = "leaf-date-field";
    radio.value = val;
    radio.checked = s.activityLeafDateField === val;
    radio.style.cssText = `cursor:pointer;`;
    const optLabel = optRow.createEl("span");
    optLabel.textContent = lbl;
    optLabel.style.cssText = `font-size:12px;color:#dcddde;cursor:pointer;`;
    optLabel.onclick = () => radio.click();
    radio.onchange = async () => {
      if (radio.checked) {
        s.activityLeafDateField = val;
        cb.recomputeActivityHeat();
        await save();
      }
    };
  }

  const linkSec = section("Link opacity");
  const opacSlider = (parent: HTMLElement, lbl: string, key: keyof GalaxySettings, min = 0, max = 1, step = 0.01) => {
    const row = parent.createDiv();
    row.style.cssText = `margin-bottom:10px;`;
    const labelRow = row.createDiv();
    labelRow.style.cssText = `display:flex;justify-content:space-between;margin-bottom:4px;`;
    const labelSpan = labelRow.createEl("span");
    labelSpan.textContent = lbl;
    labelSpan.style.cssText = `font-size:12px;color:#aaa;`;
    const valSpan = labelRow.createEl("span");
    valSpan.style.cssText = `font-size:11px;color:#8ab4f8;`;
    valSpan.textContent = (s[key] as number).toFixed(2);
    const slider = row.createEl("input") as HTMLInputElement;
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(s[key]);
    slider.style.cssText = `width:100%;cursor:pointer;`;
    slider.oninput = async () => {
      (s as GalaxySettings & Record<string, number>)[key as string] = parseFloat(slider.value);
      valSpan.textContent = (s[key] as number).toFixed(2);
      cb.refreshLinkColors();
      await save();
    };
    return slider;
  };
  opacSlider(linkSec, "Default opacity", "linkOpacityDefault");
  opacSlider(linkSec, "Highlighted link opacity", "linkOpacityHighlight");
  opacSlider(linkSec, "Dimmed link opacity", "linkOpacityDim");

  const fogSec = section("Index fog");
  const fogRow = fogSec.createDiv();
  fogRow.style.cssText = `display:flex;align-items:center;gap:8px;margin-bottom:10px;`;
  const fogCheck = fogRow.createEl("input") as HTMLInputElement;
  fogCheck.type = "checkbox";
  fogCheck.checked = s.fogEnabled;
  fogCheck.style.cssText = `cursor:pointer;`;
  const fogLabel = fogRow.createEl("span");
  fogLabel.textContent = "Enable fog";
  fogLabel.style.cssText = `font-size:12px;color:#dcddde;cursor:pointer;`;
  fogLabel.onclick = () => fogCheck.click();
  fogCheck.onchange = async () => {
    s.fogEnabled = fogCheck.checked;
    cb.rebuildFog();
    await save();
  };

  const fogModeDiv = fogSec.createDiv();
  fogModeDiv.style.cssText = `margin-bottom:10px;`;
  for (const [val, lbl] of [["color", "Match index color"], ["heat", "Heat map (connections = heat)"]] as const) {
    const row = fogModeDiv.createDiv();
    row.style.cssText = `display:flex;align-items:center;gap:8px;margin-bottom:4px;`;
    const radio = row.createEl("input") as HTMLInputElement;
    radio.type = "radio";
    radio.name = "fog-mode";
    radio.value = val;
    radio.checked = s.fogMode === val;
    radio.style.cssText = `cursor:pointer;`;
    const rowLabel = row.createEl("span");
    rowLabel.textContent = lbl;
    rowLabel.style.cssText = `font-size:12px;color:#dcddde;`;
    radio.onchange = async () => {
      if (radio.checked) {
        s.fogMode = val;
        cb.rebuildFog();
        await save();
      }
    };
  }
  opacSlider(fogSec, "Max fog opacity", "fogMaxOpacity", 0, 1, 0.05);

  const bgSec = section("Background");
  const starsRow = bgSec.createDiv();
  starsRow.style.cssText = `display:flex;align-items:center;gap:8px;`;
  const starsCheck = starsRow.createEl("input") as HTMLInputElement;
  starsCheck.type = "checkbox";
  starsCheck.checked = s.showStars;
  starsCheck.style.cssText = `cursor:pointer;`;
  const starsLabel = starsRow.createEl("span");
  starsLabel.textContent = "Show starfield";
  starsLabel.style.cssText = `font-size:12px;color:#dcddde;`;
  starsCheck.onchange = async () => {
    s.showStars = starsCheck.checked;
    cb.toggleStars(s.showStars);
    await save();
  };

  const starSlider = (parent: HTMLElement, labelText: string, key: "starCount" | "starSize" | "starBrightness", min: number, max: number, step: number, decimals: number) => {
    const row = parent.createDiv();
    row.style.cssText = `margin-top:10px;`;
    const labelRow = row.createDiv();
    labelRow.style.cssText = `display:flex;justify-content:space-between;margin-bottom:4px;`;
    const lbl = labelRow.createEl("span");
    lbl.textContent = labelText;
    lbl.style.cssText = `font-size:12px;color:#aaa;`;
    const val = labelRow.createEl("span");
    val.style.cssText = `font-size:11px;color:#8ab4f8;`;
    val.textContent = decimals === 0 ? String(s[key]) : (s[key] as number).toFixed(decimals);
    const slider = row.createEl("input") as HTMLInputElement;
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(s[key]);
    slider.style.cssText = `width:100%;cursor:pointer;`;
    slider.oninput = async () => {
      (s as any)[key] = parseFloat(slider.value);
      val.textContent = decimals === 0 ? String(Math.round(s[key] as number)) : (s[key] as number).toFixed(decimals);
      cb.rebuildStars();
      await save();
    };
  };

  starSlider(bgSec, "Star count", "starCount", 200, 8000, 200, 0);
  starSlider(bgSec, "Star size", "starSize", 0.3, 5.0, 0.1, 1);
  starSlider(bgSec, "Star brightness", "starBrightness", 0.1, 1.0, 0.05, 2);

  const depthSec = section("Depth elements");
  const depthSlider = (
    parent: HTMLElement,
    labelText: string,
    key: "sphereOpacity" | "ringsOpacity" | "groundGridOpacity",
    max = 0.3
  ) => {
    const row = parent.createDiv();
    row.style.cssText = `display:flex;align-items:center;gap:8px;margin-bottom:8px;`;
    const lbl = row.createEl("span");
    lbl.style.cssText = `font-size:12px;color:#aaa;flex:1;`;
    lbl.textContent = labelText;
    const slider = row.createEl("input") as HTMLInputElement;
    slider.type = "range";
    slider.min = "0";
    slider.max = String(max);
    slider.step = "0.01";
    slider.value = String(s[key]);
    slider.style.cssText = `width:80px;cursor:pointer;`;
    const valSpan = row.createEl("span");
    valSpan.style.cssText = `font-size:11px;color:#8ab4f8;min-width:32px;text-align:right;`;
    valSpan.textContent = s[key].toFixed(2);
    slider.oninput = async () => {
      s[key] = parseFloat(slider.value);
      valSpan.textContent = s[key].toFixed(2);
      cb.updateGridOpacities();
      await save();
    };
  };
  depthSlider(depthSec, "Sphere opacity", "sphereOpacity");
  depthSlider(depthSec, "Ring opacity", "ringsOpacity");
  depthSlider(depthSec, "Ground grid opacity", "groundGridOpacity");

  const tmplSec = section("Note template");
  const tmplDesc = tmplSec.createEl("div");
  tmplDesc.style.cssText = `font-size:11px;color:#888;margin-bottom:8px;`;
  tmplDesc.appendText("Variables: ");
  for (const variable of ["{{date}}", "{{index}}", "{{title}}", "{{folder}}"]) {
    tmplDesc.createEl("code", { text: variable });
    tmplDesc.appendText(" ");
  }

  const textarea = tmplSec.createEl("textarea") as HTMLTextAreaElement;
  textarea.value = s.noteTemplate;
  textarea.rows = 10;
  textarea.style.cssText = inputStyle + `height:auto;font-family:monospace;font-size:11px;resize:vertical;`;
  textarea.onchange = async () => {
    s.noteTemplate = textarea.value;
    await save();
  };

  const resetLink = tmplSec.createEl("a", { text: "Reset to default" });
  resetLink.style.cssText = `display:inline-block;margin-top:8px;font-size:11px;color:#8ab4f8;cursor:pointer;text-decoration:none;`;
  resetLink.onclick = async () => {
    s.noteTemplate = DEFAULT_SETTINGS.noteTemplate;
    textarea.value = s.noteTemplate;
    await save();
  };

  const physicsSec = section("Physics");
  const physicsSlider = (parent: HTMLElement, labelText: string, key: "repelForce" | "linkForce" | "linkDistance" | "centerGravity", min: number, max: number, step: number, decimals: number) => {
    const row = parent.createDiv();
    row.style.cssText = `margin-bottom:12px;`;
    const labelRow = row.createDiv();
    labelRow.style.cssText = `display:flex;justify-content:space-between;margin-bottom:4px;`;
    const lbl = labelRow.createEl("span");
    lbl.textContent = labelText;
    lbl.style.cssText = `font-size:12px;color:#aaa;`;
    const val = labelRow.createEl("span");
    val.style.cssText = `font-size:11px;color:#8ab4f8;`;
    val.textContent = (s[key] as number).toFixed(decimals);
    const slider = row.createEl("input") as HTMLInputElement;
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(s[key]);
    slider.style.cssText = `width:100%;cursor:pointer;`;
    slider.oninput = async () => {
      (s as any)[key] = parseFloat(slider.value);
      val.textContent = (s[key] as number).toFixed(decimals);
      cb.refreshForces();
      await save();
    };
  };
  physicsSlider(physicsSec, "Repel force", "repelForce", -300, 0, 5, 0);
  physicsSlider(physicsSec, "Link force", "linkForce", 0, 2, 0.05, 2);
  physicsSlider(physicsSec, "Link distance", "linkDistance", 5, 300, 5, 0);
  physicsSlider(physicsSec, "Center gravity", "centerGravity", 0, 0.1, 0.002, 3);

  const navSec = section("Navigation");
  const flyRow = navSec.createDiv();
  flyRow.style.cssText = `margin-bottom:10px;`;
  const flyLabelRow = flyRow.createDiv();
  flyLabelRow.style.cssText = `display:flex;justify-content:space-between;margin-bottom:4px;`;
  const flyLabelSpan = flyLabelRow.createEl("span");
  flyLabelSpan.textContent = "Click zoom distance";
  flyLabelSpan.style.cssText = `font-size:12px;color:#aaa;`;
  const flyValSpan = flyLabelRow.createEl("span");
  flyValSpan.style.cssText = `font-size:11px;color:#8ab4f8;`;
  flyValSpan.textContent = String(s.clickFlyDistance);
  const flySlider = flyRow.createEl("input") as HTMLInputElement;
  flySlider.type = "range";
  flySlider.min = "100";
  flySlider.max = "1500";
  flySlider.step = "50";
  flySlider.value = String(s.clickFlyDistance);
  flySlider.style.cssText = `width:100%;cursor:pointer;`;
  flySlider.oninput = async () => {
    s.clickFlyDistance = parseInt(flySlider.value);
    flyValSpan.textContent = String(s.clickFlyDistance);
    await save();
  };
  const flyDesc = navSec.createEl("div");
  flyDesc.style.cssText = `font-size:11px;color:#888;margin-top:4px;`;
  flyDesc.textContent = "Camera distance after clicking a node (lower = more zoomed in)";

  const labelSec = section("Labels");
  const labelRow = labelSec.createDiv();
  labelRow.style.cssText = `display:flex;align-items:center;gap:8px;`;
  const labelSlider = labelRow.createEl("input") as HTMLInputElement;
  labelSlider.type = "range";
  labelSlider.min = "0";
  labelSlider.max = "30";
  labelSlider.step = "1";
  labelSlider.value = String(s.topLabelCount);
  labelSlider.style.cssText = `flex:1;cursor:pointer;`;
  const labelVal = labelRow.createEl("span");
  labelVal.style.cssText = `font-size:11px;color:#8ab4f8;min-width:24px;text-align:right;`;
  labelVal.textContent = String(s.topLabelCount);
  labelSlider.oninput = async () => {
    s.topLabelCount = parseInt(labelSlider.value);
    labelVal.textContent = String(s.topLabelCount);
    cb.rebuildLabels();
    await save();
  };
  const labelDesc = labelSec.createEl("div");
  labelDesc.style.cssText = `font-size:11px;color:#888;margin-top:4px;`;
  labelDesc.textContent = "Show labels for top N index nodes";

  const hideRow = labelSec.createDiv();
  hideRow.style.cssText = `margin-top:12px;`;
  const hideLabelRow = hideRow.createDiv();
  hideLabelRow.style.cssText = `display:flex;justify-content:space-between;margin-bottom:4px;`;
  const hideLbl = hideLabelRow.createEl("span");
  hideLbl.textContent = "Hide labels when zoomed out past";
  hideLbl.style.cssText = `font-size:12px;color:#aaa;`;
  const hideVal = hideLabelRow.createEl("span");
  hideVal.style.cssText = `font-size:11px;color:#8ab4f8;`;
  hideVal.textContent = String(s.labelHideDistance);
  const hideSlider = hideRow.createEl("input") as HTMLInputElement;
  hideSlider.type = "range";
  hideSlider.min = "500";
  hideSlider.max = "8000";
  hideSlider.step = "100";
  hideSlider.value = String(s.labelHideDistance);
  hideSlider.style.cssText = `width:100%;cursor:pointer;`;
  hideSlider.oninput = async () => {
    s.labelHideDistance = parseInt(hideSlider.value);
    hideVal.textContent = String(s.labelHideDistance);
    await save();
  };
  const hideDesc = labelSec.createEl("div");
  hideDesc.style.cssText = `font-size:11px;color:#888;margin-top:4px;`;
  hideDesc.textContent = "Camera distance at which labels disappear (higher = visible from further out)";

  const footer = panel.createDiv();
  footer.style.cssText =
    `padding:12px 16px;border-top:1px solid rgba(255,255,255,0.08);` +
    `display:flex;justify-content:space-between;align-items:center;flex-shrink:0;`;
  const resetBtn = footer.createEl("button", { text: "Reset to defaults" });
  resetBtn.style.cssText =
    `background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);` +
    `color:#aaa;border-radius:4px;padding:5px 10px;cursor:pointer;font-size:11px;`;
  resetBtn.onclick = async () => {
    Object.assign(plugin.settings, DEFAULT_SETTINGS);
    cb.setSavedEl(null);
    buildSettingsPanel(panel, plugin, app, cb);
    cb.refreshNodeColors();
    cb.refreshLinkColors();
    cb.rebuildFog();
    cb.rebuildLabels();
    cb.refreshSparklineIfSelected();
    cb.updateGridOpacities();
    cb.toggleStars(plugin.settings.showStars);
    await save();
  };
  const savedEl = footer.createEl("span");
  savedEl.textContent = "Saved ✓";
  savedEl.style.cssText =
    `font-size:11px;color:#8ab4f8;opacity:0;transition:opacity 0.3s ease;`;
  cb.setSavedEl(savedEl);
}
