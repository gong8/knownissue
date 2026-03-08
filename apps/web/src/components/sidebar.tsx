"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Bug,
  PlusCircle,
  User,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/ui/kbd";
import { UserButton } from "@clerk/nextjs";
import { fetchUserStats } from "@/app/actions/user";

const navItems = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard, shortcut: "G D" },
  { href: "/bugs", label: "bugs", icon: Bug, shortcut: "G B" },
  { href: "/bugs/new", label: "report bug", icon: PlusCircle, shortcut: "C" },
  { href: "/profile", label: "profile", icon: User, shortcut: "G P" },
];

interface SidebarProps {
  onOpenCommandPalette?: () => void;
}

export function Sidebar({ onOpenCommandPalette }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    fetchUserStats()
      .then((stats) => setCredits(stats.credits))
      .catch(() => setCredits(null));
  }, [pathname]);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-surface transition-all duration-200",
        collapsed ? "w-[52px]" : "w-60"
      )}
    >
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-3">
        {!collapsed && (
          <span className="font-mono text-sm font-semibold text-foreground">[knownissue]</span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Search trigger */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <button
            onClick={onOpenCommandPalette}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-surface-hover"
          >
            <Search size={14} />
            <span className="flex-1 text-left text-xs">search...</span>
            <Kbd>&#8984;K</Kbd>
          </button>
        </div>
      )}
      {collapsed && (
        <div className="flex justify-center pb-2">
          <button
            onClick={onOpenCommandPalette}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          >
            <Search size={16} />
          </button>
        </div>
      )}

      <div className="mx-3 border-t border-border" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-8 items-center gap-3 rounded-md px-3 text-sm font-mono transition-colors",
                  isActive
                    ? "border-l-2 border-l-primary text-foreground bg-surface-hover"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                )}
              >
                <item.icon size={16} />
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    <span className="text-[10px] text-muted-foreground/50">{item.shortcut}</span>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom: user */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3">
          <UserButton />
          {!collapsed && credits !== null && (
            <div className="flex flex-col">
              <span className="font-mono text-sm font-medium">{credits}</span>
              <span className="text-xs text-muted-foreground">credits</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
