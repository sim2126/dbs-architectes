import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export const PHASES = [
  "ETUDE / AP",
  "MAE",
  "CHANTIER",
  "EXE / DG / DV / 3D",
  "TERMINATO",
  "STUCK",
] as const;

export const CATEGORIES = [
  "Residenziale",
  "Commerciale",
  "Industriale",
] as const;

export const TYPOLOGIES = [
  "Ville monofamiliari",
  "Ville bifamiliari",
  "Condomini",
] as const;

export const TERRAINS = ["In piano", "In pendenza"] as const;

export const ROOFS = ["A falde", "Piano"] as const;

// Primary role set — ordered from most to least privileged
export const ROLES = [
  { value: "admin",     label: "Admin" },
  { value: "director",  label: "Director" },
  { value: "manager",   label: "Manager" },
  { value: "employee",  label: "Employee" },
  { value: "intern",    label: "Intern" },
] as const;

export const EMPLOYMENT_STATUSES = [
  { value: "invited",    label: "Invited",    color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  { value: "active",     label: "Active",     color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  { value: "on_leave",   label: "On Leave",   color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  { value: "suspended",  label: "Suspended",  color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  { value: "terminated", label: "Terminated", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
] as const;

export const COUNTRIES = [
  { value: "CH", label: "Switzerland", flag: "🇨🇭" },
  { value: "IT", label: "Italy",       flag: "🇮🇹" },
  { value: "IN", label: "India",       flag: "🇮🇳" },
] as const;

export const OPERATING_REGIONS: Record<string, { value: string; label: string; code: string }[]> = {
  CH: [
    { value: "Ticino",   label: "Ticino",   code: "CH-TI" },
    { value: "Zurich",   label: "Zurich",   code: "CH-ZH" },
    { value: "Geneva",   label: "Geneva",   code: "CH-GE" },
    { value: "Bern",     label: "Bern",     code: "CH-BE" },
    { value: "Lugano",   label: "Lugano",   code: "CH-LU" },
  ],
  IT: [
    { value: "Lombardia",  label: "Lombardia",  code: "IT-LOM" },
    { value: "Piemonte",   label: "Piemonte",   code: "IT-PIE" },
    { value: "Veneto",     label: "Veneto",     code: "IT-VEN" },
    { value: "Lazio",      label: "Lazio",      code: "IT-LAZ" },
    { value: "Toscana",    label: "Toscana",    code: "IT-TOS" },
  ],
  IN: [
    { value: "Maharashtra",  label: "Maharashtra",  code: "IN-MH" },
    { value: "Delhi",        label: "Delhi",        code: "IN-DL" },
    { value: "Karnataka",    label: "Karnataka",    code: "IN-KA" },
    { value: "Tamil Nadu",   label: "Tamil Nadu",   code: "IN-TN" },
    { value: "Gujarat",      label: "Gujarat",      code: "IN-GJ" },
  ],
};

export const PHASE_COLORS: Record<string, string> = {
  "ETUDE / AP": "#ef4444",
  MAE: "#22c55e",
  CHANTIER: "#3b82f6",
  "EXE / DG / DV / 3D": "#f97316",
  TERMINATO: "#8b5cf6",
  STUCK: "#6b7280",
};

export const BILLING_OPTIONS = ["Non", "Parziale", "Completo"] as const;
