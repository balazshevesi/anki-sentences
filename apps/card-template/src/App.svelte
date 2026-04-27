<script lang="ts">
  import {
    EMPTY_WORD_TRANSLATION,
    normalizeNgramTranslation,
    type NgramTranslation,
    type WordTranslation,
  } from "../../deck-cli/src/contracts/cardPayload";
  import {
    isReadyAudioMetadata,
    type AudioMetadata,
    type AudioWordTimestamp,
  } from "../../deck-cli/src/contracts/audioMetadata";

  type Props = {
    cardText: string;
    wordByWord: Record<string, WordTranslation>;
    ngramTranslations: NgramTranslation[];
    audioMetadata: AudioMetadata | null;
    autoplay: boolean;
    replayKeybind: string | null;
  };

  let { cardText, wordByWord, ngramTranslations, audioMetadata, autoplay, replayKeybind }: Props =
    $props();

  function tokenizeSentence(input: string): string[] {
    return input.trim().split(/\s+/).filter((token) => token.length > 0);
  }

  function createTokenPattern(): RegExp {
    const fallbackPattern = /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g;
    try {
      return new RegExp("[\\p{L}\\p{N}]+(?:['’\\-][\\p{L}\\p{N}]+)*", "gu");
    } catch {
      return fallbackPattern;
    }
  }

  const tokenPattern = createTokenPattern();

  function normalizeToken(input: string): string {
    return input.toLowerCase().match(tokenPattern)?.[0] ?? "";
  }

  function buildNormalizedWordLookup(
    source: Record<string, WordTranslation>,
  ): Record<string, WordTranslation> {
    return Object.fromEntries(
      Object.entries(source)
        .map(([word, translation]) => [normalizeToken(word), translation] as const)
        .filter(([word]) => word.length > 0),
    );
  }

  function normalizeNgramTranslations(input: NgramTranslation[]): NgramTranslation[] {
    return input
      .map((item) => normalizeNgramTranslation(item))
      .filter((item) => item.phrase.length > 0 && item.translatedText.length > 0);
  }

  function normalizeReplayKeybind(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  function formatReplayKeybindLabel(value: string | null): string | null {
    if (!value) {
      return null;
    }

    return value.length === 1 ? value.toUpperCase() : value;
  }

  let tokens: string[] = $derived(tokenizeSentence(cardText));
  let normalizedWordLookup = $derived(buildNormalizedWordLookup(wordByWord));
  let normalizedNgrams = $derived(normalizeNgramTranslations(ngramTranslations));
  let readyAudioMetadata = $derived(
    isReadyAudioMetadata(audioMetadata) ? audioMetadata : null,
  );
  let replayKeybindLabel = $derived(
    formatReplayKeybindLabel(normalizeReplayKeybind(replayKeybind)),
  );

  let openWordIndex = $state<number | null>(null);
  let audioElement = $state<HTMLAudioElement | null>(null);
  let activeAudioWordIndex = $state<number | null>(null);
  let playbackClipEndMs = $state<number | null>(null);
  let hasAutoplayAttempted = $state(false);

  function getTranslation(word: unknown): WordTranslation {
    if (typeof word !== "string") {
      return EMPTY_WORD_TRANSLATION;
    }

    return (
      wordByWord[word] ??
      normalizedWordLookup[normalizeToken(word)] ??
      EMPTY_WORD_TRANSLATION
    );
  }

  function getNgramTranslationsForWord(word: unknown): NgramTranslation[] {
    if (typeof word !== "string") {
      return [];
    }

    const normalizedWord = normalizeToken(word);
    if (!normalizedWord) {
      return [];
    }

    return normalizedNgrams.filter((item) =>
      item.phrase.toLowerCase().match(tokenPattern)?.includes(normalizedWord),
    );
  }

  function getWordByIndex(index: number): AudioWordTimestamp | null {
    if (!readyAudioMetadata) {
      return null;
    }

    return readyAudioMetadata.words.find((entry) => entry.index === index) ?? null;
  }

  function getEstimatedWordDurationMs(): number {
    if (!readyAudioMetadata) {
      return 420;
    }

    const durations = readyAudioMetadata.words
      .map((word) => {
        if (word.startMs === null || word.endMs === null) {
          return null;
        }

        const duration = word.endMs - word.startMs;
        return duration > 0 ? duration : null;
      })
      .filter((duration): duration is number => duration !== null)
      .sort((a, b) => a - b);

    if (durations.length === 0) {
      return 420;
    }

    const middle = Math.floor(durations.length / 2);
    return Math.max(120, Math.min(1_200, durations[middle] ?? 420));
  }

  let estimatedWordDurationMs = $derived(getEstimatedWordDurationMs());

  function getWordEndMs(word: AudioWordTimestamp): number | null {
    if (!readyAudioMetadata || word.startMs === null) {
      return null;
    }

    if (word.endMs !== null && word.endMs > word.startMs) {
      return word.endMs;
    }

    const nextWordStartMs = readyAudioMetadata.words
      .filter((entry) => entry.index > word.index && entry.startMs !== null)
      .map((entry) => entry.startMs)
      .sort((a, b) => a - b)[0];

    return nextWordStartMs ?? word.startMs + estimatedWordDurationMs;
  }

  function findActiveAudioWordIndex(currentMs: number): number | null {
    if (!readyAudioMetadata) {
      return null;
    }

    for (let index = 0; index < readyAudioMetadata.words.length; index += 1) {
      const currentWord = readyAudioMetadata.words[index];
      if (!currentWord || currentWord.startMs === null) {
        continue;
      }

      const nextWord = readyAudioMetadata.words[index + 1];
      const effectiveEndMs = currentWord.endMs ?? nextWord?.startMs ?? null;

      if (effectiveEndMs === null && currentMs >= currentWord.startMs) {
        return currentWord.index;
      }

      if (
        effectiveEndMs !== null &&
        currentMs >= currentWord.startMs &&
        currentMs < effectiveEndMs
      ) {
        return currentWord.index;
      }
    }

    return null;
  }

  function syncWordHighlightFromAudio(): void {
    if (!audioElement) {
      return;
    }

    const currentMs = Math.round(audioElement.currentTime * 1_000);
    if (playbackClipEndMs !== null && currentMs >= playbackClipEndMs) {
      audioElement.currentTime = playbackClipEndMs / 1_000;
      audioElement.pause();
      playbackClipEndMs = null;
      return;
    }

    activeAudioWordIndex = findActiveAudioWordIndex(currentMs);
  }

  function replayAudioFromStart(): void {
    if (!audioElement) {
      return;
    }

    playbackClipEndMs = null;
    activeAudioWordIndex = null;
    audioElement.currentTime = 0;
    void audioElement.play().catch(() => {});
  }

  function jumpToWord(index: number): void {
    const timestamp = getWordByIndex(index);
    if (!audioElement || !timestamp || timestamp.startMs === null) {
      return;
    }

    const endMs = getWordEndMs(timestamp);
    playbackClipEndMs = endMs !== null ? endMs - 1 : null;
    audioElement.currentTime = timestamp.startMs / 1_000;
    activeAudioWordIndex = index;
    void audioElement.play().catch(() => {
      playbackClipEndMs = null;
    });
  }

  function onWordClick(index: number): void {
    jumpToWord(index);
    openWordIndex = openWordIndex === index ? null : index;
  }

  function onAudioPause(): void {
    playbackClipEndMs = null;
  }

  function onAudioEnded(): void {
    playbackClipEndMs = null;
    activeAudioWordIndex = null;
  }

  function onAudioSeeking(): void {
    playbackClipEndMs = null;
    syncWordHighlightFromAudio();
  }

  function isAnswerSide(): boolean {
    return document.getElementById("answer") !== null;
  }

  $effect(() => {
    if (
      !autoplay ||
      !readyAudioMetadata ||
      !audioElement ||
      hasAutoplayAttempted ||
      isAnswerSide()
    ) {
      return;
    }

    hasAutoplayAttempted = true;
    setTimeout(() => {
      replayAudioFromStart();
    }, 0);
  });
</script>

<main class="card">
  <div class="sentence" role="group" aria-label="Sentence words">
    {#each tokens as word, index (`${word}-${index}`)}
      {@const translation = getTranslation(word)}
      {@const phraseTranslations = getNgramTranslationsForWord(word)}

      <span class="word-wrapper">
        <button
          class={`word ${activeAudioWordIndex === index ? "word-active" : ""}`}
          type="button"
          onclick={() => onWordClick(index)}
        >
          {word}
        </button>

        {#if openWordIndex === index}
          <div class="popover-content">
            {#if translation.translatedText}
              <div class="translation-main">{translation.translatedText}</div>

              {#if translation.alternatives.length > 0}
                <div class="translation-alt">
                  {#each translation.alternatives as alternative}
                    {alternative}
                    <br />
                  {/each}
                </div>
              {/if}

              {#if phraseTranslations.length > 0}
                <div class="phrase-section">
                  <div class="phrase-title">Common phrases with this word</div>
                  {#each phraseTranslations as rawItem, phraseIndex (`phrase-${phraseIndex}`)}
                    {@const item = normalizeNgramTranslation(rawItem)}
                    <div class="phrase-entry">
                      <div class="phrase-source">{item.phrase}</div>
                      <div class="phrase-translation">{item.translatedText}</div>
                      {#if item.alternatives.length > 0}
                        <div class="phrase-alt">{item.alternatives.join(" | ")}</div>
                      {/if}
                      <div class="phrase-meta">
                        {item.ngramLength}-gram, {item.cardPercentage.toFixed(1)}% of cards
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            {:else}
              <div class="translation-empty">(no translation)</div>
            {/if}
          </div>
        {/if}
      </span>
    {/each}
  </div>

  {#if readyAudioMetadata}
    <div class="audio-row">
      <audio
        bind:this={audioElement}
        src={readyAudioMetadata.audioFileName}
        controls
        preload="metadata"
        onpause={onAudioPause}
        onended={onAudioEnded}
        ontimeupdate={syncWordHighlightFromAudio}
        onseeking={onAudioSeeking}
      ></audio>

      <p class="audio-hint">
        Click a word to jump to that point in the audio.
        {#if replayKeybindLabel}
          Press {replayKeybindLabel} to replay the sentence audio.
        {/if}
      </p>
    </div>
  {/if}
</main>
