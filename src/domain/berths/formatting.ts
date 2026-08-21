export function formatMetres(value: number) {
  return `${Number(value).toFixed(2)} m`;
}

export function formatBerthTimestamp(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}
