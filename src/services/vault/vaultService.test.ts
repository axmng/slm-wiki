import { describe, it, expect } from 'vitest';
import { VaultService } from './vaultService';
import { IngestionPipeline } from '../pipeline/ingestionPipeline';

describe('VaultService', () => {
  const service = new VaultService();

  it('correctly parses markdown index table', () => {
    const markdown = `# Local Wiki Index

| Topic | Summary | File | Updated |
| :--- | :--- | :--- | :--- |
| [[Quantum Computing]] | Fundamentals of qubits | Quantum Computing.md | 2026-09-23 |
| [[Neural Networks]] | Architecture of multilayer perceptrons | Neural Networks.md | 2026-09-23 |
`;
    const index = service.parseIndexMarkdown(markdown);
    expect(index.entries.length).toBe(2);
    expect(index.entries[0].topic).toBe('Quantum Computing');
    expect(index.entries[0].summary).toBe('Fundamentals of qubits');
    expect(index.entries[1].topic).toBe('Neural Networks');
  });

  it('correctly serializes index back to markdown', () => {
    const index = {
      lastRegenerated: '2026-09-23',
      entries: [
        {
          topic: 'Artificial Intelligence',
          summary: 'Broad field of intelligent systems',
          filename: 'Artificial Intelligence.md',
          lastUpdated: '2026-09-23',
        },
      ],
    };
    const md = service.serializeIndexMarkdown(index);
    expect(md).toContain('| [[Artificial Intelligence]] | Broad field of intelligent systems | Artificial Intelligence.md | 2026-09-23 |');
  });

  it('extracts wikilinks with and without aliases', () => {
    const text = 'Here is a reference to [[Quantum Computing]] and also [[Neural Networks|Deep Learning models]].';
    const links = service.extractWikilinks(text);
    expect(links).toEqual(['Quantum Computing', 'Neural Networks']);
  });

  it('supports creating and switching multiple isolated wikis', async () => {
    await service.createWiki('Neuroscience');
    expect(service.getActiveWiki()).toBe('Neuroscience');

    const wikis = await service.listWikis();
    expect(wikis).toContain('Neuroscience');
    expect(wikis).toContain('Default');

    // Save page in Neuroscience
    await service.savePage('Synapse', '# Synapse\n\nCommunication junctions between neurons.');
    const neuroPages = await service.listPages();
    expect(neuroPages).toContain('Synapse');

    // Switch back to Default
    await service.setActiveWiki('Default');
    expect(service.getActiveWiki()).toBe('Default');
    const defaultPages = await service.listPages();
    expect(defaultPages).not.toContain('Synapse');
    expect(defaultPages).toContain('Quantum Computing');
  });

  it('resolves singular/plural page names and merges duplicates', async () => {
    await service.createWiki('Medicine');
    // Save both Antibiotics and Antibiotic artificially
    await service.savePage('Antibiotics', '# Antibiotics\n\n- Main note on antimicrobial drugs.');
    
    // Calling readPage with singular 'Antibiotic' should find and return the existing 'Antibiotics' note
    const matched = await service.findExistingPageName('Antibiotic');
    expect(matched).toBe('Antibiotics');

    const page = await service.readPage('Antibiotic');
    expect(page).toBeDefined();
    expect(page!.filename).toBe('Antibiotics.md');

    // Simulate duplicate creation in virtual storage to test merge
    (service as any).virtualStorage.set(
      'wikis/Medicine/pages/Antibiotic.md',
      '# Antibiotic\n\n- Extra insight on penicillin history.'
    );

    const result = await service.deduplicateWikiPages();
    expect(result.merged).toContain('Antibiotics');
    expect(result.removed).toContain('Antibiotic');

    const medicinePages = await service.listPages();
    expect(medicinePages).toContain('Antibiotics');
    expect(medicinePages).not.toContain('Antibiotic');

    const consolidated = await service.readPage('Antibiotics');
    expect(consolidated!.content).toContain('penicillin history');
  });
});

describe('IngestionPipeline Multi-Wiki', () => {
  const pipeline = new IngestionPipeline();

  it('chunks long text while preserving paragraph boundaries', () => {
    const p1 = 'Paragraph 1 '.repeat(20);
    const p2 = 'Paragraph 2 '.repeat(20);
    const text = `${p1}\n\n${p2}`;
    const chunks = pipeline.chunkText(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('linkifies mentions of known pages without double-wrapping', () => {
    const text = 'Exploring Quantum Computing and its connection to [[Neural Networks]].';
    const known = ['Quantum Computing', 'Neural Networks'];
    const result = pipeline.linkifyReferences(text, 'Another Topic', known);
    expect(result).toBe('Exploring [[Quantum Computing]] and its connection to [[Neural Networks]].');
  });

  it('ingests document into a dynamically created wiki', async () => {
    const text = `Cellular Biology examines the physiological properties and metabolic processes of plant and animal cells. Mitochondria are the powerhouses of eukaryotic cells.`;
    const res = await pipeline.ingest(text, 'Cell Bio Notes', undefined, 'Biology');
    expect(res.wikiName).toBe('Biology');
    expect(res.topics.length).toBeGreaterThan(0);
  });
});
