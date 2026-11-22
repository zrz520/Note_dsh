import os from "node:os";
import path from "node:path";
import { DocumentLibrary } from "./lib/library.js";

export const name = "document-center";

const API_PATH = "/api/document-center";

function json(body, status = 200) {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function failure(error) {
  const code = typeof error?.code === "string" ? error.code : "DOCUMENT_CENTER_INTERNAL";
  const message = typeof error?.message === "string" && error.message ? error.message : "操作失败，请稍后重试。";
  return json({ ok: false, error: { code, message } });
}

function resolveHome() {
  const configured = process.env.DSH_HOME;
  return typeof configured === "string" && configured.trim() ? configured : path.join(os.homedir(), ".dsh");
}

function pickerKind(ctx) {
  const picker = ctx.get("directoryPicker");
  if (picker === undefined) return "unavailable";
  try {
    const capability = picker.capability();
    if (capability?.kind === "native" || capability?.kind === "browse") return capability.kind;
  } catch {}
  return "unavailable";
}

export function apply(ctx) {
  const library = new DocumentLibrary({
    configPath: path.join(resolveHome(), "document-center", "config.json"),
  });

  let pending = Promise.resolve();
  const serialize = (operation) => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };

  const handlers = {
    state: () => library.state(),
    capabilities: () => ({ picker: pickerKind(ctx) }),
    async "select-root"() {
      const picker = ctx.get("directoryPicker");
      if (picker === undefined) {
        throw Object.assign(new Error("当前运行环境没有系统目录选择器，文档中心仅支持 DSH 桌面本地模式。"), { code: "DOCUMENT_CENTER_PICKER_UNAVAILABLE" });
      }
      const capability = picker.capability();
      if (capability.kind === "browse") {
        throw Object.assign(new Error("当前 DSH 以远程或无界面方式启动，文档中心仅支持 DSH 桌面本地模式。"), { code: "DOCUMENT_CENTER_PICKER_BROWSE" });
      }
      if (capability.kind !== "native") {
        throw Object.assign(new Error("当前运行环境不支持系统目录选择，文档中心仅支持 DSH 桌面本地模式。"), { code: "DOCUMENT_CENTER_PICKER_UNAVAILABLE" });
      }
      const picked = await capability.pick();
      return picked === null ? null : await library.selectRoot(picked);
    },
    open: (input) => library.openDocument(input?.path),
    "open-file": (input) => library.openFile(input?.path),
    save: (input) => library.saveDocument(input),
    "create-folder": (input) => library.createFolder(input?.parentPath, input?.name),
    "create-document": (input) => library.createDocument(input?.parentPath, input?.name),
    "import-documents": (input) => library.importContents(input?.parentPath, input?.files),
    rename: (input) => library.renameEntry(input),
  };

  ctx.inject(["connection"], (scope) => {
    scope.effect(() => scope.connection.fetch.register({
      path: API_PATH,
      methods: ["POST"],
      requestBody: "buffered",
      async fetch(request) {
        let input;
        try {
          input = await request.json();
        } catch {
          return json({ ok: false, error: { code: "DOCUMENT_CENTER_INPUT", message: "请求内容不是有效的 JSON。" } }, 400);
        }
        const action = input?.action;
        const handler = typeof action === "string" ? handlers[action] : undefined;
        if (handler === undefined) {
          return json({ ok: false, error: { code: "DOCUMENT_CENTER_ACTION", message: "未知的文档中心操作。" } }, 400);
        }
        try {
          return json({ ok: true, data: await serialize(() => handler(input)) });
        } catch (error) {
          return failure(error);
        }
      },
    }), `document-center: ${API_PATH}`);
  });
}
