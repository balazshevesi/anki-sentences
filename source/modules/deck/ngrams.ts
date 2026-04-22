export type NgramStats = {
  occurrenceCount: number;
  cardCount: number;
};

export type NgramCandidate = NgramStats & {
  text: string;
  ngramLength: 2 | 3;
  cardPercentage: number;
};

export function tokenizeWords(input: string): string[] {
  const normalizedInput = input.toLowerCase();
  return normalizedInput.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? [];
}

export function countNgrams(
  sentences: string[],
  ngramLength: number,
): Map<string, NgramStats> {
  const counts = new Map<string, NgramStats>();

  for (const sentence of sentences) {
    const words = tokenizeWords(sentence);
    const ngramsInCurrentSentence = new Set<string>();

    for (let index = 0; index <= words.length - ngramLength; index += 1) {
      const ngram = words.slice(index, index + ngramLength).join(" ");
      const existingStats = counts.get(ngram) ?? {
        occurrenceCount: 0,
        cardCount: 0,
      };

      existingStats.occurrenceCount += 1;
      if (!ngramsInCurrentSentence.has(ngram)) {
        existingStats.cardCount += 1;
        ngramsInCurrentSentence.add(ngram);
      }

      counts.set(ngram, existingStats);
    }
  }

  return counts;
}

export function toSortedEntries(
  counts: Map<string, NgramStats>,
): Array<[string, NgramStats]> {
  return Array.from(counts.entries()).sort((a, b) => {
    if (b[1].occurrenceCount !== a[1].occurrenceCount) {
      return b[1].occurrenceCount - a[1].occurrenceCount;
    }

    if (b[1].cardCount !== a[1].cardCount) {
      return b[1].cardCount - a[1].cardCount;
    }

    return a[0].localeCompare(b[0]);
  });
}

export function selectNgramCandidates(
  sentences: string[],
  options: {
    minCardCount: number;
    minCardPercentage: number;
  },
): Map<string, NgramCandidate> {
  const totalCardCount = sentences.length;
  if (totalCardCount === 0) {
    return new Map();
  }

  const candidates = new Map<string, NgramCandidate>();

  for (const ngramLength of [2, 3] as const) {
    const counts = countNgrams(sentences, ngramLength);
    for (const [ngramText, stats] of counts.entries()) {
      const cardPercentage = (stats.cardCount / totalCardCount) * 100;
      if (stats.cardCount < options.minCardCount) {
        continue;
      }
      if (cardPercentage < options.minCardPercentage) {
        continue;
      }

      candidates.set(ngramText, {
        text: ngramText,
        ngramLength,
        occurrenceCount: stats.occurrenceCount,
        cardCount: stats.cardCount,
        cardPercentage,
      });
    }
  }

  return candidates;
}

export function listSentenceNgramCandidates(
  sentence: string,
  candidateMap: Map<string, NgramCandidate>,
  maxCount: number,
): NgramCandidate[] {
  if (maxCount <= 0) {
    return [];
  }

  const tokens = tokenizeWords(sentence);
  const selected: NgramCandidate[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < tokens.length; index += 1) {
    for (const ngramLength of [3, 2] as const) {
      if (index + ngramLength > tokens.length) {
        continue;
      }

      const ngramText = tokens.slice(index, index + ngramLength).join(" ");
      if (seen.has(ngramText)) {
        continue;
      }

      const candidate = candidateMap.get(ngramText);
      if (!candidate) {
        continue;
      }

      selected.push(candidate);
      seen.add(ngramText);

      if (selected.length >= maxCount) {
        return selected;
      }
    }
  }

  return selected;
}
