import { showToast } from "./Toast";

export interface SettingsValues {
  theme: "system" | "light" | "dark";
  editorFontSize: number;
  editorLineHeight: number;
  editorMaxWidth: number;
  trashRetentionDays: number;
  showToolbar: boolean;
}

const DEFAULTS: SettingsValues = {
  theme: "system",
  editorFontSize: 15,
  editorLineHeight: 1.6,
  editorMaxWidth: 720,
  trashRetentionDays: 30,
  showToolbar: true,
};

const STORAGE_KEY = "jotter-settings";

export function loadSettings(): SettingsValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveSettings(settings: SettingsValues): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function applySettings(settings: SettingsValues): void {
  const root = document.documentElement;

  // Theme
  root.removeAttribute("data-theme");
  if (settings.theme !== "system") {
    root.setAttribute("data-theme", settings.theme);
  }

  // Editor styles
  root.style.setProperty("--editor-font-size", `${settings.editorFontSize}px`);
  root.style.setProperty("--editor-line-height", String(settings.editorLineHeight));
  root.style.setProperty("--editor-max-width", `${settings.editorMaxWidth}px`);

  // Toolbar visibility
  const toolbar = document.querySelector(".editor-toolbar") as HTMLElement | null;
  if (toolbar) toolbar.style.display = settings.showToolbar ? "" : "none";
}

export interface SettingsPanelOptions {
  onExportWorkspace: () => void;
  onImportWorkspace: (file: File) => void;
  onClearAllData: () => void;
  onShowWelcome: () => void;
  onSettingsChange: (settings: SettingsValues) => void;
}

export class SettingsPanel {
  readonly el: HTMLElement;
  private backdropEl: HTMLElement;
  private panelEl: HTMLElement;
  private settings: SettingsValues;
  private options: SettingsPanelOptions;
  private open = false;

  constructor(options: SettingsPanelOptions) {
    this.options = options;
    this.settings = loadSettings();

    // Backdrop
    this.backdropEl = document.createElement("div");
    this.backdropEl.className = "settings-backdrop";
    this.backdropEl.addEventListener("click", () => this.close());

    // Panel
    this.panelEl = document.createElement("div");
    this.panelEl.className = "settings-panel";

    // Container
    this.el = document.createElement("div");
    this.el.className = "settings-container";
    this.el.append(this.backdropEl, this.panelEl);

    this.render();
  }

  private render(): void {
    this.panelEl.innerHTML = "";

    // Header
    const header = document.createElement("div");
    header.className = "settings-header";
    const title = document.createElement("span");
    title.textContent = "Settings";
    const closeBtn = document.createElement("button");
    closeBtn.className = "settings-close-btn";
    closeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/></svg>`;
    closeBtn.addEventListener("click", () => this.close());
    header.append(title, closeBtn);

    // Sections
    const body = document.createElement("div");
    body.className = "settings-body";

    // -- Appearance --
    body.appendChild(this.sectionHeader("Appearance"));

    body.appendChild(this.selectRow("Theme", "theme", [
      { value: "system", label: "System" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ]));

    body.appendChild(this.toggleRow("Show formatting toolbar", "showToolbar"));

    // -- Editor --
    body.appendChild(this.sectionHeader("Editor"));

    body.appendChild(this.rangeRow("Font size", "editorFontSize", 12, 24, 1, "px"));
    body.appendChild(this.rangeRow("Line height", "editorLineHeight", 1.2, 2.2, 0.1, ""));
    body.appendChild(this.rangeRow("Content width", "editorMaxWidth", 500, 1200, 20, "px"));
    // -- Saving --
    body.appendChild(this.sectionHeader("Saving"));

    body.appendChild(this.selectRow("Trash retention", "trashRetentionDays", [
      { value: "7", label: "7 days" },
      { value: "30", label: "30 days (default)" },
      { value: "90", label: "90 days" },
      { value: "365", label: "1 year" },
      { value: "0", label: "Never auto-delete" },
    ]));

    // -- Data --
    body.appendChild(this.sectionHeader("Data"));

    body.appendChild(this.actionRow(
      "Export workspace",
      "Download all notes, files, and settings as a .zip",
      "Export",
      () => { this.options.onExportWorkspace(); this.close(); }
    ));

    body.appendChild(this.actionRow(
      "Import workspace",
      "Restore from a .zip export (additive — keeps existing notes)",
      "Import",
      () => { this.openImportPicker(); }
    ));

    body.appendChild(this.actionRow(
      "Clear all data",
      "Permanently delete all notes and files",
      "Clear",
      () => {
        if (confirm("This will permanently delete ALL notes and files. This cannot be undone. Continue?")) {
          this.options.onClearAllData();
          this.close();
        }
      },
      true
    ));

    // -- About --
    body.appendChild(this.sectionHeader("About"));

    body.appendChild(this.actionRow(
      "Jotter",
      "Everything stays in your browser",
      "Welcome page",
      () => { this.options.onShowWelcome(); this.close(); }
    ));

    // -- Keyboard shortcuts --
    body.appendChild(this.sectionHeader("Keyboard Shortcuts"));
    const shortcuts = [
      ["New note", "Cmd/Ctrl + N"],
      ["Search", "Cmd/Ctrl + Shift + F"],
      ["Export workspace", "Cmd/Ctrl + Shift + E"],
      ["Bold", "Cmd/Ctrl + B"],
      ["Italic", "Cmd/Ctrl + I"],
    ];
    for (const [action, keys] of shortcuts) {
      const row = document.createElement("div");
      row.className = "settings-row";
      row.innerHTML = `<span>${action}</span><kbd class="settings-kbd">${keys}</kbd>`;
      body.appendChild(row);
    }

    this.panelEl.append(header, body);
  }

  private sectionHeader(text: string): HTMLElement {
    const el = document.createElement("div");
    el.className = "settings-section-header";
    el.textContent = text;
    return el;
  }

  private selectRow(label: string, key: keyof SettingsValues, opts: { value: string; label: string }[]): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row";

    const lbl = document.createElement("span");
    lbl.textContent = label;

    const select = document.createElement("select");
    select.className = "settings-select";
    for (const o of opts) {
      const option = document.createElement("option");
      option.value = o.value;
      option.textContent = o.label;
      if (String(this.settings[key]) === o.value) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      const val = select.value;
      if (key === "trashRetentionDays") {
        (this.settings as any)[key] = parseInt(val, 10);
      } else {
        (this.settings as any)[key] = val;
      }
      this.save();
    });

    row.append(lbl, select);
    return row;
  }

  private toggleRow(label: string, key: keyof SettingsValues): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row";

    const lbl = document.createElement("span");
    lbl.textContent = label;

    const toggle = document.createElement("button");
    toggle.className = `settings-toggle ${this.settings[key] ? "on" : ""}`;
    toggle.innerHTML = `<span class="settings-toggle-knob"></span>`;
    toggle.addEventListener("click", () => {
      (this.settings as any)[key] = !(this.settings as any)[key];
      toggle.classList.toggle("on", this.settings[key] as boolean);
      this.save();
    });

    row.append(lbl, toggle);
    return row;
  }

  private rangeRow(label: string, key: keyof SettingsValues, min: number, max: number, step: number, unit: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row settings-row-range";

    const top = document.createElement("div");
    top.className = "settings-row-top";
    const lbl = document.createElement("span");
    lbl.textContent = label;
    const val = document.createElement("span");
    val.className = "settings-muted";
    val.textContent = `${this.settings[key]}${unit}`;
    top.append(lbl, val);

    const range = document.createElement("input");
    range.type = "range";
    range.className = "settings-range";
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(this.settings[key]);
    range.addEventListener("input", () => {
      const v = parseFloat(range.value);
      (this.settings as any)[key] = v;
      val.textContent = `${v}${unit}`;
      this.save();
    });

    row.append(top, range);
    return row;
  }

  private actionRow(label: string, desc: string, btnText: string, onClick: () => void, danger = false): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row settings-row-action";

    const info = document.createElement("div");
    const lbl = document.createElement("div");
    lbl.textContent = label;
    const d = document.createElement("div");
    d.className = "settings-muted";
    d.textContent = desc;
    info.append(lbl, d);

    const btn = document.createElement("button");
    btn.className = `settings-action-btn${danger ? " danger" : ""}`;
    btn.textContent = btnText;
    btn.addEventListener("click", onClick);

    row.append(info, btn);
    return row;
  }

  private openImportPicker(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.addEventListener("change", () => {
      if (input.files && input.files[0]) {
        this.options.onImportWorkspace(input.files[0]);
        this.close();
      }
    });
    input.click();
  }

  private save(): void {
    saveSettings(this.settings);
    applySettings(this.settings);
    this.options.onSettingsChange(this.settings);
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.settings = loadSettings();
    this.render();
    document.body.appendChild(this.el);
    requestAnimationFrame(() => {
      this.el.classList.add("open");
    });
  }

  close(): void {
    this.open = false;
    this.el.classList.remove("open");
    this.el.addEventListener("transitionend", () => {
      if (!this.open) this.el.remove();
    }, { once: true });
    setTimeout(() => { if (!this.open && this.el.parentNode) this.el.remove(); }, 300);
  }
}
