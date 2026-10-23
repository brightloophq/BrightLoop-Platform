import { describe, expect, it } from "vitest";
import { parseUsdMinorUnits } from "./sales-money";

describe("USD minor-unit parsing", () => {
  it.each([["0", 0], ["0.29", 29], ["12.3", 1230], ["90071992547409.91", 9007199254740991], ["", 0]])(
    "parses %s without binary floating-point rounding",
    (input, expected) => expect(parseUsdMinorUnits(input)).toBe(expected),
  );
  it.each(["-1", "1.001", "01.00", "1e2", "90071992547409.92"])(
    "rejects unsupported USD value %s",
    (input) => expect(parseUsdMinorUnits(input)).toBeNull(),
  );
});
