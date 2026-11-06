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
  cb: SettingsPanelCallbacks,
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

  const header = panel.createDiv({ cls: "galaxy-settings-header" });
  header.createEl("span", { text: "Graph settings", cls: "galaxy-settings-title" });
  const closeBtn = header.createEl("button", { text: "✕", cls: "galaxy-settings-close" });
  closeBtn.onclick = () => cb.closeSettingsPanel();

  const body = panel.createDiv({ cls: "galaxy-settings-body" });

  const section = (title: string) => {
    const sectionEl = body.createDiv({ cls: "galaxy-settings-section" });
    sectionEl.createDiv({ text: title, cls: "galaxy-settings-section-heading" });
    return sectionEl;
  };

  const label = (parent: HTMLElement, labelText: string) =>
    parent.createEl("label", { text: labelText, cls: "galaxy-setting-label" });

  const save = async () => {
    await plugin.saveSettings();
    cb.flashSaved();
  };

  const popSec = section("Popularity dimension");
  const popOpts: [GalaxySettings["popularityDimension"], string][] = [
    ["ctime", "Created time (ctime)"],
    ["mtime", "Modified time (mtime)"],
    ["frontmatter", "Frontmatter field"],
  ];
  for (const [val, lbl] of popOpts) {
    const row = popSec.createDiv({ cls: "galaxy-radio-row" });
    const radio = row.createEl("input");
    radio.type = "radio";
    radio.name = "pop-dim";
    radio.value = val;
    radio.checked = s.popularityDimension === val;
    const rowLabel = row.createEl("span", { text: lbl, cls: "galaxy-radio-label galaxy-radio-label--click" });
    rowLabel.onclick = () => {
      radio.click();
    };
    radio.onchange = async () => {
      if (radio.checked) {
        s.popularityDimension = val;
        fmRow.style.display = val === "frontmatter" ? "block" : "none";
        cb.refreshSparklineIfSelected();
        await save();
      }
    };
  }
  const fmRow = popSec.createDiv({ cls: "galaxy-subrow" });
  fmRow.style.display = s.popularityDimension === "frontmatter" ? "block" : "none";
  label(fmRow, "Field name:");
  const fmInput = fmRow.createEl("input", { cls: "galaxy-input" });
  fmInput.type = "text";
  fmInput.value = s.popularityFrontmatterKey;
  fmInput.onchange = async () => {
    s.popularityFrontmatterKey = fmInput.value.trim() || "updated";
    cb.refreshSparklineIfSelected();
    await save();
  };

  const rotSec = section("Rotation speed");
  const rotRow = rotSec.createDiv({ cls: "galaxy-slider-flex-row" });
  const rotSlider = rotRow.createEl("input", { cls: "galaxy-slider" });
  rotSlider.type = "range";
  rotSlider.min = "0";
  rotSlider.max = "0.01";
  rotSlider.step = "0.0001";
  rotSlider.value = String(s.rotationSpeed);
  const rotVal = rotRow.createEl("span", { cls: "galaxy-slider-value galaxy-slider-value--right" });
  rotVal.textContent = s.rotationSpeed.toFixed(4);
  rotSlider.oninput = async () => {
    s.rotationSpeed = parseFloat(rotSlider.value);
    rotVal.textContent = s.rotationSpeed.toFixed(4);
    await save();
  };

  const colSec = section("Color mapping");
  const colOpts: [GalaxySettings["colorBy"], string][] = [
    ["folder", "By folder"],
    ["index", "By index vs normal"],
    ["tag", "By tag"],
    ["activity", "Activity heat"],
  ];
  for (const [val, lbl] of colOpts) {
    const row = colSec.createDiv({ cls: "galaxy-radio-row" });
    const radio = row.createEl("input");
    radio.type = "radio";
    radio.name = "color-by";
    radio.value = val;
    radio.checked = s.colorBy === val;
    row.createEl("span", { text: lbl, cls: "galaxy-radio-label" });
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
  const indexThreshRow = colSec.createDiv({ cls: "galaxy-subrow" });
  indexThreshRow.style.display = s.colorBy === "index" ? "block" : "none";
  label(indexThreshRow, "Min connections to be index:");
  const threshInput = indexThreshRow.createEl("input", { cls: "galaxy-input" });
  threshInput.type = "number";
  threshInput.min = "1";
  threshInput.value = String(s.indexDegreeThreshold);
  threshInput.onchange = async () => {
    s.indexDegreeThreshold = Math.max(1, parseInt(threshInput.value) || 10);
    cb.refreshNodeColors();
    if (s.fogEnabled) cb.rebuildFog();
    cb.rebuildLabels();
    await save();
  };

  const tagMapRow = colSec.createDiv({ cls: "galaxy-subrow" });
  tagMapRow.style.display = s.colorBy === "tag" ? "block" : "none";
  label(tagMapRow, "Tag → color:");
  const tagList = tagMapRow.createDiv({ cls: "galaxy-taglist" });

  const renderTagList = () => {
    tagList.empty();
    for (const [tag, color] of Object.entries(s.tagColorMap)) {
      const row = tagList.createDiv({ cls: "galaxy-tag-row" });
      row.createEl("span", { text: tag, cls: "galaxy-tag-name" });
      const colorPicker = row.createEl("input", { cls: "galaxy-color-input" });
      colorPicker.type = "color";
      colorPicker.value = color;
      colorPicker.onchange = async () => {
        s.tagColorMap[tag] = colorPicker.value;
        cb.refreshNodeColors();
        await save();
      };
      const removeBtn = row.createEl("button", { text: "×", cls: "galaxy-remove-btn" });
      removeBtn.onclick = async () => {
        s.tagColorMap = Object.fromEntries(Object.entries(s.tagColorMap).filter(([key]) => key !== tag));
        renderTagList();
        cb.refreshNodeColors();
        await save();
      };
    }
  };
  renderTagList();

  const addTagRow = tagMapRow.createDiv({ cls: "galaxy-add-row" });
  const newTagInput = addTagRow.createEl("input", { cls: "galaxy-input galaxy-input--flex" });
  newTagInput.type = "text";
  newTagInput.placeholder = "tag name";

  const suggestionDropdown = addTagRow.createDiv({ cls: "galaxy-suggestions" });

  let selectedSuggestion = -1;
  let activeSuggestions: string[] = [];

  const highlightSuggestion = () => {
    const items = Array.from(suggestionDropdown.children) as HTMLElement[];
    items.forEach((item, index) => {
      item.toggleClass("is-selected", index === selectedSuggestion);
    });
  };

  const hideSuggestions = () => {
    suggestionDropdown.removeClass("is-open");
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

    activeSuggestions = vaultTags.filter((tag) => tag.toLowerCase().includes(query)).slice(0, 8);

    if (activeSuggestions.length === 0) {
      hideSuggestions();
      return;
    }

    suggestionDropdown.empty();
    suggestionDropdown.addClass("is-open");
    suggestionDropdown.style.width = `${newTagInput.offsetWidth}px`;
    selectedSuggestion = 0;

    for (const tag of activeSuggestions) {
      const item = suggestionDropdown.createDiv({ text: tag, cls: "galaxy-suggestion-item" });
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
    if (!suggestionDropdown.hasClass("is-open")) return;
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

  const newTagColor = addTagRow.createEl("input", { cls: "galaxy-color-input galaxy-color-input--lg" });
  newTagColor.type = "color";
  newTagColor.value = "#4fc3f7";
  const addTagBtn = addTagRow.createEl("button", { text: "Add", cls: "galaxy-accent-btn" });
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

  const activityRow = colSec.createDiv({ cls: "galaxy-subrow" });
  activityRow.style.display = s.colorBy === "activity" ? "block" : "none";
  label(activityRow, "Activity window (days):");
  const activityWindowRow = activityRow.createDiv({ cls: "galaxy-slider-flex-row" });
  const activitySlider = activityWindowRow.createEl("input", { cls: "galaxy-slider" });
  activitySlider.type = "range";
  activitySlider.min = "7";
  activitySlider.max = "365";
  activitySlider.step = "1";
  activitySlider.value = String(s.activityWindowDays);
  const activityVal = activityWindowRow.createEl("span", {
    cls: "galaxy-slider-value galaxy-slider-value--right",
  });
  activityVal.textContent = `${s.activityWindowDays}d`;
  activitySlider.oninput = async () => {
    s.activityWindowDays = parseInt(activitySlider.value);
    activityVal.textContent = `${s.activityWindowDays}d`;
    cb.recomputeActivityHeat();
    await save();
  };
  const activityDesc = activityRow.createEl("div", { cls: "galaxy-setting-desc" });
  activityDesc.textContent = "Index heat = notes added to cluster within this window";

  label(activityRow, "Leaf note heat based on:");
  const leafFieldRow = activityRow.createDiv({ cls: "galaxy-leaf-row" });
  for (const [val, lbl] of [
    ["mtime", "Last modified"],
    ["ctime", "Created"],
  ] as const) {
    const optRow = leafFieldRow.createDiv({ cls: "galaxy-radio-row galaxy-radio-row--inline" });
    const radio = optRow.createEl("input");
    radio.type = "radio";
    radio.name = "leaf-date-field";
    radio.value = val;
    radio.checked = s.activityLeafDateField === val;
    const optLabel = optRow.createEl("span", {
      text: lbl,
      cls: "galaxy-radio-label galaxy-radio-label--click",
    });
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
  const opacSlider = (
    parent: HTMLElement,
    lbl: string,
    key: "linkOpacityDefault" | "linkOpacityHighlight" | "linkOpacityDim" | "fogMaxOpacity",
    min = 0,
    max = 1,
    step = 0.01,
  ) => {
    const row = parent.createDiv({ cls: "galaxy-slider-block" });
    const labelRow = row.createDiv({ cls: "galaxy-slider-label-row" });
    labelRow.createEl("span", { text: lbl, cls: "galaxy-slider-name" });
    const valSpan = labelRow.createEl("span", { cls: "galaxy-slider-value" });
    valSpan.textContent = s[key].toFixed(2);
    const slider = row.createEl("input", { cls: "galaxy-slider--full" });
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(s[key]);
    slider.oninput = async () => {
      s[key] = parseFloat(slider.value);
      valSpan.textContent = s[key].toFixed(2);
      cb.refreshLinkColors();
      await save();
    };
    return slider;
  };
  opacSlider(linkSec, "Default opacity", "linkOpacityDefault");
  opacSlider(linkSec, "Highlighted link opacity", "linkOpacityHighlight");
  opacSlider(linkSec, "Dimmed link opacity", "linkOpacityDim");

  const fogSec = section("Index fog");
  const fogRow = fogSec.createDiv({ cls: "galaxy-check-row" });
  const fogCheck = fogRow.createEl("input");
  fogCheck.type = "checkbox";
  fogCheck.checked = s.fogEnabled;
  const fogLabel = fogRow.createEl("span", {
    text: "Enable fog",
    cls: "galaxy-radio-label galaxy-radio-label--click",
  });
  fogLabel.onclick = () => fogCheck.click();
  fogCheck.onchange = async () => {
    s.fogEnabled = fogCheck.checked;
    cb.rebuildFog();
    await save();
  };

  const fogModeDiv = fogSec.createDiv({ cls: "galaxy-slider-block" });
  for (const [val, lbl] of [
    ["color", "Match index color"],
    ["heat", "Heat map (connections = heat)"],
  ] as const) {
    const row = fogModeDiv.createDiv({ cls: "galaxy-radio-row" });
    const radio = row.createEl("input");
    radio.type = "radio";
    radio.name = "fog-mode";
    radio.value = val;
    radio.checked = s.fogMode === val;
    row.createEl("span", { text: lbl, cls: "galaxy-radio-label" });
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
  const starsRow = bgSec.createDiv({ cls: "galaxy-check-row galaxy-check-row--tight" });
  const starsCheck = starsRow.createEl("input");
  starsCheck.type = "checkbox";
  starsCheck.checked = s.showStars;
  starsRow.createEl("span", { text: "Show starfield", cls: "galaxy-radio-label" });
  starsCheck.onchange = async () => {
    s.showStars = starsCheck.checked;
    cb.toggleStars(s.showStars);
    await save();
  };

  const starSlider = (
    parent: HTMLElement,
    labelText: string,
    key: "starCount" | "starSize" | "starBrightness",
    min: number,
    max: number,
    step: number,
    decimals: number,
  ) => {
    const row = parent.createDiv({ cls: "galaxy-slider-block--below" });
    const labelRow = row.createDiv({ cls: "galaxy-slider-label-row" });
    labelRow.createEl("span", { text: labelText, cls: "galaxy-slider-name" });
    const val = labelRow.createEl("span", { cls: "galaxy-slider-value" });
    val.textContent = decimals === 0 ? String(s[key]) : s[key].toFixed(decimals);
    const slider = row.createEl("input", { cls: "galaxy-slider--full" });
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(s[key]);
    slider.oninput = async () => {
      s[key] = parseFloat(slider.value);
      val.textContent = decimals === 0 ? String(Math.round(s[key])) : s[key].toFixed(decimals);
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
    max = 0.3,
  ) => {
    const row = parent.createDiv({ cls: "galaxy-slider-flex-row galaxy-slider-block" });
    row.createEl("span", { text: labelText, cls: "galaxy-slider-name galaxy-slider-name--flex" });
    const slider = row.createEl("input", { cls: "galaxy-slider--compact" });
    slider.type = "range";
    slider.min = "0";
    slider.max = String(max);
    slider.step = "0.01";
    slider.value = String(s[key]);
    const valSpan = row.createEl("span", { cls: "galaxy-slider-value galaxy-slider-value--right" });
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
  const tmplDesc = tmplSec.createEl("div", { cls: "galaxy-setting-desc galaxy-setting-desc--above" });
  tmplDesc.appendText("Variables: ");
  for (const variable of ["{{date}}", "{{index}}", "{{title}}", "{{folder}}"]) {
    tmplDesc.createEl("code", { text: variable });
    tmplDesc.appendText(" ");
  }

  const textarea = tmplSec.createEl("textarea", { cls: "galaxy-input galaxy-template-textarea" });
  textarea.value = s.noteTemplate;
  textarea.rows = 10;
  textarea.onchange = async () => {
    s.noteTemplate = textarea.value;
    await save();
  };

  const resetLink = tmplSec.createEl("a", { text: "Reset to default", cls: "galaxy-reset-link" });
  resetLink.onclick = async () => {
    s.noteTemplate = DEFAULT_SETTINGS.noteTemplate;
    textarea.value = s.noteTemplate;
    await save();
  };

  const physicsSec = section("Physics");
  const physicsSlider = (
    parent: HTMLElement,
    labelText: string,
    key: "repelForce" | "linkForce" | "linkDistance" | "centerGravity",
    min: number,
    max: number,
    step: number,
    decimals: number,
  ) => {
    const row = parent.createDiv({ cls: "galaxy-slider-block" });
    const labelRow = row.createDiv({ cls: "galaxy-slider-label-row" });
    labelRow.createEl("span", { text: labelText, cls: "galaxy-slider-name" });
    const val = labelRow.createEl("span", { cls: "galaxy-slider-value" });
    val.textContent = s[key].toFixed(decimals);
    const slider = row.createEl("input", { cls: "galaxy-slider--full" });
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(s[key]);
    slider.oninput = async () => {
      s[key] = parseFloat(slider.value);
      val.textContent = s[key].toFixed(decimals);
      cb.refreshForces();
      await save();
    };
  };
  physicsSlider(physicsSec, "Repel force", "repelForce", -300, 0, 5, 0);
  physicsSlider(physicsSec, "Link force", "linkForce", 0, 2, 0.05, 2);
  physicsSlider(physicsSec, "Link distance", "linkDistance", 5, 300, 5, 0);
  physicsSlider(physicsSec, "Center gravity", "centerGravity", 0, 0.1, 0.002, 3);

  const navSec = section("Navigation");
  const flyRow = navSec.createDiv({ cls: "galaxy-slider-block" });
  const flyLabelRow = flyRow.createDiv({ cls: "galaxy-slider-label-row" });
  flyLabelRow.createEl("span", { text: "Click zoom distance", cls: "galaxy-slider-name" });
  const flyValSpan = flyLabelRow.createEl("span", { cls: "galaxy-slider-value" });
  flyValSpan.textContent = String(s.clickFlyDistance);
  const flySlider = flyRow.createEl("input", { cls: "galaxy-slider--full" });
  flySlider.type = "range";
  flySlider.min = "100";
  flySlider.max = "1500";
  flySlider.step = "50";
  flySlider.value = String(s.clickFlyDistance);
  flySlider.oninput = async () => {
    s.clickFlyDistance = parseInt(flySlider.value);
    flyValSpan.textContent = String(s.clickFlyDistance);
    await save();
  };
  const flyDesc = navSec.createEl("div", { cls: "galaxy-setting-desc" });
  flyDesc.textContent = "Camera distance after clicking a node (lower = more zoomed in)";

  const labelSec = section("Labels");
  const labelRow = labelSec.createDiv({ cls: "galaxy-slider-flex-row" });
  const labelSlider = labelRow.createEl("input", { cls: "galaxy-slider" });
  labelSlider.type = "range";
  labelSlider.min = "0";
  labelSlider.max = "30";
  labelSlider.step = "1";
  labelSlider.value = String(s.topLabelCount);
  const labelVal = labelRow.createEl("span", { cls: "galaxy-slider-value galaxy-slider-value--right" });
  labelVal.textContent = String(s.topLabelCount);
  labelSlider.oninput = async () => {
    s.topLabelCount = parseInt(labelSlider.value);
    labelVal.textContent = String(s.topLabelCount);
    cb.rebuildLabels();
    await save();
  };
  const labelDesc = labelSec.createEl("div", { cls: "galaxy-setting-desc" });
  labelDesc.textContent = "Show labels for top N index nodes";

  const hideRow = labelSec.createDiv({ cls: "galaxy-slider-block--below" });
  const hideLabelRow = hideRow.createDiv({ cls: "galaxy-slider-label-row" });
  hideLabelRow.createEl("span", { text: "Hide labels when zoomed out past", cls: "galaxy-slider-name" });
  const hideVal = hideLabelRow.createEl("span", { cls: "galaxy-slider-value" });
  hideVal.textContent = String(s.labelHideDistance);
  const hideSlider = hideRow.createEl("input", { cls: "galaxy-slider--full" });
  hideSlider.type = "range";
  hideSlider.min = "500";
  hideSlider.max = "8000";
  hideSlider.step = "100";
  hideSlider.value = String(s.labelHideDistance);
  hideSlider.oninput = async () => {
    s.labelHideDistance = parseInt(hideSlider.value);
    hideVal.textContent = String(s.labelHideDistance);
    await save();
  };
  const hideDesc = labelSec.createEl("div", { cls: "galaxy-setting-desc" });
  hideDesc.textContent = "Camera distance at which labels disappear (higher = visible from further out)";

  const footer = panel.createDiv({ cls: "galaxy-settings-footer" });
  const resetBtn = footer.createEl("button", { text: "Reset to defaults", cls: "galaxy-muted-btn" });
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
  const savedEl = footer.createEl("span", { text: "Saved ✓", cls: "galaxy-saved-flash" });
  cb.setSavedEl(savedEl);
}
