// 吉他曲谱库：谱存在本机 IndexedDB。
// shortcut: 整库在这个浏览器里，清站点数据会丢，换设备靠「我的」里的导出。要多设备同步再加账号。
// shortcut: iPhone Safari 没有网页分享目标，从网页收录靠复制、截图和剪贴板。正文很长时书签只带标题和链接。

const PRESET_TAGS = ['弹唱', '指弹', '独奏', '入门', '练习'];
const SEP = /\s*[\-–—_|｜－]\s*/;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function isNoiseTitle(part) {
  return /吉他谱|六线谱|和弦谱|弹唱谱|指弹谱|guitar\s*tab|ukulele/i.test(part);
}

function splitTitleArtist(value) {
  let parts = String(value || '').split(SEP).map((part) => part.trim()).filter(Boolean);
  parts = parts.filter((part, index) => index === 0 || !isNoiseTitle(part));
  if (parts.length >= 2 && parts[0].length <= 40 && parts[1].length <= 40) {
    return { title: parts[0], artist: parts[1] };
  }
  if (parts.length === 1) return { title: parts[0].slice(0, 40), artist: '' };
  return { title: String(value || '').trim().slice(0, 40), artist: '' };
}

function isChord(part) {
  return /^[A-G][#b♯♭]?(m|maj7|maj|min7|min|sus4|sus2|sus|dim|aug|add\d{1,2})?\d{0,2}(\/[A-G][#b♯♭]?)?$/.test(part);
}

function looksLikeChords(line) {
  const parts = String(line || '').trim().split(/\s+/).filter((part) => part && part !== '-' && part !== '|' && part !== '/');
  if (!parts.length) return false;
  return parts.every(isChord);
}

function looksLikeTab(line) {
  const text = String(line || '').trim();
  if (/^[eEbBgGdDaA]\s*\|/.test(text) || /^[1-6]\s*\|/.test(text)) return true;
  const pipes = text.match(/\|/g);
  return Boolean(pipes && pipes.length >= 1 && /-{2,}/.test(text) && !/[一-龥]/.test(text));
}

function safeHttpUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (err) {
    return '';
  }
  return '';
}

function cleanUrl(url) {
  const raw = String(url || '').trim().slice(0, 2000);
  if (!raw) return '';
  const direct = safeHttpUrl(raw);
  if (direct) return direct;
  if (/^[\w.-]+\.[a-z]{2,}([/:].*)?$/i.test(raw)) return safeHttpUrl('https://' + raw);
  return '';
}

function extractMeta(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return { title: '', artist: '', body: '', sourceUrl: '' };
  const lines = text.split('\n');
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;
  let title = '';
  let artist = '';
  let sourceUrl = '';
  const first = (lines[index] || '').trim();
  const second = (lines[index + 1] || '').trim();
  if (first && !looksLikeTab(first) && !looksLikeChords(first) && !/^https?:\/\//i.test(first)) {
    const labeled = first.match(/^(歌名|曲名|title)\s*[:：]\s*(.+)$/i);
    if (labeled) {
      title = labeled[2].trim();
      index += 1;
    } else {
      const split = splitTitleArtist(first);
      const secondIsBody = !second || looksLikeTab(second) || looksLikeChords(second) || /^(歌手|艺人|演唱|artist|来源|链接|url)\s*[:：]/i.test(second);
      const dashed = Boolean(split.artist) && split.title.length <= 40 && split.artist.length <= 40;
      const shortHeading = first.length <= 18 && secondIsBody;
      if (dashed || shortHeading) {
        title = split.title;
        artist = split.artist;
        index += 1;
      }
    }
  }
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    const artistMatch = line.match(/^(歌手|艺人|演唱|artist)\s*[:：]\s*(.+)$/i);
    if (artistMatch) { artist = artist || artistMatch[2].trim(); index += 1; continue; }
    const titleMatch = line.match(/^(歌名|曲名|title)\s*[:：]\s*(.+)$/i);
    if (titleMatch) { title = titleMatch[2].trim(); index += 1; continue; }
    const urlMatch = line.match(/^(来源|链接|url)\s*[:：]\s*(https?:\/\/\S+)/i);
    if (urlMatch) {
      sourceUrl = sourceUrl || urlMatch[2].replace(/[)）】\],.，。]+$/, '');
      index += 1;
      continue;
    }
    break;
  }
  const bodyLines = lines.slice(index);
  while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();
  const last = (bodyLines[bodyLines.length - 1] || '').trim();
  if (/^https?:\/\/\S+$/i.test(last)) {
    sourceUrl = sourceUrl || last.replace(/[)）】\],.，。]+$/, '');
    bodyLines.pop();
  }
  return { title, artist, body: bodyLines.join('\n').trim(), sourceUrl: cleanUrl(sourceUrl) };
}

function normalize(raw) {
  const source = raw || {};
  const tags = Array.isArray(source.tags)
    ? source.tags.map((tag) => String(tag).trim().slice(0, 16)).filter(Boolean).filter((tag, index, list) => list.indexOf(tag) === index).slice(0, 12)
    : [];
  const images = Array.isArray(source.images)
    ? source.images
      .filter((image) => image && typeof image.dataUrl === 'string' && image.dataUrl.startsWith('data:image/') && image.dataUrl.length < 3000000)
      .slice(0, 12)
      .map((image) => ({ dataUrl: image.dataUrl }))
    : [];
  return {
    id: String(source.id || ''),
    title: String(source.title || '').trim().slice(0, 80),
    artist: String(source.artist || '').trim().slice(0, 80),
    capo: String(source.capo || '').trim().slice(0, 24),
    tuning: String(source.tuning || '').trim().slice(0, 40),
    key: String(source.key || '').trim().slice(0, 24),
    difficulty: String(source.difficulty || '').trim().slice(0, 16),
    tags,
    sourceUrl: cleanUrl(source.sourceUrl),
    body: typeof source.body === 'string' ? source.body.slice(0, 500000) : '',
    images,
    createdAt: Number(source.createdAt) || Date.now(),
    updatedAt: Number(source.updatedAt) || Date.now(),
    pinned: Boolean(source.pinned),
  };
}

function draftHasContent(draft) {
  if (!draft) return false;
  return Boolean(
    String(draft.title || '').trim()
    || String(draft.artist || '').trim()
    || String(draft.body || '').trim()
    || String(draft.sourceUrl || '').trim()
    || String(draft.capo || '').trim()
    || String(draft.key || '').trim()
    || String(draft.tuning || '').trim()
    || String(draft.difficulty || '').trim()
    || (draft.tags && draft.tags.length)
    || (draft.images && draft.images.length)
  );
}

function canSave(draft) {
  return draftHasContent(draft);
}

function fallbackTitle(draft) {
  const title = String(draft.title || '').trim();
  if (title) return title.slice(0, 80);
  const heading = String(draft.body || '').split('\n').map((line) => line.trim()).filter(Boolean)
    .find((line) => !looksLikeTab(line) && !looksLikeChords(line) && line.length <= 24 && !/^https?:\/\//i.test(line));
  if (heading) return heading;
  if (draft.images && draft.images.length) return '图片谱';
  const url = cleanUrl(draft.sourceUrl);
  if (url) {
    try { return new URL(url).host; } catch (err) { /* ignore */ }
  }
  const artist = String(draft.artist || '').trim();
  if (artist) return artist.slice(0, 40);
  return '未命名';
}

function matchSheet(sheet, query) {
  const text = String(query || '').trim().toLowerCase();
  if (!text) return true;
  const tags = Array.isArray(sheet.tags) ? sheet.tags.join(' ') : '';
  const haystack = [sheet.title, sheet.artist, tags, sheet.body, sheet.key, sheet.tuning, sheet.capo, sheet.difficulty, sheet.sourceUrl]
    .map((part) => String(part || '').toLowerCase())
    .join('\n');
  return text.split(/\s+/).every((part) => haystack.includes(part));
}

function capoLabel(capo) {
  const text = String(capo || '').trim();
  if (!text || text === '0' || text === '无') return '';
  if (/^\d+$/.test(text)) return '变调夹 ' + text + ' 品';
  return text.startsWith('变调夹') ? text : '变调夹 ' + text;
}

function blankDraft() {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    artist: '',
    capo: '',
    tuning: '',
    key: '',
    difficulty: '',
    tags: [],
    sourceUrl: '',
    body: '',
    images: [],
    createdAt: now,
    updatedAt: now,
    pinned: false,
  };
}

function draftFromCapture(params) {
  const draft = blankDraft();
  const meta = extractMeta(params.get('text') || '');
  const doc = splitTitleArtist(params.get('title') || '');
  draft.title = (meta.title || doc.title || '').slice(0, 80);
  draft.artist = (meta.artist || (meta.title ? '' : doc.artist) || '').slice(0, 80);
  draft.sourceUrl = cleanUrl(params.get('url') || meta.sourceUrl || '');
  draft.body = meta.body || '';
  return draft;
}

function sampleTabLines() {
  const order = ['e', 'B', 'G', 'D', 'A', 'E'];
  const marks = {
    e: ['0', '1', '3', '5', '3', '1', '0'],
    B: ['1', '1', '1', '1', '1', '1', '1'],
    G: ['0', '0', '0', '0', '0', '0', '0'],
    D: ['2', '2', '2', '2', '2', '2', '2'],
    A: ['3', '3', '3', '3', '3', '3', '3'],
    E: [null, null, null, null, null, null, null],
  };
  return order.map((name) => name + '|' + marks[name].map((note) => (note == null ? '----' : '---' + note)).join('') + '|');
}

function selfCheck() {
  const split = splitTitleArtist('夜曲 - 周杰伦 - 吉他谱');
  assert(split.title === '夜曲' && split.artist === '周杰伦', 'split ' + JSON.stringify(split));
  const mid = splitTitleArtist('夜曲 - 吉他谱 - 周杰伦');
  assert(mid.title === '夜曲' && mid.artist === '周杰伦', 'mid noise ' + JSON.stringify(mid));

  const song = extractMeta('夜曲 - 周杰伦\n\ne|--0--|');
  assert(song.title === '夜曲' && song.artist === '周杰伦' && song.body.startsWith('e|'), 'song ' + JSON.stringify(song));
  const labeled = extractMeta('小练习\n歌手：佚名\n\n|---|');
  assert(labeled.title === '小练习' && labeled.artist === '佚名' && labeled.body.startsWith('|---'), 'labeled ' + JSON.stringify(labeled));
  const tabOnly = extractMeta('e|---0---|\nB|---1---|');
  assert(tabOnly.title === '' && tabOnly.body.includes('e|'), 'tab only');
  const lyric = extractMeta('后来我们还是没有见上一面\n第二句');
  assert(lyric.title === '' && lyric.body.startsWith('后来'), 'lyric ' + lyric.title);
  const chords = extractMeta('C G Am F\n明天见');
  assert(chords.title === '' && chords.body.startsWith('C G'), 'chords');
  const dashedChords = extractMeta('C - G - Am\n歌词');
  assert(dashedChords.title === '' && dashedChords.body.startsWith('C - G'), 'dashed chords');
  const withUrl = extractMeta('夜曲\n\ne|---|\nhttps://example.com/a');
  assert(withUrl.title === '夜曲' && withUrl.sourceUrl === 'https://example.com/a' && !withUrl.body.includes('http'), 'url ' + JSON.stringify(withUrl));
  assert(looksLikeChords('Am7 G/B Cadd9') === true, 'chord tokens');
  assert(looksLikeChords('夜曲 周杰伦') === false, 'not chords');

  const sheet = { title: '夜曲', artist: '周杰伦', tags: ['弹唱'], body: 'e|---', key: 'Am', tuning: '', capo: '', difficulty: '', sourceUrl: '' };
  assert(matchSheet(sheet, '周杰 夜') === true, 'search hit');
  assert(matchSheet(sheet, '指弹') === false, 'search miss');
  assert(matchSheet(sheet, '') === true, 'search all');
  assert(matchSheet(sheet, '弹唱') === true, 'search tag');

  assert(canSave({ title: '', artist: '', body: '', sourceUrl: '', capo: '', key: '', tuning: '', difficulty: '', tags: [], images: [] }) === false, 'empty save');
  assert(canSave({ title: '', artist: '周杰伦', body: '', tags: [], images: [], sourceUrl: '' }) === true, 'artist save');
  assert(fallbackTitle({ title: ' 夜曲 ', body: '', images: [] }) === '夜曲', 'fallback title');
  assert(fallbackTitle({ title: '', body: 'e|---|\nB|---|', images: [] }) === '未命名', 'fallback tab');
  assert(fallbackTitle({ title: '', body: '', images: [{}], sourceUrl: '' }) === '图片谱', 'fallback image');
  assert(fallbackTitle({ title: '', body: '小标题\n\ne|---', images: [] }) === '小标题', 'fallback heading');
  assert(capoLabel('2') === '变调夹 2 品', 'capo num');
  assert(capoLabel('0') === '', 'capo zero');
  assert(capoLabel('1品') === '变调夹 1品', 'capo text');
  assert(capoLabel('变调夹三品') === '变调夹三品', 'capo ready');
  assert(cleanUrl('javascript:alert(1)') === '', 'block js url');
  assert(cleanUrl('https://example.com/a') === 'https://example.com/a', 'keep https');
  assert(cleanUrl('example.com/song') === 'https://example.com/song', 'bare host');

  const normalized = normalize({
    id: 'abc12345',
    title: 'A',
    sourceUrl: 'javascript:alert(1)',
    images: [{ dataUrl: 'data:text/html,hi' }, { dataUrl: 'data:image/png;base64,aaaa' }],
    tags: [' 弹唱 ', '弹唱'],
    body: 'x',
  });
  assert(normalized.sourceUrl === '' && normalized.images.length === 1 && normalized.tags.length === 1, 'normalize dirty');
  const emptyNorm = normalize({ id: 'abc12345' });
  assert(emptyNorm.title === '' && emptyNorm.images.length === 0 && emptyNorm.tags.length === 0, 'normalize empty');

  const captured = draftFromCapture(new URLSearchParams(
    'title=' + encodeURIComponent('夜曲 - 周杰伦 - 吉他谱')
    + '&text=' + encodeURIComponent('e|---0---|\n')
    + '&url=' + encodeURIComponent('https://example.com/n')
  ));
  assert(captured.title === '夜曲' && captured.artist === '周杰伦' && captured.body.startsWith('e|'), 'capture ' + JSON.stringify(captured));
  assert(captured.sourceUrl.startsWith('https://example.com/'), 'capture url');

  const lines = sampleTabLines();
  assert(lines.every((line) => line.length === lines[0].length), 'tab align ' + lines.map((line) => line.length).join(','));
  assert(lines[0].includes('0') && lines[0].includes('5'), 'tab notes');
}

const state = {
  sheets: [],
  dbError: false,
  query: '',
  tag: '',
  draft: null,
  draftLock: null,
  baseUpdatedAt: 0,
  dirty: false,
  saving: false,
  pendingCapture: null,
  resumed: false,
  toastAfter: '',
};

let persistTimer = 0;
let navQueued = false;
let dbPromise = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('guitar-tabs', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('sheets')) db.createObjectStore('sheets', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function database() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function dbAll() {
  return database().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction('sheets', 'readonly').objectStore('sheets').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  }));
}

function dbPut(sheet) {
  return database().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('sheets', 'readwrite');
    tx.objectStore('sheets').put(sheet);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('abort'));
  }));
}

function dbDel(id) {
  return database().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('sheets', 'readwrite');
    tx.objectStore('sheets').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function sessionKey(id) {
  return 'guitar-draft:' + id;
}

function writeSession(draft, baseUpdatedAt) {
  const key = sessionKey(draft.id);
  const save = (obj) => sessionStorage.setItem(key, JSON.stringify({ baseUpdatedAt, draft: obj }));
  try {
    const json = JSON.stringify({ baseUpdatedAt, draft });
    if (json.length > 4500000) {
      save({ ...draft, images: [] });
      toast('图片太大，草稿里暂时没记住图片。请先保存到曲库。');
      return;
    }
    sessionStorage.setItem(key, json);
  } catch (err) {
    try {
      save({ ...draft, images: [] });
      toast('草稿空间不够，图片要先保存进曲库才不会丢。');
    } catch (inner) { /* 隐私模式可能没有 sessionStorage */ }
  }
}

function readSession(id) {
  if (!id) return null;
  try {
    const data = JSON.parse(sessionStorage.getItem(sessionKey(id)) || 'null');
    if (!data || !data.draft || data.draft.id !== id) return null;
    data.draft = normalize(data.draft);
    data.draft.id = id;
    data.baseUpdatedAt = Number(data.baseUpdatedAt) || 0;
    return data;
  } catch (err) {
    return null;
  }
}

function flushDraft() {
  clearTimeout(persistTimer);
  if (state.draft && state.dirty) writeSession(state.draft, state.baseUpdatedAt || 0);
}

function markDirty() {
  state.dirty = true;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (state.draft && state.dirty) writeSession(state.draft, state.baseUpdatedAt || 0);
  }, 250);
}

function consumeCapture() {
  const params = new URLSearchParams(location.search);
  if (!['capture', 'title', 'text', 'url'].some((key) => params.has(key))) return;
  const draft = draftFromCapture(params);
  state.pendingCapture = draft;
  try {
    const old = sessionStorage.getItem('guitar-new-id');
    if (old && old !== draft.id) sessionStorage.removeItem(sessionKey(old));
    sessionStorage.setItem('guitar-new-id', draft.id);
    writeSession(draft, 0);
  } catch (err) { /* 这次打开仍用内存里的收录 */ }
  if (params.get('clipped') === '1') state.toastAfter = '正文比较长，如果谱面是空的，点「从剪贴板填入」。';
  history.replaceState(null, '', location.pathname + '#/edit');
}

function loadDraft(id) {
  if (!id) {
    if (state.pendingCapture) {
      const draft = state.pendingCapture;
      state.pendingCapture = null;
      return { draft, baseUpdatedAt: 0, resumed: false };
    }
    let session = null;
    try { session = readSession(sessionStorage.getItem('guitar-new-id')); } catch (err) { session = null; }
    if (session && draftHasContent(session.draft)) return { draft: session.draft, baseUpdatedAt: 0, resumed: true };
    const fresh = blankDraft();
    try { sessionStorage.setItem('guitar-new-id', fresh.id); } catch (err) { /* ignore */ }
    return { draft: fresh, baseUpdatedAt: 0, resumed: false };
  }
  const sheet = state.sheets.find((item) => item.id === id);
  if (!sheet) return null;
  const session = readSession(id);
  if (session && session.baseUpdatedAt === sheet.updatedAt && draftHasContent(session.draft)) {
    return { draft: session.draft, baseUpdatedAt: session.baseUpdatedAt, resumed: true };
  }
  return { draft: clone(normalize(sheet)), baseUpdatedAt: sheet.updatedAt, resumed: false };
}

function prepareDraft(id) {
  const lock = id || 'new';
  if (state.draft && state.draftLock === lock) return true;
  const loaded = loadDraft(id);
  if (!loaded) return false;
  state.draft = loaded.draft;
  state.baseUpdatedAt = loaded.baseUpdatedAt;
  state.draftLock = lock;
  state.resumed = Boolean(loaded.resumed);
  return true;
}

function clone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function parseRoute() {
  const parts = location.hash.replace(/^#/, '').split('/').filter(Boolean);
  if (parts[0] === 'sheet' && parts[1]) return { name: 'detail', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'edit') return { name: 'edit', id: parts[1] ? decodeURIComponent(parts[1]) : '' };
  if (parts[0] === 'me') return { name: 'me' };
  return { name: 'library' };
}

function currentHash() {
  const hash = location.hash || '#/';
  if (hash === '#' || hash === '#/') return '#/';
  return hash;
}

function confirmLeave() {
  if (!state.dirty) return true;
  const editingExisting = state.draft && state.sheets.some((sheet) => sheet.id === state.draft.id);
  const message = editingExisting
    ? '还没保存。下次再编辑这首会接着写。仍要离开？'
    : '还没保存。下次点「收录」会接着写。仍要离开？';
  return confirm(message);
}

function leave(hash, opts) {
  const options = opts || {};
  const dest = hash || '#/';
  if (!options.replace && currentHash() === dest) return;
  if (!options.skipConfirm && !confirmLeave()) return;
  flushDraft();
  state.dirty = false;
  state.draftLock = null;
  history[options.replace ? 'replaceState' : 'pushState'](null, '', dest);
  render();
}

function onNav() {
  if (navQueued) return;
  navQueued = true;
  requestAnimationFrame(() => {
    navQueued = false;
    flushDraft();
    state.dirty = false;
    state.draftLock = null;
    render();
  });
}

function toast(message) {
  if (!document.body) return;
  document.querySelector('.toast')?.remove();
  const node = h('div', { class: 'toast', text: message });
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}

function h(tag, props, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'value' && 'value' in node) node.value = String(value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

function icon(name) {
  const paths = {
    note: '<circle cx="8" cy="16.5" r="2.4"/><path d="M10.4 16.5V5.5l8.2-1.6"/>',
    sheet: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="9" r="3"/><path d="M6 19c1.2-2.8 10.8-2.8 12 0"/>',
  };
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
  return wrap.firstChild;
}

function ago(timestamp) {
  const minutes = Math.floor(Math.max(0, Date.now() - timestamp) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return minutes + ' 分钟前';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + ' 小时前';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + ' 天前';
  const date = new Date(timestamp);
  return date.getFullYear() + '.' + (date.getMonth() + 1) + '.' + date.getDate();
}

function snippet(sheet) {
  const line = String(sheet.body || '').split('\n').map((item) => item.trim()).find(Boolean);
  if (line) return line.length > 60 ? line.slice(0, 60) + '…' : line;
  if (sheet.images && sheet.images.length) return '图片谱 · ' + sheet.images.length + ' 张';
  if (sheet.sourceUrl) return sheet.sourceUrl;
  return '还没有谱面';
}

function metaLine(sheet) {
  return [sheet.artist, capoLabel(sheet.capo), sheet.key, ago(sheet.updatedAt)].filter(Boolean).join(' · ');
}

function visibleSheets() {
  return state.sheets
    .filter((sheet) => matchSheet(sheet, state.query) && (!state.tag || (sheet.tags || []).includes(state.tag)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}

function tagsInLibrary() {
  const set = new Set();
  for (const sheet of state.sheets) for (const tag of sheet.tags || []) set.add(tag);
  return [...set];
}

function tabFont() {
  const size = Number(localStorage.getItem('guitar-tab-font'));
  return size >= 12 && size <= 22 ? size : 15;
}

function applyTabFont(size) {
  const next = Math.min(22, Math.max(12, Number(size) || 15));
  localStorage.setItem('guitar-tab-font', String(next));
  document.documentElement.style.setProperty('--tab-size', next + 'px');
  return next;
}

function bumpFont(delta, pre, label) {
  const next = applyTabFont(tabFont() + delta);
  if (pre) pre.style.fontSize = next + 'px';
  if (label) label.textContent = next + 'px';
}

function copyText(text, okMsg) {
  const ok = () => toast(okMsg || '已复制');
  const fail = () => toast('没复制成，请长按文字手动复制');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(String(text)).then(ok).catch(fail);
    return;
  }
  fail();
}

function appBase() {
  const url = new URL(location.href);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/index\.html$/, '');
  return url.href;
}

function bookmarkletHref() {
  const code = [
    '(function(){',
    'var s="";',
    'try{s=String(getSelection())}catch(e){}',
    'var clipped="";',
    'var enc="";',
    'try{enc=encodeURIComponent(s)}catch(e){}',
    'if(enc.length>1800){',
    'try{navigator.clipboard.writeText(s);clipped="1"}catch(e){}',
    's=clipped?"":s.slice(0,400);',
    '}',
    'location.href=', JSON.stringify(appBase()),
    '+ "?capture=1&clipped="+clipped',
    '+ "&title="+encodeURIComponent(document.title||"")',
    '+ "&url="+encodeURIComponent(location.href)',
    '+ "&text="+encodeURIComponent(s);',
    '})();',
  ].join('');
  return 'javascript:' + code;
}

function hostOf(url) {
  try { return new URL(url).host; } catch (err) { return ''; }
}

function openLightbox(src) {
  if (!String(src).startsWith('data:image/')) return;
  const box = h('div', { class: 'lightbox', role: 'dialog' },
    h('button', { type: 'button', class: 'lightbox-close', text: '关闭', onClick: () => close() }),
    h('img', { src, alt: '曲谱图片' })
  );
  function close() {
    box.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(event) {
    if (event.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(box);
}

function render() {
  const route = parseRoute();
  if (route.name !== 'edit') state.draftLock = null;
  document.querySelectorAll('.lightbox').forEach((node) => node.remove());
  const titles = { library: '曲谱库', edit: '收录 · 曲谱库', me: '我的 · 曲谱库' };
  if (route.name === 'detail') {
    const sheet = state.sheets.find((item) => item.id === route.id);
    document.title = (sheet && sheet.title ? sheet.title : '曲谱') + ' · 曲谱库';
  } else document.title = titles[route.name] || '曲谱库';
  const app = document.getElementById('app');
  const parts = [];
  if (state.dbError) {
    parts.push(h('p', { class: 'warn banner', text: '这个浏览器没打开本地数据库，谱存不住。请用 Safari 或 Chrome 的普通窗口，不要用无痕模式。' }));
  }
  if (route.name === 'library') parts.push(viewLibrary());
  else if (route.name === 'detail') parts.push(viewDetail(route.id));
  else if (route.name === 'edit') parts.push(viewEdit(route.id));
  else parts.push(viewMe());
  parts.push(nav(route.name));
  app.replaceChildren(...parts);
}

function nav(name) {
  const items = [
    ['library', '曲库', 'sheet', '#/'],
    ['edit', '收录', 'plus', '#/edit'],
    ['me', '我的', 'user', '#/me'],
  ];
  return h('nav', { class: 'nav' }, ...items.map(([id, label, glyph, hash]) => {
    const on = (id === 'library' && (name === 'library' || name === 'detail')) || name === id;
    return h('button', {
      type: 'button',
      class: on ? 'on' : '',
      'aria-current': on ? 'page' : null,
      onClick: () => leave(hash),
    }, icon(glyph), h('span', { text: label }));
  }));
}

function viewLibrary() {
  const tags = tagsInLibrary();
  if (state.tag && !tags.includes(state.tag)) state.tag = '';
  const list = h('div', { class: 'list' });
  const count = h('p', { class: 'count' });
  let clearBtn;
  const search = h('input', {
    type: 'search',
    class: 'search',
    placeholder: '搜索歌名、歌手',
    'aria-label': '搜索曲库',
    autocomplete: 'off',
    value: state.query,
    onInput: (event) => {
      state.query = event.target.value;
      clearBtn.hidden = !state.query;
      paint();
    },
  });
  clearBtn = h('button', {
    type: 'button',
    class: 'clear',
    text: '清除',
    hidden: !state.query,
    'aria-label': '清除搜索',
    onClick: () => {
      state.query = '';
      search.value = '';
      clearBtn.hidden = true;
      paint();
      search.focus();
    },
  });
  function paint() {
    const rows = visibleSheets();
    count.textContent = state.query || state.tag ? rows.length + ' / ' + state.sheets.length + ' 首' : state.sheets.length + ' 首';
    if (!state.sheets.length) {
      list.replaceChildren(h('div', { class: 'empty' },
        h('h2', { text: '曲库是空的' }),
        h('p', { class: 'lead', text: '谱存在这台手机的浏览器里，不上传。从网页复制六线谱，或存一张谱的截图，点「收录」贴进来。' }),
        h('div', { class: 'stack' },
          h('button', { type: 'button', class: 'btn primary', text: '收录第一首', onClick: () => leave('#/edit') }),
          h('button', { type: 'button', class: 'btn ghost', text: '放一首示例看看排版', onClick: () => addSample() })
        )
      ));
      return;
    }
    if (!rows.length) {
      list.replaceChildren(h('p', { class: 'none', text: '没有符合的曲谱。' }));
      return;
    }
    list.replaceChildren(...rows.map((sheet) => h('button', {
      type: 'button',
      class: 'card',
      onClick: () => leave('#/sheet/' + encodeURIComponent(sheet.id)),
    },
      h('div', { class: 'card-top' },
        h('strong', {}, sheet.pinned ? h('span', { class: 'pin', text: '顶' }) : null, sheet.title || '未命名'),
        sheet.difficulty ? h('em', { text: sheet.difficulty }) : null
      ),
      h('div', { class: 'meta', text: metaLine(sheet) }),
      h('div', { class: 'snippet', text: snippet(sheet) })
    )));
  }
  paint();
  const chips = tags.length ? h('div', { class: 'chips' },
    h('button', {
      type: 'button',
      class: state.tag ? 'chip' : 'chip on',
      text: '全部',
      onClick: () => { if (!state.tag) return; state.tag = ''; render(); },
    }),
    ...tags.map((tag) => h('button', {
      type: 'button',
      class: state.tag === tag ? 'chip on' : 'chip',
      text: tag,
      onClick: () => { if (state.tag === tag) return; state.tag = tag; render(); },
    }))
  ) : null;
  return h('main', { class: 'screen' },
    h('div', { class: 'page' },
      h('header', { class: 'mast' },
        h('div', { class: 'brandline' },
          icon('note'),
          h('div', {}, h('p', { class: 'eyebrow', text: '吉他' }), h('h1', { text: '曲谱库' }))
        ),
        count
      ),
      h('div', { class: 'searchwrap' }, search, clearBtn),
      chips,
      list
    )
  );
}

function viewMissing() {
  return h('main', { class: 'screen' },
    h('div', { class: 'page' },
      h('h1', { text: '这首不在曲库里' }),
      h('p', { class: 'lead', text: '可能已经删了。' }),
      h('button', { type: 'button', class: 'btn primary', text: '回曲库', onClick: () => leave('#/', { skipConfirm: true }) })
    )
  );
}

function viewDetail(id) {
  const sheet = state.sheets.find((item) => item.id === id);
  if (!sheet) return viewMissing();
  const href = safeHttpUrl(sheet.sourceUrl);
  const bits = [sheet.difficulty, capoLabel(sheet.capo), sheet.key, sheet.tuning, ...(sheet.tags || [])].filter(Boolean);
  const hint = h('p', { class: 'hint fine', hidden: true, text: '谱比较宽，左右滑动看完。' });
  const pre = sheet.body ? h('pre', { class: 'tabtext', text: sheet.body }) : null;
  if (pre) pre.style.fontSize = tabFont() + 'px';
  const fontLabel = h('span', { class: 'fine', text: tabFont() + 'px' });
  if (pre) {
    requestAnimationFrame(() => {
      if (pre.isConnected && pre.scrollWidth > pre.clientWidth + 8) hint.hidden = false;
    });
  }
  return h('main', { class: 'screen' },
    h('div', { class: 'topbar' },
      h('button', { type: 'button', class: 'textbtn', text: '返回', onClick: () => leave('#/') }),
      h('span', { class: 'topbar-title', text: '曲谱' }),
      h('button', { type: 'button', class: 'textbtn strong', text: '编辑', onClick: () => leave('#/edit/' + encodeURIComponent(sheet.id)) })
    ),
    h('article', { class: 'page' },
      h('h1', { class: 'song', text: sheet.title || '未命名' }),
      sheet.artist ? h('p', { class: 'artist', text: sheet.artist }) : null,
      bits.length ? h('div', { class: 'chips' }, ...bits.map((bit) => h('span', { class: 'chip static', text: bit }))) : null,
      sheet.images.length ? h('div', { class: 'photos' }, ...sheet.images.map((image, index) => h('img', {
        src: image.dataUrl,
        alt: '曲谱图片 ' + (index + 1),
        onClick: () => openLightbox(image.dataUrl),
      }))) : null,
      pre ? h('div', { class: 'sheet' }, pre) : null,
      pre ? h('div', { class: 'fontbar' },
        h('span', { class: 'fine', text: '字号' }),
        h('button', { type: 'button', class: 'btn ghost tiny', text: 'A-', onClick: () => bumpFont(-1, pre, fontLabel) }),
        fontLabel,
        h('button', { type: 'button', class: 'btn ghost tiny', text: 'A+', onClick: () => bumpFont(1, pre, fontLabel) }),
        h('button', { type: 'button', class: 'btn ghost tiny', text: '复制谱面', onClick: () => copyText(sheet.body, '谱面已复制') })
      ) : null,
      hint,
      href ? h('p', {}, h('a', { href, target: '_blank', rel: 'noopener noreferrer', text: '查看来源 · ' + (hostOf(href) || href) })) : null,
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn ghost', text: sheet.pinned ? '取消置顶' : '置顶', onClick: () => togglePin(sheet.id) }),
        h('button', { type: 'button', class: 'btn danger', text: '删除', onClick: () => deleteSheet(sheet.id) })
      )
    )
  );
}

function textField(label, field, placeholder) {
  return h('label', { class: 'field' },
    h('span', { text: label }),
    h('input', {
      type: 'text',
      value: state.draft[field] || '',
      placeholder: placeholder || '',
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      'data-field': field,
      onInput: (event) => {
        state.draft[field] = event.target.value;
        markDirty();
      },
    })
  );
}

function viewEdit(id) {
  if (!prepareDraft(id)) return viewMissing();
  const draft = state.draft;
  const difficulties = ['', '入门', '进阶', '困难'];
  if (draft.difficulty && !difficulties.includes(draft.difficulty)) difficulties.push(draft.difficulty);
  const file = h('input', {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    hidden: true,
    onChange: async (event) => {
      const files = [...event.target.files];
      event.target.value = '';
      for (const item of files) await addImageFile(item);
    },
  });
  const choices = [];
  const seen = new Set();
  for (const tag of [...PRESET_TAGS, ...draft.tags, ...tagsInLibrary()]) {
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    choices.push(tag);
  }
  const screen = h('main', {
    class: 'screen',
    onPaste: onPaste,
    onDragover: (event) => { event.preventDefault(); event.currentTarget.classList.add('drag'); },
    onDragleave: (event) => event.currentTarget.classList.remove('drag'),
    onDrop: onDrop,
  },
    h('div', { class: 'topbar' },
      h('button', { type: 'button', class: 'textbtn', text: '取消', onClick: () => cancelEdit() }),
      h('h1', { class: 'topbar-title', text: '收录' }),
      h('button', { type: 'button', class: 'textbtn strong', 'data-save': '1', text: '保存', onClick: () => saveDraft() })
    ),
    h('div', { class: 'page' },
      state.resumed ? h('p', { class: 'notice', text: id ? '接着上次没保存的修改写。' : '接着上次没保存的收录写。' }) : null,
      h('p', { class: 'lead', text: '在这一页直接粘贴。文字进谱面，截图进附图。也可以把图片拖进来。' }),
      h('button', { type: 'button', class: 'btn ghost', text: '从剪贴板填入', onClick: () => fillFromClipboard() }),
      textField('歌名', 'title', '例如：夜曲'),
      textField('歌手', 'artist', ''),
      h('div', { class: 'grid3' },
        textField('变调夹', 'capo', '2'),
        textField('调', 'key', 'Am'),
        textField('定弦', 'tuning', 'EADGBE')
      ),
      h('label', { class: 'field' },
        h('span', { text: '难度' }),
        h('select', { onChange: (event) => { state.draft.difficulty = event.target.value; markDirty(); } },
          ...difficulties.map((option) => h('option', { value: option, text: option || '不标', selected: option === (draft.difficulty || '') }))
        )
      ),
      h('div', { class: 'field' },
        h('span', { text: '标签' }),
        h('div', { class: 'tagbox' },
          ...choices.map((tag) => h('button', {
            type: 'button',
            class: draft.tags.includes(tag) ? 'chip on' : 'chip',
            text: tag,
            onClick: () => toggleTag(tag),
          })),
          h('input', {
            class: 'tag-input',
            placeholder: '新标签',
            maxlength: '16',
            autocomplete: 'off',
            onKeydown: (event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const value = event.target.value;
              event.target.value = '';
              addTag(value);
            },
          })
        )
      ),
      textField('来源链接', 'sourceUrl', 'https://'),
      h('label', { class: 'field' },
        h('span', { text: '谱面' }),
        h('textarea', {
          class: 'tabinput',
          'data-field': 'body',
          placeholder: '把六线谱或和弦贴在这里，例如：\n\ne|---0---3---5---|\nB|---1---1---1---|\nG|---0---0---0---|\nD|---2---2---2---|\nA|---3---3---3---|\nE|---------------|',
          spellcheck: 'false',
          autocapitalize: 'off',
          autocorrect: 'off',
          value: draft.body || '',
          onInput: (event) => { state.draft.body = event.target.value; markDirty(); },
        })
      ),
      h('div', { class: 'field' },
        h('span', { text: '图片' }),
        draft.images.length ? h('div', { class: 'thumbs' }, ...draft.images.map((image, index) => h('figure', {},
          h('img', { src: image.dataUrl, alt: '附图 ' + (index + 1) }),
          h('button', { type: 'button', class: 'x', text: '去掉', onClick: () => removeImage(index) })
        ))) : null,
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn ghost', text: '添加图片', onClick: () => file.click() }),
          h('button', {
            type: 'button',
            class: draft.pinned ? 'chip on' : 'chip',
            text: draft.pinned ? '已置顶' : '置顶',
            onClick: () => { state.draft.pinned = !state.draft.pinned; markDirty(); render(); },
          }),
          h('button', { type: 'button', class: 'btn danger', text: '清空', onClick: () => resetDraft() })
        ),
        file
      )
    )
  );
  if (!draft.title) {
    const titleInput = screen.querySelector('[data-field="title"]');
    if (titleInput) titleInput.autofocus = true;
  }
  return screen;
}

function cancelEdit() {
  const id = state.draft && state.sheets.some((sheet) => sheet.id === state.draft.id) ? state.draft.id : '';
  leave(id ? '#/sheet/' + encodeURIComponent(id) : '#/');
}

function resetDraft() {
  if (draftHasContent(state.draft) && !confirm('清空这次编写的内容？')) return;
  if (state.draft) {
    try {
      sessionStorage.removeItem(sessionKey(state.draft.id));
      if (sessionStorage.getItem('guitar-new-id') === state.draft.id) sessionStorage.removeItem('guitar-new-id');
    } catch (err) { /* ignore */ }
  }
  state.draft = null;
  state.draftLock = null;
  state.dirty = false;
  state.resumed = false;
  render();
}

function toggleTag(tag) {
  const tags = state.draft.tags;
  const index = tags.indexOf(tag);
  if (index >= 0) tags.splice(index, 1);
  else if (tags.length >= 12) { toast('标签最多 12 个'); return; }
  else tags.push(tag);
  markDirty();
  render();
}

function addTag(raw) {
  const tag = String(raw || '').trim().slice(0, 16);
  if (!tag) return;
  if (!state.draft.tags.includes(tag)) {
    if (state.draft.tags.length >= 12) { toast('标签最多 12 个'); return; }
    state.draft.tags.push(tag);
  }
  markDirty();
  render();
}

function applyPastedText(text) {
  const draft = state.draft;
  const meta = extractMeta(text);
  if (!draft.title.trim() && meta.title) draft.title = meta.title;
  if (!draft.artist.trim() && meta.artist) draft.artist = meta.artist;
  if (!draft.sourceUrl.trim() && meta.sourceUrl) draft.sourceUrl = meta.sourceUrl;
  let chunk = String(text || '').trim();
  if (!draft.body.trim() && (meta.title || meta.artist || meta.sourceUrl)) chunk = meta.body;
  if (chunk) draft.body = draft.body.trim() ? draft.body.replace(/\s*$/, '') + '\n\n' + chunk : chunk;
  markDirty();
  flushDraft();
  render();
}

async function fillFromClipboard() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch (err) {
    toast('读不了剪贴板。点进谱面框，长按粘贴。');
    const area = document.querySelector('[data-field="body"]');
    if (area) area.focus();
    return;
  }
  if (!text.trim()) {
    toast('剪贴板里没有文字。图片请在这一页直接粘贴，或点添加图片。');
    return;
  }
  applyPastedText(text);
}

function onPaste(event) {
  const data = event.clipboardData;
  if (!data) return;
  const images = [...data.items].filter((item) => item.type.startsWith('image/'));
  if (images.length) {
    event.preventDefault();
    for (const item of images) addImageFile(item.getAsFile());
    return;
  }
  const target = event.target;
  const isBody = target && target.dataset && target.dataset.field === 'body';
  if (isBody && !state.draft.body && !target.value) {
    const text = data.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    applyPastedText(text);
  }
}

async function onDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag');
  const files = [...(event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files : [])];
  if (!files.length) {
    const text = event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
    if (text) applyPastedText(text);
    return;
  }
  for (const file of files) {
    if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(file.name)) {
      await addImageFile(file);
      continue;
    }
    if (file.type.startsWith('text/') || /\.(txt|tab|md)$/i.test(file.name)) applyPastedText(await file.text());
  }
}

async function addImageFile(file) {
  if (!file || !state.draft) return;
  if (state.draft.images.length >= 12) {
    toast('一张谱最多 12 张图');
    return;
  }
  try {
    state.draft.images.push(await fileToImage(file));
    markDirty();
    flushDraft();
    render();
  } catch (err) {
    toast('这张图读不了。换 jpg、png，或重新截一张图。');
  }
}

function removeImage(index) {
  state.draft.images.splice(index, 1);
  markDirty();
  flushDraft();
  render();
}

async function fileToImage(file) {
  if (file.type && !file.type.startsWith('image/')) throw new Error('type');
  const bitmap = await createImageBitmap(file);
  try {
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = 0.82;
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('blob');
    while (blob.size > 1400000 && quality > 0.5) {
      quality -= 0.12;
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    }
    if (!blob || blob.size > 2200000) throw new Error('big');
    return { dataUrl: await blobToDataUrl(blob) };
  } finally {
    if (bitmap.close) bitmap.close();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function saveDraft() {
  const draft = state.draft;
  if (!draft || state.saving) return;
  if (!canSave(draft)) {
    toast('至少写歌名、贴一段谱、放一张图，或填一个链接');
    return;
  }
  const cleanedUrl = cleanUrl(draft.sourceUrl);
  let note = '已放进曲库';
  if (String(draft.sourceUrl || '').trim() && !cleanedUrl) note = '已保存。来源不是网址，链接被丢掉了';
  draft.sourceUrl = cleanedUrl;
  draft.title = fallbackTitle(draft);
  draft.artist = draft.artist.trim();
  draft.capo = draft.capo.trim();
  draft.key = draft.key.trim();
  draft.tuning = draft.tuning.trim();
  draft.updatedAt = Date.now();
  state.saving = true;
  const button = document.querySelector('[data-save]');
  if (button) button.textContent = '保存中…';
  const stored = normalize(draft);
  try {
    await dbPut(stored);
  } catch (err) {
    state.saving = false;
    if (button) button.textContent = '保存';
    toast('没保存成。可能是空间满了，删几张图，或先到「我的」导出备份。');
    return;
  }
  state.saving = false;
  const index = state.sheets.findIndex((sheet) => sheet.id === stored.id);
  if (index >= 0) state.sheets[index] = stored;
  else state.sheets.push(stored);
  try {
    sessionStorage.removeItem(sessionKey(stored.id));
    if (sessionStorage.getItem('guitar-new-id') === stored.id) sessionStorage.removeItem('guitar-new-id');
  } catch (err) { /* ignore */ }
  state.dirty = false;
  state.draft = stored;
  toast(note);
  leave('#/sheet/' + encodeURIComponent(stored.id), { replace: true, skipConfirm: true });
}

async function togglePin(id) {
  const index = state.sheets.findIndex((sheet) => sheet.id === id);
  if (index < 0) return;
  const stored = normalize({ ...state.sheets[index], pinned: !state.sheets[index].pinned });
  try {
    await dbPut(stored);
  } catch (err) {
    toast('没改成');
    return;
  }
  state.sheets[index] = stored;
  render();
}

async function deleteSheet(id) {
  const sheet = state.sheets.find((item) => item.id === id);
  if (!sheet) return;
  if (!confirm('删除「' + (sheet.title || '未命名') + '」？本地没有回收站，除非你有备份。')) return;
  try {
    await dbDel(id);
  } catch (err) {
    toast('没删掉');
    return;
  }
  state.sheets = state.sheets.filter((item) => item.id !== id);
  try { sessionStorage.removeItem(sessionKey(id)); } catch (err) { /* ignore */ }
  toast('已删除');
  leave('#/', { replace: true, skipConfirm: true });
}

async function addSample() {
  if (state.dbError) { toast('现在存不住'); return; }
  const now = Date.now();
  const sheet = normalize({
    id: uid(),
    title: 'C 大调爬格子',
    artist: '练习',
    capo: '',
    tuning: 'EADGBE',
    key: 'C',
    difficulty: '入门',
    tags: ['练习', '入门'],
    sourceUrl: '',
    body: ['示例。慢速从左弹到右，再弹回来。', '', ...sampleTabLines()].join('\n'),
    images: [],
    createdAt: now,
    updatedAt: now,
    pinned: false,
  });
  try {
    await dbPut(sheet);
  } catch (err) {
    toast('没放进去');
    return;
  }
  state.sheets.push(sheet);
  leave('#/sheet/' + encodeURIComponent(sheet.id), { skipConfirm: true });
}

function estimateChars(sheets) {
  let total = 0;
  for (const sheet of sheets) {
    total += String(sheet.body || '').length + String(sheet.title || '').length;
    for (const image of sheet.images || []) total += String(image.dataUrl || '').length;
  }
  return total;
}

function sizeLabel(sheets) {
  const chars = estimateChars(sheets);
  if (chars < 100000) return Math.max(1, Math.round(chars / 1000)) + ' KB';
  return (chars / 1e6).toFixed(1) + ' MB';
}

function exportBackup() {
  if (!state.sheets.length) { toast('曲库是空的'); return; }
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), sheets: state.sheets })], { type: 'application/json' });
  const link = h('a', { href: URL.createObjectURL(blob), download: '吉他谱库-' + new Date().toISOString().slice(0, 10) + '.json' });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}

async function onImportFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 80 * 1024 * 1024) {
    toast('备份超过 80MB，先删掉一些图片再导入');
    return;
  }
  if (!confirm('导入会并进现在的曲库。编号相同的会覆盖，歌名相同但编号不同的会变成两首。')) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (err) {
    toast('这个文件不是曲谱库的备份');
    return;
  }
  if (!data || !Array.isArray(data.sheets)) {
    toast('这个文件不是曲谱库的备份');
    return;
  }
  let saved = 0;
  let skipped = 0;
  for (const raw of data.sheets) {
    if (!raw || typeof raw.id !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(raw.id)) {
      skipped += 1;
      continue;
    }
    try {
      const sheet = normalize(raw);
      sheet.id = raw.id;
      await dbPut(sheet);
      const index = state.sheets.findIndex((item) => item.id === sheet.id);
      if (index >= 0) state.sheets[index] = sheet;
      else state.sheets.push(sheet);
      saved += 1;
    } catch (err) {
      skipped += 1;
    }
  }
  toast(skipped ? '导入了 ' + saved + ' 首，跳过 ' + skipped + ' 条' : '导入了 ' + saved + ' 首');
  render();
}

function viewMe() {
  const mb = sizeLabel(state.sheets);
  const importer = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onChange: onImportFile });
  const base = appBase();
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  return h('main', { class: 'screen' },
    h('div', { class: 'page' },
      h('p', { class: 'eyebrow', text: '这台设备' }),
      h('h1', { text: '我的' }),
      h('p', { class: 'lead', text: state.sheets.length + ' 首，大约 ' + mb + '。谱存在这个浏览器里，不上传。' }),
      h('p', { class: 'warn', text: '清除网站数据、换浏览器或无痕窗口，曲库会丢。换手机前先导出备份。' }),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', text: '导出备份', onClick: exportBackup }),
        h('button', { type: 'button', class: 'btn ghost', text: '导入备份', onClick: () => importer.click() })
      ),
      importer,
      h('details', {},
        h('summary', { text: '从网页收录' }),
        h('ol', {},
          h('li', { text: '在曲谱网页上选中谱子，复制。' }),
          h('li', { text: '回到曲谱库，点下方「收录」。' }),
          h('li', { text: '点「从剪贴板填入」。截图用「添加图片」，或在收录页直接粘贴。' })
        ),
        h('p', { text: '电脑浏览器可以把「收录到曲谱库」拖到书签栏。在网页上选中谱，再点这个书签。iPhone 的 Safari 通常不允许这种书签。' }),
        h('p', {}, h('a', {
          class: 'bookmark',
          href: bookmarkletHref(),
          text: '收录到曲谱库',
          onClick: (event) => { event.preventDefault(); toast('不要在这里点。把「收录到曲谱库」拖到浏览器书签栏。'); },
        })),
        h('p', {}, h('button', { type: 'button', class: 'btn ghost tiny', text: '复制书签代码', onClick: () => copyText(bookmarkletHref(), '书签代码已复制') })),
        h('p', { class: 'fine', text: '快捷指令可以更接近一键收录：共享 Safari 网页时，把正文拷进剪贴板，再打开下面的地址，把标题和链接填进去。进来后点「从剪贴板填入」。' }),
        h('code', { class: 'urlbox', text: base + '?capture=1&title=标题&url=网页链接' })
      ),
      h('details', {},
        h('summary', { text: '放到 iPhone 主屏幕' }),
        h('ol', {},
          h('li', { text: '用 Safari 打开下面的地址，不要用微信里的浏览器。' }),
          h('li', { text: '点分享，添加到主屏幕。之后像一个小程序，点图标就开。' }),
          h('li', { text: local ? '手机和正在运行「启动」的电脑要在同一个 Wi-Fi。防火墙若询问，选允许。' : '这个地址用流量也能开，不用开着电脑。加到主屏幕后，没网时也能看已经收进来的谱。' })
        ),
        local ? h('p', { class: 'fine', text: '你现在开的是电脑本机地址，手机打不开。把 127.0.0.1 换成电脑的局域网 IP，端口不变。双击「启动.bat」时，黑窗口里会列出可以试的地址。' }) : null,
        h('code', { class: 'urlbox', text: base }),
        h('button', { type: 'button', class: 'btn ghost tiny', text: '复制地址', onClick: () => copyText(base, '地址已复制') })
      ),
      h('p', { class: 'fine', text: '备份是一个 JSON 文件，图片也在里面，谱多了文件会比较大。这一版只搜你自己收进来的谱。' })
    )
  );
}

async function boot() {
  applyTabFont(tabFont());
  consumeCapture();
  try {
    state.sheets = (await dbAll()).map(normalize);
  } catch (err) {
    state.dbError = true;
    state.sheets = [];
  }
  window.addEventListener('popstate', onNav);
  window.addEventListener('hashchange', onNav);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushDraft();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    flushDraft();
    event.preventDefault();
    event.returnValue = '';
  });
  render();
  if (state.toastAfter) toast(state.toastAfter);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

if (typeof window === 'undefined') {
  try {
    selfCheck();
    console.log('selfCheck ok');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
} else {
  boot().catch((err) => {
    const app = document.getElementById('app');
    if (app) app.textContent = '曲谱库没有打开。' + (err && err.message ? err.message : '');
  });
}
