import {createClient} from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const ADMIN_EMAIL = "admin@example.com";
const ADMIN_PASSWORD = "Admin123!";
const ADMIN_DISPLAY_NAME = "Admin";

const STUDENT_EMAIL = "student1@example.com";
const STUDENT_PASSWORD = "Student123!";
const STUDENT_DISPLAY_NAME = "Student 1";

type MemorizationItem = {
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

async function ensureUser(params: {
  email: string;
  password: string;
  displayName: string;
  role: "admin" | "student";
}) {
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {auth: {persistSession: false}});

  const {data: listData, error: listErr} = await supabaseAdmin.auth.admin.listUsers({perPage: 100});

  const users = (listData as any)?.users ?? [];
  const userToUse =
    users.find((u: any) => u?.email === params.email) ??
    (
      await supabaseAdmin.auth.admin.createUser({
        email: params.email,
        password: params.password,
        email_confirm: true,
      })
    ).data.user;

  // Trigger will create profile row, but we update role/display_name explicitly.
  await supabaseAdmin
    .from("profiles")
    .upsert({
      id: userToUse.id,
      email: params.email,
      display_name: params.displayName,
      role: params.role,
      preferred_language: "ko",
    });

  return userToUse;
}

async function upsertItem(params: {
  createdBy: string;
  item: MemorizationItem;
}) {
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {auth: {persistSession: false}});

  let existing: any[] = [];
  if (params.item.type === "bible") {
    const {data} = await supabaseAdmin
      .from("memorization_items")
      .select("id")
      .eq("type", params.item.type)
      .eq("reference", params.item.reference)
      .eq("version", params.item.version)
      .limit(1);
    existing = data ?? [];
  } else {
    const {data} = await supabaseAdmin
      .from("memorization_items")
      .select("id")
      .eq("type", params.item.type)
      .eq("title", params.item.title)
      .limit(1);
    existing = data ?? [];
  }

  if (existing.length > 0) return existing[0].id;

  const {data, error} = await supabaseAdmin
    .from("memorization_items")
    .insert({
      type: params.item.type,
      title: params.item.title,
      reference: params.item.reference,
      version: params.item.version,
      raw_text: params.item.raw_text,
      fixed_text: params.item.fixed_text,
      meaning: params.item.meaning,
      notes: params.item.notes,
      difficulty: params.item.difficulty,
      created_by: params.createdBy,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("Failed to insert item");
  return data.id as string;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run seed.");
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {auth: {persistSession: false}});

  // Ensure users + profiles.
  const adminUser = await ensureUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    displayName: ADMIN_DISPLAY_NAME,
    role: "admin",
  });
  const studentUser = await ensureUser({
    email: STUDENT_EMAIL,
    password: STUDENT_PASSWORD,
    displayName: STUDENT_DISPLAY_NAME,
    role: "student",
  });

  const today = new Date();
  const dueDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const items: MemorizationItem[] = [
    {
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

  // Insert items (or keep existing).
  const itemIds: Record<string, string> = {};
  for (const item of items) {
    const id = await upsertItem({createdBy: adminUser.id, item});
    itemIds[`${item.type}:${item.title}`] = id;
  }

  // Assign all items to the student.
  const assignmentCandidates = items.map((item) => ({
    user_id: studentUser.id,
    item_id: itemIds[`${item.type}:${item.title}`],
    due_date: dueDate,
  }));

  for (const a of assignmentCandidates) {
    // Avoid duplicates: check existing assignment for user+item.
    const {data: existing} = await supabaseAdmin
      .from("memorization_assignments")
      .select("id")
      .eq("user_id", a.user_id)
      .eq("item_id", a.item_id)
      .limit(1);

    if (existing && existing.length > 0) continue;

    await supabaseAdmin.from("memorization_assignments").insert({
      user_id: a.user_id,
      item_id: a.item_id,
      due_date: a.due_date,
      assigned_fixed_text_override: null,
      assigned_version_override: null,
      is_active: true,
    });
  }

  // Ensure student's preferred_language is KO by default.
  await supabaseAdmin
    .from("profiles")
    .update({preferred_language: "ko"})
    .eq("id", studentUser.id);

  // eslint-disable-next-line no-console
  console.log("Seed completed.");
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

