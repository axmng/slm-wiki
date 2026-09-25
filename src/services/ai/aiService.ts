import {
  ModelConfig,
  InitProgressEvent,
  TopicExtractionResult,
  RoutingResult,
  WorkerRequestPayload,
  WorkerResponse,
  ModelEngineType,
} from './aiTypes';
import {
  mockExtractTopics,
  mockGenerateNote,
  mockRouteQuery,
  mockSynthesizeAnswer,
} from './mockEngine';

export class AIService {
  private worker: Worker | null = null;
  private currentConfig: ModelConfig = {
    engine: 'mock-dev',
    modelId: 'onnx-community/gemma-4-E2B-it-ONNX',
    contextWindow: 4096,
  };
  private ready = false;
  private pendingRequests = new Map<
    string,
    {
      resolve: (data: any) => void;
      reject: (err: any) => void;
      onChunk?: (chunk: string) => void;
    }
  >();
  private progressCallback?: (event: InitProgressEvent) => void;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;

    try {
      this.worker = new Worker(new URL('./aiWorker.ts', import.meta.url), {
        type: 'module',
      });

      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        const { id, type } = msg;

        if (type === 'PROGRESS') {
          this.progressCallback?.(msg.data);
          return;
        }

        const handler = this.pendingRequests.get(id);
        if (!handler) return;

        if (type === 'STREAM_CHUNK') {
          handler.onChunk?.(msg.chunk);
        } else if (type === 'STREAM_DONE') {
          this.pendingRequests.delete(id);
          handler.resolve(null);
        } else if (type === 'RESULT') {
          this.pendingRequests.delete(id);
          handler.resolve(msg.data);
        } else if (type === 'ERROR') {
          this.pendingRequests.delete(id);
          handler.reject(new Error(msg.error));
        }
      };
    } catch {
      console.warn('Worker instantiation not available in current environment. Using inline engine.');
      this.worker = null;
    }
  }

  private postRequest<T>(payload: WorkerRequestPayload, onChunk?: (chunk: string) => void): Promise<T> {
    if (!this.worker) {
      // Direct execution fallback (Node/SSR/Vitest)
      return this.executeInline<T>(payload, onChunk);
    }

    const id = Math.random().toString(36).slice(2, 10);
    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject, onChunk });
      this.worker?.postMessage({ ...payload, id });
    });
  }

  private async executeInline<T>(payload: WorkerRequestPayload, onChunk?: (chunk: string) => void): Promise<T> {
    switch (payload.type) {
      case 'INIT':
        return { success: true } as unknown as T;
      case 'EXTRACT_TOPICS':
        return mockExtractTopics(payload.text) as unknown as T;
      case 'GENERATE_NOTE':
        return mockGenerateNote(payload.topic, payload.facts, payload.existingContent) as unknown as T;
      case 'ROUTE_QUERY':
        return mockRouteQuery(payload.query, payload.indexSummary) as unknown as T;
      case 'SYNTHESIZE_ANSWER':
        return (await mockSynthesizeAnswer(payload.query, payload.notes, onChunk)) as unknown as T;
    }
  }

  public async initModel(
    config?: Partial<ModelConfig>,
    onProgress?: (event: InitProgressEvent) => void
  ): Promise<void> {
    if (config) {
      this.currentConfig = { ...this.currentConfig, ...config };
    }
    this.progressCallback = onProgress;

    await this.postRequest({
      type: 'INIT',
      config: this.currentConfig,
    });
    this.ready = true;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public getConfig(): ModelConfig {
    return this.currentConfig;
  }

  public async switchEngine(
    engine: ModelEngineType,
    modelId?: string,
    onProgress?: (event: InitProgressEvent) => void
  ): Promise<void> {
    this.currentConfig.engine = engine;
    if (modelId) this.currentConfig.modelId = modelId;
    await this.initModel(this.currentConfig, onProgress || this.progressCallback);
  }

  public async extractTopics(text: string): Promise<TopicExtractionResult> {
    return await this.postRequest<TopicExtractionResult>({
      type: 'EXTRACT_TOPICS',
      text,
    });
  }

  public async generateNote(
    topic: string,
    facts: string[],
    existingContent?: string
  ): Promise<string> {
    return await this.postRequest<string>({
      type: 'GENERATE_NOTE',
      topic,
      facts,
      existingContent,
    });
  }

  public async routeQuery(query: string, indexSummary: string): Promise<RoutingResult> {
    return await this.postRequest<RoutingResult>({
      type: 'ROUTE_QUERY',
      query,
      indexSummary,
    });
  }

  public async synthesizeAnswer(
    query: string,
    notes: { filename: string; content: string }[],
    onChunk?: (token: string) => void
  ): Promise<string> {
    let full = '';
    const res = await this.postRequest<string>(
      {
        type: 'SYNTHESIZE_ANSWER',
        query,
        notes,
      },
      (chunk) => {
        full += chunk;
        onChunk?.(chunk);
      }
    );
    return res || full;
  }
}

export const aiService = new AIService();
