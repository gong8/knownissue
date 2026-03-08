"use client";

import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  User,
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

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="navigate..." />
      <CommandList>
        <CommandEmpty>no results found.</CommandEmpty>

        <CommandGroup heading="navigation">
          <CommandItem onSelect={() => go("/dashboard")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            overview
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/activity")}>
            <Activity className="mr-2 h-4 w-4" />
            activity
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/profile")}>
            <User className="mr-2 h-4 w-4" />
            profile
            <CommandShortcut>G P</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="actions">
          <CommandItem onSelect={() => go("/profile")}>
            <User className="mr-2 h-4 w-4" />
            view profile
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
