// Small stroke icons (24x24 grid, currentColor) shared by menus and dialogs.
function Icon({ size = 18, children, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const UserIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
  </Icon>
);

export const UserPlusIcon = (props) => (
  <Icon {...props}>
    <circle cx="10" cy="8" r="4" />
    <path d="M2.5 21c0-4 3.4-6.5 7.5-6.5 1.6 0 3 .3 4.3.9M19 14v6M16 17h6" />
  </Icon>
);

export const EditIcon = (props) => (
  <Icon {...props}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Icon>
);

export const MailIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
);

export const KeyIcon = (props) => (
  <Icon {...props}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2" />
  </Icon>
);

export const UnlockIcon = (props) => (
  <Icon {...props}>
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
    <path d="M8 11V7a4 4 0 0 1 7.5-2" />
  </Icon>
);

export const LoginIcon = (props) => (
  <Icon {...props}>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H4" />
  </Icon>
);

export const LogoutIcon = (props) => (
  <Icon {...props}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
  </Icon>
);

export const BanIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5.7 5.7 12.6 12.6" />
  </Icon>
);

export const CheckIcon = (props) => (
  <Icon {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const CheckCircleIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.5 2.5L16 9.5" />
  </Icon>
);

export const TrashIcon = (props) => (
  <Icon {...props}>
    <path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 1.8h7a2 2 0 0 0 2-1.8l1-12M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7" />
  </Icon>
);

export const ActivityIcon = (props) => (
  <Icon {...props}>
    <path d="M3 12h4l3-8 4 16 3-8h4" />
  </Icon>
);

export const ShieldIcon = (props) => (
  <Icon {...props}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const DashboardIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="3" width="7.5" height="9" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="5.5" rx="2" />
    <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="2" />
    <rect x="3" y="15" width="7.5" height="6" rx="2" />
  </Icon>
);

export const CopyIcon = (props) => (
  <Icon {...props}>
    <rect x="8" y="8" width="13" height="13" rx="2.5" />
    <path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8" />
  </Icon>
);

export const SparklesIcon = (props) => (
  <Icon {...props}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />
  </Icon>
);

export const LinkIcon = (props) => (
  <Icon {...props}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </Icon>
);

export const AlertIcon = (props) => (
  <Icon {...props}>
    <path d="M12 4 2.8 19.5h18.4L12 4Z" />
    <path d="M12 10v4.5M12 17.2v.3" />
  </Icon>
);

export const SearchIcon = (props) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
);

export const ChevronDownIcon = (props) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const MoreIcon = (props) => (
  <Icon {...props}>
    <circle cx="5.5" cy="12" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.2" fill="currentColor" />
  </Icon>
);

export const LockIcon = (props) => (
  <Icon {...props}>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const EyeIcon = (props) => (
  <Icon {...props}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOffIcon = (props) => (
  <Icon {...props}>
    <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.6 16.6 0 0 1-2.9 3.7M6.6 6.6A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 4.4-1.1" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
  </Icon>
);

export const ArrowRightIcon = (props) => (
  <Icon {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const ArrowLeftIcon = (props) => (
  <Icon {...props}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const ChartIcon = (props) => (
  <Icon {...props}>
    <path d="M4 20V4M4 20h16" />
    <path d="m7.5 15 3.5-4 3 2.5 5-6" />
  </Icon>
);

export const TargetIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </Icon>
);

export const GlobeIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
  </Icon>
);

export const CloseIcon = (props) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const MenuIcon = (props) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const FactoryIcon = (props) => (
  <Icon {...props}>
    <path d="M3 21V10l5 3V10l5 3V10l5 3V4h3v17H3Z" />
    <path d="M7 17h2M12 17h2M17 17h1" />
  </Icon>
);

export const BriefcaseIcon = (props) => (
  <Icon {...props}>
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" />
  </Icon>
);

export const CrownIcon = (props) => (
  <Icon {...props}>
    <path d="M4 18 3 8l5 4 4-6 4 6 5-4-1 10H4Z" />
    <path d="M4 21h16" />
  </Icon>
);

export const MoonIcon = (props) => (
  <Icon {...props}>
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
  </Icon>
);

export const SunIcon = (props) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Icon>
);

export const PlusIcon = (props) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const SaveIcon = (props) => (
  <Icon {...props}>
    <path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4Z" />
    <path d="M8 4v5h7V4M8 20v-6h8v6" />
  </Icon>
);

export const SendIcon = (props) => (
  <Icon {...props}>
    <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />
  </Icon>
);

export const RefreshIcon = (props) => (
  <Icon {...props}>
    <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" />
  </Icon>
);

export const ClipboardIcon = (props) => (
  <Icon {...props}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
  </Icon>
);

export const GraduationIcon = (props) => (
  <Icon {...props}>
    <path d="M2.5 9.5 12 5l9.5 4.5L12 14Z" />
    <path d="M6.5 11.6V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.4M21.5 9.5V15" />
  </Icon>
);

export const CalendarIcon = (props) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const BotIcon = (props) => (
  <Icon {...props}>
    <rect x="4" y="8" width="16" height="12" rx="3.5" />
    <path d="M12 8V4.5M9 14h.01M15 14h.01M2 13v3M22 13v3" />
    <circle cx="12" cy="3.5" r="1" />
  </Icon>
);

export const HistoryIcon = (props) => (
  <Icon {...props}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 4v4.5H8" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);

export const MessagePlusIcon = (props) => (
  <Icon {...props}>
    <path d="M20 12.5V6a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 6v9a2.5 2.5 0 0 0 2.5 2.5H8V21l4-3.5h1.5" />
    <path d="M18.5 15v6M15.5 18h6" />
  </Icon>
);

export const StopIcon = (props) => (
  <Icon {...props}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
  </Icon>
);

export const ExpandIcon = (props) => (
  <Icon {...props}>
    <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
  </Icon>
);

export const CollapseIcon = (props) => (
  <Icon {...props}>
    <path d="M20 4l-7 7M13 5v6h6M4 20l7-7M11 19v-6H5" />
  </Icon>
);

// Microsoft's four-square logo, in its own colours (Microsoft sign-in branding).
export const MicrosoftLogo = ({ size = 18, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 21 21" className={className} aria-hidden="true">
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);
