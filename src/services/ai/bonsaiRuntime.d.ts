export interface BonsaiProgressEvent {
  status: string;
  message?: string;
  loadedBytes?: number;
  totalBytes?: number;
}

export interface BonsaiToken {
  token: number | null;
  delta: string;
}

export interface BonsaiChatSession {
  thinkCloseTokenId?: number | null;
  generate(
    messages: { role: string; content: string }[],
    options?: { signal?: AbortSignal; maxNewTokens?: number }
  ): AsyncIterable<BonsaiToken>;
}

export interface BonsaiLoadOptions {
  file?: string;
  revision?: string;
  accessToken?: string;
  cache?: boolean;
  maxLength?: number;
  onProgress?: (event: BonsaiProgressEvent) => void;
}

export class Bonsai27B {
  static DEFAULT_MODEL_ID: string;
  static load(
    modelId?: string | null,
    options?: BonsaiLoadOptions
  ): Promise<BonsaiChatSession>;
}

export const DEFAULT_GGUF_FILE: string;
export const DEFAULT_MODEL_ID: string;
export default Bonsai27B;
