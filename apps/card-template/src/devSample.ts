import type { CardPayload } from "../../deck-cli/src/contracts/cardPayload";

export const DEV_SAMPLE_CARD_TEXT =
  "You're laughing about it now, but some years later you won't do it.";

const DEV_SAMPLE_CARD_PAYLOAD: CardPayload = {
  wordByWord: {
    "You're": {
      translatedText: "Te",
      alternatives: ["Maga", "Te vagy"],
      frequency: {
        rank: 13594,
        occurrencePercentage: 0.00021265,
        rarity: "uncommon",
        hint: "Uncommon (rank 13,594)",
      },
    },
    laughing: {
      translatedText: "nevetés",
      alternatives: ["nevess", "nevetve"],
      frequency: {
        rank: 627,
        occurrencePercentage: 0.01357294,
        rarity: "very_common",
        hint: "Very common (top 627)",
      },
    },
    about: {
      translatedText: "kb",
      alternatives: ["körülbelül", "a következő"],
      frequency: {
        rank: 51,
        occurrencePercentage: 0.343026,
        rarity: "very_common",
        hint: "Very common (top 51)",
      },
    },
    it: {
      translatedText: "t",
      alternatives: ["ed", "a", "e"],
      frequency: {
        rank: 7,
        occurrencePercentage: 1.87992536,
        rarity: "very_common",
        hint: "Very common (top 7)",
      },
    },
    "now,": {
      translatedText: "most",
      alternatives: ["nos"],
      frequency: {
        rank: 55,
        occurrencePercentage: 0.3170278,
        rarity: "very_common",
        hint: "Very common (top 55)",
      },
    },
    but: {
      translatedText: "de",
      alternatives: [],
      frequency: {
        rank: 36,
        occurrencePercentage: 0.50080885,
        rarity: "very_common",
        hint: "Very common (top 36)",
      },
    },
    some: {
      translatedText: "néhány",
      alternatives: ["némelyik", "némely"],
      frequency: {
        rank: 100,
        occurrencePercentage: 0.16092716,
        rarity: "very_common",
        hint: "Very common (top 100)",
      },
    },
    years: {
      translatedText: "év",
      alternatives: ["évek", "éves"],
      frequency: {
        rank: 183,
        occurrencePercentage: 0.06645251,
        rarity: "very_common",
        hint: "Very common (top 183)",
      },
    },
    later: {
      translatedText: "később",
      alternatives: [],
      frequency: {
        rank: 363,
        occurrencePercentage: 0.02880602,
        rarity: "very_common",
        hint: "Very common (top 363)",
      },
    },
    you: {
      translatedText: "ön",
      alternatives: ["te"],
      frequency: {
        rank: 1,
        occurrencePercentage: 3.97004852,
        rarity: "very_common",
        hint: "Very common (top 1)",
      },
    },
    "won't": {
      translatedText: "nem",
      alternatives: [],
      frequency: {
        rank: 7805,
        occurrencePercentage: 0.00050461,
        rarity: "uncommon",
        hint: "Uncommon (rank 7,805)",
      },
    },
    do: {
      translatedText: "igen",
      alternatives: ["ne", "nem"],
      frequency: {
        rank: 24,
        occurrencePercentage: 0.60953867,
        rarity: "very_common",
        hint: "Very common (top 24)",
      },
    },
    "it.": {
      translatedText: "ez",
      alternatives: ["ez az"],
      frequency: {
        rank: 8404,
        occurrencePercentage: 0.0004511,
        rarity: "uncommon",
        hint: "Uncommon (rank 8,404)",
      },
    },
  },
  ngramTranslations: [],
  audioMetadata: null,
};

export const DEV_SAMPLE_CARD_PAYLOAD_JSON = JSON.stringify(
  DEV_SAMPLE_CARD_PAYLOAD,
);
