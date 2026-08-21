import type { BerthStatus } from "@/domain/berths/types";

const LABELS: Record<BerthStatus, string> = {
  available: "Available",
  blocked: "Blocked",
  out_of_service: "Out of service",
};

export function BerthStatusBadge({ status }: { status: BerthStatus }) {
  return (
    <span className={`berth-status berth-status-${status}`}>
      <span aria-hidden="true" />
      {LABELS[status]}
    </span>
  );
}
