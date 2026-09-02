import type { Json } from "@/types/database";

export function auditActorLabel(actorType: "member" | "guest" | "system", actorEmail: string | null) {
  if (actorType === "guest") return "Guest";
  if (actorType === "system") return "Berthio system";
  return actorEmail ?? "Marina member";
}

function isObject(value: Json | null): value is { [key: string]: Json | undefined } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function auditChangedFields(before: Json | null, after: Json | null) {
  if (!isObject(before) || !isObject(after)) return [];
  const ignored = new Set(["updated_at"]);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !ignored.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort();
}
