"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface KeyboardNavigationOptions {
  onToggleCommandPalette?: () => void;
  onToggleHelp?: () => void;
}

export function useKeyboardNavigation(options: KeyboardNavigationOptions = {}) {
  const router = useRouter();
  const pendingKey = useRef<string | null>(null);
  const pendingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isInputFocused = useCallback(() => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return (
      tag === "input" ||
      tag === "textarea" ||
      (el as HTMLElement).isContentEditable
    );
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K / Ctrl+K: command palette (works even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        options.onToggleCommandPalette?.();
        return;
      }

      // Don't fire shortcuts when typing in inputs
      if (isInputFocused()) return;

      // ? -> help dialog
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        options.onToggleHelp?.();
        return;
      }

      // C -> create new bug
      if (e.key === "c" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        router.push("/bugs/new");
        return;
      }

      // G-then-X chord navigation
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        pendingKey.current = "g";
        if (pendingTimeout.current) clearTimeout(pendingTimeout.current);
        pendingTimeout.current = setTimeout(() => {
          pendingKey.current = null;
        }, 500);
        return;
      }

      if (pendingKey.current === "g") {
        pendingKey.current = null;
        if (pendingTimeout.current) clearTimeout(pendingTimeout.current);

        switch (e.key) {
          case "d":
            e.preventDefault();
            router.push("/dashboard");
            break;
          case "b":
            e.preventDefault();
            router.push("/bugs");
            break;
          case "p":
            e.preventDefault();
            router.push("/profile");
            break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (pendingTimeout.current) clearTimeout(pendingTimeout.current);
    };
  }, [router, options, isInputFocused]);
}
