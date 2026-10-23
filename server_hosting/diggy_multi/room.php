<?php
/**
 * Diggy's Card World — 多人模式 · 双人轮流房间 API（测试用，无鉴权）
 *
 * 部署：与本文件同级建 rooms/，上传到
 *   https://supersuraccoon-cocos2d.com/diggy_multi/room.php
 *
 * PHP 5.3 兼容（LiteSpeed / 旧主机）。勿用 [] / ?? / http_response_code。
 *
 * 合同见私有仓 notes/工程/方案-多人模式-双人轮流原型.md
 *
 *   GET  （无 action）                         → 探活
 *   GET  ?action=get&code=AB12 或 ?code=AB12  → 读房间（带 CORS）
 *        可选 since= / sinceTurn=（客户端已知 turn）：
 *          与房内 turn 相同 → 小包 {ok,unchanged,code,turn,phase}（无 room/snapshot）
 *          不同或未带 since → 全量 room（与旧客户端兼容）
 *   POST {"action":"create", "name","playerId","levelId?"} → 开房 wait_p2
 *   POST {"action":"join", "code","name","playerId"}       → 入座 → phase=p1
 *   POST {"action":"get", "code", "since?"|"sinceTurn?"}   → 同 GET get（since 可走 JSON）
 *   POST {"action":"postAction", "code","playerId","turn","nextPhase","snapshot","lastAction?"}
 *        → turn 乐观锁；phase 门闩；写入后 turn+1
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Max-Age: 86400');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Content-Type: text/plain; charset=utf-8');
    header('HTTP/1.1 204 No Content');
    exit;
}

$dir = dirname(__FILE__) . '/rooms';

function room_status($code) {
    $map = array(
        200 => '200 OK',
        400 => '400 Bad Request',
        404 => '404 Not Found',
        405 => '405 Method Not Allowed',
        409 => '409 Conflict',
        500 => '500 Internal Server Error',
    );
    $text = isset($map[$code]) ? $map[$code] : ($code . ' Error');
    header('HTTP/1.1 ' . $text);
}

function room_json($code, $payload) {
    room_status($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function room_now() {
    return gmdate('Y-m-d\TH:i:s') . '.000Z';
}

function room_ensure_dir($dir) {
    if (is_dir($dir)) {
        return true;
    }
    return @mkdir($dir, 0755, true);
}

function room_safe_code($code) {
    if (!is_string($code) || $code === '') {
        return false;
    }
    $code = strtoupper($code);
    if (!preg_match('/^[A-Z0-9]{4,6}$/', $code)) {
        return false;
    }
    return $code;
}

function room_safe_player_id($id) {
    if (!is_string($id) || $id === '') {
        return false;
    }
    if (strlen($id) > 64) {
        return false;
    }
    if (!preg_match('/^[A-Za-z0-9_-]+$/', $id)) {
        return false;
    }
    return $id;
}

function room_gen_code($dir) {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $len = strlen($chars);
    $tries = 0;
    while ($tries < 32) {
        $code = '';
        for ($i = 0; $i < 4; $i++) {
            $code .= $chars[mt_rand(0, $len - 1)];
        }
        $path = $dir . '/' . $code . '.json';
        if (!file_exists($path)) {
            return $code;
        }
        $tries++;
    }
    /* 极端碰撞：扩到 6 位 */
    while ($tries < 64) {
        $code = '';
        for ($i = 0; $i < 6; $i++) {
            $code .= $chars[mt_rand(0, $len - 1)];
        }
        $path = $dir . '/' . $code . '.json';
        if (!file_exists($path)) {
            return $code;
        }
        $tries++;
    }
    return false;
}

function room_path($dir, $code) {
    return $dir . '/' . $code . '.json';
}

function room_normalize_snapshot(&$room) {
    /* json_decode(..., true) 把 {} 变成 []；对外仍按合同回 {} */
    if (isset($room['snapshot']) && is_array($room['snapshot']) && count($room['snapshot']) === 0) {
        $room['snapshot'] = new stdClass();
    }
}

function room_read($path) {
    if (!file_exists($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') {
        return null;
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return null;
    }
    room_normalize_snapshot($data);
    return $data;
}

function room_write($path, $room) {
    $room['updatedAt'] = room_now();
    $json = json_encode($room);
    if ($json === false) {
        return false;
    }
    $tmp = $path . '.tmp';
    if (@file_put_contents($tmp, $json) === false) {
        return false;
    }
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        return @file_put_contents($path, $json) !== false;
    }
    return true;
}

/**
 * 简单文件锁：读-改-写期间占住 .lock，防两人同时盖。
 * 返回 array($fp, $room) 或失败时直接 room_json exit。
 */
function room_lock_read($path, $needExist) {
    $lockPath = $path . '.lock';
    $fp = @fopen($lockPath, 'c+');
    if ($fp === false) {
        room_json(500, array('ok' => false, 'error' => '无法加锁'));
    }
    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        room_json(500, array('ok' => false, 'error' => '无法加锁'));
    }
    $exists = file_exists($path);
    if ($needExist && !$exists) {
        flock($fp, LOCK_UN);
        fclose($fp);
        room_json(404, array('ok' => false, 'error' => 'not_found'));
    }
    $room = null;
    if ($exists) {
        $room = room_read($path);
        if ($room === null) {
            flock($fp, LOCK_UN);
            fclose($fp);
            room_json(500, array('ok' => false, 'error' => '房间文件损坏'));
        }
    }
    return array($fp, $room);
}

function room_unlock($fp) {
    if ($fp) {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function room_read_body() {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return array(null, null);
    }
    $data = json_decode($raw, true);
    if ($data === null && function_exists('json_last_error') && json_last_error() !== JSON_ERROR_NONE) {
        return array(null, 'JSON 解析失败');
    }
    if ($data === null && $raw !== '' && $raw !== 'null') {
        /* PHP 5.3 无可靠 json_last_error 时的兜底 */
        return array(null, 'JSON 解析失败');
    }
    return array($data, null);
}

function room_valid_phase($p) {
    $ok = array('wait_p2' => 1, 'p1' => 1, 'p2' => 1, 'monsters' => 1, 'ended' => 1);
    return isset($ok[$p]);
}

function room_count($dir) {
    $n = 0;
    if (!is_dir($dir)) {
        return 0;
    }
    $dh = @opendir($dir);
    if ($dh === false) {
        return 0;
    }
    while (($f = readdir($dh)) !== false) {
        if ($f === '.' || $f === '..') {
            continue;
        }
        if (substr($f, -5) === '.json' && substr($f, -9) !== '.tmp.json') {
            $n++;
        }
    }
    closedir($dh);
    return $n;
}

function room_player_seat($room, $playerId) {
    if (!isset($room['players']) || !is_array($room['players'])) {
        return 0;
    }
    foreach ($room['players'] as $p) {
        if (is_array($p) && isset($p['id']) && $p['id'] === $playerId && isset($p['seat'])) {
            return intval($p['seat']);
        }
    }
    return 0;
}

/**
 * 当前 phase 允许哪个座位行动；monsters → P1；wait_p2/ended → 0（拒绝）
 */
function room_allowed_seat($phase) {
    if ($phase === 'p1') {
        return 1;
    }
    if ($phase === 'p2') {
        return 2;
    }
    if ($phase === 'monsters') {
        return 1;
    }
    return 0;
}


/**
 * 解析 since / sinceTurn（查询参数或已解码的 JSON 数组）。
 * 返回 int turn，或 null 表示未带 / 非法（走全量）。
 */
function room_parse_since($query, $body) {
    $raw = null;
    if (is_array($query)) {
        if (isset($query['since']) && $query['since'] !== '' && $query['since'] !== null) {
            $raw = $query['since'];
        } else if (isset($query['sinceTurn']) && $query['sinceTurn'] !== '' && $query['sinceTurn'] !== null) {
            $raw = $query['sinceTurn'];
        }
    }
    if ($raw === null && is_array($body)) {
        if (isset($body['since']) && $body['since'] !== '' && $body['since'] !== null) {
            $raw = $body['since'];
        } else if (isset($body['sinceTurn']) && $body['sinceTurn'] !== '' && $body['sinceTurn'] !== null) {
            $raw = $body['sinceTurn'];
        }
    }
    if ($raw === null) {
        return null;
    }
    if (is_int($raw) || is_float($raw) || (is_string($raw) && is_numeric($raw))) {
        return intval($raw);
    }
    return null;
}

/**
 * get 读房：带 since 且等于房内 turn → 小包；否则全量。
 */
function room_respond_get($code, $room, $sinceTurn) {
    $serverTurn = isset($room['turn']) ? intval($room['turn']) : 0;
    $phase = isset($room['phase']) ? $room['phase'] : null;
    if ($sinceTurn !== null && $sinceTurn === $serverTurn) {
        room_json(200, array(
            'ok' => true,
            'action' => 'get',
            'unchanged' => true,
            'code' => $code,
            'turn' => $serverTurn,
            'phase' => $phase,
        ));
    }
    room_json(200, array('ok' => true, 'action' => 'get', 'room' => $room));
}

if (!room_ensure_dir($dir)) {
    room_json(500, array('ok' => false, 'error' => '无法创建 rooms 目录，请在面板确认 diggy_multi/rooms 可写'));
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$actionQ = isset($_GET['action']) ? $_GET['action'] : '';
$codeQ = isset($_GET['code']) ? $_GET['code'] : '';

/* ---------- GET：探活 / get ---------- */
if ($method === 'GET') {
    $wantGet = ($actionQ === 'get') || ($actionQ === '' && $codeQ !== '');
    if ($wantGet && $codeQ !== '') {
        $code = room_safe_code($codeQ);
        if ($code === false) {
            room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => 'code 须为 4~6 位大写字母数字'));
        }
        $path = room_path($dir, $code);
        $room = room_read($path);
        if ($room === null) {
            room_json(404, array('ok' => false, 'error' => 'not_found'));
        }
        $sinceTurn = room_parse_since($_GET, null);
        room_respond_get($code, $room, $sinceTurn);
    }
    if ($actionQ === '' || $actionQ === 'ping') {
        room_json(200, array(
            'ok' => true,
            'service' => 'diggy-multi-room',
            'php' => PHP_VERSION,
            'dir' => 'rooms/',
            'roomCount' => room_count($dir),
            'hint' => 'POST create/join/postAction/get；GET ?action=get&code=&since= 读房',
        ));
    }
    room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => 'GET 探活或 ?action=get&code='));
}

/* ---------- POST ---------- */
if ($method === 'POST') {
    list($body, $err) = room_read_body();
    if ($err) {
        room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => $err));
    }
    if (!is_array($body)) {
        room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '需要 JSON body'));
    }
    $action = isset($body['action']) ? $body['action'] : '';

    /* ---- create ---- */
    if ($action === 'create') {
        $playerId = room_safe_player_id(isset($body['playerId']) ? $body['playerId'] : '');
        if ($playerId === false) {
            room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '需要合法 playerId'));
        }
        $name = isset($body['name']) && is_string($body['name']) && $body['name'] !== ''
            ? substr($body['name'], 0, 32)
            : 'P1';
        $levelId = null;
        if (isset($body['levelId']) && is_string($body['levelId']) && $body['levelId'] !== '') {
            if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $body['levelId'])) {
                $levelId = $body['levelId'];
            } else {
                room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '非法 levelId'));
            }
        }
        $code = room_gen_code($dir);
        if ($code === false) {
            room_json(500, array('ok' => false, 'error' => '无法生成房间码'));
        }
        $path = room_path($dir, $code);
        $room = array(
            'schemaVersion' => 1,
            'code' => $code,
            'phase' => 'wait_p2',
            'turn' => 0,
            'levelId' => $levelId,
            'players' => array(
                array(
                    'seat' => 1,
                    'id' => $playerId,
                    'name' => $name,
                    'hp' => 10,
                ),
            ),
            'snapshot' => new stdClass(), /* JSON {} */
            'lastAction' => null,
            'updatedAt' => room_now(),
        );
        /* json_encode(stdClass) → {}；若主机无问题则改空 array 再手工 */
        if (!room_write($path, $room)) {
            room_json(500, array('ok' => false, 'error' => '写入失败，请确认 rooms 目录可写'));
        }
        /* 重读，保证 snapshot 形态一致 */
        $room = room_read($path);
        room_json(200, array('ok' => true, 'action' => 'create', 'room' => $room));
    }

    /* ---- join ---- */
    if ($action === 'join') {
        $code = room_safe_code(isset($body['code']) ? $body['code'] : '');
        if ($code === false) {
            room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '需要合法 code'));
        }
        $playerId = room_safe_player_id(isset($body['playerId']) ? $body['playerId'] : '');
        if ($playerId === false) {
            room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '需要合法 playerId'));
        }
        $name = isset($body['name']) && is_string($body['name']) && $body['name'] !== ''
            ? substr($body['name'], 0, 32)
            : 'P2';

        $path = room_path($dir, $code);
        list($fp, $room) = room_lock_read($path, true);

        if (!isset($room['phase']) || $room['phase'] !== 'wait_p2') {
            /* 已满或已开打：同 playerId 重入则原样返回 */
            $seat = room_player_seat($room, $playerId);
            if ($seat > 0) {
                room_unlock($fp);
                room_json(200, array('ok' => true, 'action' => 'join', 'room' => $room, 'rejoin' => true));
            }
            room_unlock($fp);
            room_json(409, array('ok' => false, 'error' => 'room_full', 'phase' => isset($room['phase']) ? $room['phase'] : null));
        }

        /* wait_p2：禁止同 id 占两席 */
        if (room_player_seat($room, $playerId) === 1) {
            room_unlock($fp);
            room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '不能用同一 playerId 加入自己的房间'));
        }

        if (!isset($room['players']) || !is_array($room['players'])) {
            $room['players'] = array();
        }
        /* 若已有 seat2（异常），视为满 */
        $has2 = false;
        foreach ($room['players'] as $p) {
            if (is_array($p) && isset($p['seat']) && intval($p['seat']) === 2) {
                $has2 = true;
                break;
            }
        }
        if ($has2 || count($room['players']) >= 2) {
            room_unlock($fp);
            room_json(409, array('ok' => false, 'error' => 'room_full'));
        }

        $room['players'][] = array(
            'seat' => 2,
            'id' => $playerId,
            'name' => $name,
            'hp' => 10,
        );
        $room['phase'] = 'p1';

        if (!room_write($path, $room)) {
            room_unlock($fp);
            room_json(500, array('ok' => false, 'error' => '写入失败'));
        }
        $room = room_read($path);
        room_unlock($fp);
        room_json(200, array('ok' => true, 'action' => 'join', 'room' => $room));
    }

    /* ---- get（JSON body 亦可带 since / sinceTurn） ---- */
    if ($action === 'get') {
        $code = room_safe_code(isset($body['code']) ? $body['code'] : '');
        if ($code === false) {
            room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '需要合法 code'));
        }
        $path = room_path($dir, $code);
        $room = room_read($path);
        if ($room === null) {
            room_json(404, array('ok' => false, 'error' => 'not_found'));
        }
        $sinceTurn = room_parse_since($_GET, $body);
        room_respond_get($code, $room, $sinceTurn);
    }

    /* ---- postAction ---- */
    if ($action === 'postAction') {
        $code = room_safe_code(isset($body['code']) ? $body['code'] : '');
        if ($code === false) {
            room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '需要合法 code'));
        }
        $playerId = room_safe_player_id(isset($body['playerId']) ? $body['playerId'] : '');
        if ($playerId === false) {
            room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '需要合法 playerId'));
        }
        if (!isset($body['turn']) || (!is_int($body['turn']) && !is_numeric($body['turn']))) {
            room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '需要 turn'));
        }
        $clientTurn = intval($body['turn']);
        $nextPhase = isset($body['nextPhase']) ? $body['nextPhase'] : '';
        if (!room_valid_phase($nextPhase)) {
            room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => '非法 nextPhase'));
        }

        $path = room_path($dir, $code);
        list($fp, $room) = room_lock_read($path, true);

        $phase = isset($room['phase']) ? $room['phase'] : '';
        if ($phase === 'wait_p2' || $phase === 'ended') {
            room_unlock($fp);
            room_json(409, array('ok' => false, 'error' => 'not_your_phase', 'phase' => $phase, 'turn' => isset($room['turn']) ? $room['turn'] : 0));
        }

        $serverTurn = isset($room['turn']) ? intval($room['turn']) : 0;
        if ($clientTurn !== $serverTurn) {
            room_unlock($fp);
            room_json(409, array(
                'ok' => false,
                'error' => 'turn_mismatch',
                'turn' => $serverTurn,
                'phase' => $phase,
            ));
        }

        $seat = room_player_seat($room, $playerId);
        $allowed = room_allowed_seat($phase);
        if ($seat === 0 || $seat !== $allowed) {
            room_unlock($fp);
            room_json(409, array('ok' => false, 'error' => 'not_your_phase', 'phase' => $phase, 'turn' => $serverTurn, 'yourSeat' => $seat));
        }

        /* 写入 snapshot / lastAction / phase / turn++ */
        if (array_key_exists('snapshot', $body)) {
            $room['snapshot'] = $body['snapshot'];
        }
        if (array_key_exists('lastAction', $body)) {
            $room['lastAction'] = $body['lastAction'];
        }
        /* 可选：同步玩家 hp（若 snapshot 外单独传 players） */
        if (isset($body['players']) && is_array($body['players'])) {
            $room['players'] = $body['players'];
        }

        $room['phase'] = $nextPhase;
        $room['turn'] = $serverTurn + 1;

        if (!room_write($path, $room)) {
            room_unlock($fp);
            room_json(500, array('ok' => false, 'error' => '写入失败'));
        }
        $room = room_read($path);
        room_unlock($fp);
        room_json(200, array('ok' => true, 'action' => 'postAction', 'room' => $room));
    }

    room_json(400, array('ok' => false, 'error' => 'bad_request', 'hint' => 'action 须为 create|join|get|postAction'));
}

room_json(405, array('ok' => false, 'error' => 'bad_request', 'hint' => '不支持的方法：' . $method));
