/**
 * Preview-only product surfaces. Each flag is deliberately opt-in so static
 * prototypes cannot be presented as live workspace functionality by default.
 */
export const productSurfaceFlags = {
  aiGallery: process.env.NEXT_PUBLIC_ENABLE_AI_GALLERY === "true",
  aiPlanning: process.env.NEXT_PUBLIC_ENABLE_AI_PLANNING === "true",
  integrations: process.env.NEXT_PUBLIC_ENABLE_INTEGRATIONS_CATALOGUE === "true",
} as const;
