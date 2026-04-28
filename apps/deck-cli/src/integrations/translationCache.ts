import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export type CachedTranslation = {
  translatedText: string;
  alternatives: string[];
};

type TranslationCacheFile = {
  version: 1;
  entries: Record<string, CachedTranslation>;
};

const TRANSLATION_CACHE_FLUSH_DELAY_MS = 1_000;

const cacheStores = new Map<string, PersistentTranslationCache>();

function isCachedTranslation(value: unknown): value is CachedTranslation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const translation = value as Partial<CachedTranslation>;
  return (
    typeof translation.translatedText === "string" &&
    Array.isArray(translation.alternatives) &&
    translation.alternatives.every((item) => typeof item === "string")
  );
}

function parseCacheFile(rawContent: string): Record<string, CachedTranslation> {
  const parsed = JSON.parse(rawContent) as Partial<TranslationCacheFile>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  const entries = parsed.entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(entries).filter(
      (entry): entry is [string, CachedTranslation] =>
        isCachedTranslation(entry[1]),
    ),
  );
}

export function createTranslationCacheKey(args: {
  provider: string;
  sourceLanguage: string;
  targetLanguage: string;
  text: string;
  alternatives?: number;
}): string {
  return JSON.stringify({
    provider: args.provider,
    source: args.sourceLanguage,
    target: args.targetLanguage,
    alternatives: args.alternatives,
    text: args.text.toLocaleLowerCase(),
  });
}

export class PersistentTranslationCache {
  private entries = new Map<string, CachedTranslation>();
  private loadPromise: Promise<void> | null = null;
  private flushPromise = Promise.resolve();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(private readonly cachePath: string) {
    process.once("beforeExit", () => {
      if (this.dirty) {
        void this.flush();
      }
    });
  }

  async get(key: string): Promise<CachedTranslation | null> {
    await this.load();
    return this.entries.get(key) ?? null;
  }

  async set(key: string, translation: CachedTranslation): Promise<void> {
    await this.load();
    const existing = this.entries.get(key);
    if (
      existing &&
      existing.translatedText === translation.translatedText &&
      existing.alternatives.join("\0") === translation.alternatives.join("\0")
    ) {
      return;
    }

    this.entries.set(key, translation);
    this.dirty = true;
    this.scheduleFlush();
  }

  private async load(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      const file = Bun.file(this.cachePath);
      if (!(await file.exists())) {
        return;
      }

      try {
        const entries = parseCacheFile(await file.text());
        this.entries = new Map(Object.entries(entries));
      } catch (error) {
        console.warn(
          `[translations] Ignoring unreadable translation cache at ${this.cachePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    })();

    return this.loadPromise;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, TRANSLATION_CACHE_FLUSH_DELAY_MS);
  }

  private async flush(): Promise<void> {
    if (!this.dirty) {
      return this.flushPromise;
    }

    this.dirty = false;
    this.flushPromise = this.flushPromise.then(async () => {
      await mkdir(dirname(this.cachePath), { recursive: true });
      const payload: TranslationCacheFile = {
        version: 1,
        entries: Object.fromEntries(this.entries),
      };
      await Bun.write(this.cachePath, `${JSON.stringify(payload, null, 2)}\n`);
    });

    return this.flushPromise;
  }
}

export function getPersistentTranslationCache(
  cachePath: string,
): PersistentTranslationCache {
  const cached = cacheStores.get(cachePath);
  if (cached) {
    return cached;
  }

  const cache = new PersistentTranslationCache(cachePath);
  cacheStores.set(cachePath, cache);
  return cache;
}
