// Convert human key specs ("ctrl+shift+t", "enter", "win+d") to Windows input.
const NAMED = {
  enter: '{ENTER}', return: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}',
  backspace: '{BACKSPACE}', delete: '{DELETE}', del: '{DELETE}', insert: '{INSERT}',
  up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
  home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}', space: ' ',
};
const WIN_NAMES = ['win', 'windows', 'super', 'meta'];

function split(spec) {
  return String(spec).toLowerCase().split('+').map((s) => s.trim()).filter(Boolean);
}

// -> string for System.Windows.Forms.SendKeys.SendWait
function toSendKeys(spec) {
  let mods = '';
  let key = '';
  for (const p of split(spec)) {
    if (p === 'ctrl' || p === 'control') mods += '^';
    else if (p === 'alt') mods += '%';
    else if (p === 'shift') mods += '+';
    else key = p;
  }
  if (!key) throw new Error(`No key in "${spec}"`);
  let k;
  if (NAMED[key]) k = NAMED[key];
  else if (/^f([1-9]|1[0-6])$/.test(key)) k = `{${key.toUpperCase()}}`;
  else if (key.length === 1) k = /[+^%~(){}[\]]/.test(key) ? `{${key}}` : key;
  else throw new Error(`Unknown key: ${key}`);
  return mods + k;
}

// -> {vk} when the combo uses the Windows key (SendKeys can't do it), else null
function parseWin(spec) {
  const parts = split(spec);
  if (!parts.some((p) => WIN_NAMES.includes(p))) return null;
  const rest = parts.filter((p) => !WIN_NAMES.includes(p));
  if (!rest.length) return { vk: 0 };
  const k = rest[rest.length - 1];
  const arrows = { left: 0x25, up: 0x26, right: 0x27, down: 0x28 };
  if (arrows[k]) return { vk: arrows[k] };
  if (k.length === 1) return { vk: k.toUpperCase().charCodeAt(0) };
  throw new Error(`Unsupported Windows-key combo: ${spec}`);
}

module.exports = { toSendKeys, parseWin };
