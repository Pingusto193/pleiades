const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'focus-trip.db'));
db.exec('PRAGMA journal_mode = WAL;');

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    horas INTEGER NOT NULL DEFAULT 2,
    dias TEXT NOT NULL DEFAULT '[]',
    metodo TEXT NOT NULL DEFAULT 'pomodoro',
    streak INTEGER NOT NULL DEFAULT 0,
    xp INTEGER NOT NULL DEFAULT 0,
    nivel INTEGER NOT NULL DEFAULT 1,
    conquistas TEXT NOT NULL DEFAULT '[]',
    avatar_url TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    duracao INTEGER NOT NULL,
    materia TEXT,
    metodo TEXT,
    completa INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    dias TEXT NOT NULL DEFAULT '[]',
    color TEXT NOT NULL DEFAULT '#2f6f73',
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((info) => info.name);
  if (!columns.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn('subjects', 'horario', "TEXT NOT NULL DEFAULT '08:00'");
ensureColumn('subjects', 'duracao', 'INTEGER NOT NULL DEFAULT 60');
ensureColumn('subjects', 'pausa', 'INTEGER NOT NULL DEFAULT 10');

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(ROOT));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${req.user.id}-${Date.now()}${ext}`);
    }
  }),
  fileFilter: (_req, file, cb) => {
    cb(null, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype));
  },
  limits: { fileSize: 2 * 1024 * 1024 }
});

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, user) {
  const { hash } = hashPassword(password, user.password_salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.password_hash, 'hex'));
}

function parseJSON(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    horas: row.horas,
    dias: parseJSON(row.dias, []),
    metodo: row.metodo,
    streak: row.streak,
    xp: row.xp,
    nivel: row.nivel,
    conquistas: parseJSON(row.conquistas, []),
    avatarUrl: row.avatar_url || '',
    criadoEm: row.criado_em
  };
}

function createToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO auth_tokens (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const auth = token && db.prepare('SELECT user_id FROM auth_tokens WHERE token = ?').get(token);
  if (!auth) return res.status(401).json({ error: 'Não autenticado.' });
  req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.user_id);
  if (!req.user) return res.status(401).json({ error: 'Usuário não encontrado.' });
  next();
}

function userPayload(req) {
  return {
    nome: String(req.body.nome || '').trim(),
    email: String(req.body.email || '').trim().toLowerCase(),
    password: String(req.body.password || req.body.senha || ''),
    horas: Number(req.body.horas || 2),
    dias: JSON.stringify(Array.isArray(req.body.dias) ? req.body.dias : []),
    metodo: String(req.body.metodo || 'pomodoro')
  };
}

app.post('/api/register', (req, res) => {
  const payload = userPayload(req);
  if (!payload.nome || !payload.email || payload.password.length < 8) {
    return res.status(400).json({ error: 'Informe nome, e-mail e senha com pelo menos 8 caracteres.' });
  }

  const password = hashPassword(payload.password);
  try {
    const result = db.prepare(`
      INSERT INTO users (nome, email, password_hash, password_salt, horas, dias, metodo)
      VALUES (@nome, @email, @password_hash, @password_salt, @horas, @dias, @metodo)
    `).run({
      nome: payload.nome,
      email: payload.email,
      horas: payload.horas,
      dias: payload.dias,
      metodo: payload.metodo,
      password_hash: password.hash,
      password_salt: password.salt
    });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ token: createToken(user.id), user: publicUser(user), sessions: [], subjects: [] });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    console.error(error);
    res.status(500).json({ error: 'Não foi possível criar a conta.' });
  }
});

app.post('/api/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || req.body.senha || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user)) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  res.json({
    token: createToken(user.id),
    user: publicUser(user),
    sessions: listSessions(user.id),
    subjects: listSubjects(user.id)
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), sessions: listSessions(req.user.id), subjects: listSubjects(req.user.id) });
});

app.put('/api/me', requireAuth, (req, res) => {
  const current = publicUser(req.user);
  const next = {
    nome: req.body.nome ?? current.nome,
    horas: Number(req.body.horas ?? current.horas),
    dias: JSON.stringify(Array.isArray(req.body.dias) ? req.body.dias : current.dias),
    metodo: req.body.metodo ?? current.metodo,
    streak: Number(req.body.streak ?? current.streak),
    xp: Number(req.body.xp ?? current.xp),
    nivel: Number(req.body.nivel ?? current.nivel),
    conquistas: JSON.stringify(Array.isArray(req.body.conquistas) ? req.body.conquistas : current.conquistas)
  };
  db.prepare(`
    UPDATE users
    SET nome = @nome, horas = @horas, dias = @dias, metodo = @metodo,
        streak = @streak, xp = @xp, nivel = @nivel, conquistas = @conquistas
    WHERE id = @id
  `).run({ ...next, id: req.user.id });
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

app.put('/api/account', requireAuth, (req, res) => {
  const nome = String(req.body.nome || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (!nome || !email) return res.status(400).json({ error: 'Informe nome e e-mail.' });

  const updates = { id: req.user.id, nome, email };
  let passwordSql = '';

  if (newPassword) {
    if (newPassword.length < 8) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
    if (!verifyPassword(currentPassword, req.user)) return res.status(401).json({ error: 'Senha atual incorreta.' });
    const password = hashPassword(newPassword);
    updates.password_hash = password.hash;
    updates.password_salt = password.salt;
    passwordSql = ', password_hash = @password_hash, password_salt = @password_salt';
  }

  try {
    db.prepare(`UPDATE users SET nome = @nome, email = @email${passwordSql} WHERE id = @id`).run(updates);
    res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Este e-mail já está em uso.' });
    res.status(500).json({ error: 'Não foi possível atualizar a conta.' });
  }
});

function listSessions(userId) {
  return db.prepare(`
    SELECT id, data, duracao, materia, metodo, completa, criado_em AS criadoEm
    FROM sessions WHERE user_id = ? ORDER BY id ASC
  `).all(userId).map((session) => ({ ...session, completa: Boolean(session.completa) }));
}

app.post('/api/sessions', requireAuth, (req, res) => {
  const session = {
    user_id: req.user.id,
    data: String(req.body.data || localDateKey()),
    duracao: Number(req.body.duracao || 0),
    materia: String(req.body.materia || 'Sessão de estudo'),
    metodo: String(req.body.metodo || 'pomodoro'),
    completa: req.body.completa ? 1 : 0
  };
  const result = db.prepare(`
    INSERT INTO sessions (user_id, data, duracao, materia, metodo, completa)
    VALUES (@user_id, @data, @duracao, @materia, @metodo, @completa)
  `).run(session);
  res.status(201).json({ id: result.lastInsertRowid, ...session, completa: Boolean(session.completa) });
});

function listSubjects(userId) {
  return db.prepare('SELECT id, nome, dias, color, horario, duracao, pausa FROM subjects WHERE user_id = ? ORDER BY id ASC').all(userId)
    .map((subject) => ({ ...subject, dias: parseJSON(subject.dias, []) }));
}

app.post('/api/subjects', requireAuth, (req, res) => {
  const subject = {
    user_id: req.user.id,
    nome: String(req.body.nome || '').trim(),
    dias: JSON.stringify(Array.isArray(req.body.dias) ? req.body.dias : []),
    color: String(req.body.color || '#2f6f73'),
    horario: String(req.body.horario || '08:00'),
    duracao: Number(req.body.duracao || 60),
    pausa: Number(req.body.pausa || 10)
  };
  if (!subject.nome) return res.status(400).json({ error: 'Nome da matéria é obrigatório.' });
  const result = db.prepare(`
    INSERT INTO subjects (user_id, nome, dias, color, horario, duracao, pausa)
    VALUES (@user_id, @nome, @dias, @color, @horario, @duracao, @pausa)
  `).run(subject);
  res.status(201).json({ id: result.lastInsertRowid, ...subject, dias: parseJSON(subject.dias, []) });
});

app.delete('/api/subjects/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM subjects WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.status(204).end();
});

app.post('/api/avatar', requireAuth, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie uma imagem válida de até 2 MB.' });
  const avatarUrl = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
  res.json({ avatarUrl, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

app.listen(PORT, () => {
  console.log(`Focus Trip rodando em http://localhost:${PORT}`);
});
