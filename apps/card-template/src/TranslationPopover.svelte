<script lang="ts">
  import type {
    NgramTranslation,
    WordTranslation,
  } from "../../deck-cli/src/contracts/cardPayload";

  type Props = {
    translation: WordTranslation;
    phraseTranslations: NgramTranslation[];
    onClose: () => void;
  };

  let { translation, phraseTranslations, onClose }: Props = $props();
  let popoverElement = $state<HTMLDivElement | null>(null);

  $effect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !popoverElement?.contains(event.target)
      ) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  });
</script>

<div class="popover-content" bind:this={popoverElement}>
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
        {#each phraseTranslations as item, phraseIndex (`phrase-${phraseIndex}`)}
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
              {item.ngramLength}-gram, {item.cardPercentage.toFixed(1)}% of
              cards
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    <div class="translation-empty">(no translation)</div>
  {/if}
</div>
