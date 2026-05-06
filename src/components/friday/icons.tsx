// Friday icon set — 1.5px stroke monoline, matches Claude Design's
// generated set. Re-exported as a single `I` namespace AND as named
// exports so consumers can import either way:
//
//   import { I } from "@/components/friday/icons";  <I.Home size={16} />
//   import { Home } from "@/components/friday/icons"; <Home size={16} />
//
// Every icon accepts: size (px), color (CSS color), strokeWidth, style,
// className. Defaults match Friday's compact-density spec.

import * as React from "react";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
}

function makeIcon(
  path: React.ReactNode,
  viewBox = "0 0 24 24",
): React.FC<IconProps> {
  const Icon: React.FC<IconProps> = ({
    size = 16,
    color = "currentColor",
    strokeWidth = 1.5,
    style,
    className,
  }) => (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  );
  return Icon;
}

export const Home = makeIcon(
  <>
    <path d="M3 10.5L12 3l9 7.5" />
    <path d="M5 9.5V20a1 1 0 001 1h12a1 1 0 001-1V9.5" />
  </>,
);
export const Folder = makeIcon(
  <path d="M3 6a1 1 0 011-1h5l2 2h9a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V6z" />,
);
export const Check = makeIcon(<path d="M3.5 12l4.5 4.5L20 5" />);
export const Calendar = makeIcon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="1" />
    <path d="M3 9h18M8 3v4M16 3v4" />
  </>,
);
export const Chart = makeIcon(
  <>
    <path d="M3 21h18" />
    <path d="M6 17V10M11 17V6M16 17V13M20 17V8" />
  </>,
);
export const Chat = makeIcon(
  <path d="M21 12a8 8 0 01-11.5 7.2L4 21l1.8-5.5A8 8 0 1121 12z" />,
);
export const Activity = makeIcon(<path d="M22 12h-4l-3 8L9 4l-3 8H2" />);
export const Users = makeIcon(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20a6 6 0 0112 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M15 20a4 4 0 016-3.4" />
  </>,
);
export const Book = makeIcon(
  <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 003-3h11" />,
);
export const Plug = makeIcon(
  <>
    <path d="M9 7V3M15 7V3" />
    <path d="M7 7h10v4a5 5 0 11-10 0V7zM12 16v5" />
  </>,
);
export const Sparkle = makeIcon(
  <>
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
    <path d="M5.5 5.5l3 3M15.5 15.5l3 3M18.5 5.5l-3 3M8.5 15.5l-3 3" />
  </>,
);
export const Star = makeIcon(
  <path d="M12 4l2.5 5.5L20 10l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 4z" />,
);
export const Brain = makeIcon(
  <path d="M9 4a3 3 0 00-3 3 3 3 0 00-3 3v3a3 3 0 003 3v2a3 3 0 003 3h.5V4H9zM15 4a3 3 0 013 3 3 3 0 013 3v3a3 3 0 01-3 3v2a3 3 0 01-3 3h-.5V4H15z" />,
);
export const Image = makeIcon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="1" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="M3 17l5-4 4 3 3-2 6 5" />
  </>,
);
export const Search = makeIcon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </>,
);
export const ChevLeft = makeIcon(<path d="M15 5l-7 7 7 7" />);
export const ChevRight = makeIcon(<path d="M9 5l7 7-7 7" />);
export const ChevDown = makeIcon(<path d="M5 9l7 7 7-7" />);
export const X = makeIcon(<path d="M5 5l14 14M19 5L5 19" />);
export const Plus = makeIcon(<path d="M12 5v14M5 12h14" />);
export const Menu = makeIcon(<path d="M3 6h18M3 12h18M3 18h18" />);
export const Bell = makeIcon(
  <>
    <path d="M6 17V11a6 6 0 0112 0v6l1.5 2.5h-15L6 17z" />
    <path d="M10 21a2 2 0 004 0" />
  </>,
);
export const Settings = makeIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 003.6 15a1.7 1.7 0 00-1.5-1H2a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34H8a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </>,
);
export const Logout = makeIcon(
  <>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </>,
);
export const ArrowRight = makeIcon(<path d="M5 12h14M13 6l6 6-6 6" />);
export const Phone = makeIcon(
  <path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.6a2 2 0 01-.5 2.1L8 9.5a16 16 0 006 6l1.1-1.1a2 2 0 012.1-.5c.8.3 1.7.5 2.6.6a2 2 0 011.7 2z" />,
);
export const Map = makeIcon(
  <>
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z" />
    <path d="M9 4v16M15 6v16" />
  </>,
);
export const AlertSmall = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </>,
);
export const Sun = makeIcon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </>,
);

// Convenience namespace import — `<I.Home />` everywhere matches the
// way Claude Design's prototype consumes icons.
export const I = {
  Home,
  Folder,
  Check,
  Calendar,
  Chart,
  Chat,
  Activity,
  Users,
  Book,
  Plug,
  Sparkle,
  Star,
  Brain,
  Image,
  Search,
  ChevLeft,
  ChevRight,
  ChevDown,
  X,
  Plus,
  Menu,
  Bell,
  Settings,
  Logout,
  ArrowRight,
  Phone,
  Map,
  AlertSmall,
  Sun,
} as const;
