const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'settings:get', 'settings:set', 'voice:submit', 'voice:toggle', 'agent:text', 'agent:abort',
  'confirm:answer', 'island:ignore', 'island:focusable', 'sys:volume', 'sys:dark', 'sys:isdark',
  'sys:wallpaper', 'sys:wifi', 'memory:list', 'memory:clear', 'pick:folder',
]);
const EVENTS = new Set(['rec:start', 'rec:stop', 'status', 'speak', 'heard', 'tasks', 'confirm:request', 'wifi']);

contextBridge.exposeInMainWorld('jarvis', {
  invoke: (ch, payload) => {
    if (!INVOKE.has(ch)) throw new Error('Blocked channel: ' + ch);
    return ipcRenderer.invoke(ch, payload);
  },
  on: (ch, cb) => {
    if (!EVENTS.has(ch)) return;
    ipcRenderer.on(ch, (_e, payload) => cb(payload));
  },
});
