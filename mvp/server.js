// MVP «Мультик»: фото → 4 персонажа → раскадровка. Zero-dependency Node (>=18).
// Запуск: node mvp/server.js   (ключ kie.ai берётся из .env в корне проекта)

const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// ---------- .env: ключ kie.ai (значение не логируем) ----------
function loadKieKey() {
  if (process.env.KIE_API_KEY) return process.env.KIE_API_KEY;
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) throw new Error('.env не найден в корне проекта');
  const vars = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  const names = Object.keys(vars);
  const kieName = names.find((n) => /KIE/i.test(n)) || (names.length === 1 ? names[0] : null);
  if (!kieName) throw new Error(`Не нашёл ключ kie.ai в .env (переменные: ${names.join(', ')})`);
  console.log(`[env] использую ключ из переменной ${kieName}`);
  return vars[kieName];
}
const KIE_KEY = loadKieKey();

// ---------- учёт стоимости (in-memory, MVP) ----------
const usage = { images: 0, totalUsd: 0, byTask: new Map() };
function countSuccess(taskId, model) {
  if (usage.byTask.has(taskId)) return;
  const price = config.PRICE_PER_IMAGE_USD[model] ?? 0;
  usage.byTask.set(taskId, price);
  usage.images += 1;
  usage.totalUsd += price;
}
const taskModel = new Map(); // taskId -> model (для цены при поллинге)

// ---------- kie.ai helpers ----------
async function kieFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${KIE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`kie.ai ${res.status}: ${text.slice(0, 500)}`);
  return json;
}

async function createTask(model, input) {
  const json = await kieFetch(config.KIE.BASE_URL + config.KIE.CREATE_TASK, {
    method: 'POST',
    body: JSON.stringify({ model, input }),
  });
  if (json.code !== 200 || !json.data?.taskId) {
    throw new Error(`createTask: ${JSON.stringify(json).slice(0, 500)}`);
  }
  taskModel.set(json.data.taskId, model);
  return json.data.taskId;
}

async function getTask(taskId) {
  const url = `${config.KIE.BASE_URL}${config.KIE.RECORD_INFO}?taskId=${encodeURIComponent(taskId)}`;
  const json = await kieFetch(url);
  const d = json.data || {};
  const state = d.state; // waiting | queuing | generating | success | fail
  let urls = [];
  if (state === 'success' && d.resultJson) {
    try { urls = JSON.parse(d.resultJson).resultUrls || []; } catch { /* ignore */ }
    countSuccess(taskId, taskModel.get(taskId) || config.MODELS.character);
  }
  return { state, urls, error: d.failMsg || d.failCode || null };
}

async function uploadBase64(base64Data, fileName) {
  const json = await kieFetch(config.KIE.UPLOAD_BASE64, {
    method: 'POST',
    body: JSON.stringify({
      base64Data, // data URL целиком: data:image/jpeg;base64,...
      uploadPath: 'images/multik-mvp',
      fileName: fileName || 'photo.jpg',
    }),
  });
  const url = json.data?.downloadUrl || json.data?.fileUrl || json.data?.url;
  if (!json.success && json.code !== 200) throw new Error(`upload: ${JSON.stringify(json).slice(0, 500)}`);
  if (!url) throw new Error(`upload: нет URL в ответе: ${JSON.stringify(json).slice(0, 500)}`);
  return url;
}

// ---------- HTTP ----------
function readBody(req, limitMb = 25) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limitMb * 1024 * 1024) { reject(new Error('файл слишком большой')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // --- API ---
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const { dataUrl, fileName } = JSON.parse(await readBody(req));
      const imageUrl = await uploadBase64(dataUrl, fileName);
      return send(res, 200, { imageUrl });
    }

    if (req.method === 'POST' && url.pathname === '/api/characters') {
      const { imageUrl } = JSON.parse(await readBody(req));
      if (!imageUrl) return send(res, 400, { error: 'нет imageUrl' });
      const tasks = await Promise.all(
        config.STYLES.map(async (s) => ({
          key: s.key,
          name: s.name,
          emoji: s.emoji,
          taskId: await createTask(config.MODELS.character, {
            prompt: `${s.prompt}\n\n${config.IDENTITY_RULES}`,
            image_urls: [imageUrl],
            output_format: 'png',
            aspect_ratio: config.ASPECT_RATIO.character,
          }),
        }))
      );
      return send(res, 200, { tasks });
    }

    if (req.method === 'POST' && url.pathname === '/api/regenerate') {
      const { imageUrl, styleKey } = JSON.parse(await readBody(req));
      const s = config.STYLES.find((x) => x.key === styleKey);
      if (!s || !imageUrl) return send(res, 400, { error: 'нет styleKey/imageUrl' });
      const taskId = await createTask(config.MODELS.character, {
        prompt: `${s.prompt}\n\n${config.IDENTITY_RULES}`,
        image_urls: [imageUrl],
        output_format: 'png',
        aspect_ratio: config.ASPECT_RATIO.character,
      });
      return send(res, 200, { taskId });
    }

    if (req.method === 'POST' && url.pathname === '/api/storyboard') {
      const { characterUrl, sourceUrl } = JSON.parse(await readBody(req));
      if (!characterUrl) return send(res, 400, { error: 'нет characterUrl' });
      const image_urls = sourceUrl ? [characterUrl, sourceUrl] : [characterUrl];
      const taskId = await createTask(config.MODELS.storyboard, {
        prompt: config.STORYBOARD_PROMPT,
        image_urls,
        output_format: 'png',
        aspect_ratio: config.ASPECT_RATIO.storyboard,
      });
      return send(res, 200, { taskId });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/task/')) {
      const taskId = decodeURIComponent(url.pathname.slice('/api/task/'.length));
      return send(res, 200, await getTask(taskId));
    }

    if (req.method === 'GET' && url.pathname === '/api/usage') {
      return send(res, 200, {
        images: usage.images,
        totalUsd: Number(usage.totalUsd.toFixed(4)),
        prices: config.PRICE_PER_IMAGE_USD,
        models: config.MODELS,
      });
    }

    // --- статика ---
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.join(__dirname, 'public', path.normalize(filePath).replace(/^(\.\.[/\\])+/, ''));
    if (filePath.startsWith(path.join(__dirname, 'public')) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(`[error] ${req.method} ${url.pathname}:`, e.message);
    send(res, 500, { error: e.message });
  }
});

// Старт с авто-подбором свободного порта — 3000/3001 часто заняты другими проектами,
// поэтому без этого `node mvp/server.js` падал бы с EADDRINUSE.
let port = Number(config.PORT) || 3000;
let triesLeft = 15;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && triesLeft > 0) {
    console.log(`[port] ${port} занят, пробую ${port + 1}…`);
    triesLeft -= 1; port += 1;
    setTimeout(() => server.listen(port), 80);
  } else {
    console.error('[fatal]', e.message);
    process.exit(1);
  }
});
server.on('listening', () => {
  console.log(`\n  ✨ Мультик MVP запущен → http://localhost:${port}\n  (останови: Ctrl+C)\n`);
});
server.listen(port);
