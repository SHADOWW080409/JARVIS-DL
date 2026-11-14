// Safety gates for computer-use. Risky goals/actions require on-screen confirmation.
const RISKY_GOAL = /\b(delete|erase|wipe|format|uninstall|shut ?down|reboot|restart|purchase|buy|checkout|pay|transfer|wire|send money|password|credit card|registry|regedit|install)\b/i;
const RISKY_APPS = /^(cmd|cmd\.exe|powershell|powershell\.exe|pwsh|regedit|wt|terminal|windows terminal|diskpart|mmc|taskmgr)$/i;
const RISKY_KEYS = /(alt\+f4|shift\+delete|win\+r|ctrl\+shift\+esc)/i;
const RISKY_TEXT = /\b(rm -rf|format [a-z]:|del \/|rd \/s|shutdown)\b/i;

function isRiskyGoal(goal) { return RISKY_GOAL.test(String(goal || '')); }

function isRiskyAction(a) {
  if (!a) return false;
  if (a.action === 'open_app' && RISKY_APPS.test(String(a.name || '').trim())) return true;
  if (a.action === 'key' && RISKY_KEYS.test(String(a.keys || ''))) return true;
  if (a.action === 'type' && RISKY_TEXT.test(String(a.text || ''))) return true;
  return false;
}

function describe(a) {
  switch (a.action) {
    case 'click': case 'double_click': case 'right_click': return `${a.action.replace('_', ' ')} at (${a.x}, ${a.y})`;
    case 'type': return `type "${String(a.text || '').slice(0, 60)}"`;
    case 'key': return `press ${a.keys}`;
    case 'scroll': return `scroll ${a.dy}`;
    case 'open_app': return `open ${a.name}`;
    case 'open_url': return `open ${a.url}`;
    case 'wait': return `wait ${a.seconds}s`;
    default: return a.action;
  }
}

module.exports = { isRiskyGoal, isRiskyAction, describe };
