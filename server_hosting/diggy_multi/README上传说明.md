# 自有域名 diggy_multi · 面板上传说明（多人房间 · 测试）

目标主机：`https://supersuraccoon-cocos2d.com`  
（LiteSpeed + PHP 5.3；**无鉴权**，仅你和小朋友测试用。）

公开仓备份：本目录 `server_hosting/diggy_multi/`。  
私有仓备份：`notes/工程/自有域名-diggy_multi/`。  
合同：`notes/工程/方案-多人模式-双人轮流原型.md`。

与 `diggy_levels/` **并列**新目录，不混写关卡文件。GitHub **不做**房间通道。

## 目录结构（上传后）

```
diggy_multi/
  .htaccess          ← 静态 JSON CORS（可选但建议）
  room.php           ← create / join / get / postAction
  rooms/
    .htaccess        ← 再放一份更稳
    {CODE}.json      ← 由 room.php 写入，勿手建
```

## 上传步骤（5 步）

1. 登录主机面板（文件管理 / FTP）。
2. 在网站根目录新建文件夹 `diggy_multi`，其下再建 `rooms`。
3. 上传 `room.php` → `diggy_multi/room.php`。
4. 上传 `.htaccess` → `diggy_multi/.htaccess`；再上传 `rooms/.htaccess` → `diggy_multi/rooms/.htaccess`。  
   （面板若看不到以 `.` 开头的文件：开「显示隐藏文件」，或用 FTP。）
5. 确认 `rooms` 对 PHP 可写（常见 `755`；写失败再试 `775`/`777` 仅测试）。

浏览器打开 `https://supersuraccoon-cocos2d.com/diggy_multi/room.php` 应看到 JSON（`ok:true`），不要 500。

## 验收（本机 curl）

```bash
# 1) 探活
curl -sS https://supersuraccoon-cocos2d.com/diggy_multi/room.php

# 2) 创建房间（记下返回的 room.code）
curl -sS -X POST https://supersuraccoon-cocos2d.com/diggy_multi/room.php \
  -H 'Content-Type: application/json' \
  -d '{"action":"create","name":"P1","playerId":"dev1","levelId":"ml_panel_test"}'

# 3) 加入（把 AB12 换成上一步的 code）
curl -sS -X POST https://supersuraccoon-cocos2d.com/diggy_multi/room.php \
  -H 'Content-Type: application/json' \
  -d '{"action":"join","code":"AB12","name":"P2","playerId":"dev2"}'

# 4) 读房
curl -sS 'https://supersuraccoon-cocos2d.com/diggy_multi/room.php?action=get&code=AB12'

# 5) 行动（turn 须与房间一致；P1 在 phase=p1 时）
curl -sS -X POST https://supersuraccoon-cocos2d.com/diggy_multi/room.php \
  -H 'Content-Type: application/json' \
  -d '{"action":"postAction","code":"AB12","playerId":"dev1","turn":0,"nextPhase":"p2","snapshot":{"demo":true},"lastAction":{"type":"end_turn"}}'

# 错 turn → 应 409 turn_mismatch，文件不变
curl -sS -X POST https://supersuraccoon-cocos2d.com/diggy_multi/room.php \
  -H 'Content-Type: application/json' \
  -d '{"action":"postAction","code":"AB12","playerId":"dev1","turn":0,"nextPhase":"p2","snapshot":{}}'

# 再 join 同码 → room_full
curl -sS -X POST https://supersuraccoon-cocos2d.com/diggy_multi/room.php \
  -H 'Content-Type: application/json' \
  -d '{"action":"join","code":"AB12","name":"P3","playerId":"dev3"}'
```

### CORS

`room.php` 所有响应（含错误）都带 `Access-Control-Allow-Origin: *`，localhost 游戏可直接打 API。  
静态 `rooms/{code}.json` 若 `.htaccess` 生效也可 GET；**推荐一律走 `room.php?action=get`**。

## 接口速查

| 操作 | 方法 | 要点 |
| --- | --- | --- |
| 探活 | `GET room.php` | `{ ok:true, service:"diggy-multi-room", roomCount }` |
| 创建 | `POST action=create` | `phase=wait_p2`，`turn=0`，落盘 `rooms/{code}.json` |
| 加入 | `POST action=join` | `phase=p1`；已满 → `room_full` |
| 读房 | `GET ?action=get&code=` | `{ ok:true, room }` |
| 行动 | `POST action=postAction` | 校验座位+phase+turn；成功后 `phase=nextPhase`，`turn+1` |

相位：`wait_p2` →（join）`p1` → `p2` → `monsters` → `p1`… → `ended`。  
`monsters` 阶段约定由 **P1** 提交结算。错误形：`{ ok:false, error:"turn_mismatch"|"not_your_phase"|"room_full"|"not_found"|"bad_request" }`。

## 与 diggy_levels 关系

- **不改** `diggy_levels/api.php`、编辑器双通道、公开仓关卡路径。  
- 开局可选 `levelId`：客户端用现有 `LEVEL_BASE` 拉关卡种子；之后整局只读写本 API。
