/**
 * LLM Provider Abstraction
 * 
 * Supports multiple backends for scenario/script generation:
 *   1. Pi SDK (OAuth — uses Claude Max subscription, zero API cost)
 *   2. Anthropic API (direct, with ANTHROPIC_API_KEY)
 *   3. OpenAI API (GPT-4o/GPT-4-turbo, with OPENAI_API_KEY)
 *   4. Local LLM via OpenAI-compatible API (LM Studio, Ollama, etc.)
 * 
 * Priority: PI_SDK > ANTHROPIC_API_KEY > OPENAI_API_KEY > LLM_BASE_URL (local)
 * Override with LLM_PROVIDER=pi|anthropic|openai|local
 * 
 * Environment variables:
 *   LLM_PROVIDER      — Force a specific provider (optional)
 *   ANTHROPIC_API_KEY  — For direct Anthropic API
 *   OPENAI_API_KEY     — For OpenAI API
 *   LLM_BASE_URL       — For local LLMs (default: http://localhost:1234/v1)
 *   LLM_MODEL          — Override model name for any provider
 */

// ─── Provider Interface ──────────────────────────────────────────────
// Each provider implements: { name, model, generate(systemPrompt, userPrompt) → string }

let activeProvider = null;

// ─── Pi SDK Provider ─────────────────────────────────────────────────
async function createPiProvider() {
  try {
    const pi = await import('@mariozechner/pi-coding-agent');
    const authStorage = pi.AuthStorage.create();
    const modelRegistry = new pi.ModelRegistry(authStorage);

    // Verify auth works
    const key = await authStorage.getApiKey('anthropic').catch(() => null);
    if (!key) return null;

    const modelName = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';
    const model = modelRegistry.find('anthropic', modelName);
    if (!model) return null;

    // Helper: create a Pi SDK session with the given system prompt
    async function createPiSession(systemPrompt) {
      const loader = new pi.DefaultResourceLoader({
        systemPromptOverride: () => systemPrompt,
      });
      await loader.reload();

      const { session } = await pi.createAgentSession({
        model,
        thinkingLevel: 'off',
        authStorage,
        modelRegistry,
        tools: [],
        sessionManager: pi.SessionManager.inMemory(),
        settingsManager: pi.SettingsManager.inMemory({
          compaction: { enabled: false },
          retry: { enabled: true, maxRetries: 2 },
        }),
        resourceLoader: loader,
      });
      return session;
    }

    return {
      name: 'Pi SDK (OAuth)',
      model: modelName,
      generate: async (systemPrompt, userPrompt) => {
        const session = await createPiSession(systemPrompt);
        let text = '';
        session.subscribe((event) => {
          if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
            text += event.assistantMessageEvent.delta;
          }
        });
        await session.prompt(userPrompt);
        session.dispose();
        return text;
      },
      generateStream: async function* (systemPrompt, userPrompt) {
        const session = await createPiSession(systemPrompt);

        // Buffer chunks and yield them via a simple async queue
        const chunks = [];
        let resolve = null;
        let done = false;

        session.subscribe((event) => {
          if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
            chunks.push(event.assistantMessageEvent.delta);
            if (resolve) { resolve(); resolve = null; }
          }
        });

        const promptPromise = session.prompt(userPrompt).then(() => {
          done = true;
          if (resolve) { resolve(); resolve = null; }
        });

        while (!done || chunks.length > 0) {
          if (chunks.length > 0) {
            yield chunks.shift();
          } else {
            await new Promise(r => { resolve = r; });
          }
        }

        session.dispose();
      },
    };
  } catch {
    return null;
  }
}

// ─── Anthropic Direct API Provider ───────────────────────────────────
function createAnthropicProvider() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.LLM_MODEL || 'claude-sonnet-4-20250514';

  return {
    name: 'Anthropic API',
    model,
    generate: async (systemPrompt, userPrompt) => {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16384,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Anthropic API ${resp.status}: ${err}`);
      }

      const data = await resp.json();
      return data.content?.[0]?.text || '';
    },
    generateStream: async function* (systemPrompt, userPrompt) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 16384,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Anthropic API ${resp.status}: ${err}`);
      }

      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of resp.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const event = JSON.parse(data);
            if (event.type === 'content_block_delta' && event.delta?.text) {
              yield event.delta.text;
            }
          } catch {}
        }
      }
    },
  };
}

// ─── OpenAI API Provider ─────────────────────────────────────────────
function createOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.LLM_MODEL || 'gpt-4o';

  return {
    name: 'OpenAI API',
    model,
    generate: async (systemPrompt, userPrompt) => {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 16384,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI API ${resp.status}: ${err}`);
      }

      const data = await resp.json();
      return data.choices?.[0]?.message?.content || '';
    },
    generateStream: async function* (systemPrompt, userPrompt) {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 16384,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI API ${resp.status}: ${err}`);
      }

      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of resp.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const event = JSON.parse(data);
            const text = event.choices?.[0]?.delta?.content;
            if (text) yield text;
          } catch {}
        }
      }
    },
  };
}

// ─── Local LLM Provider (OpenAI-compatible: LM Studio, Ollama, etc.) ─
function createLocalProvider() {
  const baseUrl = process.env.LLM_BASE_URL || 'http://localhost:1234/v1';
  const model = process.env.LLM_MODEL || 'local-model';

  return {
    name: `Local LLM (${baseUrl})`,
    model,
    generate: async (systemPrompt, userPrompt) => {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 16384,
          temperature: 0.7,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Local LLM ${resp.status}: ${err}`);
      }

      const data = await resp.json();
      return data.choices?.[0]?.message?.content || '';
    },
  };
}

// ─── Auto-detect & Initialize ────────────────────────────────────────
export async function initLLM() {
  const forced = process.env.LLM_PROVIDER?.toLowerCase();

  if (forced === 'pi') {
    activeProvider = await createPiProvider();
    if (!activeProvider) throw new Error('LLM_PROVIDER=pi but Pi SDK not available. Install @mariozechner/pi-coding-agent and authenticate.');
  } else if (forced === 'anthropic') {
    activeProvider = createAnthropicProvider();
    if (!activeProvider) throw new Error('LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY not set.');
  } else if (forced === 'openai') {
    activeProvider = createOpenAIProvider();
    if (!activeProvider) throw new Error('LLM_PROVIDER=openai but OPENAI_API_KEY not set.');
  } else if (forced === 'local') {
    activeProvider = createLocalProvider();
  } else {
    // Auto-detect: Pi SDK → Anthropic → OpenAI → Local
    activeProvider = await createPiProvider();
    if (!activeProvider) activeProvider = createAnthropicProvider();
    if (!activeProvider) activeProvider = createOpenAIProvider();
    if (!activeProvider) {
      // Only try local if LLM_BASE_URL is explicitly set
      if (process.env.LLM_BASE_URL) {
        activeProvider = createLocalProvider();
      }
    }
  }

  if (!activeProvider) {
    console.error(`
╔══════════════════════════════════════════════════════════════╗
║  No LLM provider configured.                                ║
║                                                              ║
║  The intake site will serve the form but AI generation       ║
║  will be unavailable. Set one of:                            ║
║                                                              ║
║    ANTHROPIC_API_KEY=sk-ant-...    (Anthropic Claude)        ║
║    OPENAI_API_KEY=sk-...           (OpenAI GPT-4o)           ║
║    LLM_BASE_URL=http://host:port/v1 (LM Studio / Ollama)    ║
║                                                              ║
║  Or install Pi SDK:                                          ║
║    npm link @mariozechner/pi-coding-agent                    ║
║    pi  (authenticate once)                                   ║
╚══════════════════════════════════════════════════════════════╝
`);
    return null;
  }

  return activeProvider;
}

export function getLLM() {
  return activeProvider;
}

/**
 * Hot-swap the active LLM provider at runtime.
 * Called from the settings API to change providers without restarting.
 * @param {string} provider — 'pi' | 'anthropic' | 'openai' | 'local'
 * @param {object} opts — { apiKey, model, baseUrl }
 */
export async function setLLM(provider, opts = {}) {
  // Temporarily set env vars for the provider constructors
  const prevApiKeyAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevApiKeyOpenAI = process.env.OPENAI_API_KEY;
  const prevBaseUrl = process.env.LLM_BASE_URL;
  const prevModel = process.env.LLM_MODEL;

  try {
    if (opts.model) process.env.LLM_MODEL = opts.model;

    if (provider === 'pi') {
      const p = await createPiProvider();
      if (!p) throw new Error('Pi SDK not available. Make sure @mariozechner/pi-coding-agent is installed and authenticated.');
      activeProvider = p;
    } else if (provider === 'anthropic') {
      if (opts.apiKey) process.env.ANTHROPIC_API_KEY = opts.apiKey;
      const p = createAnthropicProvider();
      if (!p) throw new Error('Anthropic requires ANTHROPIC_API_KEY.');
      activeProvider = p;
    } else if (provider === 'openai') {
      if (opts.apiKey) process.env.OPENAI_API_KEY = opts.apiKey;
      const p = createOpenAIProvider();
      if (!p) throw new Error('OpenAI requires OPENAI_API_KEY.');
      activeProvider = p;
    } else if (provider === 'local') {
      if (opts.baseUrl) process.env.LLM_BASE_URL = opts.baseUrl;
      activeProvider = createLocalProvider();
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    return activeProvider;
  } catch (err) {
    // Restore env on failure
    process.env.ANTHROPIC_API_KEY = prevApiKeyAnthropic || '';
    process.env.OPENAI_API_KEY = prevApiKeyOpenAI || '';
    process.env.LLM_BASE_URL = prevBaseUrl || '';
    process.env.LLM_MODEL = prevModel || '';
    if (!process.env.ANTHROPIC_API_KEY) delete process.env.ANTHROPIC_API_KEY;
    if (!process.env.OPENAI_API_KEY) delete process.env.OPENAI_API_KEY;
    if (!process.env.LLM_BASE_URL) delete process.env.LLM_BASE_URL;
    if (!process.env.LLM_MODEL) delete process.env.LLM_MODEL;
    throw err;
  }
}

/**
 * Test the current provider with a minimal generation.
 */
export async function testLLM() {
  if (!activeProvider) throw new Error('No LLM provider configured.');
  const start = Date.now();
  const result = await activeProvider.generate(
    'You are a helpful assistant. Reply in exactly one short sentence.',
    'Say "LLM connection successful" and nothing else.'
  );
  const elapsed = Date.now() - start;
  return { ok: true, response: result.trim(), elapsed, provider: activeProvider.name, model: activeProvider.model };
}

export async function generate(systemPrompt, userPrompt) {
  if (!activeProvider) {
    throw new Error('No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or LLM_BASE_URL.');
  }
  return activeProvider.generate(systemPrompt, userPrompt);
}

/**
 * Stream generation — yields text chunks as they arrive.
 * Returns an async iterable of strings.
 * Falls back to single-chunk if provider doesn't support streaming.
 */
export async function* generateStream(systemPrompt, userPrompt) {
  if (!activeProvider) {
    throw new Error('No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or LLM_BASE_URL.');
  }
  if (activeProvider.generateStream) {
    yield* activeProvider.generateStream(systemPrompt, userPrompt);
  } else {
    // Fallback: non-streaming provider — yield the whole response at once
    const text = await activeProvider.generate(systemPrompt, userPrompt);
    yield text;
  }
}
