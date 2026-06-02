//
// Focus Trip — app.js (utilitários compartilhados)
//

// Usuário
const API_BASE = '';

function mediaUrl(path) {
 if (!path) return '';
 if (/^(https?:|data:|blob:)/.test(path)) return path;
 return `${API_BASE}${path}`;
}

function getToken() {
 return localStorage.getItem('focustrip_token');
}

function setAccountData(data) {
 if (data.token) localStorage.setItem('focustrip_token', data.token);
 if (data.user) localStorage.setItem('focustrip_user', JSON.stringify(data.user));
 if (data.sessions) localStorage.setItem('focustrip_sessions', JSON.stringify(data.sessions));
 if (data.subjects) localStorage.setItem('focustrip_subjects', JSON.stringify(data.subjects));
}

async function apiRequest(path, options = {}) {
 const headers = options.headers ? { ...options.headers } : {};
 const token = getToken();
 if (token) headers.Authorization = `Bearer ${token}`;
 if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

 let response;
 try {
 response = await fetch(API_BASE + path, { ...options, headers });
 } catch {
 throw new Error('Nao foi possivel conectar ao servidor. Confirme que o link publico ainda esta ativo.');
 }
 const text = await response.text();
 let data = {};
 try {
 data = text ? JSON.parse(text) : {};
 } catch {
 data = {};
 }
 if (!response.ok) {
  const fallback = response.status === 404
   ? 'API nao encontrada neste endereco. Confirme que o servidor esta rodando e use o link publico correto.'
   : `Não foi possível concluir a operação. Código ${response.status}.`;
  throw new Error(data.error || fallback);
 }
 return data;
}

async function registerAccount(payload) {
 const data = await apiRequest('/api/register', { method: 'POST', body: JSON.stringify(payload) });
 setAccountData(data);
 return data.user;
}

async function loginAccount(email, password) {
 const data = await apiRequest('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
 setAccountData(data);
 return data.user;
}

async function refreshAccount() {
 if (!getToken()) return null;
 const data = await apiRequest('/api/me');
 setAccountData(data);
 return data.user;
}

function persistUser(user) {
 if (!getToken()) return;
 apiRequest('/api/me', { method: 'PUT', body: JSON.stringify(user) }).catch(() => {
 showToast('Não foi possível sincronizar seus dados agora.');
 });
}

async function updateAccount(payload) {
 const data = await apiRequest('/api/account', { method: 'PUT', body: JSON.stringify(payload) });
 setAccountData(data);
 return data.user;
}

async function persistSession(session) {
 if (!getToken()) return;
 await apiRequest('/api/sessions', { method: 'POST', body: JSON.stringify(session) });
}

async function persistSubject(subject) {
 if (!getToken()) return null;
 return apiRequest('/api/subjects', { method: 'POST', body: JSON.stringify(subject) });
}

async function deleteSubjectFromServer(id) {
 if (!getToken() || !id) return;
 await apiRequest(`/api/subjects/${id}`, { method: 'DELETE' });
}

async function uploadAvatar(file) {
 const form = new FormData();
 form.append('avatar', file);
 const data = await apiRequest('/api/avatar', { method: 'POST', body: form });
 setAccountData(data);
 return data.user;
}

function getUser() {
 const raw = localStorage.getItem('focustrip_user');
 return raw ? JSON.parse(raw) : null;
}

function saveUser(user) {
 localStorage.setItem('focustrip_user', JSON.stringify(user));
 persistUser(user);
}

// Sessões
function localDateKey(date = new Date()) {
 const year = date.getFullYear();
 const month = String(date.getMonth() + 1).padStart(2, '0');
 const day = String(date.getDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
}

function localDateFromKey(key) {
 const [year, month, day] = key.split('-').map(Number);
 return new Date(year, month - 1, day);
}

function getTodaySessions() {
 const today = localDateKey();
 const all = JSON.parse(localStorage.getItem('focustrip_sessions') || '[]');
 return all.filter(s =>s.data === today);
}

// Formatação
function minToHour(mins) {
 if (mins < 60) return mins + 'min';
 const h = Math.floor(mins / 60);
 const m = mins % 60;
 return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// Toast
function showToast(msg, type = 'success') {
 const existing = document.getElementById('ft-toast');
 if (existing) existing.remove();
 const toast = document.createElement('div');
 toast.id = 'ft-toast';
 toast.className = `ft-toast ft-toast-${type}`;
 toast.textContent = msg;
 document.body.appendChild(toast);
 setTimeout(() =>toast.classList.add('ft-toast-visible'), 10);
 setTimeout(() => {
 toast.classList.remove('ft-toast-visible');
 setTimeout(() =>toast.remove(), 400);
 }, 3000);
}

// Conquistas
function getAchievements() {
 return [
 { id: 'first_session', icon: '', nome: 'Primeira Sessão', desc: 'Complete sua primeira sessão de estudo.' },
 { id: 'streak3', icon: '', nome: 'Chama de 3 Dias', desc: '3 dias consecutivos de estudo.' },
 { id: 'streak7', icon: '', nome: 'Chama de 7 Dias', desc: '7 dias consecutivos de estudo.' },
 { id: 'streak14', icon: '', nome: 'Chama Imparável', desc: '14 dias consecutivos.' },
 { id: 'streak30', icon: '', nome: 'Diamante do Saber', desc: '30 dias consecutivos.' },
 { id: 'pomodoro5', icon: '', nome: 'Turbo Focus', desc: '5 sessões Pomodoro em um único dia.' },
 { id: 'hours10', icon: '', nome: '10 Horas Estudadas', desc: '10 horas totais de estudo.' },
 { id: 'hours50', icon: '', nome: '50 Horas — Estudante',desc: '50 horas totais de estudo.' },
 { id: 'hours100', icon: '', nome: 'Coroa do Elite', desc: '100 horas totais de estudo.' },
 { id: 'level5', icon: '', nome: 'Nível 5', desc: 'Alcance o nível 5.' },
 { id: 'all_week', icon: '', nome: 'Semana Perfeita', desc: 'Cumpra a meta em todos os dias de estudo de uma semana.' },
 { id: 'night_owl', icon: '', nome: 'Coruja Noturna', desc: 'Complete uma sessão após as 22h.' },
 ];
}

function checkAchievement(a, user) {
 const sessions = JSON.parse(localStorage.getItem('focustrip_sessions') || '[]');
 const totalMins = sessions.reduce((acc, s) =>acc + (s.duracao || 0), 0);
 switch (a.id) {
 case 'first_session': return sessions.length >= 1;
 case 'streak3': return user.streak >= 3;
 case 'streak7': return user.streak >= 7;
 case 'streak14': return user.streak >= 14;
 case 'streak30': return user.streak >= 30;
 case 'hours10': return totalMins >= 600;
 case 'hours50': return totalMins >= 3000;
 case 'hours100': return totalMins >= 6000;
 case 'level5': return (user.nivel || 1) >= 5;
 case 'pomodoro5': {
 const today = localDateKey();
 const todayPomodoros = sessions.filter(s =>s.data === today && s.metodo === 'pomodoro');
 return todayPomodoros.length >= 5;
 }
 case 'night_owl': {
 return sessions.some(s => {
 const d = new Date(s.criadoEm || s.data);
 return d.getHours() >= 22;
 });
 }
 default: return false;
 }
}

function checkAndUnlockAchievements(user) {
 const all = getAchievements();
 const prev = user.conquistas || [];
 all.forEach(a => {
 if (!prev.includes(a.id) && checkAchievement(a, user)) {
 user.conquistas = [...(user.conquistas || []), a.id];
 setTimeout(() =>showToast(`Conquista desbloqueada: ${a.nome}!`, 'achievement'), 500);
 }
 });
}

// Inicialização global
document.addEventListener('DOMContentLoaded', () => {
 // Marcar sessão com hora de criação
 const origSave = localStorage.setItem.bind(localStorage);
 // Nenhuma sobrescrita necessária — a hora é salva inline em sessao.html

 // Modo escuro / claro (toggle futuro)
 const savedTheme = localStorage.getItem('ft_theme') || 'dark';
 document.documentElement.setAttribute('data-theme', savedTheme);

 refreshAccount().catch(() => {});
});
