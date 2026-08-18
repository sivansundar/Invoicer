import { describe, expect, it } from "vitest";
import {
  RECENT_CLIENT_LIMIT,
  recentClients,
  toneForClient,
  type ChipTone,
} from "./recent-clients";
import type { Client, Invoice } from "./types";

function inv(id: string, clientId: string | null, createdAt: string): Invoice {
  return { id, clientId, createdAt } as Invoice;
}

function cli(id: string, companyName: string): Client {
  return { id, companyName } as Client;
}

const ACCENTS: ChipTone[] = ["blue", "amber", "violet", "green", "red"];

describe("recentClients", () => {
  it("returns nothing when there is no invoice history", () => {
    expect(recentClients([], [cli("c1", "Acme Studio")])).toEqual([]);
  });

  it("returns nothing for a client that has never been invoiced", () => {
    const clients = [cli("c1", "Acme Studio"), cli("c2", "Kestrel Labs")];
    const recents = recentClients([inv("i1", "c1", "2026-06-01T00:00:00.000Z")], clients);
    expect(recents.map((r) => r.id)).toEqual(["c1"]);
  });

  it("orders by the most recently written invoice, newest first", () => {
    const clients = [cli("c1", "Acme Studio"), cli("c2", "Kestrel Labs"), cli("c3", "Meridian")];
    const invoices = [
      inv("i1", "c1", "2026-06-01T00:00:00.000Z"),
      inv("i2", "c3", "2026-08-01T00:00:00.000Z"),
      inv("i3", "c2", "2026-07-01T00:00:00.000Z"),
    ];
    expect(recentClients(invoices, clients).map((r) => r.companyName)).toEqual([
      "Meridian",
      "Kestrel Labs",
      "Acme Studio",
    ]);
  });

  it("lists a client once, at the position of its newest invoice", () => {
    const clients = [cli("c1", "Acme Studio"), cli("c2", "Kestrel Labs")];
    const invoices = [
      inv("i1", "c1", "2026-01-01T00:00:00.000Z"),
      inv("i2", "c2", "2026-02-01T00:00:00.000Z"),
      inv("i3", "c1", "2026-03-01T00:00:00.000Z"),
    ];
    expect(recentClients(invoices, clients).map((r) => r.id)).toEqual(["c1", "c2"]);
  });

  it("skips a client deleted since its invoice was written", () => {
    const invoices = [
      inv("i1", "gone", "2026-08-01T00:00:00.000Z"),
      inv("i2", "c1", "2026-07-01T00:00:00.000Z"),
    ];
    expect(recentClients(invoices, [cli("c1", "Acme Studio")]).map((r) => r.id)).toEqual(["c1"]);
  });

  it("skips manually-typed invoices, which have no saved client to select", () => {
    const invoices = [
      inv("i1", null, "2026-08-01T00:00:00.000Z"),
      inv("i2", "c1", "2026-07-01T00:00:00.000Z"),
    ];
    expect(recentClients(invoices, [cli("c1", "Acme Studio")]).map((r) => r.id)).toEqual(["c1"]);
  });

  it("caps the list, keeping the most recent ones", () => {
    const clients = Array.from({ length: 6 }, (_, i) => cli(`c${i}`, `Client ${i}`));
    // c0 is the oldest, c5 the newest.
    const invoices = clients.map((c, i) =>
      inv(`i${i}`, c.id, `2026-0${i + 1}-01T00:00:00.000Z`)
    );
    const recents = recentClients(invoices, clients);
    expect(recents).toHaveLength(RECENT_CLIENT_LIMIT);
    expect(recents.map((r) => r.id)).toEqual(["c5", "c4", "c3", "c2"]);
  });

  it("takes the name from the live client record, not the invoice snapshot", () => {
    const invoices = [
      { ...inv("i1", "c1", "2026-08-01T00:00:00.000Z"), client: { companyName: "Old Name" } },
    ] as Invoice[];
    expect(recentClients(invoices, [cli("c1", "Renamed Ltd")])[0].companyName).toBe("Renamed Ltd");
  });
});

describe("toneForClient", () => {
  it("is stable for the same client id", () => {
    expect(toneForClient("c1")).toBe(toneForClient("c1"));
    expect(toneForClient("9f2a-4c11")).toBe(toneForClient("9f2a-4c11"));
  });

  it("only ever returns one of the five design-system accents", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `client-${i}`);
    for (const id of ids) {
      expect(ACCENTS).toContain(toneForClient(id));
    }
  });

  it("spreads clients across the accents rather than collapsing onto one", () => {
    const used = new Set(
      Array.from({ length: 200 }, (_, i) => toneForClient(`client-${i}`))
    );
    expect(used.size).toBe(ACCENTS.length);
  });

  it("gives neighbouring ids different accents, so a chip row is not monochrome", () => {
    const row = recentClients(
      ["c1", "c2", "c3", "c4"].map((id, i) => inv(`i${i}`, id, `2026-0${i + 1}-01T00:00:00.000Z`)),
      ["c1", "c2", "c3", "c4"].map((id) => cli(id, id))
    );
    expect(new Set(row.map((r) => r.tone)).size).toBeGreaterThan(1);
  });
});
