/**
 * Utility for English inflection, singular/plural canonicalization,
 * and topic deduplication.
 */

export function getCanonicalRoot(term: string): string {
  const lower = term.toLowerCase().trim();
  const words = lower.split(/\s+/);
  const last = words[words.length - 1];
  let rootLast = last;

  if (last.endsWith('ies') && last.length > 4) {
    rootLast = last.slice(0, -3) + 'y';
  } else if (
    last.endsWith('es') &&
    (last.endsWith('sses') || last.endsWith('shes') || last.endsWith('ches') || last.endsWith('xes'))
  ) {
    rootLast = last.slice(0, -2);
  } else if (last.endsWith('s') && !last.endsWith('ss') && last.length > 3) {
    rootLast = last.slice(0, -1);
  }

  words[words.length - 1] = rootLast;
  return words.join(' ');
}

export function areTopicsEquivalent(topicA: string, topicB: string): boolean {
  if (topicA.toLowerCase().trim() === topicB.toLowerCase().trim()) return true;
  return getCanonicalRoot(topicA) === getCanonicalRoot(topicB);
}

export function getTopicVariants(topic: string): string[] {
  const cleaned = topic.trim();
  const words = cleaned.split(/\s+/);
  const lastWord = words[words.length - 1];
  const prefix = words.slice(0, words.length - 1).join(' ');
  const variants = new Set<string>();

  variants.add(cleaned);

  const makeVariant = (newLast: string) => {
    return prefix ? `${prefix} ${newLast}` : newLast;
  };

  if (lastWord.endsWith('ies') && lastWord.length > 4) {
    variants.add(makeVariant(lastWord.slice(0, -3) + 'y'));
  } else if (lastWord.endsWith('y') && !/[aeiou]y$/i.test(lastWord)) {
    variants.add(makeVariant(lastWord.slice(0, -1) + 'ies'));
  }

  if (lastWord.endsWith('s') && !lastWord.endsWith('ss') && lastWord.length > 3) {
    variants.add(makeVariant(lastWord.slice(0, -1)));
  } else if (!lastWord.endsWith('s')) {
    variants.add(makeVariant(lastWord + 's'));
    variants.add(makeVariant(lastWord + 'es'));
  }

  return Array.from(variants);
}
