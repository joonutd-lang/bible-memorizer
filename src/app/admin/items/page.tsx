import {getTranslations} from "next-intl/server";
import {requireAdmin} from "@/lib/auth/requireAuth";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import AdminCreateItemForm from "@/app/admin/items/AdminCreateItemForm";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminItemsPage() {
  await requireAdmin();
  const tAdmin = await getTranslations("admin");
  const tCommon = await getTranslations("common");

  const supabase = await createSupabaseServerClient();
  const {data: itemsRows} = await supabase
    .from("memorization_items")
    .select("id,type,title,reference,version,fixed_text,meaning,notes,difficulty,created_at")
    .eq("is_active", true)
    .order("created_at", {ascending: false})
    .limit(50);

  const items = itemsRows ?? [];
  const typeLabel = (type: string) => {
    if (type === "bible") return tAdmin("typeBible");
    if (type === "vocab") return tAdmin("typeVocab");
    if (type === "custom") return tAdmin("typeCustom");
    return type;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tAdmin("createItem")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{tAdmin("createItem")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminCreateItemForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tAdmin("items")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-zinc-600">{tCommon("noData")}</p>
          ) : (
            items.map((it: any) => (
              <div key={it.id} className="rounded-lg border border-zinc-200 p-3 bg-white space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-semibold text-zinc-900">
                      {it.reference ? it.reference : it.title}
                    </div>
                    <div className="text-sm text-zinc-600">
                      {tAdmin("type")}: {typeLabel(it.type)} · {tAdmin("version")}: {it.version ?? ""}
                    </div>
                  </div>
                  <div className="text-sm text-zinc-600">
                    {tAdmin("difficulty")}: {it.difficulty}
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-xs text-zinc-500">{tAdmin("fixedText")}</div>
                  <pre className="whitespace-pre-wrap text-sm leading-6">{it.fixed_text}</pre>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

