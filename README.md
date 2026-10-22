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
| 仓库权威副本（给 jsDelivr） | `/diggy_levels/my-levels/`（含 `index.json`） |
| Pages 上 | `https://supersuraccoon.github.io/DiggysCardWorldSite/diggy_levels/my-levels/` |

更新关卡：改根目录 `diggy_levels/`，推 `main` 即可；构建时会同步进站点产物。

### CORS 与本地 Cocos

**GitHub Pages 不支持自定义响应头**，因此浏览器从 `http://localhost:7457` 直接请求 Pages 上的 JSON 仍可能被 CORS 拦截。

推荐本地游戏把 `LEVEL_BASE` 指到 **jsDelivr**（自带 CORS）：

```text
https://cdn.jsdelivr.net/gh/supersuraccoon/DiggysCardWorldSite@main/diggy_levels
```

完整索引示例：

```text
https://cdn.jsdelivr.net/gh/supersuraccoon/DiggysCardWorldSite@main/diggy_levels/my-levels/index.json
```

线上若官网与关卡同域（都挂在本 Pages 站点下），游戏包与站点同源时一般无跨域问题；仅本地预览需要 jsDelivr。

Pages 直链（无自定义 CORS，适合同源或服务端拉取）：

```text
https://supersuraccoon.github.io/DiggysCardWorldSite/diggy_levels
```

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
