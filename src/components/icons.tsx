// Иконки SellCore: контур 24px, линия 1.75px, цвет currentColor.
const paths = {
  home: <path d="M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z" />,
  tasks: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="m8 12 3 3 5-6" /></>,
  box: <><path d="M20.5 7.5 12 3 3.5 7.5v9L12 21l8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  wallet: <><rect x="3" y="6.5" width="18" height="13" rx="3" /><path d="M5.5 6.5V6a2 2 0 0 1 2-2H17" /><circle cx="16.5" cy="13" r="1" /></>,
  chart: <><rect x="4" y="13" width="4" height="7" rx="1" /><rect x="10" y="8" width="4" height="12" rx="1" /><rect x="16" y="4" width="4" height="16" rx="1" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /><circle cx="12" cy="12" r="6.9" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.3c2.1.7 3.5 2.8 3.5 5.7" /></>,
  trend: <><path d="M3.5 17.5 9 12l4 4 7.5-8" /><path d="M15 8h5.5v5.5" /></>,
  refresh: <><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9" /><path d="M18.5 3v4.5H14M5.5 21v-4.5H10" /></>,
  truck: <><path d="M3 6.5h11v10H3zM14 10h4l3 3v3.5h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></>,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 32" width={size} height={(size * 2) / 3} style={{ fill: "var(--accent)" }} aria-hidden="true">
      <rect x="14" y="2" width="32" height="12" rx="6" />
      <rect x="2" y="18" width="32" height="12" rx="6" />
    </svg>
  );
}
