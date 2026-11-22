export const NS = "documentCenter";

/**
 * Chinese is the source language: missing English keys fall back to the
 * original Chinese text. Keys are the complete UI strings, so `tr()` can be
 * used directly on literals without inventing key names.
 */
export const en = {
  "文档中心": "Document Center",
  "文档库": "Library",
  "文档目录": "Document tree",
  "建立你的文档中心": "Set up your Document Center",
  "选择一个本地文件夹，DayDeck 会在原位置管理其中的 Markdown 文档。文件始终保存在本地，不会发送给模型。":
    "Choose a local folder. DayDeck manages the Markdown files in place. Files stay local and are never sent to the model.",
  "选择文件夹": "Choose folder",
  "正在选择…": "Choosing…",
  "正在读取文档库…": "Reading library…",
  "准备文档中心…": "Preparing Document Center…",
  "之后可以随时在文档库中右键或使用顶栏更换目录。":
    "You can change the folder later from the tree context menu or the top bar.",
  "请从 DSH 桌面应用本地启动后再选择文档库。":
    "Start DSH from the desktop app locally before choosing a library.",
  "仅支持桌面本地模式": "Desktop local mode only",
  "仅支持 DSH 桌面本地模式": "DSH Desktop local mode only",
  "仅桌面本地模式 · 文档库位于 Host 本地磁盘": "Desktop local mode · library lives on the Host disk",
  "当前 DSH 不是桌面本地模式，无法打开系统目录选择器。":
    "DSH is not running as the local desktop app, so the system folder picker is unavailable.",
  "当前 DSH 不是桌面本地模式，无法打开系统目录选择器；文档中心仅支持 DSH 桌面应用本地运行。":
    "DSH is not running as the local desktop app, so the system folder picker is unavailable. Document Center requires DSH Desktop in local mode.",
  "刷新文档库": "Refresh library",
  "更换文档库": "Change library",
  "复制文档库路径": "Copy library path",
  "复制路径": "Copy path",
  "导入 Markdown": "Import Markdown",
  "路径已复制": "Path copied",
  "无法复制路径，请检查系统剪贴板后重试。":
    "Could not copy the path. Check your clipboard and try again.",
  "文档库已就绪": "Library ready",
  "已取消选择": "Selection cancelled",
  "当前文档已不在文档库中": "The document is no longer in the library",
  "选择一篇文档开始阅读": "Select a document to start reading",
  "在左侧文件树中选择文档；也可以在顶栏新建文档或文件夹。":
    "Select a document on the left, or create one from the top bar.",
  "新建文档": "New document",
  "新建文件夹": "New folder",
  "新建 Markdown 文档": "New Markdown document",
  "创建": "Create",
  "取消": "Cancel",
  "名称": "Name",
  "新名称": "New name",
  "输入新的名称": "Enter a new name",
  "例如：项目资料": "e.g. Project files",
  "例如：会议记录": "e.g. Meeting notes",
  "重命名": "Rename",
  "重命名文件夹": "Rename folder",
  "重命名文档": "Rename document",
  "已重命名": "Renamed",
  "文件夹已创建": "Folder created",
  "文档已创建，可以开始编辑": "Document created. You can start editing.",
  "已保存": "Saved",
  "保存": "Save",
  "已保存到本地文档": "Saved to local document",
  "还原": "Restore",
  "已还原未保存的修改": "Unsaved changes restored",
  "可视化": "Visual",
  "预览": "Preview",
  "源码": "Source",
  "只读": "Read-only",
  "编辑模式": "Editor mode",
  "双击展开或折叠": "Double-click to expand or collapse",
  "展开文件夹": "Expand folder",
  "折叠文件夹": "Collapse folder",
  "展开文档侧边栏": "Show document sidebar",
  "收起文档侧边栏": "Hide document sidebar",
  "关闭提示": "Dismiss",
  "操作失败，请稍后重试。": "Operation failed. Try again.",
  "登录状态已失效，请刷新页面后重试。":
    "Your session has expired. Refresh the page and try again.",
  "正在加载编辑器…": "Loading editor…",
  "可视化编辑器加载失败，请切换到「源码」继续编辑。":
    "The visual editor failed to load. Switch to Source to continue.",
  "无法显示这张图片。": "Could not display this image.",
  "只能导入 .md 文件。": "Only .md files can be imported.",
  "请先保存或还原当前修改，再刷新文档库。":
    "Save or restore your changes before refreshing the library.",
  "请先保存或还原当前修改，再打开其他文件。":
    "Save or restore your changes before opening another file.",
  "请先保存或还原当前修改，再打开其他文档。":
    "Save or restore your changes before opening another document.",
  "请先保存或还原当前修改，再新建其他文档。":
    "Save or restore your changes before creating another document.",
  "请先保存或还原当前修改，再更换文档库。":
    "Save or restore your changes before changing the library.",
  "请先保存或还原当前修改，再重命名。":
    "Save or restore your changes before renaming.",
  "编辑 Markdown 源码": "Edit Markdown source",

  "已导入 {count} 个 Markdown 文档": "Imported {count} Markdown documents",
  "重命名「{name}」": "Rename “{name}”",
  "创建于 {folder}": "Create in {folder}",
  "请求失败（HTTP {status}）。": "Request failed (HTTP {status}).",

  "文档库配置无效，请重新选择目录。":
    "The library configuration is invalid. Choose the folder again.",
  "文档库目录不存在或无法访问，请重新选择目录。":
    "The library folder is missing or inaccessible. Choose the folder again.",
  "文档路径无效或已超出当前文档库。":
    "The file path is invalid or outside the current library.",
  "名称无效，请使用不含斜杠和控制字符的名称。":
    "Invalid name. Use a name without slashes or control characters.",
  "文档中心目前只支持普通的 .md 文件。":
    "Document Center currently supports only regular .md files.",
  "无法读取文档，请检查文件权限后重试。":
    "Could not read the document. Check permissions and try again.",
  "无法写入文档，请检查目录权限和磁盘空间。":
    "Could not write the document. Check folder permissions and disk space.",
  "同一位置已经存在同名文件或文件夹。":
    "A file or folder with that name already exists.",
  "文档已在外部修改，未覆盖原文件；当前草稿仍保留。":
    "The document changed outside Document Center. The original was not overwritten; your draft is preserved.",
  "文档不是有效的 UTF-8 文本。": "The document is not valid UTF-8 text.",
  "单个文档不能超过 2 MiB。": "A document cannot exceed 2 MiB.",
  "单张图片不能超过 16 MiB。": "An image cannot exceed 16 MiB.",
  "文档库条目过多或目录层级过深，请缩小文档库范围。":
    "The library has too many entries or is nested too deeply. Choose a smaller folder.",
  "文档内容或版本信息无效。": "The document content or revision is invalid.",
  "不能重命名文档库根目录。": "The library root cannot be renamed.",
  "文档中心只支持 Markdown、图片和 HTML 文件。":
    "Document Center supports only Markdown, images, and HTML.",
  "当前运行环境没有系统目录选择器，文档中心仅支持 DSH 桌面本地模式。":
    "No system folder picker is available. Document Center requires DSH Desktop in local mode.",
  "当前 DSH 以远程或无界面方式启动，文档中心仅支持 DSH 桌面本地模式。":
    "DSH is running remotely or without a display. Document Center requires DSH Desktop in local mode.",
  "当前运行环境不支持系统目录选择，文档中心仅支持 DSH 桌面本地模式。":
    "This environment has no system folder picker. Document Center requires DSH Desktop in local mode.",
  "请求内容不是有效的 JSON。": "The request body is not valid JSON.",
  "未知的文档中心操作。": "Unknown Document Center action.",

  "文本": "Text",
  "正文 zw zhengwen": "Text zw zhengwen",
  "大标题 h1 biaoti1": "H1 h1 biaoti1",
  "中标题 h2 biaoti2": "H2 h2 biaoti2",
  "小标题 h3 biaoti3": "H3 h3 biaoti3",
  "四级标题 h4 biaoti4": "H4 h4 biaoti4",
  "引述文字 yswz yinshu": "Quote yswz yinshu",
  "分割线 fgx fengexian": "Divider fgx fengexian",
  "列表 lb wuxu": "List lb wuxu",
  "数字列表 szlb shuzi": "Numbered szlb shuzi",
  "待办列表 daiban db": "To-do daiban db",
  "更多": "More",
  "代码块 dm daima": "Code dm daima",
  "表格 bg biaoge": "Table bg biaoge",
};
