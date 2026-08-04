import { describe, expect, it } from "vitest";
import { invoicesToUnlink } from "./clients";
import type { Invoice } from "./types";

function inv(id: string, clientId: string | null): Invoice {
  return { id, clientId } as Invoice;
}

describe("invoicesToUnlink", () => {
  it("returns nothing when there are no invoices at all", () => {
    expect(invoicesToUnlink("c1", [])).toEqual([]);
  });

  it("returns nothing when no invoice references this client", () => {
    expect(invoicesToUnlink("c1", [inv("i1", "c2"), inv("i2", "c3")])).toEqual([]);
  });

  it("returns every invoice referencing the client", () => {
    const a = inv("i1", "c1");
    const b = inv("i2", "c1");
    expect(invoicesToUnlink("c1", [a, b])).toEqual([a, b]);
  });

  it("ignores invoices already unlinked (clientId: null)", () => {
    expect(invoicesToUnlink("c1", [inv("i1", null)])).toEqual([]);
  });

  it("picks out only the matching invoices from a mix of matching, other-client, and already-null ones", () => {
    const match1 = inv("i1", "c1");
    const other = inv("i2", "c2");
    const already = inv("i3", null);
    const match2 = inv("i4", "c1");
    expect(invoicesToUnlink("c1", [match1, other, already, match2])).toEqual([match1, match2]);
  });
});
