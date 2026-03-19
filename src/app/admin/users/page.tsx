import {getTranslations} from "next-intl/server";
import {requireAdmin} from "@/lib/auth/requireAuth";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import AdminAssignItemForm from "@/app/admin/users/AdminAssignItemForm";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const profile = await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const tAdmin = await getTranslations("admin");

  // Students (non-admin)
  const {data: studentsRows} = await supabase
    .from("profiles")
    .select("id,display_name,email,role")
    .eq("role", "student")
    .order("created_at", {ascending: false});

  const students = studentsRows ?? [];

  const {data: itemsRows} = await supabase
    .from("memorization_items")
    .select("id,type,title,reference,version,fixed_text,is_active")
    .eq("is_active", true)
    .order("created_at", {ascending: false})
    .limit(100);

  const items = itemsRows ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{tAdmin("assignItems")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{tAdmin("assignItems")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminAssignItemForm students={students} items={items} />
        </CardContent>
      </Card>
    </div>
  );
}

