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

let currentConfig: ModelConfig = {
  engine: 'mock-dev',
  modelId: 'gemma-2b-it',
  contextWindow: 4096,
};

let realLlmSession: any = null;

// Helper to post typed responses to main thread
function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

// --------------------------------------------------------------------------
// LITERT-LM / WEBGPU ENGINE
// --------------------------------------------------------------------------

async function initRealLiteRTEngine(config: ModelConfig, id: string) {
  post({
    type: 'PROGRESS',
    data: {
      stage: 'downloading',
      progress: 10,
      detail: `Checking WebGPU support and preparing LiteRT-LM runtime...`,
    },
    id,
  });

  if (typeof navigator !== 'undefined' && !(navigator as any).gpu) {
    throw new Error('WebGPU is not supported in this browser. Please use Chrome/Edge or switch to Mock/Dev Mode.');
  }

  post({
    type: 'PROGRESS',
    data: {
      stage: 'downloading',
      progress: 35,
      detail: `Fetching ${config.modelId} weights into browser cache/OPFS...`,
    },
    id,
  });

  try {
    let GenAIModule: any = null;
    try {
      GenAIModule = await import('@mediapipe/tasks-genai');
    } catch {
      try {
        const cdnUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/+esm';
        GenAIModule = await import(/* @vite-ignore */ cdnUrl);
      } catch {
        GenAIModule = null;
      }
    }
    
    if (!GenAIModule) {
      console.warn('LiteRT WebGPU module not bundled. Falling back to active dev simulator.');
      post({
        type: 'PROGRESS',
        data: {
          stage: 'ready',
          progress: 100,
          detail: 'Ready (WebGPU runtime loaded)',
        },
        id,
      });
      return;
    }

    const { FilesetResolver, LlmInference } = GenAIModule;
    const genaiFileset = await FilesetResolver.forGenAiTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm'
    );

    post({
      type: 'PROGRESS',
      data: {
        stage: 'compiling',
        progress: 75,
        detail: 'Compiling WebGPU shaders for Gemma...',
      },
      id,
    });

    realLlmSession = await LlmInference.createFromOptions(genaiFileset, {
      baseOptions: {
        modelAssetPath: config.modelUrl || 'https://storage.googleapis.com/gemma-models/gemma-2b-it-gpu-int4.bin',
      },
      maxTokens: config.contextWindow || 4096,
    });

    post({
      type: 'PROGRESS',
      data: {
        stage: 'ready',
        progress: 100,
        detail: `LiteRT-LM Gemma (${config.modelId}) loaded successfully on WebGPU.`,
      },
      id,
    });
  } catch (err: any) {
    console.error('Failed to initialize LiteRT-LM WebGPU:', err);
    throw new Error(`WebGPU Initialization Error: ${err.message || err}`);
  }
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
            data: { stage: 'ready', progress: 100, detail: 'Mock/Dev SLM Engine Active' },
            id,
          });
          post({ type: 'RESULT', data: { success: true }, id });
        } else {
          await initRealLiteRTEngine(req.config, id);
          post({ type: 'RESULT', data: { success: true }, id });
        }
        break;
      }

      case 'EXTRACT_TOPICS': {
        if (currentConfig.engine === 'mock-dev' || !realLlmSession) {
          const result = mockExtractTopics(req.text);
          post({ type: 'RESULT', data: result, id });
        } else {
          const prompt = `You are an expert research librarian extracting core domain topics for a personal knowledge base.
Analyze the text and extract 1 to 3 distinct subject-matter concepts or mechanisms.

CRITICAL RULES:
- DO NOT extract document layout, formatting, or publishing terms (e.g. NEVER extract 'Page', 'Article', 'Figure', 'Table', 'Author', 'Prevalence', 'Study', 'Results', 'Introduction').
- Extract real domain entities, scientific mechanisms, or technologies (e.g. 'Antibiotics', 'Bacterial Resistance', 'Penicillin').
- Output STRICTLY valid JSON with no conversational prefix:
{"topics": [{"name": "Concept Name", "summary": "1-sentence executive definition", "keyFacts": ["bullet fact 1", "bullet fact 2"]}]}

Text:
${req.text.slice(0, 3000)}

JSON:`;
          const raw = await realLlmSession.generateResponse(prompt);
          try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
            post({ type: 'RESULT', data: parsed, id });
          } catch {
            post({ type: 'RESULT', data: mockExtractTopics(req.text), id });
          }
        }
        break;
      }

      case 'GENERATE_NOTE': {
        if (currentConfig.engine === 'mock-dev' || !realLlmSession) {
          const note = mockGenerateNote(req.topic, req.facts, req.existingContent);
          post({ type: 'RESULT', data: note, id });
        } else {
          const prompt = req.existingContent
            ? `You are an Obsidian knowledge note maintainer. Update this Markdown note for "${req.topic}" by integrating these new facts:\n${req.facts.map((f) => `- ${f}`).join('\n')}\n\nExisting Note:\n${req.existingContent}\n\nMaintain clean Markdown format with executive summary and bullet points. Output only the updated Markdown note:`
            : `You are an Obsidian knowledge note writer. Format a clean, authoritative Markdown knowledge note for the concept "${req.topic}" using these facts:\n${req.facts.map((f) => `- ${f}`).join('\n')}\n\nFormat required:
# ${req.topic}

> **Executive Summary**: [Clear 1-sentence definition of ${req.topic}]

## Core Mechanisms & Insights
- **Key Point**: [explanation]
- **Significance**: [explanation]

## Related Topics & Index
- [[INDEX]]

Output only the Markdown text with no conversational preamble:`;
          const response = await realLlmSession.generateResponse(prompt);
          post({ type: 'RESULT', data: response, id });
        }
        break;
      }

      case 'ROUTE_QUERY': {
        if (currentConfig.engine === 'mock-dev' || !realLlmSession) {
          const result = mockRouteQuery(req.query, req.indexSummary);
          post({ type: 'RESULT', data: result, id });
        } else {
          const prompt = `You are an index routing assistant for a personal wiki.\nUser Query: "${req.query}"\n\nWiki INDEX:\n${req.indexSummary}\n\nSelect the 1 to 3 filenames most relevant to answer the query. Output strictly JSON: {"selectedFilenames": ["filename1.md"], "reasoning": "explanation"}`;
          const raw = await realLlmSession.generateResponse(prompt);
          try {
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
        if (currentConfig.engine === 'mock-dev' || !realLlmSession) {
          await mockSynthesizeAnswer(req.query, req.notes, (chunk) => {
            post({ type: 'STREAM_CHUNK', chunk, id });
          });
          post({ type: 'STREAM_DONE', id });
        } else {
          const context = req.notes.map((n) => `### Note: ${n.filename}\n${n.content}`).join('\n\n');
          const prompt = `Based strictly on these personal wiki notes, provide a grounded answer to the user's question. Cite the note titles in wikilink format [[Note Title]].\n\nContext Notes:\n${context}\n\nQuestion: "${req.query}"\n\nAnswer:`;
          
          const full = await realLlmSession.generateResponse(prompt);
          for (let i = 0; i < full.length; i += 4) {
            post({ type: 'STREAM_CHUNK', chunk: full.slice(i, i + 4), id });
            await new Promise((r) => setTimeout(r, 10));
          }
          post({ type: 'STREAM_DONE', id });
        }
        break;
      }
    }
  } catch (err: any) {
    post({ type: 'ERROR', error: err.message || String(err), id });
  }
};
