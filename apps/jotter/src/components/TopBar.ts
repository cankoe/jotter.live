const ICON_PAPERCLIP = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>`;

const ICON_SETTINGS = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="2.5"/><path d="M14.7 11.1a1.2 1.2 0 00.2 1.3l.04.04a1.44 1.44 0 11-2.04 2.04l-.04-.04a1.2 1.2 0 00-1.3-.2 1.2 1.2 0 00-.72 1.1v.12a1.44 1.44 0 11-2.88 0v-.06a1.2 1.2 0 00-.78-1.1 1.2 1.2 0 00-1.3.2l-.04.04a1.44 1.44 0 11-2.04-2.04l.04-.04a1.2 1.2 0 00.2-1.3 1.2 1.2 0 00-1.1-.72H3.44a1.44 1.44 0 010-2.88h.06a1.2 1.2 0 001.1-.78 1.2 1.2 0 00-.2-1.3l-.04-.04A1.44 1.44 0 116.4 3.32l.04.04a1.2 1.2 0 001.3.2h.06a1.2 1.2 0 00.72-1.1V2.34a1.44 1.44 0 112.88 0v.06a1.2 1.2 0 00.72 1.1 1.2 1.2 0 001.3-.2l.04-.04a1.44 1.44 0 112.04 2.04l-.04.04a1.2 1.2 0 00-.2 1.3v.06a1.2 1.2 0 001.1.72h.12a1.44 1.44 0 010 2.88h-.06a1.2 1.2 0 00-1.1.72z"/></svg>`;

// Cloud icon states
const ICON_CLOUD = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></svg>`;
const ICON_CLOUD_WARN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

export type SyncStatus = "hidden" | "synced" | "syncing" | "needs-reconnect" | "error";

export interface TopBarOptions {
  onNewNote: () => void;
  onToggleSidebar: () => void;
  onToggleAttachments: () => void;
  onShowAbout: () => void;
  onShowSettings: () => void;
  onSyncClick: () => void;
}

export class TopBar {
  readonly el: HTMLElement;
  private titleEl: HTMLElement;
  private attachBtn: HTMLButtonElement;
  private syncBtn: HTMLButtonElement;
  private syncStatus: SyncStatus = "hidden";

  constructor(options: TopBarOptions) {
    this.el = document.createElement("header");
    this.el.className = "topbar";

    this.titleEl = document.createElement("span");
    this.titleEl.className = "topbar-title";
    this.titleEl.textContent = "Jotter";
    this.titleEl.addEventListener("click", options.onToggleSidebar);

    this.attachBtn = this.createBtn(ICON_PAPERCLIP, "Toggle attachments", options.onToggleAttachments);

    this.syncBtn = this.createBtn(ICON_CLOUD, "Sync", options.onSyncClick);
    this.syncBtn.className = "topbar-btn topbar-sync-btn hidden";

    const settingsBtn = this.createBtn(ICON_SETTINGS, "Settings", options.onShowSettings);

    this.el.append(this.titleEl, this.attachBtn, this.syncBtn, settingsBtn);
  }

  setSyncStatus(status: SyncStatus): void {
    this.syncStatus = status;
    this.syncBtn.classList.remove("hidden", "synced", "syncing", "needs-reconnect", "error");

    if (status === "hidden") {
      this.syncBtn.classList.add("hidden");
      return;
    }

    this.syncBtn.classList.add(status);

    switch (status) {
      case "synced":
        this.syncBtn.innerHTML = ICON_CLOUD;
        this.syncBtn.title = "Synced with Google Drive";
        break;
      case "syncing":
        this.syncBtn.innerHTML = ICON_CLOUD;
        this.syncBtn.title = "Syncing...";
        break;
      case "needs-reconnect":
        this.syncBtn.innerHTML = ICON_CLOUD_WARN;
        this.syncBtn.title = "Click to reconnect to Google Drive";
        break;
      case "error":
        this.syncBtn.innerHTML = ICON_CLOUD_WARN;
        this.syncBtn.title = "Sync error — click to retry";
        break;
    }
  }

  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  setAttachmentsActive(active: boolean): void {
    this.attachBtn.classList.toggle("active", active);
  }

  setSidebarActive(active: boolean): void {
    this.titleEl.classList.toggle("active", active);
  }

  private createBtn(iconHtml: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.className = "topbar-btn";
    btn.innerHTML = iconHtml;
    btn.title = title;
    btn.addEventListener("click", onClick);
    return btn;
  }
}
