/* === Visualização do cronograma consolidado (read-only) === */

function bandColor(b) {
  return b === 'M' ? 'bg-green-500'
    : b === 'T' ? 'bg-yellow-500'
      : 'bg-purple-500';
}

/* 1) Helper para pegar ?file=... da URL */
function getQueryParam(name) {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  } catch {
    return null;
  }
}

/* 2) Carregador “flex”: prioriza ?file=..., senão localStorage */
async function loadConsolidated() {
  const file = getQueryParam('file');

  // a) Se vier file na URL, busca direto no backend
  if (file) {
    try {
      const url = `${location.origin}/FrontTCC/api/get_schedule.php?file=${encodeURIComponent(file)}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      // opcional: marca no subtítulo qual arquivo está sendo exibido
      const sub = document.getElementById('viz-subtitle');
      if (sub) sub.textContent = (sub.textContent ? sub.textContent + ' • ' : '') + `Arquivo: ${file}`;
      return data;
    } catch (e) {
      console.error('Falha ao carregar arquivo da URL:', e);
      alert('Não foi possível abrir este horário (arquivo ausente ou inválido).');
      return null;
    }
  }

  // b) Fallback: localStorage (fluxo atual)
  try {
    const raw = localStorage.getItem('consolidatedSchedule');
    if (!raw) {
      alert("Nenhum cronograma consolidado encontrado.\nVolte para a página de edição e consolide.");
      return null;
    }
    return JSON.parse(raw);
  } catch {
    alert("Consolidado inválido no navegador. Refaça a visualização a partir da tela de edição.");
    return null;
  }
}

function lessonMarkup(lesson, subjectById, classById, teacherById, roomById, opts = {}) {
  const subj = subjectById[lesson.subjectId];
  const abbr = subj?.abbr || (subj?.name?.slice(0, 3) ?? '---').toUpperCase();

  const showClass = !!opts.withClassBadge;
  const classLabel = showClass ? (classById?.[lesson.classId]?.name || lesson.classId || '') : '';

  const showTeacherBadges = !!opts.withTeacherBadges;
  const showRoomBadge = !!opts.withRoomBadge;

  const teacherBadges = showTeacherBadges
    ? (lesson.teacherIds || [])
        .map(tid => {
          const name = teacherById?.[tid]?.name || tid;
          return `<span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">${name}</span>`;
        })
        .join('')
    : '';

  const roomBadge = showRoomBadge && lesson.roomId
    ? `<span class="text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-200">${roomById?.[lesson.roomId]?.name || lesson.roomId}</span>`
    : '';

  return `
    <div class="flex flex-col items-center justify-center leading-tight font-bold text-sm">
      <span>${abbr}</span>
      ${showClass && classLabel
        ? `<span class="mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">${classLabel}</span>`
        : ''
      }
      ${(teacherBadges || roomBadge)
        ? `<div class="mt-1 flex flex-wrap items-center justify-center gap-1">${teacherBadges}${roomBadge}</div>`
        : ''
      }
    </div>`;
}

function cellTitle(lesson, classById, subjectById, teacherById, roomById) {
  const cls = classById[lesson.classId]?.name ?? lesson.classId;
  const subj = subjectById[lesson.subjectId]?.name ?? lesson.subjectId;
  const profs = (lesson.teacherIds || []).map(id => teacherById[id]?.name ?? id).join(', ');
  const room = lesson.roomId ? (roomById?.[lesson.roomId]?.name || lesson.roomId) : '—';
  return `${cls} • ${profs} • ${subj} • ${room} (dur: ${lesson.duration})`;
}

/* ---------- Headers dinâmicos ---------- */
function renderHeadersFull(meta) {
  const days = document.getElementById('days-header');
  days.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'bg-gray-800 text-white p-3 font-bold text-center rounded-lg';
  title.textContent = 'TURMAS';
  days.appendChild(title);

  const dayNames = ['SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO'];
  for (const dn of dayNames) {
    const d = document.createElement('div');
    d.className = 'bg-blue-600 text-white p-3 font-bold text-center rounded-lg header-day';
    d.textContent = dn;
    days.appendChild(d);
  }

  const header = document.getElementById('periods-header');
  while (header.children.length > 1) header.removeChild(header.lastChild);

  for (let d = 0; d < meta.days.length; d++) {
    const col = document.createElement('div');
    col.className = 'day-column';
    for (const p of meta.periods) {
      const slot = document.createElement('div');
      slot.className = `${bandColor(p.band)} text-white text-xs p-2 text-center font-medium period-label`;
      slot.innerHTML = `${p.code}<br>${p.start}`;
      col.appendChild(slot);
    }
    header.appendChild(col);
  }
}

function renderHeadersSingle(meta, subtitulo) {
  const sub = document.getElementById('viz-subtitle');
  if (sub) sub.textContent = subtitulo || '';

  const days = document.getElementById('days-header');
  days.innerHTML = '';
  const faixa = document.createElement('div');
  faixa.className = 'bg-blue-600 text-white p-3 font-bold text-center rounded-lg header-day';
  faixa.textContent = 'PERÍODOS';
  days.appendChild(faixa);

  const header = document.getElementById('periods-header');
  header.innerHTML = '';

  const diasCell = document.createElement('div');
  diasCell.className = 'bg-gray-800 text-white p-3 font-bold text-center rounded-lg';
  diasCell.textContent = 'DIAS';
  header.appendChild(diasCell);

  const col = document.createElement('div');
  col.className = 'day-column';
  for (const p of meta.periods) {
    const slot = document.createElement('div');
    slot.className = `${bandColor(p.band)} text-white text-xs p-2 text-center font-medium period-label`;
    slot.innerHTML = `${p.code}<br>${p.start}`;
    col.appendChild(slot);
  }
  header.appendChild(col);
}

/* ---------- Helpers de render: grid + bloco fundido ---------- */
let vizMap = {}; // vizMap[classId][day][period] = cell
function ensureVizMap(classes, meta) {
  vizMap = {};
  classes.forEach(c => {
    vizMap[c.id] = Array.from({ length: meta.days.length }, () => Array(meta.periods.length).fill(null));
  });
}

function baseCell(turmaId, dia, periodo) {
  const cell = document.createElement('div');
  cell.className = 'time-slot flex items-center justify-center text-xs';
  cell.dataset.turmaId = turmaId;
  cell.dataset.dia = String(dia);
  cell.dataset.periodo = String(periodo);
  // âncora por coluna para o grid não quebrar quando dermos span
  cell.style.gridColumnStart = String(periodo + 1);
  cell.style.gridColumnEnd = 'span 1';
  return cell;
}

/** Aplica o “bloco único” na visualização (sem eventos de clique). */
function placeBlockViz(
  turmaId,
  day,
  start,
  lesson,
  subjectById,
  classById,
  teacherById,
  roomById,
  opts = {}
) {
  for (let k = 0; k < lesson.duration; k++) {
    const cell = vizMap[turmaId][day][start + k];
    if (k === 0) {
      cell.classList.add('occupied', 'block-head');
      cell.style.gridColumnEnd = `span ${lesson.duration}`;
      cell.innerHTML = lessonMarkup(lesson, subjectById, classById, teacherById, roomById, opts);
      cell.title = cellTitle(lesson, classById, subjectById, teacherById, roomById);
      cell.style.display = '';
    } else {
      cell.classList.add('occupied', 'block-tail');
      cell.style.display = 'none';
      cell.style.gridColumnEnd = 'span 1';
      cell.innerHTML = '';
      cell.title = '';
    }
  }
}

/* ---------- Grade ---------- */
// FULL: linhas = turmas; colunas = dias (cada dia 12 períodos)
function renderGridFull(data) {
  const grid = document.getElementById('viz-grid');
  grid.innerHTML = '';

  const { classes, subjects, teachers, rooms, meta, allocations } = data;
  const subjectById = Object.fromEntries(subjects.map(s => [s.id, s]));
  const teacherById = Object.fromEntries(teachers.map(t => [t.id, t]));
  const classById = Object.fromEntries(classes.map(c => [c.id, c]));
  const roomById = Object.fromEntries((rooms || []).map(r => [r.id, r]));
  const P = meta.periods.length;

  ensureVizMap(classes, meta);

  classes.forEach(turma => {
    const turmaRow = document.createElement('div');
    turmaRow.className = 'turma-row';

    const turmaCell = document.createElement('div');
    turmaCell.className = 'bg-gray-100 p-3 font-medium text-sm border-2 border-gray-300 flex items-center rounded-lg';
    turmaCell.textContent = turma.name;
    turmaRow.appendChild(turmaCell);

    for (let dia = 0; dia < meta.days.length; dia++) {
      const dayColumn = document.createElement('div');
      dayColumn.className = 'day-column';
      for (let p = 0; p < P; p++) {
        const cell = baseCell(turma.id, dia, p);
        vizMap[turma.id][dia][p] = cell;
        dayColumn.appendChild(cell);
      }
      turmaRow.appendChild(dayColumn);
    }
    grid.appendChild(turmaRow);
  });

  // pintar blocos (cada allocation já tem duration)
  allocations.forEach(a => {
    placeBlockViz(a.classId, a.day, a.start, a, subjectById, classById, teacherById, roomById);
  });
}

// TURMA ÚNICA: linhas = dias; colunas = 12 períodos
function renderGridSingleClass(data, classId) {
  const grid = document.getElementById('viz-grid');
  grid.innerHTML = '';

  const { classes, subjects, teachers, rooms, meta, allocations } = data;
  const subjectById = Object.fromEntries(subjects.map(s => [s.id, s]));
  const teacherById = Object.fromEntries(teachers.map(t => [t.id, t]));
  const classById = Object.fromEntries(classes.map(c => [c.id, c]));
  const roomById = Object.fromEntries((rooms || []).map(r => [r.id, r]));
  const P = meta.periods.length;
  ensureVizMap(classes, meta); // ainda usamos para reaproveitar placeBlockViz

  const dayNamesFull = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  for (let dia = 0; dia < meta.days.length; dia++) {
    const row = document.createElement('div');
    row.className = 'turma-row';

    const dayName = document.createElement('div');
    dayName.className = 'bg-gray-100 p-3 font-bold text-lg border-2 border-gray-300 flex items-center justify-center rounded-lg';
    dayName.textContent = dayNamesFull[dia];
    row.appendChild(dayName);

    const periodsCol = document.createElement('div');
    periodsCol.className = 'day-column';

    for (let p = 0; p < P; p++) {
      const cell = baseCell(classId, dia, p);
      vizMap[classId][dia][p] = cell;
      periodsCol.appendChild(cell);
    }

    row.appendChild(periodsCol);
    grid.appendChild(row);
  }

  allocations
    .filter(a => a.classId === classId)
    .forEach(a =>
      placeBlockViz(
        a.classId, a.day, a.start, a,
        subjectById, classById, teacherById, roomById,
        { withTeacherBadges: true, withRoomBadge: true }
      )
    );
}

/* ---------- Lógicas de CONFLITO (teacher/room) ---------- */
function assignLanesByDay(events, totalPeriods) {
  const byDay = new Map();
  events.forEach(ev => {
    if (!byDay.has(ev.day)) byDay.set(ev.day, []);
    byDay.get(ev.day).push(ev);
  });

  const result = new Map();
  const laneCountByDay = new Map();

  for (const [day, list] of byDay.entries()) {
    list.sort((a, b) => (a.start - b.start) || ((b.duration || 1) - (a.duration || 1)));

    const laneEnds = [];
    const placed = [];

    for (const ev of list) {
      const dur = Number(ev.duration || 1);
      const evEnd = ev.start + dur;

      let lane = -1;
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] <= ev.start) { lane = i; break; }
      }
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }

      laneEnds[lane] = evEnd;
      placed.push({ ...ev, lane, end: evEnd });
    }

    result.set(day, placed);
    laneCountByDay.set(day, laneEnds.length || 1);
  }

  return { byDay: result, laneCountByDay };
}

/** Renderização por PROFESSOR com empilhamento (lanes) */
function renderGridSingleTeacher(data, teacherId) {
  const grid = document.getElementById('viz-grid');
  grid.innerHTML = '';

  const { classes, subjects, teachers, rooms, meta, allocations } = data;
  const subjectById = Object.fromEntries(subjects.map(s => [s.id, s]));
  const teacherById = Object.fromEntries(teachers.map(t => [t.id, t]));
  const classById = Object.fromEntries(classes.map(c => [c.id, c]));
  const roomById = Object.fromEntries((rooms || []).map(r => [r.id, r]));
  const P = meta.periods.length;

  ensureVizMap(classes, meta);

  const dayNamesFull = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const dayRows = [];
  for (let dia = 0; dia < meta.days.length; dia++) {
    const row = document.createElement('div');
    row.className = 'turma-row';

    const dayName = document.createElement('div');
    dayName.className = 'bg-gray-100 p-3 font-bold text-lg border-2 border-gray-300 flex items-center justify-center rounded-lg';
    dayName.textContent = dayNamesFull[dia];
    row.appendChild(dayName);

    const periodsCol = document.createElement('div');
    periodsCol.className = 'day-column relative';

    const cellsOfDay = [];
    for (let p = 0; p < P; p++) {
      const cell = baseCell('ANY', dia, p);
      cellsOfDay.push(cell);
      periodsCol.appendChild(cell);
    }

    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 pointer-events-none';
    periodsCol.appendChild(overlay);

    classes.forEach(c => {
      for (let p = 0; p < P; p++) {
        vizMap[c.id][dia][p] = cellsOfDay[p];
      }
    });

    row.appendChild(periodsCol);
    grid.appendChild(row);
    dayRows.push({ periodsCol, cellsOfDay, overlay });
  }

  const myEvents = allocations
    .filter(a => (a.teacherIds || []).includes(teacherId))
    .map(a => ({ ...a, end: a.start + Number(a.duration || 1) }));

  const { byDay, laneCountByDay } = assignLanesByDay(myEvents, P);

  dayRows.forEach(({ periodsCol, cellsOfDay, overlay }, dia) => {
    const events = byDay.get(dia) || [];
    const laneCount = laneCountByDay.get(dia) || 1;

    const baseH = (cellsOfDay[0]?.offsetHeight) || 56;
    const rowH = baseH * laneCount;

    cellsOfDay.forEach(c => { c.style.height = `${rowH}px`; });
    periodsCol.style.minHeight = `${rowH}px`;

    overlay.innerHTML = '';
    overlay.style.pointerEvents = 'none';
    events.forEach(ev => {
      const leftPct = (ev.start / P) * 100;
      const widthPct = (Math.min(ev.end, P) - ev.start) / P * 100;
      const topPx = ev.lane * baseH;

      const block = document.createElement('div');
      block.className =
        'absolute rounded-md bg-rose-200 border border-rose-400 shadow-sm flex items-center justify-center text-xs font-bold';
      block.style.left = `${leftPct}%`;
      block.style.width = `${widthPct}%`;
      block.style.top = `${topPx + 2}px`;
      block.style.height = `${baseH - 4}px`;
      block.style.padding = '2px 4px';
      block.style.pointerEvents = 'auto';

      block.innerHTML = lessonMarkup(ev, subjectById, classById, teacherById, roomById, { withClassBadge: true });
      block.title = cellTitle(ev, classById, subjectById, teacherById, roomById);

      overlay.appendChild(block);
    });
  });
}

/** Renderização por SALA */
function renderGridSingleRoom(data, roomId) {
  const grid = document.getElementById('viz-grid');
  grid.innerHTML = '';

  const { classes, subjects, teachers, rooms, meta, allocations } = data;
  const subjectById = Object.fromEntries(subjects.map(s => [s.id, s]));
  const teacherById = Object.fromEntries(teachers.map(t => [t.id, t]));
  const classById = Object.fromEntries(classes.map(c => [c.id, c]));
  const roomById = Object.fromEntries((rooms || []).map(r => [r.id, r]));
  const P = meta.periods.length;

  ensureVizMap(classes, meta);

  const dayNamesFull = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  const dayRows = [];
  for (let dia = 0; dia < meta.days.length; dia++) {
    const row = document.createElement('div');
    row.className = 'turma-row';

    const dayName = document.createElement('div');
    dayName.className =
      'bg-gray-100 p-3 font-bold text-lg border-2 border-gray-300 flex items-center justify-center rounded-lg';
    dayName.textContent = dayNamesFull[dia];
    row.appendChild(dayName);

    const periodsCol = document.createElement('div');
    periodsCol.className = 'day-column relative';

    const cellsOfDay = [];
    for (let p = 0; p < P; p++) {
      const cell = baseCell('ANY', dia, p);
      cellsOfDay.push(cell);
      periodsCol.appendChild(cell);
    }

    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 pointer-events-none';
    periodsCol.appendChild(overlay);

    classes.forEach(c => {
      for (let p = 0; p < P; p++) {
        vizMap[c.id][dia][p] = cellsOfDay[p];
      }
    });

    row.appendChild(periodsCol);
    grid.appendChild(row);
    dayRows.push({ periodsCol, cellsOfDay, overlay });
  }

  const myEvents = allocations
    .filter(a => a.roomId === roomId)
    .map(a => ({ ...a, end: a.start + Number(a.duration || 1) }));

  const { byDay, laneCountByDay } = assignLanesByDay(myEvents, P);

  dayRows.forEach(({ periodsCol, cellsOfDay, overlay }, dia) => {
    const events = byDay.get(dia) || [];
    const laneCount = laneCountByDay.get(dia) || 1;

    const baseH = (cellsOfDay[0]?.offsetHeight) || 56;
    const rowH = baseH * laneCount;

    cellsOfDay.forEach(c => { c.style.height = `${rowH}px`; });
    periodsCol.style.minHeight = `${rowH}px`;

    overlay.innerHTML = '';
    overlay.style.pointerEvents = 'none';
    events.forEach(ev => {
      const leftPct = (ev.start / P) * 100;
      const widthPct = (Math.min(ev.end, P) - ev.start) / P * 100;
      const topPx = ev.lane * baseH;

      const block = document.createElement('div');
      block.className =
        'absolute rounded-md bg-violet-200 border border-violet-400 shadow-sm flex items-center justify-center text-xs font-bold';
      block.style.left = `${leftPct}%`;
      block.style.width = `${widthPct}%`;
      block.style.top = `${topPx + 2}px`;
      block.style.height = `${baseH - 4}px`;
      block.style.padding = '2px 4px';
      block.style.pointerEvents = 'auto';

      // Mostra disciplina e turma (sem professor)
      block.innerHTML = lessonMarkup(ev, subjectById, classById, teacherById, roomById, {
        withClassBadge: true,
        withTeacherBadges: false,
        withRoomBadge: false
      });
      block.title = cellTitle(ev, classById, subjectById, teacherById, roomById);

      overlay.appendChild(block);
    });
  });
}


/* ---------- Filtros ---------- */
function populateFilters(data) {
  const selC = document.getElementById('f-class');
  const selT = document.getElementById('f-teacher');
  const selR = document.getElementById('f-room');

  if (selC) selC.innerHTML = '<option value="">Todas</option>' +
    data.classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  if (selT) selT.innerHTML = '<option value="">Todos</option>' +
    data.teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

  if (selR) selR.innerHTML = '<option value="">Todas</option>' +
    (data.rooms || []).map(r => `<option value="${r.id}">${r.name}</option>`).join('');
}

function applyFilters(data) {
  const selC = document.getElementById('f-class');
  const selT = document.getElementById('f-teacher');
  const selR = document.getElementById('f-room');

  const classVal = selC?.value || '';
  const teacherVal = selT?.value || '';
  const roomVal = selR?.value || '';
  const subtitleEl = document.getElementById('viz-subtitle');

  // Prioridade: Turma > Professor > Sala
  if (classVal) {
    document.body.classList.add('single-view');
    const turmaName = data.classes.find(c => c.id === classVal)?.name || '';
    if (subtitleEl) subtitleEl.textContent = `Turma: ${turmaName}`;
    renderHeadersSingle(data.meta, `Turma: ${turmaName}`);
    renderGridSingleClass(data, classVal);
  } else if (teacherVal) {
    document.body.classList.add('single-view');
    const teacherName = data.teachers.find(t => t.id === teacherVal)?.name || '';
    if (subtitleEl) subtitleEl.textContent = `Professor: ${teacherName}`;
    renderHeadersSingle(data.meta, `Professor: ${teacherName}`);
    renderGridSingleTeacher(data, teacherVal);
  } else if (roomVal) {
    document.body.classList.add('single-view');
    const roomName = (data.rooms || []).find(r => r.id === roomVal)?.name || '';
    if (subtitleEl) subtitleEl.textContent = `Sala: ${roomName}`;
    renderHeadersSingle(data.meta, `Sala: ${roomName}`);
    renderGridSingleRoom(data, roomVal);
  } else {
    document.body.classList.remove('single-view');
    if (subtitleEl) subtitleEl.textContent = '';
    renderHeadersFull(data.meta);
    renderGridFull(data);
  }
}

function wireFilters(data) {
  const selC = document.getElementById('f-class');
  const selT = document.getElementById('f-teacher');
  const selR = document.getElementById('f-room');

  if (selC) selC.addEventListener('change', () => {
    if (selC.value) { if (selT) selT.value = ''; if (selR) selR.value = ''; }
    applyFilters(data);
  });

  if (selT) selT.addEventListener('change', () => {
    if (selT.value) { if (selC) selC.value = ''; if (selR) selR.value = ''; }
    applyFilters(data);
  });

  if (selR) selR.addEventListener('change', () => {
    if (selR.value) { if (selC) selC.value = ''; if (selT) selT.value = ''; }
    applyFilters(data);
  });

  applyFilters(data); // estado inicial
}

/* ---------- Boot ---------- */
async function initViz() {
  const data = await loadConsolidated();
  if (!data) return;
  populateFilters(data);
  wireFilters(data);
}
initViz();
