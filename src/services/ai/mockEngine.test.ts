import { describe, it, expect } from 'vitest';
import { mockExtractTopics, mockGenerateNote } from './mockEngine';

describe('mockEngine Topic Extraction & Note Formatting', () => {
  it('correctly filters out document structural words (Page, Article, Prevalence) and extracts domain concepts', () => {
    const antibioticsText = `
--- Page 1 ---
In this article, we review the global clinical impact of Antibiotics in modern healthcare.
Antibiotics are critical antimicrobial medicines used in the treatment and prevention of bacterial infections.
Article prevalence calculations demonstrate that bacterial resistance poses significant challenges.
Antibiotics inhibit essential biological functions in target bacteria, such as cell wall synthesis or protein translation.
Penicillin was the first natural antibiotic discovered, revolutionizing medical science.
Overuse of Antibiotics accelerates the emergence of multidrug-resistant pathogens.
`;

    const result = mockExtractTopics(antibioticsText);
    const topicNames = result.topics.map((t) => t.name.toLowerCase());

    // Must NOT contain structural/metadata words
    expect(topicNames).not.toContain('page');
    expect(topicNames).not.toContain('article');
    expect(topicNames).not.toContain('article prevalence');
    expect(topicNames).not.toContain('prevalence');

    // Must extract actual domain concepts
    const hasAntibiotics = topicNames.some((t) => t.includes('antibiotic'));
    expect(hasAntibiotics).toBe(true);

    const antibioticsTopic = result.topics.find((t) => t.name.toLowerCase().includes('antibiotic'));
    expect(antibioticsTopic).toBeDefined();
    expect(antibioticsTopic!.keyFacts.length).toBeGreaterThan(0);
    expect(antibioticsTopic!.summary).not.toContain('--- Page');
  });

  it('generates high quality Obsidian Markdown notes with clean executive summary and bullet points', () => {
    const note = mockGenerateNote(
      'Antibiotics',
      [
        'Antibiotics are antimicrobial substances active against bacteria.',
        'They inhibit essential bacterial cell wall synthesis.',
        'Overuse accelerates the emergence of resistant pathogens.',
      ]
    );

    expect(note).toContain('# Antibiotics');
    expect(note).toContain('> **Executive Summary**: Antibiotics are antimicrobial substances active against bacteria.');
    expect(note).toContain('## Core Mechanisms & Insights');
    expect(note).toContain('- **Primary Function**:');
    expect(note).toContain('## Related Topics & Index');
    expect(note).toContain('[[INDEX]]');

    // Ensure no robotic phrases
    expect(note).not.toContain('Automatic knowledge note synthesized on');
    expect(note).not.toContain('represents a key conceptual node');
  });
});
