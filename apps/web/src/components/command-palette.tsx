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
          <CommandItem onSelect={() => go("/overview")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            overview
            <CommandShortcut>G O</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/explore")}>
            <Activity className="mr-2 h-4 w-4" />
            explore
            <CommandShortcut>G E</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/your-agent")}>
            <User className="mr-2 h-4 w-4" />
            your agent
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
        </CommandGroup>

      </CommandList>
    </CommandDialog>
  );
}
