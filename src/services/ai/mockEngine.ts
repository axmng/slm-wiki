import { TopicExtractionResult, RoutingResult } from './aiTypes';
import { getCanonicalRoot } from '../utils/textNormalization';

// Comprehensive blacklist of structural, layout, publishing, and generic discourse words
const STOP_WORDS = new Set([
  // Document structure & publishing metadata
  'page', 'pages', 'article', 'articles', 'paper', 'papers', 'chapter', 'section', 'sections',
  'figure', 'figures', 'table', 'tables', 'author', 'authors', 'abstract', 'introduction',
  'conclusion', 'conclusions', 'discussion', 'result', 'results', 'method', 'methods',
  'methodology', 'references', 'reference', 'bibliography', 'volume', 'issue', 'doi',
  'journal', 'university', 'department', 'institute', 'press', 'publisher', 'proceedings',
  'copyright', 'review', 'analysis', 'study', 'studies', 'report', 'survey', 'prevalence',
  'rate', 'rates', 'data', 'dataset', 'appendix', 'index', 'et al', 'sample', 'samples',
  'background', 'material', 'materials', 'supplementary', 'acknowledgements',

  // Common English discourse words often capitalized at start of sentences
  'this', 'that', 'these', 'those', 'there', 'their', 'they', 'what', 'where', 'when',
  'which', 'with', 'from', 'have', 'been', 'also', 'such', 'more', 'most', 'some',
  'many', 'each', 'every', 'other', 'another', 'both', 'only', 'well', 'very', 'even',
  'first', 'second', 'third', 'last', 'further', 'overall', 'specifically', 'particularly',
  'generally', 'importantly', 'furthermore', 'moreover', 'however', 'although', 'therefore',
  'thus', 'hence', 'instead', 'meanwhile', 'finally', 'then', 'here', 'now', 'since',
  'while', 'whereas', 'because', 'despite', 'according', 'based', 'using', 'given',
  'shown', 'noted', 'observed', 'discussed', 'described', 'found', 'seen', 'known',
  'regarding', 'concerning', 'including', 'various', 'several', 'multiple', 'different',
  'similar', 'major', 'significant', 'critical', 'potential', 'possible', 'likely',
  'today', 'recent', 'recently', 'current', 'currently', 'future', 'past', 'daily',
  'total', 'average', 'number', 'high', 'higher', 'highest', 'low', 'lower', 'lowest'
]);

function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase().trim());
}

/**
 * Clean raw text from citations, bracket references [1, 2], and artifacts
 */
function cleanTextContent(text: string): string {
  return text
    .replace(/---+[\s\w\d-]*---+/g, '') // remove page and divider markers like --- Page 1 ---
    .replace(/\bPage\s+\d+\b/gi, '') // remove Page 12
    .replace(/\[\d+(?:[,\s-]+\d+)*\]/g, '') // remove citation brackets [1, 2]
    .replace(/\((?:see\s+)?(?:fig|table|eq)\.?\s*\d+[a-z]?\)/gi, '') // remove (see Fig. 1)
    .replace(/\b(?:https?|ftp):\/\/\S+/gi, '') // remove URLs
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Intelligent entity and domain concept extractor with frequency & salience ranking
 */
export function mockExtractTopics(rawText: string): TopicExtractionResult {
  const cleaned = cleanTextContent(rawText);

  // Find candidate capitalized phrases (1 to 3 words)
  const matches = cleaned.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g) || [];
  const candidateScores = new Map<string, { term: string; score: number; count: number }>();

  for (const m of matches) {
    const trimmed = m.trim();
    const words = trimmed.split(/\s+/);

    // Rule 1: Check if single word is a stopword or too short
    if (words.length === 1 && (isStopWord(words[0]) || words[0].length < 4)) {
      continue;
    }

    // Rule 2: Multi-word phrase must not start or end with a stopword
    // (e.g. "Article Prevalence" -> rejected because "article" and "prevalence" are stopwords)
    if (isStopWord(words[0]) || isStopWord(words[words.length - 1])) {
      continue;
    }

    // Canonical root grouping (groups 'Antibiotic' and 'Antibiotics' into the same entry)
    const canonicalKey = getCanonicalRoot(trimmed);
    
    // Count exact or root occurrences in full document
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const count = (cleaned.match(regex) || []).length;

    // Discard terms that appear only once if they are single words (likely an ordinary sentence start)
    if (count <= 1 && words.length === 1 && cleaned.indexOf(trimmed) < 200) {
      continue;
    }

    // Salience scoring: Frequency + multi-word bonus + length bonus
    const lengthBonus = trimmed.length > 8 ? 1.4 : 1.0;
    const multiWordBonus = words.length > 1 ? 1.5 : 1.0;
    const score = count * 2.5 * lengthBonus * multiWordBonus;

    const existing = candidateScores.get(canonicalKey);
    if (existing) {
      existing.count += count;
      existing.score += score;
      // Prefer plural or longer form (e.g. 'Antibiotics' over 'Antibiotic')
      if (trimmed.length > existing.term.length || count > existing.count) {
        existing.term = trimmed;
      }
    } else {
      candidateScores.set(canonicalKey, { term: trimmed, score, count });
    }
  }

  // Sort candidate concepts by salience score
  const sortedCandidates = Array.from(candidateScores.values()).sort(
    (a, b) => b.score - a.score
  );

  const topConcepts = sortedCandidates.slice(0, Math.min(sortedCandidates.length, 3));
  const topics: TopicExtractionResult['topics'] = [];

  // Extract high-quality sentences for each top concept
  for (const { term } of topConcepts) {
    const sentences = cleaned
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => {
        const lower = s.toLowerCase();
        return (
          lower.includes(term.toLowerCase()) &&
          s.length >= 35 &&
          s.length <= 250 &&
          !s.toLowerCase().startsWith('figure') &&
          !s.toLowerCase().startsWith('table')
        );
      });

    const keyFacts: string[] = [];
    for (let i = 0; i < Math.min(sentences.length, 3); i++) {
      let fact = sentences[i];
      // Clean up sentence start
      fact = fact.replace(/^(however|moreover|furthermore|additionally|thus|therefore|in addition|also)[,\s]+/i, '');
      if (fact.length > 0) {
        keyFacts.push(fact.charAt(0).toUpperCase() + fact.slice(1));
      }
    }

    const summary =
      keyFacts[0] ||
      `${term} represents a primary subject and functional mechanism analyzed in the source document.`;

    topics.push({
      name: term,
      summary,
      keyFacts: keyFacts.length > 0 ? keyFacts : [
        `Primary operational role and characteristics of ${term}.`,
        `Interactions and outcomes associated with ${term} in clinical or technical contexts.`
      ],
    });
  }

  // Fallback: If no concepts passed heuristic, inspect document title/headline
  if (topics.length === 0) {
    const firstParagraph = cleaned.split('\n')[0].trim();
    const fallbackTitle = firstParagraph.slice(0, 35).replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Document Knowledge';
    topics.push({
      name: fallbackTitle,
      summary: `Knowledge summary synthesized from document content.`,
      keyFacts: [
        `Key factual information extracted from source text.`,
        `Subject matter concepts and recorded observations.`
      ],
    });
  }

  return { topics };
}

/**
 * Generate a clean, Obsidian-quality knowledge note
 */
export function mockGenerateNote(
  topic: string,
  facts: string[],
  existingContent?: string
): string {
  const date = new Date().toISOString().slice(0, 10);

  // If page already exists, merge with an update section
  if (existingContent && existingContent.length > 30) {
    let updated = existingContent.trim();
    const updateHeader = `\n\n## Extended Insights (${date})\n`;
    if (!updated.includes('## Extended Insights')) {
      updated += updateHeader;
    } else {
      updated += `\n\n### Additional Findings (${date})\n`;
    }

    for (const fact of facts) {
      if (!updated.includes(fact)) {
        updated += `- ${fact}\n`;
      }
    }
    return updated;
  }

  // Generate a brand new structured Obsidian-style Markdown note
  const primarySummary = facts[0] || `${topic} is a key concept documented in this knowledge base.`;
  const additionalFacts = facts.slice(1);

  let md = `# ${topic}\n\n`;
  md += `> **Executive Summary**: ${primarySummary}\n\n`;
  md += `## Core Mechanisms & Insights\n\n`;

  if (additionalFacts.length > 0) {
    for (let i = 0; i < additionalFacts.length; i++) {
      const fact = additionalFacts[i];
      // Generate clean bold lead-ins for readability
      const label = i === 0 ? 'Primary Function' : i === 1 ? 'Key Characteristics' : 'Implications';
      md += `- **${label}**: ${fact}\n`;
    }
  } else {
    md += `- **Overview**: ${primarySummary}\n`;
    md += `- **Significance**: Plays a vital role in domain operations and research contexts.\n`;
  }

  md += `\n## Related Topics & Index\n\n`;
  md += `- Master Table of Contents: [[INDEX]]\n`;

  return md;
}

export function mockRouteQuery(query: string, indexSummary: string): RoutingResult {
  const lines = indexSummary.split('\n').filter((l) => l.includes('|') && !l.includes('---') && !l.toLowerCase().includes('topic'));
  const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  
  const scoredFiles: { filename: string; score: number }[] = [];

  for (const line of lines) {
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length < 3) continue;
    const topic = parts[1] || '';
    const summary = parts[2] || '';
    const filename = parts[3] || `${topic.replace(/\[\[|\]\]/g, '')}.md`;

    let score = 0;
    for (const kw of keywords) {
      if (topic.toLowerCase().includes(kw)) score += 3;
      if (summary.toLowerCase().includes(kw)) score += 1;
    }
    scoredFiles.push({ filename: filename.trim(), score });
  }

  scoredFiles.sort((a, b) => b.score - a.score);
  const selected = scoredFiles
    .filter((f) => f.filename.endsWith('.md'))
    .slice(0, 2)
    .map((f) => f.filename);

  if (selected.length === 0 && scoredFiles.length > 0) {
    selected.push(scoredFiles[0].filename);
  }

  return {
    selectedFilenames: selected,
    reasoning: `Matched query keywords [${keywords.join(', ')}] against the INDEX.md topic entries.`,
  };
}

export async function mockSynthesizeAnswer(
  query: string,
  notes: { filename: string; content: string }[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const titles = notes.map((n) => n.filename.replace('.md', ''));
  const intro = `Based on your wiki notes (${titles.map((t) => `[[${t}]]`).join(', ')}):\n\n`;
  
  let full = intro;
  onChunk?.(intro);

  let body = '';
  if (notes.length === 0) {
    body = `I could not find directly relevant notes in your index for this question. Consider ingesting related reference material.\n`;
  } else {
    body = `Here are the key findings relevant to your question: "${query}":\n\n`;
    for (const note of notes) {
      const firstLines = note.content
        .split('\n')
        .filter((l) => l.startsWith('-') || (!l.startsWith('#') && l.trim().length > 20))
        .slice(0, 3)
        .map((l) => l.replace(/^[-*]\s*/, ''));
      
      body += `### From [[${note.filename.replace('.md', '')}]]:\n`;
      for (const line of firstLines) {
        body += `- ${line}\n`;
      }
      body += `\n`;
    }
    body += `\n**Summary Conclusion**: The information above is drawn directly from your local Markdown vault notes.\n`;
  }

  full += body;
  onChunk?.(body);
  return full;
}
