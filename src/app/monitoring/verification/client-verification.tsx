"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";

export function ClientVerification() {
  const [eventId, setEventId] = useState<string>();

  useEffect(() => {
    let active = true;
    const capturedEventId = Sentry.captureException(
      new Error("M5 controlled client observability verification"),
      { tags: { verification: "m5_sentry_client" } },
    );

    void Sentry.flush(3_000).then(() => {
      if (active) setEventId(capturedEventId);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <output data-sentry-event-id={eventId ?? "pending"}>
      {eventId ? "Client event sent" : "Sending client event"}
    </output>
  );
}
