const { clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const { toSendKeys, parseWin } = require('./keys');
const { quote: q } = require('./psHost');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Real Windows input: mouse, keyboard, clipboard paste, apps, volume, theme, wallpaper.
class Computer {
  constructor(ps) { this.ps = ps; }

  click(x, y, btn = 'left', n = 1) {
    return this.ps.run(`JV-Click ${Math.round(x)} ${Math.round(y)} ${q(btn)} ${n}`);
  }

  // positive = scroll down
  scroll(lines) { return this.ps.run(`JV-Scroll ${Math.round(-lines * 120)}`); }

  keys(spec) {
    const w = parseWin(spec);
    if (w) return this.ps.run(`JV-Win ${w.vk}`);
    return this.ps.run(`JV-Keys ${q(toSendKeys(spec))}`);
  }

  // Inject text at the cursor via clipboard + Ctrl+V (reliable for any language/length).
  // Only plain-text clipboard content is restored afterwards.
  async paste(text) {
    const prev = clipboard.readText();
    clipboard.writeText(text);
    await sleep(60);
    await this.ps.run("JV-Keys '^v'");
    await sleep(250);
    clipboard.writeText(prev);
  }

  openApp(name) { return this.ps.run(`JV-Open ${q(name)}`); }

  openUrl(url) {
    if (!/^https?:\/\//i.test(String(url))) throw new Error('Only http(s) links can be opened.');
    return this.ps.run(`Start-Process ${q(url)}`);
  }

  maskWin() { return this.ps.run('JV-Mask'); }

  setVolume(pct) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    return this.ps.run(`JV-SetVolume ${p}`);
  }

  mute() { return this.ps.run('JV-Mute'); }

  async setDark(on) { await this.ps.run(`JV-Dark ${on ? '$true' : '$false'}`); return on; }

  async isDark() { return (await this.ps.run('JV-IsDark')).trim() === 'True'; }

  // Cycles through images in `dir`. Returns {file, index}.
  async nextWallpaper(dir, index = -1) {
    if (!dir || !fs.existsSync(dir)) throw new Error('Set a wallpaper folder in the island settings first.');
    const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|bmp)$/i.test(f)).sort();
    if (!files.length) throw new Error('No images found in the wallpaper folder.');
    const i = (index + 1) % files.length;
    const file = path.join(dir, files[i]);
    await this.ps.run(`JV-Wallpaper ${q(file)}`);
    return { file, index: i };
  }
}

module.exports = { Computer, sleep };
