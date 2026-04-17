import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BrowserNotificationBanner } from "@/components/browser-notification-banner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={session.user} />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-l border-border">
        <Header />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      <BrowserNotificationBanner />
    </div>
  );
}
