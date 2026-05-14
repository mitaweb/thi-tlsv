import { getServiceClient } from "@/lib/supabase";
import ContestantApp from "./ContestantApp";

export const dynamic = "force-dynamic";

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const sb = getServiceClient();
  const { data: contestant } = await sb
    .from("gm_contestant")
    .select("id, round_id, display_order, full_name, organization, access_code")
    .eq("access_code", code)
    .maybeSingle();

  if (!contestant) {
    return (
      <main className="ocean-bg flex items-center justify-center p-6">
        <div className="card max-w-md text-center">
          <h1 className="text-xl font-bold text-rose-700">Mã truy cập không hợp lệ</h1>
          <p className="text-ocean-700 mt-2">Vui lòng kiểm tra lại đường link.</p>
        </div>
      </main>
    );
  }

  const { data: round } = await sb.from("gm_round").select("*").eq("id", contestant.round_id).single();

  return <ContestantApp contestant={contestant as any} round={round as any} />;
}
