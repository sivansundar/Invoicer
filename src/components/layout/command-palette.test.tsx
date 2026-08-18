import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette, isTypingTarget, shouldOpenPalette } from "./command-palette";
import { AppSidebar } from "./app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { BrandFilterProvider } from "@/components/brand-filter/brand-filter-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { renderWithProviders } from "@/test/render";
import { resetFakeSeam, seed } from "@/test/fake-seam";
import { makeInvoice, validBrand, validClient } from "@/test/factories";
import { commandActions } from "@/lib/command-search";
import { FEATURES } from "@/lib/features";

vi.mock("@/lib/storage", () => import("@/test/fake-seam"));

// jsdom implements no layout, so it ships no `scrollIntoView` at all. The
// palette keeps the active row in view with it; without this stub the throw
// happens inside an effect and React tears the whole tree down, which looks
// like the dialog never rendered.
Element.prototype.scrollIntoView = vi.fn();

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/dashboard",
}));

function key(init: Partial<KeyboardEvent> & { key: string }, target?: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { bubbles: true, ...init });
  if (target) Object.defineProperty(event, "target", { value: target });
  return event;
}

describe("shouldOpenPalette", () => {
  it("opens on a bare slash", () => {
    expect(shouldOpenPalette(key({ key: "/" }, document.body))).toBe(true);
  });

  it("stays out of the way while the user is composing text", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    // jsdom does not implement `isContentEditable`, which is what the guard
    // actually reads — the attribute alone leaves it false.
    Object.defineProperty(editable, "isContentEditable", { value: true });

    expect(shouldOpenPalette(key({ key: "/" }, input))).toBe(false);
    expect(shouldOpenPalette(key({ key: "/" }, textarea))).toBe(false);
    expect(shouldOpenPalette(key({ key: "/" }, editable))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
  });

  it("leaves a slash with a modifier to whoever else claimed it", () => {
    expect(shouldOpenPalette(key({ key: "/", metaKey: true }, document.body))).toBe(false);
    expect(shouldOpenPalette(key({ key: "/", ctrlKey: true }, document.body))).toBe(false);
    expect(shouldOpenPalette(key({ key: "/", altKey: true }, document.body))).toBe(false);
    // Shift is not a modifier here: on several layouts `/` is a shifted key.
    expect(shouldOpenPalette(key({ key: "/", shiftKey: true }, document.body))).toBe(true);
  });

  it("opens on ⌘K or Ctrl+K, typing or not", () => {
    const input = document.createElement("input");
    expect(shouldOpenPalette(key({ key: "k", metaKey: true }, document.body))).toBe(true);
    expect(shouldOpenPalette(key({ key: "K", ctrlKey: true }, input))).toBe(true);
    expect(shouldOpenPalette(key({ key: "k" }, document.body))).toBe(false);
  });
});

const invoices = [
  makeInvoice({
    id: "i1",
    invoiceNumber: "AC-014",
    client: { companyName: "Northwind", address: "" },
    createdAt: "2026-07-01T00:00:00.000Z",
  }),
  makeInvoice({
    id: "i2",
    invoiceNumber: "AC-013",
    client: { companyName: "Avara Labs", address: "" },
    createdAt: "2026-06-01T00:00:00.000Z",
  }),
];

function options() {
  return screen.getAllByRole("option").map((option) => option.textContent);
}

describe("CommandPalette", () => {
  beforeEach(() => {
    resetFakeSeam();
    push.mockClear();
    seed({
      invoices,
      clients: [validClient({ id: "c1", companyName: "Northwind" })],
      brands: [validBrand({ id: "b1", name: "Studio Cadence" })],
    });
  });

  it("opens on the actions and the most recent invoices, with focus in the field", async () => {
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(await screen.findByText("Recent invoices")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveFocus();
    // Proves the real flags are forwarded: a destination FEATURES hides is
    // not listed here either.
    for (const action of commandActions(FEATURES)) {
      expect(screen.getByText(action.label)).toBeInTheDocument();
    }
    expect(options().some((text) => text?.includes("AC-014"))).toBe(true);
  });

  it("matches an invoice by number and by client name, and a brand by its own", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />);
    await screen.findByText("Recent invoices");

    await user.type(screen.getByRole("combobox"), "avara");
    await waitFor(() => expect(options()).toHaveLength(1));
    expect(options()[0]).toContain("AC-013");

    await user.clear(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "cadence");
    await waitFor(() => expect(screen.getByText("Brands")).toBeInTheDocument());
    expect(options()[0]).toContain("Studio Cadence");
  });

  it("says so plainly when nothing matches", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />);
    await screen.findByText("Recent invoices");

    await user.type(screen.getByRole("combobox"), "zzzz");

    expect(await screen.findByText(/No invoice, client or brand matches/)).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("says how many were held back rather than truncating in silence", async () => {
    seed({
      invoices: Array.from({ length: 7 }, (_, index) =>
        makeInvoice({
          id: `many-${index}`,
          invoiceNumber: `MN-00${index}`,
          createdAt: `2026-0${index + 1}-01T00:00:00.000Z`,
        })
      ),
    });
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />);
    await screen.findByText("Recent invoices");

    await user.type(screen.getByRole("combobox"), "MN-");

    expect(
      await screen.findByText("Showing 5 of 7 — type to narrow the list")
    ).toBeInTheDocument();
    expect(screen.getByText("5 of 7 results")).toBeInTheDocument();
  });

  it("walks the list with the arrow keys and opens the active row on Enter", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(<CommandPalette open onOpenChange={onOpenChange} />);
    await screen.findByText("Recent invoices");

    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-activedescendant", "action:new-invoice");

    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", "action:new-client");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    // Wraps to the end of the flattened list rather than sticking at the top.
    expect(input).toHaveAttribute("aria-activedescendant", "invoice:i2");

    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/invoices/i2");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("opens the record a click lands on", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette open onOpenChange={vi.fn()} />);
    await screen.findByText("Recent invoices");

    await user.click(screen.getByText("AC-014"));

    expect(push).toHaveBeenCalledWith("/invoices/i1");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(<CommandPalette open onOpenChange={onOpenChange} />);
    await screen.findByText("Recent invoices");

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks to open on the shortcut, and not while the field of another form has focus", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { container } = renderWithProviders(
      <>
        <input aria-label="Some other field" />
        <CommandPalette open={false} onOpenChange={onOpenChange} />
      </>
    );

    await user.keyboard("/");
    expect(onOpenChange).toHaveBeenCalledWith(true);

    onOpenChange.mockClear();
    await user.click(screen.getByLabelText("Some other field"));
    await user.keyboard("/");
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(within(container).getByLabelText("Some other field")).toHaveValue("/");
  });
});

describe("AppSidebar search field", () => {
  beforeEach(() => {
    resetFakeSeam();
    push.mockClear();
    window.localStorage.clear();
    seed({ invoices });
  });

  it("opens the palette instead of navigating", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ThemeProvider>
        <BrandFilterProvider>
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        </BrandFilterProvider>
      </ThemeProvider>
    );

    const search = await screen.findByRole("button", { name: /search/i });
    expect(search).not.toHaveAttribute("href");

    await user.click(search);

    expect(await screen.findByRole("combobox")).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
  });
});
