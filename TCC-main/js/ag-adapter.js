// js/ag-adapter.js
(function () {
  const DAY_INDEX = { Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3, Friday: 4, Saturday: 5, Sunday: 6 };

  function makeAbbr(name) {
    if (!name) return '---';
    const clean = name.normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const ab = (words[0][0] + words[1][0] + (words[2]?.[0] || '')).toUpperCase();
      if (ab.length >= 2) return ab.slice(0, 3);
    }
    return clean.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
  }

  function uniquePush(map, list, key, mkObj) {
    if (!map.has(key)) {
      const obj = mkObj(key);
      map.set(key, obj);
      list.push(obj);
    }
    return map.get(key);
  }

  /**
   * Adapta o payload do AG para o formato do EDITOR.
   * Além de placeholders (initialAllocations), agora também gera `preAllocations`
   * com todas as informações reais para a tela de edição pintar os blocos corretos.
   */
  function adaptAGForEditor(meta, agPayload) {
    const classes  = [];
    const teachers = [];
    const subjects = [];
    const rooms    = [];

    const subjMap   = new Map(); // nome -> subj
    const teacherMap= new Map(); // nome -> teacher
    const roomMap   = new Map(); // nome -> room
    const classMap  = new Map(); // id   -> class

    // 1) classes
    (agPayload.classes || []).forEach(c => {
      uniquePush(classMap, classes, String(c.class_id), id => ({
        id, name: c.class_name || String(c.class_id),
      }));
    });

    // 2) coletar entidades a partir das aulas
    (agPayload.classes || []).forEach(c => {
      (c.days || []).forEach(d => {
        (d.lessons || []).forEach(lesson => {
          (lesson.subject_names || []).forEach(sname => {
            uniquePush(subjMap, subjects, sname, name => ({
              id: 'S:' + name, name, abbr: makeAbbr(name),
            }));
          });
          (lesson.teachers || []).forEach(tname => {
            uniquePush(teacherMap, teachers, tname, name => ({
              id: 'T:' + name, name,
            }));
          });
          (lesson.classrooms || []).forEach(rname => {
            uniquePush(roomMap, rooms, rname, name => ({
              id: 'R:' + name, name,
            }));
          });
        });
      });
    });

    // lookups id<-nome
    const subjIdByName    = Object.fromEntries(subjects.map(s => [s.name, s.id]));
    const teacherIdByName = Object.fromEntries(teachers.map(t => [t.name, t.id]));
    const roomIdByName    = Object.fromEntries(rooms.map(r => [r.name, r.id]));

    // 3) initialAllocations (fallback leve, só marca início; dur=1)
    const P = meta.periods.length;
    const classIndexById = Object.fromEntries(classes.map((c, idx) => [c.id, idx]));
    const initialAllocations = {};

    (agPayload.classes || []).forEach(c => {
      const ci = classIndexById[String(c.class_id)];
      if (ci == null) return;
      const indices = [];
      (c.days || []).forEach(d => {
        const dayIdx = DAY_INDEX[d.day];
        (d.lessons || []).forEach(lesson => {
          const pStart = Number(lesson.period_start_index || 0);
          const linear = (dayIdx * P) + pStart;
          indices.push(linear);
        });
      });
      initialAllocations[ci] = indices;
    });

    // 4) preAllocations (para a EDIÇÃO desenhar blocos reais)
    const preAllocations = [];
    (agPayload.classes || []).forEach(c => {
      const classId = String(c.class_id);
      (c.days || []).forEach(d => {
        const dayIdx = DAY_INDEX[d.day];
        (d.lessons || []).forEach(lesson => {
          const start    = Number(lesson.period_start_index || 0);
          const duration = Number(lesson.duration_periods || 1);
          const subjName = (lesson.subject_names && lesson.subject_names[0]) || '---';
          const subjectId = subjIdByName[subjName] || ('S:' + subjName);
          const teacherIds = (lesson.teachers || []).map(n => teacherIdByName[n] || ('T:' + n));
          const roomId = lesson.classrooms?.[0]
            ? (roomIdByName[lesson.classrooms[0]] || ('R:' + lesson.classrooms[0]))
            : undefined;

          preAllocations.push({
            classId,
            day: dayIdx,
            start,
            duration,
            subjectId,
            teacherIds,
            roomId,
          });
        });
      });
    });

  // 5) initialUnallocated vazio por enquanto
    const initialUnallocated = [];

    // NOVO: Processar excess_lessons para initialUnallocated (cartões "Não alocados")
if (Array.isArray(agPayload.excess_lessons) && agPayload.excess_lessons.length > 0) {
  agPayload.excess_lessons.forEach((excess, idx) => {
    const classId = String(excess.class_id);

    // 1) garantir que a turma exista
    uniquePush(classMap, classes, classId, id => ({
      id, name: excess.class_name || String(excess.class_id),
    }));

    // 2) garantir que matéria/profs/salas existam nas tabelas
    const subjName = excess.subject_name || '---';
    uniquePush(subjMap, subjects, subjName, name => ({
      id: 'S:' + name, name, abbr: makeAbbr(name),
    }));

    (excess.teachers || []).forEach(tname => {
      uniquePush(teacherMap, teachers, tname, name => ({
        id: 'T:' + name, name,
      }));
    });

    (excess.classrooms || []).forEach(rname => {
      uniquePush(roomMap, rooms, rname, name => ({
        id: 'R:' + name, name,
      }));
    });

    // 3) lookups (id <- nome) para montar os campos esperados pelo card
    const subj = subjMap.get(subjName);
    const teacherIds = (excess.teachers || []).map(n => (teacherMap.get(n)?.id ?? ('T:' + n)));
    const roomIdsArr = (excess.classrooms || []).map(n => (roomMap.get(n)?.id ?? ('R:' + n)));
    const roomId = roomIdsArr[0]; // o componente costuma ler roomId (singular)

    // 4) criar um ID estável para o item "não alocado"
    //    prioridade: lesson_id vindo do AG; fallback determinístico.
    const id =
      (excess.lesson_id != null && excess.lesson_id !== '')
        ? `u:${excess.lesson_id}`
        : `u:${classId}:${subj?.id || ('S:' + subjName)}:${idx}`;

    // 5) montar o objeto no formato que a UI lê
    initialUnallocated.push({
      id,                    // <— NECESSÁRIO para o badge "id: ..."
      classId,               // usado para resolver nome da turma no título
      subjectId: subj?.id || ('S:' + subjName),
      teacherIds,            // array de IDs "T:*"
      roomId,                // <— singular para exibir a sala
      roomIds: roomIdsArr,   // (opcional) mantém também a lista completa
      duration: Number(excess.duration || excess.duration_periods || 1),
      ppw: Number(excess.ppw || 0),
      reason: excess.reason || 'unknown',
      // campos de apoio (fallback de texto – a UI pode nem usar)
      lessonId: excess.lesson_id ?? null,
      subjectName: subjName,
      className: excess.class_name || String(excess.class_id),
    });
  });
}

    return { meta, classes, teachers, subjects, rooms, initialAllocations, initialUnallocated, preAllocations };
  }

  /**
   * Converte o payload do AG para o formato do vizualizar (consolidatedSchedule).
   */
  function adaptAGForViewer(meta, agPayload) {
    const classes  = [];
    const teachers = [];
    const subjects = [];
    const rooms    = [];

    const subjMap   = new Map();
    const teacherMap= new Map();
    const roomMap   = new Map();
    const classMap  = new Map();

    (agPayload.classes || []).forEach(c => {
      uniquePush(classMap, classes, String(c.class_id), id => ({
        id, name: c.class_name || String(c.class_id),
      }));
    });

    (agPayload.classes || []).forEach(c => {
      (c.days || []).forEach(d => {
        (d.lessons || []).forEach(lesson => {
          (lesson.subject_names || []).forEach(sname => {
            uniquePush(subjMap, subjects, sname, name => ({
              id: 'S:' + name, name, abbr: makeAbbr(name),
            }));
          });
          (lesson.teachers || []).forEach(tname => {
            uniquePush(teacherMap, teachers, tname, name => ({
              id: 'T:' + name, name,
            }));
          });
          (lesson.classrooms || []).forEach(rname => {
            uniquePush(roomMap, rooms, rname, name => ({
              id: 'R:' + name, name,
            }));
          });
        });
      });
    });

    const teacherIdByName = Object.fromEntries(teachers.map(t => [t.name, t.id]));
    const roomIdByName    = Object.fromEntries(rooms.map(r => [r.name, r.id]));
    const subjIdByName    = Object.fromEntries(subjects.map(s => [s.name, s.id]));

    const allocations = [];
    (agPayload.classes || []).forEach(c => {
      const classId = String(c.class_id);
      (c.days || []).forEach(d => {
        const dayIdx = DAY_INDEX[d.day];
        (d.lessons || []).forEach(lesson => {
          const start    = Number(lesson.period_start_index || 0);
          const duration = Number(lesson.duration_periods || 1);
          const subjName = (lesson.subject_names && lesson.subject_names[0]) || '---';
          const subjectId = subjIdByName[subjName] || ('S:' + subjName);
          const teacherIds = (lesson.teachers || []).map(n => teacherIdByName[n] || ('T:' + n));
          const roomId = lesson.classrooms?.[0]
            ? (roomIdByName[lesson.classrooms[0]] || ('R:' + lesson.classrooms[0]))
            : undefined;

          allocations.push({
            classId,
            day: dayIdx,
            start,
            duration,
            subjectId,
            teacherIds,
            roomId,
          });
        });
      });
    });

    return { meta, classes, teachers, subjects, rooms, allocations };
  }

  window.AG_ADAPTER = {
    adaptAGForEditor,
    adaptAGForViewer,
  };
})();
