import type { Database } from "@/types/database";

export type AuditEvent = Database["public"]["Tables"]["audit_events"]["Row"];
