<?php
// /api/delete_schedule.php
header('Content-Type: application/json; charset=utf-8');

$root = dirname(__DIR__);                  // .../FrontTCC/api -> sobe 1 nível
$dir  = $root . '/storage/schedules';      // pasta onde estão os .json salvos

if (!is_dir($dir)) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'storage directory not found']);
  exit;
}

// Aceita JSON no body: { "file": "nome_arquivo.json" }
// (se preferir, também pode aceitar GET ?file=..., mas aqui usamos JSON)
$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);

if (!$body || !isset($body['file'])) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing file']);
  exit;
}

// Sanitiza: impede path traversal e restringe a .json
$file = basename($body['file']);                   // remove diretórios
if (!str_ends_with(strtolower($file), '.json')) {  // só .json
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'invalid file']);
  exit;
}

$path = $dir . '/' . $file;

// Verifica existência
if (!file_exists($path)) {
  http_response_code(404);
  echo json_encode(['ok' => false, 'error' => 'file not found']);
  exit;
}

// Apaga o arquivo
@unlink($path);

// Atualiza manifesto (index.json)
$manifestPath = $dir . '/index.json';
if (file_exists($manifestPath)) {
  $manifest = json_decode(file_get_contents($manifestPath), true) ?: [];
  // filtra o removido
  $manifest = array_values(array_filter($manifest, fn($it) => ($it['file'] ?? '') !== $file));
  file_put_contents($manifestPath, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

echo json_encode(['ok' => true, 'deleted' => $file]);
