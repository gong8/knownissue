"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseListKeyboardOptions {
  itemCount: number;
  onSelect?: (index: number) => void;
  onFocusSearch?: () => void;
  enabled?: boolean;
}

export function useListKeyboard({
  itemCount,
  onSelect,
  onFocusSearch,
  enabled = true,
}: UseListKeyboardOptions) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  const isInputFocused = useCallback(() => {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;

      switch (e.key) {
        case "j":
          e.preventDefault();
          setFocusedIndex((prev) => Math.min(prev + 1, itemCount - 1));
          break;
        case "k":
          e.preventDefault();
          setFocusedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          if (focusedIndex >= 0) {
            e.preventDefault();
            onSelect?.(focusedIndex);
          }
          break;
        case "/":
          e.preventDefault();
          onFocusSearch?.();
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, itemCount, focusedIndex, onSelect, onFocusSearch, isInputFocused]);

  // Reset focus when item count changes
  useEffect(() => {
    setFocusedIndex(-1);
  }, [itemCount]);

  return { focusedIndex, setFocusedIndex, listRef };
}
