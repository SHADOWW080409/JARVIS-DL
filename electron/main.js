const {
  app, BrowserWindow, ipcMain, screen, Tray, Menu, session, Notification, dialog, nativeImage, globalShortcut,
} = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = require('./lib/defaults');
const { Store } = require('./lib/store');
const { LLM } = require('./lib/llm');
const { PSHost } = require('./lib/psHost');
const { Computer } = require('./lib/computer');
const { capture, cropRegion } = require('./lib/screen');
const { TaskQueue } = require('./lib/tasks');
const { Scheduler } = require('./lib/scheduler');
const { Agent } = require('./lib/agent');
const { Hotkeys } = require('./lib/hotkeys');
const { getWifi } = require('./lib/wifi');

if (!app.requestSingleInstanceLock()) { app.quit(); }

const ROOT = path.join(__dirname, '..');
const personalities = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'personalities.json'), 'utf8'));

let island = null;
let overlay = null;
let tray = null;
let recording = null; // 'dictate' | 'ask' | 'agent' | null
let askCtx = null;
let settings; let state; let llm; let computer; let queue; let sched; let agent; let hk;

const send = (ch, p) => { if (island && !island.isDestroyed()) island.webContents.send(ch, p); };
const pending = new Map();
let confirmId = 0;
const ui = {
  status: (st, text) => send('status', { state: st, text: text || '' }),
  speak: (text) => send('speak', { text }),
  heard: (text) => send('heard', { text }),
  confirm: (msg) => new Promise((resolve) => {
    const id = ++confirmId;
    pending.set(id, resolve);
    send('confirm:request', { id, msg });
    setTimeout(() => { if (pending.delete(id)) resolve(false); }, 30000);
  }),
};

/* ---------------------------------------------------------------- windows */

function createIsland() {
  const d = screen.getPrimaryDisplay();
  const W = 580;
  const H = 540;
  island = new BrowserWindow({
    width: W, height: H,
    x: Math.round(d.bounds.x + (d.bounds.width - W) / 2),
    y: d.bounds.y + 6,
    frame: false, transparent: true, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true,
    focusable: false, // never steal focus: dictation must paste into the app you were using
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  island.setAlwaysOnTop(true, 'screen-saver');
  island.setIgnoreMouseEvents(true, { forward: true });
  island.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  island.once('ready-to-show', () => island.showInactive());
}

function openOverlay() {
  const d = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    frame: false, transparent: true, resizable: false, hasShadow: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload-overlay.js'), contextIsolation: true },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.loadFile(path.join(ROOT, 'renderer', 'overlay.html'));
  overlay.once('ready-to-show', () => overlay && overlay.showInactive());
}

function closeOverlay() {
  if (overlay && !overlay.isDestroyed()) overlay.close();
  overlay = null;
}

function createTray() {
  const iconPath = path.join(ROOT, 'assets', 'icon.png');
  let img = nativeImage.createFromPath(iconPath);
  if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('JARVIS DL');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Talk to JARVIS (Ctrl+Alt+J)', click: toggleAgent },
    { label: 'Stop all tasks (Pause)', click: abortAll },
    { label: 'Show / hide island', click: () => (island.isVisible() ? island.hide() : island.showInactive()) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

/* ------------------------------------------------------------ voice flows */

function abortAll() {
  queue.cancelAll();
  ui.status('idle', 'Stopped');
}

function toggleAgent() {
  if (recording === 'agent') {
    send('rec:stop', { mode: 'agent' });
  } else if (!recording) {
    startRecording('agent');
  }
}

async function startRecording(mode) {
  if (recording) return;
  recording = mode;
  send('rec:start', { mode });
  if (mode === 'dictate') {
    ui.status('listening', 'Dictating… release to insert');
    computer.maskWin().catch(() => {}); // stop Win-key release opening the Start menu
  } else if (mode === 'ask') {
    ui.status('listening', 'Circle something, then ask');
    askCtx = { bbox: null, shotP: capture(1600) };
    const ctx = askCtx;
    try { await ctx.shotP; } catch { /* handled on submit */ }
    if (askCtx === ctx && recording === 'ask') openOverlay();
  } else {
    ui.status('listening', 'Listening…');
  }
}

function stopRecording(mode) {
  if (recording !== mode) return;
  send('rec:stop', { mode });
  if (mode === 'ask') closeOverlay();
}

async function handleVoice(mode, audio) {
  recording = null;
  closeOverlay();
  if (!audio || !audio.base64) {
    askCtx = null;
    ui.status('idle', '');
    return;
  }
  try {
    ui.status('thinking', 'Transcribing…');
    const text = (await llm.transcribe(audio)).trim();
    if (!text) { askCtx = null; ui.status('idle', "Didn't catch that"); return; }
    if (mode === 'dictate') await doDictate(text);
    else if (mode === 'ask') await doAsk(text);
    else runCommand(text);
  } catch (e) {
    askCtx = null;
    ui.status('error', e.message);
    setTimeout(() => ui.status('idle', ''), 7000);
  }
}

async function doDictate(raw) {
  let text = raw;
  const style = settings.all().slots.dictation;
  if (style !== 'verbatim') {
    ui.status('thinking', 'Polishing…');
    try { text = await agent.cleanDictation(raw, style); } catch { /* fall back to raw transcript */ }
  }
  await computer.paste(text);
  ui.heard(text);
  ui.status('idle', 'Inserted');
}

async function doAsk(question) {
  const ctx = askCtx;
  askCtx = null;
  ui.heard(question);
  ui.status('thinking', 'Looking at your screen…');
  const shot = await ctx.shotP;
  const crop = cropRegion(shot, ctx.bbox);
  const images = [];
  let note;
  if (crop) {
    images.push(crop, { base64: shot.base64, mime: shot.mime });
    note = 'The first image is the region of the screen the user circled; the second is the full screen for context.';
  } else {
    images.push({ base64: shot.base64, mime: shot.mime });
    note = 'The image is the user\'s full screen.';
  }
  const out = await llm.chat({
    system: agent.system(),
    messages: [{ role: 'user', content: `${note}\nThe user asks: "${question}"\nAnswer helpfully in 1-3 spoken sentences.` }],
    images,
  });
  ui.speak(out.trim());
}

function runCommand(text) {
  ui.heard(text);
  ui.status('thinking', 'Thinking…');
  const t = queue.add(text, 'think', async () => (await agent.handle(text)).speech);
  t.done.then((speech) => {
    if (speech) ui.speak(speech);
    else ui.status('idle', '');
  });
}

/* -------------------------------------------------------------------- IPC */

function wireIpc() {
  ipcMain.handle('settings:get', () => ({ settings: settings.all(), personalities, platform: process.platform }));
  ipcMain.handle('settings:set', (_e, patch) => settings.patch(patch));
  ipcMain.handle('voice:submit', (_e, { mode, audio }) => handleVoice(mode, audio));
  ipcMain.handle('voice:toggle', () => toggleAgent());
  ipcMain.handle('agent:text', (_e, text) => { if (text && text.trim()) runCommand(text.trim()); });
  ipcMain.handle('agent:abort', () => abortAll());
  ipcMain.handle('confirm:answer', (_e, { id, ok }) => {
    const r = pending.get(id);
    if (r) { pending.delete(id); r(!!ok); }
  });
  ipcMain.handle('island:ignore', (_e, ignore) => {
    island.setIgnoreMouseEvents(!!ignore, { forward: true });
  });
  ipcMain.handle('island:focusable', (_e, f) => {
    island.setFocusable(!!f);
    if (f) island.focus();
  });
  ipcMain.handle('sys:volume', (_e, pct) => computer.setVolume(pct));
  ipcMain.handle('sys:dark', (_e, on) => computer.setDark(!!on));
  ipcMain.handle('sys:isdark', () => computer.isDark().catch(() => null));
  ipcMain.handle('sys:wallpaper', async () => {
    const r = await computer.nextWallpaper(settings.get('wallpaperDir'), state.get('wallpaperIndex'));
    state.set('wallpaperIndex', r.index);
    return path.basename(r.file);
  });
  ipcMain.handle('sys:wifi', () => getWifi());
  ipcMain.handle('memory:list', () => agent.facts());
  ipcMain.handle('memory:clear', () => agent.clearMemory());
  ipcMain.handle('pick:folder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.on('circle:bbox', (_e, r) => {
    if (!askCtx) return;
    const b = askCtx.bbox;
    if (!b) { askCtx.bbox = r; return; }
    const x = Math.min(b.x, r.x);
    const y = Math.min(b.y, r.y);
    askCtx.bbox = { x, y, w: Math.max(b.x + b.w, r.x + r.w) - x, h: Math.max(b.y + b.h, r.y + r.h) - y };
  });
}

function startHotkeys() {
  try {
    hk = new Hotkeys();
    hk.on('start', startRecording);
    hk.on('stop', stopRecording);
    hk.on('toggle', toggleAgent);
    hk.on('abort', abortAll);
    hk.start();
  } catch (e) {
    console.warn('Global key hook unavailable, falling back to Ctrl+Alt+J only:', e.message);
    globalShortcut.register('Control+Alt+J', toggleAgent);
  }
}

/* -------------------------------------------------------------------- app */

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  settings = new Store(dir, 'settings', DEFAULTS);
  state = new Store(dir, 'state', { facts: [], items: [], wallpaperIndex: -1 });
  llm = new LLM(() => settings.all());

  const initPath = path.join(__dirname, 'native', 'init.ps1').replace('app.asar', 'app.asar.unpacked');
  computer = new Computer(new PSHost(initPath));
  queue = new TaskQueue((list) => send('tasks', list));
  sched = new Scheduler(state, (item) => {
    new Notification({ title: 'JARVIS', body: item.task }).show();
    runCommand(`[A scheduled item is now due. Carry it out immediately; for a reminder just say it. Do not schedule anything again.] ${item.task}`);
  });
  agent = new Agent({
    llm, get: () => settings.all(), computer, capture, state, sched, queue, ui, personalities, getWifi,
  });

  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === 'media');

  wireIpc();
  createIsland();
  createTray();
  startHotkeys();
  sched.start();

  setInterval(async () => send('wifi', await getWifi()), 15000);
  setTimeout(async () => send('wifi', await getWifi()), 2000);
});

app.on('window-all-closed', () => { /* keep running in the tray */ });
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { require('uiohook-napi').uIOhook.stop(); } catch { /* not loaded */ }
});
