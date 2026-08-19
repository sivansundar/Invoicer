import { describe, expect, it, vi } from "vitest";
import {
  classifyResendStatus,
  composeReminder,
  quoteDisplayName,
  reminderMessageId,
  sendReminderEmail,
  type ComposeInput,
} from "./reminder-email";
import { makeInvoice } from "@/test/factories";

const identity = { fromEmail: "notifications@invoicer.app" };

function input(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    identity,
    invoice: makeInvoice({
      invoiceNumber: "SC-2026-004",
      dueDate: "2026-07-20",
      total: 84250,
      client: { companyName: "Kestrel Labs", address: "", email: "ap@kestrel.com" },
    }),
    brandName: "Sundar Consulting",
    replyTo: "hello@sundar.co",
    template: {
      id: "t1",
      subject: "A nudge about {{invoice}}",
      body: "Hi {{client}}, {{amount}} was due on {{due_date}}.",
    },
    stage: "nudge",
    sendId: "aaaaaaa1-0000-4000-8000-000000000001",
    today: new Date("2026-07-23T09:00"),
    ...overrides,
  };
}

describe("quoteDisplayName", () => {
  it("quotes names containing address-special characters", () => {
    expect(quoteDisplayName("Sundar Consulting")).toBe('"Sundar Consulting"');
    expect(quoteDisplayName("Acme, Inc.")).toBe('"Acme, Inc."');
  });

  // An unescaped quote would end the quoted string early and let the rest of
  // the name be parsed as address syntax.
  it("escapes quotes and backslashes", () => {
    expect(quoteDisplayName('The "Best" Studio')).toBe('"The \\"Best\\" Studio"');
    expect(quoteDisplayName("Back\\slash")).toBe('"Back\\\\slash"');
  });

  // A newline in a header is header injection: everything after it would be
  // read as a new header field.
  it("strips newlines", () => {
    expect(quoteDisplayName("Evil\r\nBcc: victim@x.com")).toBe('"Evil Bcc: victim@x.com"');
  });

  it("returns empty for a blank name rather than empty quotes", () => {
    expect(quoteDisplayName("   ")).toBe("");
  });
});

describe("reminderMessageId", () => {
  it("anchors to the send row and the sending domain", () => {
    expect(reminderMessageId("abc", "invoicer.app")).toBe("<reminder.abc@invoicer.app>");
  });
});

describe("composeReminder", () => {
  it("renders the template against the invoice", () => {
    const result = composeReminder(input());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.email.subject).toBe("A nudge about SC-2026-004");
    expect(result.email.text).toContain("Kestrel Labs");
    expect(result.email.text).toContain("20 Jul 2026");
    expect(result.email.to).toBe("ap@kestrel.com");
    expect(result.email.replyTo).toBe("hello@sundar.co");
  });

  it("sends from the app's domain under the brand's name", () => {
    const result = composeReminder(input());
    if (!result.ok) throw new Error("expected ok");
    expect(result.email.from).toBe('"Sundar Consulting" <notifications@invoicer.app>');
  });

  it("carries a Message-ID derived from the send row", () => {
    const result = composeReminder(input());
    if (!result.ok) throw new Error("expected ok");
    expect(result.email.headers["Message-ID"]).toBe(
      "<reminder.aaaaaaa1-0000-4000-8000-000000000001@invoicer.app>"
    );
  });

  describe("threading", () => {
    it("sets no threading headers on the first reminder", () => {
      const result = composeReminder(input());
      if (!result.ok) throw new Error("expected ok");
      expect(result.email.headers["In-Reply-To"]).toBeUndefined();
      expect(result.email.headers["References"]).toBeUndefined();
    });

    /**
     * Both headers, not one: clients that thread on In-Reply-To and clients
     * that thread on References are equally common, and the whole point is
     * that stage four lands under stage one rather than as a fourth unrelated
     * message in the client's inbox.
     */
    it("points at the immediate parent and carries the whole chain", () => {
      const result = composeReminder(
        input({ priorMessageIds: ["<reminder.one@invoicer.app>", "<reminder.two@invoicer.app>"] })
      );
      if (!result.ok) throw new Error("expected ok");
      expect(result.email.headers["In-Reply-To"]).toBe("<reminder.two@invoicer.app>");
      expect(result.email.headers["References"]).toBe(
        "<reminder.one@invoicer.app> <reminder.two@invoicer.app> " +
          "<reminder.aaaaaaa1-0000-4000-8000-000000000001@invoicer.app>"
      );
    });

    // A legacy reminder has no Message-ID, so the chain has gaps in it.
    it("ignores blank ids in the chain", () => {
      const result = composeReminder(
        input({ priorMessageIds: ["", "  ", "<reminder.real@invoicer.app>"] })
      );
      if (!result.ok) throw new Error("expected ok");
      expect(result.email.headers["In-Reply-To"]).toBe("<reminder.real@invoicer.app>");
    });
  });

  describe("refusals", () => {
    it("refuses a client with no email", () => {
      const result = composeReminder(
        input({
          invoice: makeInvoice({ client: { companyName: "K", address: "" } }),
        })
      );
      expect(result).toMatchObject({ ok: false, reason: "no_recipient" });
    });

    // The From address is shared infrastructure, not a mailbox anyone reads,
    // so without a Reply-To a client's reply goes nowhere at all.
    it("refuses a brand with no reply-to", () => {
      expect(composeReminder(input({ replyTo: null }))).toMatchObject({
        ok: false,
        reason: "no_reply_to",
      });
      expect(composeReminder(input({ replyTo: "   " }))).toMatchObject({
        ok: false,
        reason: "no_reply_to",
      });
    });

    it("refuses an empty subject or body rather than sending a blank email", () => {
      expect(
        composeReminder(input({ template: { id: "t", subject: "  ", body: "x" } }))
      ).toMatchObject({ ok: false, reason: "empty_subject" });
      expect(
        composeReminder(input({ template: { id: "t", subject: "x", body: "  " } }))
      ).toMatchObject({ ok: false, reason: "empty_body" });
    });
  });
});

describe("classifyResendStatus", () => {
  it("treats rate limits and server errors as worth retrying", () => {
    expect(classifyResendStatus(429)).toBe("transient");
    expect(classifyResendStatus(500)).toBe("transient");
    expect(classifyResendStatus(503)).toBe("transient");
  });

  // A bad key or a rejected address does not improve by asking again every
  // hour; it needs a human.
  it("treats auth and validation failures as permanent", () => {
    expect(classifyResendStatus(401)).toBe("permanent");
    expect(classifyResendStatus(403)).toBe("permanent");
    expect(classifyResendStatus(422)).toBe("permanent");
  });
});

describe("sendReminderEmail", () => {
  const composed = (() => {
    const result = composeReminder(input());
    if (!result.ok) throw new Error("fixture failed to compose");
    return result.email;
  })();

  it("posts the composed message and returns the provider id", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ id: "resend-123" }), { status: 200 })
    ) as unknown as typeof fetch;

    const result = await sendReminderEmail({ apiKey: "re_test", email: composed, fetchImpl });
    expect(result).toEqual({ ok: true, providerMessageId: "resend-123" });

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.from).toBe('"Sundar Consulting" <notifications@invoicer.app>');
    expect(body.to).toEqual(["ap@kestrel.com"]);
    expect(body.reply_to).toEqual(["hello@sundar.co"]);
    expect(body.headers["Message-ID"]).toContain("@invoicer.app");
  });

  it("reports the provider's own message when it rejects the send", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: "Invalid `to` field" }), { status: 422 })
    ) as unknown as typeof fetch;

    const result = await sendReminderEmail({ apiKey: "re_test", email: composed, fetchImpl });
    expect(result).toEqual({
      ok: false,
      kind: "permanent",
      status: 422,
      detail: "Invalid `to` field",
    });
  });

  it("falls back to the status code when the error body is not JSON", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("<html>gateway</html>", { status: 502 })
    ) as unknown as typeof fetch;

    const result = await sendReminderEmail({ apiKey: "re_test", email: composed, fetchImpl });
    expect(result).toMatchObject({ ok: false, kind: "transient", detail: "Resend returned 502" });
  });

  /**
   * The caller is a loop over every overdue invoice in the system. One
   * unreachable host must mean "try this one again next run", never "abandon
   * the run for everybody else".
   */
  it("returns a transient failure rather than throwing on a network error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.resend.com");
    }) as unknown as typeof fetch;

    const result = await sendReminderEmail({ apiKey: "re_test", email: composed, fetchImpl });
    expect(result).toMatchObject({ ok: false, kind: "transient", status: 0 });
    expect((result as { detail: string }).detail).toContain("ENOTFOUND");
  });
});
