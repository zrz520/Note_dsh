import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_DEPTH = 20;
const MAX_ENTRIES = 5000;
const IMAGE_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".bmp", "image/bmp"],
  [".avif", "image/avif"],
  [".ico", "image/x-icon"],
]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const messages = {
  DOCUMENT_LIBRARY_CONFIG: "文档库配置无效，请重新选择目录。",
  DOCUMENT_LIBRARY_ROOT_MISSING: "文档库目录不存在或无法访问，请重新选择目录。",
  DOCUMENT_LIBRARY_PATH: "文档路径无效或已超出当前文档库。",
  DOCUMENT_LIBRARY_NAME: "名称无效，请使用不含斜杠和控制字符的名称。",
  DOCUMENT_LIBRARY_TYPE: "文档中心目前只支持普通的 .md 文件。",
  DOCUMENT_LIBRARY_READ: "无法读取文档，请检查文件权限后重试。",
  DOCUMENT_LIBRARY_WRITE: "无法写入文档，请检查目录权限和磁盘空间。",
  DOCUMENT_LIBRARY_EXISTS: "同一位置已经存在同名文件或文件夹。",
  DOCUMENT_LIBRARY_CONFLICT: "文档已在外部修改，未覆盖原文件；当前草稿仍保留。",
  DOCUMENT_LIBRARY_ENCODING: "文档不是有效的 UTF-8 文本。",
  DOCUMENT_LIBRARY_TOO_LARGE: "单个文档不能超过 2 MiB。",
  DOCUMENT_LIBRARY_IMAGE_TOO_LARGE: "单张图片不能超过 16 MiB。",
  DOCUMENT_LIBRARY_UNSUPPORTED: "文档中心只支持 Markdown、图片和 HTML 文件。",
  DOCUMENT_LIBRARY_TOO_MANY: "文档库条目过多或目录层级过深，请缩小文档库范围。",
  DOCUMENT_LIBRARY_INPUT: "文档内容或版本信息无效。",
  DOCUMENT_LIBRARY_RENAME_ROOT: "不能重命名文档库根目录。",
};

function fail(code) { return Object.assign(new Error(messages[code]), { code }); }
function known(error, fallback) { return messages[error?.code] ? error : fail(fallback); }
function normalizeParent(value = "") { return validateRelative(value, { allowEmpty: true, extension: false }); }
function validateRelative(value, { allowEmpty = false, extension = true } = {}) {
  if (typeof value !== "string" || value.includes("\\") || value.includes("\0") || path.isAbsolute(value)) throw fail("DOCUMENT_LIBRARY_PATH");
  const normalized = value.replace(/^\.\//, "");
  if (!normalized) {
    if (allowEmpty) return "";
    throw fail("DOCUMENT_LIBRARY_PATH");
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || /[\u0000-\u001f\u007f]/.test(part))) throw fail("DOCUMENT_LIBRARY_PATH");
  if (extension && path.extname(normalized).toLowerCase() !== ".md") throw fail("DOCUMENT_LIBRARY_TYPE");
  return parts.join("/");
}
function validateName(value) {
  if (typeof value !== "string") throw fail("DOCUMENT_LIBRARY_NAME");
  const name = value.normalize("NFC").trim();
  if (!name || name === "." || name === ".." || name.length > 120 || /[\\/\u0000-\u001f\u007f]/.test(name)) throw fail("DOCUMENT_LIBRARY_NAME");
  // Keep names portable to Windows and avoid reserved device names.
  if (/[<>:"|?*]/.test(name) || /[. ]$/.test(name)) throw fail("DOCUMENT_LIBRARY_NAME");
  const stem = name.split(".")[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) throw fail("DOCUMENT_LIBRARY_NAME");
  return name;
}
function isInside(root, target) { return target === root || target.startsWith(`${root}${path.sep}`); }
function digest(bytes, metadata) { return createHash("sha256").update(`${metadata.dev}:${metadata.ino}:`).update(bytes).digest("hex"); }
function decode(bytes) {
  if (bytes.length > MAX_BYTES) throw fail("DOCUMENT_LIBRARY_TOO_LARGE");
  let content;
  try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw fail("DOCUMENT_LIBRARY_ENCODING"); }
  if (content.includes("\0")) throw fail("DOCUMENT_LIBRARY_ENCODING");
  return content;
}
async function readSnapshot(handle, relativePath) {
  const metadata = await handle.stat();
  if (!metadata.isFile()) throw fail("DOCUMENT_LIBRARY_TYPE");
  if (metadata.size > MAX_BYTES) throw fail("DOCUMENT_LIBRARY_TOO_LARGE");
  const bytes = Buffer.alloc(metadata.size);
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
    if (!bytesRead) break;
    offset += bytesRead;
  }
  const exact = bytes.subarray(0, offset);
  return { path: relativePath, name: path.basename(relativePath), content: decode(exact), revision: digest(exact, metadata) };
}

export class DocumentLibrary {
  constructor({ configPath }) {
    if (typeof configPath !== "string" || !path.isAbsolute(configPath)) throw new TypeError("document library configPath must be absolute");
    this.configPath = configPath;
  }

  async selectedRoot() {
    let raw;
    try { raw = await readFile(this.configPath, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return null; throw fail("DOCUMENT_LIBRARY_CONFIG"); }
    try {
      const state = JSON.parse(raw);
      if (state.version !== 1 || typeof state.rootPath !== "string" || !path.isAbsolute(state.rootPath)) throw fail("DOCUMENT_LIBRARY_CONFIG");
      return await this.#validateRoot(state.rootPath);
    } catch (error) { throw known(error, "DOCUMENT_LIBRARY_CONFIG"); }
  }

  async #validateRoot(rootPath) {
    try {
      const metadata = await lstat(rootPath);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw fail("DOCUMENT_LIBRARY_ROOT_MISSING");
      const canonical = await realpath(rootPath);
      if (canonical !== rootPath) throw fail("DOCUMENT_LIBRARY_ROOT_MISSING");
      return canonical;
    } catch (error) { throw known(error, "DOCUMENT_LIBRARY_ROOT_MISSING"); }
  }

  async #rootRequired() {
    const root = await this.selectedRoot();
    if (!root) throw fail("DOCUMENT_LIBRARY_ROOT_MISSING");
    return root;
  }

  async state() {
    const root = await this.selectedRoot();
    if (!root) return null;
    return { rootName: path.basename(root), rootPath: root, entries: await this.#list(root) };
  }

  async selectRoot(rootPath) {
    if (typeof rootPath !== "string" || !path.isAbsolute(rootPath)) throw fail("DOCUMENT_LIBRARY_ROOT_MISSING");
    let canonical;
    try { canonical = await realpath(rootPath); }
    catch { throw fail("DOCUMENT_LIBRARY_ROOT_MISSING"); }
    canonical = await this.#validateRoot(canonical);
    const temporary = `${this.configPath}.${randomUUID()}.tmp`;
    try {
      await mkdir(path.dirname(this.configPath), { recursive: true, mode: 0o700 });
      await writeFile(temporary, `${JSON.stringify({ version: 1, rootPath: canonical }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      await rename(temporary, this.configPath);
    } catch (error) { throw known(error, "DOCUMENT_LIBRARY_CONFIG"); }
    finally { await rm(temporary, { force: true }); }
    return this.state();
  }

  async #list(root) {
    const entries = [];
    const visit = async (absoluteFolder, relativeFolder, depth) => {
      if (depth > MAX_DEPTH) throw fail("DOCUMENT_LIBRARY_TOO_MANY");
      let children;
      try { children = await readdir(absoluteFolder, { withFileTypes: true }); }
      catch { throw fail("DOCUMENT_LIBRARY_READ"); }
      children.sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name, "zh-CN"));
      for (const child of children) {
        if (child.name.startsWith(".") || child.isSymbolicLink()) continue;
        const relativePath = relativeFolder ? `${relativeFolder}/${child.name}` : child.name;
        if (child.isDirectory()) {
          entries.push({ kind: "folder", name: child.name, path: relativePath, parentPath: relativeFolder });
          if (entries.length > MAX_ENTRIES) throw fail("DOCUMENT_LIBRARY_TOO_MANY");
          await visit(path.join(absoluteFolder, child.name), relativePath, depth + 1);
        } else if (child.isFile()) {
          const extension = path.extname(child.name).toLowerCase();
          if (extension === ".md") {
            entries.push({ kind: "document", name: child.name, path: relativePath, parentPath: relativeFolder });
            if (entries.length > MAX_ENTRIES) throw fail("DOCUMENT_LIBRARY_TOO_MANY");
          } else if (IMAGE_TYPES.has(extension)) {
            entries.push({ kind: "image", name: child.name, path: relativePath, parentPath: relativeFolder });
            if (entries.length > MAX_ENTRIES) throw fail("DOCUMENT_LIBRARY_TOO_MANY");
          } else if (HTML_EXTENSIONS.has(extension)) {
            entries.push({ kind: "html", name: child.name, path: relativePath, parentPath: relativeFolder });
            if (entries.length > MAX_ENTRIES) throw fail("DOCUMENT_LIBRARY_TOO_MANY");
          }
        }
      }
    };
    await visit(root, "", 0);
    return entries;
  }

  async #directory(root, relativeParent) {
    const parentPath = normalizeParent(relativeParent);
    const candidate = path.resolve(root, parentPath || ".");
    if (!isInside(root, candidate)) throw fail("DOCUMENT_LIBRARY_PATH");
    try {
      const canonical = await realpath(candidate);
      const metadata = await lstat(candidate);
      if (!isInside(root, canonical) || canonical !== candidate || !metadata.isDirectory() || metadata.isSymbolicLink()) throw fail("DOCUMENT_LIBRARY_PATH");
      return { absolute: canonical, path: parentPath };
    } catch (error) { throw known(error, "DOCUMENT_LIBRARY_PATH"); }
  }

  async #existingDocument(root, relativePath) {
    const documentPath = validateRelative(relativePath);
    const candidate = path.resolve(root, documentPath);
    if (!isInside(root, candidate)) throw fail("DOCUMENT_LIBRARY_PATH");
    try {
      const metadata = await lstat(candidate);
      const canonical = await realpath(candidate);
      if (!metadata.isFile() || metadata.isSymbolicLink() || !isInside(root, canonical) || canonical !== candidate) throw fail("DOCUMENT_LIBRARY_PATH");
      return { absolute: candidate, path: documentPath };
    } catch (error) { throw known(error, "DOCUMENT_LIBRARY_PATH"); }
  }

  async #existingFile(root, relativePath) {
    const filePath = validateRelative(relativePath, { extension: false });
    const candidate = path.resolve(root, filePath);
    if (!isInside(root, candidate)) throw fail("DOCUMENT_LIBRARY_PATH");
    try {
      const metadata = await lstat(candidate);
      const canonical = await realpath(candidate);
      if (!metadata.isFile() || metadata.isSymbolicLink() || !isInside(root, canonical) || canonical !== candidate) throw fail("DOCUMENT_LIBRARY_PATH");
      return { absolute: candidate, path: filePath };
    } catch (error) { throw known(error, "DOCUMENT_LIBRARY_PATH"); }
  }

  async openFile(relativePath) {
    const root = await this.#rootRequired();
    const target = await this.#existingFile(root, relativePath);
    const extension = path.extname(target.path).toLowerCase();
    const mime = IMAGE_TYPES.get(extension);
    const isHtml = HTML_EXTENSIONS.has(extension);
    if (!mime && !isHtml) throw fail("DOCUMENT_LIBRARY_UNSUPPORTED");
    let handle;
    try {
      handle = await open(target.absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const metadata = await handle.stat();
      if (!metadata.isFile()) throw fail("DOCUMENT_LIBRARY_TYPE");
      const limit = mime ? MAX_IMAGE_BYTES : MAX_BYTES;
      if (metadata.size > limit) throw fail(mime ? "DOCUMENT_LIBRARY_IMAGE_TOO_LARGE" : "DOCUMENT_LIBRARY_TOO_LARGE");
      const bytes = Buffer.alloc(metadata.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      const exact = bytes.subarray(0, offset);
      const name = path.basename(target.path);
      if (mime) {
        if (exact.length > MAX_IMAGE_BYTES) throw fail("DOCUMENT_LIBRARY_IMAGE_TOO_LARGE");
        return { kind: "image", name, path: target.path, mime, size: exact.length, base64: exact.toString("base64") };
      }
      return { kind: "html", name, path: target.path, mime: "text/html; charset=utf-8", size: exact.length, content: decode(exact) };
    } catch (error) { throw known(error, "DOCUMENT_LIBRARY_READ"); }
    finally { await handle?.close(); }
  }

  async createFolder(parentPath, rawName) {
    const root = await this.#rootRequired();
    const parent = await this.#directory(root, parentPath);
    const name = validateName(rawName);
    const target = path.join(parent.absolute, name);
    try { await mkdir(target, { mode: 0o755 }); }
    catch (error) { if (error.code === "EEXIST") throw fail("DOCUMENT_LIBRARY_EXISTS"); throw fail("DOCUMENT_LIBRARY_WRITE"); }
    return { kind: "folder", name, path: parent.path ? `${parent.path}/${name}` : name, parentPath: parent.path };
  }

  async createDocument(parentPath, rawName) {
    const root = await this.#rootRequired();
    const parent = await this.#directory(root, parentPath);
    const baseName = validateName(rawName);
    const name = path.extname(baseName).toLowerCase() === ".md" ? baseName : `${baseName}.md`;
    if (path.extname(name).toLowerCase() !== ".md") throw fail("DOCUMENT_LIBRARY_TYPE");
    const relativePath = parent.path ? `${parent.path}/${name}` : name;
    const title = path.basename(name, path.extname(name));
    try { await writeFile(path.join(parent.absolute, name), `# ${title}\n`, { flag: "wx", mode: 0o644 }); }
    catch (error) { if (error.code === "EEXIST") throw fail("DOCUMENT_LIBRARY_EXISTS"); throw fail("DOCUMENT_LIBRARY_WRITE"); }
    return { entry: { kind: "document", name, path: relativePath, parentPath: parent.path }, document: await this.openDocument(relativePath) };
  }

  async openDocument(relativePath) {
    const root = await this.#rootRequired();
    const target = await this.#existingDocument(root, relativePath);
    let handle;
    try {
      handle = await open(target.absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      return await readSnapshot(handle, target.path);
    } catch (error) { throw known(error, "DOCUMENT_LIBRARY_READ"); }
    finally { await handle?.close(); }
  }

  async saveDocument(input) {
    if (typeof input?.content !== "string" || input.content.includes("\0") || typeof input?.revision !== "string" || !/^[a-f0-9]{64}$/.test(input.revision)) throw fail("DOCUMENT_LIBRARY_INPUT");
    const bytes = Buffer.from(input.content, "utf8");
    if (bytes.length > MAX_BYTES) throw fail("DOCUMENT_LIBRARY_TOO_LARGE");
    const root = await this.#rootRequired();
    const target = await this.#existingDocument(root, input.path);
    let handle;
    try {
      handle = await open(target.absolute, constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      const current = await readSnapshot(handle, target.path);
      if (current.revision !== input.revision) throw fail("DOCUMENT_LIBRARY_CONFLICT");
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, offset);
        if (!bytesWritten) throw fail("DOCUMENT_LIBRARY_WRITE");
        offset += bytesWritten;
      }
      await handle.truncate(bytes.length);
      await handle.sync();
      const saved = await readSnapshot(handle, target.path);
      const pathMetadata = await lstat(target.absolute);
      const handleMetadata = await handle.stat();
      if (pathMetadata.dev !== handleMetadata.dev || pathMetadata.ino !== handleMetadata.ino || saved.content !== input.content) throw fail("DOCUMENT_LIBRARY_CONFLICT");
      return saved;
    } catch (error) { throw known(error, "DOCUMENT_LIBRARY_WRITE"); }
    finally { await handle?.close(); }
  }

  async renameEntry(input) {
    if (typeof input?.path !== "string" || (input.kind !== "folder" && input.kind !== "document")) throw fail("DOCUMENT_LIBRARY_INPUT");
    const root = await this.#rootRequired();
    const target = input.kind === "folder"
      ? await this.#directory(root, input.path)
      : await this.#existingDocument(root, input.path);
    if (input.kind === "folder" && target.path === "") throw fail("DOCUMENT_LIBRARY_RENAME_ROOT");

    const baseName = validateName(input.name);
    let name = baseName;
    if (input.kind === "document") {
      const extension = path.extname(baseName).toLowerCase();
      if (extension && extension !== ".md") throw fail("DOCUMENT_LIBRARY_TYPE");
      name = extension === ".md" ? baseName : `${baseName}.md`;
    }

    const parentPath = target.path.split("/").slice(0, -1).join("/");
    const parentAbsolute = parentPath ? path.join(root, parentPath) : root;
    const nextAbsolute = path.join(parentAbsolute, name);
    if (nextAbsolute !== target.absolute) {
      const targetStat = await lstat(target.absolute);
      try {
        const nextStat = await lstat(nextAbsolute);
        // Case-insensitive filesystems resolve a case-only change to the same
        // inode. A different existing inode is a real collision, including on
        // case-sensitive Linux.
        if (nextStat.dev !== targetStat.dev || nextStat.ino !== targetStat.ino) throw fail("DOCUMENT_LIBRARY_EXISTS");
      } catch (error) {
        if (error.code !== "ENOENT") throw known(error, "DOCUMENT_LIBRARY_EXISTS");
      }
    }
    try { await rename(target.absolute, nextAbsolute); }
    catch (error) { throw known(error, "DOCUMENT_LIBRARY_WRITE"); }
    return { kind: input.kind, name, path: parentPath ? `${parentPath}/${name}` : name, parentPath };
  }

  async importContents(parentPath, files) {
    if (!Array.isArray(files) || files.length === 0) return [];
    const root = await this.#rootRequired();
    const parent = await this.#directory(root, parentPath);
    const prepared = [];
    const names = new Set();
    for (const file of files) {
      if (typeof file?.name !== "string" || typeof file?.content !== "string") throw fail("DOCUMENT_LIBRARY_INPUT");
      const name = validateName(file.name);
      if (path.extname(name).toLowerCase() !== ".md") throw fail("DOCUMENT_LIBRARY_TYPE");
      if (names.has(name)) throw fail("DOCUMENT_LIBRARY_EXISTS");
      names.add(name);
      const bytes = Buffer.from(file.content, "utf8");
      if (bytes.length > MAX_BYTES) throw fail("DOCUMENT_LIBRARY_TOO_LARGE");
      if (file.content.includes("\0")) throw fail("DOCUMENT_LIBRARY_ENCODING");
      const target = path.join(parent.absolute, name);
      try { await lstat(target); throw fail("DOCUMENT_LIBRARY_EXISTS"); }
      catch (error) { if (error.code !== "ENOENT") throw known(error, "DOCUMENT_LIBRARY_EXISTS"); }
      prepared.push({ name, target, bytes });
    }
    const created = [];
    try {
      for (const item of prepared) {
        await writeFile(item.target, item.bytes, { flag: "wx", mode: 0o644 });
        created.push(item.target);
      }
    } catch (error) {
      await Promise.allSettled(created.map((target) => rm(target, { force: true })));
      throw error.code === "EEXIST" ? fail("DOCUMENT_LIBRARY_EXISTS") : fail("DOCUMENT_LIBRARY_WRITE");
    }
    return prepared.map(({ name }) => ({ kind: "document", name, path: parent.path ? `${parent.path}/${name}` : name, parentPath: parent.path }));
  }

  async resolveAbsolutePath(input) {
    if (typeof input?.path !== "string") throw fail("DOCUMENT_LIBRARY_INPUT");
    const root = await this.#rootRequired();
    if (input.kind === "folder") return (await this.#directory(root, input.path)).absolute;
    if (input.kind === "document") return (await this.#existingDocument(root, input.path)).absolute;
    throw fail("DOCUMENT_LIBRARY_INPUT");
  }

  async importDocuments(parentPath, sourcePaths) {
    if (!Array.isArray(sourcePaths) || !sourcePaths.length) return [];
    const root = await this.#rootRequired();
    const parent = await this.#directory(root, parentPath);
    const prepared = [];
    const names = new Set();
    for (const sourcePath of sourcePaths) {
      if (typeof sourcePath !== "string" || !path.isAbsolute(sourcePath) || path.extname(sourcePath).toLowerCase() !== ".md") throw fail("DOCUMENT_LIBRARY_TYPE");
      const name = validateName(path.basename(sourcePath));
      if (names.has(name)) throw fail("DOCUMENT_LIBRARY_EXISTS");
      names.add(name);
      const target = path.join(parent.absolute, name);
      try { await lstat(target); throw fail("DOCUMENT_LIBRARY_EXISTS"); }
      catch (error) { if (error.code !== "ENOENT") throw known(error, "DOCUMENT_LIBRARY_EXISTS"); }
      let handle;
      try {
        const metadata = await lstat(sourcePath);
        if (!metadata.isFile() || metadata.isSymbolicLink()) throw fail("DOCUMENT_LIBRARY_TYPE");
        handle = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const source = await readSnapshot(handle, name);
        prepared.push({ name, target, bytes: Buffer.from(source.content, "utf8") });
      } catch (error) { throw known(error, "DOCUMENT_LIBRARY_READ"); }
      finally { await handle?.close(); }
    }
    const created = [];
    try {
      for (const item of prepared) {
        await writeFile(item.target, item.bytes, { flag: "wx", mode: 0o644 });
        created.push(item.target);
      }
    } catch (error) {
      await Promise.allSettled(created.map((target) => rm(target, { force: true })));
      throw error.code === "EEXIST" ? fail("DOCUMENT_LIBRARY_EXISTS") : fail("DOCUMENT_LIBRARY_WRITE");
    }
    return prepared.map(({ name }) => ({ kind: "document", name, path: parent.path ? `${parent.path}/${name}` : name, parentPath: parent.path }));
  }
}
