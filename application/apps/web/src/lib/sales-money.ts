/** Parse a USD decimal input into exact integer cents without float rounding. */
export function parseUsdMinorUnits(raw: string): number | null {
  const value = raw.trim() || "0";
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}
