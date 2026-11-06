import { getAllTags, setIcon, type App } from "obsidian";
import { DEFAULT_SETTINGS, type GalaxySettings } from "../settings";
import { visibleMarkdownFiles } from "../utils/excluded";

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
  refreshForces(): void;
  recomputeActivityHeat(): void;
  flashSaved(): void;
  setSavedEl(el: HTMLElement | null): void;
}

type NumericKey = {
  [K in keyof GalaxySettings]: GalaxySettings[K] extends number ? K : never;
}[keyof GalaxySettings];

interface SliderSpec {
  label: string;
  key: NumericKey;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onInput?: () => void;
}

interface RadioOption<T extends string> {
  value: T;
  label: string;
}

interface PanelContext {
  s: GalaxySettings;
  cb: SettingsPanelCallbacks;
  vaultTags: string[];
  save: () => Promise<void>;
  section: (title: string) => HTMLElement;
  slider: (parent: HTMLElement, spec: SliderSpec) => void;
  radios: <T extends string>(
    parent: HTMLElement,
    name: string,
    options: RadioOption<T>[],
    current: T,
    onChange: (value: T) => Promise<void>,
  ) => void;
}

const TAG_PREVIEW_COUNT = 8;
const SUGGESTION_MAX = 8;

const twoDecimals = (v: number) => v.toFixed(2);
const whole = (v: number) => String(Math.round(v));

export function buildSettingsPanel(
  panel: HTMLElement,
  plugin: SettingsPanelPlugin,
  app: App,
  cb: SettingsPanelCallbacks,
) {
  panel.empty();
  const s = plugin.settings;

  const header = panel.createDiv({ cls: "galaxy-settings-header" });
  header.createEl("span", { text: "Graph settings", cls: "galaxy-settings-title" });
  const closeBtn = header.createEl("button", {
    cls: "galaxy-icon-btn",
    attr: { "aria-label": "Close settings" },
  });
  setIcon(closeBtn, "x");
  closeBtn.onclick = () => cb.closeSettingsPanel();

  const body = panel.createDiv({ cls: "galaxy-settings-body" });

  const ctx: PanelContext = {
    s,
    cb,
    vaultTags: collectVaultTags(app),
    save: async () => {
      await plugin.saveSettings();
      cb.flashSaved();
    },
    section: (title) => {
      const el = body.createDiv({ cls: "galaxy-settings-section" });
      el.createDiv({ text: title, cls: "galaxy-settings-section-heading" });
      return el;
    },
    slider: (parent, spec) => {
      const format = spec.format ?? String;
      const row = parent.createDiv({ cls: "galaxy-slider-row" });
      const head = row.createDiv({ cls: "galaxy-slider-head" });
      head.createEl("span", { text: spec.label, cls: "galaxy-slider-name" });
      const valueEl = head.createEl("span", { text: format(s[spec.key]), cls: "galaxy-slider-value" });
      const input = row.createEl("input", {
        cls: "galaxy-slider",
        attr: { type: "range", min: spec.min, max: spec.max, step: spec.step, "aria-label": spec.label },
      });
      input.value = String(s[spec.key]);
      input.oninput = async () => {
        s[spec.key] = parseFloat(input.value);
        valueEl.textContent = format(s[spec.key]);
        spec.onInput?.();
        await ctx.save();
      };
    },
    radios: (parent, name, options, current, onChange) => {
      for (const opt of options) {
        const row = parent.createEl("label", { cls: "galaxy-choice-row" });
        const input = row.createEl("input", { attr: { type: "radio", name, value: opt.value } });
        input.checked = current === opt.value;
        row.createEl("span", { text: opt.label });
        input.onchange = () => {
          if (input.checked) void onChange(opt.value);
        };
      }
    },
  };

  sectionPopularity(ctx);
  sectionRotation(ctx);
  sectionColor(ctx);
  sectionLinks(ctx);
  sectionClouds(ctx);
  sectionTemplate(ctx);
  sectionPhysics(ctx);
  sectionLabels(ctx);

  const footer = panel.createDiv({ cls: "galaxy-settings-footer" });
  const resetBtn = footer.createEl("button", { text: "Reset to defaults" });
  resetBtn.onclick = async () => {
    Object.assign(plugin.settings, structuredClone(DEFAULT_SETTINGS));
    cb.setSavedEl(null);
    buildSettingsPanel(panel, plugin, app, cb);
    cb.refreshNodeColors();
    cb.refreshLinkColors();
    cb.rebuildFog();
    cb.rebuildLabels();
    cb.refreshForces();
    cb.refreshSparklineIfSelected();
    await ctx.save();
  };
  cb.setSavedEl(footer.createEl("span", { text: "Saved", cls: "galaxy-saved-flash" }));
}

function collectVaultTags(app: App): string[] {
  const tagSet = new Set<string>();
  for (const file of visibleMarkdownFiles(app)) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache) continue;
    for (const t of getAllTags(cache) ?? []) tagSet.add(t.replace(/^#/, ""));
  }
  return [...tagSet].sort((a, b) => a.localeCompare(b));
}

function sectionPopularity({ s, cb, save, section, radios }: PanelContext) {
  const sec = section("Popularity dimension");
  const fmRow = sec.createDiv({ cls: "galaxy-subrow" });
  radios<GalaxySettings["popularityDimension"]>(
    sec,
    "pop-dim",
    [
      { value: "ctime", label: "Created time" },
      { value: "mtime", label: "Modified time" },
      { value: "frontmatter", label: "Frontmatter field" },
    ],
    s.popularityDimension,
    async (value) => {
      s.popularityDimension = value;
      fmRow.toggleClass("is-hidden", value !== "frontmatter");
      cb.refreshSparklineIfSelected();
      await save();
    },
  );
  sec.appendChild(fmRow);
  fmRow.toggleClass("is-hidden", s.popularityDimension !== "frontmatter");
  fmRow.createEl("label", {
    text: "Field name",
    cls: "galaxy-setting-label",
    attr: { for: "galaxy-fm-key" },
  });
  const fmInput = fmRow.createEl("input", {
    cls: "galaxy-input",
    attr: { type: "text", id: "galaxy-fm-key" },
  });
  fmInput.value = s.popularityFrontmatterKey;
  fmInput.onchange = async () => {
    s.popularityFrontmatterKey = fmInput.value.trim() || "updated";
    cb.refreshSparklineIfSelected();
    await save();
  };
}

function sectionRotation({ section, slider }: PanelContext) {
  const sec = section("Rotation");
  slider(sec, {
    label: "Speed",
    key: "rotationSpeed",
    min: 0,
    max: 0.01,
    step: 0.0001,
    format: (v) => v.toFixed(4),
  });
}

function sectionColor(ctx: PanelContext) {
  const { s, cb, save, section, radios } = ctx;
  const sec = section("Color mapping");
  const indexRow = sec.createDiv({ cls: "galaxy-subrow" });
  const tagRow = sec.createDiv({ cls: "galaxy-subrow" });
  const activityRow = sec.createDiv({ cls: "galaxy-subrow" });
  const syncRows = () => {
    indexRow.toggleClass("is-hidden", s.colorBy !== "index");
    tagRow.toggleClass("is-hidden", s.colorBy !== "tag");
    activityRow.toggleClass("is-hidden", s.colorBy !== "activity");
  };
  radios<GalaxySettings["colorBy"]>(
    sec,
    "color-by",
    [
      { value: "folder", label: "By folder" },
      { value: "index", label: "By index vs normal" },
      { value: "tag", label: "By tag" },
      { value: "activity", label: "Activity heat" },
    ],
    s.colorBy,
    async (value) => {
      s.colorBy = value;
      syncRows();
      if (value === "activity") cb.recomputeActivityHeat();
      else cb.refreshNodeColors();
      cb.rebuildFog();
      cb.rebuildLabels();
      await save();
    },
  );
  sec.append(indexRow, tagRow, activityRow);
  syncRows();

  indexRow.createEl("label", {
    text: "Minimum connections for an index",
    cls: "galaxy-setting-label",
    attr: { for: "galaxy-index-threshold" },
  });
  const threshInput = indexRow.createEl("input", {
    cls: "galaxy-input",
    attr: { type: "number", min: 1, id: "galaxy-index-threshold" },
  });
  threshInput.value = String(s.indexDegreeThreshold);
  threshInput.onchange = async () => {
    s.indexDegreeThreshold = Math.max(1, parseInt(threshInput.value) || 10);
    cb.refreshNodeColors();
    cb.rebuildFog();
    cb.rebuildLabels();
    await save();
  };

  buildTagColorEditor(ctx, tagRow);
  buildActivityControls(ctx, activityRow);
}

function buildTagColorEditor({ s, cb, save, vaultTags }: PanelContext, tagRow: HTMLElement) {
  tagRow.createEl("div", { text: "Tag colours", cls: "galaxy-setting-label" });
  const tagList = tagRow.createDiv({ cls: "galaxy-taglist" });
  let showAll = false;

  const renderTagList = () => {
    tagList.empty();
    const entries = Object.entries(s.tagColorMap);
    const shown = showAll ? entries : entries.slice(0, TAG_PREVIEW_COUNT);
    for (const [tag, color] of shown) {
      const row = tagList.createDiv({ cls: "galaxy-tag-row" });
      const colorPicker = row.createEl("input", {
        cls: "galaxy-color-input",
        attr: { type: "color", "aria-label": `Colour for ${tag}` },
      });
      colorPicker.value = color;
      colorPicker.onchange = async () => {
        s.tagColorMap[tag] = colorPicker.value;
        cb.refreshNodeColors();
        cb.rebuildFog();
        await save();
      };
      row.createEl("span", { text: tag, cls: "galaxy-tag-name" });
      const removeBtn = row.createEl("button", {
        cls: "galaxy-icon-btn",
        attr: { "aria-label": `Remove ${tag}` },
      });
      setIcon(removeBtn, "x");
      removeBtn.onclick = async () => {
        s.tagColorMap = Object.fromEntries(entries.filter(([key]) => key !== tag));
        renderTagList();
        cb.refreshNodeColors();
        cb.rebuildFog();
        await save();
      };
    }
    if (entries.length > TAG_PREVIEW_COUNT) {
      const more = tagList.createEl("button", {
        text: showAll ? "Show fewer" : `Show all ${entries.length}`,
        cls: "galaxy-text-btn",
      });
      more.onclick = () => {
        showAll = !showAll;
        renderTagList();
      };
    }
  };
  renderTagList();

  const addRow = tagRow.createDiv({ cls: "galaxy-add-row" });
  const newTagInput = addRow.createEl("input", {
    cls: "galaxy-input",
    attr: { type: "text", placeholder: "Tag name", "aria-label": "Tag name" },
  });
  const dropdown = addRow.createDiv({ cls: "galaxy-suggestions" });
  attachTagSuggestions(newTagInput, dropdown, vaultTags);
  const newTagColor = addRow.createEl("input", {
    cls: "galaxy-color-input",
    attr: { type: "color", "aria-label": "Colour for the new tag" },
  });
  newTagColor.value = "#4fc3f7";
  const addTagBtn = addRow.createEl("button", { text: "Add" });
  addTagBtn.onclick = async () => {
    const tag = newTagInput.value.trim();
    if (!tag) return;
    s.tagColorMap[tag] = newTagColor.value;
    newTagInput.value = "";
    renderTagList();
    cb.refreshNodeColors();
    cb.rebuildFog();
    await save();
  };
}

function attachTagSuggestions(input: HTMLInputElement, dropdown: HTMLElement, vaultTags: string[]) {
  let selected = -1;
  let active: string[] = [];

  const highlight = () => {
    Array.from(dropdown.children).forEach((item, index) => {
      (item as HTMLElement).toggleClass("is-selected", index === selected);
    });
  };
  const hide = () => {
    dropdown.removeClass("is-open");
    dropdown.empty();
    active = [];
    selected = -1;
  };
  const choose = (tag: string) => {
    input.value = tag;
    hide();
  };
  const render = () => {
    const query = input.value.trim().toLowerCase();
    active = query
      ? vaultTags.filter((tag) => tag.toLowerCase().includes(query)).slice(0, SUGGESTION_MAX)
      : [];
    if (active.length === 0) {
      hide();
      return;
    }
    dropdown.empty();
    dropdown.addClass("is-open");
    selected = 0;
    for (const tag of active) {
      const item = dropdown.createDiv({ text: tag, cls: "galaxy-suggestion-item" });
      item.onmouseenter = () => {
        selected = active.indexOf(tag);
        highlight();
      };
      item.onmousedown = (evt) => {
        evt.preventDefault();
        choose(tag);
      };
    }
    highlight();
  };

  input.oninput = render;
  input.onkeydown = (evt) => {
    if (!dropdown.hasClass("is-open")) return;
    if (evt.key === "ArrowDown") {
      evt.preventDefault();
      selected = (selected + 1) % active.length;
      highlight();
    } else if (evt.key === "ArrowUp") {
      evt.preventDefault();
      selected = (selected - 1 + active.length) % active.length;
      highlight();
    } else if (evt.key === "Enter" && selected >= 0 && active[selected]) {
      evt.preventDefault();
      choose(active[selected]);
    } else if (evt.key === "Escape") {
      evt.preventDefault();
      hide();
    }
  };
  input.onblur = () => window.setTimeout(hide, 100);
}

function buildActivityControls({ s, cb, save, slider, radios }: PanelContext, activityRow: HTMLElement) {
  slider(activityRow, {
    label: "Activity window (days)",
    key: "activityWindowDays",
    min: 7,
    max: 365,
    step: 1,
    format: whole,
    onInput: () => cb.recomputeActivityHeat(),
  });
  activityRow.createEl("div", {
    text: "Index heat counts notes added to the cluster within this window.",
    cls: "galaxy-setting-desc",
  });
  activityRow.createEl("div", { text: "Leaf note heat based on", cls: "galaxy-setting-label" });
  radios<GalaxySettings["activityLeafDateField"]>(
    activityRow,
    "leaf-date-field",
    [
      { value: "mtime", label: "Last modified" },
      { value: "ctime", label: "Created" },
    ],
    s.activityLeafDateField,
    async (value) => {
      s.activityLeafDateField = value;
      cb.recomputeActivityHeat();
      await save();
    },
  );
}

function sectionLinks({ cb, section, slider }: PanelContext) {
  const sec = section("Links");
  const onInput = () => cb.refreshLinkColors();
  slider(sec, {
    label: "Opacity",
    key: "linkOpacityDefault",
    min: 0,
    max: 1,
    step: 0.01,
    format: twoDecimals,
    onInput,
  });
  slider(sec, {
    label: "Highlighted opacity",
    key: "linkOpacityHighlight",
    min: 0,
    max: 1,
    step: 0.01,
    format: twoDecimals,
    onInput,
  });
  slider(sec, {
    label: "Dimmed opacity",
    key: "linkOpacityDim",
    min: 0,
    max: 1,
    step: 0.01,
    format: twoDecimals,
    onInput,
  });
}

function sectionClouds({ s, cb, save, section, slider, radios }: PanelContext) {
  const sec = section("Neighbourhood clouds");
  const toggleRow = sec.createEl("label", { cls: "galaxy-choice-row" });
  const check = toggleRow.createEl("input", { attr: { type: "checkbox" } });
  check.checked = s.fogEnabled;
  toggleRow.createEl("span", { text: "Show clouds behind hubs" });
  check.onchange = async () => {
    s.fogEnabled = check.checked;
    cb.rebuildFog();
    await save();
  };
  radios<GalaxySettings["fogMode"]>(
    sec,
    "fog-mode",
    [
      { value: "color", label: "Hub colour" },
      { value: "heat", label: "Heat by connections" },
    ],
    s.fogMode,
    async (value) => {
      s.fogMode = value;
      cb.rebuildFog();
      await save();
    },
  );
  slider(sec, {
    label: "Cloud opacity",
    key: "fogMaxOpacity",
    min: 0,
    max: 0.6,
    step: 0.02,
    format: twoDecimals,
    onInput: () => cb.rebuildFog(),
  });
}

function sectionTemplate({ s, save, section }: PanelContext) {
  const sec = section("Note template");
  const desc = sec.createEl("div", { cls: "galaxy-setting-desc galaxy-setting-desc--above" });
  desc.appendText("Variables: ");
  for (const variable of ["{{date}}", "{{index}}", "{{title}}", "{{folder}}"]) {
    desc.createEl("code", { text: variable });
    desc.appendText(" ");
  }
  const textarea = sec.createEl("textarea", {
    cls: "galaxy-input galaxy-template-textarea",
    attr: { rows: 9, "aria-label": "Note template" },
  });
  textarea.value = s.noteTemplate;
  textarea.onchange = async () => {
    s.noteTemplate = textarea.value;
    await save();
  };
  const resetBtn = sec.createEl("button", { text: "Reset template", cls: "galaxy-inline-btn" });
  resetBtn.onclick = async () => {
    s.noteTemplate = DEFAULT_SETTINGS.noteTemplate;
    textarea.value = s.noteTemplate;
    await save();
  };
}

function sectionPhysics({ cb, section, slider }: PanelContext) {
  const sec = section("Physics");
  const onInput = () => cb.refreshForces();
  slider(sec, {
    label: "Repel force",
    key: "repelForce",
    min: -300,
    max: 0,
    step: 5,
    format: whole,
    onInput,
  });
  slider(sec, {
    label: "Link force",
    key: "linkForce",
    min: 0,
    max: 2,
    step: 0.05,
    format: twoDecimals,
    onInput,
  });
  slider(sec, {
    label: "Link distance",
    key: "linkDistance",
    min: 5,
    max: 300,
    step: 5,
    format: whole,
    onInput,
  });
  slider(sec, {
    label: "Center gravity",
    key: "centerGravity",
    min: 0,
    max: 0.1,
    step: 0.002,
    format: (v) => v.toFixed(3),
    onInput,
  });
}

function sectionLabels({ cb, section, slider }: PanelContext) {
  const sec = section("Labels");
  slider(sec, {
    label: "Hub labels always shown",
    key: "topLabelCount",
    min: 0,
    max: 30,
    step: 1,
    format: whole,
    onInput: () => cb.rebuildLabels(),
  });
  sec.createEl("div", {
    text: "Nearby notes are labelled automatically as you zoom in.",
    cls: "galaxy-setting-desc",
  });
  slider(sec, {
    label: "Hide hub labels beyond",
    key: "labelHideDistance",
    min: 500,
    max: 8000,
    step: 100,
    format: whole,
  });
}
