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

  it('correctly discovers acronym concepts (CPE Strains) and rejects geographic names and standalone adjectives', () => {
    const text = `
Antibiotics 2019, 8, 23 8 of 18
Resistance to this AB in poultry farming have been reported, for example from Canada, China, Brazil and India.
Similar results were published from China with over 60% for TET and CHL and no resistances to carbapenem (IMP).
The association among the resistance phenotypes ampicillin–doxycycline–TET–SXT was reported as the predominant in poultry and swine production in China.
Environmental dissemination of Carbapenemase-producing Enterobacteriaceae (CPE) strains poses severe global health risks.
CPE strains harbor mobile plasmid genes that confer resistance to last-line carbapenems.
Surveillance of CPE strains across food animal production is urgently needed.
`;

    const result = mockExtractTopics(text);
    const names = result.topics.map((t) => t.name.toLowerCase());

    // Must NOT extract countries or standalone adjectives
    expect(names).not.toContain('china');
    expect(names).not.toContain('canada');
    expect(names).not.toContain('brazil');
    expect(names).not.toContain('india');
    expect(names).not.toContain('environmental');

    // Must extract CPE Strains or CPE
    const hasCpe = names.some((n) => n.includes('cpe'));
    expect(hasCpe).toBe(true);
  });

  it('synthesizes honest grounded answers when specific procedures are absent from notes', async () => {
    const { mockSynthesizeAnswer } = await import('./mockEngine');
    const notes = [
      {
        filename: 'CPE Strains.md',
        content: `
# CPE Strains
> **Executive Summary**: CPE strains harbor mobile plasmid genes that confer resistance to last-line carbapenems.
- **Key Characteristics**: Surveillance of CPE strains across food animal production is urgently needed.
- **Prevalence**: Similar results were published from China with over 60% for TET and CHL.
`,
      },
    ];

    const answer = await mockSynthesizeAnswer('what isolation procedures for CPE strains exist?', notes);
    expect(answer).toContain('Notice');
    expect(answer).toContain('do not contain detailed laboratory isolation protocols or procedures');
    expect(answer).toContain('Recommendation');
  });

  it('correctly extracts VIM-1 and Salmonella enterica without verb fragments like "Vim-1 Gene Was"', () => {
    const text = `
Detection of VIM-1-Producing Salmonella enterica Serovars Infantis and Goldcoast at a Breeding Pig Farm in Germany in 2017 and Their Molecular Relationship to Former VIM-1-Producing German Livestock Production.
In this study, the blaVIM-1 gene was detected in Salmonella enterica serovars Infantis and Goldcoast.
The VIM-1 gene was located on an IncHI2 plasmid conferring carbapenem resistance.
The VIM-1 gene were investigated in livestock production and isolates were characterized.
`;
    const result = mockExtractTopics(text);
    const names = result.topics.map((t) => t.name);

    // Must NOT contain verb phrases
    expect(names).not.toContain('Vim-1 Gene Was');
    expect(names).not.toContain('Vim-1 Gene Were');
    expect(names.some(n => /\b(was|were|is|are)\b/i.test(n))).toBe(false);

    // Must extract VIM-1 with proper uppercase acronym casing (not "Vim-1")
    expect(names).toContain('VIM-1');

    // Must extract Salmonella enterica
    const hasSalmonella = names.some(n => n.toLowerCase().includes('salmonella'));
    expect(hasSalmonella).toBe(true);
  });
});


