import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hội thi Thủ lĩnh Sinh viên",
  description: "Phần mềm thi đấu trắc nghiệm",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
