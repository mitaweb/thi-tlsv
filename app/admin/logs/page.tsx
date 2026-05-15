import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import LogsViewer from "./LogsViewer";

export default async function LogsPage() {
  const ok = await isAdmin();
  if (!ok) redirect("/admin");
  return <LogsViewer />;
}
