<script lang="ts">
    import { Popover } from "bits-ui";
    import {
        EMPTY_WORD_TRANSLATION,
        normalizeNgramTranslation,
        type NgramTranslation,
        type WordTranslation,
    } from "../../shared/cardPayload";

    type Props = {
        cardText: string;
        wordByWord: Record<string, WordTranslation>;
        ngramTranslations: NgramTranslation[];
    };

    let { cardText, wordByWord, ngramTranslations }: Props = $props();
    let openByIndex = $state<Record<number, boolean>>({});

    function tokenizeSentence(input: string): string[] {
        return input
            .trim()
            .split(/\s+/)
            .filter((token) => token.length > 0);
    }

    let tokens: string[] = $derived(tokenizeSentence(cardText));

    function toggleWord(index: number): void {
        openByIndex[index] = !openByIndex[index];
    }

    function getTranslation(word: unknown): WordTranslation {
        if (typeof word !== "string") {
            return EMPTY_WORD_TRANSLATION;
        }

        return wordByWord[word] ?? EMPTY_WORD_TRANSLATION;
    }

    function tokenizeForMatch(input: string): string[] {
        return input.toLowerCase().match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? [];
    }

    function normalizeTokenForMatch(input: string): string {
        return tokenizeForMatch(input)[0] ?? "";
    }

    function getNgramTranslations(): NgramTranslation[] {
        if (!Array.isArray(ngramTranslations)) {
            return [];
        }

        return ngramTranslations
            .map((item) => normalizeNgramTranslation(item))
            .filter((item) => item.phrase.length > 0 && item.translatedText.length > 0);
    }

    function getNgramTranslationsForWord(word: unknown): NgramTranslation[] {
        if (typeof word !== "string") {
            return [];
        }

        const normalizedWord = normalizeTokenForMatch(word);
        if (!normalizedWord) {
            return [];
        }

        return getNgramTranslations().filter((item) =>
            tokenizeForMatch(item.phrase).includes(normalizedWord)
        );
    }
</script>

<div class="card-words" role="group" aria-label="Sentence words">
    {#each tokens as word, index (`${word}-${index}`)}
        {@const translation = getTranslation(word)}
        {@const translatedWord = translation.translatedText}
        {@const alternatives = translation.alternatives}
        {@const frequency = translation.frequency}
        {@const phraseTranslations = getNgramTranslationsForWord(word)}
        <span
            tabindex="0"
            role="button"
            class="word-token"
            onkeydown={(e) => (e.key == "Enter" ? toggleWord(index) : "")}
            onclick={() => toggleWord(index)}
        >
            <Popover.Root>
                <Popover.Trigger class="select-text">
                    {word}
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content
                        class="border-dark-10 bg-background shadow-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--bits-popover-content-transform-origin) z-30 w-full max-w-[328px] rounded-[12px] border p-4"
                        sideOffset={8}
                    >
                        {#if translatedWord}
                            <div class="font-medium">{translatedWord}</div>
                            {#if alternatives.length > 0}
                                <div class="mt-2 text-sm opacity-80">
                                    {alternatives.join(" | ")}
                                </div>
                            {/if}
                            {#if frequency.hint}
                                <div class="mt-2 text-xs opacity-70">
                                    {frequency.hint}
                                    {#if frequency.occurrencePercentage !== null}
                                        ({frequency.occurrencePercentage.toFixed(4)}%)
                                    {/if}
                                </div>
                            {/if}
                            {#if phraseTranslations.length > 0}
                                <div class="mt-3 border-t pt-2">
                                    <div class="text-xs opacity-70">Common phrases with this word</div>
                                    {#each phraseTranslations as rawItem, phraseIndex (`phrase-${phraseIndex}`)}
                                        {@const item = normalizeNgramTranslation(rawItem)}
                                        <div class="mt-2 text-sm">
                                            <div class="opacity-70">{item.phrase}</div>
                                            <div class="font-medium">{item.translatedText}</div>
                                            {#if item.alternatives.length > 0}
                                                <div class="text-xs opacity-80">
                                                    {item.alternatives.join(" | ")}
                                                </div>
                                            {/if}
                                            <div class="text-xs opacity-70">
                                                {item.ngramLength}-gram, {item.cardPercentage.toFixed(1)}% of cards
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        {:else}
                            <div class="text-sm opacity-70">(no translation)</div>
                        {/if}
                    </Popover.Content
                    >
                </Popover.Portal>
            </Popover.Root>
        </span>
    {/each}
</div>
