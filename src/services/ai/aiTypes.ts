export interface ExtractedTopic {
  name: string;
  summary: string;
  keyFacts: string[];
}

export interface TopicExtractionResult {
  topics: ExtractedTopic[];
}

export interface RoutingResult {
  selectedFilenames: string[];
  reasoning: string;
}

export type ModelEngineType = 'webllm-webgpu' | 'litert-webgpu' | 'mock-dev' | 'ollama';

export interface ModelPreset {
  id: string;
  name: string;
  description: string;
  vramMB: number;
  downloadSizeApprox: string;
}

export const WEBLLM_PRESETS: ModelPreset[] = [
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 0.5B (Fast WebGPU)',
    description: 'Ultra-lightweight, fast WebGPU inference in browser (~350MB download)',
    vramMB: 945,
    downloadSizeApprox: '~350MB',
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 1.7B (High Quality)',
    description: 'Balanced performance and depth for knowledge synthesis (~1GB download)',
    vramMB: 1774,
    downloadSizeApprox: '~1GB',
  },
  {
    id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    name: 'Llama 3.2 1B (Meta)',
    description: 'Compact Meta instruction-tuned SLM (~800MB download)',
    vramMB: 879,
    downloadSizeApprox: '~800MB',
  },
  {
    id: 'gemma-2-2b-it-q4f16_1-MLC',
    name: 'Gemma 2 2B (Google)',
    description: 'Google Gemma 2 architecture for structured reasoning (~1.4GB download)',
    vramMB: 1895,
    downloadSizeApprox: '~1.4GB',
  },
];

export interface ModelConfig {
  engine: ModelEngineType;
  modelId: string;
  modelUrl?: string;
  contextWindow: number;
  ollamaEndpoint?: string;
}

export interface InitProgressEvent {
  stage: 'downloading' | 'compiling' | 'ready' | 'error';
  progress: number; // 0 to 100
  detail: string;
}

export type WorkerRequestPayload =
  | { type: 'INIT'; config: ModelConfig }
  | { type: 'EXTRACT_TOPICS'; text: string }
  | { type: 'GENERATE_NOTE'; topic: string; facts: string[]; existingContent?: string }
  | { type: 'ROUTE_QUERY'; query: string; indexSummary: string }
  | { type: 'SYNTHESIZE_ANSWER'; query: string; notes: { filename: string; content: string }[] };

export type WorkerRequest = WorkerRequestPayload & { id: string };

export type WorkerResponse =
  | { type: 'PROGRESS'; data: InitProgressEvent; id: string }
  | { type: 'RESULT'; data: unknown; id: string }
  | { type: 'STREAM_CHUNK'; chunk: string; id: string }
  | { type: 'STREAM_DONE'; id: string }
  | { type: 'ERROR'; error: string; id: string };
