/* Renderer: island UI, mic recording (16 kHz WAV), TTS, settings panel. */
const $ = (id) => document.getElementById(id);
const J = window.jarvis;
const orb = new Orb($('orb'));
let cfg = null;
let personalities = [];
let recorder = null;
let speakingTimer = null;

/* ---------------------------------------------------------------- recorder */
function encodeWav(chunks, rate) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new ArrayBuffer(44 + len * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, len * 2, true);
  let o = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, c[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function startRec(mode) {
  if (recorder) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    proc.onaudioprocess = (e) => {
      const d = new Float32Array(e.inputBuffer.getChannelData(0));
      chunks.push(d);
      let s = 0;
      for (let i = 0; i < d.length; i++) s += d[i] * d[i];
      orb.setLevel(Math.min(1, Math.sqrt(s / d.length) * 6));
    };
    src.connect(proc);
    proc.connect(ctx.destination);
    recorder = { mode, stream, ctx, proc, src, chunks, t0: Date.now() };
  } catch (e) {
    setStatus('error', 'Microphone unavailable: ' + e.message);
    J.invoke('voice:submit', { mode, audio: null });
  }
}

async function stopRec(mode) {
  const r = recorder;
  if (!r) return;
  recorder = null;
  r.proc.disconnect();
  r.src.disconnect();
  r.stream.getTracks().forEach((t) => t.stop());
  const rate = r.ctx.sampleRate;
  r.ctx.close();
  orb.setLevel(0);
  const tooShort = Date.now() - r.t0 < 400;
  J.invoke('voice:submit', { mode: mode || r.mode, audio: tooShort ? null : { base64: encodeWav(r.chunks, rate), mime: 'audio/wav' } });
}

/* ---------------------------------------------------------------- status/UI */
let collapseTimer = null;
function expand() { clearTimeout(collapseTimer); $('island').classList.remove('collapsed'); }
function scheduleCollapse(ms = 9000) {
  clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => { if (!hovering) $('island').classList.add('collapsed'); }, ms);
}

function setStatus(state, text) {
  orb.setState(state);
  const label = { idle: 'Ready', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking', error: 'Error' }[state] || 'Ready';
  $('status').textContent = label;
  $('sub').textContent = text || '';
  if (state !== 'idle') { expand(); scheduleCollapse(state === 'error' ? 8000 : 12000); }
  else scheduleCollapse(5000);
}

let hovering = false;
function bindHover() {
  const isl = $('island');
  isl.addEventListener('mouseenter', () => { hovering = true; J.invoke('island:ignore', false); expand(); });
  isl.addEventListener('mouseleave', () => {
    hovering = false;
    J.invoke('island:ignore', true);
    J.invoke('island:focusable', false);
    scheduleCollapse(2500);
  });
  // Typing needs focus; otherwise the island must never take it away from the app you're using.
  $('typed').addEventListener('focus', () => J.invoke('island:focusable', true));
  $('typed').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      J.invoke('agent:text', e.target.value.trim());
      e.target.value = '';
      J.invoke('island:focusable', false);
    }
  });
}

/* --------------------------------------------------------------------- TTS */
function pickVoice() {
  const want = cfg.slots.voice.name;
  const vs = speechSynthesis.getVoices();
  return vs.find((v) => v.name === want) || vs.find((v) => /en[-_]GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
}

function speak(text) {
  if (!text) return;
  speechSynthesis.cancel();
  const p = personalities.find((x) => x.id === cfg.slots.personality) || personalities[0];
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = (cfg.slots.voice.rate || 1) * (p.voice?.rate || 1);
  u.pitch = (cfg.slots.voice.pitch || 1) * (p.voice?.pitch || 1);
  u.volume = 1;
  u.onstart = () => setStatus('speaking', '');
  u.onend = () => setStatus('idle', '');
  u.onerror = () => setStatus('idle', '');
  $('reply').textContent = text;
  expand();
  speechSynthesis.speak(u);
}

/* ---------------------------------------------------------------- settings */
function el(tag, props = {}, kids = []) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  kids.forEach((k) => e.append(k));
  return e;
}
const row = (label, ctl) => el('div', { className: 'row' }, [el('label', { textContent: label }), ctl]);
const sel = (opts, val, on) => {
  const s = el('select');
  opts.forEach(([v, t]) => s.append(el('option', { value: v, textContent: t, selected: v === val })));
  s.onchange = () => on(s.value);
  return s;
};
const txt = (val, on, pw = false, ph = '') => {
  const i = el('input', { type: pw ? 'password' : 'text', value: val || '', placeholder: ph });
  i.onfocus = () => J.invoke('island:focusable', true);
  i.onblur = () => J.invoke('island:focusable', false);
  i.onchange = () => on(i.value.trim());
  return i;
};

async function save(patch) {
  cfg = await J.invoke('settings:set', patch);
  applyLook();
}

function applyLook() {
  orb.style = cfg.slots.soul.style;
  const p = personalities.find((x) => x.id === cfg.slots.personality);
  orb.color = cfg.slots.soul.color || (p && p.color) || '#5ec8ff';
}

async function buildSettings() {
  const root = $('settings');
  root.replaceChildren();
  const P = cfg.provider;

  root.append(el('h4', { textContent: 'AI provider' }));
  root.append(row('Language model', sel([['gemini', 'Google Gemini'], ['groq', 'Groq'], ['openrouter', 'OpenRouter'], ['ollama', 'Ollama (local)'], ['lmstudio', 'LM Studio (local)']], P, async (v) => { await save({ provider: v }); buildSettings(); })));
  root.append(row('Speech-to-text', sel([['gemini', 'Gemini'], ['groq', 'Groq Whisper']], cfg.sttProvider, (v) => save({ sttProvider: v }))));
  root.append(row('Model', txt(cfg.models[P], (v) => save({ models: { [P]: v } }))));
  if (P === 'ollama' || P === 'lmstudio') {
    root.append(row('Server URL', txt(cfg.baseUrls[P], (v) => save({ baseUrls: { [P]: v } }))));
  }
  root.append(row('Gemini key', txt(cfg.keys.gemini, (v) => save({ keys: { gemini: v } }), true, 'aistudio.google.com')));
  root.append(row('Groq key', txt(cfg.keys.groq, (v) => save({ keys: { groq: v } }), true)));
  root.append(row('OpenRouter key', txt(cfg.keys.openrouter, (v) => save({ keys: { openrouter: v } }), true)));
  root.append(row('Tavily key', txt(cfg.keys.tavily, (v) => save({ keys: { tavily: v } }), true, 'web research')));

  root.append(el('h4', { textContent: 'Customise' }));
  root.append(row('Soul', sel([['geodisc', 'Geodisc'], ['constellation', 'Constellation']], cfg.slots.soul.style, (v) => save({ slots: { soul: { style: v } } }))));
  const colour = el('input', { type: 'color', value: cfg.slots.soul.color });
  colour.onchange = () => save({ slots: { soul: { color: colour.value } } });
  root.append(row('Soul colour', colour));
  root.append(row('Personality', sel(personalities.map((p) => [p.id, p.name]), cfg.slots.personality, (v) => {
    const p = personalities.find((x) => x.id === v);
    save({ slots: { personality: v, soul: { color: p.color } } }).then(buildSettings);
  })));
  const voices = speechSynthesis.getVoices();
  root.append(row('Voice', sel([['', 'Auto (English)'], ...voices.map((v) => [v.name, v.name])], cfg.slots.voice.name, (v) => save({ slots: { voice: { name: v } } }))));
  const rate = el('input', { type: 'range', min: 0.6, max: 1.6, step: 0.05, value: cfg.slots.voice.rate });
  rate.onchange = () => save({ slots: { voice: { rate: Number(rate.value) } } });
  root.append(row('Speech speed', rate));
  root.append(row('Dictation style', sel([['verbatim', 'Verbatim'], ['clean', 'Clean'], ['formal', 'Formal'], ['casual', 'Casual'], ['concise', 'Concise']], cfg.slots.dictation, (v) => save({ slots: { dictation: v } }))));

  root.append(el('h4', { textContent: 'Abilities' }));
  const names = { open_app: 'Open apps', open_url: 'Open links', computer_use: 'PC control', research: 'Web research', schedule: 'Scheduling', volume: 'Volume', dark_mode: 'Dark mode', wifi: 'Wi-Fi status', wallpaper: 'Wallpaper', memory: 'Memory' };
  const checks = el('div', { className: 'checks' });
  for (const [k, label] of Object.entries(names)) {
    const cb = el('input', { type: 'checkbox', checked: !!cfg.slots.abilities[k] });
    cb.onchange = () => save({ slots: { abilities: { [k]: cb.checked } } });
    checks.append(el('label', {}, [cb, label]));
  }
  root.append(checks);
  const conf = el('input', { type: 'checkbox', checked: cfg.confirmRisky });
  conf.onchange = () => save({ confirmRisky: conf.checked });
  root.append(el('div', { className: 'checks' }, [el('label', {}, [conf, 'Confirm risky actions'])]));

  root.append(el('h4', { textContent: 'System' }));
  const vol = el('input', { type: 'range', min: 0, max: 100, step: 2, value: 50 });
  vol.onchange = () => J.invoke('sys:volume', Number(vol.value));
  root.append(row('Master volume', vol));
  const dark = el('input', { type: 'checkbox' });
  J.invoke('sys:isdark').then((v) => { dark.checked = !!v; });
  dark.onchange = () => J.invoke('sys:dark', dark.checked);
  root.append(row('Windows dark mode', dark));
  const wifi = el('span', { id: 'wifi-line', textContent: 'checking…' });
  root.append(row('Wi-Fi', wifi));
  J.invoke('sys:wifi').then(showWifi);
  const wpDir = txt(cfg.wallpaperDir, (v) => save({ wallpaperDir: v }), false, 'folder of images');
  root.append(row('Wallpaper folder', wpDir));
  const pick = el('button', { textContent: 'Browse…' });
  pick.onclick = async () => { const d = await J.invoke('pick:folder'); if (d) { await save({ wallpaperDir: d }); buildSettings(); } };
  const next = el('button', { textContent: 'Next wallpaper' });
  next.onclick = () => J.invoke('sys:wallpaper').catch((e) => setStatus('error', e.message));
  root.append(el('div', { className: 'row' }, [pick, next]));

  root.append(el('h4', { textContent: 'Memory' }));
  const facts = await J.invoke('memory:list');
  if (!facts.length) root.append(el('div', { className: 'mem', textContent: 'Nothing remembered yet. Say "remember that…"' }));
  facts.forEach((f) => root.append(el('div', { className: 'mem', textContent: '• ' + f })));
  if (facts.length) {
    const clr = el('button', { textContent: 'Forget everything' });
    clr.onclick = async () => { await J.invoke('memory:clear'); buildSettings(); };
    root.append(clr);
  }
}

function showWifi(w) {
  const n = $('wifi-line');
  if (!n) return;
  n.textContent = !w || !w.connected ? 'Not connected' : `${w.ssid}${w.signal != null ? ` · ${w.signal}%` : ''}`;
}

/* -------------------------------------------------------------------- init */
function bindEvents() {
  J.on('rec:start', ({ mode }) => startRec(mode));
  J.on('rec:stop', ({ mode }) => stopRec(mode));
  J.on('status', ({ state, text }) => setStatus(state, text));
  J.on('speak', ({ text }) => speak(text));
  J.on('heard', ({ text }) => { $('heard').textContent = text ? `“${text}”` : ''; });
  J.on('wifi', showWifi);
  J.on('tasks', (list) => {
    const ul = $('tasks');
    ul.replaceChildren(...list.map((t) => el('li', {}, [el('span', { textContent: t.title }), el('span', { className: 'st', textContent: t.status })])));
    $('stop').hidden = !list.some((t) => t.status === 'running' || t.status === 'queued');
  });
  J.on('confirm:request', ({ id, msg }) => {
    $('confirm-msg').textContent = msg;
    $('confirm').hidden = false;
    expand();
    clearTimeout(collapseTimer);
    const done = (ok) => { $('confirm').hidden = true; J.invoke('confirm:answer', { id, ok }); scheduleCollapse(); };
    $('allow').onclick = () => done(true);
    $('deny').onclick = () => done(false);
  });
  $('mic').onclick = () => J.invoke('voice:toggle');
  $('stop').onclick = () => J.invoke('agent:abort');
  // Scrolling inside the island scrolls to the settings section.
  $('island').addEventListener('wheel', () => expand(), { passive: true });
}

(async function init() {
  const r = await J.invoke('settings:get');
  cfg = r.settings;
  personalities = r.personalities;
  applyLook();
  bindHover();
  bindEvents();
  setStatus('idle', '');
  speechSynthesis.onvoiceschanged = () => { if (cfg) buildSettings(); };
  buildSettings();
  const missing = !cfg.keys.gemini && !cfg.keys.groq && cfg.provider !== 'ollama' && cfg.provider !== 'lmstudio';
  if (missing) {
    $('reply').textContent = 'Welcome. Hover over me, scroll down and paste a free Gemini key from aistudio.google.com to get started.';
    expand();
  }
})();
