<?php
// /api/save_schedule.php
header('Content-Type: application/json; charset=utf-8');

$root = dirname(__DIR__);              // .../FrontTCC/api -> sobe p/ .../FrontTCC
$dir  = $root . '/storage/schedules';
if (!is_dir($dir)) { @mkdir($dir, 0775, true); }

$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);

// Aceita { name, data } (atual) ou { name, payload } (legado)
if (!$body || !isset($body['name']) || !isset($body['data']) && !isset($body['payload'])) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'invalid payload']);
  exit;
}
$payload = $body['data'] ?? $body['payload'];

$name = preg_replace('/[^a-zA-Z0-9_\- ]+/', '', $body['name']);
$name = trim($name);
if ($name === '') $name = 'horario';

$filename = $name . '_' . date('Ymd_His') . '.json';
$path     = $dir . '/' . $filename;

// grava o objeto inteiro (allocations + unallocated etc.)
file_put_contents($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

// atualiza manifesto
$manifestPath = $dir . '/index.json';
$manifest = [];
if (file_exists($manifestPath)) {
  $manifest = json_decode(file_get_contents($manifestPath), true) ?: [];
}
$manifest[] = [
  'name'    => $body['name'],
  'file'    => $filename,
  'savedAt' => date('c'),
];
file_put_contents($manifestPath, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true, 'file' => $filename]);
