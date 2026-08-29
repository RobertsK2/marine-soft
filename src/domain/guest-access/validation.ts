const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function validateGuestTimes(values: { eta: unknown; etd: unknown }) {
  const eta = typeof values.eta === "string" ? values.eta.trim() : "";
  const etd = typeof values.etd === "string" ? values.etd.trim() : "";
  const errors: { eta?: string; etd?: string } = {};
  if (!LOCAL_TIME.test(eta)) errors.eta = "Enter a valid ETA.";
  if (!LOCAL_TIME.test(etd)) errors.etd = "Enter a valid ETD.";
  return Object.keys(errors).length > 0
    ? { success: false as const, errors }
    : { success: true as const, data: { eta, etd } };
}
