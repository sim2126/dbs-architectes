// Friday shell — composes the sidebar, top bar, and command palette
// around a content slot. Owns ⌘K state and the language switcher
// state. The layout passes session-derived data (starred projects,
// user identity) as props.

"use client";

import * as React from "react";
import { FridaySidebar, type StarredProject, type SidebarUser } from "@/components/friday/sidebar";
import { FridayTopBar } from "@/components/friday/topbar";
import { CommandPalette } from "@/components/friday/command-palette";
import { showToast } from "@/components/toast";

interface FridayShellProps {
  starred: StarredProject[];
  user: SidebarUser;
  tasksCount?: number;
  chatUnread?: number;
  hasUnreadNotifications?: boolean;
  children: React.ReactNode;
}

export function FridayShell({
  starred,
  user,
  tasksCount,
  chatUnread,
  hasUnreadNotifications,
  children,
}: FridayShellProps) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [lang, setLang] = React.useState<"EN" | "FR" | "IT">("EN");

  // Global ⌘K / Ctrl-K to toggle palette
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-friday-bg">
      <FridaySidebar
        starred={starred}
        user={user}
        tasksCount={tasksCount}
        chatUnread={chatUnread}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <FridayTopBar
          user={user}
          onCmdK={() => setPaletteOpen(true)}
          lang={lang}
          onLang={(l) => {
            setLang(l);
            showToast(`Language: ${l}`);
          }}
          hasUnreadNotifications={hasUnreadNotifications}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
