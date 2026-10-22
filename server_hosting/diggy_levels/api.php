<?php
/**
 * Diggy's Card World — 我的关卡 · 自有域名写入 API（测试用，无鉴权）
 *
 * 部署：与本文件同级建 my-levels/，上传到
 *   https://supersuraccoon-cocos2d.com/diggy_levels/api.php
 *
 * PHP 5.3 兼容（LiteSpeed / 旧主机）。勿改成 PHP 7 短数组 [] / ?? / http_response_code。
 *
 * 接口合同（给编辑器 / 游戏）：
 *   POST  body = 整关 JSON（须含 id）     → 写 my-levels/{id}.json + 更新 index.json
 *   POST  body = {"action":"delete","id"} → 删文件并从 index 去掉
 *   DELETE ?id=xxx 或 POST ?action=delete → 同上
 *   GET   ?action=list                    → 返回与 index.json 同结构（带 CORS）
 *   GET   ?action=get&id=xxx              → 代理读 my-levels/{id}.json 原文（带 CORS）
 *   静态 GET my-levels/*.json 也可；若缺 CORS 头，游戏改走 list/get
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Access-Control-Max-Age: 86400');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Content-Type: text/plain; charset=utf-8');
    header('HTTP/1.1 204 No Content');
    exit;
}

$dir = dirname(__FILE__) . '/my-levels';
$indexPath = $dir . '/index.json';

function diggy_status($code) {
    $map = array(
        200 => '200 OK',
        201 => '201 Created',
        204 => '204 No Content',
        400 => '400 Bad Request',
        404 => '404 Not Found',
        405 => '405 Method Not Allowed',
        500 => '500 Internal Server Error',
    );
    $text = isset($map[$code]) ? $map[$code] : ($code . ' Error');
    header('HTTP/1.1 ' . $text);
}

function diggy_json($code, $payload) {
    diggy_status($code);
    header('Content-Type: application/json; charset=utf-8');
    /* PHP 5.3：无 JSON_UNESCAPED_UNICODE，\uXXXX 仍合法 */
    echo json_encode($payload);
    exit;
}

function diggy_now() {
    return gmdate('Y-m-d\TH:i:s') . '.000Z';
}

function diggy_safe_id($id) {
    if (!is_string($id) || $id === '') {
        return false;
    }
    /* 与编辑器 id 一致：字母数字下划线短横线 */
    if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
        return false;
    }
    return $id;
}

function diggy_ensure_dir($dir) {
    if (is_dir($dir)) {
        return true;
    }
    return @mkdir($dir, 0755, true);
}

function diggy_read_index($indexPath) {
    $empty = array(
        'schemaVersion' => 1,
        'updatedAt' => diggy_now(),
        'levels' => array(),
    );
    if (!file_exists($indexPath)) {
        return $empty;
    }
    $raw = @file_get_contents($indexPath);
    if ($raw === false || $raw === '') {
        return $empty;
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return $empty;
    }
    if (!isset($data['schemaVersion'])) {
        $data['schemaVersion'] = 1;
    }
    if (!isset($data['levels']) || !is_array($data['levels'])) {
        $data['levels'] = array();
    }
    return $data;
}

function diggy_write_index($indexPath, $index) {
    $index['schemaVersion'] = 1;
    $index['updatedAt'] = diggy_now();
    $levels = array();
    if (isset($index['levels']) && is_array($index['levels'])) {
        foreach ($index['levels'] as $m) {
            if (!is_array($m) || !isset($m['id'])) {
                continue;
            }
            $levels[] = array(
                'id' => $m['id'],
                'title' => isset($m['title']) ? $m['title'] : '',
                'theme' => isset($m['theme']) ? $m['theme'] : '',
                'cols' => isset($m['cols']) ? $m['cols'] : 0,
                'rows' => isset($m['rows']) ? $m['rows'] : 0,
                'updatedAt' => isset($m['updatedAt']) ? $m['updatedAt'] : diggy_now(),
            );
        }
    }
    $index['levels'] = $levels;
    $json = json_encode($index);
    if ($json === false) {
        return false;
    }
    /* 美化一点：PHP 5.3 无 JSON_PRETTY_PRINT，保持单行亦可；编辑器不依赖缩进 */
    $tmp = $indexPath . '.tmp';
    if (@file_put_contents($tmp, $json) === false) {
        return false;
    }
    if (!@rename($tmp, $indexPath)) {
        @unlink($tmp);
        return @file_put_contents($indexPath, $json) !== false;
    }
    return true;
}

function diggy_meta_from_level($lv) {
    return array(
        'id' => $lv['id'],
        'title' => isset($lv['title']) ? $lv['title'] : '',
        'theme' => isset($lv['theme']) ? $lv['theme'] : '',
        'cols' => isset($lv['cols']) ? $lv['cols'] : 0,
        'rows' => isset($lv['rows']) ? $lv['rows'] : 0,
        'updatedAt' => isset($lv['updatedAt']) ? $lv['updatedAt'] : diggy_now(),
    );
}

function diggy_upsert_meta(&$index, $meta) {
    $found = false;
    $n = count($index['levels']);
    for ($i = 0; $i < $n; $i++) {
        if (isset($index['levels'][$i]['id']) && $index['levels'][$i]['id'] === $meta['id']) {
            $index['levels'][$i] = $meta;
            $found = true;
            break;
        }
    }
    if (!$found) {
        $index['levels'][] = $meta;
    }
}

function diggy_remove_meta(&$index, $id) {
    $out = array();
    foreach ($index['levels'] as $m) {
        if (!isset($m['id']) || $m['id'] !== $id) {
            $out[] = $m;
        }
    }
    $index['levels'] = $out;
}

function diggy_read_body() {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return array(null, null);
    }
    $data = json_decode($raw, true);
    if ($data === null && json_last_error() !== JSON_ERROR_NONE) {
        return array(null, 'JSON 解析失败');
    }
    return array($data, null);
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$action = isset($_GET['action']) ? $_GET['action'] : '';
$idQuery = isset($_GET['id']) ? $_GET['id'] : '';

if (!diggy_ensure_dir($dir)) {
    diggy_json(500, array('ok' => false, 'error' => '无法创建 my-levels 目录，请在面板确认 diggy_levels/my-levels 可写'));
}

/* ---------- GET list / get / ping ---------- */
if ($method === 'GET') {
    if ($action === 'get') {
        $id = diggy_safe_id($idQuery);
        if ($id === false) {
            diggy_json(400, array('ok' => false, 'error' => '缺少或非法 id；用 ?action=get&id='));
        }
        $path = $dir . '/' . $id . '.json';
        if (!file_exists($path)) {
            diggy_json(404, array('ok' => false, 'error' => '关卡不存在：' . $id));
        }
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') {
            diggy_json(500, array('ok' => false, 'error' => '读取失败：' . $id . '.json'));
        }
        /* 直接回原文，形状与静态 my-levels/{id}.json 一致（带本文件 CORS 头） */
        diggy_status(200);
        header('Content-Type: application/json; charset=utf-8');
        echo $raw;
        exit;
    }
    if ($action === 'list' || $action === '') {
        $index = diggy_read_index($indexPath);
        if ($action === 'list') {
            /* 与静态 index.json 同结构，供 localhost 跨域读（静态文件可能无 CORS） */
            diggy_status(200);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode($index);
            exit;
        }
        diggy_json(200, array(
            'ok' => true,
            'service' => 'diggy-my-levels',
            'php' => PHP_VERSION,
            'dir' => 'my-levels/',
            'levelCount' => count($index['levels']),
            'hint' => 'POST 整关 JSON 保存；POST {"action":"delete","id"} 删除；GET ?action=list 列表；GET ?action=get&id= 读单关',
        ));
    }
    diggy_json(400, array('ok' => false, 'error' => '未知 action；用 ?action=list 或 ?action=get&id='));
}

/* ---------- DELETE ---------- */
if ($method === 'DELETE' || ($method === 'POST' && ($action === 'delete'))) {
    list($body, $err) = diggy_read_body();
    if ($err) {
        diggy_json(400, array('ok' => false, 'error' => $err));
    }
    $id = $idQuery;
    if (is_array($body)) {
        if (isset($body['id'])) {
            $id = $body['id'];
        }
        if (isset($body['action']) && $body['action'] === 'delete' && isset($body['id'])) {
            $id = $body['id'];
        }
    }
    $id = diggy_safe_id($id);
    if ($id === false) {
        diggy_json(400, array('ok' => false, 'error' => '缺少或非法 id'));
    }
    $path = $dir . '/' . $id . '.json';
    $existed = file_exists($path);
    if ($existed && !@unlink($path)) {
        diggy_json(500, array('ok' => false, 'error' => '删除文件失败：' . $id . '.json'));
    }
    $index = diggy_read_index($indexPath);
    diggy_remove_meta($index, $id);
    if (!diggy_write_index($indexPath, $index)) {
        diggy_json(500, array('ok' => false, 'error' => '更新 index.json 失败'));
    }
    diggy_json(200, array(
        'ok' => true,
        'action' => 'delete',
        'id' => $id,
        'fileExisted' => $existed,
        'index' => $index,
    ));
}

/* ---------- POST save（整关）或 body.action=delete ---------- */
if ($method === 'POST') {
    list($body, $err) = diggy_read_body();
    if ($err) {
        diggy_json(400, array('ok' => false, 'error' => $err));
    }
    if (!is_array($body)) {
        diggy_json(400, array('ok' => false, 'error' => '需要 JSON body'));
    }

    if (isset($body['action']) && $body['action'] === 'delete') {
        $id = diggy_safe_id(isset($body['id']) ? $body['id'] : '');
        if ($id === false) {
            diggy_json(400, array('ok' => false, 'error' => '缺少或非法 id'));
        }
        $path = $dir . '/' . $id . '.json';
        $existed = file_exists($path);
        if ($existed && !@unlink($path)) {
            diggy_json(500, array('ok' => false, 'error' => '删除文件失败'));
        }
        $index = diggy_read_index($indexPath);
        diggy_remove_meta($index, $id);
        if (!diggy_write_index($indexPath, $index)) {
            diggy_json(500, array('ok' => false, 'error' => '更新 index.json 失败'));
        }
        diggy_json(200, array(
            'ok' => true,
            'action' => 'delete',
            'id' => $id,
            'fileExisted' => $existed,
            'index' => $index,
        ));
    }

    $id = diggy_safe_id(isset($body['id']) ? $body['id'] : '');
    if ($id === false) {
        diggy_json(400, array('ok' => false, 'error' => '整关 JSON 须含合法 id（字母数字_-，≤64）'));
    }

    if (!isset($body['updatedAt']) || $body['updatedAt'] === '') {
        $body['updatedAt'] = diggy_now();
    }
    if (!isset($body['schemaVersion'])) {
        $body['schemaVersion'] = 1;
    }

    $path = $dir . '/' . $id . '.json';
    $json = json_encode($body);
    if ($json === false) {
        diggy_json(400, array('ok' => false, 'error' => '关卡 JSON 编码失败'));
    }
    $tmp = $path . '.tmp';
    if (@file_put_contents($tmp, $json) === false) {
        diggy_json(500, array('ok' => false, 'error' => '写入失败，请确认 my-levels 目录可写'));
    }
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        if (@file_put_contents($path, $json) === false) {
            diggy_json(500, array('ok' => false, 'error' => '写入失败'));
        }
    }

    $index = diggy_read_index($indexPath);
    diggy_upsert_meta($index, diggy_meta_from_level($body));
    if (!diggy_write_index($indexPath, $index)) {
        diggy_json(500, array('ok' => false, 'error' => '关卡已写但 index.json 更新失败'));
    }

    diggy_json(200, array(
        'ok' => true,
        'action' => 'save',
        'id' => $id,
        'path' => 'my-levels/' . $id . '.json',
        'index' => $index,
    ));
}

diggy_json(405, array('ok' => false, 'error' => '不支持的方法：' . $method));
