import { showToast } from "./Toast";

const PRIVACY_POLICY = `# Privacy Policy

*Last updated: February 28, 2026*

## The short version

Jotter does not collect, store, or transmit any of your data. Everything stays in your browser.

## Data storage

All your notes, files, and settings are stored locally in your browser using IndexedDB and the Origin Private File System (OPFS). No data is sent to any server, including ours.

## No accounts

Jotter does not require or offer user accounts. There is no login, no registration, and no user profiles.

## No analytics or tracking

Jotter does not use cookies, analytics, tracking pixels, or any third-party scripts that monitor your behavior.

## No server communication

After the initial page load, Jotter works entirely offline. The only external requests are:

- Google Fonts (Instrument Serif) loaded on the landing page
- Favicon images from Google's favicon service (for URL preview chips)

## Data export

You can export all your data at any time using **Settings > Data > Export**. This creates a ZIP file containing all your notes, files, and settings.

## Data deletion

You can delete all your data at any time using **Settings > Data > Clear**. You can also clear your browser's site data for jotter.live.

## Third-party services

Jotter is hosted on Cloudflare. See [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/).

## Contact

Questions? Email [dev@jotter.live](mailto:dev@jotter.live).
`;

const TERMS_OF_SERVICE = `# Terms of Service

*Last updated: February 28, 2026*

## Acceptance of terms

By using Jotter at jotter.live, you agree to these terms.

## Description of service

Jotter is a free, browser-based notepad. It stores all data locally in your browser. Jotter does not provide cloud storage, backup services, or data synchronization.

## No warranty

Jotter is provided "as is" without warranty of any kind. We do not guarantee that the service will be uninterrupted or error-free. Browser updates or clearing site data may result in data loss.

## Data responsibility

You are solely responsible for your data. We strongly recommend using **Export Workspace** regularly to create backups.

## Acceptable use

You may use Jotter for any lawful purpose. You agree not to:

- Attempt to interfere with or disrupt the service
- Use the service to store or distribute illegal content

## Limitation of liability

To the maximum extent permitted by law, we shall not be liable for any damages arising from your use of the service.

## Open source

Jotter's source code is available at [github.com/cankoe/jotter.live](https://github.com/cankoe/jotter.live) under the MIT license.

## Contact

Questions? Email [dev@jotter.live](mailto:dev@jotter.live).
`;

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
  onCreateNote: (content: string) => void;
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

    // -- Support --
    body.appendChild(this.sectionHeader("Support"));
    body.appendChild(this.linkRow("Report a bug", "https://github.com/cankoe/jotter.live/issues"));
    body.appendChild(this.emailRow("Feature request", "dev@jotter.live"));
    body.appendChild(this.coffeeRow());

    // -- Legal --
    body.appendChild(this.sectionHeader("Legal"));
    body.appendChild(this.noteLink("Privacy Policy", PRIVACY_POLICY));
    body.appendChild(this.noteLink("Terms of Service", TERMS_OF_SERVICE));

    this.panelEl.append(header, body);
  }

  private linkRow(label: string, href: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row";
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    link.className = "settings-link";
    if (href.startsWith("http") || href.startsWith("mailto:")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    row.appendChild(link);
    return row;
  }

  private emailRow(label: string, email: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row";
    const link = document.createElement("a");
    link.href = `mailto:${email}`;
    link.className = "settings-link";
    link.textContent = `${label} (${email})`;
    link.target = "_blank";
    link.addEventListener("click", (e) => {
      // Copy email to clipboard as fallback if no mail app
      navigator.clipboard?.writeText(email).then(() => {
        showToast({ message: `${email} copied to clipboard` });
      });
    });
    row.appendChild(link);
    return row;
  }

  private coffeeRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row";
    const link = document.createElement("a");
    link.href = "https://buymeacoffee.com/cankoe";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "settings-coffee";
    link.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.057-.325-.102-.69-.25-.987-.195-.4-.597-.634-.996-.788a5.723 5.723 0 00-.626-.194c-1-.263-2.05-.36-3.077-.416a25.834 25.834 0 00-3.7.062c-.915.083-1.88.184-2.75.5-.318.116-.646.256-.888.501-.297.302-.393.77-.177 1.146.154.267.415.456.692.58.36.162.737.284 1.123.366 1.075.238 2.189.331 3.287.37 1.218.05 2.437.01 3.65-.118.299-.033.598-.073.896-.119.352-.054.578-.513.474-.834-.124-.383-.457-.531-.834-.473-.466.074-.96.108-1.382.146-1.177.08-2.358.082-3.536.006a22.228 22.228 0 01-1.157-.107c-.086-.01-.18-.025-.258-.036-.243-.036-.484-.08-.724-.13-.111-.027-.111-.185 0-.212h.005c.277-.06.557-.108.838-.147h.002c.131-.009.263-.032.394-.048a25.076 25.076 0 013.426-.12c.674.019 1.347.067 2.017.144l.228.031c.267.04.533.088.798.145.392.085.895.113 1.07.542.055.137.08.288.111.431l.319 1.484a.237.237 0 01-.199.284h-.003c-.037.006-.075.01-.112.015a36.704 36.704 0 01-4.743.295 37.059 37.059 0 01-4.699-.304c-.14-.017-.293-.042-.417-.06-.326-.048-.649-.108-.973-.161-.393-.065-.768-.032-1.123.161-.29.16-.527.404-.675.701-.154.316-.199.66-.267 1-.069.34-.176.707-.135 1.056.087.753.613 1.365 1.37 1.502a39.69 39.69 0 0011.343.376.483.483 0 01.535.53l-.071.697-1.018 9.907c-.041.41-.047.832-.125 1.237-.122.637-.553 1.028-1.182 1.171-.577.131-1.165.2-1.756.205-.656.004-1.31-.025-1.966-.022-.699.004-1.556-.06-2.095-.58-.475-.458-.54-1.174-.605-1.793l-.731-7.013-.322-3.094c-.037-.351-.286-.695-.678-.678-.336.015-.718.3-.678.679l.228 2.185.949 9.112c.147 1.344 1.174 2.068 2.446 2.272.742.12 1.503.144 2.257.156.966.016 1.942.053 2.892-.122 1.408-.258 2.465-1.198 2.616-2.657.34-3.332.683-6.663 1.024-9.995l.215-2.087a.484.484 0 01.39-.426c.402-.078.787-.212 1.074-.518.455-.488.546-1.124.385-1.766zm-1.478.772c-.145.137-.363.201-.578.233-2.416.359-4.866.54-7.308.46-1.748-.06-3.477-.254-5.207-.498-.17-.024-.353-.055-.47-.18-.22-.236-.111-.71-.054-.995.052-.26.152-.609.463-.646.484-.057 1.046.148 1.526.22.577.088 1.156.159 1.737.212 2.48.226 5.002.19 7.472-.14.45-.06.899-.13 1.345-.21.399-.072.84-.206 1.08.206.166.281.188.657.162.974a.544.544 0 01-.169.364z"/></svg> Buy the developer a coffee`;
    row.appendChild(link);
    return row;
  }

  private noteLink(label: string, content: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row";
    const btn = document.createElement("button");
    btn.className = "settings-link";
    btn.style.background = "none";
    btn.style.border = "none";
    btn.style.cursor = "pointer";
    btn.style.padding = "0";
    btn.style.font = "inherit";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      this.options.onCreateNote(content);
      this.close();
    });
    row.appendChild(btn);
    return row;
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
