"use client";

/**
 * Friday emoji picker — thin React wrapper around emoji-mart's
 * framework-agnostic <em-emoji-picker> custom element.
 *
 * Why this exists: @emoji-mart/react only declares React 16-18 as a
 * peer, and Friday runs on React 19. Rather than --legacy-peer-deps
 * (which masked the nodemailer break on Vercel last cycle), we mount
 * the vanilla picker directly. It's a custom element, so it behaves
 * fine inside React's tree.
 *
 * The picker is loaded via dynamic import so it doesn't ship in the
 * initial chat bundle — composers without an emoji button get nothing.
 */

import { useEffect, useRef } from "react";
import data from "@emoji-mart/data";

export type EmojiSelection = {
  /** The actual Unicode character ("👍"). What we insert into text. */
  native: string;
  /** The emoji-mart id ("thumbsup"). */
  id: string;
  /** A descriptive name ("thumbs up sign"). */
  name?: string;
};

interface EmojiPickerProps {
  onSelect: (emoji: EmojiSelection) => void;
  onClickOutside?: () => void;
  /** "auto" follows the .dark class on the document; matches our token bridge. */
  theme?: "light" | "dark" | "auto";
}

export function EmojiPicker({
  onSelect,
  onClickOutside,
  theme = "auto",
}: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Capture callbacks in refs so the picker isn't re-instantiated on
  // every prop change. Without this every keystroke that updates the
  // parent component would tear down + rebuild the entire 1800-emoji
  // tree, which is slow and resets the user's search.
  const onSelectRef = useRef(onSelect);
  const onClickOutsideRef = useRef(onClickOutside);
  onSelectRef.current = onSelect;
  onClickOutsideRef.current = onClickOutside;

  useEffect(() => {
    let pickerEl: HTMLElement | null = null;
    let cancelled = false;

    (async () => {
      const mod = await import("emoji-mart");
      if (cancelled) return;
      type PickerCtor = new (options: Record<string, unknown>) => HTMLElement;
      const Picker = mod.Picker as unknown as PickerCtor;
      pickerEl = new Picker({
        data,
        onEmojiSelect: (e: EmojiSelection) => onSelectRef.current(e),
        onClickOutside: () => onClickOutsideRef.current?.(),
        theme,
        previewPosition: "none",
        skinTonePosition: "search",
        maxFrequentRows: 1,
        emojiButtonSize: 30,
        emojiSize: 18,
      });
      containerRef.current?.appendChild(pickerEl);
    })();

    return () => {
      cancelled = true;
      if (pickerEl?.parentNode) {
        pickerEl.parentNode.removeChild(pickerEl);
      }
    };
  }, [theme]);

  return <div ref={containerRef} className="friday-emoji-picker" />;
}
