# JARVIS DL

An open-source, voice-first AI companion that lives in a floating **Dynamic Island** at the top of your Windows 10/11 screen. It listens when called, talks back, and can operate your PC.

Speaking is usually much faster than typing (roughly 150-220 wpm vs 35-40 wpm for many people), so dictation and voice commands can save real time. Your results will vary.

> **Status: v0.1.** Written and unit-tested on Linux; the Windows-specific parts (global hotkeys, PowerShell input, screen capture) have not yet been run on a real Windows machine. Please open an issue if something misbehaves.

## Features

| Feature | How |
|---|---|
| **Dictate anywhere** | Hold **Ctrl+Win** in any app, speak, release. Cleaned-up text is pasted at your cursor. |
| **Circle to ask** | Hold **Ctrl+Shift**, circle part of the screen with the mouse, and ask aloud. The circled crop plus the full screen go to a vision model. |
| **Talk to the agent** | **Ctrl+Alt+J** (or click the mic) to start/stop. It can answer, research, open apps, change settings, schedule, remember, or run multi-step computer-use tasks. |
| **Agent actions** | Vision loop: screenshot, pick one action (click, type, key, scroll, open app/URL), repeat, up to 15 steps. |
| **Voice scheduling** | "Remind me at 6 pm to call Sam", "Open the quarterly report tomorrow at 9." Persists across restarts. |
| **Multitask queue** | Up to 3 background tasks; only one drives mouse/keyboard at a time. **Pause** key stops everything. |
| **Web research** | Tavily search, summarised by your model. |
| **Island settings** | Hover and scroll down: provider/keys, five customisation slots, abilities, dark mode, master volume, Wi-Fi, wallpaper switcher, memory. |
| **Memory** | "Remember that I prefer concise emails." Facts are included in future prompts. |
| **Safety checks** | Sensitive goals (delete, buy, install, ...) and risky actions (terminals, Alt+F4, destructive commands) need on-screen approval. |

### Five customisation slots

1. **Soul**: geodisc or constellation orb, any colour
2. **Personality**: JARVIS, FRIDAY, EDITH, ULTRON, VERONICA, VERGIL (edit `data/personalities.json` to add more)
3. **Voice**: any installed Windows TTS voice, speed and pitch
4. **Abilities**: toggle each capability on or off
5. **Dictation style**: verbatim, clean, formal, casual, concise

## Install

Requirements: Windows 10/11, [Node.js 18+](https://nodejs.org), and a microphone.

```powershell
git clone https://github.com/<your-username>/jarvis-dl.git
cd jarvis-dl
.\install.ps1        # or: npm install
npm start
```

Then hover over the island, scroll down, and paste a **free Gemini API key** from <https://aistudio.google.com/apikey>. Optionally add a Tavily key (<https://tavily.com>) for web research.

To build an installer: `npm run dist` (output in `dist/`).

### Model providers

| Provider | Needs | Notes |
|---|---|---|
| Google Gemini (default) | free key | Also used for speech-to-text |
| Groq | key | Fast; Whisper for speech-to-text |
| OpenRouter | key | Any hosted model |
| Ollama | local server | Use a vision model (e.g. `llava`) for circle-to-ask and computer use |
| LM Studio | local server | OpenAI-compatible endpoint |

Speech-to-text uses Gemini or Groq Whisper, so even with a local language model you still need one of those two keys unless you adapt `electron/lib/llm.js`.

## Architecture

```
electron/
  main.js          windows, tray, IPC, voice flows
  preload*.js      locked-down context bridges
  lib/
    llm.js         Gemini / OpenAI-compatible chat + speech-to-text
    tavily.js      web research
    agent.js       router + vision computer-use loop (multitask orchestration)
    tasks.js       background task queue
    computer.js    real Windows input via a persistent PowerShell host
    psHost.js      PowerShell process manager
    hotkeys.js     global push-to-talk chords (uiohook-napi)
    screen.js      screen capture and region crop
    scheduler.js   voice-scheduled items
    safety.js      confirmation gates
    keys.js        key-spec to SendKeys translation
  native/init.ps1  Win32 helpers (mouse, keys, volume, theme, wallpaper)
renderer/          island UI, canvas orb, recorder, TTS, settings
data/              personalities
tests/             node --test unit tests
```

Only the language model is remote; automation, memory, scheduling and safety checks run locally. Screenshots and audio are sent to the provider you choose, and API keys are stored in plain text in `%APPDATA%/jarvis-dl/settings.json`.

## Development

```bash
npm run check   # syntax-check every file
npm test        # unit tests (platform independent)
npm run icon    # regenerate assets/icon.png
```

## Known limitations

- Windows-only for system control. Wi-Fi uses `netsh`, volume uses media keys.
- The Windows key is a modifier of the Ctrl+Win chord; a masking keypress prevents the Start menu from opening.
- Admin/elevated windows ignore input from non-elevated apps.
- Computer-use accuracy depends on the vision model; keep **Confirm risky actions** on.
- Routines are expressed as scheduled tasks; there is no separate routine editor yet.

## License

MIT
