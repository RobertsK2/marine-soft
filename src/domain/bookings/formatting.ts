export function formatBookingDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export function formatBookingTime(value: string) {
  return value.slice(0, 5);
}

export function bookingNights(arrivalDate: string, departureDate: string) {
  const arrival = Date.parse(`${arrivalDate}T00:00:00Z`);
  const departure = Date.parse(`${departureDate}T00:00:00Z`);
  return Math.round((departure - arrival) / 86_400_000);
}

export function formatVesselName(value: string | null) {
  return value || "Unnamed vessel";
}
