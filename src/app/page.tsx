import { auth } from "@/lib/auth";
import { LandingPage } from "@/components/marketing/landing-page";

export default async function RootPage() {
  const session = await auth();

  return <LandingPage hasSession={!!session} />;
}
