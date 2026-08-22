const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function safeBrandColor(value: string) {
  return HEX_COLOR.test(value) ? value : "#0A192F";
}

export function marinaInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function timezoneLabel(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      timeZoneName: "long",
    }).formatToParts(new Date());
    return parts.find(({ type }) => type === "timeZoneName")?.value ?? timezone;
  } catch {
    return timezone;
  }
}
