<?php
/**
 * Diggy's Card World — 多人模式 · 一键清废房（测试用）
 *
 * 部署：与 room.php 同级上传到
 *   https://supersuraccoon-cocos2d.com/diggy_multi/clear_rooms.php
 *
 * PHP 5.3 兼容。勿用 [] / ?? / http_response_code。
 *
 * 用法（GET 即执行）：
 *   https://supersuraccoon-cocos2d.com/diggy_multi/clear_rooms.php?key=diggy_clear_rooms
 *
 * 行为：只删 rooms/ 下 *.json 与 *.lock（含 *.json.lock）；保留 .htaccess、README 等。
 * 无 key 或 key 不对 → 403 JSON。
 *
 * 【安全】密钥极简，仅防外人乱扫。用完请在面板里删掉本文件（或改名移走）。
 * 勿改 room.php。进行中的对战房间也会被删——确认无人对战再跑。
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Content-Type: application/json; charset=utf-8');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('HTTP/1.1 204 No Content');
    exit;
}

function clear_status($code) {
    $map = array(
        200 => '200 OK',
        403 => '403 Forbidden',
        405 => '405 Method Not Allowed',
        500 => '500 Internal Server Error',
    );
    $text = isset($map[$code]) ? $map[$code] : ($code . ' Error');
    header('HTTP/1.1 ' . $text);
}

function clear_json($code, $payload) {
    clear_status($code);
    echo json_encode($payload);
    exit;
}

$key = isset($_GET['key']) ? $_GET['key'] : '';
if ($key !== 'diggy_clear_rooms') {
    clear_json(403, array(
        'ok' => false,
        'error' => 'forbidden',
        'hint' => 'GET with ?key=diggy_clear_rooms',
    ));
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if ($method !== 'GET') {
    clear_json(405, array(
        'ok' => false,
        'error' => 'method_not_allowed',
        'hint' => 'Use GET',
    ));
}

$dir = dirname(__FILE__) . '/rooms';
if (!is_dir($dir)) {
    clear_json(500, array(
        'ok' => false,
        'error' => 'rooms_dir_missing',
        'dir' => 'rooms/',
    ));
}

$deleted = array();
$kept = array();
$failed = array();

$dh = @opendir($dir);
if ($dh === false) {
    clear_json(500, array(
        'ok' => false,
        'error' => 'rooms_dir_unreadable',
        'dir' => 'rooms/',
    ));
}

while (($name = readdir($dh)) !== false) {
    if ($name === '.' || $name === '..') {
        continue;
    }
    $path = $dir . '/' . $name;
    if (is_dir($path)) {
        $kept[] = $name;
        continue;
    }
    $isJson = (substr($name, -5) === '.json');
    $isLock = (substr($name, -5) === '.lock');
    if (!$isJson && !$isLock) {
        $kept[] = $name;
        continue;
    }
    if (@unlink($path)) {
        $deleted[] = $name;
    } else {
        $failed[] = $name;
    }
}
closedir($dh);

$payload = array(
    'ok' => (count($failed) === 0),
    'deleted' => $deleted,
    'kept' => $kept,
    'deletedCount' => count($deleted),
    'hint' => 'Delete clear_rooms.php from the host after use.',
);
if (count($failed) > 0) {
    $payload['failed'] = $failed;
    $payload['error'] = 'partial_delete';
}
clear_json(200, $payload);
