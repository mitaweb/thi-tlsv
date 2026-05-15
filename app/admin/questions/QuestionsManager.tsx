"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import type { Round, Question } from "@/lib/types";

type NewQ = { prompt: string; option_a: string; option_b: string; option_c: string; option_d: string; correct_option: "A" | "B" | "C" | "D" };

export default function QuestionsManager() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch("/api/rounds").then((r) => r.json()).then((j) => {
      if (j.ok) {
        // Chỉ vòng quiz mới có câu hỏi (panel/debate không cần)
        const quizOnly = (j.data as Round[]).filter((r) => (r as any).kind === "quiz");
        setRounds(quizOnly);
        if (quizOnly.length) setRoundId(quizOnly[0].id);
      }
    });
  }, []);

  const loadQs = () => {
    if (!roundId) return;
    fetch(`/api/questions?roundId=${roundId}`).then((r) => r.json()).then((j) => j.ok && setQuestions(j.data));
  };
  useEffect(loadQs, [roundId]);

  async function onUpload(file: File, replace: boolean) {
    if (!roundId) return;
    setStatus("Đang đọc file...");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
    // Hỗ trợ 2 schema: dạng cột (Prompt, A, B, C, D, Correct) hoặc tiếng Việt
    const toQ = (r: any): NewQ => ({
      prompt: String(r.Prompt ?? r["Câu hỏi"] ?? r.Question ?? "").trim(),
      option_a: String(r.A ?? r["A"] ?? r.OptionA ?? "").trim(),
      option_b: String(r.B ?? r.OptionB ?? "").trim(),
      option_c: String(r.C ?? r.OptionC ?? "").trim(),
      option_d: String(r.D ?? r.OptionD ?? "").trim(),
      correct_option: String(r.Correct ?? r["Đáp án"] ?? r.Answer ?? "A").trim().toUpperCase().charAt(0) as any,
    });
    const qs = rows.map(toQ).filter((q) => q.prompt && ["A", "B", "C", "D"].includes(q.correct_option));
    if (!qs.length) {
      setStatus("Không có dòng hợp lệ.");
      return;
    }
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, replace, questions: qs }),
    });
    const j = await res.json();
    setStatus(j.ok ? `Đã upload ${j.inserted} câu.` : `Lỗi: ${j.error}`);
    loadQs();
  }

  function downloadTemplate() {
    const data = [
      {
        Prompt: "Theo Nghị quyết XIV của Đảng, mục tiêu đến 2045 là?",
        A: "Đáp án A",
        B: "Đáp án B",
        C: "Đáp án C",
        D: "Đáp án D",
        Correct: "A",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "template-cau-hoi.xlsx");
  }

  async function addOne(q: NewQ) {
    if (!roundId) return;
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, replace: false, questions: [q] }),
    });
    const j = await res.json();
    if (!j.ok) alert(j.error);
    else loadQs();
  }

  async function deleteOne(id: string) {
    if (!confirm("Xoá câu hỏi này?")) return;
    await fetch(`/api/questions?id=${id}`, { method: "DELETE" });
    loadQs();
  }

  async function uploadMedia(questionId: string, file: File) {
    setStatus("Đang upload media...");
    const fd = new FormData();
    fd.append("file", file);
    const up = await fetch("/api/media/upload", { method: "POST", body: fd });
    const upJ = await up.json();
    if (!upJ.ok) {
      setStatus("Lỗi upload: " + upJ.error);
      return;
    }
    // Gán URL vào question
    const att = await fetch(`/api/media/${questionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: upJ.url, type: upJ.type }),
    });
    const attJ = await att.json();
    if (!attJ.ok) {
      setStatus("Lỗi gán media: " + attJ.error);
      return;
    }
    setStatus("✓ Đã thêm media.");
    loadQs();
  }

  async function deleteMedia(questionId: string) {
    if (!confirm("Xóa media của câu này?")) return;
    const r = await fetch(`/api/media/${questionId}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) loadQs();
    else alert("Lỗi: " + j.error);
  }

  return (
    <main className="ocean-bg min-h-screen p-6 space-y-4">
      <header className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-ocean-900">Quản lý câu hỏi</h1>
        <Link href="/admin" className="btn-secondary">← Về bảng điều khiển</Link>
      </header>

      <div className="card space-y-3">
        <div className="flex gap-2 flex-wrap">
          {rounds.map((r) => (
            <button
              key={r.id}
              onClick={() => setRoundId(r.id)}
              className={`px-4 py-2 rounded-lg font-semibold border-2 ${
                roundId === r.id ? "bg-ocean-600 text-white border-ocean-700" : "bg-white text-ocean-700 border-ocean-200"
              }`}
            >
              {r.name} ({r.code})
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center flex-wrap">
          <button className="btn-secondary" onClick={downloadTemplate}>📥 Tải template Excel</button>
          <label className="btn-primary cursor-pointer">
            📤 Upload (giữ câu cũ)
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0], false)}
            />
          </label>
          <label className="btn-danger cursor-pointer">
            ⚠ Upload (thay thế toàn bộ)
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0], true)}
            />
          </label>
          {status && <span className="text-sm text-ocean-700">{status}</span>}
        </div>
      </div>

      <ManualAddForm onAdd={addOne} />

      <div className="card">
        <h2 className="font-bold text-ocean-800 mb-3">{questions.length} câu hỏi</h2>
        <div className="space-y-2">
          {questions.map((q) => (
            <div key={q.id} className="p-3 bg-white/80 rounded-xl border border-ocean-200">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  <div className="text-xs text-ocean-700 mb-1">Câu {q.display_order} · Đáp án: <b>{q.correct_option}</b></div>
                  <div className="font-semibold text-ocean-900">{q.prompt}</div>
                  <ul className="text-sm text-ocean-700 mt-1 grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    {(["a", "b", "c", "d"] as const).map((k) => {
                      const t = (q as any)["option_" + k];
                      if (!t) return null;
                      const ok = q.correct_option === k.toUpperCase();
                      return <li key={k} className={ok ? "font-bold text-emerald-700" : ""}>{k.toUpperCase()}. {t}</li>;
                    })}
                  </ul>
                  {/* Hiển thị media thumbnail nếu có */}
                  {(q as any).media_url && (
                    <div className="mt-2 flex items-center gap-2">
                      {(q as any).media_type === "video" ? (
                        <video src={(q as any).media_url} className="w-32 h-20 rounded border border-ocean-200 object-cover" />
                      ) : (
                        <img src={(q as any).media_url} alt="media" className="w-32 h-20 rounded border border-ocean-200 object-cover" />
                      )}
                      <span className="text-xs text-ocean-600">
                        {(q as any).media_type === "video" ? "🎬 Video" : "🖼 Ảnh"}
                      </span>
                      <button onClick={() => deleteMedia(q.id)} className="text-xs text-rose-600 underline">Xóa media</button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <label className="btn-secondary text-xs cursor-pointer text-center">
                    📎 {(q as any).media_url ? "Đổi media" : "Add media"}
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadMedia(q.id, e.target.files[0])}
                    />
                  </label>
                  <button onClick={() => deleteOne(q.id)} className="btn-ghost text-rose-600 text-xs">Xoá câu</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

function ManualAddForm({ onAdd }: { onAdd: (q: NewQ) => void }) {
  const [q, setQ] = useState<NewQ>({ prompt: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A" });
  return (
    <div className="card space-y-2">
      <h2 className="font-bold text-ocean-800">Thêm câu hỏi nhanh</h2>
      <input
        className="w-full p-2 rounded-lg border border-ocean-300"
        placeholder="Nội dung câu hỏi"
        value={q.prompt}
        onChange={(e) => setQ({ ...q, prompt: e.target.value })}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {(["A", "B", "C", "D"] as const).map((k) => (
          <input
            key={k}
            className="p-2 rounded-lg border border-ocean-300"
            placeholder={`Đáp án ${k}`}
            value={(q as any)["option_" + k.toLowerCase()]}
            onChange={(e) => setQ({ ...q, ["option_" + k.toLowerCase()]: e.target.value } as any)}
          />
        ))}
      </div>
      <div className="flex gap-2 items-center">
        <label>Đáp án đúng:</label>
        <select
          className="p-2 rounded-lg border border-ocean-300"
          value={q.correct_option}
          onChange={(e) => setQ({ ...q, correct_option: e.target.value as any })}
        >
          {(["A", "B", "C", "D"] as const).map((k) => <option key={k}>{k}</option>)}
        </select>
        <button
          className="btn-primary ml-auto"
          disabled={!q.prompt}
          onClick={() => {
            onAdd(q);
            setQ({ prompt: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A" });
          }}
        >
          Thêm
        </button>
      </div>
    </div>
  );
}
