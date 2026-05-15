import { getServiceClient } from "@/lib/supabase";
import JudgeApp from "./JudgeApp";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function JudgePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const sb = getServiceClient();
  const { data: judge } = await sb
    .from("gm_judge")
    .select("*")
    .eq("access_code", code)
    .maybeSingle();

  if (!judge || !judge.active) {
    notFound();
  }

  return <JudgeApp judge={judge} accessCode={code} />;
}
