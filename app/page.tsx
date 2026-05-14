import Link from "next/link";

export default function HomePage() {
  return (
    <main className="ocean-bg flex items-center justify-center p-6">
      <div className="card max-w-2xl w-full text-center space-y-6">
        <h1 className="text-3xl md:text-4xl font-bold text-ocean-800">
          Hội thi Thủ lĩnh Sinh viên
        </h1>
        <p className="text-ocean-700">Phần mềm thi đấu trắc nghiệm</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <Link href="/admin" className="btn-primary">Bảng điều khiển (Admin)</Link>
          <Link href="/screen" className="btn-secondary">Màn trình chiếu</Link>
          <Link href="/play" className="btn-secondary">Trang thí sinh</Link>
        </div>
      </div>
    </main>
  );
}
