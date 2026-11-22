# 文档中心（DSH 插件）

把 DayDeck 的「文档中心」搬到 DeepSeek Harness：在 DSH 侧栏打开一个独立的本地
Markdown 文档库，与当前会话 / workspace 无关。

## 运行范围

当前版本面向 **DSH Desktop 本地运行**：文档库是 DSH Host 所在机器的本地目录，
目录选择使用系统原生对话框。远程 Web、SSH、无原生对话框的环境不会替换成
应用内目录浏览器；已配置的文档库仍可读写，但“选择/更换文档库”会禁用并提示
“仅桌面本地模式”。详见 [PLATFORMS.md](docs/PLATFORMS.md)。

## 当前能力（MVP）

- 侧栏「文档中心」入口 + 整页工作台
- 选择一个本地目录作为文档库，目录、Markdown、图片和 HTML 在左侧树中展示；进入时默认展开各级目录
- 左侧树采用大行高、独立箭头、文件叶节点圆点、层级引导线和简洁文件名，根目录操作放在标题/空白区域右键
- 双击文件夹名称展开/折叠该目录；单击只选中，箭头按钮仍可单击切换
- 打开、可视化即时编辑（Milkdown Crepe）、Markdown 预览、源码编辑、保存
- 只读浏览图片（`.png`、`.jpg`/`.jpeg`、`.gif`、`.webp`、`.svg`、`.bmp`、`.avif`、`.ico`，单张上限 16 MiB）
- 只读浏览 HTML（`.html`/`.htm`，上限 2 MiB）；在 `sandbox=""` 的 iframe 中渲染，脚本、表单、弹窗均被禁用
- 可视化编辑支持 `/` 命令菜单、标题/列表/待办/引用/代码块/表格、任务框点击，以及 `/daiban`、`/todo`、`/h1` 等别名
- `/` 菜单使用图标 + 简洁中文标签 + 右侧别名提示，支持输入别名过滤
- 保存使用文件身份 + 内容摘要组成的 revision；外部修改时拒绝覆盖并保留草稿
- 新建单层文件夹、新建 Markdown 文档
- 从浏览器文件选择器批量导入 `.md`（目标目录内排他写入，失败回滚）
- 右键菜单：新建文档、新建文件夹、重命名、复制路径
- 重命名文件夹或文档；重命名文件夹时，已打开文档的路径会自动跟随，脏草稿会先要求保存
- 复制文档或文档库的绝对路径
- 侧栏折叠把手是目录栏边界上的一体化凸起标签：背景与目录栏一致、左侧无边线、右侧圆角，悬停时加深阴影并展开，收起后贴住主区左边缘
- 路径校验：只接受文档库内相对路径，拒绝 `..`、控制字符、符号链接、非普通文件
- 正文 2 MiB 上限、UTF-8 校验、目录 20 层 / 5000 条目上限

## 尚未实现

- 图片和 HTML 不支持编辑、重命名
- HTML 内的相对路径资源暂不解析到文档库（绝对 URL 正常加载）
- 多文档库、搜索、标签、重命名、移动、删除

## 语言

界面文案通过 `ctx.locale` 注册中文/英文，默认中文；文件系统错误码对应的提示
也提供英文映射。切换 DSH 语言后重新打开面板即可看到对应文案。

## 安装

包内同时声明 `dsh.bundle` 与 `dsh.client`，因此它是一个组合包：

```sh
dsh plugin --profile desktop add /path/to/dsh-document-center
```

也可以打成 tarball 后安装：

```sh
pnpm pack
dsh plugin --profile desktop add ./dsh-document-center-0.1.0.tgz
```

在 DSH Web / Desktop 的 **Plugins** 页启用后，侧栏出现「文档中心」。
Host 半身通过 `/api/document-center` 暴露给浏览器，只接受已经过 connection
admission 的 owner 请求。

## 数据位置

- 文档库根路径：`$DSH_HOME/document-center/config.json`
  （默认 `~/.dsh/document-center/config.json`，内容 `{ version: 1, rootPath }`）
- 正文始终保存在用户选择的原目录，不存副本、不存索引。

## 安全边界

- 浏览器只提交文档库内的相对路径；Host 每次操作都重新校验根目录与目标。
- API 路由注册在 connection 的 exact Fetch 路由上，由 `/api` bridge 完成鉴权；
  没有 cookie 的请求到不了 handler。
- 不向渲染层回传文档正文以外的文件系统信息（根路径本身需要用于展示与复制）。
- 远程部署时默认仍受 connection 的 owner 认证保护；如需禁用写操作，可在后续版本
  增加 loopback-only 开关。

## 发布与兼容

- [UPGRADING.md](docs/UPGRADING.md) — DSH 版本耦合点与升级 smoke test
- [PLATFORMS.md](docs/PLATFORMS.md) — macOS/Windows/Linux/远程支持矩阵
- [RELEASING.md](docs/RELEASING.md) — tarball、npm 和包名/scope 约定

## 开发

```sh
npm install
npm run build:client
npm test
```

`client.js` 由 `scripts/build-client.mjs` 从 `src/client` 生成：esbuild 将
Milkdown 及主题 CSS 打包进 bundle，`react` 保持 external 交给 DSH shell。
源码在 `src/client`，构建产物 `client.js` 随包提交。
