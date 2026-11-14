const EventEmitter = require('events');

// Global push-to-talk chords via a low-level keyboard hook (uiohook-napi).
//   Hold Ctrl+Win    -> 'dictate'
//   Hold Ctrl+Shift  -> 'ask' (circle-to-ask)
//   Ctrl+Alt+J       -> 'toggle' (talk to the agent)
//   Pause or Ctrl+Alt+Esc -> 'abort'
// A chord only activates after 250 ms with no other key pressed, so normal
// shortcuts like Ctrl+Shift+T are unaffected.
class Hotkeys extends EventEmitter {
  start() {
    const { uIOhook, UiohookKey: K } = require('uiohook-napi');
    this.K = K;
    this.down = new Set();
    this.pending = null;
    this.active = null;
    this.mods = new Set([K.Ctrl, K.CtrlRight, K.Alt, K.AltRight, K.Shift, K.ShiftRight, K.Meta, K.MetaRight]);
    uIOhook.on('keydown', (e) => this.onDown(e.keycode));
    uIOhook.on('keyup', (e) => this.onUp(e.keycode));
    uIOhook.start();
  }

  has(...codes) { return codes.some((c) => this.down.has(c)); }

  chord() {
    const K = this.K;
    const ctrl = this.has(K.Ctrl, K.CtrlRight);
    const shift = this.has(K.Shift, K.ShiftRight);
    const alt = this.has(K.Alt, K.AltRight);
    const win = this.has(K.Meta, K.MetaRight);
    if (ctrl && win && !shift && !alt) return 'dictate';
    if (ctrl && shift && !win && !alt) return 'ask';
    return null;
  }

  cancelPending() {
    if (this.pending) { clearTimeout(this.pending); this.pending = null; }
  }

  onDown(code) {
    const K = this.K;
    if (this.down.has(code)) return; // ignore key-repeat
    this.down.add(code);
    const ctrl = this.has(K.Ctrl, K.CtrlRight);
    const alt = this.has(K.Alt, K.AltRight);
    if (code === K.Pause || (code === K.Escape && ctrl && alt)) { this.emit('abort'); return; }
    if (code === K.J && ctrl && alt) { this.emit('toggle'); return; }
    if (!this.mods.has(code)) { this.cancelPending(); return; }
    const c = this.chord();
    if (c && !this.active && !this.pending) {
      this.pending = setTimeout(() => {
        this.pending = null;
        if (this.chord() === c) { this.active = c; this.emit('start', c); }
      }, 250);
    }
  }

  onUp(code) {
    this.down.delete(code);
    if (this.active && this.chord() !== this.active) {
      const m = this.active;
      this.active = null;
      this.emit('stop', m);
    }
    if (this.pending && !this.chord()) this.cancelPending();
  }
}

module.exports = { Hotkeys };
