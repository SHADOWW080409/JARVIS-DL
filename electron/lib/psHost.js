const { spawn } = require('child_process');

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

// A persistent PowerShell process. Commands are written to stdin one at a time;
// completion is detected by a unique marker echoed on BOTH stdout and stderr.
class PSHost {
  constructor(initPath) {
    this.initPath = initPath;
    this.proc = null;
    this.q = [];
    this.cur = null;
    this.buf = '';
    this.err = '';
    this.needInit = false;
  }

  run(cmd) {
    if (process.platform !== 'win32') return Promise.reject(new Error('PC control only works on Windows.'));
    return new Promise((resolve, reject) => {
      this.q.push({ cmd, resolve, reject });
      this._next();
    });
  }

  _failAll(e) {
    if (this.cur) { clearTimeout(this.cur.timer); this.cur.reject(e); this.cur = null; }
    const pending = this.q.splice(0);
    pending.forEach((i) => i.reject(e));
  }

  _spawn() {
    const p = spawn('powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
      { windowsHide: true });
    this.proc = p;
    this.needInit = true;
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => { this.buf += d; this._drain(); });
    p.stderr.on('data', (d) => { this.err += d; this._drain(); });
    p.on('error', (e) => { this.proc = null; this._failAll(e); });
    p.on('exit', () => {
      if (this.proc === p) this.proc = null;
      if (this.cur) { clearTimeout(this.cur.timer); this.cur.reject(new Error('PowerShell exited')); this.cur = null; }
      this._next();
    });
  }

  _next() {
    if (this.cur || !this.q.length) return;
    if (!this.proc) this._spawn();
    let item = this.q.shift();
    if (this.needInit) {
      this.needInit = false;
      this.q.unshift(item);
      item = {
        cmd: `. ${quote(this.initPath)}`,
        resolve() {},
        reject: (e) => console.error('PowerShell init failed:', e.message),
      };
    }
    this.cur = item;
    this.buf = '';
    this.err = '';
    item.marker = `__JV_${Date.now()}_${Math.random().toString(36).slice(2)}__`;
    item.timer = setTimeout(() => { try { this.proc && this.proc.kill(); } catch { /* ignore */ } }, 20000);
    this.proc.stdin.write(`${item.cmd}\nWrite-Output '${item.marker}'; [Console]::Error.WriteLine('${item.marker}')\n`);
  }

  _drain() {
    const c = this.cur;
    if (!c) return;
    const i = this.buf.indexOf(c.marker);
    const j = this.err.indexOf(c.marker);
    if (i < 0 || j < 0) return;
    const out = this.buf.slice(0, i).trim();
    const err = this.err.slice(0, j).trim();
    clearTimeout(c.timer);
    this.cur = null;
    if (err) c.reject(new Error(err.split('\n')[0]));
    else c.resolve(out);
    this._next();
  }
}

module.exports = { PSHost, quote };
