"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  pickDirectory,
  filesFromInput,
  listFiles,
  readFile,
  type DirectorySource,
  type FileMetadata,
  type FileContent,
} from "./lib/fs-service";

/* ─── Types ─── */
interface Toast {
  message: string;
  type: "success" | "error";
}

/* ─── Helpers ─── */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/* ─── Main Page ─── */
export default function Home() {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<FileMetadata[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ─── Directory Source ─── */
  const [source, setSource] = useState<DirectorySource | null>(null);

  /* ─── Data Loading ─── */
  const loadData = useCallback(async (src: DirectorySource) => {
    setLoading(true);
    try {
      const fileList = await listFiles(src);
      setFiles(fileList);
      setFilteredFiles(fileList);
    } catch {
      showToast("Erro ao carregar arquivos", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const selectFile = useCallback(async (slug: string) => {
    if (!source) return;
    setFileLoading(true);
    try {
      const data = await readFile(source, slug);
      setSelectedFile(data);
    } catch {
      showToast("Erro ao abrir arquivo", "error");
    } finally {
      setFileLoading(false);
    }
  }, [source]);

  /* ─── Directory Selection ─── */
  const openDirectory = useCallback(async () => {
    try {
      const src = await pickDirectory();
      setSource(src);
      setSelectedFile(null);
      showToast(`Diretório "${src.name}" aberto`, "success");
    } catch (err) {
      const error = err as Error;
      if (error.name === "AbortError") return;
      if (error.message === "BLOCKED_DIRECTORY") {
        fileInputRef.current?.click();
      } else {
        showToast("Erro ao selecionar diretório", "error");
      }
    }
  }, []);

  const handleFallbackInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const src = filesFromInput(fileList);
    setSource(src);
    setSelectedFile(null);
    showToast(
      `Diretório "${src.name}" aberto${src.type === "files" ? ` (${src.files.size} arquivo(s) HTML)` : ""}`,
      "success",
      5000,
    );

    e.target.value = "";
  }, []);

  const changeDir = useCallback(() => {
    setSource(null);
    setSelectedFile(null);
    setFiles([]);
    setFilteredFiles([]);
  }, []);

  /* ─── Open in new tab ─── */
  const openInNewTab = useCallback(() => {
    if (!selectedFile) return;
    const blob = new Blob([selectedFile.content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    // Revoke after a short delay to avoid premature cleanup
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [selectedFile]);

  /* ─── Search ─── */
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      searchTimeoutRef.current = setTimeout(() => {
        if (!query.trim()) {
          setFilteredFiles(files);
          return;
        }
        const q = query.toLowerCase();
        const filtered = files.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.slug.toLowerCase().includes(q) ||
            f.excerpt.toLowerCase().includes(q)
        );
        setFilteredFiles(filtered);
      }, 300);
    },
    [files]
  );

  /* ─── Toast ─── */
  const showToast = (message: string, type: "success" | "error", duration = 3000) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), duration);
  };

  /* ─── Effects ─── */
  useEffect(() => {
    if (source) loadData(source);
  }, [source, loadData]);

  /* ─── Hidden file input for fallback ─── */
  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      // @ts-expect-error — webkitdirectory is a non-standard attribute
      webkitdirectory="true"
      multiple
      style={{ display: "none" }}
      onChange={handleFallbackInput}
    />
  );

  /* ─── Directory Picker Screen ─── */
  if (!source) {
    return (
      <div className="dir-picker-screen">
        {hiddenInput}
        <div className="dir-picker-card">
          <div className="dir-picker-icon">
            <span className="material-symbols-outlined">web</span>
          </div>
          <h1 className="dir-picker-title">HTML Viewer</h1>
          <p className="dir-picker-desc">
            Selecione o diretório que contém seus protótipos HTML para começar.
          </p>
          <button
            id="btn-open-dir"
            className="btn btn-primary btn-lg"
            onClick={openDirectory}
          >
            <span className="material-symbols-outlined">folder_open</span>
            Selecionar Diretório
          </button>
          <button
            id="btn-open-fallback"
            className="btn btn-lg"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="material-symbols-outlined">upload_file</span>
            Carregar Arquivos
          </button>
          <p className="dir-picker-hint">
            Use &quot;Carregar Arquivos&quot; para pastas do sistema como Downloads e Documentos.
          </p>
        </div>

        {toast && (
          <div className={`toast ${toast.type}`}>
            <span className="material-symbols-outlined">
              {toast.type === "success" ? "check_circle" : "error"}
            </span>
            {toast.message}
          </div>
        )}
      </div>
    );
  }

  /* ─── Main App ─── */
  return (
    <div className="app-layout">
      {hiddenInput}

      {/* ═══ SIDEBAR ═══ */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <span className="material-symbols-outlined">web</span>
            <h1>HTML Viewer</h1>
          </div>
          <div className="search-wrapper">
            <span className="material-symbols-outlined">search</span>
            <input
              id="search-input"
              type="text"
              className="search-input"
              placeholder="Buscar por nome ou conteúdo..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="sidebar-toolbar">
          <span className="file-count">
            {filteredFiles.length} protótipo{filteredFiles.length !== 1 ? "s" : ""}
          </span>
          <div className="toolbar-actions">
            <button
              id="btn-change-dir"
              className="toolbar-btn"
              onClick={changeDir}
              title="Alterar diretório"
            >
              <span className="material-symbols-outlined icon-sm">folder_open</span>
            </button>
          </div>
        </div>

        {/* Directory indicator */}
        <div className="dir-indicator" title={source.name}>
          <span className="material-symbols-outlined icon-sm">folder</span>
          <span className="dir-indicator-path">{source.name}</span>
        </div>

        <div className="file-list">
          {loading ? (
            <div className="loading-spinner">
              <div className="spinner"></div>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "36px" }}>
                search_off
              </span>
              <p>Nenhum arquivo encontrado</p>
            </div>
          ) : (
            filteredFiles.map((file) => (
              <div
                key={file.slug}
                id={`file-${file.slug}`}
                className={`file-item${selectedFile?.slug === file.slug ? " active" : ""}`}
                onClick={() => selectFile(file.slug)}
              >
                <span className="material-symbols-outlined file-icon">code</span>
                <div className="file-info">
                  <div className="file-name">{file.name}</div>
                  <div className="file-meta">
                    <span>{formatDate(file.modifiedAt)}</span>
                    <span>·</span>
                    <span>{formatSize(file.size)}</span>
                  </div>
                  {file.excerpt && <div className="file-excerpt">{file.excerpt}</div>}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ═══ MAIN CONTENT ═══ */}
      <main className="main-content">
        {selectedFile ? (
          <>
            <div className="content-header">
              <h2 className="content-title">
                {files.find((f) => f.slug === selectedFile.slug)?.name || selectedFile.slug}
              </h2>
              <div className="content-actions">
                <button id="btn-open-tab" className="btn" onClick={openInNewTab}>
                  <span className="material-symbols-outlined">open_in_new</span>
                  Abrir em nova aba
                </button>
              </div>
            </div>

            {fileLoading ? (
              <div className="loading-spinner" style={{ flex: 1 }}>
                <div className="spinner"></div>
              </div>
            ) : (
              <div className="preview-container fade-in">
                <iframe
                  id="prototype-preview"
                  className="prototype-iframe"
                  srcDoc={selectedFile.content}
                  title={files.find((f) => f.slug === selectedFile.slug)?.name || selectedFile.slug}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <span className="material-symbols-outlined">web</span>
            <h3>Selecione um protótipo</h3>
            <p>
              Escolha um arquivo HTML na barra lateral para visualizar o protótipo.
            </p>
          </div>
        )}
      </main>

      {/* ═══ TOAST ═══ */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          <span className="material-symbols-outlined">
            {toast.type === "success" ? "check_circle" : "error"}
          </span>
          {toast.message}
        </div>
      )}
    </div>
  );
}
