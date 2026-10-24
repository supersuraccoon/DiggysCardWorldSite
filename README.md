# Diggy's Card World · 官网（公开站）

本仓库是《Diggy's Card World》**官方网站**的源码与静态关卡 JSON 托管处（公开仓库）。

- 技术栈：Astro 5 + React（编辑器页）
- 自动部署：推送 `main` → GitHub Actions → **GitHub Pages**
- 线上地址（项目页）：https://supersuraccoon.github.io/DiggysCardWorldSite/

游戏主仓仍可私有；本仓只放官网与可公开的玩家关卡索引。

## 自动部署

1. 改代码后 `git push origin main`
2. Actions 工作流 `.github/workflows/deploy-pages.yml` 会：
   - `npm ci`
   - `SITE_BASE=/DiggysCardWorldSite npm run build`（`prebuild` 会把根目录 `diggy_levels/` 拷进 `public/`）
   - 用 `actions/deploy-pages` 发布 `dist/`
3. 仓库 Settings → Pages → Source 选 **GitHub Actions**

### 首次启用工作流（重要）

当前用来推代码的 GitHub OAuth 令牌**没有 `workflow` 权限**，无法直接把 `.yml` 写进 `.github/workflows/`。请你在网页上做一次：

1. 打开仓库 → **Add file** → **Create new file**
2. 路径填：`.github/workflows/deploy-pages.yml`
3. 把本仓 `ci/deploy-pages.yml` 的全部内容粘贴进去 → Commit
4. Settings → Pages → Build and deployment → Source：**GitHub Actions**
5. 之后每次推 `main` 就会自动部署

在工作流生效前，可用 `gh-pages` 分支做一次手工发布（本 README 首次迁移时已尝试发布）。

本地预览：

```bash
npm ci
npm run dev
# 或按 Pages 子路径构建：
SITE_BASE=/DiggysCardWorldSite npm run build && npx serve dist
```

## diggy_levels（玩家关卡 JSON）

| 用途 | 路径 |
|------|------|
| 仓库正本 | `/diggy_levels/my-levels/`（`{id}.json` + `index.json`） |
| Pages（推荐 LEVEL_BASE） | `https://supersuraccoon.github.io/DiggysCardWorldSite/diggy_levels` |

**更新方式（一期）：** 所有者在网站「编辑器 → 我的关卡」连接 Fine-grained PAT 后，保存/删除会经 GitHub Contents API 写本仓 `main`；推送后 Actions 约 30～90 秒更新 Pages。也可直接改根目录 `diggy_levels/` 再 `git push`。

### 游戏 LEVEL_BASE

**推荐（保存后尽快刷新）：**

```text
LEVEL_BASE=https://supersuraccoon.github.io/DiggysCardWorldSite/diggy_levels
```

拉取时加缓存破坏，例如：

```text
GET {LEVEL_BASE}/my-levels/index.json?t={Date.now()}
GET {LEVEL_BASE}/my-levels/{id}.json?t={Date.now()}
```

**备选（本地 Cocos 遇 CORS 时）：**

```text
https://cdn.jsdelivr.net/gh/supersuraccoon/DiggysCardWorldSite@main/diggy_levels
```

jsDelivr 自带 CORS，但**缓存偏久**，不适合「刚在编辑器保存就立刻刷新」；仅作 Pages 异常或本地跨域时的回退。

GitHub Pages 不支持自定义 CORS 头：本地预览若被拦，再用 jsDelivr；线上游戏与站点同源时优先 Pages + `?t=`。

## 自定义域名（可选）

以后可把 `supersuraccoon-cocos2d.com`（或子域）在 GitHub Pages 绑定自定义域名，并视情况把 `SITE_BASE` 改为 `/` 后重新部署。

## 目录要点

```text
├── diggy_levels/          # 关卡 JSON（jsDelivr + 构建拷贝）
├── public/                # 静态资源（fonts/images…）
├── scripts/               # prebuild 拷贝、relativize-dist 等
├── src/                   # Astro / React 源码
└── .github/workflows/     # Pages 部署
```

请勿提交密钥、`.env`、未公开的大资源。


## play/（手机验收 · 非官网入口）

Cocos web-mobile 构建挂载在仓库根 `play/`，Pages 直链：

https://supersuraccoon.github.io/DiggysCardWorldSite/play/

**不要**在官网导航加入口。详见私有仓 `notes/工程/交接-程序与手机验收流水线.md`。
