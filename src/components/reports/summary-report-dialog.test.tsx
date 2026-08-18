import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SummaryReportDialog } from "./summary-report-dialog";
import { renderWithProviders } from "@/test/render";
import { makeInvoice } from "@/test/factories";

const toBlob = vi.fn(async () => new Blob(["pdf"], { type: "application/pdf" }));
const pdf = vi.fn((element: unknown) => {
  void element;
  return { toBlob };
});
// summary-report-pdf.tsx calls Font.register/StyleSheet.create at module
// load — before any rendering happens — so the mock has to supply those
// too, even though `pdf` is the only export this test exercises directly.
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

const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

const props = {
  invoices: [makeInvoice()],
  brands: [],
};

describe("SummaryReportDialog", () => {
  beforeEach(() => {
    pdf.mockClear();
    toBlob.mockClear();
    toast.mockClear();
    global.URL.createObjectURL = vi.fn(() => "blob:x");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("reports a failed report through the app's toast, not a native alert", async () => {
    // The rest of the app standardised on toasts; a native alert blocks the
    // thread, is unstyled, and can only be observed by spying on window.
    toBlob.mockRejectedValueOnce(new Error("boom"));
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    renderWithProviders(<SummaryReportDialog {...props} />);
    await userEvent.click(screen.getByRole("button", { name: /summary report/i }));
    await userEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.stringMatching(/failed to generate the report/i))
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
