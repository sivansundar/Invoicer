import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrandForm } from "./brand-form";
import { BrandFilterProvider } from "@/components/brand-filter/brand-filter-provider";
import { renderWithProviders } from "@/test/render";
import { failNext, resetFakeSeam, seed } from "@/test/fake-seam";
import * as storage from "@/lib/storage";
import { MAX_LOGO_SOURCE_BYTES } from "@/lib/brands";
import type { Brand, Invoice } from "@/lib/types";

// Brands live in Postgres now, so this drives the in-memory fake of the seam
// rather than localStorage. See src/test/fake-seam.ts for why a fake and not
// MSW; the real queries are covered by src/test/integration/seam.test.ts.
vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

// `downsampleImage` needs a real canvas, which jsdom does not provide. The
// "BrandForm — logo, phone, PAN" describe block below gives it one via a
// mocked `Image`/canvas pair, because those tests care that the real
// downsample pipeline runs. The "BrandForm — logo upload" describe block
// further down does not — it is about the save path once a data URL exists,
// which `downsampleImage`'s own behaviour (covered in `brands.test.ts`) is
// orthogonal to — so it stubs this one function directly via `chooseLogo`.
// Wrapping the real implementation as the mock's default means every other
// test in this file keeps exercising the genuine canvas pipeline unless it
// opts into the stub.
vi.mock("@/lib/brands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/brands")>();
  return { ...actual, downsampleImage: vi.fn(actual.downsampleImage) };
});

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
  return renderWithProviders(
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
    invoiceDesign: "modern",
    ...overrides,
  };
}

function imageFile(bytes: number, name = "logo.png", type = "image/png"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function fieldByLabel(label: string): HTMLInputElement {
  return screen.getByText(label).parentElement!.querySelector("input") as HTMLInputElement;
}

/** Fills in the one field `handleSubmit` actually requires before it will save. */
async function fillRequiredFields() {
  await userEvent.type(screen.getByPlaceholderText("e.g. Sundar Design Co"), "Acme Studio");
}

/**
 * Picks a file and resolves it to `dataUrl` without touching jsdom's absent
 * canvas — `@/lib/brands` is mocked above with `downsampleImage` wrapped in a
 * `vi.fn`, so this only has to arm its next call rather than fake an `Image`
 * and a canvas context the way the describe block below does.
 */
async function chooseLogo(dataUrl: string) {
  const { downsampleImage } = await import("@/lib/brands");
  vi.mocked(downsampleImage).mockResolvedValueOnce(dataUrl);
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(fileInput, imageFile(1024));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Remove logo" })).toBeInTheDocument()
  );
}

describe("BrandForm — logo, phone, PAN", () => {
  // jsdom has no real image decoder or canvas backend (see the equivalent
  // note in brands.test.ts), so `downsampleImage` — invoked for real here,
  // through the component's own `handleLogoChange`, not mocked away — is
  // given a working `Image`/canvas stand-in for the tests that need a
  // successful upload to complete. Tests that never get past
  // `validateLogoFile` (wrong type / over the source-size cap) don't need
  // this at all.
  const realImage = global.Image;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  const realToDataURL = HTMLCanvasElement.prototype.toDataURL;

  class MockImage {
    naturalWidth = 40;
    naturalHeight = 40;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  beforeEach(() => {
    window.localStorage.clear();
    resetFakeSeam();
    push.mockClear();
    toast.mockClear();

    // @ts-expect-error -- test double, not a full Image implementation
    global.Image = MockImage;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      drawImage: () => {},
    })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,AAAA");
  });

  afterEach(() => {
    global.Image = realImage;
    HTMLCanvasElement.prototype.getContext = realGetContext;
    HTMLCanvasElement.prototype.toDataURL = realToDataURL;
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

    const saved = await waitFor(async () => {
      const [first] = await storage.getBrands();
      expect(first).toBeDefined();
      return first;
    });
    expect(saved.phone).toBe("+91 90000 00000");
    // Uppercased to match every other PAN/GST/prefix field in this form.
    expect(saved.panNumber).toBe("ABCDE1234F");
    // saveBrand uploads a fresh data URL and stores the object path instead
    // of the inline base64 — see `@/lib/storage`'s upload branch.
    expect(saved.logo).toBeUndefined();
    expect(saved.logoPath).toMatch(/\.png$/);
  });

  it("migrates an untouched legacy logo on save, while phone and PAN pass through unchanged", async () => {
    const existing = brand({
      phone: "+91 80000 00000",
      panNumber: "ZYXWV9876G",
      logo: "data:image/png;base64,AAAA",
    });
    seed({ brands: [existing] });
    const user = userEvent.setup();
    renderForm(existing);

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    // The form still only carries `logo` (this task did not touch the UI,
    // see the Phase 3 plan), so re-saving an unmigrated brand submits the
    // same data URL again — which `saveBrand` uploads and migrates to a
    // path, same as a fresh upload would.
    await waitFor(async () => {
      const saved = (await storage.getBrand("b1"))!;
      expect(saved.phone).toBe("+91 80000 00000");
      expect(saved.panNumber).toBe("ZYXWV9876G");
      expect(saved.logo).toBeUndefined();
      expect(saved.logoPath).toMatch(/\.png$/);
    });
  });

  it("clearing a logo actually clears it, not just the preview", async () => {
    const existing = brand({ logo: "data:image/png;base64,AAAA" });
    seed({ brands: [existing] });
    const user = userEvent.setup();
    renderForm(existing);

    expect(screen.getByRole("button", { name: "Remove logo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(async () => {
      expect((await storage.getBrand("b1"))!.logo).toBeUndefined();
    });
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

  it("rejects an oversized source file with a toast and leaves the logo unset", () => {
    const { container } = renderForm();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: { files: [imageFile(MAX_LOGO_SOURCE_BYTES + 1)] },
    });

    expect(toast).toHaveBeenCalledWith(
      `Logo must be under ${Math.round(MAX_LOGO_SOURCE_BYTES / (1024 * 1024))}MB`
    );
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();
  });

  it("does not show a success toast or navigate away when the save itself fails", async () => {
    // Regression coverage for a bug this fix round's own browser check
    // caught: a failed `saveBrand` used to be ignored here — `handleSubmit`
    // toasted success and navigated to `/brands` regardless, which told the
    // user their brand was created when it silently wasn't. The failure is a
    // rejected promise now rather than a `false`, and the handler catches it.
    failNext("saveBrand", "network unreachable");
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("e.g. Sundar Design Co"), "Acme Studio");
    await user.click(screen.getByRole("button", { name: "Create brand" }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith("network unreachable"));
    expect(toast).not.toHaveBeenCalledWith(
      expect.stringContaining("is ready — first invoice will be")
    );
    expect(push).not.toHaveBeenCalled();
    // The typed name must still be on screen — nothing was actually saved,
    // so nothing should have been lost either.
    expect(screen.getByDisplayValue("Acme Studio")).toBeInTheDocument();
  });
});

describe("BrandForm — logo upload", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFakeSeam();
    push.mockClear();
    toast.mockClear();
    // `resetFakeSeam` wipes the in-memory collections but not each mocked
    // function's own call history — the id-reuse test below counts
    // `saveBrand` calls, so a leftover from an earlier test in this file
    // would inflate it.
    vi.mocked(storage.saveBrand).mockClear();
  });

  it("uploads a newly chosen logo and stores the path, not the bytes", async () => {
    renderForm();

    await fillRequiredFields();
    await chooseLogo("data:image/png;base64,aGk=");
    await userEvent.click(screen.getByRole("button", { name: "Create brand" }));

    await waitFor(() => expect(storage.uploadBrandLogo).toHaveBeenCalled());
    const [saved] = await storage.getBrands();
    expect(saved.logoPath).toBeTruthy();
    expect(saved.logo).toBeUndefined();
  });

  it("commits the brand row even when the logo upload fails", async () => {
    // Regression coverage for the non-atomic `saveBrand`: the brand row can
    // commit even though the promise this awaits rejects (see the doc
    // comment on `saveBrand` in `@/lib/storage`, mirrored by the fake's own
    // ordering — `failNext("uploadBrandLogo", ...)` below fails the second
    // write, after the fake's first upsert has already run, so the row is
    // genuinely committed by the time the assertions below run). This file
    // mocks `sonner` and mounts no `<Toaster />` (see the note at the top of
    // this file). `handleSubmit`'s own handling of this rejection
    // (`LogoUploadError`) is a separate concern — see "says the brand saved
    // when only its logo upload failed" below — so this test deliberately
    // does not assert on the failure `toast`/`push` and instead polls
    // storage directly, so it stays about the row surviving underneath the
    // rejected promise, independent of how the form chooses to report that
    // rejection.
    failNext("uploadBrandLogo", "upload failed");
    renderForm();

    await fillRequiredFields();
    await chooseLogo("data:image/png;base64,aGk=");
    await userEvent.click(screen.getByRole("button", { name: "Create brand" }));

    // The row itself is not lost, still carrying its base64 unmigrated — the
    // comment above is a claim, this is what actually proves it.
    const [committed] = await waitFor(async () => {
      const brands = await storage.getBrands();
      expect(brands).toHaveLength(1);
      return brands;
    });
    expect(committed.logo).toBe("data:image/png;base64,aGk=");
    expect(committed.logoPath).toBeUndefined();
    // Whatever `handleSubmit` says about the logo, it must not be the
    // unqualified success toast — that would claim the logo made it too.
    expect(toast).not.toHaveBeenCalledWith(
      expect.stringContaining("is ready — first invoice will be")
    );
  });

  it("says the brand saved when only its logo upload failed", async () => {
    // saveBrand commits the row before it uploads. Reporting that rejection
    // as "couldn't save" sends the user back to retype fields that are
    // already in the database.
    //
    // Asserted against the exact user-facing string, not a loose pattern:
    // `LogoUploadError`'s own message ("Saved, but the logo could not be
    // uploaded") also matches /saved, but the logo/i, so a pattern here
    // would keep passing even if `handleSubmit` stopped special-casing
    // `LogoUploadError` and fell through to its generic `err.message`
    // fallback instead — which is exactly the regression this test exists
    // to catch.
    failNext("uploadBrandLogo", "bucket unreachable");
    renderForm();

    await fillRequiredFields();
    await chooseLogo("data:image/png;base64,aGk=");
    await userEvent.click(screen.getByRole("button", { name: "Create brand" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "Acme Studio saved, but the logo couldn't be uploaded — replace it to try again"
      )
    );
    expect(toast).not.toHaveBeenCalledWith(expect.stringMatching(/couldn't save this brand/i));
    expect(push).toHaveBeenCalledWith("/brands");
  });

  it("reuses the same brand id when retrying after a failed upload, so the already-committed row is updated rather than orphaned", async () => {
    // Arms `uploadBrandLogo`, not `saveBrand` itself, so this exercises the
    // exact non-atomic sequence the doc comment on the real `saveBrand`
    // describes: the fake's first upsert commits the row (base64 and all)
    // before the upload — which fails here — ever runs. A retry that
    // generated a fresh id instead of reusing it would insert a SECOND row
    // rather than update the first, leaving the committed one an orphan —
    // present, invisible to the user, still holding the base64 the failed
    // upload never cleared.
    failNext("uploadBrandLogo", "upload failed");
    renderForm();

    await fillRequiredFields();
    await chooseLogo("data:image/png;base64,aGk=");
    await userEvent.click(screen.getByRole("button", { name: "Create brand" }));

    // The row is already committed at this point, non-atomically, exactly
    // as `saveBrand`'s own doc comment describes. Polling storage directly —
    // rather than waiting on `toast`/`push` — keeps this test about id
    // reuse, not about how `handleSubmit` reports the rejection (see "says
    // the brand saved when only its logo upload failed" for that).
    const afterFirstAttempt = await waitFor(async () => {
      const brands = await storage.getBrands();
      expect(brands).toHaveLength(1);
      return brands;
    });
    expect(afterFirstAttempt[0].logo).toBe("data:image/png;base64,aGk=");

    // The first attempt's own `LogoUploadError` handling already called
    // `push("/brands")` (see "says the brand saved when only its logo
    // upload failed"), so waiting on that same call again below would be a
    // no-op assertion satisfied before the retry even happens. Cleared here
    // so the wait below can only pass once the retry itself calls it.
    push.mockClear();

    // The retry's upload is not armed to fail, so this attempt succeeds.
    await userEvent.click(screen.getByRole("button", { name: "Create brand" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/brands"));

    const afterRetry = await storage.getBrands();
    // Still exactly one row, same id, now migrated — the retry updated the
    // committed row in place instead of inserting an orphan alongside it.
    expect(afterRetry).toHaveLength(1);
    expect(afterRetry[0].id).toBe(afterFirstAttempt[0].id);
    expect(afterRetry[0].logoPath).toBeTruthy();
    expect(afterRetry[0].logo).toBeUndefined();
  });

  it("gives two separate create-form mounts different ids, so concurrent drafts never collide", async () => {
    // The id-reuse fix above relies on `brandId` being computed once per
    // component instance (a lazily-initialized `useRef`), not once ever —
    // that distinction is invisible from a single mount's perspective, which
    // is all the tests above exercise. Two independent create flows (two
    // browser tabs, or one after another) must still land on different ids;
    // a module-level constant or a memoised/hoisted ref would pass every
    // test above while silently making every brand created in this session
    // collide on the very first save.
    const first = renderForm();
    await userEvent.type(screen.getByPlaceholderText("e.g. Sundar Design Co"), "First Co");
    await userEvent.click(screen.getByRole("button", { name: "Create brand" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/brands"));
    first.unmount();

    push.mockClear();
    const second = renderForm();
    await userEvent.type(screen.getByPlaceholderText("e.g. Sundar Design Co"), "Second Co");
    await userEvent.click(screen.getByRole("button", { name: "Create brand" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/brands"));
    second.unmount();

    const brands = await storage.getBrands();
    expect(brands).toHaveLength(2);
    expect(brands[0].id).not.toBe(brands[1].id);
  });

  it("clearing an already-migrated, path-only logo actually clears it, not just the local preview", async () => {
    // The companion to "clearing a logo actually clears it" above, but for a
    // brand that has already been migrated to Storage — `logo` is unset and
    // only `logoPath` carries the object. `handleRemoveLogo` clearing only
    // `logo` (and leaving `logoPath` behind) would resave the brand with its
    // old logo still attached; this is the exact bug the two-state design in
    // the brief exists to prevent.
    const existing = brand({ logo: undefined, logoPath: "b1/abc.png" });
    seed({ brands: [existing] });
    renderForm(existing);

    expect(screen.getByRole("button", { name: "Remove logo" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove logo" }));
    expect(screen.getByRole("button", { name: "Upload logo" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(async () => {
      const saved = (await storage.getBrand("b1"))!;
      expect(saved.logo).toBeUndefined();
      expect(saved.logoPath).toBeUndefined();
    });
  });
});

describe("BrandForm — invoice preview", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetFakeSeam();
    push.mockClear();
    toast.mockClear();
  });

  // The two designs are told apart by a label only one of them renders:
  // "Billed to" is Modern's client heading, "Description" is Classic's item
  // table column header. Asserting on those rather than a test id keeps the
  // check honest — it fails if the design stops rendering its own layout.
  const MODERN_MARKER = "Billed to";
  const CLASSIC_MARKER = "Description";

  function seedInvoice(overrides: Partial<Invoice> = {}): Invoice {
    const invoice: Invoice = {
      id: "i1",
      invoiceNumber: "SDC-2026-007",
      brandId: "b1",
      currency: "INR",
      status: "sent",
      billDate: "2026-05-01",
      dueDate: "2026-05-15",
      client: { companyName: "Harbourline Foods", address: "9 Dock Street" },
      items: [{ id: "l1", description: "Retainer", amount: 50000, tax: 18 }],
      subtotal: 50000,
      totalTax: 9000,
      total: 59000,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      brandSnapshot: {
        name: "Whatever The Brand Was Called Then",
        address: "An old address",
        invoicePrefix: "SDC",
        accentColor: "#2563eb",
        bankDetails: { accountName: "", accountNumber: "", bankName: "", ifscCode: "" },
        invoiceDesign: "classic",
      },
      clientId: null,
      reminders: [],
      followupsPaused: false,
      ...overrides,
    };
    seed({ invoices: [invoice] });
    return invoice;
  }

  it("renders the brand's chosen design and swaps when the chooser changes", async () => {
    const user = userEvent.setup();
    renderForm(brand({ invoiceDesign: "modern" }));

    expect(screen.getByText(MODERN_MARKER)).toBeInTheDocument();
    expect(screen.queryByText(CLASSIC_MARKER)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Classic" }));

    expect(screen.getByText(CLASSIC_MARKER)).toBeInTheDocument();
    expect(screen.queryByText(MODERN_MARKER)).not.toBeInTheDocument();

    // And back again — the swap is not one-way.
    await user.click(screen.getByRole("radio", { name: "Modern" }));

    expect(screen.getByText(MODERN_MARKER)).toBeInTheDocument();
  });

  it("starts on the saved brand's design, not the default", () => {
    renderForm(brand({ invoiceDesign: "classic" }));

    expect(screen.getByText(CLASSIC_MARKER)).toBeInTheDocument();
  });

  it("updates the previewed brand details as they are typed", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("e.g. Sundar Design Co"), "Acme Studio");

    // Twice: once in the name field's own value, once in the preview header.
    // `getByText` skips input values, so this is the preview's copy.
    expect(screen.getByText("Acme Studio")).toBeInTheDocument();
  });

  it("derives the sample invoice number from the prefix being typed", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("auto"), "acme");

    expect(screen.getByText("ACME-2026-001")).toBeInTheDocument();
  });

  it("previews sample contents for a brand that has never invoiced", () => {
    renderForm(brand());

    expect(screen.getByText(/Sample invoice/)).toBeInTheDocument();
    expect(screen.getByText("Northwind Studio")).toBeInTheDocument();
  });

  it("previews the brand's latest invoice when it has one", async () => {
    seedInvoice();
    renderForm(brand());

    // The invoice list is fetched now, so the preview swaps from sample data
    // to the real invoice only once that query resolves.
    expect(await screen.findByText("Harbourline Foods")).toBeInTheDocument();
    // Twice over: the pane's subtitle names which invoice is being shown, and
    // the document itself carries the number.
    expect(screen.getByText(/Your latest invoice, SDC-2026-007/)).toBeInTheDocument();
    expect(screen.getAllByText(/SDC-2026-007/).length).toBeGreaterThan(1);
    // The sample data must be gone, not merged in alongside.
    expect(screen.queryByText("Northwind Studio")).not.toBeInTheDocument();
  });

  it("previews the latest invoice's contents with the live brand, not its frozen snapshot", async () => {
    // The whole point of previewing on the brand form: a real invoice supplies
    // the body, but the brand half must be what you are editing right now —
    // otherwise changing a design or an address would appear to do nothing.
    seedInvoice();
    const user = userEvent.setup();
    renderForm(brand({ name: "Sundar Design Co", invoiceDesign: "modern" }));

    expect(screen.queryByText("Whatever The Brand Was Called Then")).not.toBeInTheDocument();
    // The stored snapshot says "classic"; the live brand says "modern".
    expect(screen.getByText(MODERN_MARKER)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Classic" }));
    expect(screen.getByText(CLASSIC_MARKER)).toBeInTheDocument();
  });

  it("ignores another brand's invoices", () => {
    seedInvoice({ brandId: "someone-else" });
    renderForm(brand());

    expect(screen.getByText(/Sample invoice/)).toBeInTheDocument();
    expect(screen.queryByText("Harbourline Foods")).not.toBeInTheDocument();
  });
});
