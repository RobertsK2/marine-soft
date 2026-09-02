import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverOperationalNotifications } from "@/domain/notifications/service";
import { captureServerError } from "@/lib/monitoring/server";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const configured = process.env.NOTIFICATION_WORKER_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!configured || !supplied) return false;
  const expectedBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit") ?? "10");
    const result = await deliverOperationalNotifications(
      Number.isFinite(requestedLimit) ? requestedLimit : 10,
    );
    return NextResponse.json(result);
  } catch (error) {
    captureServerError(error, { operation: "notification_worker" });
    return NextResponse.json({ error: "Notification processing failed." }, { status: 500 });
  }
}
