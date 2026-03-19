"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {supabaseBrowser, isSupabaseConfigured} from "@/lib/supabase/browser";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

export default function LoginForm() {
  const router = useRouter();
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");

  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("nameRequired"));
      return;
    }
    setLoading(true);
    try {
      // Local mode: no Supabase env. Persist user name in cookie and use .localdb.
      if (!isSupabaseConfigured) {
        document.cookie = `LOCAL_USER_NAME=${encodeURIComponent(trimmed)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        router.push("/dashboard");
        router.refresh();
        return;
      }

      const {data, error: err} = await supabaseBrowser.auth.signInAnonymously();
      if (err) {
        setError(t("enterError"));
        return;
      }
      if (data?.user) {
        await supabaseBrowser.from("profiles").update({display_name: trimmed}).eq("id", data.user.id);
      }

      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Failed to fetch" || msg.includes("fetch")) {
        setError(t("connectionError"));
      } else {
        setError(t("enterError"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {!isSupabaseConfigured && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          {t("supabaseNotConfigured")}
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-800">{t("name")}</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            type="text"
            autoComplete="name"
            placeholder={t("namePlaceholder")}
            required
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? tCommon("loading") : t("enter")}
        </Button>
      </form>
    </div>
  );
}
