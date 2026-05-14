import { isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";
import QuestionsManager from "./QuestionsManager";

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin");
  return <QuestionsManager />;
}
