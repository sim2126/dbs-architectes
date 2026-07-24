import { notFound } from "next/navigation";
import { productSurfaceFlags } from "@/platform/feature-flags";

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  if (!productSurfaceFlags.aiGallery) notFound();
  return children;
}
