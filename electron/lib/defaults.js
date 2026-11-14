// Default settings. User overrides are deep-merged on top and saved in %APPDATA%/jarvis-dl/settings.json
module.exports = {
  provider: 'gemini', // gemini | groq | openrouter | ollama | lmstudio
  sttProvider: 'gemini', // gemini | groq
  keys: { gemini: '', groq: '', openrouter: '', tavily: '' },
  models: {
    gemini: 'gemini-2.5-flash',
    groq: 'llama-3.3-70b-versatile',
    openrouter: 'google/gemini-2.5-flash',
    ollama: 'llama3.2',
    lmstudio: 'local-model',
  },
  visionModels: {
    groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
    openrouter: 'google/gemini-2.5-flash',
    ollama: 'llava',
    lmstudio: 'local-model',
  },
  baseUrls: { ollama: 'http://localhost:11434/v1', lmstudio: 'http://localhost:1234/v1' },
  // The five customisation slots
  slots: {
    soul: { style: 'geodisc', color: '#5ec8ff' }, // geodisc | constellation
    personality: 'jarvis',
    voice: { name: '', rate: 1, pitch: 1 },
    abilities: {
      open_app: true, open_url: true, computer_use: true, research: true, schedule: true,
      volume: true, dark_mode: true, wifi: true, wallpaper: true, memory: true,
    },
    dictation: 'clean', // verbatim | clean | formal | casual | concise
  },
  wallpaperDir: '',
  confirmRisky: true,
};
