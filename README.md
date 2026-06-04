# FastTrMail Tampermonkey

[English](README.en.md)

这是 `FastTrMail` 的独立 Tampermonkey 仓库，只面向 Fastmail 页面运行。

## 功能范围

- 仅匹配 `https://app.fastmail.com/*`
- 仅保留 `edge-web` 翻译能力
- 保留主题和正文的“追加在原文下方”翻译模式
- 保留再次点击按钮恢复原文的交互
- 保留 Fastmail 邮件线程工具栏内的按钮位置
- 仅保留一个设置项：`targetLanguage`

## 设置入口

- Tampermonkey 菜单命令：`FastTrMail 设置`
- 页面内弹窗：选择目标语言并保存

## 本地开发

```bash
npm install
npm test
npm run build
```

构建产物输出到：

- `dist/fasttrmail.user.js`
- `dist/fasttrmail-tampermonkey-<version>.user.js`

## 安装

1. 在浏览器中安装 Tampermonkey。
2. 打开 `dist/fasttrmail.user.js`。
3. 导入并启用脚本。
4. 打开 Fastmail 邮件线程页，工具栏会出现 `翻译` 按钮。

## 模块边界

- `src/fastmail/`: Fastmail DOM 识别、线程与正文定位、正文分段
- `src/translation/`: Edge 鉴权、翻译请求、取消控制
- `src/ui/`: 按钮、翻译渲染、设置弹窗、样式
- `src/core/`: 运行时状态、页面生命周期、应用编排
- `src/platform/`: Tampermonkey `GM_*` API 封装
