"use client";

import {useRouter} from "next/navigation";
import {useLocale} from "next-intl";
import {useTranslations} from "next-intl";
import {useEffect, useState} from "react";
import {supabaseBrowser} from "@/lib/supabase/browser";

const LOCALES = ["ko", "en"] as const;
type Locale = (typeof LOCALES)[number];

function setNextLocaleCookie(locale: Locale) {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
}

export default function LanguageSwitcher() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = useTranslations("header");
  const [isSavingPref, setIsSavingPref] = useState(false);

  useEffect(() => {
    // Ensure cookie exists on first load (useful for consistent middleware behavior).
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
    if (!match) setNextLocaleCookie(locale);
  }, [locale]);

  const onChange = async (nextLocale: Locale) => {
    setNextLocaleCookie(nextLocale);

    // Best-effort: persist to profile (if user is logged in).
    setIsSavingPref(true);
    try {
      const {data: userData, error: userErr} = await supabaseBrowser.auth.getUser();
      if (!userErr && userData?.user) {
        await supabaseBrowser
          .from("profiles")
          .update({preferred_language: nextLocale})
          .eq("id", userData.user.id);
      }
    } finally {
      setIsSavingPref(false);
    }

    router.refresh();
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-zinc-600">
        {locale === "ko" ? t("languageKo") : t("languageEn")}
      </span>
      <div className="flex rounded-md border border-zinc-200 overflow-hidden">
        {LOCALES.map((l) => {
          const active = l === locale;
          return (
            <button
              key={l}
              type="button"
              onClick={() => onChange(l)}
              disabled={isSavingPref}
              className={[
                "px-3 py-1 text-sm",
                active ? "bg-zinc-900 text-white" : "bg-white text-zinc-900 hover:bg-zinc-100",
              ].join(" ")}
            >
              {l === "ko" ? t("languageKo") : t("languageEn")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

