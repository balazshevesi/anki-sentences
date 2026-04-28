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
  import TranslationPopover from "./TranslationPopover.svelte";

  type Props = {
    cardText: string;
    wordByWord: Record<string, WordTranslation>;
    ngramTranslations: NgramTranslation[];
    audioMetadata: AudioMetadata | null;
    autoplay: boolean;
    replayKeybind: string | null;
  };

  let {
    cardText,
    wordByWord,
    ngramTranslations,
    audioMetadata,
    autoplay,
  }: Props = $props();

  const tokenPattern = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;

  const normalizeToken = (input: string): string => {
    return input.toLowerCase().match(tokenPattern)?.[0] ?? "";
  };

  const buildNormalizedWordLookup = (
    source: Record<string, WordTranslation>,
  ): Record<string, WordTranslation> => {
    return Object.fromEntries(
      Object.entries(source)
        .map(
          ([word, translation]) => [normalizeToken(word), translation] as const,
        )
        .filter(([word]) => word.length > 0),
    );
  };

  let tokens: string[] = $derived(
    cardText
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0),
  );
  let normalizedWordLookup = $derived(buildNormalizedWordLookup(wordByWord));
  let normalizedNgrams = $derived(
    ngramTranslations
      .map((item) => normalizeNgramTranslation(item))
      .filter(
        (item) => item.phrase.length > 0 && item.translatedText.length > 0,
      ),
  );
  let readyAudioMetadata = $derived(
    isReadyAudioMetadata(audioMetadata) ? audioMetadata : null,
  );

  let openWordIndex = $state<number | null>(null);
  let audioElement = $state<HTMLAudioElement | null>(null);
  let activeAudioWordIndex = $state<number | null>(null);
  let playbackClipEndMs = $state<number | null>(null);
  let hasAutoplayAttempted = $state(false);

  const getTranslation = (word: unknown): WordTranslation => {
    if (typeof word !== "string") return EMPTY_WORD_TRANSLATION;
    return (
      wordByWord[word] ??
      normalizedWordLookup[normalizeToken(word)] ??
      EMPTY_WORD_TRANSLATION
    );
  };

  const getNgramTranslationsForWord = (word: unknown): NgramTranslation[] => {
    if (typeof word !== "string") return [];
    const normalizedWord = normalizeToken(word);
    if (!normalizedWord) return [];
    return normalizedNgrams.filter((item) =>
      item.phrase.toLowerCase().match(tokenPattern)?.includes(normalizedWord),
    );
  };

  const getEstimatedWordDurationMs = (): number => {
    if (!readyAudioMetadata) return 420;

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

    if (durations.length === 0) return 420;
    const middle = Math.floor(durations.length / 2);
    return Math.max(120, Math.min(1_200, durations[middle] ?? 420));
  };

  let estimatedWordDurationMs = $derived(getEstimatedWordDurationMs());

  const getWordEndMs = (word: AudioWordTimestamp): number | null => {
    if (!readyAudioMetadata || word.startMs === null) return null;
    if (word.endMs !== null && word.endMs > word.startMs) return word.endMs;
    const nextWordStartMs = readyAudioMetadata.words.find(
      (entry) => entry.index > word.index && entry.startMs !== null,
    )?.startMs;
    return nextWordStartMs ?? word.startMs + estimatedWordDurationMs;
  };

  const findActiveAudioWordIndex = (currentMs: number): number | null => {
    if (!readyAudioMetadata) return null;
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
  };

  const syncWordHighlightFromAudio = (): void => {
    if (!audioElement) return;
    const currentMs = Math.round(audioElement.currentTime * 1_000);
    if (playbackClipEndMs !== null && currentMs >= playbackClipEndMs) {
      audioElement.currentTime = playbackClipEndMs / 1_000;
      audioElement.pause();
      playbackClipEndMs = null;
      return;
    }
    activeAudioWordIndex = findActiveAudioWordIndex(currentMs);
  };

  const replayAudioFromStart = (): void => {
    if (!audioElement) return;
    playbackClipEndMs = null;
    activeAudioWordIndex = null;
    audioElement.currentTime = 0;
    void audioElement.play().catch(() => {});
  };

  const jumpToWord = (index: number): void => {
    const timestamp = readyAudioMetadata?.words.find(
      (entry) => entry.index === index,
    );
    if (!audioElement || !timestamp || timestamp.startMs === null) return;
    const endMs = getWordEndMs(timestamp);
    playbackClipEndMs = endMs !== null ? endMs - 1 : null;
    audioElement.currentTime = timestamp.startMs / 1_000;
    activeAudioWordIndex = index;
    void audioElement.play().catch(() => {
      playbackClipEndMs = null;
    });
  };

  const onWordClick = (index: number): void => {
    openWordIndex = openWordIndex === index ? null : index;
  };
  const canPlayWordAudio = (index: number): boolean =>
    readyAudioMetadata?.words.some(
      (entry) => entry.index === index && entry.startMs !== null,
    ) ?? false;
  const closePopover = (): void => (openWordIndex = null);
  const onAudioPause = (): void => (playbackClipEndMs = null);
  const onAudioEnded = (): void => {
    playbackClipEndMs = null;
    activeAudioWordIndex = null;
  };
  const onAudioSeeking = (): void => {
    playbackClipEndMs = null;
    syncWordHighlightFromAudio();
  };
  const isAnswerSide = (): boolean =>
    document.getElementById("answer") !== null;

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

<main class="m-0 mx-auto max-w-3xl p-5 font-serif leading-normal sm:p-6">
  <div
    class="flex flex-wrap justify-center gap-x-1.5 gap-y-0.5 text-center text-2xl leading-normal sm:text-3xl sm:leading-relaxed"
    role="group"
    aria-label="Sentence words"
  >
    {#each tokens as word, index (`${word}-${index}`)}
      {@const translation = getTranslation(word)}
      {@const phraseTranslations = getNgramTranslationsForWord(word)}

      <span class="relative inline-flex items-baseline">
        <button
          class={`hover:opacity-80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-blue-700 ${activeAudioWordIndex === index ? "underline underline-offset-4" : ""}`}
          type="button"
          onclick={() => onWordClick(index)}
        >
          {word}
        </button>
        {#if openWordIndex === index}
          <TranslationPopover
            {translation}
            {phraseTranslations}
            onPlayAudio={canPlayWordAudio(index)
              ? () => jumpToWord(index)
              : null}
            onClose={closePopover}
          />
        {/if}
      </span>
    {/each}
  </div>

  {#if readyAudioMetadata}
    <div class="mt-4 block border-t border-gray-400 pt-3">
      <audio
        class="w-full"
        bind:this={audioElement}
        src={readyAudioMetadata.audioFileName}
        controls
        preload="metadata"
        onpause={onAudioPause}
        onended={onAudioEnded}
        ontimeupdate={syncWordHighlightFromAudio}
        onseeking={onAudioSeeking}
      ></audio>
    </div>
  {/if}
</main>
