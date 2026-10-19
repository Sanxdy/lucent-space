import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 18, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconMark = (p: P) => (
  <Icon {...p} fill="none">
    <path d="M12 2.6 21 12l-9 9.4L3 12l9-9.4Z" fill="currentColor" stroke="none" opacity={0.28} />
    <path d="M12 6.2 17.7 12 12 17.8 6.3 12 12 6.2Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconHome = (p: P) => (
  <Icon {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z" />
    <path d="M9.5 20.5v-6h5v6" />
  </Icon>
);

export const IconTasks = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <path d="m8 12 2.6 2.6L16.4 9" />
  </Icon>
);

export const IconCalendar = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="4" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </Icon>
);

export const IconProjects = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h3.6l2 2.4H18a2.5 2.5 0 0 1 2.5 2.5v6.6A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-9Z" />
  </Icon>
);

export const IconInsights = (p: P) => (
  <Icon {...p}>
    <path d="M4 20h16" />
    <path d="M7 20v-6M12 20V7M17 20v-9" />
  </Icon>
);

export const IconTeam = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5c.4-3 2.7-4.8 5.5-4.8s5.1 1.8 5.5 4.8" />
    <path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.9c2 .4 3.4 2 3.7 4.6" />
  </Icon>
);

export const IconSettings = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 14.2a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" />
  </Icon>
);

export const IconSearch = (p: P) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);

export const IconPlus = (p: P) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconBell = (p: P) => (
  <Icon {...p}>
    <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.2-2 6.2h16s-2-1.2-2-6.2Z" />
    <path d="M10 19a2 2 0 0 0 4 0" />
  </Icon>
);

export const IconSun = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
  </Icon>
);

export const IconMoon = (p: P) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </Icon>
);

export const IconChevronDown = (p: P) => (
  <Icon {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Icon>
);

export const IconChevronRight = (p: P) => (
  <Icon {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);

export const IconChevronLeft = (p: P) => (
  <Icon {...p}>
    <path d="m14.5 6-6 6 6 6" />
  </Icon>
);

export const IconX = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const IconMore = (p: P) => (
  <Icon {...p}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </Icon>
);

export const IconClock = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Icon>
);

export const IconFlag = (p: P) => (
  <Icon {...p}>
    <path d="M5.5 21V4M5.5 4.8c3.5-1.6 5.5 1.4 9 0v8c-3.5 1.4-5.5-1.6-9 0" />
  </Icon>
);

export const IconTrash = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 7h15M9.5 7V4.8A.8.8 0 0 1 10.3 4h3.4a.8.8 0 0 1 .8.8V7M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" />
  </Icon>
);

export const IconSend = (p: P) => (
  <Icon {...p}>
    <path d="m20 4-8.5 16-2.2-6.3L3 11.5 20 4Z" />
    <path d="m9.3 13.7 4-4" />
  </Icon>
);

export const IconArrowUpRight = (p: P) => (
  <Icon {...p}>
    <path d="M7 17 17 7M8.5 7H17v8.5" />
  </Icon>
);

export const IconLogOut = (p: P) => (
  <Icon {...p}>
    <path d="M14.5 4.5H18A1.5 1.5 0 0 1 19.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-3.5" />
    <path d="M10 8.5 6.5 12l3.5 3.5M6.5 12H15" />
  </Icon>
);

export const IconMenu = (p: P) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const IconDownload = (p: P) => (
  <Icon {...p}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15" />
  </Icon>
);

export const IconPlay = (p: P) => (
  <Icon {...p}>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconPause = (p: P) => (
  <Icon {...p}>
    <rect x="7" y="5.5" width="3.6" height="13" rx="1.2" fill="currentColor" stroke="none" />
    <rect x="13.4" y="5.5" width="3.6" height="13" rx="1.2" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconTimer = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 10v3.5l2.2 1.4M9.5 3h5M12 3v3" />
  </Icon>
);

export const IconPin = (p: P) => (
  <Icon {...p}>
    <path d="M9 3.5h6l-.8 5.2 3 3.3H6.8l3-3.3L9 3.5Z" />
    <path d="M12 12v8.5" />
  </Icon>
);

export const IconCommand = (p: P) => (
  <Icon {...p}>
    <path d="M9 6.5A2.5 2.5 0 1 0 6.5 9H9V6.5ZM9 17.5A2.5 2.5 0 1 1 6.5 15H9v2.5ZM15 6.5A2.5 2.5 0 1 1 17.5 9H15V6.5ZM15 17.5a2.5 2.5 0 1 0 2.5-2.5H15v2.5Z" />
    <path d="M9 9h6v6H9z" />
  </Icon>
);

export const IconCheck = (p: P) => (
  <Icon {...p} strokeWidth={2.4}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
);

export const IconSparkles = (p: P) => (
  <Icon {...p}>
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
    <path d="M18.5 3.5v3M17 5h3" />
  </Icon>
);

export const IconFilter = (p: P) => (
  <Icon {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Icon>
);

export const IconGrid = (p: P) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
  </Icon>
);

export const IconList = (p: P) => (
  <Icon {...p}>
    <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" />
    <circle cx="4.8" cy="6.5" r="1" fill="currentColor" />
    <circle cx="4.8" cy="12" r="1" fill="currentColor" />
    <circle cx="4.8" cy="17.5" r="1" fill="currentColor" />
  </Icon>
);

export const IconUser = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="8.5" r="3.6" />
    <path d="M5 20c.5-3.6 3.3-5.6 7-5.6s6.5 2 7 5.6" />
  </Icon>
);

export const IconRefresh = (p: P) => (
  <Icon {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4" />
    <path d="M19.8 4.5v4.2h-4.2" />
  </Icon>
);

export const IconAlert = (p: P) => (
  <Icon {...p}>
    <path d="M12 4 21 20H3L12 4Z" />
    <path d="M12 10v4M12 17.2v.1" />
  </Icon>
);

export const IconFolderPlus = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h3.6l2 2.4H18a2.5 2.5 0 0 1 2.5 2.5v6.6A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5v-9Z" />
    <path d="M12 12v5M9.5 14.5h5" />
  </Icon>
);

export const IconTable = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M3.5 9.5h17M9.5 9.5v10" />
  </Icon>
);

export const IconMessage = (p: P) => (
  <Icon {...p}>
    <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-1.5 2v-9A7.5 7.5 0 0 1 11 4.5h1.5a7.5 7.5 0 0 1 7.5 7Z" />
  </Icon>
);

export const IconRocket = (p: P) => (
  <Icon {...p}>
    <path d="M13.5 4.5c3.4-1.6 5.8-1 6 0 .9.2 1.5 2.6-.1 6-1.3 2.8-4.4 5.4-6.6 6.7l-3.4-3.4c1.3-2.2 3.9-5.3 6.7-6.6" />
    <path d="M9.4 13.8c-2 .3-3.4 1.5-4 4.6 3.1-.6 4.3-2 4.6-4" />
    <circle cx="15.4" cy="8.6" r="1.4" />
  </Icon>
);

export const IconPhone = (p: P) => (
  <Icon {...p}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
    <path d="M10.5 5h3" />
  </Icon>
);

export const IconLeaf = (p: P) => (
  <Icon {...p}>
    <path d="M20 4c0 8.4-4.4 12.5-9 12.5a4.5 4.5 0 0 1 0-9C15 7.5 17.6 6.5 20 4Z" />
    <path d="M4.5 20c.5-5 3-8.5 7-10.5" />
  </Icon>
);

export const IconFlame = (p: P) => (
  <Icon {...p}>
    <path d="M12 3s5.5 4.2 5.5 9.2A5.5 5.5 0 0 1 12 17.7a5.5 5.5 0 0 1-5.5-5.5C6.5 7.2 12 3 12 3Z" />
    <path d="M12 20.5v-2.8" />
  </Icon>
);

export const IconChart = (p: P) => (
  <Icon {...p}>
    <path d="M4.5 20V9.5M12 20V4.5M19.5 20v-7" />
  </Icon>
);

export const IconShapes = (p: P) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
    <circle cx="17" cy="7" r="3.5" />
    <path d="M7 13.5 10.8 20H3.2L7 13.5Z" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.6" />
  </Icon>
);
