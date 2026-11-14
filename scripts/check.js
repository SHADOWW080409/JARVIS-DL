// Syntax-checks every JS file and validates JSON. Run: npm run check
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', '.git', 'dist']);
let bad = 0;
let n = 0;

(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { walk(p); continue; }
    try {
      if (f.name.endsWith('.js')) { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); n++; }
      else if (f.name.endsWith('.json')) { JSON.parse(fs.readFileSync(p, 'utf8')); n++; }
    } catch (e) {
      bad++;
      console.error('FAIL', path.relative(root, p), String(e.stderr || e.message).split('\n')[0]);
    }
  }
})(root);

console.log(`${n - bad}/${n} files OK`);
process.exit(bad ? 1 : 0);
