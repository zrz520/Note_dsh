import { CrepeBuilder } from "@milkdown/crepe/builder";
import { blockEdit } from "@milkdown/crepe/feature/block-edit";
import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";
import { listItem } from "@milkdown/crepe/feature/list-item";
import { placeholder } from "@milkdown/crepe/feature/placeholder";
import { table } from "@milkdown/crepe/feature/table";
import { toolbar } from "@milkdown/crepe/feature/toolbar";
import { editorViewCtx } from "@milkdown/kit/core";
import { MILKDOWN_CSS } from "./generated-milkdown-css.js";

export { MILKDOWN_CSS };

function blockEditConfig(translate) {
  return {
  blockHandle: { shouldShow: () => false },
  textGroup: {
    label: translate("文本"),
    text: { label: translate("正文 zw zhengwen") },
    h1: { label: translate("大标题 h1 biaoti1") },
    h2: { label: translate("中标题 h2 biaoti2") },
    h3: { label: translate("小标题 h3 biaoti3") },
    h4: { label: translate("四级标题 h4 biaoti4") },
    h5: null,
    h6: null,
    quote: { label: translate("引述文字 yswz yinshu") },
    divider: { label: translate("分割线 fgx fengexian") },
  },
  listGroup: {
    label: translate("列表"),
    bulletList: { label: translate("列表 lb wuxu") },
    orderedList: { label: translate("数字列表 szlb shuzi") },
    taskList: { label: translate("待办列表 daiban db") },
  },
  advancedGroup: {
    label: translate("更多"),
    codeBlock: { label: translate("代码块 dm daima") },
    table: { label: translate("表格 bg biaoge") },
    image: null,
    math: null,
  },
  };
}

/**
 * Crepe renders the label text as one span. Keep the aliases in the config so
 * filtering still works, but show a clean label plus a right-aligned hint.
 */
function decorateSlashMenu(root) {
  const menu = root.querySelector(".milkdown-slash-menu");
  if (!menu) return;
  for (const item of menu.querySelectorAll(".menu-group li")) {
    const label = item.querySelector(":scope > span:not(.milkdown-icon)");
    if (!label || label.dataset.dcDecorated === "true") continue;
    const parts = (label.textContent || "").trim().split(/\s+/);
    if (parts.length < 2) continue;
    label.textContent = parts[0];
    label.dataset.dcDecorated = "true";
    const hint = document.createElement("span");
    hint.className = "dc-slash-hint";
    hint.textContent = `/${parts[1]}`;
    item.appendChild(hint);
  }
}

function isTaskListItem(node) {
  return typeof node?.attrs?.checked === "boolean";
}

function findTaskListItem(view, dom) {
  let domPosition;
  try {
    domPosition = view.posAtDOM(dom, 0);
  } catch {
    return null;
  }
  for (const position of [domPosition, domPosition - 1]) {
    if (position < 0) continue;
    const node = view.state.doc.nodeAt(position);
    if (isTaskListItem(node)) return { node, position };
  }
  try {
    const resolved = view.state.doc.resolve(domPosition);
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth);
      if (isTaskListItem(node)) return { node, position: resolved.before(depth) };
    }
  } catch {
    return null;
  }
  return null;
}

function toggleTaskListItemFromPointer(event, view) {
  if ((event.button ?? 0) !== 0 || !view?.editable) return false;
  const label = event.target?.closest?.(".label-wrapper");
  const block = label?.closest?.(".milkdown-list-item-block");
  if (!block) return false;
  const task = findTaskListItem(view, block);
  if (!task) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
  if (!view.hasFocus?.()) view.focus?.();
  view.dispatch(view.state.tr.setNodeAttribute(task.position, "checked", !task.node.attrs.checked));
  return true;
}

export async function createLiveMarkdownEditor({ root, markdown, onChange, translate = (text) => text }) {
  if (!root) throw new TypeError("可视化编辑器缺少挂载节点");

  const crepe = new CrepeBuilder({ root, defaultValue: markdown })
    .addFeature(listItem)
    .addFeature(blockEdit, blockEditConfig(translate))
    .addFeature(toolbar)
    .addFeature(linkTooltip)
    .addFeature(table)
    .addFeature(placeholder, {
      text: "输入 / 可插入标题、待办和列表",
      mode: "block",
    });

  crepe.on((listener) => {
    listener.markdownUpdated((_context, nextMarkdown, previousMarkdown) => {
      if (nextMarkdown !== previousMarkdown) onChange(nextMarkdown);
    });
  });

  try {
    await crepe.create();
  } catch (error) {
    await crepe.destroy().catch(() => {});
    throw error;
  }

  const editorView = crepe.editor.action((context) => context.get(editorViewCtx));
  const onTaskPointerDown = (event) => toggleTaskListItemFromPointer(event, editorView);
  root.addEventListener("pointerdown", onTaskPointerDown, true);

  let slashFrame = 0;
  const scheduleSlashDecoration = () => {
    if (slashFrame) return;
    slashFrame = requestAnimationFrame(() => {
      slashFrame = 0;
      decorateSlashMenu(root);
    });
  };
  const slashObserver = new MutationObserver(scheduleSlashDecoration);
  slashObserver.observe(root, { childList: true, subtree: true });
  decorateSlashMenu(root);
  const editable = root.querySelector?.("[contenteditable='true']") ?? null;
  if (editable) {
    editable.setAttribute("aria-label", "可视化 Markdown 编辑器");
    editable.setAttribute("spellcheck", "false");
    editable.setAttribute("autocorrect", "off");
    editable.setAttribute("autocapitalize", "off");
  }

  return {
    getMarkdown: () => crepe.getMarkdown(),
    destroy: () => {
      root.removeEventListener("pointerdown", onTaskPointerDown, true);
      slashObserver.disconnect();
      if (slashFrame) cancelAnimationFrame(slashFrame);
      return crepe.destroy();
    },
  };
}
