export type LocalMemorizationItem = {
  itemId: string;
  type: "bible" | "vocab" | "custom";
  title: string;
  reference: string | null;
  version: string | null;
  raw_text: string;
  fixed_text: string;
  meaning: string | null;
  notes: string | null;
  difficulty: number;
};

// Seeded items (same as scripts/seed.ts) with stable ids.
// These are used only in "local mode" when Supabase env vars are missing.
export const LOCAL_ITEMS: LocalMemorizationItem[] = [
  {
    itemId: "local-item-john-3-16-kjv",
    type: "bible",
    title: "John 3:16",
    reference: "John 3:16",
    version: "KJV",
    raw_text:
      "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    fixed_text:
      "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    meaning: "God's love is shown through Jesus, so believers can have eternal life.",
    notes: "Type the verse exactly as saved in fixed_text.",
    difficulty: 3,
  },
  {
    itemId: "local-item-yo-3-16-kae",
    type: "bible",
    title: "요한복음 3:16",
    reference: "요한복음 3:16",
    version: "개역개정",
    raw_text:
      "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라",
    fixed_text:
      "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라",
    meaning: "하나님의 사랑과 독생자를 통해 믿는 자는 멸망하지 않고 영생을 얻습니다.",
    notes: "한국어 띄어쓰기를 그대로 연습하세요.",
    difficulty: 3,
  },
  {
    itemId: "local-item-vocab-grace",
    type: "vocab",
    title: "Vocabulary sample",
    reference: null,
    version: null,
    raw_text: "grace",
    fixed_text: "grace",
    meaning: "grace: 은혜",
    notes: "Memorize the word exactly.",
    difficulty: 1,
  },
  {
    itemId: "local-item-custom-sentence",
    type: "custom",
    title: "Custom sentence",
    reference: null,
    version: null,
    raw_text: "Be strong and courageous.",
    fixed_text: "Be strong and courageous.",
    meaning: "A reminder to keep courage and strength in difficult times.",
    notes: "Include the period at the end if punctuation is not ignored.",
    difficulty: 2,
  },
];

export function getLocalItemById(itemId: string) {
  return LOCAL_ITEMS.find((i) => i.itemId === itemId) ?? null;
}

