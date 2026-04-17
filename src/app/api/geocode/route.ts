import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { address } = await request.json() as { address: string };
  if (!address?.trim()) return Response.json({ error: "Missing address" }, { status: 400 });

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  if (!key) return Response.json({ error: "Maps API key not configured" }, { status: 503 });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;

  try {
    const res = await fetch(url);
    const data = await res.json() as {
      status: string;
      results: Array<{
        geometry: { location: { lat: number; lng: number } };
        formatted_address: string;
      }>;
    };

    if (data.status === "REQUEST_DENIED") {
      return Response.json({ error: "Geocoding API not enabled — enable it in Google Cloud Console" }, { status: 503 });
    }
    if (data.status !== "OK" || !data.results?.[0]) {
      return Response.json({ error: "Address not found" }, { status: 404 });
    }

    const { lat, lng } = data.results[0].geometry.location;
    const formatted = data.results[0].formatted_address;
    return Response.json({ lat, lng, formatted });
  } catch {
    return Response.json({ error: "Geocoding service unavailable" }, { status: 503 });
  }
}
