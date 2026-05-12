import { auth } from "@/platform/auth";
import { LandingPage } from "@/ui/marketing/landing-page";

export default async function RootPage() {
  const session = await auth();

  return <LandingPage hasSession={!!session} />;
}
