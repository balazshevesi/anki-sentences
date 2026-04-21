# Frequency words downloader

Downloads pre-generated frequency lists from:

`https://github.com/hermitdave/FrequencyWords`

## Default run

```bash
bun run update:words
```

This fetches and overwrites:

- `en50k.txt`
- `de50k.txt`
- `es50k.txt`

## Custom run

```bash
bun run words/updateFrequencyWords.ts en:50k hu:50k zh_cn:50k
```

You can also set the data year folder (default: `2018`):

```bash
bun run words/updateFrequencyWords.ts --year=2018 en:full
```
