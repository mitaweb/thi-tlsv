import { NextRequest, NextResponse } from "next/server";
import { isAdminReq } from "@/lib/auth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

/**
 * POST /api/media/upload
 *
 * Client-side upload pattern: browser upload TRỰC TIẾP lên Vercel Blob,
 * bypass giới hạn 4.5MB của Vercel Function body.
 *
 * Endpoint này chỉ:
 *   - generate client token (với content-type whitelist)
 *   - callback khi upload xong (optional)
 *
 * Browser dùng `upload()` từ '@vercel/blob/client' với handleUploadUrl=this route.
 *
 * Admin-only auth check ở onBeforeGenerateToken (thay vì check ở handler
 * vì callback từ Vercel không có cookie admin).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname) => {
        // Auth: chỉ admin cookie mới được tạo upload token
        if (!isAdminReq(req)) {
          throw new Error("unauthorized");
        }
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
            "video/mp4",
            "video/webm",
            "video/quicktime",
          ],
          addRandomSuffix: true,
          // 500 MB max (sửa nếu cần)
          maximumSizeInBytes: 500 * 1024 * 1024,
        };
      },
      onUploadCompleted: async () => {
        // No-op: client sẽ gọi /api/media/[questionId] để gán URL vào DB
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (e: any) {
    const msg = e?.message ?? "upload_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: msg === "unauthorized" ? 401 : 400 });
  }
}
