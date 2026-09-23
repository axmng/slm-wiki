import { describe, it, expect } from 'vitest';
import { queryPipeline } from './queryPipeline';

describe('QueryPipeline', () => {
  it('pre-filters index entries when count is large', () => {
    const entries = [
      { topic: 'Quantum Computing', summary: 'Qubits and superposition', filename: 'Quantum.md', lastUpdated: '2026-09-23' },
      { topic: 'Cooking Recipes', summary: 'Baking bread and cakes', filename: 'Cooking.md', lastUpdated: '2026-09-23' },
      { topic: 'Quantum Error Correction', summary: 'Stabilizer codes for qubits', filename: 'QEC.md', lastUpdated: '2026-09-23' },
    ];

    // Using any cast to test private method
    const filtered = (queryPipeline as any).preFilterIndex('quantum qubit', entries, 2);
    expect(filtered.length).toBe(2);
    expect(filtered[0].topic).toMatch(/Quantum/);
  });

  it('runs query against vault and returns grounded results', async () => {
    const result = await queryPipeline.executeQuery('What are qubits?');
    expect(result.query).toBe('What are qubits?');
    expect(result.selectedFiles.length).toBeGreaterThan(0);
    expect(result.answer.length).toBeGreaterThan(10);
  });
});
