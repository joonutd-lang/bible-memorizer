import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {requireAdmin} from "@/lib/auth/requireAuth";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import ScoringSettingsForm from "@/app/admin/ScoringSettingsForm";
import {getScoringSettings} from "@/lib/settings/scoring";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  await requireAdmin();
  const tAdmin = await getTranslations("admin");
  const scoring = await getScoringSettings();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tAdmin("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{tAdmin("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-600">{tAdmin("summary")}</p>

          <div className="flex flex-col sm:flex-row gap-2">
            <Link href="/admin/items">
              <Button className="w-full sm:w-auto">{tAdmin("createItem")}</Button>
            </Link>
            <Link href="/admin/users">
              <Button variant="outline" className="w-full sm:w-auto">
                {tAdmin("assignItems")}
              </Button>
            </Link>
            <Link href="/admin/results">
              <Button variant="outline" className="w-full sm:w-auto">
                {tAdmin("results")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tAdmin("scoringSettings")}</CardTitle>
        </CardHeader>
        <ScoringSettingsForm initial={scoring} />
      </Card>
    </div>
  );
}

