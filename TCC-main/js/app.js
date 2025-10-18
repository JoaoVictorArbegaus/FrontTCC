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

  // <<< NOVO: chave canônica por professor (id -> nome normalizado)
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
  // opcional: sinal visual
  // document.body.classList.toggle('dirty', window.isDirty);
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

function adjustUnallocSpacer() {
  const panel = document.getElementById('unalloc-panel');
  const scroller = document.querySelector('.grid-scroller');
  if (!panel || !scroller) return;

  // marca scroller para CSS e ajusta padding-bottom com a altura exata do painel
  scroller.classList.add('has-unalloc-sticky');
  const h = panel.offsetHeight || 0;
  scroller.style.paddingBottom = (h + 16) + 'px'; // 16px de folga
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

window.getGroupCells = getGroupCells;

function removeGroupCells(cells) {
  // remove registro do grupo (se esta remoção contém a head)
  const head = cells.find(c => c.classList.contains('block-head'));
  if (head && head.dataset.group) {
    groupHeads.delete(head.dataset.group);
  }

  cells.forEach(c => {
    c.classList.remove('occupied', 'block-head', 'block-tail', 'ring-2', 'ring-amber-400', 'conflict-teacher');
    // remove badge de conflito se existir
    const badge = c.querySelector?.('.conflict-badge');
    if (badge) badge.remove();

    c.style.gridColumnEnd = 'span 1';
    c.style.display = '';
    c.innerHTML = '';
    c.title = `${classById[c.dataset.turmaId]?.name ?? c.dataset.turmaId} - Clique para alocar`;
    delete c.dataset.group;
    delete c.dataset.lesson;
  });

  setDirty(true);
}

function recomputeTeacherConflicts() {
  // 1) limpa marcas e badges anteriores
  for (const [, head] of groupHeads) {
    head.classList.remove('conflict-teacher');
    const b = head.querySelector('.conflict-badge');
    if (b) b.remove();
    if (head.dataset.lesson) {
      const l = JSON.parse(head.dataset.lesson);
      head.title = cellTitle(l);
    }
  }

  // 2) indexa ocupações por professor (usando chave canônica), dia e período
  const busy = {}; // busy[key][day][period] = Set(groups)

  for (const [group, head] of groupHeads) {
    if (!head.dataset.lesson) continue;

    const lesson = JSON.parse(head.dataset.lesson);
    const day = Number(head.dataset.dia);
    const start = Number(head.dataset.periodo);
    const dur = Number(lesson.duration || 1);
    const tIds = Array.isArray(lesson.teacherIds) ? lesson.teacherIds : [];

    for (const tid of tIds) {
      // chave canônica: id -> nome normalizado (ou fallback)
      const key =
        teacherKeyById[tid] ??
        normalizeName(teacherById[tid]?.name) ??
        normalizeName(String(tid));  // <-- normaliza o próprio valor do array

      if (!busy[key]) busy[key] = {};
      if (!busy[key][day]) busy[key][day] = Array.from({ length: P }, () => new Set());

      for (let k = 0; k < dur; k++) {
        busy[key][day][start + k].add(group);
      }
    }
  }

  // 3) detecta conflitos (mesmo prof + mesmo dia/período com 2+ grupos)
  const conflictGroups = new Set();
  for (const key in busy) {
    const days = busy[key];
    for (const d in days) {
      days[d].forEach(set => {
        if (set.size > 1) set.forEach(g => conflictGroups.add(g));
      });
    }
  }

  // 4) aplica destaque aos grupos em conflito
  for (const g of conflictGroups) {
    const head = groupHeads.get(g);
    if (!head) continue;

    head.classList.add('conflict-teacher');

    let badge = head.querySelector('.conflict-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'conflict-badge';
      badge.textContent = '⚠ Prof. em conflito';
      head.appendChild(badge);
    }

    if (head.dataset.lesson) {
      const l = JSON.parse(head.dataset.lesson);
      head.title = '⚠ CONFLITO DE PROFESSOR\n' + cellTitle(l);
    }
  }
  console.debug(
    '[conflicts] heads:', groupHeads.size,
    'marcados:', document.querySelectorAll('.conflict-teacher').length
  )
}
window.recomputeTeacherConflicts = recomputeTeacherConflicts; // expõe para o console


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
}
function cancelPick() {
  clearPickedHighlight();
  pickedFromGrid = null;
}

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
}


function movePickedToCell(targetCell) {
  if (!pickedFromGrid) return;

  const { cells: oldCells, lesson, group } = pickedFromGrid;

  // ✅ NOVO: se clicou/droppou no MESMO grupo que está pickado,
  // apenas remover da grade e mandar para "não alocadas".
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

/* ===== util: listar/buscar horários salvos (declare ANTES de usar) ===== */
const ROOT = `${location.origin}/FrontTCC`; // ajuste se sua raiz mudar

async function listSavedEditor() {
  try {
    const r = await fetch(`${ROOT}/api/list_schedules.php`, { cache: 'no-store' });
    return r.ok ? await r.json() : [];
  } catch { return []; }
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
    initialUnallocated: []
  };
  updateData();
  renderPeriodsHeader();
  criarGrade();
  renderUnallocated();
  recomputeTeacherConflicts?.();
  setDirty(false);
}

/* ===== popular o select de salvos ===== */
(async function populateEditorSavedList() {
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
    list.slice().reverse().forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.file;
      opt.textContent = `${item.name} — ${new Date(item.savedAt).toLocaleString()}`;
      sel.appendChild(opt);
    });
  }
})();

/* ===== sair com aviso se houver alterações ===== */
window.addEventListener('beforeunload', (e) => {
  if (!window.isDirty) return;
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

    if (window.isDirty) {
      const ok = confirm('Você tem alterações não salvas. Carregar outro horário vai descartá-las.\n\nDeseja continuar?');
      if (!ok) return;
    }

    try {
      const consolidated = await getSavedEditor(file);
      applyConsolidatedToEditor(consolidated);
      try { localStorage.setItem('consolidatedSchedule', JSON.stringify(consolidated)); } catch {}
    } catch (e) {
      console.error(e);
      alert('Não foi possível carregar o horário selecionado.');
    }
  });
}



function buildConsolidated() {
  // Se estiver com uma aula pickada, “solta” visualmente (mantém onde está)
  cancelPick?.();

  const allocations = [];
  classes.forEach(t => {
    for (let d = 0; d < meta.days.length; d++) {
      for (let p = 0; p < P; p++) {
        const cell = mapCells[t.id][d][p];
        if (cell && cell.classList.contains('occupied') && cell.dataset.lesson) {
          if (cell.classList.contains('block-head')) {
            const lesson = JSON.parse(cell.dataset.lesson);
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
      }
    }
  });

  return { meta, classes, teachers, subjects, rooms, allocations };
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
    setDirty(false)
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

    const consolidated = buildConsolidated();

    // pergunta o nome
    const defaultName = `horario_${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
    const name = window.prompt('Nome do horário (arquivo):', defaultName);
    if (!name) return; // cancelado

    // opcional: também salva no localStorage (útil pra abrir "Visualizar" em seguida)
    localStorage.setItem('consolidatedSchedule', JSON.stringify(consolidated));

    // envia pro servidor
    const resp = await fetch('api/save_schedule.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, data: consolidated }),
      cache: 'no-store',
      credentials: 'omit'
    });

    const out = await resp.json();
    if (!resp.ok || !out?.ok) {
      throw new Error(out?.error || `Falha HTTP ${resp.status}`);
    }

    alert(`Horário salvo com sucesso!\nArquivo: ${out.file}`);
    console.log('Salvo em:', out);
    setDirty(false);


  } catch (err) {
    console.error(err);
    alert('Não foi possível salvar o horário: ' + err.message);
  }
}


// Associa o evento ao botão
const reloadBtn = document.getElementById('btn-recarregar');
if (reloadBtn) {
  reloadBtn.addEventListener('click', () => {
    reloadTimetable();
  });
}

// Botão Visualizar — monta o consolidado e abre a tela de visualização
const btnVisualizar = document.getElementById('btn-visualizar');
if (btnVisualizar) {
  btnVisualizar.addEventListener('click', () => {
    const consolidated = buildConsolidated();
    localStorage.setItem('consolidatedSchedule', JSON.stringify(consolidated));
    window.location.href = 'vizualizar.html';
  });
}

// Botão Salvar — envia o JSON para o PHP salvar no storage/schedules
const btnSalvar = document.getElementById('btn-salvar');
if (btnSalvar) {
  btnSalvar.addEventListener('click', async () => {
    try {
      const name = prompt('Nome do horário para salvar (ex.: 2025_sem1):');
      if (!name) return;

      const consolidated = buildConsolidated();

      const resp = await fetch(`${location.origin}/FrontTCC/api/save_schedule.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, payload: consolidated })
      });

      const ct = resp.headers.get('content-type') || '';
      const out = ct.includes('application/json') ? await resp.json()
        : { ok: false, error: await resp.text() };

      if (!resp.ok || !out.ok) throw new Error(out.error || `HTTP ${resp.status}`);
      alert(`Horário salvo em: ${out.file}`);
    } catch (e) {
      alert(`Não foi possível salvar o horário: ${e.message || e}`);
    }
  });
}

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

  // (Opcional) atalhos de teclado: Ctrl + / Ctrl -
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;

    if (e.key === '=' || e.key === '+') { // Ctrl +
      e.preventDefault();
      const z = clampZoom((Number(localStorage.getItem(Z_KEY)) || z0) + Z_STEP);
      applyZoom(z);
    } else if (e.key === '-') {           // Ctrl -
      e.preventDefault();
      const z = clampZoom((Number(localStorage.getItem(Z_KEY)) || z0) - Z_STEP);
      applyZoom(z);
    } else if (e.key === '0') {           // Ctrl 0
      e.preventDefault();
      applyZoom(1);
    }
  });
})();
