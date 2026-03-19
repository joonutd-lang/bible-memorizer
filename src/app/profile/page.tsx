import {getTranslations} from "next-intl/server";
import {requireUser} from "@/lib/auth/requireAuth";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const profile = await requireUser();
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const tProfile = await getTranslations("profile");

  let displayName = profile.displayName ?? "";
  let preferredLanguage = profile.preferredLanguage ?? "ko";
  let email = profile.email ?? "";

  if (supabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const {data} = await supabase
      .from("profiles")
      .select("display_name,preferred_language,email")
      .eq("id", profile.id)
      .single();
    displayName = data?.display_name ?? profile.displayName ?? "";
    preferredLanguage = data?.preferred_language ?? profile.preferredLanguage ?? "ko";
    email = data?.email ?? profile.email ?? "";
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tProfile("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{tProfile("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-zinc-600">{tProfile("displayName")}</div>
            <div className="font-medium text-zinc-900">{displayName || ""}</div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-zinc-600">{tProfile("preferredLanguage")}</div>
            <Badge>{preferredLanguage.toUpperCase()}</Badge>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-zinc-600">{tProfile("email")}</div>
            <div className="text-sm text-zinc-900">{email}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

