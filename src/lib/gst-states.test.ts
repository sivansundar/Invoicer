import { describe, expect, it } from "vitest";
import { stateFromGstin } from "./gst-states";

describe("stateFromGstin", () => {
  it("reads the state code off a GSTIN prefix", () => {
    expect(stateFromGstin("29FUVPS0879F1ZL")).toBe("29");
    expect(stateFromGstin(" 33AAAAA0000A1Z5")).toBe("33");
  });
  it("is undefined for blank or unknown prefixes", () => {
    expect(stateFromGstin(undefined)).toBeUndefined();
    expect(stateFromGstin("")).toBeUndefined();
    expect(stateFromGstin("99XXXXX")).toBeUndefined();
  });
});
