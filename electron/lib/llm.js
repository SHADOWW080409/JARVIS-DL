// Provider-agnostic LLM + speech-to-text client.
// Providers: gemini (default), groq, openrouter, ollama, lmstudio.

function extractJson(text) {
  const t = String(text || '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* fall through */ } }
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(t.slice(s, e + 1)); } catch { /* fall through */ } }
  throw new Error('The model did not return valid JSON.');
}

class LLM {
  constructor(getSettings) { this.get = getSettings; }

  // messages: [{role:'user'|'assistant', content:string}]; images attach to the last user message.
  async chat({ system, messages, images = [], json = false, temperature = 0.4 }) {
    const s = this.get();
    if (s.provider === 'gemini') return this._gemini(s, { system, messages, images, json, temperature });
    return this._openai(s, { system, messages, images, json, temperature });
  }

  async _gemini(s, { system, messages, images, json, temperature }) {
    const key = s.keys.gemini;
    if (!key) throw new Error('Add your Gemini API key (free at aistudio.google.com) in the island settings.');
    const last = messages.length - 1;
    const contents = messages.map((m, i) => {
      const parts = [{ text: m.content }];
      if (i === last && m.role === 'user') {
        for (const img of images) parts.push({ inline_data: { mime_type: img.mime || 'image/jpeg', data: img.base64 } });
      }
      return { role: m.role === 'assistant' ? 'model' : 'user', parts };
    });
    const body = { contents, generationConfig: { temperature } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${s.models.gemini}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`Gemini error ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    return (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  }

  async _openai(s, { system, messages, images, json, temperature }) {
    const p = s.provider;
    const base = {
      groq: 'https://api.groq.com/openai/v1',
      openrouter: 'https://openrouter.ai/api/v1',
      ollama: s.baseUrls.ollama,
      lmstudio: s.baseUrls.lmstudio,
    }[p];
    if (!base) throw new Error(`Unknown provider: ${p}`);
    const key = s.keys[p];
    if ((p === 'groq' || p === 'openrouter') && !key) throw new Error(`Add your ${p} API key in the island settings.`);
    const model = images.length ? (s.visionModels[p] || s.models[p]) : s.models[p];
    const last = messages.length - 1;
    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system });
    messages.forEach((m, i) => {
      if (i === last && m.role === 'user' && images.length) {
        msgs.push({
          role: 'user',
          content: [
            { type: 'text', text: m.content },
            ...images.map((img) => ({ type: 'image_url', image_url: { url: `data:${img.mime || 'image/jpeg'};base64,${img.base64}` } })),
          ],
        });
      } else {
        msgs.push({ role: m.role, content: m.content });
      }
    });
    const body = { model, messages: msgs, temperature };
    if (json && p !== 'lmstudio') body.response_format = { type: 'json_object' };
    const headers = { 'content-type': 'application/json' };
    if (key) headers.authorization = `Bearer ${key}`;
    const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${p} error ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    return d.choices?.[0]?.message?.content || '';
  }

  // audio: {base64, mime}. Returns transcript text.
  async transcribe(audio) {
    const s = this.get();
    if (s.sttProvider === 'groq') {
      if (!s.keys.groq) throw new Error('Add your Groq API key in settings to use Groq speech-to-text.');
      const fd = new FormData();
      fd.append('file', new Blob([Buffer.from(audio.base64, 'base64')], { type: audio.mime || 'audio/wav' }), 'speech.wav');
      fd.append('model', 'whisper-large-v3-turbo');
      fd.append('response_format', 'text');
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { authorization: `Bearer ${s.keys.groq}` }, body: fd,
      });
      if (!r.ok) throw new Error(`Groq STT error ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return (await r.text()).trim();
    }
    if (!s.keys.gemini) throw new Error('Speech-to-text needs a Gemini key (free) or a Groq key. Add one in settings.');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${s.models.gemini}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': s.keys.gemini },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'Transcribe this audio exactly as spoken. Output only the transcript with normal punctuation. If there is no intelligible speech, output nothing.' },
          { inline_data: { mime_type: audio.mime || 'audio/wav', data: audio.base64 } },
        ] }],
        generationConfig: { temperature: 0 },
      }),
    });
    if (!r.ok) throw new Error(`Gemini STT error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    return (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  }
}

module.exports = { LLM, extractJson };
