import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrandForm } from "./brand-form";
import { BrandFilterProvider } from "@/components/brand-filter/brand-filter-provider";
import * as storage from "@/lib/storage";
import { MAX_LOGO_BYTES } from "@/lib/brands";
import type { Brand } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// No `<Toaster />` is mounted in these tests, so a toast call never reaches
// the DOM — mock `toast` directly and assert on the call instead.
const toast = vi.fn();
vi.mock("sonner", () => ({
  toast: (...args: unknown[]) => toast(...args),
}));

function renderForm(brand?: Brand) {
  return render(
    <BrandFilterProvider>
      <BrandForm brand={brand} />
    </BrandFilterProvider>
  );
}

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: "b1",
    name: "Sundar Design Co",
    address: "123 MG Road",
    email: "hello@sundar.design",
    invoicePrefix: "SDC",
    nextInvoiceNumber: 1,
    bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
    createdAt: "2026-01-01T00:00:00.000Z",
    accentColor: "#2563eb",
    followup: {
      enabled: true,
      mode: "weekly",
      weekday: 2,
      time: "09:00",
      repeat: "week",
      templateId: "tpl-gentle-nudge",
      stopAfter: 4,
    },
    ...overrides,
  };
}

function imageFile(bytes: number, name = "logo.png", type = "image/png"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function fieldByLabel(label: string): HTMLInputElement {
  return screen.getByText(label).parentElement!.querySelector("input") as HTMLInputElement;
}

describe("BrandForm — logo, phone, PAN", () => {
  beforeEach(() => {
    window.localStorage.clear();
    storage.runMigration();
    push.mockClear();
    toast.mockClear();
  });

  it("round-trips logo, phone and PAN on create", async () => {
    const user = userEvent.setup();
    const { container } = renderForm();

    await user.type(screen.getByPlaceholderText("e.g. Sundar Design Co"), "Acme Studio");
    await user.type(fieldByLabel("Phone"), "+91 90000 00000");
    await user.type(fieldByLabel("PAN number"), "abcde1234f");

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, imageFile(1024));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove logo" })).toBeInTheDocument()
    );

    await user.click(screen.getByRole("button", { name: "Create brand" }));

    const saved = storage.getBrands()[0];
    expect(saved.phone).toBe("+91 90000 00000");
    // Uppercased to match every other PAN/GST/prefix field in this form.
    expect(saved.panNumber).toBe("ABCDE1234F");
    expect(saved.logo).toMatch(/^data:image\/png;base64,/);
  });

  it("preserves logo, phone and PAN when editing without touching them", async () => {
    storage.saveBrand(
      brand({
        phone: "+91 80000 00000",
        panNumber: "ZYXWV9876G",
        logo: "data:image/png;base64,AAAA",
      })
    );
    const user = userEvent.setup();
    renderForm(storage.getBrand("b1")!);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const saved = storage.getBrand("b1")!;
    expect(saved.phone).toBe("+91 80000 00000");
    expect(saved.panNumber).toBe("ZYXWV9876G");
    expect(saved.logo).toBe("data:image/png;base64,AAAA");
  });

  it("clearing a logo actually clears it, not just the preview", async () => {
    storage.saveBrand(brand({ logo: "data:image/png;base64,AAAA" }));
    const user = userEvent.setup();
    renderForm(storage.getBrand("b1")!);

    expect(screen.getByRole("button", { name: "Remove logo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const saved = storage.getBrand("b1")!;
    expect(saved.logo).toBeUndefined();
  });

  it("rejects a non-image file with a toast and leaves the logo unset", () => {
    // `userEvent.upload` filters files against the input's `accept`
    // attribute itself and silently drops a non-matching file before a
    // change event ever fires — bypassed here with `fireEvent.change` so
    // this test actually exercises `validateLogoFile`'s own type check
    // rather than the browser-level picker filter.
    const { container } = renderForm();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: { files: [imageFile(1024, "brand.pdf", "application/pdf")] },
    });

    expect(toast).toHaveBeenCalledWith("Logo must be an image file");
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();
  });

  it("rejects an oversized image with a toast and leaves the logo unset", () => {
    const { container } = renderForm();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [imageFile(MAX_LOGO_BYTES + 1)] } });

    expect(toast).toHaveBeenCalledWith(
      `Logo must be under ${Math.round(MAX_LOGO_BYTES / 1024)}KB`
    );
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();
  });
});
