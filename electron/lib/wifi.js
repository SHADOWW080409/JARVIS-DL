const { execFile } = require('child_process');

// Wi-Fi monitor via `netsh wlan show interfaces` (Windows only).
function getWifi() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve({ connected: false, note: 'Windows only' });
    execFile('netsh', ['wlan', 'show', 'interfaces'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      if (err || !out) return resolve({ connected: false });
      const ssid = (out.match(/^\s*SSID\s*:\s*(.+)$/m) || [])[1];
      const signal = (out.match(/^\s*Signal\s*:\s*(\d+)%/m) || [])[1];
      const state = (out.match(/^\s*State\s*:\s*(.+)$/m) || [])[1];
      resolve({
        connected: /connected/i.test(state || '') && !/disconnected/i.test(state || ''),
        ssid: ssid ? ssid.trim() : '',
        signal: signal ? Number(signal) : null,
      });
    });
  });
}

module.exports = { getWifi };
