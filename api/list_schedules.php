<?php
// /api/list_schedules.php
header('Content-Type: application/json; charset=utf-8');

$root = dirname(__DIR__);
$manifestPath = $root . '/storage/schedules/index.json';

if (!file_exists($manifestPath)) {
  echo json_encode([]);
  exit;
}

$manifest = json_decode(file_get_contents($manifestPath), true);
echo json_encode($manifest ?: []);
