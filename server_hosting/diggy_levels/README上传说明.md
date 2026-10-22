# 自有域名 diggy_levels · 面板上传说明（测试）

目标主机：`https://supersuraccoon-cocos2d.com`  
（LiteSpeed + PHP 5.3；**无鉴权**，仅你和小朋友测试用。）

公开仓备份路径：本目录 `server_hosting/diggy_levels/`。  
真正生效靠你在主机面板上传到网站根下的 `diggy_levels/`（与当年传 `diggy_site` 同一套面板）。

## 目录结构（上传后）

```
diggy_levels/
  api.php                 ← 本包根目录的 api.php
  my-levels/
    index.json            ← 空列表（本包已带）
    {id}.json             ← 由 api.php 写入，勿手建
```

旧的 `/diggy_levels` 若打开 500：多半是空目录或缺文件，先建好上述结构再测。

## 上传步骤

1. 登录主机面板（文件管理 / FTP）。
2. 在网站根目录新建文件夹 `diggy_levels`，其下再建 `my-levels`。
3. 上传 `api.php` → `diggy_levels/api.php`。
4. 上传 `my-levels/index.json` → `diggy_levels/my-levels/index.json`。
5. 确认 `my-levels` 对 PHP 可写（面板里目录权限常见 `755`；若写失败再试 `775`/`777` 仅测试）。

## 验收（本机 curl）

```bash
# 1) 探活（应 JSON，含 ok:true / php 版本）
curl -sS https://supersuraccoon-cocos2d.com/diggy_levels/api.php

# 2) 保存一关
curl -sS -X POST https://supersuraccoon-cocos2d.com/diggy_levels/api.php \
  -H 'Content-Type: application/json' \
  -d '{"schemaVersion":1,"table":"我的关卡","id":"ml_panel_test","title":"panel","theme":"world1","cols":10,"rows":7,"cells":[],"updatedAt":"2026-10-22T06:48:40.000Z"}'

# 3) 静态读列表 / 单关（游戏 LEVEL_BASE 用这个前缀）
curl -sS 'https://supersuraccoon-cocos2d.com/diggy_levels/my-levels/index.json'
curl -sS 'https://supersuraccoon-cocos2d.com/diggy_levels/my-levels/ml_panel_test.json'

# 4) 删除
curl -sS -X POST https://supersuraccoon-cocos2d.com/diggy_levels/api.php \
  -H 'Content-Type: application/json' \
  -d '{"action":"delete","id":"ml_panel_test"}'
```

浏览器里打开 `api.php` 也应看到 JSON（不要再 500）。

## 与 GitHub 通道关系

- **GitHub PAT 同步保留**（公开仓 `diggy_levels/my-levels`，一期已上）。
- 本 API 是小朋友 iPad（无 VPN / 无 GitHub）的写入通道；游戏读：
  - `LEVEL_BASE=https://supersuraccoon-cocos2d.com/diggy_levels`
- 两边列表**不自动互通**；测试阶段各测各的即可。

## CORS

`api.php` 与（若主机对静态 JSON 也回了 CORS）均可被 `localhost` / Pages 跨域调用。  
静态文件若缺 CORS 头，游戏测小朋友链路请直接用自家域名打开（或编辑器保存走 api、游戏也走同域）。
