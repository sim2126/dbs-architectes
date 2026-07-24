import { notFound } from "next/navigation";
import { productSurfaceFlags } from "@/platform/feature-flags";

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  if (!productSurfaceFlags.aiPlanning) notFound();
  return children;
}
