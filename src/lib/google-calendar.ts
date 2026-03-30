import { google } from "googleapis";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI!;

export function getOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
    prompt: "consent",
  });
}

export function getCalendar(accessToken: string, refreshToken?: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function createGoogleEvent(
  accessToken: string,
  refreshToken: string | undefined,
  event: {
    title: string;
    description?: string;
    start: Date;
    end?: Date;
    allDay?: boolean;
  }
) {
  const calendar = getCalendar(accessToken, refreshToken);

  const startObj = event.allDay
    ? { date: event.start.toISOString().split("T")[0] }
    : { dateTime: event.start.toISOString(), timeZone: "Europe/Zurich" };

  const endDate = event.end ?? new Date(event.start.getTime() + 60 * 60 * 1000);
  const endObj = event.allDay
    ? { date: endDate.toISOString().split("T")[0] }
    : { dateTime: endDate.toISOString(), timeZone: "Europe/Zurich" };

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.title,
      description: event.description,
      start: startObj,
      end: endObj,
    },
  });

  return res.data;
}

export async function deleteGoogleEvent(
  accessToken: string,
  refreshToken: string | undefined,
  eventId: string
) {
  const calendar = getCalendar(accessToken, refreshToken);
  await calendar.events.delete({ calendarId: "primary", eventId });
}
