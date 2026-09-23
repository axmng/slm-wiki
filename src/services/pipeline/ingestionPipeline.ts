import { vault } from '../vault/vaultService';
import { aiService } from '../ai/aiService';
import { ExtractedTopic } from '../ai/aiTypes';
import { areTopicsEquivalent, getTopicVariants } from '../utils/textNormalization';

export type IngestionStage =
  | 'idle'
  | 'saving_raw'
  | 'extracting_topics'
  | 'updating_pages'
  | 'updating_index'
  | 'completed'
  | 'error';

export interface IngestionProgress {
  stage: IngestionStage;
  message: string;
  percent: number;
  extractedTopics?: ExtractedTopic[];
  updatedFiles?: string[];
  rawFilename?: string;
}

export class IngestionPipeline {
  /**
   * Split long text into manageable chunks respecting paragraph boundaries
   */
  public chunkText(text: string, maxChunkLength = 2500): string[] {
    const paragraphs = text.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      if ((currentChunk + '\n\n' + para).length > maxChunkLength && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = para;
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Run the complete automated Map-Reduce Ingestion Pipeline
   */
  public async ingest(
    rawText: string,
    sourceTitle?: string,
    onProgress?: (progress: IngestionProgress) => void,
    targetWiki?: string
  ): Promise<{ rawFilename: string; updatedPages: string[]; topics: ExtractedTopic[]; wikiName: string }> {
    if (targetWiki && targetWiki.trim() !== '') {
      const cleanWiki = targetWiki.trim();
      const wikis = await vault.listWikis();
      if (!wikis.includes(cleanWiki)) {
        await vault.createWiki(cleanWiki);
      } else {
        await vault.setActiveWiki(cleanWiki);
      }
    }

    const currentWikiName = vault.getActiveWiki();
    const title = sourceTitle || rawText.trim().split('\n')[0].slice(0, 40) || 'Untitled Note';

    try {
      // 1. Save raw clip
      onProgress?.({
        stage: 'saving_raw',
        message: `Archiving raw document into wiki "${currentWikiName}" raw/ folder...`,
        percent: 15,
      });

      const rawFilename = await vault.saveRaw(title, rawText);

      // 2. Chunk text and extract topics
      onProgress?.({
        stage: 'extracting_topics',
        message: 'Analyzing concepts and topics with local SLM...',
        percent: 30,
      });

      const chunks = this.chunkText(rawText);
      const topicMap = new Map<string, ExtractedTopic>();

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const res = await aiService.extractTopics(chunk);
        for (const t of res.topics) {
          const normName = t.name.trim();
          if (!normName) continue;

          let matchedKey: string | null = null;
          for (const key of topicMap.keys()) {
            if (areTopicsEquivalent(key, normName)) {
              matchedKey = key;
              break;
            }
          }

          if (matchedKey) {
            const existing = topicMap.get(matchedKey)!;
            existing.keyFacts = Array.from(new Set([...existing.keyFacts, ...t.keyFacts]));
            if (normName.length > existing.name.length && normName.endsWith('s')) {
              topicMap.delete(matchedKey);
              existing.name = normName;
              topicMap.set(normName, existing);
            }
          } else {
            topicMap.set(normName, t);
          }
        }
      }

      const allTopics = Array.from(topicMap.values());

      onProgress?.({
        stage: 'extracting_topics',
        message: `Extracted ${allTopics.length} topic nodes.`,
        percent: 50,
        extractedTopics: allTopics,
      });

      // 3. Update or create pages sequentially
      onProgress?.({
        stage: 'updating_pages',
        message: 'Integrating facts and generating Markdown notes...',
        percent: 60,
      });

      const updatedPages: string[] = [];
      const allKnownPageNames = await vault.listPages();

      for (let i = 0; i < allTopics.length; i++) {
        const topic = allTopics[i];
        const matchedPageName = await vault.findExistingPageName(topic.name);
        const canonicalTopicName = matchedPageName || topic.name;

        const existingPage = await vault.readPage(canonicalTopicName);

        const newNoteContent = await aiService.generateNote(
          canonicalTopicName,
          topic.keyFacts,
          existingPage ? existingPage.content : undefined
        );

        // Deterministic wikilink cross-referencing
        const enhancedContent = this.linkifyReferences(newNoteContent, canonicalTopicName, allKnownPageNames);

        const savedPage = await vault.savePage(canonicalTopicName, enhancedContent);
        if (!updatedPages.includes(savedPage.filename)) {
          updatedPages.push(savedPage.filename);
        }

        const progressPercent = 60 + Math.round(((i + 1) / allTopics.length) * 25);
        onProgress?.({
          stage: 'updating_pages',
          message: `Updated note: ${savedPage.filename}`,
          percent: progressPercent,
          updatedFiles: updatedPages,
        });
      }

      // 4. Update INDEX.md deterministically
      onProgress?.({
        stage: 'updating_index',
        message: 'Synchronizing INDEX.md and appending to LOG.md...',
        percent: 90,
      });

      const index = await vault.readIndex();
      const today = new Date().toISOString().slice(0, 10);

      for (const topic of allTopics) {
        const matchedPageName = await vault.findExistingPageName(topic.name);
        const canonicalName = matchedPageName || topic.name;

        const existingEntryIndex = index.entries.findIndex(
          (e) => areTopicsEquivalent(e.topic, canonicalName)
        );

        if (existingEntryIndex >= 0) {
          index.entries[existingEntryIndex].topic = canonicalName;
          index.entries[existingEntryIndex].summary = topic.summary;
          index.entries[existingEntryIndex].filename = vault.sanitizeFilename(canonicalName);
          index.entries[existingEntryIndex].lastUpdated = today;
        } else {
          index.entries.push({
            topic: canonicalName,
            summary: topic.summary,
            filename: vault.sanitizeFilename(canonicalName),
            lastUpdated: today,
          });
        }
      }

      // Sort index alphabetically by topic name
      index.entries.sort((a, b) => a.topic.localeCompare(b.topic));
      await vault.saveIndex(index);

      // Append to LOG.md
      await vault.appendToLog(
        'INGEST',
        `Archived "${rawFilename}". Generated/Updated ${updatedPages.length} notes: ${updatedPages.map(p => `[[${p.replace('.md', '')}]]`).join(', ')}.`
      );

      onProgress?.({
        stage: 'completed',
        message: 'Ingestion pipeline completed successfully!',
        percent: 100,
        extractedTopics: allTopics,
        updatedFiles: updatedPages,
        rawFilename,
      });

      return {
        rawFilename,
        updatedPages,
        topics: allTopics,
        wikiName: currentWikiName,
      };
    } catch (err: any) {
      onProgress?.({
        stage: 'error',
        message: err.message || 'Ingestion failed',
        percent: 0,
      });
      throw err;
    }
  }

  /**
   * Deterministically insert [[Wikilinks]] for known pages mentioned in text
   */
  public linkifyReferences(content: string, currentTopic: string, knownPages: string[]): string {
    let result = content;
    for (const page of knownPages) {
      if (areTopicsEquivalent(page, currentTopic)) continue;

      const variants = getTopicVariants(page);
      for (const variant of variants) {
        const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?<!\\[\\[)\\b(${escaped})\\b(?!\\]\\])`, 'gi');
        result = result.replace(regex, `[[${page}|$1]]`);
      }
    }
    // Clean up redundant aliases like [[Antibiotics|Antibiotics]] -> [[Antibiotics]]
    result = result.replace(/\[\[([^|]+)\|\1\]\]/gi, '[[$1]]');
    return result;
  }
}

export const ingestionPipeline = new IngestionPipeline();
