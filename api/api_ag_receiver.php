<?php
// C:\xampp\htdocs\FrontTCC\api\api_ag_receiver.php

date_default_timezone_set('America/Sao_Paulo'); // Define para horário de Brasília (UTC-3)

// === Config ===
$STORAGE_DIR = __DIR__ . '/storage';
$LATEST_FILE = $STORAGE_DIR . '/ag_latest.json';
$EXPECTED_TOKEN = getenv('AG_RECEIVER_TOKEN') ?: '';

// === Helpers ===
function json_response($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ensure_storage($dir) {
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
        error_log("Criado diretório: $dir");
    }
    if (!is_dir($dir) || !is_writable($dir)) {
        error_log("Diretório não gravável: $dir");
        json_response(['ok' => false, 'error' => 'storage_not_writable', 'dir' => $dir], 500);
    }
}

// === Depuração ===
error_log("Requisição recebida: " . $_SERVER['REQUEST_METHOD'] . " - " . ($ct ?? 'sem Content-Type'));

// === Somente POST com JSON ===
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    error_log("Método não permitido: " . $_SERVER['REQUEST_METHOD']);
    json_response(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

$ct = $_SERVER['CONTENT_TYPE'] ?? $_SERVER['HTTP_CONTENT_TYPE'] ?? '';
if (stripos($ct, 'application/json') === false) {
    error_log("Content-Type inválido: $ct");
    json_response(['ok' => false, 'error' => 'invalid_content_type'], 400);
}

// === Autenticação ===
$recvToken = $_SERVER['HTTP_X_AG_TOKEN'] ?? '';
if ($EXPECTED_TOKEN !== '' && $recvToken !== $EXPECTED_TOKEN) {
    error_log("Autenticação falhou: Token recebido '$recvToken', esperado '$EXPECTED_TOKEN'");
    json_response(['ok' => false, 'error' => 'unauthorized'], 401);
}

// === Lê corpo JSON ===
$body = file_get_contents('php://input');
error_log("Corpo recebido: " . ($body ?: 'vazio'));
if ($body === false || trim($body) === '') {
    json_response(['ok' => false, 'error' => 'empty_body'], 400);
}

$payload = json_decode($body, true);
error_log("Payload decodificado: " . print_r($payload, true));
if (json_last_error() !== JSON_ERROR_NONE) {
    json_response(['ok' => false, 'error' => 'invalid_json', 'detail' => json_last_error_msg()], 400);
}

// === Validação do Payload ===
if (!isset($payload['classes']) || !is_array($payload['classes'])) {
    json_response(['ok' => false, 'error' => 'invalid_payload_format'], 400);
}

// === Salva como arquivo ===
ensure_storage($STORAGE_DIR);

$tmpFile = $LATEST_FILE . '.tmp';
$bytes = file_put_contents($tmpFile, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
error_log("Escrita em $tmpFile: $bytes bytes");
if ($bytes === false) {
    json_response(['ok' => false, 'error' => 'write_failed'], 500);
}

if (!@rename($tmpFile, $LATEST_FILE)) {
    error_log("Falha ao renomear $tmpFile para $LATEST_FILE");
    @unlink($LATEST_FILE);
    if (!@rename($tmpFile, $LATEST_FILE)) {
        json_response(['ok' => false, 'error' => 'atomic_rename_failed'], 500);
    }
}

json_response([
    'ok' => true,
    'saved' => true,
    'bytes' => $bytes,
    'saved_at' => date('c'),
    'path' => basename($LATEST_FILE)
], 200);