import { describe, it, expect } from 'vitest';
import { documentParser } from './documentParser';

describe('DocumentParser', () => {
  it('parses plain text files', async () => {
    const file = new File(['Hello World! Quantum computing principles.'], 'quantum.txt', {
      type: 'text/plain',
    });
    const parsed = await documentParser.parseFile(file);
    expect(parsed.format).toBe('txt');
    expect(parsed.title).toBe('quantum');
    expect(parsed.text).toContain('Quantum computing principles.');
  });

  it('parses markdown files', async () => {
    const file = new File(['# Title\n\nContent here.'], 'notes.md', {
      type: 'text/markdown',
    });
    const parsed = await documentParser.parseFile(file);
    expect(parsed.format).toBe('md');
    expect(parsed.title).toBe('notes');
    expect(parsed.text).toContain('# Title');
  });
});
