<?php
// ======================================================
//  MRBS Import API — FrontTCC (regra: turmas 3N que iniciam em 8 => começam em 11)
//  Datas flexíveis de início e fim
// ======================================================

ob_start();
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
  exit;
}

// ===== LOGS =====
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// ===== TZ =====
$tz = 'America/Sao_Paulo';
date_default_timezone_set($tz);

// ===== DB MRBS =====
$db_host = 'localhost';
$db_port = 3307;
$db_name = 'mrbs';
$db_user = 'root';
$db_pass = '';
$tbl = 'mrbs_';

$dsn = "mysql:host=$db_host;port=$db_port;dbname=$db_name;charset=utf8mb4";
try {
  $pdo = new PDO($dsn, $db_user, $db_pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (Exception $e) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'db_conn_failed', 'detail' => $e->getMessage()]);
  exit;
}

// ===== INPUT =====
$input = file_get_contents('php://input');
$payload = json_decode($input, true);
if (json_last_error() !== JSON_ERROR_NONE) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'invalid_json', 'detail' => json_last_error_msg()]);
  exit;
}

$start_date = $payload['start_date'] ?? null;   // YYYY-MM-DD
$end_date = $payload['end_date'] ?? null;   // YYYY-MM-DD
$allocs = $payload['allocations'] ?? [];
$classes = $payload['classes'] ?? [];
$teachers = $payload['teachers'] ?? [];
$subjects = $payload['subjects'] ?? [];
$roomsFront = $payload['rooms'] ?? [];

if (!$start_date || !$end_date || !is_array($allocs)) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'missing_params']);
  exit;
}

// ===== Dicionários =====
$clsNameById = [];
foreach ($classes as $c)
  $clsNameById[(string) $c['id']] = $c['name'] ?? (string) $c['id'];

$subjNameById = [];
foreach ($subjects as $s)
  $subjNameById[(string) $s['id']] = $s['name'] ?? (string) $s['id'];

$teacherNameById = [];
foreach ($teachers as $t)
  $teacherNameById[(string) $t['id']] = $t['name'] ?? (string) $t['id'];

$roomNameByFrontId = [];
foreach ($roomsFront as $r)
  $roomNameByFrontId[(string) $r['id']] = $r['name'] ?? (string) $r['id'];

// ===== Mapa de tradução de SALAS =====
$ROOM_MAP = [
  'Lab. de Ajustagem e Caldeiraria' => 'Lab.Ajustagem',
  'Lab. de Fresagem' => 'Lab.Fresagem e Torno CNC',
  'Lab. Materiais e Ensaios' => 'Lab. Materiais e Ensaios',
  'Lab. Metrologia' => 'Lab.Metrologia',
  'Lab. Soldagem' => 'Lab.Soldagem',
  'Lab. Usinagem' => 'Lab.Usinagem',
  'Lab. - Estufa' => 'Estufa Agrícola',
  'Sala 118' => 'Sala 118',
  'Sala 119' => 'Sala 119',
  'Sala 120' => 'Sala 120',
  'Sala 121' => 'Sala 121',
  'Sala 122' => 'Sala 122',
  'Sala 217' => 'Sala 217',
  'Sala 218' => 'Sala 218',
  'Sala 219' => 'Sala 219',
  'Sala 221' => 'Sala 221',
  'Sala 222' => 'Sala 222',
  'Sala 223' => 'Sala 223',
  'Sala 224' => 'Sala 224',
  'Lab. Inf. 212' => 'Laboratório 212',
  'Auditório' => 'Auditório',
  'Lab. Inf. 112' => 'Laboratório 112',
  'Lab. Inf. 113' => 'Laboratório 113',
  'Lab. Inf. 114' => 'Laboratório 114',
  'Lab. Inf. 115' => 'Laboratório 115',
  'Lab. Inf. 116' => 'Laboratório 116',
  'Lab. de Automação Industrial' => 'Lab.Automação',
  'Lab. de Eletrônica Geral' => 'Lab.Eletrônica',
  'Lab. de Eletrotécnica' => 'Lab.Eletrotécnica',
  'Lab. de Física' => 'Lab. Física',
  'Lab. de Fundição' => 'Lab. de Fundição',
  'Lab. de Hidráulica e Pneumática' => 'Lab.Hidráulica Pneumática',
  'Lab. de Manutenção Mecânica' => 'Lab.Manutenção',
  'Lab. de Máquinas Agrícolas' => 'Lab. de Máquinas Agrícolas',
  'Lab. Fabricação' => 'Lab. Fabricação',
  'Lab. Máquinas Térmicas' => 'Lab. Máquinas Térmicas',
  'Sala de Reuniões' => 'Reuniões',
  'Lab. Biologia e Microscopia' => 'Lab. 1 - Biologia e Micro',
  'Lab. Orgânica e Bioquímica' => 'Lab. 2 - Orgânica e Bioqu',
  'Lab. Química Analítica' => 'Lab. 3 - Química Analític',
  'Lab. Processos Químicos' => 'Lab. 4 - Processos Químic',
  'Lab. Química Geral e Inorgânica' => 'Lab. 5 - Química G. e Ino',
  'Lab. Microbiologia' => 'Lab. 6 - Microbiologia',
  'Lab. Tecnologia de Alimentos' => 'Lab. 7 - Tecnologia de Al',
  'Lab. - Área Experimental' => 'Lab. - Área Experimental',
  'Sala Agro - UDA' => 'Agro - UDA',
  'Lab. Culturas (Grãos)' => 'Culturas (Grãos)',
  'Lab. Estufa Agrícola' => 'Estufa Agrícola',
  'Lab. Florestal' => 'Florestal',
  'Lab. Fruticultura' => 'Fruticultura',
  'Lab. Mecanização Agrícola' => 'UDA-Mecanização Agrícola',
  'Lab. Produção Vegetal e Solos' => 'UDA-Prod. Vegetal Solos',
  'Lab. Sistemas Agroflorestais' => 'Sistemas Agroflorestais',
  'Sala 117 - Lab. Acion.Elet.' => 'Sala 117-Lab.Acion.Elet.',
  'Sala 220 - Lab. Desenho' => 'Sala 220-Lab. Desenho Téc',
  'Lab. de Desenho Técnico' => 'Sala 220-Lab. Desenho Téc',
];

// ===== Períodos (modo "periods" do MRBS) =====
// Usamos UM ÚNICO mapeamento base (igual ao cod 1). Ajuste “8 => 11” só por override em turmas 3N.
$mapFrontToMrbs_BASE = [
  0 => 0,
  1 => 1,
  2 => 2,
  3 => 3,
  4 => 5,
  5 => 6,
  6 => 7,
  7 => 8,
  8 => 10, // base: 1º noturno
  9 => 13, // 2º
  10 => 15,// 3º
  11 => 16 // 4º
];

// Todos os períodos válidos no MRBS (inclui 11 pois podemos forçar 8=>11)
$validMrbsIndex = [0, 1, 2, 3, 5, 6, 7, 8, 10, 11, 13, 15, 16];
$validToPos = array_values($validMrbsIndex);

// ===== Funções auxiliares =====

// Técnica do “meio-dia”: minuto = índice do período
function mk_period_epoch(string $ymd, int $slot): int
{
  $dt = new DateTime($ymd . ' 12:00:00');
  $dt->setTime(12, $slot, 0);
  return (int) $dt->getTimestamp();
}

function course_and_phase($className)
{
  if (preg_match('/^(.*\S)\s+(\d{1,2})$/u', $className, $m))
    return [$m[1], $m[2]];
  return [$className, '0'];
}

// Busca sala EXISTENTE (não cria)
function get_existing_room_id(PDO $pdo, string $tbl, string $room_name): ?int
{
  $sel = $pdo->prepare("SELECT id FROM {$tbl}room WHERE room_name = :n LIMIT 1");
  $sel->execute([':n' => $room_name]);
  $id = $sel->fetchColumn();
  return $id ? (int) $id : null;
}

// Traduz o nome vindo do front e busca a sala existente
function resolve_room_id_from_front(PDO $pdo, string $tbl, array $ROOM_MAP, string $frontRoomId, array $roomNameByFrontId, array &$unknown_rooms, array &$room_map_hits): ?int
{
  $frontName = $roomNameByFrontId[(string) $frontRoomId] ?? (string) $frontRoomId;

  if (isset($ROOM_MAP[$frontName])) {
    $room_map_hits[$frontName] = ($room_map_hits[$frontName] ?? 0) + 1;
    $mrbsName = $ROOM_MAP[$frontName];
  } elseif (preg_match('/Lab\.\s*Inf\.\s*(\d+)/u', $frontName, $m)) {
    $mrbsName = "Laboratório " . $m[1];
    $room_map_hits[$frontName] = ($room_map_hits[$frontName] ?? 0) + 1;
  } else {
    $mrbsName = $frontName;
    $unknown_rooms[] = $frontName;
  }
  return get_existing_room_id($pdo, $tbl, $mrbsName);
}

// Calcula a “data base” da 1ª ocorrência considerando o dia da semana do start_date
function calculate_base_date($start_date, $dayIndex)
{
  $start_dt = new DateTime($start_date);
  $start_day_of_week = (int) $start_dt->format('N') - 1; // 0=Seg, 1=Ter, ..., 5=Sáb

  $base_dt = clone $start_dt;
  if ($dayIndex < $start_day_of_week) {
    $base_dt->modify('next monday')->modify("+{$dayIndex} days");
  } else {
    $days_to_add = $dayIndex - $start_day_of_week;
    $base_dt->modify("+{$days_to_add} days");
  }
  return $base_dt;
}

// Analisa períodos noturnos da turma por dia (front 8..11)
function analyze_night_periods_for_class(string $classId, array $allAllocs): array
{
  $counts = [0, 0, 0, 0, 0, 0]; // seg..sáb
  foreach ($allAllocs as $alloc) {
    if ((string) ($alloc['classId'] ?? '') !== $classId)
      continue;
    $day = (int) ($alloc['day'] ?? 0);
    $start = (int) ($alloc['start'] ?? 0);
    $dur = (int) ($alloc['duration'] ?? 1);
    for ($i = 0; $i < $dur; $i++) {
      $p = $start + $i;
      if ($p >= 8 && $p <= 11)
        $counts[$day]++;
    }
  }
  return $counts;
}

// Decide a tag: '4N' se em ALGUM dia houve 4 períodos noturnos, senão '3N'
function pick_mapping_tag(array $counts): string
{
  return (max($counts) >= 4) ? '4N' : '3N';
}

// ===== SQL =====
$ins = $pdo->prepare("
  INSERT INTO {$tbl}entry
    (start_time, end_time, entry_type, repeat_id, room_id, timestamp, create_by, name, type, description, status)
  VALUES
    (:start_time, :end_time, 0, NULL, :room_id, :ts, :create_by, :name, :type, :description, 0)
");
$overlap = $pdo->prepare("
  SELECT COUNT(*) FROM {$tbl}entry
  WHERE room_id = :room_id
    AND (start_time < :end_time AND end_time > :start_time)
");

// ===== Processamento =====
try {
  $inserted = 0;
  $skipped = 0;
  $skipped_reasons = [
    'invalid_front_period' => 0,
    'mrbs_index_map_fail' => 0,
    'overlap' => 0,
    'no_room_id' => 0,
    'room_not_found' => 0,
  ];
  $unknown_rooms = [];
  $room_map_hits = [];
  $missing_rooms = [];

  $classMappingCache = [];     // classId => '4N' | '3N'
  $class_mappings = [];     // NomeTurma => '4N' | '3N'
  $class_night_analysis = [];  // NomeTurma => detalhes

  $create_by = 'admin';
  $type = 'I';
  $seriesEnd = new DateTime($end_date . ' 23:59:59');

  // 1) Cache de tag por turma (com análise noturna para debug)
  foreach ($allocs as $a) {
    $cid = (string) ($a['classId'] ?? '');
    if ($cid === '' || isset($classMappingCache[$cid]))
      continue;

    $counts = analyze_night_periods_for_class($cid, $allocs);
    $tag = pick_mapping_tag($counts); // '4N' ou '3N'
    $classMappingCache[$cid] = $tag;

    $className = $clsNameById[$cid] ?? $cid;
    $class_mappings[$className] = $tag;
    $class_night_analysis[$className] = [
      'periods_by_day' => $counts,
      'has_4_periods' => (max($counts) >= 4),
      'mapping_tag' => $tag,
    ];
  }

  // 2) Inserção das entradas
  foreach ($allocs as $a) {
    $classId = (string) ($a['classId'] ?? '');
    $subjectId = (string) ($a['subjectId'] ?? '');
    $teacherIds = $a['teacherIds'] ?? [];
    $roomIdFront = $a['roomId'] ?? null;

    $frontStart = (int) $a['start'];
    $frontDur = (int) $a['duration'];

    // Valida o período do front no mapeamento base
    if (!isset($mapFrontToMrbs_BASE[$frontStart])) {
      $skipped++;
      $skipped_reasons['invalid_front_period']++;
      continue;
    }

    // Converte início pelo mapeamento base
    $mrbsStartIndex = $mapFrontToMrbs_BASE[$frontStart];

    // *** OVERRIDE pedido ***
    // Se a turma é '3N' (nunca teve 4 noturnos) E a aula começa no front 8,
    // então força o início em 11 (no MRBS), em vez de 10 do array base.
    $mappingTag = $classMappingCache[$classId] ?? '3N';
    if ($mappingTag === '3N' && $frontStart === 8) {
      $mrbsStartIndex = 11; // override pontual
    }

    // (1) Validar o período de frente no mapa base
    if (!isset($mapFrontToMrbs_BASE[$frontStart])) {
      $skipped++;
      $skipped_reasons['invalid_front_period']++;
      continue;
    }

    // (2) Calcular o índice MRBS de início com override 3N@8 => 11
    $mrbsStartIndex = $mapFrontToMrbs_BASE[$frontStart];
    $mappingTag = $classMappingCache[$classId] ?? '3N';
    if ($mappingTag === '3N' && $frontStart === 8) {
      $mrbsStartIndex = 11; // força 8=>11 para turmas 3N
    }

    // (3) Calcular o índice MRBS do FIM usando o mapeamento do ÚLTIMO período de frente
    $lastFront = $frontStart + $frontDur - 1;
    if (!isset($mapFrontToMrbs_BASE[$lastFront])) {
      $skipped++;
      $skipped_reasons['invalid_front_period']++;
      continue;
    }

    // Índices finais para o timestamp
    $idxStart = $mrbsStartIndex;
    $idxEnd = $mapFrontToMrbs_BASE[$lastFront] + 1; // +1 = limite superior


    $className = $clsNameById[$classId] ?? $classId;
    $subjectName = $subjNameById[$subjectId] ?? $subjectId;
    $teacherNames = array_map(fn($tid) => $teacherNameById[(string) $tid] ?? (string) $tid, $teacherIds);
    [$curso, $fase] = course_and_phase($className);

    // Sala existente (não cria)
    $room_id = $roomIdFront
      ? resolve_room_id_from_front($pdo, $tbl, $ROOM_MAP, $roomIdFront, $roomNameByFrontId, $unknown_rooms, $room_map_hits)
      : null;

    if (!$room_id) {
      $skipped++;
      $skipped_reasons['room_not_found']++;
      $frontName = $roomNameByFrontId[(string) $roomIdFront] ?? (string) $roomIdFront;
      if (!in_array($frontName, $missing_rooms))
        $missing_rooms[] = $frontName;
      continue;
    }

    // Expansão semanal
    $dayIndex = (int) ($a['day'] ?? 0); // 0=Seg,1=Ter,...,5=Sáb
    $dt = calculate_base_date($start_date, $dayIndex);

    while ($dt <= $seriesEnd) {
      $ymd = $dt->format('Y-m-d');
      $start_ts = mk_period_epoch($ymd, $idxStart);
      $end_ts = mk_period_epoch($ymd, $idxEnd);

      // Conflito?
      $overlap->execute([
        ':room_id' => $room_id,
        ':start_time' => $start_ts,
        ':end_time' => $end_ts
      ]);
      if ((int) $overlap->fetchColumn() > 0) {
        $skipped++;
        $skipped_reasons['overlap']++;
        $dt->modify('+7 day');
        continue;
      }

      $title = "{$className} - {$subjectName}";
      $desc = "Curso: {$curso}\nFase: {$fase}\nProf(s): " . implode(', ', $teacherNames);

      $ins->execute([
        ':start_time' => $start_ts,
        ':end_time' => $end_ts,
        ':room_id' => $room_id,
        ':ts' => date('Y-m-d H:i:s'),
        ':create_by' => $create_by,
        ':name' => $title,
        ':type' => $type,
        ':description' => $desc
      ]);
      $inserted++;
      $dt->modify('+7 day');
    }
  }

  // ===== Saída JSON =====
  http_response_code(200);
  ob_clean();
  echo json_encode([
    'ok' => true,
    'inserted' => $inserted,
    'skipped' => $skipped,
    'skipped_reasons' => $skipped_reasons,
    'unknown_rooms' => array_values(array_unique($unknown_rooms)),
    'missing_rooms' => array_values(array_unique($missing_rooms)),
    'room_map_hits' => $room_map_hits,
    'class_mappings' => $class_mappings,        // NomeTurma => '4N'/'3N'
    'night_analysis' => $class_night_analysis,  // períodos noturnos por dia, flag has_4_periods, tag
    'debug_info' => [
      'rule' => "Único mapeamento base (8=>10). Se turma é '3N' e start==8, força 11.",
      'validMrbsIndex' => $validMrbsIndex
    ]
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;

} catch (Throwable $e) {
  error_log("[mrbs_import] exception: " . $e->getMessage() . " @ " . $e->getFile() . ":" . $e->getLine());
  http_response_code(500);
  ob_clean();
  echo json_encode([
    'ok' => false,
    'error' => 'exception',
    'detail' => $e->getMessage()
  ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
