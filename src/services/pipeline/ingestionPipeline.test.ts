import { describe, it, expect } from 'vitest';
import { ingestionPipeline } from './ingestionPipeline';
import { vault } from '../vault/vaultService';

describe('IngestionPipeline End-to-End', () => {
  it('processes text, creates pages, and updates index and log', async () => {
    const rawArticle = `
Graph Neural Networks (GNNs) capture relational data structures by propagating node embeddings along graph edges.
Key architectures include Graph Convolutional Networks (GCN) and Graph Attention Networks (GAT).
GNNs have wide applications in drug discovery, social network analysis, and knowledge graph completion.
`;

    const result = await ingestionPipeline.ingest(rawArticle, 'GNN Intro');
    
    expect(result.rawFilename).toMatch(/\.md$/);
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.updatedPages.length).toBeGreaterThan(0);

    // Verify raw file exists
    const raw = await vault.readRaw(result.rawFilename);
    expect(raw).toContain('Graph Neural Networks');

    // Verify index was updated
    const index = await vault.readIndex();
    const hasGNN = index.entries.some(e => e.topic.toLowerCase().includes('graph') || e.summary.toLowerCase().includes('graph'));
    expect(hasGNN).toBe(true);

    // Verify log contains the entry
    const log = await vault.readLog();
    expect(log).toContain('INGEST');
  });

  it('unwraps phantom hallucinated links and ensures clean Related Topics in cleanAndEnhanceNote', () => {
    const rawNote = `
CPE
Executive Summary: Carbapenem-susceptible organisms (CPE) are characterized by limitations in isolation detection.
Core Mechanisms & Insights
Key Characteristics: Isolation limitations exist for [[selective media]] and [[specificity]] during testing.
Implications: Enriches [[Antibiotics]] data.
Related Topics & Index
[[Isolation]]
[[carbapenemase]]
[[CPE detection]]
[[selective media]]
[[specificity]]
[[sensitivity]]
[[INDEX]]
`;

    const knownPages = ['Antibiotics.md'];
    const siblingTopics = ['CPE', 'Carbapenem Resistance'];

    const cleaned = ingestionPipeline.cleanAndEnhanceNote(
      rawNote,
      'CPE',
      knownPages,
      siblingTopics
    );

    // Header must be normalized to # CPE
    expect(cleaned).toMatch(/^# CPE\b/);

    // Phantom links like [[selective media]], [[specificity]], [[Isolation]], [[sensitivity]] must be stripped
    expect(cleaned).not.toContain('[[selective media]]');
    expect(cleaned).not.toContain('[[specificity]]');
    expect(cleaned).not.toContain('[[sensitivity]]');
    expect(cleaned).not.toContain('[[Isolation]]');

    // Real known page must be linked
    expect(cleaned).toContain('[[Antibiotics]]');

    // Related Topics must contain sibling topic and INDEX
    expect(cleaned).toContain('## Related Topics & Index');
    expect(cleaned).toContain('[[Carbapenem Resistance]]');
    expect(cleaned).toContain('[[INDEX]]');
  });
});
