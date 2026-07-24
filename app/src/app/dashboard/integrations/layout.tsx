import { notFound } from "next/navigation";
import { productSurfaceFlags } from "@/platform/feature-flags";

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  if (!productSurfaceFlags.integrations) notFound();
  return children;
}
