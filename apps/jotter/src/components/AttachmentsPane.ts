import type { ImageStore, FileMeta } from "../storage/images";

export interface AttachmentsPaneOptions {
  fileStore: ImageStore;
  onInsertFile: (markdown: string) => void;
  onFileAdded?: (filename: string) => void;
}

function isImageFile(filename: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(filename);
}

function fileIcon(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const icons: Record<string, string> = {
    pdf: "\uD83D\uDCC4",
    doc: "\uD83D\uDCC3", docx: "\uD83D\uDCC3",
    xls: "\uD83D\uDCCA", xlsx: "\uD83D\uDCCA", csv: "\uD83D\uDCCA",
    ppt: "\uD83D\uDCCA", pptx: "\uD83D\uDCCA",
    zip: "\uD83D\uDCE6",
    mp3: "\uD83C\uDFB5", wav: "\uD83C\uDFB5",
    mp4: "\uD83C\uDFAC", webm: "\uD83C\uDFAC",
    txt: "\uD83D\uDCC4", json: "\uD83D\uDCC4",
  };
  return icons[ext] || "\uD83D\uDCCE";
}

function relativeTime(ts: number): string {
  if (ts === 0) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

export class AttachmentsPane {
  readonly el: HTMLElement;
  private gridEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private options: AttachmentsPaneOptions;
  private blobUrls: string[] = [];
  private allFiles: FileMeta[] = [];
  private searchQuery = "";
  private open: boolean;

  constructor(options: AttachmentsPaneOptions) {
    this.options = options;
    this.open = localStorage.getItem("jotter-files-open") === "1";
    this.el = document.createElement("aside");
    this.el.className = `attachments-pane${this.open ? " open" : ""}`;

    // Header
    const header = document.createElement("div");
    header.className = "attachments-header";
    const headerTitle = document.createElement("span");
    headerTitle.textContent = "Files";
    const addBtn = document.createElement("button");
    addBtn.className = "attachments-add-btn";
    addBtn.title = "Add file";
    addBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>`;
    addBtn.addEventListener("click", () => this.openFilePicker());
    header.append(headerTitle, addBtn);

    // Search
    const searchWrap = document.createElement("div");
    searchWrap.className = "attachments-search";
    this.searchInput = document.createElement("input");
    this.searchInput.type = "text";
    this.searchInput.placeholder = "Search files...";
    this.searchInput.addEventListener("input", () => {
      this.searchQuery = this.searchInput.value;
      this.renderGrid();
    });
    searchWrap.appendChild(this.searchInput);

    // Grid
    this.gridEl = document.createElement("div");
    this.gridEl.className = "attachments-grid";

    this.el.append(header, searchWrap, this.gridEl);
  }

  private openFilePicker(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.addEventListener("change", async () => {
      if (!input.files) return;
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const filename = await this.options.fileStore.store(file, file.name);
        this.options.onFileAdded?.(filename);
      }
      this.refresh();
    });
    input.click();
  }

  async refresh(): Promise<void> {
    this.allFiles = await this.options.fileStore.listWithMeta();
    this.renderGrid();
  }

  private renderGrid(): void {
    for (const url of this.blobUrls) URL.revokeObjectURL(url);
    this.blobUrls = [];
    this.gridEl.innerHTML = "";

    let filtered = this.allFiles;
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      filtered = this.allFiles.filter((f) => f.filename.toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "attachments-empty";
      empty.textContent = this.searchQuery ? "No matching files" : "No files yet";
      this.gridEl.appendChild(empty);
      return;
    }

    for (const meta of filtered) {
      const filename = meta.filename;
      const thumb = document.createElement("div");
      thumb.className = "attachment-thumb";
      thumb.title = "Click to insert";

      if (isImageFile(filename)) {
        this.loadImageThumb(thumb, filename);
        thumb.addEventListener("click", () => {
          this.options.onInsertFile(`![image](jotter-file://${filename})`);
        });
      } else {
        thumb.classList.add("attachment-file");
        const icon = document.createElement("div");
        icon.className = "attachment-file-icon";
        icon.textContent = fileIcon(filename);
        const name = document.createElement("div");
        name.className = "attachment-file-name";
        name.textContent = filename;
        thumb.append(icon, name);
        thumb.addEventListener("click", () => {
          const ext = filename.split(".").pop() || "";
          this.options.onInsertFile(`[${ext} file](jotter-file://${filename})`);
        });
      }

      // Date label
      if (meta.addedAt) {
        const date = document.createElement("div");
        date.className = "attachment-thumb-date";
        date.textContent = relativeTime(meta.addedAt);
        thumb.appendChild(date);
      }

      this.gridEl.appendChild(thumb);
    }
  }

  private async loadImageThumb(thumb: HTMLElement, filename: string): Promise<void> {
    const blob = await this.options.fileStore.retrieve(filename);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    this.blobUrls.push(url);
    const img = document.createElement("img");
    img.src = url;
    img.alt = filename;

    const label = document.createElement("div");
    label.className = "attachment-thumb-label";
    label.textContent = filename;

    thumb.append(img, label);
  }

  toggle(): void {
    this.open = !this.open;
    this.el.classList.toggle("open", this.open);
    localStorage.setItem("jotter-files-open", this.open ? "1" : "0");
    if (this.open) this.refresh();
  }

  /** Call after construction to load files if pane was persisted open */
  initIfOpen(): void {
    if (this.open) this.refresh();
  }

  isOpen(): boolean {
    return this.open;
  }
}
