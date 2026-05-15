import { NextRequest, NextResponse } from "next/server";
import { isAdminReq } from "@/lib/auth";
import { getServiceClient } from "@/lib/supabase";
import { del } from "@vercel/blob";

/**
 * PATCH /api/media/[questionId]
 * Body: { url: string, type: 'image' | 'video' }
 * Gán media URL+type vào question.
 *
 * DELETE /api/media/[questionId]
 * Xóa media URL khỏi question + xóa file trên Vercel Blob.
 */
async function getQid(params: Promise<{ questionId: string }>): Promise<string> {
  const p = await params;
  return p.questionId;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ questionId: string }> }) {
  if (!isAdminReq(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const questionId = await getQid(params);
  const body = await req.json().catch(() => ({}));
  const { url, type } = body as { url?: string; type?: string };
  if (!url || (type !== "image" && type !== "video")) {
    return NextResponse.json({ ok: false, error: "missing_url_or_type" }, { status: 400 });
  }
  const sb = getServiceClient();
  const { error } = await sb.from("gm_question").update({ media_url: url, media_type: type }).eq("id", questionId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ questionId: string }> }) {
  if (!isAdminReq(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const questionId = await getQid(params);
  const sb = getServiceClient();

  // Đọc URL hiện tại để xóa blob
  const { data: q } = await sb.from("gm_question").select("media_url").eq("id", questionId).maybeSingle();
  const oldUrl = (q as any)?.media_url;

  const { error } = await sb.from("gm_question").update({ media_url: null, media_type: null }).eq("id", questionId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Best-effort xóa file blob (không chặn nếu fail)
  if (oldUrl) {
    try {
      await del(oldUrl);
    } catch (e) {
      // ignore — blob có thể đã bị xóa hoặc URL không hợp lệ
    }
  }

  return NextResponse.json({ ok: true });
}
