import {redirect} from "next/navigation";
import {getUserProfile} from "@/lib/auth/requireAuth";
import LoginForm from "@/app/login/LoginForm";
import {getTranslations} from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const profile = await getUserProfile();
  if (profile) redirect("/dashboard");

  const t = await getTranslations("auth");
  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-2">{t("title")}</h1>
      <p className="text-sm text-zinc-600 mb-6">{t("subtitle")}</p>
      <LoginForm />
    </div>
  );
}

