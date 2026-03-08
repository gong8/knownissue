"use client";

import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Bug,
  PlusCircle,
  User,
  Search,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { mockBugs } from "@/lib/mock-data";

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-zinc-400",
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();

  function go(path: string) {
    router.push(path);
    onOpenChange(false);
  }

  const recentBugs = mockBugs.slice(0, 5);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="search bugs, pages, actions..." />
      <CommandList>
        <CommandEmpty>no results found.</CommandEmpty>

        <CommandGroup heading="navigation">
          <CommandItem onSelect={() => go("/dashboard")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            dashboard
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/bugs")}>
            <Bug className="mr-2 h-4 w-4" />
            bugs
            <CommandShortcut>G B</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/bugs/new")}>
            <PlusCircle className="mr-2 h-4 w-4" />
            report bug
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/profile")}>
            <User className="mr-2 h-4 w-4" />
            profile
            <CommandShortcut>G P</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="recent bugs">
          {recentBugs.map((bug) => (
            <CommandItem
              key={bug.id}
              onSelect={() => go(`/bugs/${bug.id}`)}
            >
              <span
                className={`mr-2 inline-block h-2 w-2 rounded-full ${SEVERITY_DOT[bug.severity] ?? "bg-zinc-400"}`}
              />
              <span className="flex-1 truncate">{bug.title}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {bug.library}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="actions">
          <CommandItem onSelect={() => go("/bugs/new")}>
            <PlusCircle className="mr-2 h-4 w-4" />
            report a new bug
          </CommandItem>
          <CommandItem onSelect={() => go("/profile")}>
            <User className="mr-2 h-4 w-4" />
            view profile
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
