import { redirect } from "next/navigation";
import { HelpDialog } from "@/features/support/client/help-dialog";
import { AssistantPanel } from "@/features/ai/client/assistant-panel";
import { auth } from "@/platform/auth";
import { Sidebar } from "@/ui/layout/sidebar";
import { Header } from "@/ui/layout/header";
import { BrowserNotificationBanner } from "@/ui/components/browser-notification-banner";
import { ToastHost } from "@/ui/components/toast";

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
      {/* Mounted here, not in the sidebar: ui/ may not import features/. */}
      <HelpDialog />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-l border-border">
        <Header />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
      {/*
       * The assistant is a sibling of the content column, not an overlay, so
       * opening it narrows the page rather than covering it. Reading a project
       * while asking about it is the whole reason to dock the thing.
       */}
      <AssistantPanel />
      <BrowserNotificationBanner />
      <ToastHost />
    </div>
  );
}
