import { describe, it, expect } from "vitest";
import { sha256Hex, dataUrlToBytes, logoObjectPath } from "./logo-storage";

describe("dataUrlToBytes", () => {
  it("decodes the base64 payload after the comma", () => {
    // "hi" -> aGk=
    expect(Array.from(dataUrlToBytes("data:image/png;base64,aGk="))).toEqual([104, 105]);
  });
});

describe("sha256Hex", () => {
  it("matches the known digest of the empty input", async () => {
    expect(await sha256Hex(new Uint8Array([]))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("matches the known digest of 'abc'", async () => {
    expect(await sha256Hex(new Uint8Array([97, 98, 99]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("is stable, so identical images address the same object", async () => {
    const bytes = dataUrlToBytes("data:image/png;base64,aGk=");
    expect(await sha256Hex(bytes)).toBe(await sha256Hex(bytes));
  });
});

describe("logoObjectPath", () => {
  it("puts the brand id first, because that is what the policy checks", () => {
    expect(logoObjectPath("6f1c1d4e-0000-4000-8000-000000000001", "abc")).toBe(
      "6f1c1d4e-0000-4000-8000-000000000001/abc.png"
    );
  });
});
