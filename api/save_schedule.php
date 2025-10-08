<?php
// /api/save_schedule.php
header('Content-Type: application/json; charset=utf-8');

$root = dirname(__DIR__); // .../FrontTCC/api  -> sobe 1 nível
$dir  = $root . '/storage/schedules';

if (!is_dir($dir)) {
  @mkdir($dir, 0775, true);
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!$data || !isset($data['name'], $data['payload'])) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'invalid payload']);
  exit;
}

$name = preg_replace('/[^a-zA-Z0-9_\- ]+/', '', $data['name']);
$name = trim($name);
if ($name === '') $name = 'horario';

$filename = $name . '_' . date('Ymd_His') . '.json';
$path = $dir . '/' . $filename;

file_put_contents($path, json_encode($data['payload'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

// Atualiza manifesto
$manifestPath = $dir . '/index.json';
$manifest = [];
if (file_exists($manifestPath)) {
  $manifest = json_decode(file_get_contents($manifestPath), true) ?: [];
}
$manifest[] = [
  'name'     => $data['name'],
  'file'     => $filename,
  'savedAt'  => date('c')
];
file_put_contents($manifestPath, json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo json_encode(['ok' => true, 'file' => $filename]);
