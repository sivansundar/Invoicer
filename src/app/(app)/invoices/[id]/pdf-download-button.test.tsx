import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDownloadButton } from "./pdf-download-button";
import { resetFakeSeam } from "@/test/fake-seam";
import { makeInvoice, makeSnapshot } from "@/test/factories";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

const toBlob = vi.fn(async () => new Blob(["pdf"], { type: "application/pdf" }));
const pdf = vi.fn((element: unknown) => {
  void element;
  return { toBlob };
});
// The design components (`modern-invoice-pdf.tsx`, `classic-invoice-pdf.tsx`)
// call `Font.register` and `StyleSheet.create` at module load — before any
// rendering happens — so the mock has to supply those too, even though
// `pdf` is the only export this test exercises directly.
vi.mock("@react-pdf/renderer", () => ({
  pdf: (element: unknown) => pdf(element),
  Font: { register: vi.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
  Document: "Document",
  Page: "Page",
  Text: "Text",
  View: "View",
  Image: "Image",
}));

function snapshotHandedToPdf() {
  const element = pdf.mock.calls[0][0] as { props: { snapshot: { logo?: string } } };
  return element.props.snapshot;
}

describe("PDFDownloadButton", () => {
  beforeEach(() => {
    resetFakeSeam();
    pdf.mockClear();
    global.URL.createObjectURL = vi.fn(() => "blob:x");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("fetches a path-backed logo and hands the PDF a data URL", async () => {
    global.fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    const snapshot = makeSnapshot({ logoPath: "b1/abc.png" });

    render(<PDFDownloadButton invoice={makeInvoice()} snapshot={snapshot} />);
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    expect(snapshotHandedToPdf().logo).toMatch(/^data:image\/png;base64,/);
  });

  it("passes a legacy base64 snapshot straight through", async () => {
    global.fetch = vi.fn();
    const snapshot = makeSnapshot({ logo: "data:image/png;base64,aGk=" });

    render(<PDFDownloadButton invoice={makeInvoice()} snapshot={snapshot} />);
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    expect(snapshotHandedToPdf().logo).toBe("data:image/png;base64,aGk=");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // The failure mode is a logo missing from a document already sent. The PDF
  // must still generate.
  it("still generates the PDF when the logo cannot be fetched", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network");
    });

    render(
      <PDFDownloadButton invoice={makeInvoice()} snapshot={makeSnapshot({ logoPath: "b1/abc.png" })} />
    );
    await userEvent.click(screen.getByRole("button", { name: /download pdf/i }));

    expect(pdf).toHaveBeenCalled();
    expect(snapshotHandedToPdf().logo).toBeUndefined();
  });
});
