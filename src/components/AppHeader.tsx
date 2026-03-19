"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect, useState} from "react";
import {useTranslations} from "next-intl";
import {supabaseBrowser, isSupabaseConfigured} from "@/lib/supabase/browser";
import LanguageSwitcher from "@/components/LanguageSwitcher";

type Profile = {
  display_name: string | null;
  role: "admin" | "student" | null;
};

export default function AppHeader() {
  const t = useTranslations("header");
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Local mode: read cookie and show navigation immediately.
    if (!isSupabaseConfigured) {
      const cookies = document.cookie.split(";").map((c) => c.trim());
      const cookieValue = cookies
        .find((c) => c.startsWith("LOCAL_USER_NAME="))
        ?.split("=")
        .slice(1)
        .join("=")
        ?.trim();
      const name = cookieValue ? decodeURIComponent(cookieValue) : "";

      if (!cancelled) {
        setProfile(name ? {display_name: name, role: "student"} : null);
        setIsLoadingUser(false);
      }
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      setIsLoadingUser(true);
      try {
        const {data: userData} = await supabaseBrowser.auth.getUser();
        if (!userData?.user) {
          if (!cancelled) setProfile(null);
          return;
        }

        const {data: pData} = await supabaseBrowser
          .from("profiles")
          .select("display_name, role")
          .eq("id", userData.user.id)
          .single();

        if (!cancelled) {
          setProfile(pData ? (pData as Profile) : null);
        }
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setIsLoadingUser(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const onLogout = async () => {
    if (!isSupabaseConfigured) {
      document.cookie = "LOCAL_USER_NAME=; Path=/; Max-Age=0; SameSite=Lax";
      router.push("/login");
      return;
    }

    await supabaseBrowser.auth.signOut();
    router.push("/login");
  };

  const isAdmin = profile?.role === "admin";

  return (
    <header className="w-full border-b border-zinc-200/70 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="font-semibold text-zinc-900">
            <Link href="/dashboard" className="hover:opacity-80">
              {t("dashboard")}
            </Link>
          </div>
          {isLoadingUser ? null : (
            <nav className="hidden sm:flex items-center gap-4">
              {profile ? (
                <>
                  <Link className="text-sm text-zinc-700 hover:text-zinc-900" href="/dashboard">
                    {t("dashboard")}
                  </Link>
                  <Link className="text-sm text-zinc-700 hover:text-zinc-900" href="/history">
                    {t("history")}
                  </Link>
                  <Link className="text-sm text-zinc-700 hover:text-zinc-900" href="/profile">
                    {t("profile")}
                  </Link>
                  <Link className="text-sm text-zinc-700 hover:text-zinc-900" href="/batch-study-folders">
                    {t("batchStudy")}
                  </Link>
                  {isAdmin ? (
                    <Link className="text-sm text-zinc-700 hover:text-zinc-900" href="/admin">
                      {t("admin")}
                    </Link>
                  ) : null}
                </>
              ) : (
                <Link className="text-sm text-zinc-700 hover:text-zinc-900" href="/login">
                  {t("login")}
                </Link>
              )}
            </nav>
          )}
        </div>

        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          {isLoadingUser ? null : profile ? (
            <button
              type="button"
              onClick={onLogout}
              className="text-sm text-zinc-700 hover:text-zinc-900"
            >
              {t("logout")}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

