/**
 * Client-side file system service using the File System Access API.
 * Hybrid approach:
 *  - Primary: showDirectoryPicker() for full read access
 *  - Fallback: <input webkitdirectory> for read-only (works with Downloads, Documents, etc.)
 *
 * This service is READ-ONLY — no write operations.
 */

/* Type augmentation for File System Access API */
declare global {
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }
  interface Window {
    showDirectoryPicker(options?: { mode?: string }): Promise<FileSystemDirectoryHandle>;
  }
}

/* ─── Types ─── */

export interface FileMetadata {
  name: string;
  slug: string;
  size: number;
  modifiedAt: string;
  excerpt: string;
}

export interface FileContent {
  slug: string;
  content: string;
  size: number;
  modifiedAt: string;
}

/** Represents the source of files — either a directory handle or raw file data. */
export type DirectorySource =
  | { type: "handle"; handle: FileSystemDirectoryHandle; name: string }
  | { type: "files"; files: Map<string, File>; name: string };

/* ─── Directory Access ─── */

/**
 * Opens the native directory picker (showDirectoryPicker).
 * Returns a DirectorySource with read capabilities.
 * Throws on blocked directories or user cancel.
 */
export async function pickDirectory(): Promise<DirectorySource> {
  try {
    const handle = await window.showDirectoryPicker();
    return { type: "handle", handle, name: handle.name };
  } catch (err) {
    const error = err as Error;
    if (error.name === "AbortError") throw error;
    if (error.name === "SecurityError" || error.message?.includes("system")) {
      throw new Error("BLOCKED_DIRECTORY");
    }
    throw error;
  }
}

/**
 * Reads files from a native file input with webkitdirectory.
 * Returns a DirectorySource with read-only capabilities.
 * Works with ALL directories including Downloads, Documents, etc.
 */
export function filesFromInput(fileList: FileList): DirectorySource {
  const filesMap = new Map<string, File>();
  let dirName = "";

  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (file.name.endsWith(".html") || file.name.endsWith(".htm")) {
      filesMap.set(file.name, file);
    }
    // Extract directory name from webkitRelativePath (e.g. "my-folder/file.html")
    if (!dirName && file.webkitRelativePath) {
      dirName = file.webkitRelativePath.split("/")[0];
    }
  }

  return { type: "files", files: filesMap, name: dirName || "Diretório" };
}

/* ─── File Operations ─── */

/**
 * Lists all .html/.htm files with metadata.
 */
export async function listFiles(source: DirectorySource): Promise<FileMetadata[]> {
  const files: FileMetadata[] = [];

  if (source.type === "handle") {
    for await (const [name, handle] of source.handle.entries()) {
      if (handle.kind !== "file" || (!name.endsWith(".html") && !name.endsWith(".htm"))) continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      const content = await file.text();
      files.push(buildMetadata(name, file.size, file.lastModified, content));
    }
  } else {
    for (const [name, file] of source.files.entries()) {
      const content = await file.text();
      files.push(buildMetadata(name, file.size, file.lastModified, content));
    }
  }

  files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  return files;
}

function buildMetadata(
  filename: string,
  size: number,
  lastModified: number,
  content: string,
): FileMetadata {
  // Extract <title> from HTML
  const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : filename;

  // Extract <meta name="description"> or first text content
  let excerpt = "";
  const metaDescMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i);
  if (metaDescMatch) {
    excerpt = metaDescMatch[1].trim().substring(0, 150);
  } else {
    // Fallback: strip tags and get first 150 chars of body text
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const raw = (bodyMatch ? bodyMatch[1] : content)
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    excerpt = raw.substring(0, 150);
  }

  return {
    name: title,
    slug: filename.replace(/\.html?$/i, ""),
    size,
    modifiedAt: new Date(lastModified).toISOString(),
    excerpt,
  };
}

/**
 * Reads a single .html file by slug.
 */
export async function readFile(
  source: DirectorySource,
  slug: string,
): Promise<FileContent> {
  // Try both .html and .htm extensions
  const candidates = [`${slug}.html`, `${slug}.htm`];

  if (source.type === "handle") {
    for (const filename of candidates) {
      try {
        const fileHandle = await source.handle.getFileHandle(filename);
        const file = await fileHandle.getFile();
        const content = await file.text();
        return { slug, content, size: file.size, modifiedAt: new Date(file.lastModified).toISOString() };
      } catch {
        continue;
      }
    }
    throw new Error("File not found");
  } else {
    for (const filename of candidates) {
      const file = source.files.get(filename);
      if (file) {
        const content = await file.text();
        return { slug, content, size: file.size, modifiedAt: new Date(file.lastModified).toISOString() };
      }
    }
    throw new Error("File not found");
  }
}
