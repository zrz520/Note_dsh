import React from "react";
import { createLiveMarkdownEditor, MILKDOWN_CSS } from "./milkdown.js";
import { NS, en } from "./i18n.js";

let tr = (text) => text;
let localeCtx = null;

/**
 * 文档中心 —— 浏览器半身。
 *
 * 侧栏入口 + 主面板，数据走同源 /api/document-center（由 Host 半身提供）。
 * 源码由 esbuild 构建为 ModuleLoader bundle；运行时依赖 shell 提供的 react。
 */
    const {
      createElement: h,
      Fragment,
      useState,
      useEffect,
      useRef,
    } = React;

    const API = "/api/document-center";
    const PANEL_ID = "document-center";
    const cache = {
      library: undefined,
      open: null,
      draft: "",
      folder: "",
      expanded: new Set([""]),
      mode: "visual",
    };

    async function request(action, payload = {}) {
      const response = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      if (!response.ok) {
        if (response.status === 401) throw new Error(tr("登录状态已失效，请刷新页面后重试。"));
        throw new Error(tr("请求失败（HTTP {status}）。", { status: response.status }));
      }
      const body = await response.json();
      if (!body?.ok) throw new Error(body?.error?.message ?? tr("操作失败，请稍后重试。"));
      return body.data;
    }

    // ── 极简 Markdown 渲染（不进入原始 HTML） ─────────────────────────────
    function inline(text, keyPrefix) {
      const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
      const nodes = [];
      let last = 0;
      let index = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const token = match[0];
        const key = `${keyPrefix}-${index++}`;
        if (token.startsWith("**")) {
          nodes.push(h("strong", { key }, token.slice(2, -2)));
        } else if (token.startsWith("`")) {
          nodes.push(h("code", { key }, token.slice(1, -1)));
        } else if (token.startsWith("[")) {
          const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
          if (link && /^(https?:|mailto:)/i.test(link[2])) {
            nodes.push(h("a", { key, href: link[2], target: "_blank", rel: "noreferrer noopener" }, link[1]));
          } else {
            nodes.push(token);
          }
        } else {
          nodes.push(h("em", { key }, token.slice(1, -1)));
        }
        last = match.index + token.length;
      }
      if (last < text.length) nodes.push(text.slice(last));
      return nodes;
    }

    function blocks(markdown) {
      const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
      const out = [];
      let index = 0;
      let key = 0;
      const isBlockStart = (line) => /^(#{1,6}\s|```|>\s|\s*[-*]\s+|\s*\d+\.\s+|---+\s*$)/.test(line);
      while (index < lines.length) {
        const line = lines[index];
        if (!line.trim()) { index += 1; continue; }
        if (line.startsWith("```")) {
          const language = line.slice(3).trim();
          const body = [];
          index += 1;
          while (index < lines.length && !lines[index].startsWith("```")) body.push(lines[index++]);
          index += 1;
          out.push(h("pre", { key: key++, className: language ? `language-${language}` : undefined }, h("code", {}, body.join("\n"))));
          continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
          out.push(h(`h${heading[1].length}`, { key: key++ }, inline(heading[2], `h${key}`)));
          index += 1;
          continue;
        }
        if (/^---+\s*$/.test(line)) {
          out.push(h("hr", { key: key++ }));
          index += 1;
          continue;
        }
        if (/^>\s?/.test(line)) {
          const body = [];
          while (index < lines.length && /^>\s?/.test(lines[index])) body.push(lines[index++].replace(/^>\s?/, ""));
          out.push(h("blockquote", { key: key++ }, blocks(body.join("\n"))));
          continue;
        }
        if (/^\s*[-*]\s+/.test(line)) {
          const items = [];
          while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
            const text = lines[index].replace(/^\s*[-*]\s+/, "");
            const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
            items.push(h("li", { key: key++ },
              task ? [
                h("input", { key: "box", type: "checkbox", checked: task[1].toLowerCase() === "x", disabled: true, readOnly: true }),
                " ",
                ...inline(task[2], `t${key}`),
              ] : inline(text, `i${key}`)));
            index += 1;
          }
          out.push(h("ul", { key: key++ }, items));
          continue;
        }
        if (/^\s*\d+\.\s+/.test(line)) {
          const items = [];
          while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
            const text = lines[index].replace(/^\s*\d+\.\s+/, "");
            items.push(h("li", { key: key++ }, inline(text, `o${key}`)));
            index += 1;
          }
          out.push(h("ol", { key: key++ }, items));
          continue;
        }
        const paragraph = [line];
        index += 1;
        while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) paragraph.push(lines[index++]);
        out.push(h("p", { key: key++ }, inline(paragraph.join(" "), `p${key}`)));
      }
      return out;
    }

    function Markdown({ content }) {
      return h("div", { className: "dc-markdown" }, blocks(content));
    }

    // ── 图标 ──────────────────────────────────────────────────────────────
    const ICONS = {
      book: h("path", { d: "M4 5a3 3 0 0 1 3-3h5v18H7a3 3 0 0 0-3 3ZM20 5a3 3 0 0 0-3-3h-5v18h5a3 3 0 0 1 3 3Z" }),
      folder: h("path", { d: "M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" }),
      file: [h("path", { key: "a", d: "M6 3h8l4 4v14H6Z" }), h("path", { key: "b", d: "M14 3v5h5" })],
      plus: h("path", { d: "M12 5v14M5 12h14" }),
      folderPlus: [h("path", { key: "a", d: "M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" }), h("path", { key: "b", d: "M12 11v5M9.5 13.5h5" })],
      filePlus: [h("path", { key: "a", d: "M6 3h8l4 4v14H6Z" }), h("path", { key: "b", d: "M14 3v5h5M12 11v6M9 14h6" })],
      refresh: [h("path", { key: "a", d: "M20 7v5h-5M4 17v-5h5" }), h("path", { key: "b", d: "M6.1 9a7 7 0 0 1 11.7-2L20 12M4 12l2.2 5a7 7 0 0 0 11.7-2" })],
      chevronRight: h("path", { d: "M8 5.5 12.5 10 8 14.5" }),
      chevronLeft: h("path", { d: "m15 5.5-4.5 4.5 4.5 4.5" }),
      copy: [h("rect", { key: "a", x: "9", y: "9", width: "11", height: "11", rx: "2" }), h("path", { key: "b", d: "M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" })],
      close: h("path", { d: "m7 7 10 10M17 7 7 17" }),
      warning: [h("path", { key: "a", d: "M10.3 3.7 2.6 18a2 2 0 0 0 1.8 3h15.2a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" }), h("path", { key: "b", d: "M12 9v4M12 17h.01" })],
      check: h("path", { d: "m5 12 4 4L19 6" }),
      home: [h("path", { key: "a", d: "m3 11 9-8 9 8" }), h("path", { key: "b", d: "M5 10v10h14V10M9 20v-6h6v6" })],
      search: [h("circle", { key: "a", cx: "11", cy: "11", r: "7" }), h("path", { key: "b", d: "m20 20-4-4" })],
      upload: [h("path", { key: "a", d: "M12 16V4M7 9l5-5 5 5" }), h("path", { key: "b", d: "M5 20h14" })],
      edit: [h("path", { key: "a", d: "M12 20h9" }), h("path", { key: "b", d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" })],
      image: [h("rect", { key: "a", x: "3", y: "4", width: "18", height: "16", rx: "2" }), h("circle", { key: "b", cx: "8.5", cy: "9.5", r: "1.5" }), h("path", { key: "c", d: "m21 15-5-5L5 20" })],
      html: [h("path", { key: "a", d: "M6 3h8l4 4v14H6Z" }), h("path", { key: "b", d: "M14 3v5h5" }), h("path", { key: "c", d: "m11 13-2 2 2 2M14 13l2 2-2 2" })],
    };

    function Icon({ name, size = 16 }) {
      return h("svg", {
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
      }, ICONS[name] ?? null);
    }

    function nameWithoutExtension(name = "") {
      return name.replace(/\.md$/i, "");
    }

    function parentLabel(relativePath, rootName) {
      const parts = relativePath.split("/");
      return parts.length > 1 ? parts.slice(0, -1).join(" / ") : rootName;
    }

    function folderName(relativePath, rootName) {
      return relativePath ? relativePath.split("/").at(-1) : rootName;
    }

    function allFolderPaths(entries = []) {
      return new Set(["", ...entries.filter((entry) => entry.kind === "folder").map((entry) => entry.path)]);
    }

    function extensionOf(name = "") {
      const index = name.lastIndexOf(".");
      return index > 0 ? name.slice(index).toLowerCase() : "";
    }

    function formatBytes(value) {
      if (!Number.isFinite(value) || value < 0) return "";
      if (value < 1024) return `${value} B`;
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${(value / 1024 / 1024).toFixed(1)} MB`;
    }

    function base64ToBlobUrl(base64, mime) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return URL.createObjectURL(new Blob([bytes], { type: mime }));
    }

    function useLocaleRefresh() {
      const [, setRevision] = useState(0);
      useEffect(() => {
        if (!localeCtx) return undefined;
        return localeCtx.locale.subscribe(() => setRevision((value) => value + 1));
      }, []);
    }

    // ── 可视化编辑器 ──────────────────────────────────────────────────────
    function VisualEditor({ value, onChange, disabled }) {
      const rootRef = useRef(null);
      const onChangeRef = useRef(onChange);
      const [status, setStatus] = useState("loading");

      useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

      useEffect(() => {
        let disposed = false;
        let instance = null;
        setStatus("loading");
        createLiveMarkdownEditor({
          root: rootRef.current,
          markdown: value,
          onChange: (markdown) => onChangeRef.current(markdown),
          translate: tr,
        }).then((created) => {
          if (disposed) {
            void created.destroy();
            return;
          }
          instance = created;
          setStatus("ready");
        }).catch(() => {
          if (!disposed) setStatus("error");
        });
        return () => {
          disposed = true;
          if (instance) void instance.destroy();
        };
      }, []);

      return h("div", { className: `dc-visual${disabled ? " disabled" : ""}` },
        h("div", { ref: rootRef, className: "dc-visual-root" }),
        status === "loading" && h("div", { className: "dc-visual-status" }, h("span", { className: "dc-spinner" }), tr("正在加载编辑器…")),
        status === "error" && h("div", { className: "dc-visual-status dc-visual-error", role: "alert" }, tr("可视化编辑器加载失败，请切换到「源码」继续编辑。")));
    }

    // ── 面板 ──────────────────────────────────────────────────────────────
    function DocumentCenterPage() {
      const [library, setLibrary] = useState(cache.library);
      const [open, setOpen] = useState(cache.open);
      const [preview, setPreview] = useState(null);
      const [picker, setPicker] = useState(undefined);
      const [draft, setDraft] = useState(cache.draft);
      const [folder, setFolder] = useState(cache.folder);
      const [folderSelected, setFolderSelected] = useState(false);
      const [expanded, setExpanded] = useState(cache.expanded);
      const [mode, setMode] = useState(cache.mode);
      const [editorEpoch, setEditorEpoch] = useState(0);
      const [sidebar, setSidebar] = useState(true);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState("");
      const [notice, setNotice] = useState("");
      const [dialog, setDialog] = useState(null);
      const [menu, setMenu] = useState(null);
      const importInput = useRef(null);
      const previewUrlRef = useRef(null);
      const mounted = useRef(true);
      useLocaleRefresh();

      const dirty = Boolean(open && draft !== open.content);
      const pickerBlocked = picker === "browse" || picker === "unavailable";

      useEffect(() => {
        mounted.current = true;
        return () => {
          mounted.current = false;
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        };
      }, []);
      useEffect(() => { cache.library = library; }, [library]);
      useEffect(() => { cache.open = open; }, [open]);
      useEffect(() => { cache.draft = draft; }, [draft]);
      useEffect(() => { cache.folder = folder; }, [folder]);
      useEffect(() => { cache.expanded = expanded; }, [expanded]);
      useEffect(() => { cache.mode = mode; }, [mode]);

      async function call(action, payload) {
        setBusy(true);
        setError("");
        try {
          return { ok: true, data: await request(action, payload) };
        } catch (failure) {
          if (mounted.current) setError(tr(failure.message ?? tr("操作失败，请稍后重试。")));
          return { ok: false };
        } finally {
          if (mounted.current) setBusy(false);
        }
      }

      function closeDocument() {
        setOpen(null);
        setDraft("");
        setMode("visual");
        setFolderSelected(false);
      }

      function closePreview() {
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }
        setPreview(null);
      }

      async function reopen(relativePath) {
        const result = await call("open", { path: relativePath });
        if (!result.ok) return false;
        setOpen(result.data);
        setDraft(result.data.content);
        setEditorEpoch((value) => value + 1);
        return true;
      }

      async function load({ initial = false } = {}) {
        if (dirty && !initial) {
          setError(tr("请先保存或还原当前修改，再刷新文档库。"));
          return;
        }
        const result = await call("state");
        if (!result.ok) return;
        const next = result.data;
        setLibrary(next);
        if (next === null) {
          closeDocument();
          closePreview();
          return;
        }
        if (initial || library === null) setExpanded(allFolderPaths(next.entries));
        else setExpanded((current) => new Set([...current, ""]));
        if (preview && !next.entries.some((entry) => entry.path === preview.path)) closePreview();
        if (!open) return;
        if (!next.entries.some((entry) => entry.kind === "document" && entry.path === open.path)) {
          closeDocument();
          setNotice(tr("当前文档已不在文档库中"));
          return;
        }
        if (!dirty) await reopen(open.path);
      }

      useEffect(() => {
        if (cache.library === undefined) void load({ initial: true });
      }, []);

      useEffect(() => {
        let cancelled = false;
        request("capabilities")
          .then((data) => { if (!cancelled) setPicker(data?.picker ?? "unknown"); })
          .catch(() => { if (!cancelled) setPicker("unknown"); });
        return () => { cancelled = true; };
      }, []);

      async function selectRoot() {
        if (dirty) {
          setError(tr("请先保存或还原当前修改，再更换文档库。"));
          return;
        }
        if (pickerBlocked) {
          setError(tr("当前 DSH 不是桌面本地模式，无法打开系统目录选择器。"));
          return;
        }
        const result = await call("select-root");
        if (!result.ok) return;
        if (result.data === null) {
          setNotice(tr("已取消选择"));
          return;
        }
        setLibrary(result.data);
        closeDocument();
        closePreview();
        setFolder("");
        setFolderSelected(false);
        setExpanded(allFolderPaths(result.data.entries));
        setNotice(tr("文档库已就绪"));
      }

      async function openDocument(entry) {
        if (dirty) {
          setError(tr("请先保存或还原当前修改，再打开其他文档。"));
          return;
        }
        setError("");
        setNotice("");
        if (preview) closePreview();
        const result = await call("open", { path: entry.path });
        if (!result.ok) return;
        setOpen(result.data);
        setDraft(result.data.content);
        setFolder(entry.parentPath);
        setFolderSelected(false);
        setMode("visual");
        setEditorEpoch((value) => value + 1);
      }

      async function openPreview(entry) {
        if (dirty) {
          setError(tr("请先保存或还原当前修改，再打开其他文件。"));
          return;
        }
        setError("");
        setNotice("");
        const result = await call("open-file", { path: entry.path });
        if (!result.ok) return;
        const data = result.data;
        closeDocument();
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
          previewUrlRef.current = null;
        }
        if (data.kind === "image") {
          let url;
          try {
            url = base64ToBlobUrl(data.base64, data.mime);
          } catch {
            setError(tr("无法显示这张图片。"));
            return;
          }
          previewUrlRef.current = url;
          setPreview({ ...data, url });
        } else {
          setPreview(data);
        }
        setFolder(entry.parentPath);
        setFolderSelected(false);
      }

      function openEntry(entry) {
        if (entry.kind === "document") void openDocument(entry);
        else void openPreview(entry);
      }

      async function save() {
        if (!open || !dirty || busy) return;
        setError("");
        const result = await call("save", {
          path: open.path,
          content: draft,
          revision: open.revision,
        });
        if (!result.ok) return;
        setOpen(result.data);
        setDraft(result.data.content);
        setNotice(tr("已保存到本地文档"));
      }

      function restore() {
        if (!open) return;
        setDraft(open.content);
        setEditorEpoch((value) => value + 1);
        setError("");
        setNotice(tr("已还原未保存的修改"));
      }

      async function copyTarget(targetKind, targetPath) {
        if (!library) return;
        const absolute = targetPath ? `${library.rootPath}/${targetPath}` : library.rootPath;
        let copied = false;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(absolute);
            copied = true;
          }
        } catch {
          copied = false;
        }
        if (!copied) {
          try {
            const input = document.createElement("textarea");
            input.value = absolute;
            input.style.position = "fixed";
            input.style.opacity = "0";
            document.body.appendChild(input);
            input.select();
            copied = document.execCommand("copy");
            input.remove();
          } catch {
            copied = false;
          }
        }
        if (copied) setNotice(tr("路径已复制"));
        else setError(tr("无法复制路径，请检查系统剪贴板后重试。"));
      }

      function copyPath() {
        const targetPath = open?.path ?? preview?.path ?? "";
        void copyTarget(open ? "document" : preview?.kind ?? "folder", targetPath);
      }

      function openMenu(event, target) {
        event.preventDefault();
        event.stopPropagation();
        const width = 196;
        const height = 188;
        const x = Math.max(8, Math.min(event.clientX ?? 20, (globalThis.innerWidth ?? 1280) - width - 8));
        const y = Math.max(8, Math.min(event.clientY ?? 60, (globalThis.innerHeight ?? 800) - height - 8));
        setMenu({ x, y, ...target });
      }

      async function onImportFiles(event) {
        const files = [...(event.target.files ?? [])];
        event.target.value = "";
        if (!files.length) return;
        const payload = [];
        for (const file of files) {
          if (!file.name.toLowerCase().endsWith(".md")) {
            setError(tr("只能导入 .md 文件。"));
            return;
          }
          payload.push({ name: file.name, content: await file.text() });
        }
        const result = await call("import-documents", { parentPath: folder, files: payload });
        if (!result.ok) return;
        setLibrary((current) => current ? { ...current, entries: [...current.entries, ...result.data] } : current);
        setExpanded((current) => new Set([...current, folder]));
        setNotice(tr("已导入 {count} 个 Markdown 文档", { count: result.data.length }));
      }

      function beginCreate(kind, parentPath = folder) {
        setMenu(null);
        if (kind === "document" && dirty) {
          setError(tr("请先保存或还原当前修改，再新建其他文档。"));
          return;
        }
        setDialog({ mode: "create", kind, parentPath, name: "" });
      }

      function isOpenAffected(kind, targetPath) {
        if (!open) return false;
        if (kind === "document") return open.path === targetPath;
        return open.path === targetPath || open.path.startsWith(`${targetPath}/`);
      }

      function beginRename(target) {
        setMenu(null);
        if (!target?.targetPath) return;
        if (dirty && isOpenAffected(target.targetKind, target.targetPath)) {
          setError(tr("请先保存或还原当前修改，再重命名。"));
          return;
        }
        setDialog({
          mode: "rename",
          kind: target.targetKind,
          targetPath: target.targetPath,
          parentPath: target.parentPath,
          name: target.targetName,
        });
      }

      async function renameCurrent() {
        const target = dialog;
        if (!target?.targetPath || !target.name.trim()) return;
        const result = await call("rename", { kind: target.kind, path: target.targetPath, name: target.name.trim() });
        if (!result.ok) return;
        const renamed = result.data;
        const previous = open;
        const nextState = await call("state");
        if (!nextState.ok) return;
        setLibrary(nextState.data);
        const remap = (value) => target.kind === "folder" && (value === target.targetPath || value.startsWith(`${target.targetPath}/`))
          ? `${renamed.path}${value.slice(target.targetPath.length)}`
          : value;
        setExpanded((current) => new Set([...current].map(remap)));
        setFolder((current) => remap(current));
        if (previous && isOpenAffected(target.kind, target.targetPath)) {
          const nextPath = target.kind === "document"
            ? renamed.path
            : `${renamed.path}${previous.path.slice(target.targetPath.length)}`;
          const reopened = await call("open", { path: nextPath });
          if (reopened.ok) {
            setOpen(reopened.data);
            setDraft(reopened.data.content);
            setEditorEpoch((value) => value + 1);
          } else {
            closeDocument();
          }
        }
        setDialog(null);
        setNotice(tr("已重命名"));
      }

      async function create() {
        const name = dialog?.name?.trim();
        if (!name || !dialog) return;
        if (dialog.kind === "folder") {
          const result = await call("create-folder", { parentPath: dialog.parentPath, name });
          if (!result.ok) return;
          setLibrary((current) => current ? { ...current, entries: [...current.entries, result.data] } : current);
          setExpanded((current) => new Set([...current, dialog.parentPath]));
          setFolder(result.data.path);
          setFolderSelected(true);
          setDialog(null);
          setNotice(tr("文件夹已创建"));
          return;
        }
        const result = await call("create-document", { parentPath: dialog.parentPath, name });
        if (!result.ok) return;
        setLibrary((current) => current ? { ...current, entries: [...current.entries, result.data.entry] } : current);
        setExpanded((current) => new Set([...current, dialog.parentPath]));
        setFolder(dialog.parentPath);
        setFolderSelected(false);
        closePreview();
        setOpen(result.data.document);
        setDraft(result.data.document.content);
        setMode("visual");
        setEditorEpoch((value) => value + 1);
        setDialog(null);
        setNotice(tr("文档已创建，可以开始编辑"));
      }

      async function submitDialog(event) {
        event.preventDefault();
        if (!dialog?.name?.trim()) return;
        if (dialog.mode === "rename") {
          await renameCurrent();
          return;
        }
        await create();
      }

      function handleKeyDown(event) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          void save();
        }
        if (event.key === "Escape") {
          setMenu(null);
          if (dialog) setDialog(null);
        }
      }

      if (library === undefined) {
        return h("section", { className: "dc-root dc-loading", "data-document-center": true },
          h("div", { className: "dc-loading-inner" }, h(Icon, { name: "book", size: 26 }), h("span", {}, busy ? tr("正在读取文档库…") : tr("准备文档中心…"))));
      }

      if (library === null) {
        return h("section", { className: "dc-root dc-welcome-root", "data-document-center": true },
          h("div", { className: "dc-welcome" },
            h("div", { className: "dc-welcome-icon" }, h(Icon, { name: "book", size: 28 })),
            h("h1", {}, tr("建立你的文档中心")),
            h("p", {}, tr("选择一个本地文件夹，DayDeck 会在原位置管理其中的 Markdown 文档。文件始终保存在本地，不会发送给模型。")),
            pickerBlocked && h("div", { className: "dc-banner dc-warning", role: "status" },
              h(Icon, { name: "warning", size: 15 }),
              h("span", {}, tr("当前 DSH 不是桌面本地模式，无法打开系统目录选择器；文档中心仅支持 DSH 桌面应用本地运行。"))),
            error && h("div", { className: "dc-banner dc-error", role: "alert" }, h(Icon, { name: "warning", size: 15 }), h("span", {}, error), h("button", { type: "button", "aria-label": tr("关闭提示"), onClick: () => setError("") }, h(Icon, { name: "close", size: 13 }))),
            h("button", { className: "dc-primary", type: "button", disabled: busy || pickerBlocked, onClick: selectRoot },
              h(Icon, { name: "folder", size: 16 }),
              pickerBlocked ? tr("仅支持桌面本地模式") : busy ? tr("正在选择…") : tr("选择文件夹")),
            h("small", {}, pickerBlocked ? tr("请从 DSH 桌面应用本地启动后再选择文档库。") : tr("之后可以随时在文档库中右键或使用顶栏更换目录。"))));
      }

      return h("section", { className: `dc-root${sidebar ? "" : " dc-sidebar-hidden"}`, "data-document-center": true, onKeyDownCapture: handleKeyDown },
        h("aside", { className: "dc-tree-pane", hidden: !sidebar },
          h("header", { className: "dc-tree-head" },
            h("div", {
              className: "dc-tree-title",
              onContextMenu: (event) => openMenu(event, { parentPath: "", targetPath: "", targetKind: "folder", targetName: library.rootName }),
            },
              h("span", {}, tr("文档库")),
              h("strong", { title: library.rootPath }, library.rootName)),
            h("div", { className: "dc-tree-actions" },
              h("button", { type: "button", title: tr("新建文档"), "aria-label": tr("新建文档"), disabled: busy, onClick: () => beginCreate("document") }, h(Icon, { name: "filePlus", size: 15 })),
              h("button", { type: "button", title: tr("新建文件夹"), "aria-label": tr("新建文件夹"), disabled: busy, onClick: () => beginCreate("folder") }, h(Icon, { name: "folderPlus", size: 15 })),
              h("button", { type: "button", title: tr("导入 Markdown"), "aria-label": tr("导入 Markdown"), disabled: busy, onClick: () => importInput.current?.click() }, h(Icon, { name: "upload", size: 15 })),
              h("button", { type: "button", title: tr("刷新文档库"), "aria-label": tr("刷新文档库"), disabled: busy, onClick: () => void load() }, h(Icon, { name: "refresh", size: 14 })),
              h("button", {
                type: "button",
                title: pickerBlocked ? tr("仅支持 DSH 桌面本地模式") : tr("更换文档库"),
                "aria-label": tr("更换文档库"),
                disabled: busy || dirty || pickerBlocked,
                onClick: selectRoot,
              }, h(Icon, { name: "folder", size: 15 })))),
          pickerBlocked && h("p", { className: "dc-tree-warning" }, tr("仅桌面本地模式 · 文档库位于 Host 本地磁盘")),
          h("input", { ref: importInput, type: "file", multiple: true, accept: ".md,text/markdown", style: { display: "none" }, onChange: onImportFiles }),
          h("nav", {
            className: "dc-tree",
            "aria-label": tr("文档目录"),
            onContextMenu: (event) => {
              if (event.target !== event.currentTarget) return;
              openMenu(event, { parentPath: "", targetPath: "", targetKind: "folder", targetName: library.rootName });
            },
          },
            h(Tree, {
              entries: library.entries,
              parentPath: "",
              depth: 0,
              expanded,
              folder,
              folderSelected,
              openPath: open?.path ?? preview?.path ?? null,
              onToggle: (path) => setExpanded((current) => {
                const next = new Set(current);
                if (next.has(path)) next.delete(path); else next.add(path);
                return next;
              }),
              onFolder: (entry) => { setFolder(entry.path); setFolderSelected(true); },
              onDocument: openEntry,
              onContext: (event, entry) => openMenu(event, entry.kind === "folder"
                ? { parentPath: entry.path, targetPath: entry.path, targetKind: "folder", targetName: entry.name }
                : { parentPath: entry.parentPath, targetPath: entry.path, targetKind: entry.kind, targetName: entry.name }),
            })),
          h("button", { type: "button", className: "dc-root-path", title: tr("复制文档库路径"), onClick: () => void copyTarget("folder", "") },
            h(Icon, { name: "folder", size: 14 }),
            h("span", { title: library.rootPath }, library.rootPath))),

        h("button", {
          type: "button",
          className: "dc-collapse",
          title: sidebar ? tr("收起文档侧边栏") : tr("展开文档侧边栏"),
          "aria-label": sidebar ? tr("收起文档侧边栏") : tr("展开文档侧边栏"),
          "aria-expanded": sidebar,
          onClick: () => setSidebar((value) => !value),
        }, h(Icon, { name: sidebar ? "chevronLeft" : "chevronRight", size: 14 })),

        h("main", { className: "dc-main" },
          (error || notice) && h("div", { className: `dc-banner ${error ? "dc-error" : "dc-success"}`, role: error ? "alert" : "status" },
            h(Icon, { name: error ? "warning" : "check", size: 15 }),
            h("span", {}, error || notice),
            h("button", { type: "button", "aria-label": tr("关闭提示"), onClick: () => { setError(""); setNotice(""); } }, h(Icon, { name: "close", size: 13 }))),
          preview ? h("article", { className: "dc-preview" },
            h("header", { className: "dc-editor-head" },
              h("div", { className: "dc-editor-title" },
                h("span", { className: "dc-crumb" }, parentLabel(preview.path, library.rootName)),
                h("h1", {}, preview.name)),
              h("div", { className: "dc-editor-actions" },
                h("span", { className: "dc-readonly" }, tr("只读")),
                h("button", { type: "button", className: "dc-ghost", title: tr("复制路径"), "aria-label": tr("复制路径"), onClick: copyPath }, h(Icon, { name: "copy", size: 14 })))),
            preview.kind === "image"
              ? h("div", { className: "dc-image-view" },
                h("img", { src: preview.url, alt: preview.name }),
                h("small", {}, `${preview.mime} · ${formatBytes(preview.size)}`))
              : h("iframe", {
                className: "dc-html-frame",
                sandbox: "",
                srcDoc: preview.content,
                title: preview.name,
                referrerPolicy: "no-referrer",
              }))
          : open ? h("article", { className: "dc-editor" },
            h("header", { className: "dc-editor-head" },
              h("div", { className: "dc-editor-title" },
                h("span", { className: "dc-crumb" }, parentLabel(open.path, library.rootName)),
                h("h1", {}, nameWithoutExtension(open.name))),
              h("div", { className: "dc-editor-actions" },
                h("div", { className: "dc-mode", role: "group", "aria-label": tr("编辑模式") },
                  h("button", { type: "button", className: mode === "visual" ? "active" : "", "aria-pressed": mode === "visual", onClick: () => setMode("visual") }, tr("可视化")),
                  h("button", { type: "button", className: mode === "preview" ? "active" : "", "aria-pressed": mode === "preview", onClick: () => setMode("preview") }, tr("预览")),
                  h("button", { type: "button", className: mode === "source" ? "active" : "", "aria-pressed": mode === "source", onClick: () => setMode("source") }, tr("源码"))),
                h("button", { type: "button", className: "dc-ghost", title: tr("复制路径"), "aria-label": tr("复制路径"), onClick: copyPath }, h(Icon, { name: "copy", size: 14 })),
                dirty && h("button", { type: "button", className: "dc-ghost", disabled: busy, onClick: restore }, tr("还原")),
                h("button", { type: "button", className: "dc-primary", disabled: busy || !dirty, onClick: save }, dirty ? tr("保存") : tr("已保存")))),
            h("div", { className: `dc-content ${mode}` },
              mode === "visual"
                ? h(VisualEditor, { key: `${open.path}:${editorEpoch}`, value: draft, disabled: busy, onChange: setDraft })
                : mode === "preview"
                ? h(Markdown, { content: draft })
                : h("textarea", {
                    className: "dc-source",
                    "aria-label": tr("编辑 Markdown 源码"),
                    spellCheck: false,
                    value: draft,
                    disabled: busy,
                    onChange: (event) => setDraft(event.target.value),
                  })))
            : h("div", { className: "dc-empty" },
              h("div", { className: "dc-empty-icon" }, h(Icon, { name: "book", size: 26 })),
              h("h2", {}, tr("选择一篇文档开始阅读")),
              h("p", {}, tr("在左侧文件树中选择文档；也可以在顶栏新建文档或文件夹。")))),

        menu && h(Fragment, null,
          h("div", {
            className: "dc-menu-backdrop",
            onMouseDown: () => setMenu(null),
            onContextMenu: (event) => { event.preventDefault(); setMenu(null); },
          }),
          h("div", { className: "dc-menu", role: "menu", style: { left: menu.x, top: menu.y } },
            h("header", {}, h(Icon, { name: menu.targetKind === "document" ? "file" : menu.targetKind === "image" ? "image" : menu.targetKind === "html" ? "html" : "folder", size: 13 }), h("span", {}, menu.targetName)),
            h("button", { type: "button", role: "menuitem", onClick: () => beginCreate("document", menu.parentPath) },
              h(Icon, { name: "filePlus", size: 15 }), h("span", {}, tr("新建文档"))),
            h("button", { type: "button", role: "menuitem", onClick: () => beginCreate("folder", menu.parentPath) },
              h(Icon, { name: "folderPlus", size: 15 }), h("span", {}, tr("新建文件夹"))),
            menu.targetPath && (menu.targetKind === "folder" || menu.targetKind === "document") && h("button", { type: "button", role: "menuitem", onClick: () => beginRename(menu) },
              h(Icon, { name: "edit", size: 15 }), h("span", {}, tr("重命名"))),
            h("hr", {}),
            h("button", { type: "button", role: "menuitem", onClick: () => {
              const target = menu;
              setMenu(null);
              void copyTarget(target.targetKind, target.targetPath);
            } }, h(Icon, { name: "copy", size: 15 }), h("span", {}, tr("复制路径"))))),

        dialog && h("div", { className: "dc-overlay", onMouseDown: (event) => { if (event.target === event.currentTarget) setDialog(null); } },
          h("form", {
            className: "dc-dialog",
            role: "dialog",
            "aria-label": dialog.mode === "rename" ? tr("重命名") : dialog.kind === "folder" ? tr("新建文件夹") : tr("新建文档"),
            onSubmit: submitDialog,
          },
            h("header", {},
              h("div", { className: "dc-dialog-icon" }, h(Icon, { name: dialog.mode === "rename" ? "edit" : dialog.kind === "folder" ? "folderPlus" : "filePlus", size: 18 })),
              h("div", {},
                h("h2", {}, dialog.mode === "rename"
                  ? dialog.kind === "folder" ? tr("重命名文件夹") : tr("重命名文档")
                  : dialog.kind === "folder" ? tr("新建文件夹") : tr("新建 Markdown 文档")),
                h("p", {}, dialog.mode === "rename"
                  ? tr("重命名「{name}」", { name: dialog.name })
                  : tr("创建于 {folder}", { folder: folderName(dialog.parentPath, library.rootName) })))),
            h("label", {},
              h("span", {}, dialog.mode === "rename" ? tr("新名称") : tr("名称")),
              h("input", {
                autoFocus: true,
                "aria-label": dialog.mode === "rename" ? tr("新名称") : tr("名称"),
                value: dialog.name,
                placeholder: dialog.mode === "rename"
                  ? tr("输入新的名称")
                  : dialog.kind === "folder" ? tr("例如：项目资料") : tr("例如：会议记录"),
                onChange: (event) => setDialog({ ...dialog, name: event.target.value }),
              })),
            h("footer", {},
              h("button", { type: "button", className: "dc-ghost", onClick: () => setDialog(null) }, tr("取消")),
              h("button", { type: "submit", className: "dc-primary", disabled: busy || !dialog.name.trim() }, dialog.mode === "rename" ? tr("重命名") : tr("创建"))))));
    }

    function TreeGuides({ depth }) {
      if (!depth) return null;
      return h("span", { className: "dc-guides", "aria-hidden": "true" },
        Array.from({ length: depth }, (_, index) => h("i", { key: index, style: { left: `${22 + index * 28}px` } })));
    }

    function Tree({ entries, parentPath, depth, expanded, folder, folderSelected, openPath, onToggle, onFolder, onDocument, onContext }) {
      const children = entries
        .filter((entry) => entry.parentPath === parentPath)
        .sort((left, right) => Number(right.kind === "folder") - Number(left.kind === "folder") || left.name.localeCompare(right.name, "zh-CN"));
      return children.map((entry) => {
        const paddingLeft = 8 + depth * 28;
        if (entry.kind === "folder") {
          const isExpanded = expanded.has(entry.path);
          return h(Fragment, { key: entry.path },
            h("div", { className: `dc-tree-row dc-folder${folderSelected && folder === entry.path ? " selected" : ""}`, style: { paddingLeft }, onContextMenu: (event) => onContext(event, entry) },
              h(TreeGuides, { depth }),
              h("button", {
                type: "button",
                className: `dc-chevron${isExpanded ? " open" : ""}`,
                "aria-label": isExpanded ? tr("折叠文件夹") : tr("展开文件夹"),
                "aria-expanded": isExpanded,
                onClick: (event) => { event.stopPropagation(); onToggle(entry.path); },
              }, h(Icon, { name: "chevronRight", size: 26 })),
              h("button", {
                type: "button",
                className: "dc-row-button",
                title: tr("双击展开或折叠"),
                onClick: () => onFolder(entry),
                onDoubleClick: (event) => { event.preventDefault(); event.stopPropagation(); onToggle(entry.path); },
              },
                h(Icon, { name: "folder", size: 16 }), h("span", { className: "dc-tree-label" }, entry.name))),
            isExpanded && h(Tree, { entries, parentPath: entry.path, depth: depth + 1, expanded, folder, folderSelected, openPath, onToggle, onFolder, onDocument, onContext }));
        }
        const extension = extensionOf(entry.name);
        const baseName = extension ? entry.name.slice(0, -extension.length) : entry.name;
        const iconName = entry.kind === "image" ? "image" : entry.kind === "html" ? "html" : "file";
        return h("button", {
          key: entry.path,
          type: "button",
          className: `dc-tree-row dc-document${openPath === entry.path ? " selected" : ""}`,
          style: { paddingLeft },
          title: entry.name,
          onClick: () => onDocument(entry),
          onContextMenu: (event) => onContext(event, entry),
        },
          h(TreeGuides, { depth }),
          h("span", { className: "dc-leaf-dot", "aria-hidden": "true" }),
          h("span", { className: "dc-file-body" },
            h(Icon, { name: iconName, size: 16 }),
            h("span", { className: "dc-tree-label" }, baseName)));
      });
    }

    function DocumentCenterIcon() {
      return h("svg", {
        width: 16,
        height: 16,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
      }, ICONS.book);
    }

    // ── 样式 ──────────────────────────────────────────────────────────────
    const CSS = `
.dc-root{--dc-tree-width:268px;--dc-tree-bg:var(--dsw-alias-bg-layer-1,#fafafa);position:relative;display:grid;grid-template-columns:var(--dc-tree-width) minmax(0,1fr);grid-template-rows:minmax(0,1fr);width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1f2328);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px}
.dc-root *{box-sizing:border-box}
.dc-root button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}
.dc-root button:disabled{cursor:default;opacity:.45}
.dc-root button:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#4a90e2);outline-offset:1px}
.dc-loading,.dc-welcome-root{display:flex;align-items:center;justify-content:center}
.dc-loading-inner{display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--dsw-alias-label-tertiary,#6b7280)}
.dc-welcome{display:flex;flex-direction:column;align-items:center;max-width:480px;padding:32px;text-align:center;gap:12px}
.dc-welcome-icon,.dc-empty-icon{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-secondary,#4b5563)}
.dc-welcome h1{margin:4px 0 0;font-size:24px;font-weight:650;letter-spacing:-.02em}
.dc-welcome p{margin:0 0 4px;color:var(--dsw-alias-label-secondary,#4b5563);line-height:1.75}
.dc-welcome small{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px}
.dc-primary{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 14px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-button-primary-fill,#111827);color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:500}
.dc-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,#374151)}
.dc-ghost{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 9px;border-radius:var(--dsw-radius-sm,6px);color:var(--dsw-alias-label-secondary,#4b5563)}
.dc-ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}
.dc-tree-pane{display:flex;grid-column:1;grid-row:1;flex-direction:column;min-width:0;min-height:0;background:var(--dc-tree-bg);border-right:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.dc-tree-pane[hidden]{display:none}
.dc-tree-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:14px 12px 10px}
.dc-tree-title{display:flex;flex-direction:column;gap:3px;min-width:0}
.dc-tree-title span{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#6b7280)}
.dc-tree-title strong{overflow:hidden;font-size:13px;font-weight:600;text-overflow:ellipsis;white-space:nowrap}
.dc-tree-actions{display:flex;gap:2px;flex:none}
.dc-tree-actions button{display:grid;place-items:center;width:26px;height:26px;border-radius:6px;color:var(--dsw-alias-label-secondary,#4b5563)}
.dc-tree-actions button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}
.dc-tree-warning{margin:0;padding:0 12px 8px;color:var(--dsw-alias-state-warn-label,#92400e);font-size:11px;line-height:1.5}
.dc-tree{flex:1;min-height:0;overflow:auto;padding:4px 8px 14px}
.dc-tree-row{position:relative;display:flex;align-items:center;gap:2px;width:100%;min-height:42px;padding:0 10px;border-radius:8px;color:var(--dsw-alias-label-primary,#1f2328);font-size:14px;text-align:left}
.dc-root .dc-tree-row{font-size:14px}
.dc-tree-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.045))}
.dc-tree-row.selected{background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.07));font-weight:500}
.dc-tree-label{overflow:hidden;min-width:0;flex:1;text-overflow:ellipsis;white-space:nowrap}
.dc-tree-row small{flex:none;margin-left:2px;font-size:10px;color:var(--dsw-alias-label-tertiary,#9ca3af)}
.dc-tree-root{padding-left:8px;font-weight:600}
.dc-root-slot{display:grid;place-items:center;width:20px;height:20px;flex:none;color:var(--dsw-alias-label-tertiary,#6b7280)}
.dc-folder{padding-right:6px;font-weight:500}
.dc-row-button{display:flex;align-items:center;gap:6px;overflow:hidden;flex:1;min-height:42px;padding:0;text-align:left}
.dc-chevron{display:grid;place-items:center;width:28px;height:28px;flex:none;padding:0;border-radius:6px;color:var(--dsw-alias-label-secondary,#4b5563);transition:background .12s ease,color .12s ease}
.dc-chevron:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-secondary,#4b5563)}
.dc-chevron svg{width:26px;height:26px;transition:transform .14s ease}
.dc-chevron.open svg{transform:rotate(90deg)}
.dc-leaf-dot{display:grid;place-items:center;width:28px;height:28px;flex:none}
.dc-leaf-dot::before{content:"";width:4px;height:4px;border-radius:50%;background:var(--dsw-alias-border-l3,#c4c7cc)}
.dc-file-body{display:flex;align-items:center;gap:6px;overflow:hidden;flex:1;min-width:0}
.dc-document{padding-right:10px;font-weight:400}
.dc-document:hover .dc-leaf-dot::before{background:var(--dsw-alias-label-tertiary,#6b7280)}
.dc-guides{position:absolute;inset:0;pointer-events:none}
.dc-guides i{position:absolute;top:0;bottom:0;width:1px;background:var(--dsw-alias-border-l1,rgba(0,0,0,.08));opacity:.8}
.dc-root-path{display:flex;align-items:center;width:100%;gap:6px;padding:9px 12px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px;text-align:left}
.dc-root-path:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));color:var(--dsw-alias-label-secondary,#4b5563)}
.dc-root-path span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-collapse{position:absolute;top:50%;left:var(--dc-tree-width);z-index:2;display:grid;place-items:center;width:18px;height:56px;padding:0;transform:translate(-1px,-50%);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-left:0;border-radius:0 10px 10px 0;background:var(--dc-tree-bg);color:var(--dsw-alias-label-tertiary,#6b7280);box-shadow:2px 0 6px rgba(0,0,0,.05);transition:width .16s ease,box-shadow .16s ease,color .16s ease,background .16s ease}
.dc-collapse:hover{width:24px;box-shadow:6px 0 14px rgba(0,0,0,.14);color:var(--dsw-alias-label-primary,#111827);background:var(--dc-tree-bg)}
.dc-collapse:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-focus-ring-color,#4a90e2) 30%,transparent)}
.dc-root.dc-sidebar-hidden{grid-template-columns:0 minmax(0,1fr)}
.dc-root.dc-sidebar-hidden .dc-collapse{left:0;width:16px;transform:translateY(-50%);border-radius:0 9px 9px 0;box-shadow:2px 0 8px rgba(0,0,0,.06)}
.dc-root.dc-sidebar-hidden .dc-collapse:hover{width:22px;box-shadow:6px 0 14px rgba(0,0,0,.14)}
.dc-root.dc-sidebar-hidden .dc-main{padding-left:16px}
.dc-main{display:flex;grid-column:2;grid-row:1;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.dc-banner{display:flex;align-items:center;gap:8px;margin:12px 18px 0;padding:8px 10px;border-radius:8px;font-size:12px}
.dc-banner span{flex:1;min-width:0}
.dc-banner button{display:grid;place-items:center;width:20px;height:20px;border-radius:5px;flex:none}
.dc-banner.dc-error{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 10%,transparent);color:var(--dsw-alias-state-error-primary,#b91c1c)}
.dc-banner.dc-success{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 10%,transparent);color:var(--dsw-alias-state-success-primary,#15803d)}
.dc-banner.dc-warning{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d97706) 12%,transparent);color:var(--dsw-alias-state-warn-label,#92400e)}
.dc-preview{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
.dc-readonly{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px}
.dc-image-view{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;background:var(--dsw-alias-bg-base,#fff)}
.dc-image-view img{max-width:100%;max-height:calc(100% - 28px);object-fit:contain;border-radius:6px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.08)}
.dc-image-view small{color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px}
.dc-html-frame{flex:1;width:100%;min-height:0;border:0;background:#fff}
.dc-editor{display:flex;flex-direction:column;min-height:0;flex:1}
.dc-editor-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;padding:18px 26px 12px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.dc-editor-title{min-width:0}
.dc-crumb{display:block;overflow:hidden;margin-bottom:4px;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.dc-editor-title h1{overflow:hidden;margin:0;font-size:20px;font-weight:650;letter-spacing:-.02em;text-overflow:ellipsis;white-space:nowrap}
.dc-editor-actions{display:flex;align-items:center;gap:6px;flex:none}
.dc-mode{display:flex;gap:2px;padding:2px;border-radius:7px;background:var(--dsw-alias-bg-layer-2,#f3f4f6)}
.dc-mode button{height:24px;padding:0 9px;border-radius:5px;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px}
.dc-mode button.active{background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#111827);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.dc-content{display:flex;flex-direction:column;flex:1;min-height:0;overflow:auto}
.dc-content.preview{padding:22px 28px 60px}
.dc-content.visual{padding:0}
.dc-content.source{padding:0}
.dc-visual{position:relative;flex:1;min-height:0;overflow:auto;padding:20px 28px 60px}
.dc-visual-root{max-width:820px;margin:0 auto}
.dc-visual.disabled{opacity:.7;pointer-events:none}
.dc-visual .milkdown{min-height:320px;background:transparent;--crepe-font-default:var(--dsw-font-family,system-ui,sans-serif);--crepe-font-title:var(--dsw-font-family,system-ui,sans-serif);--crepe-font-code:var(--dsw-font-family-code,ui-monospace,monospace)}
.dc-visual .milkdown .ProseMirror{width:min(100%,820px);margin:0 auto;padding:8px 0 100px;line-height:1.75}
.dc-visual .milkdown .ProseMirror>:first-child{margin-top:0}
.dc-visual .milkdown .ProseMirror h1,.dc-visual .milkdown .ProseMirror h2,.dc-visual .milkdown .ProseMirror h3,.dc-visual .milkdown .ProseMirror h4{font-weight:700}
.dc-visual .milkdown .milkdown-slash-menu{width:min(300px,calc(100% - 24px));max-width:calc(100vw - 32px);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 12px 32px rgba(0,0,0,.14),0 1px 4px rgba(0,0,0,.05);overflow:hidden;animation:dc-slash-in .12s ease-out}
.dc-visual .milkdown .milkdown-slash-menu .tab-group{display:none}
.dc-visual .milkdown .milkdown-slash-menu .menu-groups{padding:5px;max-height:min(268px,calc(100vh - 200px))}
.dc-visual .milkdown .milkdown-slash-menu .menu-groups::-webkit-scrollbar{width:5px}
.dc-visual .milkdown .milkdown-slash-menu .menu-groups::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:3px}
.dc-visual .milkdown .milkdown-slash-menu .menu-group h6{display:none}
.dc-visual .milkdown .milkdown-slash-menu .menu-group ul{display:flex;flex-direction:column;gap:2px;margin:0;padding:0}
.dc-visual .milkdown .milkdown-slash-menu .menu-group + .menu-group{margin-top:3px}
.dc-visual .milkdown .milkdown-slash-menu .menu-group + .menu-group::before{display:none}
.dc-visual .milkdown .milkdown-slash-menu .menu-group li{min-width:0;width:100%;display:flex;align-items:center;gap:9px;min-height:36px;padding:7px 9px;border-radius:7px}
.dc-visual .milkdown .milkdown-slash-menu .menu-group li.hover,.dc-visual .milkdown .milkdown-slash-menu .menu-group li.active,.dc-visual .milkdown .milkdown-slash-menu .menu-group li:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}
.dc-visual .milkdown .milkdown-slash-menu .menu-group li svg{width:18px;height:18px;flex:none;color:var(--dsw-alias-label-tertiary,#6b7280);fill:currentColor}
.dc-visual .milkdown .milkdown-slash-menu .menu-group li > span:not(.dc-slash-hint){min-width:0;overflow:hidden;font-size:12px;font-weight:500;line-height:1.4;color:var(--dsw-alias-label-primary,#111827);text-overflow:ellipsis;white-space:nowrap}
.dc-visual .milkdown .milkdown-slash-menu .menu-group li > .dc-slash-hint{margin-left:auto;flex:none;font-family:var(--dsw-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:10px;font-weight:400;line-height:1.4;color:var(--dsw-alias-label-tertiary,#9ca3af);letter-spacing:.01em}
@keyframes dc-slash-in{from{opacity:0}to{opacity:1}}
.dc-visual-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px}
.dc-visual-error{color:var(--dsw-alias-state-error-primary,#b91c1c)}
.dc-spinner{width:14px;height:14px;border:2px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));border-top-color:var(--dsw-alias-brand-primary,#2563eb);border-radius:50%;animation:dc-spin .8s linear infinite}
@keyframes dc-spin{to{transform:rotate(360deg)}}
body[data-ds-dark-theme] .dc-visual .milkdown{--crepe-color-background:var(--dsw-alias-bg-base,#151517);--crepe-color-on-background:var(--dsw-alias-label-primary,#e8eaed);--crepe-color-surface:var(--dsw-alias-bg-layer-1,#1c1c1e);--crepe-color-surface-low:var(--dsw-alias-bg-layer-2,#242426);--crepe-color-on-surface:var(--dsw-alias-label-primary,#e8eaed);--crepe-color-on-surface-variant:var(--dsw-alias-label-secondary,#cfd3d6);--crepe-color-outline:var(--dsw-alias-border-l2,rgba(255,255,255,.2));--crepe-color-primary:var(--dsw-alias-label-primary,#e8eaed);--crepe-color-secondary:var(--dsw-alias-bg-layer-3,#2a2a2c);--crepe-color-on-secondary:var(--dsw-alias-label-primary,#e8eaed);--crepe-color-inline-code:var(--dsw-alias-markdown-inline-code,#f28b82);--crepe-color-hover:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));--crepe-color-selected:var(--dsw-alias-interactive-bg-active,rgba(255,255,255,.12))}
.dc-source{display:block;width:100%;height:100%;min-height:0;padding:24px 30px 60px;border:0;outline:none;resize:none;background:transparent;color:inherit;font-family:var(--dsw-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:13px;line-height:1.75;tab-size:2}
.dc-markdown{max-width:820px;margin:0 auto;line-height:1.78}
.dc-markdown h1,.dc-markdown h2,.dc-markdown h3,.dc-markdown h4{margin:1.4em 0 .55em;line-height:1.3;font-weight:700;letter-spacing:-.015em}
.dc-markdown h1{font-size:1.9em;margin-top:0}
.dc-markdown h2{font-size:1.45em}
.dc-markdown h3{font-size:1.18em}
.dc-markdown p{margin:.7em 0}
.dc-markdown ul,.dc-markdown ol{margin:.7em 0;padding-left:1.5em}
.dc-markdown li{margin:.22em 0}
.dc-markdown li input{margin-right:.4em;vertical-align:-2px}
.dc-markdown code{padding:.12em .35em;border-radius:4px;background:var(--dsw-alias-markdown-inline-code,rgba(0,0,0,.06));font-family:var(--dsw-font-markdown-code-font-family,ui-monospace,monospace);font-size:.92em}
.dc-markdown pre{overflow:auto;margin:1em 0;padding:14px 16px;border-radius:8px;background:var(--dsw-alias-markdown-code-block,#f6f8fa);line-height:1.6}
.dc-markdown pre code{padding:0;background:none;font-size:.9em}
.dc-markdown blockquote{margin:1em 0;padding:.2em 0 .2em 14px;border-left:3px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));color:var(--dsw-alias-label-secondary,#4b5563)}
.dc-markdown hr{margin:1.6em 0;border:0;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1))}
.dc-markdown a{color:var(--dsw-alias-link,#2563eb);text-decoration:none}
.dc-markdown a:hover{text-decoration:underline}
.dc-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:10px;padding:40px;text-align:center}
.dc-empty h2{margin:6px 0 0;font-size:17px;font-weight:600}
.dc-empty p{margin:0;color:var(--dsw-alias-label-tertiary,#6b7280);line-height:1.7}
.dc-menu-backdrop{position:fixed;inset:0;z-index:40}
.dc-menu{position:fixed;z-index:41;width:196px;padding:5px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 12px 32px rgba(0,0,0,.16)}
.dc-menu header{display:flex;align-items:center;gap:6px;padding:6px 8px 7px;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:11px}
.dc-menu header span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-menu button{display:flex;align-items:center;gap:8px;width:100%;height:30px;padding:0 8px;border-radius:6px;color:var(--dsw-alias-label-primary,#111827);font-size:12px;text-align:left}
.dc-menu button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}
.dc-menu hr{margin:4px 6px;border:0;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08))}
.dc-overlay{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:24px;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.32))}
.dc-dialog{width:min(380px,100%);padding:18px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.1));border-radius:var(--dsw-radius-lg,12px);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:var(--dsw-elevation-prominent,0 18px 48px rgba(0,0,0,.18))}
.dc-dialog header{display:flex;align-items:flex-start;gap:10px}
.dc-dialog-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--dsw-alias-bg-layer-2,#f3f4f6);flex:none}
.dc-dialog h2{margin:0 0 3px;font-size:15px;font-weight:600}
.dc-dialog p{margin:0;color:var(--dsw-alias-label-tertiary,#6b7280);font-size:12px}
.dc-dialog label{display:flex;flex-direction:column;gap:6px;margin:16px 0 18px;font-size:12px;color:var(--dsw-alias-label-secondary,#4b5563)}
.dc-dialog input{height:34px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.16));border-radius:7px;background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;outline:none}
.dc-dialog input:focus{border-color:var(--dsw-alias-brand-primary,#2563eb);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary,#2563eb) 18%,transparent)}
.dc-dialog footer{display:flex;justify-content:flex-end;gap:8px}
@media (max-width:900px){.dc-root{--dc-tree-width:232px}.dc-content.preview{padding:20px 20px 48px}.dc-visual{padding:20px 20px 48px}.dc-editor-head{padding:14px 18px 10px}.dc-editor-title h1{font-size:17px}}
`;

    // ── 插件导出 ──────────────────────────────────────────────────────────
    function apply(ctx) {
      localeCtx = ctx;
      ctx.effect(() => ctx.locale.register(NS, { en }), "document-center: locale");
      tr = ctx.locale.bind(NS);
      const style = document.createElement("style");
      style.dataset.documentCenter = "true";
      style.textContent = `${MILKDOWN_CSS}\n${CSS}`;
      document.head.appendChild(style);
      ctx.effect(() => () => style.remove(), "document-center: styles");

      ctx.slots.inject("main", () => ctx.slots.register({
        name: "main",
        key: PANEL_ID,
        locale: NS,
      }, DocumentCenterPage));

      ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 10,
        label: () => tr("文档中心"),
        locale: NS,
      }, DocumentCenterIcon));
    }

    export const name = "document-center";
    export const inject = ["slots", "locale"];
    export { apply };
