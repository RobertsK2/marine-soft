import type { LucideIcon } from "lucide-react";

export function InsightCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <article className="overview-insight-card">
      <span className="overview-insight-icon"><Icon size={18} aria-hidden="true" /></span>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
