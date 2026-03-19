import {cookies} from "next/headers";
import {getRequestConfig} from "next-intl/server";

export default getRequestConfig(async () => {
  // Locale is stored in `NEXT_LOCALE` cookie via next-intl middleware.
  const store = await cookies();
  const cookieLocale = store.get?.("NEXT_LOCALE")?.value;
  const locale = (cookieLocale === "en" ? "en" : "ko") as "ko" | "en";

  const messages = (await import(`../../messages/${locale}.json`)).default;
  return {locale, messages};
});

