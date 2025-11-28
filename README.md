# 🧩 FrontTCC — Sistema de Agendamento de Turmas (Frontend)

Interface web desenvolvida para edição, visualização e compartilhamento de horários acadêmicos gerados por um **Algoritmo Genético (AG)**.  
O sistema foi criado como parte do Trabalho de Conclusão de Curso (TCC) no curso de **Ciência da Computação - IFSC Lages**, com foco em **otimização de alocação de aulas, professores e salas**.

---

## 🚀 Funcionalidades Principais

### 🧮 Edição de Horários
Interface destinada a coordenadores e administradores para revisar e ajustar o cronograma gerado automaticamente.
- Adição e edição de aulas com definição de turma, matéria, professores, sala e duração.
- Verificação automática de conflitos de professor e sala.
- Painel inferior fixo com “Aulas não alocadas”, com rolagem interna.
- Botão flutuante de **“Editar Aula”** para acesso rápido durante a navegação.
- Controles de **zoom**, **salvar**, **recarregar** (dados do AG), **compartilhar** e **enviar ao MRBS**.
- Identificação automática do horário aberto (“Novo horário” ou nome do arquivo salvo).

### 👀 Visualização de Horários
Interface de consulta aberta via link compartilhado.
- Aberta a partir do botão **“Compartilhar”**, que gera um link direto.
- Carrega o cronograma salvo do servidor.
- Filtros dinâmicos por **Turma**, **Professor** e **Sala**.
- Zoom interativo com escala percentual.
- Exibição do nome do cronograma no cabeçalho.
- Renderização responsiva e clara em modo leitura.

---


## 🔗 Integrações

- **Algoritmo Genético (Python)** — Gera automaticamente os cronogramas otimizados.
- **MRBS (Meeting Room Booking System)** — Recebe os horários consolidados e cria as reservas das salas.
- **PHP APIs** — Responsáveis pelo carregamento e salvamento dos arquivos de horários.

---

## 🧰 Tecnologias Utilizadas

- **HTML5**, **CSS3** (Tailwind CSS)
- **JavaScript (ES6+)**
- **PHP 8+ (XAMPP)** para APIs locais
- **Fetch API** para comunicação assíncrona

