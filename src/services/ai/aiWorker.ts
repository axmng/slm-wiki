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
import { Bonsai27B, DEFAULT_GGUF_FILE, DEFAULT_MODEL_ID } from './bonsaiRuntime.js';

let currentConfig: ModelConfig = {
  engine: 'mock-dev',
  modelId: 'onnx-community/gemma-4-E2B-it-ONNX',
  contextWindow: 4096,
};

// Model sessions
let bonsaiSession: any = null;
let gemmaTokenizer: any = null;
let gemmaModel: any = null;

// Helper to post typed responses to main thread
function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

// --------------------------------------------------------------------------
// 1. GEMMA 4 (ONNX Runtime Web / Transformers.js WebGPU)
// --------------------------------------------------------------------------

async function initGemma4(config: ModelConfig, id: string) {
  post({
    type: 'PROGRESS',
    data: {
      stage: 'downloading',
      progress: 5,
      detail: 'Requesting WebGPU device and initializing Gemma 4 runtime...',
    },
    id,
  });

  if (typeof navigator !== 'undefined' && !(navigator as any).gpu) {
    throw new Error('WebGPU is not supported in this browser. Please use Chrome/Edge or switch to Dev Mock mode.');
  }

  try {
    const { AutoTokenizer, AutoModelForCausalLM } = await import('@huggingface/transformers');
    const modelId = config.modelId || 'onnx-community/gemma-4-E2B-it-ONNX';

    post({
      type: 'PROGRESS',
      data: {
        stage: 'downloading',
        progress: 15,
        detail: `Fetching Gemma 4 tokenizer from Hugging Face...`,
      },
      id,
    });

    gemmaTokenizer = await AutoTokenizer.from_pretrained(modelId);

    post({
      type: 'PROGRESS',
      data: {
        stage: 'downloading',
        progress: 25,
        detail: `Downloading Gemma 4 weights (q4f16 on WebGPU)...`,
      },
      id,
    });

    gemmaModel = await AutoModelForCausalLM.from_pretrained(modelId, {
      dtype: {
        embed_tokens: 'q4f16',
        decoder_model_merged: 'q4f16',
      },
      device: 'webgpu',
      progress_callback: (e: any) => {
        if (e && e.status === 'progress' && e.total) {
          const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
          const stage = pct >= 95 ? 'compiling' : 'downloading';
          post({
            type: 'PROGRESS',
            data: {
              stage,
              progress: pct,
              detail: `Downloading Gemma 4 (${pct}%)...`,
            },
            id,
          });
        }
      },
    });

    post({
      type: 'PROGRESS',
      data: {
        stage: 'ready',
        progress: 100,
        detail: 'Gemma 4 loaded successfully on WebGPU.',
      },
      id,
    });
  } catch (err: any) {
    console.error('Failed to load Gemma 4:', err);
    throw new Error(`Gemma 4 Load Error: ${err.message || err}`);
  }
}

async function generateGemma4(
  prompt: string,
  systemPrompt?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  const { TextStreamer } = await import('@huggingface/transformers');
  const fullPrompt = systemPrompt
    ? `<start_of_turn>system\n${systemPrompt}<end_of_turn>\n<start_of_turn>user\n${prompt}<end_of_turn>\n<start_of_turn>model\n`
    : `<start_of_turn>user\n${prompt}<end_of_turn>\n<start_of_turn>model\n`;

  const inputs = await gemmaTokenizer(fullPrompt);
  let full = '';

  const streamer = new TextStreamer(gemmaTokenizer, {
    skip_prompt: true,
    callback_function: (chunk: string) => {
      full += chunk;
      onChunk?.(chunk);
    },
  });

  await gemmaModel.generate({
    ...inputs,
    max_new_tokens: 1024,
    streamer,
  });

  return full;
}

// --------------------------------------------------------------------------
// 2. BONSAI 27B (Prism ML 1-Bit WebGPU Kernels)
// --------------------------------------------------------------------------

async function initBonsai27B(config: ModelConfig, id: string) {
  post({
    type: 'PROGRESS',
    data: {
      stage: 'downloading',
      progress: 5,
      detail: 'Requesting WebGPU device and checking 1-bit Bonsai kernels...',
    },
    id,
  });

  if (typeof navigator !== 'undefined' && !(navigator as any).gpu) {
    throw new Error('WebGPU is not supported in this browser. Please use Chrome/Edge or switch to Dev Mock mode.');
  }

  try {
    const modelId = config.modelId || DEFAULT_MODEL_ID;

    bonsaiSession = await Bonsai27B.load(modelId, {
      file: DEFAULT_GGUF_FILE,
      onProgress: (event: any) => {
        if (event.loadedBytes && event.totalBytes) {
          const pct = Math.min(100, Math.round((event.loadedBytes / event.totalBytes) * 100));
          const stage = pct >= 95 ? 'compiling' : 'downloading';
          post({
            type: 'PROGRESS',
            data: {
              stage,
              progress: pct,
              detail: event.message || `Downloading Bonsai 27B 1-bit weights (${pct}%)...`,
            },
            id,
          });
        } else if (event.message) {
          post({
            type: 'PROGRESS',
            data: {
              stage: 'compiling',
              progress: 50,
              detail: event.message,
            },
            id,
          });
        }
      },
    });

    post({
      type: 'PROGRESS',
      data: {
        stage: 'ready',
        progress: 100,
        detail: 'Bonsai 27B loaded successfully on WebGPU.',
      },
      id,
    });
  } catch (err: any) {
    console.error('Failed to load Bonsai 27B:', err);
    throw new Error(`Bonsai 27B Load Error: ${err.message || err}`);
  }
}

async function generateBonsai27B(
  prompt: string,
  systemPrompt?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  if (!bonsaiSession) throw new Error('Bonsai 27B session not initialized');

  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const stream = bonsaiSession.generate(messages, { maxNewTokens: 1024 });
  let full = '';

  for await (const tok of stream) {
    if (tok.delta) {
      full += tok.delta;
      onChunk?.(tok.delta);
    }
  }

  return full;
}

// --------------------------------------------------------------------------
// UNIFIED NEURAL GENERATION DISPATCHER
// --------------------------------------------------------------------------

async function runNeuralGeneration(
  prompt: string,
  systemPrompt?: string,
  onChunk?: (chunk: string) => void
): Promise<string> {
  if (currentConfig.engine === 'gemma4-webgpu' && gemmaModel) {
    return await generateGemma4(prompt, systemPrompt, onChunk);
  }

  if (currentConfig.engine === 'bonsai-webgpu' && bonsaiSession) {
    return await generateBonsai27B(prompt, systemPrompt, onChunk);
  }

  throw new Error(`No active WebGPU model session loaded for ${currentConfig.engine}`);
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
        } else if (req.config.engine === 'gemma4-webgpu') {
          await initGemma4(req.config, id);
          post({ type: 'RESULT', data: { success: true }, id });
        } else if (req.config.engine === 'bonsai-webgpu') {
          await initBonsai27B(req.config, id);
          post({ type: 'RESULT', data: { success: true }, id });
        }
        break;
      }

      case 'EXTRACT_TOPICS': {
        const isNeuralReady =
          (currentConfig.engine === 'gemma4-webgpu' && !!gemmaModel) ||
          (currentConfig.engine === 'bonsai-webgpu' && !!bonsaiSession);

        if (currentConfig.engine === 'mock-dev' || !isNeuralReady) {
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
            const raw = await runNeuralGeneration(prompt, system);
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
        const isNeuralReady =
          (currentConfig.engine === 'gemma4-webgpu' && !!gemmaModel) ||
          (currentConfig.engine === 'bonsai-webgpu' && !!bonsaiSession);

        if (currentConfig.engine === 'mock-dev' || !isNeuralReady) {
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
            const note = await runNeuralGeneration(prompt, system);
            post({ type: 'RESULT', data: note.trim(), id });
          } catch {
            post({ type: 'RESULT', data: mockGenerateNote(req.topic, req.facts, req.existingContent), id });
          }
        }
        break;
      }

      case 'ROUTE_QUERY': {
        const isNeuralReady =
          (currentConfig.engine === 'gemma4-webgpu' && !!gemmaModel) ||
          (currentConfig.engine === 'bonsai-webgpu' && !!bonsaiSession);

        if (currentConfig.engine === 'mock-dev' || !isNeuralReady) {
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
            const raw = await runNeuralGeneration(prompt, system);
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
        const isNeuralReady =
          (currentConfig.engine === 'gemma4-webgpu' && !!gemmaModel) ||
          (currentConfig.engine === 'bonsai-webgpu' && !!bonsaiSession);

        if (currentConfig.engine === 'mock-dev' || !isNeuralReady) {
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
            await runNeuralGeneration(prompt, system, (chunk) => {
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
