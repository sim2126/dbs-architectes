import type { NextRequest } from "next/server";
import {
  PermissionError,
  permissionResponse,
  requirePermission,
} from "@/platform/authz/require-permission";
import type { Subject } from "@/platform/authz/authorize";

export async function requireAiAccess(request: NextRequest): Promise<
  | { allowed: true; subject: Subject }
  | { allowed: false; response: Response }
> {
  try {
    const { subject } = await requirePermission(request, "ai:invoke", {
      context: { route: new URL(request.url).pathname },
    });
    return { allowed: true, subject };
  } catch (error) {
    if (error instanceof PermissionError) {
      return { allowed: false, response: permissionResponse(error) };
    }
    throw error;
  }
}
