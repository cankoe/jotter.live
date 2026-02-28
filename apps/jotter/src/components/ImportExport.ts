import { showToast } from "./Toast";

export interface ImportExportOptions {
  onExportAll: () => Promise<void>;
  onImportFiles: (files: FileList) => Promise<void>;
}

export class ImportExport {
  private options: ImportExportOptions;

  constructor(options: ImportExportOptions) {
    this.options = options;
  }

  showExportDialog(): void {
    // For now, just trigger export all
    this.options.onExportAll().catch((err) => {
      console.error("Export failed:", err);
      showToast({ message: "Export failed" });
    });
  }

  showImportDialog(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".md,.zip";
    input.addEventListener("change", async () => {
      if (input.files && input.files.length > 0) {
        try {
          await this.options.onImportFiles(input.files);
          showToast({ message: `Imported ${input.files.length} file(s)` });
        } catch (err) {
          console.error("Import failed:", err);
          showToast({ message: "Import failed" });
        }
      }
    });
    input.click();
  }
}
