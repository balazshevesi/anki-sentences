<script lang="ts">
  import type {
    NgramTranslation,
    WordTranslation,
  } from "../../deck-cli/src/contracts/cardPayload";

  type Props = {
    translation: WordTranslation;
    phraseTranslations: NgramTranslation[];
    onPlayAudio: (() => void) | null;
    onClose: () => void;
  };

  let { translation, phraseTranslations, onPlayAudio, onClose }: Props =
    $props();
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

<div
  class="absolute top-full left-1/2 z-10 mt-1.5 min-w-44 max-w-md -translate-x-1/2 border border-gray-400 bg-white px-3 py-2 text-left text-base leading-normal text-neutral-800 shadow-lg"
  bind:this={popoverElement}
>
  <div
    class="pointer-events-none absolute top-0 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-t border-l border-gray-400 bg-white"
  ></div>

  <div class="flex flex-col gap-4 sm:flex-row">
    <div class="min-w-32">
      {#if translation.translatedText}
        <div class="font-bold">{translation.translatedText}</div>

        {#if translation.alternatives.length > 0}
          <div class="mt-1 text-sm text-zinc-600">
            {#each translation.alternatives as alternative}
              {alternative}
              <br />
            {/each}
          </div>
        {/if}
      {:else}
        <div class="mt-1 text-sm text-zinc-600">(no translation)</div>
      {/if}
    </div>

    {#if phraseTranslations.length > 0}
      <div class="min-w-40 border-t border-gray-200 pt-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
        {#each phraseTranslations as item, phraseIndex (`phrase-${phraseIndex}`)}
          <div class:mt-2={phraseIndex > 0}>
            <div class="text-xs text-zinc-600">{item.phrase}</div>
            <div class="font-semibold">
              {item.translatedText}
            </div>
            {#if item.alternatives.length > 0}
              <div class="text-xs text-zinc-600">
                {item.alternatives.join(" | ")}
              </div>
            {/if}
            <div class="text-xs text-zinc-600">
              {item.ngramLength}-gram, {item.cardPercentage.toFixed(1)}% of
              cards
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if onPlayAudio}
    <button
      class="mt-2 block text-sm font-semibold text-blue-700 underline underline-offset-2"
      type="button"
      onclick={onPlayAudio}
      >🔊
    </button>
  {/if}
</div>
