/* === Dados vindos do data.js / ou adaptados pelo AG_ADAPTER === */
let ED = window.EDITOR_DATA; // default (placeholders)
if (window.AG_PAYLOAD && window.AG_ADAPTER) {
  ED = window.AG_ADAPTER.adaptAGForEditor(window.EDITOR_DATA.meta, window.AG_PAYLOAD);
}

const normalizeName = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // remove acentos
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

let teacherKeyById = {}; // id -> chave normalizada (por nome)

// Função para atualizar as variáveis globais a partir de ED
function updateData() {
  ({
    meta,
    classes,
    teachers,
    subjects,
    rooms,
    initialAllocations,
    initialUnallocated,
    preAllocations =[]
  } = ED);

  P = meta.periods.length;

  teacherById = Object.fromEntries((teachers || []).map(t => [t.id, t]));
  subjectById = Object.fromEntries((subjects || []).map(s => [s.id, s]));
  classById = Object.fromEntries((classes || []).map(c => [c.id, c]));
  roomById = Object.fromEntries((rooms || []).map(r => [r.id, r]));

  // clone de não alocadas
  unallocatedLessons = JSON.parse(JSON.stringify(initialUnallocated || []));

  teacherKeyById = {};
  (teachers || []).forEach(t => {
    teacherKeyById[t.id] = normalizeName(t.name);
  });

  window.teacherById = teacherById;
  window.teacherKeyById = teacherKeyById;
}

// Inicializa as variáveis globais
let meta, classes, teachers, subjects, rooms, initialAllocations, initialUnallocated, preAllocations, P, teacherById, subjectById, classById, roomById;
updateData(); // Chama na inicialização para definir as variáveis

// --- Dirty tracking (uma única definição no arquivo) ---
if (typeof window.isDirty === 'undefined') window.isDirty = false;
function setDirty(v = true) {
  window.isDirty = !!v;
  // document.body.classList.toggle('dirty', window.isDirty);
}

function isReallyDirty() {
  try {
    const cur = JSON.stringify(buildConsolidated());
    return cur !== window.__lastSavedSnapshot;
  } catch {
    return !!window.isDirty;
  }
}
// === Snapshot do último estado salvo/carregado ===
window.__lastSavedSnapshot = null;

function markSavedSnapshot() {
  // guarda um snapshot do estado atual (o mesmo que iria para o arquivo)
  try {
    const snap = JSON.stringify(buildConsolidated());
    window.__lastSavedSnapshot = snap;
    // zera o flag auxiliar também, por via das dúvidas
    setDirty(false);
  } catch (_) {
    // se der erro no buildConsolidated, não quebra o fluxo
  }
}

function bandColor(b) {
  return b === 'M' ? 'bg-green-500' : (b === 'T' ? 'bg-yellow-500' : 'bg-purple-500');
}
function cellTitle(lesson) {
  const cls = classById[lesson.classId]?.name ?? lesson.classId;
  const subj = subjectById[lesson.subjectId]?.name ?? lesson.subjectId;
  const profs = (lesson.teacherIds || []).map(id => teacherById[id]?.name ?? id).join(', ');
  const room = lesson.roomId ? (roomById[lesson.roomId]?.name || lesson.roomId) : '—';
  return `${cls} • ${profs} • ${subj} • ${room} (dur: ${lesson.duration})`;
}
function lessonMarkup(lesson) {
  const subj = subjectById[lesson.subjectId];
  const abbr = subj?.abbr || (subj?.name?.slice(0, 3) ?? '---').toUpperCase();
  return `<div class="text-center leading-tight"><div class="font-bold text-sm">${abbr}</div></div>`;
}

/* === Estado === */
const mapCells = {};                 // mapCells[turmaId][day][period] = elemento
let selectedLessonId = null;         // seleção de card (não alocadas)
let pickedFromGrid = null;           // { turmaId, day, startPeriod, cells, lesson, group }
let gidCounter = 1;
const newGroupId = () => `g${gidCounter++}`;
// mapeia cabeças de grupos para acesso rápido nas marcações
window.groupHeads = window.groupHeads || new Map(); // garante no escopo global
const groupHeads = window.groupHeads;               // alias local para o código


/* ----------------- Cabeçalho de períodos ----------------- */
function renderPeriodsHeader() {
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

function updateEditButtonState() {
  const btn = document.getElementById('btn-editar');
  if (!btn) return;
  const canEdit = !!pickedFromGrid || !!selectedLessonId;
  btn.disabled = !canEdit;
}


function applyLessonUpdateOnGrid(info, newLesson) {
  const { turmaId, day, startPeriod, lesson: oldLesson, cells, group } = info;

  // Se duração não mudou -> só atualizar conteúdo/tooltip
  if (Number(newLesson.duration) === Number(oldLesson.duration)) {
    // atualiza dataset.lesson em todas as células do grupo
    for (const c of cells) c.dataset.lesson = JSON.stringify(newLesson);

    // refaz head (sigla + title)
    const head = cells.find(c => c.classList.contains('block-head')) || cells[0];
    if (head) {
      head.innerHTML = lessonMarkup(newLesson);
      head.title = cellTitle(newLesson);
    }
    recomputeTeacherConflicts();
    setDirty(true);
    return true;
  }

  // Duração mudou: precisa caber no mesmo local (ignorando o próprio grupo)
  const dur = Number(newLesson.duration) || 1;
  if (!canPlaceBlockOverwrite(turmaId, day, startPeriod, dur, group) || newLesson.classId !== turmaId) {
    alert('Não é possível ajustar a duração neste local (não cabe ou turma divergente).');
    return false;
  }

  // Remonta o bloco com a nova duração
  removeGroupCells(cells);
  placeBlock(turmaId, day, startPeriod, newLesson);
  recomputeTeacherConflicts();
  setDirty(true);
  return true;
}

function applyLessonUpdateOnCard(lessonId, newLesson) {
  const idx = unallocatedLessons.findIndex(l => l.id === lessonId);
  if (idx === -1) { alert('Card não encontrado.'); return false; }
  unallocatedLessons[idx] = newLesson;
  renderUnallocated();
  setDirty(true);
  return true;
}

function adjustUnallocSpacer() {
  const panel = document.getElementById('unalloc-panel');
  const scroller = document.querySelector('.grid-scroller');
  if (!panel || !scroller) return;

  // marca scroller para CSS e ajusta padding-bottom com a altura exata do painel
  scroller.classList.add('has-unalloc-sticky');
  const h = panel.offsetHeight || 0;
  scroller.style.paddingBottom = (h + 16) + 'px'; // 16px de folga
}

// ===== Modal Editar Aula (UI com nomes) =====
(function setupEditModal() {
  const $modal = document.getElementById('edit-modal');
  const $subj = document.getElementById('em-subject');
  const $teach = document.getElementById('em-teachers');
  const $room = document.getElementById('em-room');
  const $dur = document.getElementById('em-duration');
  const $cancel = document.getElementById('em-cancel');
  const $save = document.getElementById('em-save');
  const $addTeacher = document.getElementById('em-add-teacher');

  if (!$modal) return;

  // Estado da edição atual
  let contextInfo = null;    // se veio da grade: pickedFromGrid
  let editingCard = null;    // se veio de "não alocadas": { lessonId }
  let baseLesson = null;    // clone da aula original

  function show() { $modal.classList.remove('hidden'); $modal.classList.add('flex'); }
  function hide() { $modal.classList.add('hidden'); $modal.classList.remove('flex'); }

  function slugifyId(s) {
    return String(s || '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 24);
  }
  function ensureUniqueId(base, existsFn) {
    let id = base || 'id';
    let i = 1;
    while (existsFn(id)) id = `${base}-${++i}`;
    return id;
  }

  // Popular selects com NOMES
  function fillOptions() {
    // Matéria: option.value = subject.id, option.text = subject.name
    $subj.innerHTML = '';
    subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name || s.abbr || s.id; // mostra NOME; se não tiver, abbr como fallback.
      $subj.appendChild(opt);
    });

    // Professores (multi): value = teacher.id, text = teacher.name
    $teach.innerHTML = '';
    teachers.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name || t.id; // mostra NOME
      $teach.appendChild(opt);
    });

    // Sala: value = room.id, text = room.name — já tem (sem sala) no HTML
    // Primeiro preserva o "(sem sala)"
    const first = $room.querySelector('option[value=""]');
    $room.innerHTML = '';
    if (first) $room.appendChild(first);
    rooms.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name || r.id; // mostra NOME
      $room.appendChild(opt);
    });
  }

  // Preenche valores atuais
  function setValuesFromLesson(lesson) {
    // subject
    $subj.value = lesson.subjectId ?? '';
    // teachers
    Array.from($teach.options).forEach(o => {
      o.selected = (lesson.teacherIds || []).includes(o.value);
    });
    // room
    $room.value = lesson.roomId || '';
    // duration
    $dur.value = Number(lesson.duration || 1);
  }

  // Abre o modal a partir do contexto atual (grade ou card)
  window.openEditModal = function () {
    // Determina origem
    contextInfo = null;
    editingCard = null;
    baseLesson = null;

    if (pickedFromGrid) {
      contextInfo = pickedFromGrid; // { turmaId, day, startPeriod, cells, lesson, group }
      baseLesson = JSON.parse(JSON.stringify(contextInfo.lesson));
    } else if (selectedLessonId) {
      const l = unallocatedLessons.find(x => x.id === selectedLessonId);
      if (!l) return alert('Seleção inválida.');
      baseLesson = JSON.parse(JSON.stringify(l));
      editingCard = { lessonId: l.id };
    } else {
      return; // nada selecionado
    }

    fillOptions();
    setValuesFromLesson(baseLesson);
    show();
  };

  // Botões
  $cancel?.addEventListener('click', () => { hide(); });
  
  // + Novo professor (cria e já seleciona)
  $addTeacher?.addEventListener('click', () => {
    // Prompt simples: nome e (opcional) ID curto
    const name = (prompt('Nome do novo professor:') || '').trim();
    if (!name) return;

    let tid = (prompt('ID curto (opcional). Se vazio, geramos automaticamente:') || '').trim();
    if (!tid) tid = slugifyId(name);
    // garantir unicidade contra o mapa/array atual
    tid = ensureUniqueId(tid, (id) => !!(teacherById && teacherById[id]));

    // cria e registra
    const newTeacher = { id: tid, name };
    teachers.push(newTeacher);
    teacherById[tid] = newTeacher;
    // importante para detecção de conflitos (usa nome “normalizado” como chave canônica)
    teacherKeyById[tid] = normalizeName(name);

    // Atualiza selects de professores (em todos os modais que existirem)
    window.refreshTeacherOptions?.();

    // Seleciona automaticamente o recém criado no select do Editar
    if ($teach) {
      Array.from($teach.options).forEach(o => {
        o.selected = (o.value === tid) ? true : o.selected;
      });
    }

    showToast?.('✅ Professor criado e selecionado.', 'success');
  });


  $save?.addEventListener('click', () => {
    const next = JSON.parse(JSON.stringify(baseLesson));

    // Coleta dos selects (valores são IDs; a UI mostra NOME)
    next.subjectId = $subj.value || next.subjectId;
    next.teacherIds = Array.from($teach.selectedOptions).map(o => o.value);
    next.roomId = $room.value || null;
    const nv = Number($dur.value);
    if (Number.isInteger(nv) && nv >= 1) next.duration = nv;

    // Aplica na grade ou no card
    let ok = false;
    if (contextInfo) {
      ok = applyLessonUpdateOnGrid(contextInfo, next);
      if (ok) {
        // limpa pick para evitar “estado fantasma” após edição
        cancelPick();
      }
    } else if (editingCard) {
      ok = applyLessonUpdateOnCard(editingCard.lessonId, next);
    }

    if (ok) {
      hide();
      updateEditButtonState?.();
      showToast('✅ Aula atualizada com sucesso!');
    }
  });
})();


function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `
    px-4 py-2 rounded-lg shadow-md text-white text-sm font-medium
    transition-all duration-300 transform opacity-0 translate-y-2
    ${type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-700'}
  `;
  toast.textContent = message;
  container.appendChild(toast);

  // animação de entrada
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-y-2');
  });

  // desaparece depois de 3s
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function buildShareUrl(file) {
  // ajuste já feito por você:
  return `${location.origin}/FrontTCC/TCC-main/vizualizar.html?file=${encodeURIComponent(file)}`;
}



/* ----------------- Render cards (não alocadas) ----------------- */
function renderUnallocated() {
  const list = document.getElementById('unallocated-list');
  list.innerHTML = '';

  unallocatedLessons.forEach(lesson => {
    const cls = classById[lesson.classId]?.name ?? lesson.classId;
    const subj = subjectById[lesson.subjectId]?.name ?? lesson.subjectId;
    const profs = (lesson.teacherIds || []).map(id => teacherById[id]?.name ?? id).join(', ');
    const room = lesson.roomId ? (roomById[lesson.roomId]?.name || lesson.roomId) : '—';

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'text-left bg-white border border-gray-300 rounded-lg p-3 hover:shadow transition focus:outline-none focus:ring-2 focus:ring-blue-500';
    card.dataset.lessonId = lesson.id;
    card.innerHTML = `
      <div class="text-sm font-semibold">${cls} • ${subj}</div>
      <div class="text-xs text-gray-600">${profs}</div>
      <div class="text-xs text-gray-500">${room}</div>
      <div class="mt-1 inline-flex items-center gap-2">
        <span class="px-2 py-0.5 text-[10px] rounded bg-gray-200">dur: ${lesson.duration}</span>
        <span class="px-2 py-0.5 text-[10px] rounded bg-gray-200">id: ${lesson.id}</span>
      </div>`;

    if (selectedLessonId === lesson.id) card.classList.add('card-selected');

    // clicar em card: seleciona/deseleciona o card
    card.addEventListener('click', () => {
      // Se a aula clicada é exatamente a que está pickada na grade, devolve p/ "não alocadas"
      if (pickedFromGrid && pickedFromGrid.lesson?.id === lesson.id) {
        dropPickToUnallocated();
        return;
      }

      // comportamento normal de seleção/deseleção do card
      selectedLessonId = (selectedLessonId === lesson.id) ? null : lesson.id;
      renderUnallocated();
    });

    list.appendChild(card);
  });

  document.getElementById('unalloc-count').textContent = `${unallocatedLessons.length} pendente(s)`;
  adjustUnallocSpacer();
  updateEditButtonState();
}
window.addEventListener('resize', adjustUnallocSpacer);

/* ----------------- Helpers de bloco ----------------- */
function canPlaceBlock(turmaId, day, startPeriod, duration) {
  if (startPeriod + duration > P) return false;
  for (let k = 0; k < duration; k++) {
    const cell = mapCells[turmaId][day][startPeriod + k];
    if (!cell || cell.classList.contains('occupied')) return false;
  }
  return true;
}
function canPlaceBlockOverwrite(turmaId, day, startPeriod, duration, groupToIgnore) {
  if (startPeriod + duration > P) return false;
  for (let k = 0; k < duration; k++) {
    const cell = mapCells[turmaId][day][startPeriod + k];
    if (!cell) return false;
    const occupied = cell.classList.contains('occupied');
    const sameGroup = occupied && cell.dataset.group === groupToIgnore;
    if (occupied && !sameGroup) return false;
  }
  return true;
}

/* === placeBlock com “mescla visual” (block-head + block-tail) === */
function placeBlock(turmaId, day, startPeriod, lesson) {
  const group = newGroupId();

  for (let k = 0; k < lesson.duration; k++) {
    const cell = mapCells[turmaId][day][startPeriod + k];
    cell.classList.add('occupied');
    cell.dataset.group = group;
    cell.dataset.lesson = JSON.stringify(lesson);

    if (k === 0) {
      cell.classList.add('block-head');
      cell.style.gridColumnStart = String(startPeriod + 1); // ancora na coluna certa
      cell.style.gridColumnEnd = `span ${lesson.duration}`;
      cell.innerHTML = lessonMarkup(lesson);
      cell.title = cellTitle(lesson);
      cell.style.display = '';
      groupHeads.set(group, cell); // <=== registra o head do grupo
    } else {
      cell.classList.add('block-tail');
      cell.innerHTML = '';
      cell.title = '';
      cell.style.display = 'none';
      cell.style.gridColumnEnd = 'span 1';
    }
  }
  setDirty(true);
  return group;
}

function getGroupCells(cell) {
  const turmaId = cell.dataset.turmaId;
  const day = Number(cell.dataset.dia);
  const group = cell.dataset.group;
  const cells = [];
  for (let p = 0; p < P; p++) {
    const c = mapCells[turmaId][day][p];
    if (c && c.dataset.group === group) cells.push(c);
  }
  const startPeriod = Math.min(...cells.map(c => Number(c.dataset.periodo)));
  const lesson = JSON.parse(cells[0].dataset.lesson);
  return { turmaId, day, startPeriod, cells, lesson, group };
}

function removeGroupCells(cells) {
  // se a remoção contém a head: remove do índice
  const head = cells.find(c => c.classList.contains('block-head'));
  if (head && head.dataset.group) {
    groupHeads.delete(head.dataset.group);
  }

  cells.forEach(c => {
    // remove classes de ocupação e de conflito (prof e sala)
    c.classList.remove(
      'occupied', 'block-head', 'block-tail',
      'ring-2', 'ring-amber-400',
      'conflict-teacher', 'conflict-room'
    );

    // remove todos os badges de conflito que possam ter sobrado
    c.querySelectorAll('.conflict-badge, .conflict-badge-teacher, .conflict-badge-room')
      .forEach(el => el.remove());

    // reset de estilos inline que podem ter sido setados no head
    c.style.gridColumnEnd = 'span 1';
    c.style.display = '';
    c.style.position = '';   // ← importante p/ não ficar “preso” como relativo
    c.innerHTML = '';

    // title default
    c.title = `${classById[c.dataset.turmaId]?.name ?? c.dataset.turmaId} - Clique para alocar`;

    // limpa datasets
    delete c.dataset.group;
    delete c.dataset.lesson;
  });

  setDirty(true);
}


function recomputeConflicts() {
  // 1) limpar marcas/badges e restaurar title
  for (const [, head] of groupHeads) {
    head.classList.remove('conflict-teacher', 'conflict-room');
    head.querySelectorAll('.conflict-badge-teacher, .conflict-badge-room').forEach(n => n.remove());
    if (head.dataset.lesson) {
      const l = JSON.parse(head.dataset.lesson);
      head.title = cellTitle(l);
    }
  }

  // 2) indexações de ocupação
  const busyTeacher = {}; // busyTeacher[key][day][period] = Set(groups)
  const busyRoom    = {}; // busyRoom[roomId][day][period] = Set(groups)
  const teacherKeyToLabel = {}; // key -> label legível (nome)

  for (const [group, head] of groupHeads) {
    if (!head.dataset.lesson) continue;

    const lesson = JSON.parse(head.dataset.lesson);
    const day   = Number(head.dataset.dia);
    const start = Number(head.dataset.periodo);
    const dur   = Number(lesson.duration || 1);

    // --- professores
    const tIds = Array.isArray(lesson.teacherIds) ? lesson.teacherIds : [];
    for (const tid of tIds) {
      const key =
        teacherKeyById?.[tid] ??
        normalizeName(teacherById?.[tid]?.name ?? String(tid));
      const label = teacherById?.[tid]?.name ?? String(tid);
      teacherKeyToLabel[key] = teacherKeyToLabel[key] || label;

      if (!busyTeacher[key]) busyTeacher[key] = {};
      if (!busyTeacher[key][day]) {
        busyTeacher[key][day] = Array.from({ length: P }, () => new Set());
      }
      for (let k = 0; k < dur; k++) busyTeacher[key][day][start + k].add(group);
    }

    // --- salas
    const roomId = lesson.roomId || null;
    if (roomId) {
      if (!busyRoom[roomId]) busyRoom[roomId] = {};
      if (!busyRoom[roomId][day]) {
        busyRoom[roomId][day] = Array.from({ length: P }, () => new Set());
      }
      for (let k = 0; k < dur; k++) busyRoom[roomId][day][start + k].add(group);
    }
  }

  // 3) detectar conflitos e coletar "quem" conflitou
  const conflictTeacherGroups = new Set();
  const conflictRoomGroups    = new Set();

  const teacherConfLabelsByGroup = {}; // group -> Set(nomes)
  const roomConfLabelsByGroup    = {}; // group -> Set(nomes)

  const addT = (g, label) => {
    if (!teacherConfLabelsByGroup[g]) teacherConfLabelsByGroup[g] = new Set();
    teacherConfLabelsByGroup[g].add(label);
  };
  const addR = (g, label) => {
    if (!roomConfLabelsByGroup[g]) roomConfLabelsByGroup[g] = new Set();
    roomConfLabelsByGroup[g].add(label);
  };

  // professores
  for (const key in busyTeacher) {
    const days = busyTeacher[key];
    for (const d in days) {
      days[d].forEach(set => {
        if (set.size > 1) {
          const label = teacherKeyToLabel[key] || key;
          set.forEach(g => { conflictTeacherGroups.add(g); addT(g, label); });
        }
      });
    }
  }

  // salas
  for (const roomId in busyRoom) {
    const days = busyRoom[roomId];
    const roomLabel = (roomById?.[roomId]?.name ?? roomId);
    for (const d in days) {
      days[d].forEach(set => {
        if (set.size > 1) {
          set.forEach(g => { conflictRoomGroups.add(g); addR(g, roomLabel); });
        }
      });
    }
  }

  // 4) aplicar classes + badges e montar title com nomes
  const ensureBadge = (head, badgeCls) => {
    head.style.position = 'relative';
    if (!head.querySelector(`.${badgeCls}`)) {
      const b = document.createElement('span');
      b.className = `conflict-badge ${badgeCls}`;
      b.textContent = '⚠';
      head.appendChild(b);
    }
  };

  const touched = new Set();

  for (const g of conflictTeacherGroups) {
    const head = groupHeads.get(g);
    if (!head) continue;
    head.classList.add('conflict-teacher');
    ensureBadge(head, 'conflict-badge-teacher');
    touched.add(g);
  }

  for (const g of conflictRoomGroups) {
    const head = groupHeads.get(g);
    if (!head) continue;
    head.classList.add('conflict-room');
    ensureBadge(head, 'conflict-badge-room');
    touched.add(g);
  }

  // atualizar tooltip com os nomes específicos
  for (const g of touched) {
    const head = groupHeads.get(g);
    if (!head || !head.dataset.lesson) continue;
    const l = JSON.parse(head.dataset.lesson);

    const parts = [];
    if (teacherConfLabelsByGroup[g]?.size) {
      parts.push(`⚠ CONFLITO DE PROFESSOR: ${[...teacherConfLabelsByGroup[g]].join(', ')}`);
    }
    if (roomConfLabelsByGroup[g]?.size) {
      parts.push(`⚠ CONFLITO DE SALA: ${[...roomConfLabelsByGroup[g]].join(', ')}`);
    }
    parts.push(cellTitle(l));
    head.title = parts.join('\n');
  }

  console.debug('[conflicts] heads:', groupHeads.size,
    'prof-conf:', conflictTeacherGroups.size,
    'room-conf:', conflictRoomGroups.size);
}



// manter compat com chamadas antigas
function recomputeTeacherConflicts() { return recomputeConflicts(); }
window.recomputeTeacherConflicts = recomputeTeacherConflicts;
window.recomputeConflicts = recomputeConflicts;



/* ----------------- Pick da grade (pegar/mover/soltar) ----------------- */
function highlightPicked(cells) {
  const head = cells.find(c => c.classList.contains('block-head')) || cells[0];
  head.classList.add('ring-2', 'ring-amber-400');
}
function clearPickedHighlight() {
  if (!pickedFromGrid) return;
  pickedFromGrid.cells.forEach(c => c.classList.remove('ring-2', 'ring-amber-400'));
}
function pickFromGrid(cell) {
  const info = getGroupCells(cell);
  pickedFromGrid = info;
  highlightPicked(info.cells);
  updateEditButtonState();
}
function cancelPick() {
  clearPickedHighlight();
  pickedFromGrid = null;
  updateEditButtonState();
}

document.addEventListener('pointerdown', (e) => {
  const t = e.target;

  // onde NÃO cancelamos seleção
  const inside =
    t.closest?.('#schedule-grid') ||
    t.closest?.('#unallocated-list') ||
    t.closest?.('#edit-modal') ||
    t.closest?.('#top-toolbar') ||
    t.closest?.('#toast-container') ||
    t.closest?.('#edit-fab');  

  if (inside) return;

  let changed = false;

  if (pickedFromGrid) {
    cancelPick();
    changed = true;
  }

  if (selectedLessonId) {
    selectedLessonId = null;
    renderUnallocated();
    changed = true;
  }

  if (changed) {
    updateEditButtonState?.();
    showToast?.('Seleção cancelada.', 'info');
  }
}, { capture: true });


// === Tecla ESC para “despickar” ===
window.addEventListener('keyup', (e) => {
  if (e.key !== 'Escape') return;

  // Evita conflito se o modal estiver aberto ou foco em inputs/selects
  const modalOpen = document.getElementById('edit-modal')?.classList.contains('flex');
  const tag = (document.activeElement?.tagName || '').toLowerCase();
  if (modalOpen || tag === 'input' || tag === 'textarea' || tag === 'select') return;

  let changed = false;

  if (pickedFromGrid) {
    cancelPick();
    changed = true;
  }

  if (selectedLessonId) {
    selectedLessonId = null;
    renderUnallocated();
    changed = true;
  }

  if (changed) {
    updateEditButtonState?.();
  }
});




function dropPickToUnallocated() {
  if (!pickedFromGrid) return;
  const { lesson, cells } = pickedFromGrid;

  clearPickedHighlight();       // tira o contorno
  removeGroupCells(cells);      // remove da grade (head + tails + groupHeads)

  // evita duplicar no array de não alocadas
  if (!unallocatedLessons.some(l => l.id === lesson.id)) {
    unallocatedLessons.push(lesson);
  }

  pickedFromGrid = null;
  renderUnallocated();
  recomputeTeacherConflicts();
  updateEditButtonState();
}


function movePickedToCell(targetCell) {
  if (!pickedFromGrid) return;

  const { cells: oldCells, lesson, group } = pickedFromGrid;
  if (targetCell.dataset.group === group) {
    clearPickedHighlight();
    removeGroupCells(oldCells);
    unallocatedLessons.push(lesson);
    pickedFromGrid = null;
    renderUnallocated();
    recomputeTeacherConflicts();
    return; // <-- evita recolocar o bloco
  }

  const turmaId = targetCell.dataset.turmaId;
  const day = Number(targetCell.dataset.dia);
  const startP = Number(targetCell.dataset.periodo);

  // permitir overwrite ignorando o próprio grupo
  if (!canPlaceBlockOverwrite(turmaId, day, startP, lesson.duration, group) || lesson.classId !== turmaId) {
    targetCell.classList.add('ring-2', 'ring-red-400');
    setTimeout(() => targetCell.classList.remove('ring-2', 'ring-red-400'), 350);
    return;
  }

  // se havia bloco no destino, remove-o e manda pro cards
  if (targetCell.classList.contains('occupied') && targetCell.dataset.group) {
    const { cells: victimCells, lesson: victimLesson } = getGroupCells(targetCell);
    removeGroupCells(victimCells);
    unallocatedLessons.push(victimLesson);
  }

  // aplica o move
  clearPickedHighlight();
  removeGroupCells(oldCells);
  placeBlock(turmaId, day, startP, lesson);
  pickedFromGrid = null;
  renderUnallocated();
  recomputeTeacherConflicts();
  setDirty(true);
  updateEditButtonState();
}

/* ----------------- Grade ----------------- */
function criarGrade() {
  const grid = document.getElementById('schedule-grid');
  grid.innerHTML = '';

  // ⬇️ LIMPA REGISTROS DE HEADS ANTIGOS
  groupHeads.clear();

  // prepara matriz de células
  classes.forEach(t => {
    mapCells[t.id] = Array.from({ length: meta.days.length }, () => Array(P).fill(null));
  });

  // constrói linhas e células (SEM pré-alocar aqui)
  classes.forEach((turma) => {
    const turmaRow = document.createElement('div');
    turmaRow.className = 'turma-row';

    const turmaCell = document.createElement('div');
    turmaCell.className = 'bg-gray-100 p-3 font-medium text-sm border-2 border-gray-300 flex items-center rounded-lg';
    turmaCell.textContent = turma.name;
    turmaRow.appendChild(turmaCell);

    for (let dia = 0; dia < meta.days.length; dia++) {
      const dayColumn = document.createElement('div');
      dayColumn.className = 'day-column';

      for (let periodo = 0; periodo < P; periodo++) {
        const cell = document.createElement('div');
        cell.className = 'time-slot flex items-center justify-center text-xs';
        cell.dataset.turmaId = turma.id;
        cell.dataset.dia = String(dia);
        cell.dataset.periodo = String(periodo);

        // ancora a célula na coluna correspondente (necessário para o grid span do head)
        cell.style.gridColumnStart = String(periodo + 1);
        cell.style.gridColumnEnd = 'span 1';

        mapCells[turma.id][dia][periodo] = cell;

        // título padrão
        cell.title = `${turma.name} - Clique para alocar`;

        // Clique em slot
        cell.addEventListener('click', () => {
          console.debug('[click grade]', {
            picked: !!pickedFromGrid,
            groupClicked: cell.dataset.group,
            same: pickedFromGrid?.group === cell.dataset.group
          });
          const turmaId = cell.dataset.turmaId;
          const day = Number(cell.dataset.dia);
          const startP = Number(cell.dataset.periodo);

          // 1) Se estou com bloco pickado da grade => tenta mover
          if (pickedFromGrid) {
            movePickedToCell(cell);
            // após um move, revalida conflitos
            return;
          }

          // 2) Se tenho um card selecionado => tentar alocar / overwrite
          if (selectedLessonId) {
            const lesson = unallocatedLessons.find(l => l.id === selectedLessonId);
            if (!lesson) return;

            // overwrite
            if (cell.classList.contains('occupied')) {
              const { group } = getGroupCells(cell);
              if (!canPlaceBlockOverwrite(turmaId, day, startP, lesson.duration, group) || lesson.classId !== turmaId) {
                cell.classList.add('ring-2', 'ring-red-400');
                setTimeout(() => cell.classList.remove('ring-2', 'ring-red-400'), 350);
                return;
              }
              const { cells: oldCells, lesson: oldLesson } = getGroupCells(cell);
              removeGroupCells(oldCells);
              placeBlock(turmaId, day, startP, lesson);
              // remove card e devolve o antigo pra pilha
              const idx = unallocatedLessons.findIndex(l => l.id === lesson.id);
              if (idx !== -1) unallocatedLessons.splice(idx, 1);
              unallocatedLessons.push(oldLesson);
              selectedLessonId = null;
              renderUnallocated();

              // NOVO: revalida conflitos após overwrite
              recomputeTeacherConflicts();
              return;
            }

            // slot vazio
            if (lesson.classId !== turmaId || !canPlaceBlock(turmaId, day, startP, lesson.duration)) {
              cell.classList.add('ring-2', 'ring-red-400');
              setTimeout(() => cell.classList.remove('ring-2', 'ring-red-400'), 350);
              return;
            }
            placeBlock(turmaId, day, startP, lesson);
            const idx = unallocatedLessons.findIndex(l => l.id === selectedLessonId);
            if (idx !== -1) unallocatedLessons.splice(idx, 1);
            selectedLessonId = null;
            renderUnallocated();

            // NOVO: revalida conflitos após alocar em slot vazio
            recomputeTeacherConflicts();
            return;
          }

          // 3) Sem card selecionado e clicou em bloco ocupado => “pegar da grade” OU remover se for o mesmo
          if (cell.classList.contains('occupied') && cell.dataset.group) {
            const info = getGroupCells(cell);

            if (pickedFromGrid && pickedFromGrid.group === info.group) {
              // 🔁 clicou de novo no MESMO bloco que estava pickado:
              // -> remove da grade e envia para "não alocadas"
              clearPickedHighlight();              // tira o contorno
              removeGroupCells(info.cells);        // limpa todas as células do grupo
              unallocatedLessons.push(info.lesson);// volta o card
              pickedFromGrid = null;
              renderUnallocated();
              recomputeTeacherConflicts();
              return;
            }

            // caso contrário: inicia/alternar pick normalmente
            cancelPick();          // limpa pick anterior (se houver)
            pickFromGrid(cell);    // destaca este bloco
            return;
          }
          // 4) Slot vazio e nada selecionado => feedback sutil
          cell.classList.add('ring-2', 'ring-blue-400');
          setTimeout(() => cell.classList.remove('ring-2', 'ring-blue-400'), 250);
        });

        dayColumn.appendChild(cell);
      } // períodos
      turmaRow.appendChild(dayColumn);
    } // dias
    grid.appendChild(turmaRow);
  }); // classes

  // === AQUI aplicamos as pré-alocações reais, se houver ===
  if (Array.isArray(preAllocations) && preAllocations.length) {
    preAllocations.forEach(a => {
      const lesson = {
        id: `pre-${a.classId}-${a.day}-${a.start}`,
        classId: a.classId,
        subjectId: a.subjectId,
        teacherIds: Array.isArray(a.teacherIds) ? a.teacherIds : (a.teacherIds ? [a.teacherIds] : []),
        roomId: a.roomId || null,
        duration: Number(a.duration || a.duration_periods || 1)
      };
      // segurança: só coloca se couber
      if (canPlaceBlock(a.classId, a.day, a.start, lesson.duration)) {
        placeBlock(a.classId, a.day, a.start, lesson);
      }
    });
  } else {
    // Fallback antigo: usar initialAllocations (placeholders dur=1)
    classes.forEach((turma, turmaIndex) => {
      const indices = (initialAllocations && initialAllocations[turmaIndex]) || [];
      indices.forEach(linear => {
        const dia = Math.floor(linear / P);
        const periodo = linear % P;
        const roomIds = (rooms || []).map(r => r.id);
        const roomId = roomIds.length ? roomIds[(turmaIndex + dia + periodo) % roomIds.length] : null;
        const lesson = {
          id: `init-${turma.id}-${dia}-${periodo}`,
          classId: turma.id,
          subjectId: subjects[(turmaIndex + periodo) % subjects.length].id,
          teacherIds: [teachers[(dia + periodo) % teachers.length].id],
          roomId,
          duration: 1
        };
        if (canPlaceBlock(turma.id, dia, periodo, 1)) {
          placeBlock(turma.id, dia, periodo, lesson);
        }
      });
    });
  }

  // Clique no FUNDO da área de “Aulas não alocadas” => descarta o bloco pickado para os cards
  const unallocArea = document.getElementById('unallocated-list');
  if (unallocArea) {
    unallocArea.addEventListener('click', (e) => {
      if (e.target !== unallocArea) return; // ignora cliques nos cards
      if (!pickedFromGrid) return;
      dropPickToUnallocated();
    });
  }

  // NOVO: marca conflitos após construir/pré-alocar toda a grade
  recomputeTeacherConflicts();
}


/* ----------------- Boot ----------------- */
function init() {
  renderPeriodsHeader();
  criarGrade();
  renderUnallocated();
  adjustUnallocSpacer();
  reloadTimetable();
}
init();


// Atualiza os <select> de professores em modais, se existirem
window.refreshTeacherOptions = function refreshTeacherOptions() {
  try {
    // Editar aula
    const emSel = document.getElementById('em-teachers');
    if (emSel) {
      const prev = new Set(Array.from(emSel.selectedOptions).map(o => o.value));
      emSel.innerHTML = '';
      (teachers || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name || t.id;
        if (prev.has(t.id)) opt.selected = true;
        emSel.appendChild(opt);
      });
    }

    // Adicionar aulas (se o modal existir)
    const alSel = document.getElementById('al-teachers-select');
    if (alSel) {
      const prev = new Set(Array.from(alSel.selectedOptions).map(o => o.value));
      alSel.innerHTML = '';
      (teachers || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name || t.id;
        if (prev.has(t.id)) opt.selected = true;
        alSel.appendChild(opt);
      });
    }
  } catch { }
};


const ROOT = `${location.origin}/FrontTCC`; // ajuste se sua raiz mudar

/* ===== Helpers p/ IDs legíveis e únicos ===== */
function slugifyId(s) {
  return String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 24);
}
function ensureUniqueId(base, existsFn) {
  let id = base || 'id';
  let i = 1;
  while (existsFn(id)) {
    id = `${base}-${++i}`;
  }
  return id;
}

/* ===== Modal ADICIONAR AULAS ===== */
(function setupAddLessonsModal() {
  const $modal = document.getElementById('add-lessons-modal');
  if (!$modal) return;

  const $btnOpen = document.getElementById('btn-add-lessons');
  const $btnSave = document.getElementById('al-save');
  const $btnCancel = document.getElementById('al-cancel');

  const $classSel = document.getElementById('al-class');

  // Matéria
  const $subjModeRadios = Array.from(document.querySelectorAll('input[name="al-subj-mode"]'));
  const $subjExistingBox = document.getElementById('al-subj-existing');
  const $subjNewBox = document.getElementById('al-subj-new');
  const $subjSel = document.getElementById('al-subject-select');
  const $subjName = document.getElementById('al-subject-name');
  const $subjAbbr = document.getElementById('al-subject-abbr');

  // Professores
  const $teachModeRadios = Array.from(document.querySelectorAll('input[name="al-teach-mode"]'));
  const $teachExistingBox = document.getElementById('al-teach-existing');
  const $teachNewBox = document.getElementById('al-teach-new');
  const $teachSel = document.getElementById('al-teachers-select');
  const $tNewName = document.getElementById('al-teacher-name');
  const $tNewId = document.getElementById('al-teacher-id');

  // Sala / Duração / Qtde
  const $roomSel = document.getElementById('al-room');
  const $durInput = document.getElementById('al-duration');
  const $qtyInput = document.getElementById('al-qty');

  function show() { $modal.classList.remove('hidden'); $modal.classList.add('flex'); }
  function hide() { $modal.classList.add('hidden'); $modal.classList.remove('flex'); }

  function toggleSubjUI() {
    const mode = $subjModeRadios.find(r => r.checked)?.value || 'existing';
    $subjExistingBox.classList.toggle('hidden', mode !== 'existing');
    $subjNewBox.classList.toggle('hidden', mode !== 'new');
  }
  function toggleTeachUI() {
    const mode = $teachModeRadios.find(r => r.checked)?.value || 'existing';
    $teachExistingBox.classList.toggle('hidden', mode !== 'existing');
    $teachNewBox.classList.toggle('hidden', mode !== 'new');
  }

  $subjModeRadios.forEach(r => r.addEventListener('change', toggleSubjUI));
  $teachModeRadios.forEach(r => r.addEventListener('change', toggleTeachUI));

  // Preenche selects (turma/matérias/profs/salas) SEM chamar updateData()
  function fillOptions() {
    // turmas
    $classSel.innerHTML = '';
    (classes || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name || c.id;
      $classSel.appendChild(opt);
    });

    // matérias existentes
    $subjSel.innerHTML = '';
    (subjects || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name || s.abbr || s.id;
      $subjSel.appendChild(opt);
    });

    // professores existentes (multi)
    $teachSel.innerHTML = '';
    (teachers || []).forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name || t.id;
      $teachSel.appendChild(opt);
    });

    // salas
    const first = $roomSel.querySelector('option[value=""]');
    $roomSel.innerHTML = '';
    if (first) $roomSel.appendChild(first);
    (rooms || []).forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name || r.id;
      $roomSel.appendChild(opt);
    });

    // defaults
    $durInput.value = 1;
    $qtyInput.value = 1;
    $subjName.value = '';
    $subjAbbr.value = '';
    $tNewName.value = '';
    $tNewId.value = '';
  }

  function openModal() {
    fillOptions();
    toggleSubjUI();
    toggleTeachUI();
    show();
  }

  $btnOpen?.addEventListener('click', openModal);
  $btnCancel?.addEventListener('click', hide);

  function createSubjectIfNeeded() {
    const mode = $subjModeRadios.find(r => r.checked)?.value || 'existing';
    if (mode === 'existing') {
      const sid = $subjSel.value;
      if (!sid) { alert('Selecione uma matéria.'); return { ok: false }; }
      return { ok: true, subjectId: sid };
    }

    // criar nova
    const name = ($subjName.value || '').trim();
    const abbr = ($subjAbbr.value || '').trim();
    if (!name) { alert('Informe o nome da nova matéria.'); return { ok: false }; }

    // gera id legível e único
    const base = slugifyId(abbr || name);
    const sid = ensureUniqueId(base, (id) => !!subjectById[id]);

    const newSubj = { id: sid, name, abbr: abbr || undefined };
    subjects.push(newSubj);
    subjectById[sid] = newSubj;
    return { ok: true, subjectId: sid };
  }

  function createTeacherIfNeeded() {
    const mode = $teachModeRadios.find(r => r.checked)?.value || 'existing';
    if (mode === 'existing') {
      const tids = Array.from($teachSel.selectedOptions).map(o => o.value);
      // Permite zero professores se desejar. Se quiser forçar ≥1: if(!tids.length) alert...
      return { ok: true, teacherIds: tids };
    }

    // criar novo
    const name = ($tNewName.value || '').trim();
    let tid = ($tNewId.value || '').trim();
    if (!name) { alert('Informe o nome do novo professor.'); return { ok: false }; }

    if (!tid) {
      tid = slugifyId(name);
    }
    tid = ensureUniqueId(tid, (id) => !!teacherById[id]);

    const newTeacher = { id: tid, name };
    teachers.push(newTeacher);
    teacherById[tid] = newTeacher;
    teacherKeyById[tid] = normalizeName(name); // importante p/ detecção de conflitos
    return { ok: true, teacherIds: [tid] };
  }

  $btnSave?.addEventListener('click', () => {
    const classId = $classSel.value;
    if (!classId) return alert('Escolha a turma.');

    // matéria
    const subjRes = createSubjectIfNeeded();
    if (!subjRes.ok) return;

    // professor(es)
    const teachRes = createTeacherIfNeeded();
    if (!teachRes.ok) return;

    // sala / duração / quantidade
    const roomId = $roomSel.value || null;
    const duration = Math.max(1, Number($durInput.value || 1));
    let qty = Math.max(1, Number($qtyInput.value || 1));
    qty = Math.min(50, qty);

    // cria N cards não alocados
    const created = [];
    for (let i = 0; i < qty; i++) {
      const id = `new-${classId}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const lesson = {
        id,
        classId,
        subjectId: subjRes.subjectId,
        teacherIds: teachRes.teacherIds || [],
        roomId,
        duration
      };
      unallocatedLessons.push(lesson);
      created.push(lesson);
    }

    renderUnallocated();
    setDirty(true);
    showToast(`✅ ${created.length} aula(s) adicionada(s) às não alocadas.`, 'success');
    hide();
  });
})();


async function refreshSavedSelect(preselectFile = '') {
  const sel = document.getElementById('ed-saved-select');
  if (!sel) return;

  // usa bust de cache + no-store
  const list = await listSavedEditor();
  sel.innerHTML = '';

  if (!list.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— nenhum arquivo salvo —';
    sel.appendChild(opt);
    return;
  }

  list.slice().reverse().forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.file;
    opt.textContent = `${item.name} — ${new Date(item.savedAt).toLocaleString()}`;
    sel.appendChild(opt);
  });

  if (preselectFile) sel.value = preselectFile;
}


async function deleteSavedEditor(file) {
  const r = await fetch(`${ROOT}/api/delete_schedule.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file }),
    cache: 'no-store',
    credentials: 'omit'
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`HTTP ${r.status} ${txt || ''}`);
  }
  const out = await r.json();
  if (!out.ok) throw new Error(out.error || 'delete failed');
  return out;
}


async function listSavedEditor() {
  try {
    const r = await fetch(`${ROOT}/api/list_schedules.php?v=${Date.now()}`, {
      cache: 'no-store'
    });
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}


async function getSavedEditor(file) {
  const url = `${ROOT}/api/get_schedule.php?file=${encodeURIComponent(file)}`;
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Falha ao carregar');
  return await r.json();
}

/* ===== aplicar consolidado salvo no editor ===== */
function applyConsolidatedToEditor(consolidated) {
  ED = {
    meta: consolidated.meta,
    classes: consolidated.classes,
    teachers: consolidated.teachers,
    subjects: consolidated.subjects,
    rooms: consolidated.rooms,
    preAllocations: Array.isArray(consolidated.allocations) ? consolidated.allocations : [],
    initialUnallocated: Array.isArray(consolidated.unallocated) ? consolidated.unallocated : []
  };
  updateData();
  renderPeriodsHeader();
  criarGrade();
  renderUnallocated();
  recomputeTeacherConflicts?.();
  markSavedSnapshot(); // <-- mantenha esta
}


async function populateEditorSavedList(preselectFile = '') {
  const sel = document.getElementById('ed-saved-select');
  if (!sel) return;

  const list = await listSavedEditor();
  sel.innerHTML = '';

  if (!list.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— nenhum arquivo salvo —';
    sel.appendChild(opt);
  } else {
    // mais recentes primeiro
    list.slice().reverse().forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.file;
      opt.textContent = `${item.name} — ${new Date(item.savedAt).toLocaleString()}`;
      sel.appendChild(opt);
    });

    // se pediram para pré-selecionar um arquivo recém-salvo
    if (preselectFile) sel.value = preselectFile;
  }
}

// chamada inicial na abertura da tela
populateEditorSavedList();


/* ===== sair com aviso se houver alterações ===== */
window.addEventListener('beforeunload', (e) => {
  if (!isReallyDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});

/* ===== botão "Carregar" na edição ===== */
const $btnLoadEd = document.getElementById('ed-load-saved');
if ($btnLoadEd) {
  $btnLoadEd.addEventListener('click', async () => {
    const sel = document.getElementById('ed-saved-select');
    const file = sel?.value || '';
    if (!file) return alert('Selecione um arquivo salvo.');

    if (isReallyDirty()) {
      const ok = confirm('Você tem alterações não salvas. Carregar outro horário vai descartá-las.\n\nDeseja continuar?');
      if (!ok) return;
    }

    try {
      const consolidated = await getSavedEditor(file);
      applyConsolidatedToEditor(consolidated);
      try { localStorage.setItem('consolidatedSchedule', JSON.stringify(consolidated)); } catch { }
    } catch (e) {
      console.error(e);
      alert('Não foi possível carregar o horário selecionado.');
    }
  });
}



function buildConsolidated() {
  // Se estiver com uma aula pickada, solta visualmente (mantém onde está)
  cancelPick?.();

  const allocations = [];
  classes.forEach(t => {
    for (let d = 0; d < meta.days.length; d++) {
      for (let p = 0; p < P; p++) {
        const cell = mapCells[t.id][d][p];
        if (!cell || !cell.classList.contains('occupied') || !cell.dataset.lesson) continue;

        const lesson = JSON.parse(cell.dataset.lesson);
        if (!cell.classList.contains('block-head')) continue;

        allocations.push({
          classId: t.id,
          day: d,
          start: p,
          duration: lesson.duration,
          subjectId: lesson.subjectId,
          teacherIds: lesson.teacherIds || [],
          roomId: lesson.roomId || null
        });
      }
    }
  });

  // 🔹 Inclui as não alocadas junto no consolidado
  const unallocated = Array.isArray(unallocatedLessons)
    ? JSON.parse(JSON.stringify(unallocatedLessons))
    : [];

  return {
    meta,
    classes,
    teachers,
    subjects,
    rooms,
    allocations,
    unallocated
  };
}



/* ----------------- Consolidação ----------------- */
function consolidar() {
  cancelPick(); // só para limpar destaque

  const consolidated = buildConsolidated();
  localStorage.setItem('consolidatedSchedule', JSON.stringify(consolidated));
  window.location.href = 'vizualizar.html'; // sem confirm
}


/* ----------------- Recarregar Horário ----------------- */
async function reloadTimetable() {
  const loader = document.getElementById('loader');
  if (loader) loader.classList.remove('hidden');

  try {
    // Busca os dados mais recentes do AG server
    const response = await fetch('http://localhost:9001/api/latest', {
      method: 'GET',
      credentials: 'omit'
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const payload = await response.json();
    window.AG_PAYLOAD = payload; // Atualiza o payload global
    window.EDITOR_DATA = window.AG_ADAPTER.adaptAGForEditor(window.EDITOR_DATA.meta, payload); // Adapta os dados

    ED = window.EDITOR_DATA; // Atualiza ED
    updateData(); // Re-desestrutura e atualiza as variáveis globais

    // Re-renderiza a interface
    renderPeriodsHeader();
    criarGrade();
    renderUnallocated();
    console.log('Dados recarregados com sucesso:', window.EDITOR_DATA);
    markSavedSnapshot();
  } catch (error) {
    console.error('Erro ao recarregar horário:', error);
    alert(`Falha ao recarregar horário: ${error.message}`);
  } finally {
    if (loader) loader.classList.add('hidden');
  }
}

async function salvarHorario() {
  try {
    cancelPick();

    const consolidated = buildConsolidated(); // já inclui .unallocated

    const defaultName = `horario_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
    const name = window.prompt('Nome do horário (arquivo):', defaultName);
    if (!name) return;

    // opcional: manter o último consolidado no LS
    try { localStorage.setItem('consolidatedSchedule', JSON.stringify(consolidated)); } catch { }

    const resp = await fetch(`${location.origin}/FrontTCC/api/save_schedule.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data: consolidated }),
      cache: 'no-store',
      credentials: 'omit'
    });

    const out = await resp.json();
    if (!resp.ok || !out?.ok) throw new Error(out?.error || `Falha HTTP ${resp.status}`);

    alert(`Horário salvo com sucesso!\nArquivo: ${out.file}`);
    markSavedSnapshot();
    await refreshSavedSelect(out.file);
    setTimeout(() => {
      console.log('DEBUG dirty após salvar →', window.isDirty);
    }, 1000);

  } catch (err) {
    console.error(err);
    alert('Não foi possível salvar o horário: ' + err.message);
  }
}

const $btnDeleteEd = document.getElementById('ed-delete-saved');
if ($btnDeleteEd) {
  $btnDeleteEd.addEventListener('click', async () => {
    const sel = document.getElementById('ed-saved-select');
    const file = sel?.value || '';
    if (!file) return alert('Selecione um arquivo salvo para excluir.');
    if (!confirm('Tem certeza que deseja excluir este horário salvo?\nEsta ação não pode ser desfeita.')) return;

    try {
      await deleteSavedEditor(file);
      // Recarrega a lista do select
      const list = await listSavedEditor();
      sel.innerHTML = '';
      if (!list.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '— nenhum arquivo salvo —';
        sel.appendChild(opt);
      } else {
        list.slice().reverse().forEach(item => {
          const opt = document.createElement('option');
          opt.value = item.file;
          opt.textContent = `${item.name} — ${new Date(item.savedAt).toLocaleString()}`;
          sel.appendChild(opt);
        });
      }

      // Se por acaso o arquivo deletado era o atualmente visualizado, você pode limpar o LS:
      try {
        const cur = JSON.parse(localStorage.getItem('consolidatedSchedule') || 'null');
        if (cur && cur.__source_file === file) localStorage.removeItem('consolidatedSchedule');
      } catch { }
      alert('Arquivo excluído com sucesso.');
    } catch (e) {
      console.error(e);
      alert('Não foi possível excluir: ' + e.message);
    }
  });
}


// Associa o evento ao botão
const reloadBtn = document.getElementById('btn-recarregar');
if (reloadBtn) {
  reloadBtn.addEventListener('click', () => {
    reloadTimetable();
  });
}

const $fabBtn  = document.getElementById('fab-edit');

$fabBtn?.addEventListener('click', (ev) => {
  ev.preventDefault();
  ev.stopPropagation();

  // tenta abrir a modal diretamente
  if (typeof window.openEditModal === 'function') {
    const lesson = window.getSelectedLesson?.(); // se existir essa helper
    if (lesson) {
      window.openEditModal(lesson);
      return;
    }
  }

  // fallback: tenta o mesmo comportamento do botão do topo
  const $btnTopo = document.getElementById('btn-editar');
  if ($btnTopo && !$btnTopo.disabled) {
    $btnTopo.click();
  }
});

// Botão Salvar — envia o JSON para o PHP salvar no storage/schedules
const btnSalvar = document.getElementById('btn-salvar');
if (btnSalvar) {
  btnSalvar.addEventListener('click', salvarHorario);
}

// Botao editar materia
const $btnEditar = document.getElementById('btn-editar');
if ($btnEditar) {
  $btnEditar.addEventListener('click', () => {
    openEditModal();
  });
}

const btnShare = document.getElementById('btn-compartilhar'); // novo botão
if (btnShare) {
  btnShare.addEventListener('click', async () => {
    const sel = document.getElementById('ed-saved-select');
    const file = sel?.value || '';

    if (!file) {
      alert('Selecione um horário salvo para compartilhar.');
      return;
    }

    // Apenas AVISO se houver alterações não salvas
    if (isReallyDirty()) {
      const salvarAgora = confirm(
        'Você tem alterações não salvas.\n\n' +
        'O link abrirá o arquivo SALVO (pode não refletir as mudanças atuais).\n\n' +
        'Deseja salvar agora antes de compartilhar?'
      );
      if (salvarAgora) {
        // salva (e a própria rotina já atualiza o select/lista)
        await salvarHorario();
        return; // após salvar, o usuário clica novamente em "Compartilhar"
      }
      // Se escolher não salvar, seguimos com o arquivo selecionado mesmo assim
    }

    const url = buildShareUrl(file);

    // Copia para a área de transferência (fallback com prompt)
    try {
      await navigator.clipboard.writeText(url);
      showToast?.('🔗 Link copiado! Abrindo visualização…', 'info');
    } catch {
      prompt('Copie o link:', url);
    }

    // Abre em nova guia
    window.open(url, '_blank');
  });
}



// garantir estado inicial
updateEditButtonState();
updateShareButtonState();

// quando trocar o select, atualiza o botão
document.getElementById('ed-saved-select')?.addEventListener('change', updateShareButtonState);



// === Zoom da grade ===
// Range e passo (pode ajustar): 50%–100%, passo de 10%
const Z_MIN = 0.5;
const Z_MAX = 1.0;
const Z_STEP = 0.0;
const Z_KEY = 'timetableZoom';

const $zoomWrap = document.getElementById('grid-zoom-wrapper');
const $zOut = document.getElementById('btn-zoom-out');
const $zIn = document.getElementById('btn-zoom-in');
const $zReset = document.getElementById('btn-zoom-reset');
const $zIndic = document.getElementById('zoom-indicator');

function clampZoom(z) { return Math.max(Z_MIN, Math.min(Z_MAX, z)); }

function applyZoom(z) {
  if (!$zoomWrap) return;
  // transform reduz visualmente; ajustar width mantêm layout “encaixado” na viewport
  $zoomWrap.style.transform = `scale(${z})`;
  $zoomWrap.style.width = `${100 / z}%`;           // truque p/ caber mais conteúdo sem overflow horizontal gigante
  $zIndic && ($zIndic.textContent = `${Math.round(z * 100)}%`);
  // salva preferência
  try { localStorage.setItem(Z_KEY, String(z)); } catch (_) { }
}

function getSavedZoom() {
  const raw = localStorage.getItem(Z_KEY);
  const z = raw ? Number(raw) : 1;
  return Number.isFinite(z) ? clampZoom(z) : 1;
}

// Inicializa zoom ao carregar o app
(function initZoomControls() {
  const z0 = getSavedZoom();
  applyZoom(z0);

  if ($zOut) $zOut.addEventListener('click', () => {
    const z = clampZoom((Number(localStorage.getItem(Z_KEY)) || z0) - Z_STEP);
    applyZoom(z);
  });

  if ($zIn) $zIn.addEventListener('click', () => {
    const z = clampZoom((Number(localStorage.getItem(Z_KEY)) || z0) + Z_STEP);
    applyZoom(z);
  });

  if ($zReset) $zReset.addEventListener('click', () => applyZoom(1));
})();
