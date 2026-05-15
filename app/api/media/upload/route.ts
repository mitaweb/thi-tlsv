import { NextRequest, NextResponse } from "next/server";
import { isAdminReq } from "@/lib/auth";
import { put } from "@vercel/blob";

/**
 * POST /api/media/upload
 *
 * Multipart form-data với field `file` (image/* hoặc video/*).
 * Trả về { url, type } để admin gán vào gm_question.media_url + media_type.
 *
 * Admin-only.
 */
export const runtime = "nodejs"; // cần Node runtime để xử lý multipart
export const maxDuration = 60;

const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: NextRequest) {
  if (!isAdminReq(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "bad_multipart" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 });

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ ok: false, error: "file_too_large_max_50mb" }, { status: 413 });
  }

  const mime = file.type || "";
  let mediaType: "image" | "video";
  if (mime.startsWith("image/")) mediaType = "image";
  else if (mime.startsWith("video/")) mediaType = "video";
  else {
    return NextResponse.json({ ok: false, error: "unsupported_type_only_image_video" }, { status: 415 });
  }

  // Tạo tên file unique
  const ext = file.name.split(".").pop() || (mediaType === "image" ? "jpg" : "mp4");
  const filename = `question-media/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    const blob = await put(filename, file, {
      access: "public",
      contentType: mime,
    });
    return NextResponse.json({ ok: true, url: blob.url, type: mediaType });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "upload_failed" }, { status: 500 });
  }
}
