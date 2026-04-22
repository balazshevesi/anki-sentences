<script lang="ts">
    import { Tooltip, Popover } from "bits-ui";

    type Props = {
        cardText: string;
        wordByWord: Record<string, string>;
    };

    let { cardText, wordByWord }: Props = $props();
    let openByIndex = $state<Record<number, boolean>>({});

    function tokenizeSentence(input: string): string[] {
        return input
            .trim()
            .split(/\s+/)
            .filter((token) => token.length > 0);
    }

    let tokens = $derived(tokenizeSentence(cardText));

    function toggleWord(index: number): void {
        openByIndex[index] = !openByIndex[index];
    }
</script>

<div class="card-words" role="group" aria-label="Sentence words">
    {#each tokens as word, index (`${word}-${index}`)}
        {@const translatedWord = wordByWord[word] ?? ""}
        <span
            tabindex="0"
            role="button"
            class="word-token"
            onkeydown={(e) => (e.key == "Enter" ? toggleWord(index) : "")}
            onclick={() => toggleWord(index)}
        >
            <!-- <Tooltip.Provider>
                <Tooltip.Root delayDuration={200}>
                    <Tooltip.Trigger class="">

                    </Tooltip.Trigger>
                    <Tooltip.Content
                        sideOffset={8}
                        class="animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--bits-tooltip-content-transform-origin)"
                    ></Tooltip.Content>
                </Tooltip.Root>
            </Tooltip.Provider> -->
            <Popover.Root>
                <Popover.Trigger class="select-text">
                    {word}
                </Popover.Trigger>
                <Popover.Portal>
                    <Popover.Content
                        class="border-dark-10 bg-background shadow-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--bits-popover-content-transform-origin) z-30 w-full max-w-[328px] rounded-[12px] border p-4"
                        sideOffset={8}>{translatedWord}</Popover.Content
                    >
                </Popover.Portal>
            </Popover.Root>
        </span>
    {/each}
</div>
