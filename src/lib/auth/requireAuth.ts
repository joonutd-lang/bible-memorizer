import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {cookies} from "next/headers";
import {getOrCreateLocalUserByName} from "@/lib/local/localDb";
import {getOrCreateKvUserByName} from "@/lib/kv/kvDb";
import {isKvConfigured} from "@/lib/kv/kvClient";

export type AppProfile = {
  id: string;
  email: string | null;
  displayName: string | null;
  role: "admin" | "student";
  preferredLanguage: "ko" | "en";
};

export async function getUserProfile(): Promise<AppProfile | null> {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  // Local mode: identify user by cookie, create profile persisted in .localdb.
  if (!supabaseConfigured) {
    const store = await cookies();
    const localNameRaw = store.get("LOCAL_USER_NAME")?.value;
    let localName = localNameRaw ?? "";
    try {
      localName = localNameRaw ? decodeURIComponent(localNameRaw) : "";
    } catch {
      // If decoding fails, fall back to raw value.
      localName = localNameRaw ?? "";
    }
    if (!localName) return null;

    const profile = isKvConfigured ? await getOrCreateKvUserByName(localName) : await getOrCreateLocalUserByName(localName);
    return {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role,
      preferredLanguage: profile.preferredLanguage,
    };
  }

  const supabase = await createSupabaseServerClient();
  const {data: userData, error: userErr} = await supabase.auth.getUser();
  if (userErr || !userData?.user) return null;

  const userId = userData.user.id;
  const {data: profileData, error: profileErr} = await supabase
    .from("profiles")
    .select("id,email,display_name,role,preferred_language")
    .eq("id", userId)
    .single();

  if (profileErr || !profileData) return null;

  return {
    id: profileData.id,
    email: profileData.email ?? null,
    displayName: profileData.display_name ?? null,
    role: profileData.role,
    preferredLanguage: profileData.preferred_language,
  };
}

export async function requireUser(): Promise<AppProfile> {
  const profile = await getUserProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireAdmin(): Promise<AppProfile> {
  const profile = await getUserProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}

