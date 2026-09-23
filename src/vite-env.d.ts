/// <reference types="vite/client" />

declare module '@mediapipe/tasks-genai' {
  export const FilesetResolver: any;
  export const LlmInference: any;
}

declare module 'mammoth' {
  export function extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: any[] }>;
  export function convertToMarkdown(options: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: any[] }>;
}
