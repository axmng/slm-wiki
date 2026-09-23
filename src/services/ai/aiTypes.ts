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

export type ModelEngineType = 'litert-webgpu' | 'mock-dev';

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
