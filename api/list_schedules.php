<?php
// /FrontTCC/api/list_schedules.php
header('Content-Type: application/json; charset=utf-8');

$root = dirname(__DIR__);
$manifestPath = $root . '/storage/schedules/index.json';

if (!file_exists($manifestPath)) {
  echo json_encode([]);
  exit;
}

$raw = file_get_contents($manifestPath);
$manifest = json_decode($raw, true);
if (json_last_error() !== JSON_ERROR_NONE) {
  echo json_encode([]);
  exit;
}

/**
 * Queremos devolver SEMPRE um ARRAY de itens:
 * [ { name, file, savedAt }, ... ]
 */
if (is_array($manifest)) {
  // Caso 1: já é a lista antiga (array simples)
  $is_list = array_is_list($manifest)
          && (empty($manifest) || (isset($manifest[0]['file']) && isset($manifest[0]['savedAt'])));
  if ($is_list) {
    echo json_encode($manifest, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
  }

  // Caso 2: novo formato { files: [...], latest: {...} }
  if (isset($manifest['files']) && is_array($manifest['files'])) {
    echo json_encode($manifest['files'], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
  }

  // Caso 3: { items: [...] }
  if (isset($manifest['items']) && is_array($manifest['items'])) {
    echo json_encode($manifest['items'], JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
  }
}

echo json_encode([]);
