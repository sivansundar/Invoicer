import { describe, expect, it } from "vitest";
import { buildMessage, findProblems, readEnvFile } from "./check-env.mjs";

const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

describe("readEnvFile", () => {
  it("reads plain KEY=value lines", () => {
    expect(readEnvFile("A=1\nB=two\n")).toEqual({ A: "1", B: "two" });
  });

  it("skips comments and blank lines", () => {
    expect(readEnvFile("# note\n\nA=1\n")).toEqual({ A: "1" });
  });

  it("strips surrounding quotes", () => {
    expect(readEnvFile('A="quoted"\nB=\'single\'\n')).toEqual({ A: "quoted", B: "single" });
  });

  it("keeps a value containing = intact", () => {
    // Supabase keys are JWTs; base64 padding puts = inside the value.
    expect(readEnvFile("KEY=abc.def==\n")).toEqual({ KEY: "abc.def==" });
  });

  it("treats a key with no value as empty rather than missing the line", () => {
    expect(readEnvFile("A=\n")).toEqual({ A: "" });
  });
});

describe("findProblems", () => {
  const good = {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54421",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJ.anon",
  };

  it("passes a complete file", () => {
    expect(findProblems(REQUIRED, good, {})).toEqual([]);
  });

  it("reports every absent name", () => {
    expect(findProblems(REQUIRED, {}, {})).toEqual(REQUIRED);
  });

  // A shell exporting an unset variable produces "", which looks set in a diff
  // and is rejected by the SDK.
  it("treats an empty value as unset", () => {
    expect(findProblems(REQUIRED, { ...good, NEXT_PUBLIC_SUPABASE_URL: "" }, {})).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);
  });

  // Copying .env.local.example and filling only the unprefixed SUPABASE_*
  // block leaves this placeholder behind — the trap this check exists for.
  it("treats the example's placeholder as unset", () => {
    expect(
      findProblems(REQUIRED, { ...good, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "replace-me" }, {})
    ).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  });

  it("lets a real exported variable satisfy a name missing from the file", () => {
    expect(findProblems(REQUIRED, {}, good)).toEqual([]);
  });

  it("prefers the real environment over the file", () => {
    expect(findProblems(REQUIRED, { ...good, NEXT_PUBLIC_SUPABASE_URL: "replace-me" }, good)).toEqual(
      []
    );
  });
});

describe("buildMessage", () => {
  it("says the file is missing when it is", () => {
    expect(buildMessage(REQUIRED, false)).toContain("There is no .env.local");
  });

  it("says the file exists but is unusable when it does", () => {
    expect(buildMessage(REQUIRED, true)).toContain(".env.local exists but");
  });

  it("names the fix and the ANON_KEY rename", () => {
    const message = buildMessage(REQUIRED, true);
    expect(message).toContain("npm run dev:setup");
    expect(message).toContain("ANON_KEY");
  });

  it("agrees with itself on plurality for a single name", () => {
    expect(buildMessage(["NEXT_PUBLIC_SUPABASE_URL"], true)).toContain("is not set");
  });
});
