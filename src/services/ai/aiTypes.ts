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

export type ModelEngineType = 'gemma4-webgpu' | 'bonsai-webgpu' | 'mock-dev';

export interface ModelPreset {
  id: string;
  engine: ModelEngineType;
  name: string;
  shortName: string;
  description: string;
  hfUrl: string;
  downloadSizeApprox: string;
  vramMB: number;
}

// Strictly the two requested WebGPU models
export const SUPPORTED_MODELS: ModelPreset[] = [
  {
    id: 'onnx-community/gemma-4-E2B-it-ONNX',
    engine: 'gemma4-webgpu',
    name: 'Gemma 4 (Google WebGPU)',
    shortName: 'Gemma 4',
    description: 'In-browser Multimodal AI on WebGPU via Transformers.js (~1.5GB)',
    hfUrl: 'https://huggingface.co/spaces/webml-community/Gemma-4-WebGPU',
    downloadSizeApprox: '~1.5GB',
    vramMB: 2048,
  },
  {
    id: 'prism-ml/Bonsai-27B-gguf',
    engine: 'bonsai-webgpu',
    name: 'Bonsai 27B (Prism ML 1-Bit WebGPU)',
    shortName: 'Bonsai 27B',
    description: '27B-parameter dense model quantized to 1-bit precision running on custom WebGPU kernels (~3.8GB)',
    hfUrl: 'https://huggingface.co/spaces/webml-community/bonsai-webgpu-kernels',
    downloadSizeApprox: '~3.8GB',
    vramMB: 4096,
  },
];

export interface ModelConfig {
  engine: ModelEngineType;
  modelId: string;
  modelUrl?: string;
  contextWindow: number;
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
