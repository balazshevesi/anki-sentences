<script lang="ts">
  import { onDestroy } from "svelte";
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

  let {
    cardText,
    wordByWord,
    ngramTranslations,
    audioMetadata,
    autoplay,
    replayKeybind,
  }: Props = $props();

  function tokenizeSentence(input: string): string[] {
    return input
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }

  let tokens: string[] = $derived(tokenizeSentence(cardText));

  function createTokenMatchPattern(): RegExp {
    const fallbackPattern = /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g;

    try {
      return new RegExp("[\\p{L}\\p{N}]+(?:['’\\-][\\p{L}\\p{N}]+)*", "gu");
    } catch {
      return fallbackPattern;
    }
  }

  const tokenMatchPattern = createTokenMatchPattern();

  function tokenizeForMatch(input: string): string[] {
    return input.toLowerCase().match(tokenMatchPattern) ?? [];
  }

  function normalizeTokenForMatch(input: string): string {
    return tokenizeForMatch(input)[0] ?? "";
  }

  function buildNormalizedWordLookup(
    source: Record<string, WordTranslation>,
  ): Record<string, WordTranslation> {
    return Object.fromEntries(
      Object.entries(source)
        .map(([key, value]) => [normalizeTokenForMatch(key), value] as const)
        .filter(([key]) => key.length > 0),
    );
  }

  let normalizedWordLookup = $derived(buildNormalizedWordLookup(wordByWord));

  function getTranslation(word: unknown): WordTranslation {
    if (typeof word !== "string") {
      return EMPTY_WORD_TRANSLATION;
    }

    return (
      wordByWord[word] ??
      normalizedWordLookup[normalizeTokenForMatch(word)] ??
      EMPTY_WORD_TRANSLATION
    );
  }

  function isLikelyUntranslatedWord(
    sourceWord: string,
    translation: WordTranslation,
  ): boolean {
    if (translation.alternatives.length > 0) {
      return false;
    }

    const source = normalizeTokenForMatch(sourceWord);
    const translated = normalizeTokenForMatch(translation.translatedText);
    return source.length > 0 && source === translated;
  }

  function normalizeNgramTranslations(
    input: NgramTranslation[],
  ): NgramTranslation[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((item) => normalizeNgramTranslation(item))
      .filter(
        (item) => item.phrase.length > 0 && item.translatedText.length > 0,
      );
  }

  let normalizedNgramTranslations = $derived(
    normalizeNgramTranslations(ngramTranslations),
  );

  function getNgramTranslationsForWord(word: unknown): NgramTranslation[] {
    if (typeof word !== "string") {
      return [];
    }

    const normalizedWord = normalizeTokenForMatch(word);
    if (!normalizedWord) {
      return [];
    }

    return normalizedNgramTranslations.filter((item) =>
      tokenizeForMatch(item.phrase).includes(normalizedWord),
    );
  }

  let readyAudioMetadata = $derived(
    isReadyAudioMetadata(audioMetadata) ? audioMetadata : null,
  );
  let openWordIndex = $state<number | null>(null);
  let audioElement = $state<HTMLAudioElement | null>(null);
  let activeAudioWordIndex = $state<number | null>(null);
  let playbackClipEndMs = $state<number | null>(null);
  let playbackFrameId = $state<number | null>(null);
  let hasAutoplayAttempted = $state(false);

  function normalizeReplayKeybind(value: string | null): string | null {
    if (value === null) {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  function formatReplayKeybindLabel(value: string | null): string | null {
    if (!value) {
      return null;
    }

    return value.length === 1 ? value.toUpperCase() : value;
  }

  function isEditableKeyboardTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false;
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      return true;
    }

    return (
      target.closest("input, textarea, select, [contenteditable='true']") !==
      null
    );
  }

  let normalizedReplayKeybind = $derived(normalizeReplayKeybind(replayKeybind));
  let replayKeybindLabel = $derived(
    formatReplayKeybindLabel(normalizedReplayKeybind),
  );

  function onWordClick(index: number): void {
    jumpToWord(index);
    openWordIndex = openWordIndex === index ? null : index;
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

  function getWordByIndex(index: number): AudioWordTimestamp | null {
    if (!readyAudioMetadata) {
      return null;
    }

    return (
      readyAudioMetadata.words.find((entry) => entry.index === index) ?? null
    );
  }

  function calculateEstimatedWordDurationMs(): number {
    if (!readyAudioMetadata) {
      return 420;
    }

    const explicitDurations = readyAudioMetadata.words
      .map((word) => {
        if (word.startMs === null || word.endMs === null) {
          return null;
        }

        const duration = word.endMs - word.startMs;
        return duration > 0 ? duration : null;
      })
      .filter((duration): duration is number => duration !== null)
      .sort((a, b) => a - b);

    if (explicitDurations.length === 0) {
      return 420;
    }

    const middleIndex = Math.floor(explicitDurations.length / 2);
    const medianDuration = explicitDurations[middleIndex] ?? 420;
    return Math.max(120, Math.min(1_200, medianDuration));
  }

  let estimatedWordDurationMs = $derived(calculateEstimatedWordDurationMs());

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

    if (typeof nextWordStartMs === "number") {
      return nextWordStartMs;
    }

    return word.startMs + estimatedWordDurationMs;
  }

  function getWordTimestamp(index: number): AudioWordTimestamp | null {
    return getWordByIndex(index);
  }

  function findActiveAudioWordIndex(currentMs: number): number | null {
    if (!readyAudioMetadata) {
      return null;
    }

    const words = readyAudioMetadata.words;
    for (let index = 0; index < words.length; index += 1) {
      const current = words[index];
      if (!current || current.startMs === null) {
        continue;
      }

      const next = words[index + 1];
      const fallbackEndMs = next?.startMs ?? null;
      const effectiveEndMs = current.endMs ?? fallbackEndMs;

      if (effectiveEndMs === null) {
        if (currentMs >= current.startMs) {
          return current.index;
        }
        continue;
      }

      if (currentMs >= current.startMs && currentMs < effectiveEndMs) {
        return current.index;
      }
    }

    return null;
  }

  function jumpToWord(index: number): void {
    const timestamp = getWordTimestamp(index);
    if (!audioElement || !timestamp || timestamp.startMs === null) {
      return;
    }

    playbackClipEndMs = getWordEndMs(timestamp) - 1;

    audioElement.currentTime = timestamp.startMs / 1_000;
    activeAudioWordIndex = index;
    void audioElement.play().catch(() => {
      playbackClipEndMs = null;
    });
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

  function stopPlaybackLoop(): void {
    if (playbackFrameId === null) {
      return;
    }

    cancelAnimationFrame(playbackFrameId);
    playbackFrameId = null;
  }

  function startPlaybackLoop(): void {
    if (playbackFrameId !== null) {
      return;
    }

    const frame = (): void => {
      syncWordHighlightFromAudio();
      playbackFrameId = requestAnimationFrame(frame);
    };

    playbackFrameId = requestAnimationFrame(frame);
  }

  onDestroy(() => {
    stopPlaybackLoop();
  });

  function onAudioPlay(): void {
    startPlaybackLoop();
  }

  function onAudioPause(): void {
    stopPlaybackLoop();
    playbackClipEndMs = null;
  }

  function onAudioEnded(): void {
    stopPlaybackLoop();
    playbackClipEndMs = null;
    activeAudioWordIndex = null;
  }

  function onAudioTimeUpdate(event: Event): void {
    if (!(event.currentTarget instanceof HTMLAudioElement)) {
      return;
    }

    syncWordHighlightFromAudio();
  }

  function onAudioSeeking(): void {
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

  $effect(() => {
    const activeReplayKeybind = normalizedReplayKeybind;
    if (!activeReplayKeybind) {
      return;
    }

    const onWindowKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      if (event.key.trim().toLowerCase() !== activeReplayKeybind) {
        return;
      }

      event.preventDefault();
      replayAudioFromStart();
    };

    window.addEventListener("keyup", onWindowKeyDown);
    return () => {
      window.removeEventListener("keyup", onWindowKeyDown);
    };
  });
</script>

<main class="card">
  <div class="sentence" role="group" aria-label="Sentence words">
    {#each tokens as word, index (`${word}-${index}`)}
      {@const translation = getTranslation(word)}
      {@const untranslatedFallback = isLikelyUntranslatedWord(
        word,
        translation,
      )}
      {@const translatedWord = untranslatedFallback
        ? ""
        : translation.translatedText}
      {@const alternatives = untranslatedFallback
        ? []
        : translation.alternatives}
      {@const frequency = translation.frequency}
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
            {#if translatedWord}
              <div class="translation-main">{translatedWord}</div>
              {#if alternatives.length > 0}
                <div class="translation-alt">
                  {#each alternatives as alternative}
                    {alternative}
                    <br />
                  {/each}
                </div>
              {/if}
              {#if frequency.hint}
                <div class="translation-frequency">
                  {frequency.hint}
                  {#if frequency.occurrencePercentage !== null}
                    ({frequency.occurrencePercentage.toFixed(4)}%)
                  {/if}
                </div>
              {/if}
              {#if phraseTranslations.length > 0}
                <div class="phrase-section">
                  <div class="phrase-title">Common phrases with this word</div>
                  {#each phraseTranslations as rawItem, phraseIndex (`phrase-${phraseIndex}`)}
                    {@const item = normalizeNgramTranslation(rawItem)}
                    <div class="phrase-entry">
                      <div class="phrase-source">{item.phrase}</div>
                      <div class="phrase-translation">
                        {item.translatedText}
                      </div>
                      {#if item.alternatives.length > 0}
                        <div class="phrase-alt">
                          {item.alternatives.join(" | ")}
                        </div>
                      {/if}
                      <div class="phrase-meta">
                        {item.ngramLength}-gram, {item.cardPercentage.toFixed(
                          1,
                        )}% of cards
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
        onplay={onAudioPlay}
        onpause={onAudioPause}
        onended={onAudioEnded}
        ontimeupdate={onAudioTimeUpdate}
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

<style>
  .card {
    margin: 0 auto;
    max-width: 50rem;
    padding: 1rem;
  }

  .sentence {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.15rem 0.35rem;
    font-size: 2rem;
    line-height: 1.7;
  }

  .word-wrapper {
    position: relative;
    display: inline-flex;
    align-items: baseline;
  }

  .word {
    margin: 0;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    line-height: inherit;
    padding: 0;
    text-align: inherit;
    border-radius: 0;
    box-shadow: none;
    text-shadow: none;
  }

  .word:hover {
    opacity: 0.9;
  }

  .word:focus-visible {
    outline: 1px solid #36c;
    outline-offset: 1px;
  }

  .word-active {
    /*color: #36c;*/
    text-decoration: underline;
    text-underline-offset: 0.16em;
  }

  .popover-content {
    position: absolute;
    left: 50%;
    top: calc(100% + 0.35rem);
    transform: translateX(-50%);
    z-index: 10;
    max-width: 22rem;
    min-width: 11rem;
    border: 1px solid #a2a9b1;
    background: #fff;
    color: #202122;
    box-shadow: 0 4px 18px rgb(0 0 0 / 18%);
    padding: 0.65rem 0.8rem;
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .translation-main {
    font-weight: 700;
  }

  .translation-alt,
  .translation-frequency,
  .translation-empty {
    color: #54595d;
    margin-top: 0.3rem;
    font-size: 0.86rem;
  }

  .phrase-section {
    margin-top: 0.45rem;
    border-top: 1px solid #eaecf0;
    padding-top: 0.45rem;
  }

  .phrase-title {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #54595d;
  }

  .phrase-entry {
    margin-top: 0.35rem;
  }

  .phrase-source,
  .phrase-meta,
  .phrase-alt {
    color: #54595d;
    font-size: 0.78rem;
  }

  .phrase-translation {
    font-weight: 600;
  }

  .audio-row {
    margin-top: 1rem;
    border-top: 1px solid #a2a9b1;
    padding-top: 0.75rem;
  }

  .audio-row audio {
    width: 100%;
  }

  .audio-hint {
    margin: 0.45rem 0 0;
    color: #54595d;
    font-size: 0.82rem;
  }

  @media (max-width: 640px) {
    .card {
      padding: 0.75rem;
    }

    .sentence {
      font-size: 1.45rem;
      line-height: 1.55;
    }
  }
</style>
