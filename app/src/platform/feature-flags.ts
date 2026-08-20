/**
 * Preview-only product surfaces. Each flag is deliberately opt-in so static
 * prototypes cannot be presented as live workspace functionality by default.
 */
export const productSurfaceFlags = {
  aiGallery: process.env.NEXT_PUBLIC_ENABLE_AI_GALLERY === "true",
  aiPlanning: process.env.NEXT_PUBLIC_ENABLE_AI_PLANNING === "true",
  integrations: process.env.NEXT_PUBLIC_ENABLE_INTEGRATIONS_CATALOGUE === "true",
  /**
   * Google sign-in. The button is shown regardless — it is part of the
   * intended sign-in design — but it only calls signIn("google") when this
   * is set. Until then it explains that the provider is not yet connected,
   * rather than failing silently, which is what makes a control feel broken.
   *
   * Flip to "true" once a Google provider exists in platform/auth.
   */
  googleSignIn: process.env.NEXT_PUBLIC_GOOGLE_SIGNIN_ENABLED === "true",
} as const;
