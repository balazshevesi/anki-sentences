<script lang="ts">
    import { Popover } from "bits-ui";

    type WordTranslation = {
        translatedText: string;
        alternatives: string[];
        frequency: WordFrequencyInfo;
    };

    type WordFrequencyInfo = {
        rank: number | null;
        occurrencePercentage: number | null;
        rarity: string;
        hint: string;
    };

    type Props = {
        cardText: string;
        wordByWord: Record<string, WordTranslation>;
    };

    const EMPTY_WORD_TRANSLATION: WordTranslation = {
        translatedText: "",
        alternatives: [],
        frequency: {
            rank: null,
            occurrencePercentage: null,
            rarity: "very_rare",
            hint: "",
        },
    };

    let { cardText, wordByWord }: Props = $props();
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
</script>

<div class="card-words" role="group" aria-label="Sentence words">
    {#each tokens as word, index (`${word}-${index}`)}
        {@const translation = getTranslation(word)}
        {@const translatedWord = translation.translatedText}
        {@const alternatives = translation.alternatives}
        {@const frequency = translation.frequency}
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
