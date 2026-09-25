import { describe, it, expect } from 'vitest';
import { areTopicsEquivalent, getCanonicalRoot, getTopicVariants } from './textNormalization';

describe('textNormalization', () => {
  it('identifies singular and plural words as equivalent', () => {
    expect(areTopicsEquivalent('Antibiotic', 'Antibiotics')).toBe(true);
    expect(areTopicsEquivalent('antibiotics', 'Antibiotic')).toBe(true);
    expect(areTopicsEquivalent('Neural Network', 'Neural Networks')).toBe(true);
    expect(areTopicsEquivalent('Quantum Computer', 'Quantum Computers')).toBe(true);
    expect(areTopicsEquivalent('Technology', 'Technologies')).toBe(true);
    expect(areTopicsEquivalent('Process', 'Processes')).toBe(true);
  });

  it('does not equate fundamentally different words', () => {
    expect(areTopicsEquivalent('Antibiotic', 'Antibody')).toBe(false);
    expect(areTopicsEquivalent('Computer', 'Computation')).toBe(false);
  });

  it('produces expected variants for linking and matching', () => {
    const antibioticVariants = getTopicVariants('Antibiotics');
    expect(antibioticVariants).toContain('Antibiotic');
    expect(antibioticVariants).toContain('Antibiotics');

    const networkVariants = getTopicVariants('Neural Networks');
    expect(networkVariants).toContain('Neural Network');
    expect(networkVariants).toContain('Neural Networks');
  });

  it('computes consistent canonical roots', () => {
    expect(getCanonicalRoot('Antibiotics')).toBe('antibiotic');
    expect(getCanonicalRoot('Antibiotic')).toBe('antibiotic');
    expect(getCanonicalRoot('Technologies')).toBe('technology');
    expect(getCanonicalRoot('VIM-1 Gene')).toBe('vim-1');
    expect(getCanonicalRoot('blaVIM-1')).toBe('vim-1');
    expect(getCanonicalRoot('CPE Strains')).toBe('cpe');
  });

  it('correctly equates technical synonyms and gene descriptors', () => {
    expect(areTopicsEquivalent('VIM-1', 'VIM-1 Gene')).toBe(true);
    expect(areTopicsEquivalent('blaVIM-1', 'VIM-1')).toBe(true);
    expect(areTopicsEquivalent('CPE', 'CPE Strains')).toBe(true);
    expect(areTopicsEquivalent('MDR', 'MDR Isolates')).toBe(true);
  });
});
