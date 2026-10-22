# 自有域名 diggy_levels · 面板上传说明（测试）

目标主机：`https://supersuraccoon-cocos2d.com`  
（LiteSpeed + PHP 5.3；**无鉴权**，仅你和小朋友测试用。）

公开仓备份路径：本目录 `server_hosting/diggy_levels/`。  
真正生效靠你在主机面板上传到网站根下的 `diggy_levels/`（与当年传 `diggy_site` 同一套面板）。

## 目录结构（上传后）

```
diggy_levels/
  .htaccess               ← CORS（LiteSpeed 常认；共享机可能被禁）
  api.php                 ← 写入 + 带 CORS 的 list/get 代理
  my-levels/
    .htaccess             ← 再放一份更稳（只作用本目录 JSON）
    index.json            ← 列表（本包已带空模板；线上可能已有数据勿覆盖）
    {id}.json             ← 由 api.php 写入，勿手建
```

旧的 `/diggy_levels` 若打开 500：多半是空目录或缺文件，先建好上述结构再测。

## 上传步骤

1. 登录主机面板（文件管理 / FTP）。
2. 在网站根目录新建文件夹 `diggy_levels`，其下再建 `my-levels`（若已有可跳过）。
3. 上传 `api.php` → `diggy_levels/api.php`（**覆盖**旧版以启用 `?action=get`）。
4. 上传 `.htaccess` → `diggy_levels/.htaccess`。
5. 上传 `my-levels/.htaccess` → `diggy_levels/my-levels/.htaccess`。
6. 若线上还没有列表：上传 `my-levels/index.json`；**若已有关卡，不要用空模板覆盖**。
7. 确认 `my-levels` 对 PHP 可写（常见 `755`；写失败再试 `775`/`777` 仅测试）。

面板若看不到以 `.` 开头的文件：开「显示隐藏文件」，或用 FTP 上传 `.htaccess`。

## 验收（本机 curl）

```bash
# 1) 探活（应 JSON，含 ok:true / php 版本）
curl -sS https://supersuraccoon-cocos2d.com/diggy_levels/api.php

# 2) 静态 JSON 是否已有 CORS（期望响应头含 access-control-allow-origin: *）
curl -sSI 'https://supersuraccoon-cocos2d.com/diggy_levels/my-levels/index.json' | tr '[:upper:]' '[:lower:]' | grep -i access-control

# 3) 保存一关
curl -sS -X POST https://supersuraccoon-cocos2d.com/diggy_levels/api.php \
  -H 'Content-Type: application/json' \
  -d '{"schemaVersion":1,"table":"我的关卡","id":"ml_panel_test","title":"panel","theme":"world1","cols":10,"rows":7,"cells":[],"updatedAt":"2026-10-22T06:48:40.000Z"}'

# 4) 静态读 / API 代理读（游戏 localhost 优先用带 CORS 的）
curl -sS 'https://supersuraccoon-cocos2d.com/diggy_levels/my-levels/index.json'
curl -sS 'https://supersuraccoon-cocos2d.com/diggy_levels/api.php?action=list'
curl -sS 'https://supersuraccoon-cocos2d.com/diggy_levels/api.php?action=get&id=ml_panel_test'

# 5) 删除
curl -sS -X POST https://supersuraccoon-cocos2d.com/diggy_levels/api.php \
  -H 'Content-Type: application/json' \
  -d '{"action":"delete","id":"ml_panel_test"}'
```

浏览器里打开 `api.php` 也应看到 JSON（不要再 500）。

### CORS 判定

| 结果 | 含义 | 游戏 localhost 怎么读 |
| --- | --- | --- |
| `curl -sSI .../my-levels/index.json` **有** `access-control-allow-origin: *` | `.htaccess` 生效 | `LEVEL_BASE=https://supersuraccoon-cocos2d.com/diggy_levels`，路径仍是 `/my-levels/index.json` 与 `/my-levels/{id}.json` |
| **没有** ACAO | 共享机禁了 Header / AllowOverride | 列表改打 `api.php?action=list`；单关 `api.php?action=get&id={id}`（均已带 CORS） |

`api.php` 本身探活 / list / get **一定有** CORS（PHP `header()`），不依赖 `.htaccess`。

## 与 GitHub 通道关系

- **GitHub PAT 同步保留**（公开仓 `diggy_levels/my-levels`，一期已上）。
- 本 API 是小朋友 iPad（无 VPN / 无 GitHub）的写入通道。
- 两边列表**不自动互通**；测试阶段各测各的即可。

## api.php 读接口（给游戏兜底）

| 用途 | URL | 响应 |
| --- | --- | --- |
| 列表 | `.../api.php?action=list` | 与 `my-levels/index.json` 同形 |
| 单关 | `.../api.php?action=get&id=ml_xxx` | 与 `my-levels/{id}.json` 原文同形 |
| 探活 | `.../api.php` | `{ ok:true, ... }` |

请求可加 `&t=` / `?t=` 防缓存。
