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

export const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "project_manager", label: "Project Manager" },
  { value: "viewer", label: "Visualizzatore" },
  { value: "collaborator", label: "Collaboratore" },
] as const;

export const PHASE_COLORS: Record<string, string> = {
  "ETUDE / AP": "#ef4444",
  MAE: "#22c55e",
  CHANTIER: "#3b82f6",
  "EXE / DG / DV / 3D": "#f97316",
  TERMINATO: "#8b5cf6",
  STUCK: "#6b7280",
};

export const BILLING_OPTIONS = ["Non", "Parziale", "Completo"] as const;
