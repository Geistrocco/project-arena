import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export const SearchIcon = (p: IconProps) => <svg {...base} {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
export const CalendarIcon = (p: IconProps) => <svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>;
export const PinIcon = (p: IconProps) => <svg {...base} {...p}><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
export const UsersIcon = (p: IconProps) => <svg {...base} {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
export const ArrowIcon = (p: IconProps) => <svg {...base} {...p}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
export const CheckIcon = (p: IconProps) => <svg {...base} {...p}><path d="m5 12 4 4L19 6"/></svg>;
export const TrophyIcon = (p: IconProps) => <svg {...base} {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/></svg>;
export const MenuIcon = (p: IconProps) => <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
export const CloseIcon = (p: IconProps) => <svg {...base} {...p}><path d="m6 6 12 12M18 6 6 18"/></svg>;
