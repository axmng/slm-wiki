import { vault } from '../vault/vaultService';
import { aiService } from '../ai/aiService';
import { WikiIndexEntry } from '../vault/types';

export interface QueryResult {
  query: string;
  selectedFiles: string[];
  reasoning: string;
  answer: string;
  loadedNotes: { filename: string; preview: string }[];
}

export class QueryPipeline {
  /**
   * Simple client-side BM25 / token scoring fallback when index is exceptionally large
   */
  private preFilterIndex(query: string, entries: WikiIndexEntry[], limit = 10): WikiIndexEntry[] {
    const queryTokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
    
    const scored = entries.map((entry) => {
      let score = 0;
      const text = `${entry.topic} ${entry.summary}`.toLowerCase();
      for (const token of queryTokens) {
        if (text.includes(token)) {
          score += entry.topic.toLowerCase().includes(token) ? 3 : 1;
        }
      }
      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.entry);
  }

  /**
   * Execute hierarchical 2-pass query
   */
  public async executeQuery(
    query: string,
    onTokenChunk?: (chunk: string) => void,
    onRoutingDone?: (selectedFiles: string[], reasoning: string) => void
  ): Promise<QueryResult> {
    // 1. Fetch INDEX.md
    const index = await vault.readIndex();
    let entries = index.entries;

    // Check if index exceeds SLM comfortable context length (> 20 entries)
    if (entries.length > 20) {
      entries = this.preFilterIndex(query, entries, 15);
    }

    const condensedSummary = entries
      .map((e) => `| [[${e.topic}]] | ${e.summary} | ${e.filename} |`)
      .join('\n');

    // 2. Pass 1: Direct SLM Index Routing
    const routing = await aiService.routeQuery(query, condensedSummary);
    const selectedFilenames = routing.selectedFilenames.filter((f) => f && f.endsWith('.md'));

    // Notify UI of Pass 1 completion
    onRoutingDone?.(selectedFilenames, routing.reasoning);

    // 3. Load target Markdown notes from disk
    const loadedNotes: { filename: string; content: string }[] = [];

    for (const filename of selectedFilenames) {
      const topicName = filename.replace('.md', '');
      const page = await vault.readPage(topicName);
      if (page) {
        loadedNotes.push({ filename: page.filename, content: page.content });
      }
    }

    // 4. Pass 2: Grounded Synthesis
    const answer = await aiService.synthesizeAnswer(query, loadedNotes, onTokenChunk);

    return {
      query,
      selectedFiles: selectedFilenames,
      reasoning: routing.reasoning,
      answer,
      loadedNotes: loadedNotes.map((n) => ({
        filename: n.filename,
        preview: n.content.slice(0, 200),
      })),
    };
  }
}

export const queryPipeline = new QueryPipeline();
