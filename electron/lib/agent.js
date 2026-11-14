const { extractJson } = require('./llm');
const safety = require('./safety');
const tavily = require('./tavily');
const { sleep } = require('./computer');

const MAX_STEPS = 15;

function localIso(d) {
  const p = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}

const DICTATION_STYLES = {
  clean: "Fix punctuation, capitalization and obvious speech errors. Remove filler words (um, uh, you know) and false starts. Keep the speaker's own wording and meaning.",
  formal: 'Rewrite in a polished, professional tone with correct grammar and punctuation, keeping the meaning exactly.',
  casual: 'Rewrite in a relaxed, friendly conversational tone with correct punctuation, keeping the meaning exactly.',
  concise: 'Tighten to the shortest clear wording that keeps all the information. Fix punctuation.',
};

// The agent: routes a spoken request to an answer, web research, an ability,
// a schedule, a memory write, or a multi-step computer-use task.
class Agent {
  // deps: llm, get (settings getter), computer, capture, state, sched, queue, ui, personalities
  constructor(deps) {
    Object.assign(this, deps);
    this.history = [];
  }

  persona() {
    const id = this.get().slots.personality;
    return this.personalities.find((p) => p.id === id) || this.personalities[0];
  }

  facts() { return this.state.get('facts') || []; }

  remember(fact) {
    const facts = this.facts();
    facts.push(String(fact).slice(0, 300));
    this.state.set('facts', facts.slice(-50));
  }

  clearMemory() { this.state.set('facts', []); }

  system(extra = '') {
    const p = this.persona();
    const facts = this.facts();
    return [
      `You are ${p.name}, a voice-first AI companion living on the user's Windows PC.`,
      `Personality: ${p.style}`,
      'Your replies are read aloud: keep them short (1-3 sentences), plain text, no markdown, no emojis, no lists.',
      facts.length ? `Known about the user: ${facts.join('; ')}.` : '',
      extra,
    ].filter(Boolean).join('\n');
  }

  async cleanDictation(text, style) {
    const rule = DICTATION_STYLES[style] || DICTATION_STYLES.clean;
    const out = await this.llm.chat({
      system: `You are a dictation post-processor. ${rule} Interpret clear spoken formatting commands such as "new line", "new paragraph" or "comma" as formatting. Output ONLY the final text, with no quotes, preface or commentary.`,
      messages: [{ role: 'user', content: text }],
      temperature: 0.1,
    });
    return out.trim().replace(/^"|"$/g, '') || text;
  }

  routerSpec() {
    const a = this.get().slots.abilities;
    const lines = ['{"type":"answer","speech":"..."} - conversation, knowledge, maths, advice you can answer yourself.'];
    if (a.research) lines.push('{"type":"research","query":"..."} - needs fresh facts from the web (news, prices, comparisons, current info).');
    if (a.computer_use) lines.push('{"type":"computer","goal":"...","speech":"short acknowledgement"} - do something on the PC by looking at the screen and clicking/typing (multi-step tasks, navigating apps, reading what is on screen).');
    const abil = [];
    if (a.volume) abil.push('set_volume{"percent":0-100}', 'mute{}');
    if (a.dark_mode) abil.push('dark_mode{"enabled":true|false|"toggle"}');
    if (a.wifi) abil.push('wifi_status{}');
    if (a.wallpaper) abil.push('next_wallpaper{}');
    if (a.open_app) abil.push('open_app{"name":"notepad"}');
    if (a.open_url) abil.push('open_url{"url":"https://..."}');
    if (abil.length) lines.push(`{"type":"ability","name":"<one of: ${abil.join(', ')}>","args":{...}} - quick built-in action. Prefer this over "computer" when it fits.`);
    if (a.schedule) lines.push('{"type":"schedule","when":"ISO-8601 local time with UTC offset","task":"what to do then, phrased as an instruction","speech":"short confirmation"} - do something later.');
    if (a.memory) lines.push('{"type":"remember","fact":"...","speech":"short confirmation"} - the user asks you to remember a personal fact or preference.');
    return [
      'Decide how to handle the user\'s request. Reply with ONE JSON object and nothing else. Choose a "type":',
      ...lines.map((l) => '- ' + l),
      `Current local time: ${localIso(new Date())}.`,
    ].join('\n');
  }

  async handle(text) {
    const plan = extractJson(await this.llm.chat({
      system: this.system(this.routerSpec()),
      messages: [...this.history.slice(-10), { role: 'user', content: text }],
      json: true,
    }));
    const result = await this.execute(plan, text);
    this.history.push({ role: 'user', content: text }, { role: 'assistant', content: result.speech || '' });
    this.history = this.history.slice(-20);
    return result;
  }

  async execute(plan, text) {
    const s = this.get();
    const a = s.slots.abilities;
    switch (plan.type) {
      case 'answer':
        return { speech: plan.speech || "I'm not sure what to say to that." };

      case 'research': {
        if (!a.research) return { speech: 'Web research is turned off in my abilities.' };
        const r = await tavily.search(plan.query || text, s.keys.tavily);
        const ctx = r.results.map((x, i) => `[${i + 1}] ${x.title}: ${x.content}`).join('\n');
        const out = await this.llm.chat({
          system: this.system(),
          messages: [{ role: 'user', content: `Question: ${text}\n\nWeb results:\n${ctx}\n\nAnswer in 1-3 spoken sentences using only these results. If they conflict or are thin, say so.` }],
        });
        return { speech: out.trim() };
      }

      case 'computer': {
        if (!a.computer_use) return { speech: 'PC control is turned off in my abilities.' };
        const goal = plan.goal || text;
        if (s.confirmRisky && safety.isRiskyGoal(goal)) {
          const ok = await this.ui.confirm(`This looks sensitive. Allow me to: ${goal}?`);
          if (!ok) return { speech: "Understood, I won't do that." };
        }
        const t = this.queue.add(goal, 'computer', (task) => this.computerUse(goal, task));
        t.done.then((msg) => this.ui.speak(msg));
        return { speech: plan.speech || 'On it.' };
      }

      case 'ability':
        return { speech: await this.ability(plan.name, plan.args || {}) };

      case 'schedule': {
        if (!a.schedule) return { speech: 'Scheduling is turned off in my abilities.' };
        const when = Date.parse(plan.when);
        if (Number.isNaN(when) || when < Date.now() - 60000) {
          return { speech: "I couldn't work out when you meant. Could you say the time again?" };
        }
        this.sched.add({ when: new Date(when).toISOString(), task: plan.task || text });
        return { speech: plan.speech || `Scheduled for ${new Date(when).toLocaleString()}.` };
      }

      case 'remember':
        if (!a.memory) return { speech: 'Memory is turned off in my abilities.' };
        this.remember(plan.fact);
        return { speech: plan.speech || "Noted, I'll remember that." };

      default:
        return { speech: plan.speech || "Sorry, I couldn't work out how to do that." };
    }
  }

  async ability(name, args) {
    const s = this.get();
    const a = s.slots.abilities;
    const c = this.computer;
    switch (name) {
      case 'set_volume':
        if (!a.volume) return 'Volume control is turned off.';
        await c.setVolume(Number(args.percent));
        return `Volume set to ${Math.round(Number(args.percent))} percent.`;
      case 'mute':
        if (!a.volume) return 'Volume control is turned off.';
        await c.mute();
        return 'Toggled mute.';
      case 'dark_mode': {
        if (!a.dark_mode) return 'Dark mode control is turned off.';
        const want = args.enabled === 'toggle' || args.enabled === undefined ? !(await c.isDark()) : !!args.enabled;
        await c.setDark(want);
        return want ? 'Dark mode on.' : 'Light mode on.';
      }
      case 'wifi_status': {
        if (!a.wifi) return 'Wi-Fi monitoring is turned off.';
        const w = await this.getWifi();
        if (!w.connected) return "You're not connected to Wi-Fi.";
        return `Connected to ${w.ssid || 'a network'}${w.signal != null ? ` with ${w.signal} percent signal` : ''}.`;
      }
      case 'next_wallpaper': {
        if (!a.wallpaper) return 'Wallpaper switching is turned off.';
        const r = await c.nextWallpaper(s.wallpaperDir, this.state.get('wallpaperIndex'));
        this.state.set('wallpaperIndex', r.index);
        return 'Wallpaper changed.';
      }
      case 'open_app':
        if (!a.open_app) return 'Opening apps is turned off.';
        if (s.confirmRisky && safety.isRiskyAction({ action: 'open_app', name: args.name })) {
          if (!(await this.ui.confirm(`Allow me to open ${args.name}?`))) return "Okay, I won't open it.";
        }
        await c.openApp(args.name);
        return `Opening ${args.name}.`;
      case 'open_url':
        if (!a.open_url) return 'Opening links is turned off.';
        await c.openUrl(args.url);
        return 'Opening that link.';
      default:
        return `I don't know the ability "${name}".`;
    }
  }

  // Vision loop: look at the screen, pick ONE action, run it, repeat.
  async computerUse(goal, task) {
    const s = this.get();
    const hist = [];
    for (let i = 0; i < MAX_STEPS; i++) {
      if (task.cancelled) return 'Stopped.';
      const shot = await this.capture(1280);
      const prompt = [
        `Goal: ${goal}`,
        `The screenshot is ${shot.width}x${shot.height} pixels. Coordinates you return are pixels in this screenshot.`,
        `Actions so far: ${hist.length ? hist.slice(-8).join(' | ') : '(none)'}`,
        'Ignore the small floating "island" widget at the top-center of the screen; it is you.',
        'Return ONE next action as JSON:',
        '{"thought":"brief","action":"click|double_click|right_click|type|key|scroll|open_app|open_url|wait|done|fail","x":0,"y":0,"text":"","keys":"ctrl+l","dy":5,"name":"","url":"","seconds":1,"speech":""}',
        'Use open_app to launch apps, "type" to enter text into the focused field (click it first), "key" for shortcuts like enter or ctrl+s or win+d, scroll dy>0 = down.',
        'When the goal is complete, return action "done" with a short spoken summary in "speech". If it is impossible, return "fail" with a short reason in "speech".',
      ].join('\n');
      let act;
      try {
        act = extractJson(await this.llm.chat({
          system: this.system(),
          messages: [{ role: 'user', content: prompt }],
          images: [{ base64: shot.base64, mime: shot.mime }],
          json: true,
          temperature: 0.2,
        }));
      } catch (e) {
        hist.push('(unreadable reply, retrying)');
        continue;
      }
      this.ui.status('thinking', (act.thought || `Step ${i + 1}`).slice(0, 80));
      if (act.action === 'done') return act.speech || 'Done.';
      if (act.action === 'fail') return act.speech || "I couldn't complete that.";
      if (s.confirmRisky && safety.isRiskyAction(act)) {
        const ok = await this.ui.confirm(`Allow me to ${safety.describe(act)}?`);
        if (!ok) return 'Okay, I stopped before doing that.';
      }
      try {
        await this.exec(act, shot);
        hist.push(safety.describe(act));
      } catch (e) {
        hist.push(`${safety.describe(act)} FAILED: ${e.message}`);
      }
      await sleep(700);
    }
    return 'I ran out of steps before finishing. Check the screen and tell me where to continue.';
  }

  async exec(a, shot) {
    const c = this.computer;
    const sx = shot.physW / shot.width;
    const sy = shot.physH / shot.height;
    const X = Math.round((a.x || 0) * sx);
    const Y = Math.round((a.y || 0) * sy);
    switch (a.action) {
      case 'click': return c.click(X, Y, 'left', 1);
      case 'double_click': return c.click(X, Y, 'left', 2);
      case 'right_click': return c.click(X, Y, 'right', 1);
      case 'type': return c.paste(String(a.text || ''));
      case 'key': return c.keys(a.keys);
      case 'scroll': return c.scroll(Number(a.dy) || 5);
      case 'open_app': await c.openApp(a.name); return sleep(1500);
      case 'open_url': return c.openUrl(a.url);
      case 'wait': return sleep(Math.min(Number(a.seconds) || 1, 10) * 1000);
      default: throw new Error(`Unknown action ${a.action}`);
    }
  }
}

module.exports = { Agent, localIso };
