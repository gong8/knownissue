"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardHelpDialog } from "@/components/keyboard-help-dialog";
import { useKeyboardNavigation } from "@/hooks/use-keyboard-navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((prev) => !prev);
  }, []);

  const toggleHelp = useCallback(() => {
    setHelpOpen((prev) => !prev);
  }, []);

  useKeyboardNavigation({
    onToggleCommandPalette: toggleCommandPalette,
    onToggleHelp: toggleHelp,
  });

  return (
    <div className="flex h-screen">
      <Sidebar onOpenCommandPalette={toggleCommandPalette} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
      <KeyboardHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
