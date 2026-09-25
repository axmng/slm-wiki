import { TopicExtractionResult, RoutingResult } from './aiTypes';
import { getCanonicalRoot } from '../utils/textNormalization';

// Comprehensive blacklist of structural, layout, publishing, geographic, and generic discourse words
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
  'mdpi', 'elsevier', 'springer', 'wiley', 'plos', 'nature', 'science', 'frontiers', 'biomed',

  // Geographic names (countries, continents, regions) - avoid extracting geographic locations as core domain concepts
  'china', 'chinese', 'canada', 'canadian', 'brazil', 'brazilian', 'india', 'indian',
  'usa', 'united states', 'america', 'american', 'europe', 'european', 'asia', 'asian',
  'germany', 'german', 'france', 'french', 'japan', 'japanese', 'uk', 'united kingdom',
  'australia', 'australian', 'spain', 'spanish', 'italy', 'italian', 'russia', 'russian',
  'mexico', 'mexican', 'africa', 'african',

  // Standalone relational adjectives (rejected when alone, e.g. "Environmental")
  'environmental', 'clinical', 'statistical', 'experimental', 'regional', 'global',
  'national', 'international', 'general', 'standard', 'primary', 'secondary', 'tertiary',
  'initial', 'final', 'similar', 'different', 'various', 'several', 'multiple',
  'total', 'average', 'recent', 'daily', 'annual', 'overall', 'associated',

  // Common English discourse words often capitalized at start of sentences
  'this', 'that', 'these', 'those', 'there', 'their', 'they', 'what', 'where', 'when',
  'which', 'with', 'from', 'have', 'been', 'also', 'such', 'more', 'most', 'some',
  'many', 'each', 'every', 'other', 'another', 'both', 'only', 'well', 'very', 'even',
  'first', 'second', 'third', 'last', 'further', 'specifically', 'particularly',
  'generally', 'importantly', 'furthermore', 'moreover', 'however', 'although', 'therefore',
  'thus', 'hence', 'instead', 'meanwhile', 'finally', 'then', 'here', 'now', 'since',
  'while', 'whereas', 'because', 'despite', 'according', 'based', 'using', 'given',
  'shown', 'noted', 'observed', 'discussed', 'described', 'found', 'seen', 'known',
  'regarding', 'concerning', 'including', 'major', 'significant', 'critical', 'potential',
  'possible', 'likely', 'today', 'current', 'currently', 'future', 'past',
  'number', 'high', 'higher', 'highest', 'low', 'lower', 'lowest'
]);

// Core domain indicator words that boost technical/scientific concepts
const DOMAIN_INDICATORS = new Set([
  'strain', 'strains', 'isolate', 'isolates', 'resistance', 'resistant', 'antibiotic',
  'antibiotics', 'carbapenem', 'carbapenemase', 'bacterial', 'bacteria', 'gene', 'genes',
  'plasmid', 'plasmids', 'mechanism', 'mechanisms', 'infection', 'infections', 'therapy',
  'treatment', 'algorithm', 'model', 'quantum', 'system', 'protocol', 'procedure',
  'procedures', 'mutation', 'pathogen', 'pathogens', 'enterobacteriaceae', 'phenotype'
]);

function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word.toLowerCase().trim());
}

/**
 * Clean raw text from citations, bracket references [1, 2], and artifacts
 */
function cleanTextContent(text: string): string {
  return text
    .replace(/\b[A-Za-z]+\s+\d{4}\s*,\s*\d+\s*,\s*\d+\s+\d+\s+of\s+\d+\b/gi, '') // journal header e.g. Antibiotics 2019, 8, 23 8 of 18
    .replace(/---+[\s\w\d-]*---+/g, '') // remove page divider markers
    .replace(/\bPage\s+\d+\b/gi, '') // remove Page 12
    .replace(/\[\d+(?:[,\s-]+\d+)*\]/g, '') // remove citation brackets [1, 2]
    .replace(/\((?:see\s+)?(?:fig|table|eq)\.?\s*\d+[a-z]?\)/gi, '') // remove (see Fig. 1)
    .replace(/\b(?:https?|ftp):\/\/\S+/gi, '') // remove URLs
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Intelligent entity and domain concept extractor with frequency & salience ranking.
 * Supports acronyms (CPE, MDR, AMR), compound scientific terms (CPE Strains, Carbapenem Resistance),
 * and prevents generic geographic or editorial stopwords.
 */
export function mockExtractTopics(rawText: string): TopicExtractionResult {
  const cleaned = cleanTextContent(rawText);

  // Match 3 classes of technical terms:
  // 1. Acronyms & hyphenated acronyms (e.g. CPE, MDR, AMR, ESBL, MRSA, PCR, CRISPR-Cas9)
  const acronymMatches = cleaned.match(/\b[A-Z]{2,6}(?:-[A-Za-z0-9]+)?\b/g) || [];

  // 2. Acronym + Noun phrases (e.g. "CPE strains", "MDR isolates", "PCR detection")
  const acronymPhrases = cleaned.match(/\b[A-Z]{2,6}(?:-[A-Za-z0-9]+)?\s+[A-Za-z]+(?:\s+[A-Za-z]+)?\b/g) || [];

  // 3. Multi-word Capitalized phrases (e.g. "Carbapenem Resistance", "Bacterial Transmission")
  const titleCaseMatches = cleaned.match(/\b[A-Z][a-z]+(?:-[A-Za-z]+)?(?:\s+[A-Za-z]+){0,2}\b/g) || [];

  const allCandidates = [...acronymPhrases, ...acronymMatches, ...titleCaseMatches];
  const candidateScores = new Map<string, { term: string; score: number; count: number }>();

  for (const m of allCandidates) {
    const trimmed = m.trim();
    const words = trimmed.split(/\s+/);

    // Rule 1: Check if single word is a stopword or too short (< 2 for acronyms, < 4 for regular words)
    if (words.length === 1) {
      if (isStopWord(words[0])) continue;
      const isAcronym = /^[A-Z]{2,6}$/.test(words[0]);
      if (!isAcronym && words[0].length < 4) continue;
    }

    // Rule 2: Multi-word phrase must not start or end with a stopword
    // (e.g. "Article Prevalence" -> rejected, "China Study" -> rejected)
    if (isStopWord(words[0]) || isStopWord(words[words.length - 1])) {
      continue;
    }

    // Rule 3: Single words that are standalone relational adjectives (e.g. "Environmental") rejected
    if (words.length === 1 && STOP_WORDS.has(words[0].toLowerCase())) {
      continue;
    }

    // Clean up title casing for phrase (e.g. "CPE strains" -> "CPE Strains")
    const formattedTerm = words
      .map((w) => {
        if (/^[A-Z]{2,6}$/.test(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      })
      .join(' ');

    // Canonical root grouping (groups 'Antibiotic' and 'Antibiotics' into the same entry)
    const canonicalKey = getCanonicalRoot(formattedTerm);

    // Count occurrences in document
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const count = (cleaned.match(regex) || []).length;

    if (count === 0) continue;

    // Discard single words appearing only once if near start (routine sentence starter)
    if (count <= 1 && words.length === 1 && cleaned.indexOf(trimmed) < 200) {
      continue;
    }

    // Salience scoring:
    let score = count * 2.5;

    // Length and multi-word bonuses
    if (formattedTerm.length > 8) score *= 1.3;
    if (words.length > 1) score *= 1.6;

    // Acronym bonus (CPE, MDR, AMR are typically critical core subjects)
    if (/^[A-Z]{2,6}/.test(words[0])) {
      score *= 2.0;
    }

    // Domain keyword co-occurrence bonus
    const lowerTerm = formattedTerm.toLowerCase();
    const hasDomainKeyword = words.some((w) => DOMAIN_INDICATORS.has(w.toLowerCase()));
    if (hasDomainKeyword) {
      score *= 2.2;
    }

    // Check if term co-occurs with domain indicators in surrounding text
    const termIndex = cleaned.toLowerCase().indexOf(lowerTerm);
    if (termIndex !== -1) {
      const windowText = cleaned.slice(Math.max(0, termIndex - 100), termIndex + 100).toLowerCase();
      for (const indicator of DOMAIN_INDICATORS) {
        if (windowText.includes(indicator)) {
          score *= 1.3;
          break;
        }
      }
    }

    const existing = candidateScores.get(canonicalKey);
    if (existing) {
      existing.count += count;
      existing.score += score;
      // Prefer longer, more specific multi-word form (e.g. 'CPE Strains' over 'CPE')
      if (formattedTerm.length > existing.term.length || count > existing.count) {
        existing.term = formattedTerm;
      }
    } else {
      candidateScores.set(canonicalKey, { term: formattedTerm, score, count });
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
    const termLower = term.toLowerCase();
    const termTokens = termLower.split(/\s+/);

    const sentences = cleaned
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => {
        const lower = s.toLowerCase();
        // Match either full term or key token if multi-word
        const matches = lower.includes(termLower) || termTokens.every((t) => lower.includes(t));
        return (
          matches &&
          s.length >= 35 &&
          s.length <= 260 &&
          !s.toLowerCase().startsWith('figure') &&
          !s.toLowerCase().startsWith('table') &&
          !s.toLowerCase().includes('copyright')
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

  // Fallback: If no concepts passed heuristic, inspect document headline
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
  const keywords = query
    .toLowerCase()
    .split(/[\s,?.!]+/)
    .filter((w) => w.length > 2 && !['what', 'where', 'when', 'which', 'how', 'why', 'exist', 'exists', 'the', 'for', 'are'].includes(w));
  
  const scoredFiles: { filename: string; score: number }[] = [];

  for (const line of lines) {
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length < 3) continue;
    const topic = parts[1] || '';
    const summary = parts[2] || '';
    const filename = parts[3] || `${topic.replace(/\[\[|\]\]/g, '')}.md`;

    let score = 0;
    for (const kw of keywords) {
      if (topic.toLowerCase().includes(kw)) score += 5;
      if (summary.toLowerCase().includes(kw)) score += 2;
    }
    scoredFiles.push({ filename: filename.trim(), score });
  }

  scoredFiles.sort((a, b) => b.score - a.score);
  const selected = scoredFiles
    .filter((f) => f.filename.endsWith('.md') && f.score > 0)
    .slice(0, 3)
    .map((f) => f.filename);

  // Fallback: If no direct keyword hit, select top file
  if (selected.length === 0 && scoredFiles.length > 0) {
    selected.push(scoredFiles[0].filename);
  }

  return {
    selectedFilenames: selected,
    reasoning: `Matched query keywords [${keywords.join(', ')}] against the INDEX.md topic entries.`,
  };
}

/**
 * Intelligent passage retrieval and answer synthesis for the simulated/heuristic engine.
 * Genuinely extracts sentences relevant to the user query rather than blindly echoing line 1-3.
 */
export async function mockSynthesizeAnswer(
  query: string,
  notes: { filename: string; content: string }[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const titles = notes.map((n) => n.filename.replace('.md', ''));
  const intro = `Based on your wiki notes (${titles.map((t) => `[[${t}]]`).join(', ')}):\n\n`;
  
  let full = intro;
  onChunk?.(intro);

  if (notes.length === 0) {
    const body = `I could not find directly relevant notes in your index for this question. Consider ingesting related reference material.\n`;
    full += body;
    onChunk?.(body);
    return full;
  }

  // Extract query keywords (excluding routine stop words)
  const queryWords = query
    .toLowerCase()
    .split(/[\s,?.!]+/)
    .filter((w) => w.length > 2 && !['what', 'where', 'when', 'which', 'how', 'why', 'exist', 'exists', 'is', 'are', 'for', 'the', 'and', 'from', 'with', 'that', 'this'].includes(w));

  // Score passages across all loaded notes
  interface MatchedPassage {
    noteTitle: string;
    text: string;
    score: number;
    matchedKeywords: string[];
  }

  const matches: MatchedPassage[] = [];

  for (const note of notes) {
    const title = note.filename.replace('.md', '');
    // Clean and split note lines/sentences
    const lines = note.content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 25 && !l.startsWith('#') && !l.startsWith('- Master'));

    for (const line of lines) {
      const cleanLine = line.replace(/^[-*]\s*(?:\*\*[^*]+\*\*:\s*)?/, '').trim();
      const lower = cleanLine.toLowerCase();
      const hitWords = queryWords.filter((kw) => lower.includes(kw));

      if (hitWords.length > 0) {
        // Score = count of distinct matching query words
        let score = hitWords.length * 3;
        // Boost for specific procedural or technical terms
        if (hitWords.includes('isolation') || hitWords.includes('procedure') || hitWords.includes('protocol')) {
          score += 4;
        }
        matches.push({
          noteTitle: title,
          text: cleanLine,
          score,
          matchedKeywords: hitWords,
        });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);

  let body = '';
  // Check if specific intent (e.g. isolation, procedure, protocol) was found
  const queryHasActionIntent = queryWords.some((w) =>
    ['isolation', 'procedure', 'procedures', 'protocol', 'protocols', 'method', 'methods', 'culture', 'screening'].includes(w)
  );
  const foundActionMatches = matches.filter((m) =>
    m.matchedKeywords.some((w) =>
      ['isolation', 'procedure', 'procedures', 'protocol', 'protocols', 'method', 'methods', 'culture', 'screening'].includes(w)
    )
  );

  if (queryHasActionIntent && foundActionMatches.length === 0) {
    // Specific intent was NOT present in notes - explain honestly instead of dumping raw text!
    body += `> **Notice**: Your notes on ${titles.map((t) => `[[${t}]]`).join(', ')} document epidemiological resistance patterns and mechanisms, but **do not contain detailed laboratory isolation protocols or procedures**.\n\n`;
    body += `### Context Available in Your Vault Notes:\n`;
    
    // Provide top context sentences related to the remaining keywords (e.g. CPE, strains)
    const contextMatches = matches.slice(0, 3);
    if (contextMatches.length > 0) {
      for (const m of contextMatches) {
        body += `- **[[${m.noteTitle}]]**: ${m.text}\n`;
      }
    } else {
      for (const note of notes) {
        const firstLine = note.content.split('\n').find((l) => l.startsWith('> **Executive Summary**:') || (l.length > 30 && !l.startsWith('#')));
        if (firstLine) {
          body += `- **[[${note.filename.replace('.md', '')}]]**: ${firstLine.replace(/^>\s*/, '')}\n`;
        }
      }
    }

    body += `\n**Recommendation**: To get specific answers on isolation procedures, ingest laboratory manuals or surveillance protocols (e.g., CDC or EUCAST CPE screening and selective culture guidelines).\n`;
  } else if (matches.length > 0) {
    // Relevant passages found!
    body += `### Relevant Insights:\n\n`;
    const topMatches = matches.slice(0, 4);
    for (const m of topMatches) {
      body += `- **[[${m.noteTitle}]]**: ${m.text}\n`;
    }
    body += `\n**Synthesized Summary**: Based on your vault notes, the findings above represent the documented data for "${query}".\n`;
  } else {
    // No keyword overlap at all
    body += `No direct statements matching the query keywords [${queryWords.join(', ')}] were found inside ${titles.map((t) => `[[${t}]]`).join(', ')}.\n\n`;
    body += `Consider ingesting more specific documents on this topic into your wiki.\n`;
  }

  full += body;
  onChunk?.(body);
  return full;
}
