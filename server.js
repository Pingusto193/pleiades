const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const USE_POSTGRES = Boolean(process.env.DATABASE_URL);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let pool;
let sqliteDb;

function pgSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

async function all(sql, params = []) {
  if (USE_POSTGRES) return (await pool.query(pgSql(sql), params)).rows;
  return sqliteDb.prepare(sql).all(...params);
}

async function get(sql, params = []) {
  if (USE_POSTGRES) return (await pool.query(pgSql(sql), params)).rows[0];
  return sqliteDb.prepare(sql).get(...params);
}

async function run(sql, params = []) {
  if (USE_POSTGRES) return pool.query(pgSql(sql), params);
  return sqliteDb.prepare(sql).run(...params);
}

async function insert(sql, params = []) {
  if (USE_POSTGRES) {
    const row = await get(`${sql} RETURNING id`, params);
    return row.id;
  }
  return run(sql, params).then((result) => result.lastInsertRowid);
}

async function initDb() {
  if (USE_POSTGRES) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
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
        plan TEXT NOT NULL DEFAULT 'free',
        conquistas TEXT NOT NULL DEFAULT '[]',
        avatar_url TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        duracao INTEGER NOT NULL,
        materia TEXT,
        metodo TEXT,
        completa INTEGER NOT NULL DEFAULT 0,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nome TEXT NOT NULL,
        dias TEXT NOT NULL DEFAULT '[]',
        color TEXT NOT NULL DEFAULT '#2f6f73',
        horario TEXT NOT NULL DEFAULT '08:00',
        duracao INTEGER NOT NULL DEFAULT 60,
        pausa INTEGER NOT NULL DEFAULT 10,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free'");
    return;
  }

  const { DatabaseSync } = require('node:sqlite');
  sqliteDb = new DatabaseSync(path.join(DATA_DIR, 'focus-trip.db'));
  sqliteDb.exec('PRAGMA journal_mode = WAL;');
  sqliteDb.exec(`
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
      plan TEXT NOT NULL DEFAULT 'free',
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
      horario TEXT NOT NULL DEFAULT '08:00',
      duracao INTEGER NOT NULL DEFAULT 60,
      pausa INTEGER NOT NULL DEFAULT 10,
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

  const userColumns = sqliteDb.prepare('PRAGMA table_info(users)').all().map((info) => info.name);
  if (!userColumns.includes('plan')) sqliteDb.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
    return typeof value === 'string' ? JSON.parse(value) : value;
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
    plan: row.plan || 'free',
    conquistas: parseJSON(row.conquistas, []),
    avatarUrl: row.avatar_url || '',
    criadoEm: row.criado_em
  };
}

function isPremium(user) {
  return user && user.plan === 'premium';
}

async function createToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO auth_tokens (token, user_id) VALUES (?, ?)', [token, userId]);
  return token;
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const auth = token && await get('SELECT user_id FROM auth_tokens WHERE token = ?', [token]);
  if (!auth) return res.status(401).json({ error: 'Nao autenticado.' });
  req.user = await get('SELECT * FROM users WHERE id = ?', [auth.user_id]);
  if (!req.user) return res.status(401).json({ error: 'Usuario nao encontrado.' });
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
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

app.post('/api/register', asyncRoute(async (req, res) => {
  const payload = userPayload(req);
  if (!payload.nome || !payload.email || payload.password.length < 8) {
    return res.status(400).json({ error: 'Informe nome, e-mail e senha com pelo menos 8 caracteres.' });
  }

  const password = hashPassword(payload.password);
  try {
    const id = await insert(`
      INSERT INTO users (nome, email, password_hash, password_salt, horas, dias, metodo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [payload.nome, payload.email, password.hash, password.salt, payload.horas, payload.dias, payload.metodo]);
    const user = await get('SELECT * FROM users WHERE id = ?', [id]);
    res.status(201).json({ token: await createToken(user.id), user: publicUser(user), sessions: [], subjects: [] });
  } catch (error) {
    if (String(error.message).includes('duplicate key') || String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Este e-mail ja esta cadastrado.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Nao foi possivel criar a conta.' });
  }
}));

app.post('/api/login', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || req.body.senha || '');
  const user = await get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !verifyPassword(password, user)) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  res.json({
    token: await createToken(user.id),
    user: publicUser(user),
    sessions: await listSessions(user.id),
    subjects: await listSubjects(user.id)
  });
}));

app.get('/api/me', requireAuth, asyncRoute(async (req, res) => {
  res.json({ user: publicUser(req.user), sessions: await listSessions(req.user.id), subjects: await listSubjects(req.user.id) });
}));

app.put('/api/me', requireAuth, asyncRoute(async (req, res) => {
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
  await run(`
    UPDATE users
    SET nome = ?, horas = ?, dias = ?, metodo = ?, streak = ?, xp = ?, nivel = ?, conquistas = ?
    WHERE id = ?
  `, [next.nome, next.horas, next.dias, next.metodo, next.streak, next.xp, next.nivel, next.conquistas, req.user.id]);
  res.json({ user: publicUser(await get('SELECT * FROM users WHERE id = ?', [req.user.id])) });
}));

app.put('/api/account', requireAuth, asyncRoute(async (req, res) => {
  const nome = String(req.body.nome || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (!nome || !email) return res.status(400).json({ error: 'Informe nome e e-mail.' });

  let sql = 'UPDATE users SET nome = ?, email = ?';
  const params = [nome, email];

  if (newPassword) {
    if (newPassword.length < 8) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
    if (!verifyPassword(currentPassword, req.user)) return res.status(401).json({ error: 'Senha atual incorreta.' });
    const password = hashPassword(newPassword);
    sql += ', password_hash = ?, password_salt = ?';
    params.push(password.hash, password.salt);
  }

  try {
    await run(`${sql} WHERE id = ?`, [...params, req.user.id]);
    res.json({ user: publicUser(await get('SELECT * FROM users WHERE id = ?', [req.user.id])) });
  } catch (error) {
    if (String(error.message).includes('duplicate key') || String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Este e-mail ja esta em uso.' });
    }
    res.status(500).json({ error: 'Nao foi possivel atualizar a conta.' });
  }
}));

async function listSessions(userId) {
  const rows = await all(`
    SELECT id, data, duracao, materia, metodo, completa, criado_em AS "criadoEm"
    FROM sessions WHERE user_id = ? ORDER BY id ASC
  `, [userId]);
  return rows.map((session) => ({ ...session, completa: Boolean(session.completa) }));
}

app.post('/api/sessions', requireAuth, asyncRoute(async (req, res) => {
  const session = {
    user_id: req.user.id,
    data: String(req.body.data || localDateKey()),
    duracao: Number(req.body.duracao || 0),
    materia: String(req.body.materia || 'Sessao de estudo'),
    metodo: String(req.body.metodo || 'pomodoro'),
    completa: req.body.completa ? 1 : 0
  };
  const id = await insert(`
    INSERT INTO sessions (user_id, data, duracao, materia, metodo, completa)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [session.user_id, session.data, session.duracao, session.materia, session.metodo, session.completa]);
  res.status(201).json({ id, ...session, completa: Boolean(session.completa) });
}));

async function listSubjects(userId) {
  const rows = await all('SELECT id, nome, dias, color, horario, duracao, pausa FROM subjects WHERE user_id = ? ORDER BY id ASC', [userId]);
  return rows.map((subject) => ({ ...subject, dias: parseJSON(subject.dias, []) }));
}

app.post('/api/subjects', requireAuth, asyncRoute(async (req, res) => {
  if (!isPremium(req.user)) {
    const todayCount = await get(
      USE_POSTGRES
        ? "SELECT COUNT(*)::int AS total FROM subjects WHERE user_id = ? AND criado_em::date = CURRENT_DATE"
        : "SELECT COUNT(*) AS total FROM subjects WHERE user_id = ? AND date(criado_em) = date('now')",
      [req.user.id]
    );
    if (Number(todayCount.total) >= 2) {
      return res.status(403).json({ error: 'Plano gratuito: limite de 2 materias por dia. Atualize para Premium para adicionar mais.' });
    }
  }

  const subject = {
    user_id: req.user.id,
    nome: String(req.body.nome || '').trim(),
    dias: JSON.stringify(Array.isArray(req.body.dias) ? req.body.dias : []),
    color: String(req.body.color || '#2f6f73'),
    horario: String(req.body.horario || '08:00'),
    duracao: Number(req.body.duracao || 60),
    pausa: Number(req.body.pausa || 10)
  };
  if (!subject.nome) return res.status(400).json({ error: 'Nome da materia e obrigatorio.' });
  const id = await insert(`
    INSERT INTO subjects (user_id, nome, dias, color, horario, duracao, pausa)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [subject.user_id, subject.nome, subject.dias, subject.color, subject.horario, subject.duracao, subject.pausa]);
  res.status(201).json({ id, ...subject, dias: parseJSON(subject.dias, []) });
}));

app.delete('/api/subjects/:id', requireAuth, asyncRoute(async (req, res) => {
  await run('DELETE FROM subjects WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  res.status(204).end();
}));

app.post('/api/avatar', requireAuth, upload.single('avatar'), asyncRoute(async (req, res) => {
  if (!isPremium(req.user)) return res.status(403).json({ error: 'Foto de perfil e exclusiva do plano Premium.' });
  if (!req.file) return res.status(400).json({ error: 'Envie uma imagem valida de ate 2 MB.' });
  const avatarUrl = `/uploads/${req.file.filename}`;
  await run('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, req.user.id]);
  res.json({ avatarUrl, user: publicUser(await get('SELECT * FROM users WHERE id = ?', [req.user.id])) });
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Focus Trip rodando na porta ${PORT} usando ${USE_POSTGRES ? 'PostgreSQL' : 'SQLite'}`);
  });
}).catch((error) => {
  console.error('Falha ao iniciar o banco de dados:', error);
  process.exit(1);
});
