"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  ChevronsUpDown,
  Globe,
  HelpCircle,
  LogOut,
  Settings,
  User as UserIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/ui/components/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/components/avatar";
import { useLanguageStore, type Language } from "@/i18n/language-store";
import { cn } from "@/ui/utils";
import { useHelpStore } from "@/ui/stores/help-store";

/** UI languages only. TRANSLATION_LANGUAGES is a wider list used for
 *  message translation targets; those have no interface strings. */
const UI_LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Deutsch" },
];

type AccountUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: string | null;
  isExternal?: boolean;
};

export function AccountMenu({
  user,
  initials,
  collapsed,
}: {
  user?: AccountUser;
  initials: string;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const openHelp = useHelpStore((s) => s.setOpen);
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className={cn(
            "w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring transition-colors",
            collapsed && "justify-center px-0",
          )}
        >
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarImage src={user?.image || ""} />
            <AvatarFallback className="bg-foreground text-background text-[10px] font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-medium truncate leading-tight">
                  {user?.name || "User"}
                </span>
                <span className="block text-[10px] text-muted-foreground truncate capitalize leading-tight mt-0.5">
                  {user?.isExternal ? "guest" : user?.role?.replace("_", " ") || "viewer"}
                </span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-60"
      >
        {user?.email && (
          <>
            <DropdownMenuLabel className="font-normal text-xs text-muted-foreground truncate">
              {user.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}

        {!user?.isExternal && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings?tab=profile">
                <UserIcon className="h-4 w-4 mr-2" />
                Profile
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Globe className="h-4 w-4 mr-2" />
            Language
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {UI_LANGUAGES.map((l) => (
              <DropdownMenuItem
                key={l.code}
                onSelect={() => setLanguage(l.code)}
                className={cn(language === l.code && "font-medium")}
              >
                <span className="flex-1">{l.label}</span>
                {language === l.code && (
                  <span className="text-muted-foreground text-xs ml-2">Active</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => openHelp(true)}>
          <HelpCircle className="h-4 w-4 mr-2" />
          Get help
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
