/// <reference lib="webworker" />
import {
  WorkerRequest,
  WorkerResponse,
  ModelConfig,
} from './aiTypes';
import {
  mockExtractTopics,
  mockGenerateNote,
  mockRouteQuery,
  mockSynthesizeAnswer,
} from './mockEngine';
import { MLCEngine } from '@mlc-ai/web-llm';

let currentConfig: ModelConfig = {
  engine: 'mock-dev',
  modelId: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  contextWindow: 4096,
};

let mlcEngine: MLCEngine | null = null;

// Helper to post typed responses to main thread
function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

// --------------------------------------------------------------------------
// WEBGPU ENGINE (MLC WebLLM)
// --------------------------------------------------------------------------

async function initWebLLMEngine(config: ModelConfig, id: string) {
  post({
    type: 'PROGRESS',
    data: {
      stage: 'downloading',
      progress: 5,
      detail: `Checking WebGPU support and initializing runtime for ${config.modelId}...`,
    },
    id,
  });

  if (typeof navigator !== 'undefined' && !(navigator as any).gpu) {
    throw new Error('WebGPU is not supported in this browser. Please use Chrome/Edge or switch to Dev Mock mode.');
  }

  try {
    mlcEngine = new MLCEngine();
    mlcEngine.setInitProgressCallback((report) => {
      const pct = Math.min(100, Math.max(0, Math.round(report.progress * 100)));
      const stage = pct >= 100 ? 'ready' : pct > 85 ? 'compiling' : 'downloading';
      post({
        type: 'PROGRESS',
        data: {
          stage,
          progress: pct,
          detail: report.text || `Loading model weights (${pct}%)...`,
        },
        id,
      });
    });

    await mlcEngine.reload(config.modelId);

    post({
      type: 'PROGRESS',
      data: {
        stage: 'ready',
        progress: 100,
        detail: `${config.modelId} loaded successfully on WebGPU.`,
      },
      id,
    });
  } catch (err: any) {
    console.error('Failed to initialize WebLLM WebGPU:', err);
    throw new Error(`WebGPU Model Load Error: ${err.message || err}`);
  }
}

// --------------------------------------------------------------------------
// LOCAL OLLAMA ENGINE (HTTP Streaming)
// --------------------------------------------------------------------------

async function queryOllama(
  endpoint: string,
  modelId: string,
  prompt: string,
  systemPrompt?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const url = `${endpoint.replace(/\/+$/, '')}/api/generate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId || 'llama3.2',
      prompt,
      system: systemPrompt,
      stream: !!onChunk,
    }),
  });

  if (!res.ok) {
    throw new Error(`Ollama error (${res.status}): ${res.statusText}. Make sure Ollama is running at ${endpoint}`);
  }

  if (onChunk && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkStr = decoder.decode(value, { stream: true });
      const lines = chunkStr.split('\n').filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const json = JSON.parse(line);
          if (json.response) {
            full += json.response;
            onChunk(json.response);
          }
        } catch {
          // ignore incomplete json chunk
        }
      }
    }
    return full;
  } else {
    const data = await res.json();
    return data.response || '';
  }
}

// Helper to run SLM inference across available engines
async function runSLMGeneration(
  prompt: string,
  systemPrompt?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  if (currentConfig.engine === 'ollama') {
    return await queryOllama(
      currentConfig.ollamaEndpoint || 'http://localhost:11434',
      currentConfig.modelId || 'llama3.2',
      prompt,
      systemPrompt,
      onChunk
    );
  }

  if ((currentConfig.engine === 'webllm-webgpu' || currentConfig.engine === 'litert-webgpu') && mlcEngine) {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    if (onChunk) {
      const stream = await mlcEngine.chat.completions.create({
        messages,
        stream: true,
        temperature: 0.2,
      });
      let full = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      }
      return full;
    } else {
      const reply = await mlcEngine.chat.completions.create({
        messages,
        stream: false,
        temperature: 0.2,
      });
      return reply.choices[0]?.message?.content || '';
    }
  }

  throw new Error('No active SLM engine initialized for neural generation');
}

// --------------------------------------------------------------------------
// WORKER MESSAGE DISPATCHER
// --------------------------------------------------------------------------

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const { id } = req;

  try {
    switch (req.type) {
      case 'INIT': {
        currentConfig = req.config;
        if (req.config.engine === 'mock-dev') {
          post({
            type: 'PROGRESS',
            data: { stage: 'ready', progress: 100, detail: 'Simulated Dev SLM (Instant Heuristic) Active' },
            id,
          });
          post({ type: 'RESULT', data: { success: true }, id });
        } else if (req.config.engine === 'ollama') {
          const endpoint = req.config.ollamaEndpoint || 'http://localhost:11434';
          post({
            type: 'PROGRESS',
            data: { stage: 'ready', progress: 100, detail: `Connected to Local Ollama (${endpoint})` },
            id,
          });
          post({ type: 'RESULT', data: { success: true }, id });
        } else {
          // WebGPU (WebLLM)
          await initWebLLMEngine(req.config, id);
          post({ type: 'RESULT', data: { success: true }, id });
        }
        break;
      }

      case 'EXTRACT_TOPICS': {
        if (currentConfig.engine === 'mock-dev' || (!mlcEngine && currentConfig.engine !== 'ollama')) {
          const result = mockExtractTopics(req.text);
          post({ type: 'RESULT', data: result, id });
        } else {
          const system = `You are an expert research librarian organizing a personal knowledge base.
Extract 1 to 3 distinct core scientific, technical, or domain concepts from the text.
STRICT RULES:
- Never extract document layout or publishing words (e.g. Page, Article, Prevalence, Figure, Author, Review, Results).
- Never extract broad geographic countries (e.g. China, Canada, India) or generic adjectives (e.g. Environmental, Clinical).
- Extract specific subject concepts (e.g. CPE Strains, Carbapenem Resistance, Antibiotics).
- Output STRICTLY a JSON object with this shape:
{"topics": [{"name": "Concept Name", "summary": "1-sentence executive summary", "keyFacts": ["bullet fact 1", "bullet fact 2"]}]}`;

          const prompt = `Analyze this text and extract topics:\n\n${req.text.slice(0, 3000)}\n\nJSON:`;
          try {
            const raw = await runSLMGeneration(prompt, system);
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
            if (Array.isArray(parsed.topics) && parsed.topics.length > 0) {
              post({ type: 'RESULT', data: parsed, id });
            } else {
              post({ type: 'RESULT', data: mockExtractTopics(req.text), id });
            }
          } catch {
            post({ type: 'RESULT', data: mockExtractTopics(req.text), id });
          }
        }
        break;
      }

      case 'GENERATE_NOTE': {
        if (currentConfig.engine === 'mock-dev' || (!mlcEngine && currentConfig.engine !== 'ollama')) {
          const note = mockGenerateNote(req.topic, req.facts, req.existingContent);
          post({ type: 'RESULT', data: note, id });
        } else {
          const system = `You are an expert technical note writer for an Obsidian markdown vault.`;
          const prompt = req.existingContent
            ? `Update this Markdown note for "${req.topic}" by integrating these new facts:\n${req.facts.map((f) => `- ${f}`).join('\n')}\n\nExisting Note:\n${req.existingContent}\n\nOutput only the updated Markdown note with no preamble:`
            : `Write a clean Obsidian markdown note for "${req.topic}" using these facts:\n${req.facts.map((f) => `- ${f}`).join('\n')}\n\nRequired format:
# ${req.topic}

> **Executive Summary**: [Clear 1-sentence definition of ${req.topic}]

## Core Mechanisms & Insights
- **Key Characteristics**: [detail]
- **Implications**: [detail]

## Related Topics & Index
- [[INDEX]]

Output only the Markdown text with no conversational preamble:`;

          try {
            const note = await runSLMGeneration(prompt, system);
            post({ type: 'RESULT', data: note.trim(), id });
          } catch {
            post({ type: 'RESULT', data: mockGenerateNote(req.topic, req.facts, req.existingContent), id });
          }
        }
        break;
      }

      case 'ROUTE_QUERY': {
        if (currentConfig.engine === 'mock-dev' || (!mlcEngine && currentConfig.engine !== 'ollama')) {
          const result = mockRouteQuery(req.query, req.indexSummary);
          post({ type: 'RESULT', data: result, id });
        } else {
          const system = `You are a precise index router for a personal wiki vault.`;
          const prompt = `User Query: "${req.query}"

Wiki Master Index (INDEX.md):
${req.indexSummary}

Select 1 to 3 filenames from the index most relevant to answering the query.
Output strictly JSON:
{"selectedFilenames": ["filename1.md"], "reasoning": "brief explanation"}`;

          try {
            const raw = await runSLMGeneration(prompt, system);
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
            post({ type: 'RESULT', data: parsed, id });
          } catch {
            post({ type: 'RESULT', data: mockRouteQuery(req.query, req.indexSummary), id });
          }
        }
        break;
      }

      case 'SYNTHESIZE_ANSWER': {
        if (currentConfig.engine === 'mock-dev' || (!mlcEngine && currentConfig.engine !== 'ollama')) {
          await mockSynthesizeAnswer(req.query, req.notes, (chunk) => {
            post({ type: 'STREAM_CHUNK', chunk, id });
          });
          post({ type: 'STREAM_DONE', id });
        } else {
          const context = req.notes.map((n) => `### Note: [[${n.filename.replace('.md', '')}]]\n${n.content}`).join('\n\n');
          const system = `You are a grounded knowledge synthesizer for a personal wiki. Answer the user's question strictly and accurately based on the provided wiki notes. Cite note titles using wikilinks [[Note Title]]. If the provided notes do not contain the answer, explicitly state that the notes lack this information and summarize what is available.`;
          const prompt = `Context Notes:
${context}

User Question: "${req.query}"

Answer:`;

          try {
            await runSLMGeneration(prompt, system, (chunk) => {
              post({ type: 'STREAM_CHUNK', chunk, id });
            });
            post({ type: 'STREAM_DONE', id });
          } catch (err: any) {
            post({
              type: 'STREAM_CHUNK',
              chunk: `\n[Neural generation failed: ${err.message}. Falling back to grounded retrieval:]\n\n`,
              id,
            });
            await mockSynthesizeAnswer(req.query, req.notes, (chunk) => {
              post({ type: 'STREAM_CHUNK', chunk, id });
            });
            post({ type: 'STREAM_DONE', id });
          }
        }
        break;
      }
    }
  } catch (err: any) {
    post({ type: 'ERROR', error: err.message || String(err), id });
  }
};
