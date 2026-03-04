import type { ImageStore, FileMeta } from "../storage/images";

export interface AttachmentsPaneOptions {
  fileStore: ImageStore;
  onInsertFile: (markdown: string) => void;
  onFileAdded?: (filename: string) => void;
  onDeleteFile?: (filename: string) => Promise<void>;
  onFilesDeleted?: () => void;
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

const isMobile = () => window.matchMedia("(max-width: 640px)").matches;

export class AttachmentsPane {
  readonly el: HTMLElement;
  private gridEl: HTMLElement;
  private searchInput: HTMLInputElement;
  private uploadAreaEl: HTMLElement;
  private options: AttachmentsPaneOptions;
  private blobUrls: string[] = [];
  private allFiles: FileMeta[] = [];
  private searchQuery = "";
  private open: boolean;

  private selectionMode = false;
  private selectedFiles = new Set<string>();
  private selectBtn: HTMLButtonElement;
  private selectionBarEl: HTMLElement;

  constructor(options: AttachmentsPaneOptions) {
    this.options = options;
    this.open = localStorage.getItem("jotter-files-open") === "1";
    this.el = document.createElement("aside");
    this.el.className = `attachments-pane${this.open ? " open" : ""}`;

    // Search bar with select button (matches sidebar pattern)
    const searchWrap = document.createElement("div");
    searchWrap.className = "attachments-search";
    this.searchInput = document.createElement("input");
    this.searchInput.type = "text";
    this.searchInput.placeholder = "Search files...";
    this.searchInput.setAttribute("aria-label", "Search files");
    this.searchInput.addEventListener("input", () => {
      this.searchQuery = this.searchInput.value;
      this.renderGrid();
    });

    this.selectBtn = document.createElement("button");
    this.selectBtn.className = "sidebar-new-btn";
    this.selectBtn.title = "Select files";
    this.selectBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`;
    this.selectBtn.addEventListener("click", () => this.enterSelectionMode());

    searchWrap.append(this.searchInput, this.selectBtn);

    // Upload area: drag-drop zone on desktop, button on mobile
    this.uploadAreaEl = document.createElement("div");
    this.uploadAreaEl.className = "attachments-upload-area";
    this.updateUploadArea();
    this.uploadAreaEl.addEventListener("click", () => this.openFilePicker());

    // Drag-drop on upload area
    this.uploadAreaEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      this.uploadAreaEl.classList.add("drag-over");
    });
    this.uploadAreaEl.addEventListener("dragleave", () => {
      this.uploadAreaEl.classList.remove("drag-over");
    });
    this.uploadAreaEl.addEventListener("drop", async (e) => {
      e.preventDefault();
      this.uploadAreaEl.classList.remove("drag-over");
      const files = e.dataTransfer?.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filename = await this.options.fileStore.store(file, file.name);
        this.options.onFileAdded?.(filename);
      }
      this.refresh();
    });

    // Grid
    this.gridEl = document.createElement("div");
    this.gridEl.className = "attachments-grid";

    // Selection bar
    this.selectionBarEl = document.createElement("div");
    this.selectionBarEl.className = "attachments-selection-bar";
    this.selectionBarEl.style.display = "none";

    this.el.append(searchWrap, this.uploadAreaEl, this.gridEl, this.selectionBarEl);
  }

  private updateUploadArea(): void {
    if (isMobile()) {
      this.uploadAreaEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="3" x2="9" y2="15"/><line x1="3" y1="9" x2="15" y2="9"/></svg> Add Files`;
      this.uploadAreaEl.classList.add("mobile");
    } else {
      this.uploadAreaEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span>Drop files here or click to upload</span>`;
      this.uploadAreaEl.classList.remove("mobile");
    }
  }

  private enterSelectionMode(): void {
    this.selectionMode = true;
    this.selectedFiles.clear();
    this.renderGrid();
    this.renderSelectionBar();
  }

  private exitSelectionMode(): void {
    this.selectionMode = false;
    this.selectedFiles.clear();
    this.renderGrid();
    this.renderSelectionBar();
  }

  private toggleFileSelection(filename: string): void {
    if (this.selectedFiles.has(filename)) {
      this.selectedFiles.delete(filename);
    } else {
      this.selectedFiles.add(filename);
    }
    this.renderGrid();
    this.renderSelectionBar();
  }

  private async deleteSelectedFiles(): Promise<void> {
    for (const filename of this.selectedFiles) {
      await this.options.fileStore.delete(filename);
      await this.options.onDeleteFile?.(filename);
    }
    this.exitSelectionMode();
    await this.refresh();
    this.options.onFilesDeleted?.();
  }

  private renderSelectionBar(): void {
    if (!this.selectionMode) {
      this.selectionBarEl.style.display = "none";
      this.selectBtn.style.display = "";
      return;
    }
    this.selectBtn.style.display = "none";
    this.selectionBarEl.style.display = "";
    this.selectionBarEl.innerHTML = "";

    const countSpan = document.createElement("span");
    countSpan.className = "attachments-selection-count";
    countSpan.textContent = `${this.selectedFiles.size} selected`;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "attachments-selection-btn danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.disabled = this.selectedFiles.size === 0;
    deleteBtn.addEventListener("click", () => this.deleteSelectedFiles());

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "attachments-selection-btn";
    cancelBtn.textContent = "Done";
    cancelBtn.style.fontWeight = "600";
    cancelBtn.addEventListener("click", () => this.exitSelectionMode());

    this.selectionBarEl.append(countSpan, deleteBtn, cancelBtn);
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
    this.updateUploadArea();
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
      thumb.className = `attachment-thumb${this.selectedFiles.has(filename) ? " selected" : ""}`;
      thumb.title = this.selectionMode ? "Click to select" : "Click to insert";

      if (this.selectionMode) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "attachment-checkbox";
        checkbox.checked = this.selectedFiles.has(filename);
        checkbox.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleFileSelection(filename);
        });
        thumb.appendChild(checkbox);
      }

      if (isImageFile(filename)) {
        this.loadImageThumb(thumb, filename);
      } else {
        thumb.classList.add("attachment-file");
        const icon = document.createElement("div");
        icon.className = "attachment-file-icon";
        icon.textContent = fileIcon(filename);
        const name = document.createElement("div");
        name.className = "attachment-file-name";
        name.textContent = filename;
        thumb.append(icon, name);
      }

      if (this.selectionMode) {
        thumb.addEventListener("click", () => this.toggleFileSelection(filename));
      } else {
        if (isImageFile(filename)) {
          thumb.addEventListener("click", () => {
            this.options.onInsertFile(`![image](jotter-file://${filename})`);
          });
        } else {
          thumb.addEventListener("click", () => {
            const ext = filename.split(".").pop() || "";
            this.options.onInsertFile(`[${ext} file](jotter-file://${filename})`);
          });
        }
      }

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
    if (!this.open) this.exitSelectionMode();
  }

  initIfOpen(): void {
    if (this.open) this.refresh();
  }

  isOpen(): boolean {
    return this.open;
  }
}
