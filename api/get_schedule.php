<?php
// /api/get_schedule.php
header('Content-Type: application/json; charset=utf-8');

$root = dirname(__DIR__);
$dir  = $root . '/storage/schedules';

$file = $_GET['file'] ?? '';
// higieniza
$file = basename($file);

$path = $dir . '/' . $file;
if (!preg_match('/\.json$/', $file) || !is_file($path)) {
  http_response_code(404);
  echo json_encode(['error' => 'not found']);
  exit;
}

readfile($path);
