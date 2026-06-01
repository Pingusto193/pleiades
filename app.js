//
// Focus Trip — app.js (utilitários compartilhados)
//

// Recupera os dados do usuário atualmente logado a partir do localStorage
function getUser() {
  const raw = localStorage.getItem('focustrip_user');
  // Se existir o registro, converte de JSON para objeto JavaScript, caso contrário retorna null
  return raw ? JSON.parse(raw) : null;
}

// Salva/atualiza os dados do usuário no localStorage
function saveUser(user) {
  // Transforma o objeto do usuário em string JSON antes de salvar
  localStorage.setItem('focustrip_user', JSON.stringify(user));
}

// Retorna apenas as sessões de estudo que foram concluídas na data de hoje
function getTodaySessions() {
  // Obtém a data de hoje no formato YYYY-MM-DD
  const today = new Date().toISOString().split('T')[0];
  // Recupera todas as sessões registradas no localStorage (ou um array vazio se não houver nenhuma)
  const all = JSON.parse(localStorage.getItem('focustrip_sessions') || '[]');
  // Filtra o array mantendo apenas as sessões cuja data corresponda a hoje
  return all.filter(s => s.data === today);
}

// Formata uma quantidade em minutos para um texto amigável de horas e minutos (ex: 75 -> "1h 15min")
function minToHour(mins) {
  if (mins < 60) return mins + 'min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  // Se sobrarem minutos, mostra ambos. Caso contrário, mostra apenas a hora cheia
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// Exibe um aviso flutuante temporário (toast) na tela do usuário
function showToast(msg, type = 'success') {
  // Se já existir um toast na tela, remove-o imediatamente antes de criar o novo
  const existing = document.getElementById('ft-toast');
  if (existing) existing.remove();

  // Cria o elemento container do toast
  const toast = document.createElement('div');
  toast.id = 'ft-toast';
  // Define as classes CSS com base no tipo de aviso (ex: sucesso, erro, conquista)
  toast.className = `ft-toast ft-toast-${type}`;
  toast.textContent = msg;
  
  // Adiciona o toast ao final do body do documento
  document.body.appendChild(toast);

  // Define um leve atraso de 10ms antes de adicionar a classe de visibilidade (para ativação da animação de transição)
  setTimeout(() => toast.classList.add('ft-toast-visible'), 10);

  // Define um timer de 3 segundos para que o toast desapareça sozinho da tela
  setTimeout(() => {
    toast.classList.remove('ft-toast-visible');
    // Espera 400ms (tempo da transição de opacidade/movimento) e remove o elemento do DOM
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// Retorna uma lista estática contendo o catálogo de todas as conquistas do sistema
function getAchievements() {
  return [
    { id: 'first_session', icon: '', nome: 'Primeira Sessão', desc: 'Complete sua primeira sessão de estudo.' },
    { id: 'streak3', icon: '', nome: 'Chama de 3 Dias', desc: '3 dias consecutivos de estudo.' },
    { id: 'streak7', icon: '', nome: 'Chama de 7 Dias', desc: '7 dias consecutivos de estudo.' },
    { id: 'streak14', icon: '', nome: 'Chama Imparável', desc: '14 dias consecutivos.' },
    { id: 'streak30', icon: '', nome: 'Diamante do Saber', desc: '30 dias consecutivos.' },
    { id: 'pomodoro5', icon: '', nome: 'Turbo Focus', desc: '5 sessões Pomodoro em um único dia.' },
    { id: 'hours10', icon: '', nome: 'Maratonista de 10h', desc: 'Acumule 10 horas de estudo total.' },
    { id: 'hours50', icon: '', nome: 'Mestre das 50 Horas', desc: 'Acumule 50 horas de estudo total.' },
    { id: 'hours100', icon: '', nome: 'Coroa do Elite', desc: '100 horas totais de estudo.' },
    { id: 'level5', icon: '', nome: 'Sábio do Pentágono', desc: 'Alcance o nível 5 de expertise.' },
    { id: 'all_week', icon: '', nome: 'Semana Perfeita', desc: 'Cumpra a meta em todos os dias de estudo de uma semana.' },
    { id: 'night_owl', icon: '', nome: 'Coruja Noturna', desc: 'Complete uma sessão após as 22h.' },
  ];
}

// Verifica individualmente se o usuário cumpre as condições para desbloquear uma determinada conquista
function checkAchievement(a, user) {
  // Obtém todas as sessões registradas no histórico
  const sessions = JSON.parse(localStorage.getItem('focustrip_sessions') || '[]');
  // Soma a duração de todas as sessões em minutos
  const totalMins = sessions.reduce((acc, s) => acc + (s.duracao || 0), 0);

  switch (a.id) {
    case 'first_session': return sessions.length >= 1; // Pelo menos 1 sessão feita
    case 'streak3': return user.streak >= 3;           // Streak maior ou igual a 3
    case 'streak7': return user.streak >= 7;           // Streak maior ou igual a 7
    case 'streak14': return user.streak >= 14;         // Streak maior ou igual a 14
    case 'streak30': return user.streak >= 30;         // Streak maior ou igual a 30
    case 'hours10': return totalMins >= 600;           // 10 horas em minutos (10 * 60 = 600)
    case 'hours50': return totalMins >= 3000;          // 50 horas em minutos (50 * 60 = 3000)
    case 'hours100': return totalMins >= 6000;         // 100 horas em minutos (100 * 60 = 6000)
    case 'level5': return (user.nivel || 1) >= 5;      // Nível maior ou igual a 5
    case 'pomodoro5': {
      // Filtra e conta se existem 5 ou mais sessões Pomodoro iniciadas e salvas hoje
      const today = new Date().toISOString().split('T')[0];
      const todayPomodoros = sessions.filter(s => s.data === today && s.metodo === 'pomodoro');
      return todayPomodoros.length >= 5;
    }
    case 'night_owl': {
      // Verifica se existe alguma sessão gravada cujo horário de criação é maior ou igual às 22h (10h da noite)
      return sessions.some(s => {
        const d = new Date(s.criadoEm || s.data);
        return d.getHours() >= 22;
      });
    }
    default: return false;
  }
}

// Varre todas as conquistas do jogo e desbloqueia aquelas que o usuário ainda não possui
function checkAndUnlockAchievements(user) {
  const all = getAchievements();
  const prev = user.conquistas || []; // Lista de IDs das conquistas já conquistadas anteriormente
  all.forEach(a => {
    // Se o usuário já não tiver essa conquista e passou na validação de critérios
    if (!prev.includes(a.id) && checkAchievement(a, user)) {
      // Adiciona o ID da conquista na lista de conquistas do usuário
      user.conquistas = [...(user.conquistas || []), a.id];
      // Exibe uma notificação de parabéns na tela após 500ms
      setTimeout(() => showToast(`Conquista desbloqueada: ${a.nome}!`, 'achievement'), 500);
    }
  });
}

// Inicialização executada assim que o HTML da página atual estiver totalmente construído
document.addEventListener('DOMContentLoaded', () => {
  // Configuração inicial do tema da página (Escuro/Claro)
  // Busca no localStorage qual tema foi escolhido, definindo 'dark' como padrão
  const savedTheme = localStorage.getItem('ft_theme') || 'dark';
  // Aplica o atributo global 'data-theme' na tag raiz <html> do documento
  document.documentElement.setAttribute('data-theme', savedTheme);
});
