"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

interface KeyboardHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const shortcuts = [
  {
    group: "global",
    items: [
      { keys: ["\u2318", "K"], description: "open command palette" },
      { keys: ["?"], description: "show keyboard shortcuts" },
    ],
  },
  {
    group: "navigation",
    items: [
      { keys: ["G", "D"], description: "go to dashboard" },
      { keys: ["G", "A"], description: "go to activity" },
      { keys: ["G", "P"], description: "go to profile" },
    ],
  },
  {
    group: "lists",
    items: [
      { keys: ["J"], description: "move down" },
      { keys: ["K"], description: "move up" },
      { keys: ["Enter"], description: "open selected" },
      { keys: ["/"], description: "focus search" },
    ],
  },
  {
    group: "bug detail",
    items: [
      { keys: ["U"], description: "go back to list" },
      { keys: ["J"], description: "next patch" },
      { keys: ["K"], description: "previous patch" },
    ],
  },
];

export function KeyboardHelpDialog({ open, onOpenChange }: KeyboardHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {shortcuts.map((section) => (
            <div key={section.group}>
              <p className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                {section.group}
              </p>
              <div className="space-y-1.5">
                {section.items.map((item) => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{item.description}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((key, i) => (
                        <Kbd key={i}>{key}</Kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
