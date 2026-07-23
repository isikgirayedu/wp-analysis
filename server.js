const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const COOKIE_NAME = 'wp_analysis_auth';
const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MAX_CHAT_BYTES = Number(process.env.MAX_CHAT_BYTES || 25 * 1024 * 1024);
const DATA_FILE_PATH = path.resolve(process.env.CHAT_FILE_PATH || defaultChatPath());
const WRITE_FILE_PATH = path.resolve(process.env.CHAT_WRITE_PATH || DATA_FILE_PATH);

const cookieSecret = process.env.COOKIE_SECRET;
const passwordHash = process.env.AUTH_PASSWORD_SHA256 || sha256(process.env.AUTH_PASSWORD || '');

if (require.main === module && (!cookieSecret || (!process.env.AUTH_PASSWORD && !process.env.AUTH_PASSWORD_SHA256))) {
  console.error('Missing AUTH_PASSWORD or AUTH_PASSWORD_SHA256 and COOKIE_SECRET.');
  console.error('Example: AUTH_PASSWORD=change-me COOKIE_SECRET=$(openssl rand -hex 32) npm start');
  process.exit(1);
}

let chatMessages = [];
let chatMeta = emptyMeta();

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: ['text/plain', 'text/*'], limit: MAX_CHAT_BYTES }));
app.use('/api', noStore);

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/vendor/chart.umd.min.js', (_req, res) => {
  res.sendFile(path.join(__dirname, 'vendor/chart.umd.min.js'));
});

app.get('/api/session', (req, res) => {
  const authenticated = isAuthenticated(req);
  res.json({
    authenticated,
    chat: authenticated ? chatMeta : emptyMeta(),
  });
});

app.post('/api/login', (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!verifyPassword(password)) {
    res.status(401).json({ error: 'INVALID_PASSWORD' });
    return;
  }

  setAuthCookie(res);
  res.json({ authenticated: true, chat: chatMeta });
});

app.post('/api/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ authenticated: false });
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const raw = typeof req.body === 'string' ? req.body : '';
  const parsed = parseChat(raw);
  if (!parsed.length) {
    res.status(400).json({ error: 'NO_MESSAGES_FOUND' });
    return;
  }

  await fsp.mkdir(path.dirname(WRITE_FILE_PATH), { recursive: true });
  await fsp.writeFile(WRITE_FILE_PATH, raw, 'utf8');
  setChat(parsed);
  res.json({ chat: chatMeta });
});

app.get('/api/search', requireAuth, (req, res) => {
  const query = normalizeSearchText(String(req.query.q || '').trim());
  const mode = req.query.mode === 'month' ? 'month' : 'day';

  if (!chatMessages.length) {
    res.status(409).json({ error: 'CHAT_NOT_LOADED' });
    return;
  }

  if (!query) {
    res.status(400).json({ error: 'EMPTY_QUERY' });
    return;
  }

  res.json(searchChat(query, mode));
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, hasChat: chatMeta.hasChat });
});

app.use((_req, res) => {
  res.status(404).send('Not found');
});

if (require.main === module) {
  loadInitialChat()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`wp-analysis backend listening on http://127.0.0.1:${PORT}`);
      });
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

function defaultChatPath() {
  const dataPath = path.join(__dirname, 'data/chat.txt');
  if (fs.existsSync(dataPath)) return dataPath;
  return path.join(__dirname, '_chat.txt');
}

async function loadInitialChat() {
  try {
    const raw = await fsp.readFile(DATA_FILE_PATH, 'utf8');
    setChat(parseChat(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    setChat([]);
  }
}

function setChat(messages) {
  chatMessages = messages;
  chatMeta = buildMeta(messages);
}

function emptyMeta() {
  return {
    hasChat: false,
    messageCount: 0,
    firstDate: null,
    lastDate: null,
  };
}

function buildMeta(messages) {
  if (!messages.length) return emptyMeta();
  const sorted = messages.map(msg => msg.date).sort((a, b) => dateToObject(a) - dateToObject(b));
  return {
    hasChat: true,
    messageCount: messages.length,
    firstDate: sorted[0],
    lastDate: sorted[sorted.length - 1],
  };
}

function parseChat(raw) {
  const result = [];
  let current = null;

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseChatLine(line);
    if (parsed) {
      if (current) result.push(current);
      current = parsed;
    } else if (current && line.trim()) {
      current.text += ' ' + line.trim();
    }
  }

  if (current) result.push(current);
  return result;
}

function parseChatLine(line) {
  let match = line.match(/^\[(\d{1,2})\.(\d{1,2})\.(\d{4}),\s[\d:.]+\]\s.+?:\s(.*)/);
  if (match) return { date: `${pad2(match[1])}.${pad2(match[2])}.${match[3]}`, text: match[4] };

  match = line.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4}),\s.+?\s-\s.+?:\s(.*)/);
  if (match) return { date: `${pad2(match[1])}.${pad2(match[2])}.${normalizeYear(match[3])}`, text: match[4] };

  return null;
}

function searchChat(query, mode) {
  const counts = new Map();
  let total = 0;

  for (const msg of chatMessages) {
    const text = normalizeSearchText(msg.text);
    let count = 0;
    let index = 0;

    while ((index = text.indexOf(query, index)) !== -1) {
      count += 1;
      index += query.length;
    }

    if (!count) continue;
    total += count;

    const key = mode === 'day' ? dayKey(msg.date) : monthKey(msg.date);
    counts.set(key, (counts.get(key) || 0) + count);
  }

  if (!total) {
    return {
      query,
      mode,
      found: false,
      labels: [],
      values: [],
      stats: null,
    };
  }

  const keys = buildPeriodKeys(mode);
  const labels = keys.map(key => labelForKey(key, mode));
  const values = keys.map(key => counts.get(key) || 0);
  const maxValue = Math.max(...values);
  const maxIndex = values.indexOf(maxValue);
  const activeCount = values.filter(value => value > 0).length;

  return {
    query,
    mode,
    found: true,
    labels,
    values,
    stats: {
      total,
      peakLabel: labels[maxIndex],
      peakCount: maxValue,
      activeCount,
      averageActive: activeCount ? total / activeCount : 0,
    },
  };
}

function buildPeriodKeys(mode) {
  if (!chatMeta.hasChat) return [];
  const start = dateToObject(chatMeta.firstDate);
  const end = dateToObject(chatMeta.lastDate);
  const keys = [];

  if (mode === 'day') {
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cursor <= last) {
      keys.push(formatDayKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
  }

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    keys.push(formatMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function labelForKey(key, mode) {
  if (mode === 'day') {
    const [year, month, day] = key.split('-');
    return `${day}.${month}.${year}`;
  }

  const [year, month] = key.split('-');
  const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  return `${months[Number(month) - 1]} ${year}`;
}

function dayKey(date) {
  const [day, month, year] = date.split('.');
  return `${year}-${month}-${day}`;
}

function monthKey(date) {
  const [, month, year] = date.split('.');
  return `${year}-${month}`;
}

function dateToObject(date) {
  const [day, month, year] = date.split('.').map(Number);
  return new Date(year, month - 1, day);
}

function formatDayKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function normalizeSearchText(value) {
  return value.toLocaleLowerCase('tr-TR');
}

function normalizeYear(year) {
  return year.length === 2 ? `20${year}` : year;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function verifyPassword(password) {
  return timingSafeEqualHex(sha256(password), passwordHash);
}

function sign(value) {
  return crypto.createHmac('sha256', cookieSecret).update(value).digest('base64url');
}

function createToken() {
  const payload = Buffer.from(JSON.stringify({ issuedAt: Date.now() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  if (!timingSafeEqualString(sign(payload), signature)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Date.now() - decoded.issuedAt <= AUTH_MAX_AGE_SECONDS * 1000;
  } catch {
    return false;
  }
}

function isAuthenticated(req) {
  return verifyToken(readCookie(req, COOKIE_NAME));
}

function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  next();
}

function setAuthCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${createToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${AUTH_MAX_AGE_SECONDS};${secure}`);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0;`);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

function timingSafeEqualHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function noStore(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

module.exports = {
  app,
  parseChat,
  searchChat,
  setChat,
  buildMeta,
};
