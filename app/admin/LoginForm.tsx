"use client";
import { useState } from "react";

export default function LoginForm() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    const j = await r.json();
    setBusy(false);
    if (!j.ok) setErr(j.error || "Lỗi");
    else location.reload();
  }

  return (
    <main className="ocean-bg flex items-center justify-center p-6">
      <form onSubmit={submit} className="card max-w-md w-full space-y-4">
        <h1 className="text-2xl font-bold text-ocean-800">Đăng nhập quản trị</h1>
        <input
          type="password"
          autoFocus
          className="w-full p-3 rounded-lg border border-ocean-300 bg-white"
          placeholder="Mật khẩu admin"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        {err && <p className="text-rose-600 text-sm">{err}</p>}
        <button disabled={busy} className="btn-primary w-full">
          {busy ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}
