import {redirect} from "next/navigation";
import {getUserProfile} from "@/lib/auth/requireAuth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profile = await getUserProfile();
  redirect(profile ? "/dashboard" : "/login");
}
