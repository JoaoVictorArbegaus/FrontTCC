/* js/data.js — fonte única de dados da TELA DE EDIÇÃO
   - meta (dias/turnos)
   - classes (turmas)
   - subjects (com sigla abbr)
   - teachers
   - rooms (NOVO)
   - initialAllocations (por índice de turma)
   - initialUnallocated (cards não alocados, agora com roomId)
*/

window.EDITOR_DATA = (function () {
  const meta = {
    days: ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'],
    periods: [
      { code: 'M1', start: '08:00', band: 'M' }, { code: 'M2', start: '08:55', band: 'M' },
      { code: 'M3', start: '10:10', band: 'M' }, { code: 'M4', start: '11:05', band: 'M' },
      { code: 'T1', start: '13:30', band: 'T' }, { code: 'T2', start: '14:25', band: 'T' },
      { code: 'T3', start: '15:40', band: 'T' }, { code: 'T4', start: '16:35', band: 'T' },
      { code: 'N1', start: '19:00', band: 'N' }, { code: 'N2', start: '19:45', band: 'N' },
      { code: 'N3', start: '20:40', band: 'N' }, { code: 'N4', start: '21:30', band: 'N' }
    ]
  };

  const classes = [

  ];

  const teachers = [
 
  ];

  // NOVO: salas (placeholders)
  const rooms = [

  ];

  const subjects = [
   
  ];

  const initialAllocations = {
         
  };

  // Cards de aulas não alocadas iniciais (agora com roomId)
  const initialUnallocated = [
   
  ];

  return { meta, classes, teachers, subjects, rooms, initialAllocations, initialUnallocated };
})();
