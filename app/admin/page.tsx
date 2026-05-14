import { isAdmin } from "@/lib/auth";
import LoginForm from "./LoginForm";
import AdminDashboard from "./AdminDashboard";

export default async function AdminPage() {
  const ok = await isAdmin();
  if (!ok) return <LoginForm />;
  return <AdminDashboard />;
}
