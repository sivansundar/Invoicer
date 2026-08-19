"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  ChartNoAxesColumn,
  CornerDownLeft,
  FileText,
  LayoutDashboard,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/ui/primitives";
import { useBrands } from "@/hooks/use-brands";
import { useClients } from "@/hooks/use-clients";
import { useInvoices } from "@/hooks/use-invoices";
import { FEATURES } from "@/lib/features";
import {
  buildCommandGroups,
  capNote,
  flattenGroups,
  resultSummary,
  type CommandItem,
} from "@/lib/command-search";
import { cn } from "@/lib/utils";

/**
 * Whether a keystroke landed somewhere the user is composing text. A bare
 * `/` shortcut that fires while someone is typing a client's address would
 * eat the character and open a dialog over the form they were filling in.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * `/` opens the palette; ⌘K / Ctrl+K does too, for the muscle memory people
 * bring from other apps.
 *
 * Ctrl, Meta and Alt held with `/` are somebody else's shortcut and are left
 * alone. Shift is deliberately not in that list: on a German or French
 * layout `/` *is* a shifted key, and refusing it there would leave those
 * keyboards with no `/` shortcut at all. On a US layout Shift+/ reports `?`,
 * so nothing is caught by accident either way.
 */
export function shouldOpenPalette(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) return true;
  if (event.key !== "/") return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  return !isTypingTarget(event.target);
}

const NAV_ICONS: { prefix: string; icon: typeof FileText }[] = [
  { prefix: "/invoices", icon: FileText },
  { prefix: "/clients", icon: Users },
  { prefix: "/brands", icon: Building2 },
  { prefix: "/followups", icon: Bell },
  { prefix: "/reports", icon: ChartNoAxesColumn },
  { prefix: "/dashboard", icon: LayoutDashboard },
];

/**
 * The glyph the sidebar already uses for that destination, so a row in the
 * palette and the nav item it leads to are recognisably the same place.
 *
 * A component rather than a function returning one — see `PageIcon` in
 * site-header.tsx for the same reason.
 */
function RowIcon({ item }: { item: CommandItem }) {
  const className = "size-4 shrink-0 text-ink-2";
  if (item.group === "actions" && item.href.endsWith("/create"))
    return <Plus className={className} />;
  const entry = NAV_ICONS.find((candidate) => item.href.startsWith(candidate.prefix));
  if (!entry) return <Search className={className} />;
  return <entry.icon className={className} />;
}

function Row({
  item,
  active,
  onSelect,
  onHover,
}: {
  item: CommandItem;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <div
      id={item.id}
      role="option"
      aria-selected={active}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2",
        active && "bg-field"
      )}
    >
      <RowIcon item={item} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate",
            item.group === "invoices" ? "font-mono text-[13px]" : "text-sm"
          )}
        >
          {item.label}
        </span>
        {item.sub && <span className="block truncate text-[12.5px] text-ink-3">{item.sub}</span>}
      </span>
      {item.amount && (
        <span className="shrink-0 text-sm font-medium tabular-nums">{item.amount}</span>
      )}
      {item.status && <StatusPill status={item.status} />}
    </div>
  );
}

/**
 * The sidebar's search field used to be a link to /invoices wearing a `/`
 * hint that no key handler backed. This is what that field now opens.
 *
 * Everything it lists is a real record read through the same hooks the rest
 * of the app reads — the matching and the caps live in `@/lib/command-search`
 * so this component only wires state to markup.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!shouldOpenPalette(event)) return;
      event.preventDefault();
      onOpenChange(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          // Radix parks focus on the dialog itself otherwise, and the first
          // thing typed after the shortcut would go nowhere.
          event.preventDefault();
          inputRef.current?.focus();
        }}
        className="top-[12%] w-[560px] max-w-[calc(100%-2rem)] translate-y-0 gap-0 overflow-hidden rounded-card border bg-surface p-0 sm:max-w-[560px]"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Find an invoice, client or brand, or jump to a screen.
        </DialogDescription>
        {/* Radix drops the content on close, so the query and the highlighted
            row are state that starts clean on every open — a palette that
            reopens on the last search answers a question you stopped asking. */}
        <PaletteBody inputRef={inputRef} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PaletteBody({
  inputRef,
  onClose,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const { invoices } = useInvoices();
  const { clients } = useClients();
  const { brands } = useBrands();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () => buildCommandGroups({ query, invoices, clients, brands, features: FEATURES }),
    [query, invoices, clients, brands]
  );
  const items = useMemo(() => flattenGroups(groups), [groups]);
  const active = items[Math.min(activeIndex, items.length - 1)];

  useEffect(() => {
    if (!active) return;
    listRef.current
      ?.querySelector(`#${CSS.escape(active.id)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const select = (item: CommandItem) => {
    onClose();
    router.push(item.href);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + items.length) % items.length);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      select(active);
    }
  };

  return (
    <>
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b px-4">
        <Search className="size-[17px] shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded
          aria-controls="command-palette-results"
          aria-activedescendant={active?.id}
          aria-label="Search invoices, clients and brands"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Search invoices, clients and brands"
          className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-3"
        />
        <kbd className="inline-flex h-[22px] shrink-0 items-center rounded-md border bg-field px-1.5 font-sans text-[11.5px] font-medium text-ink-2">
          Esc
        </kbd>
      </div>

      <div
        ref={listRef}
        id="command-palette-results"
        role="listbox"
        aria-label="Results"
        className="max-h-[380px] overflow-y-auto p-2"
      >
        {groups.map((group) => {
          const note = capNote(group);
          return (
            <div key={group.key} role="group" aria-labelledby={`command-group-${group.key}`}>
              <div
                id={`command-group-${group.key}`}
                className="px-2.5 pt-2 pb-1 text-[12.5px] font-medium text-ink-3"
              >
                {group.label}
              </div>
              {group.items.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  active={item.id === active?.id}
                  onSelect={() => select(item)}
                  onHover={() => setActiveIndex(items.indexOf(item))}
                />
              ))}
              {note && <p className="px-2.5 pt-1 pb-1.5 text-[12.5px] text-ink-3">{note}</p>}
            </div>
          );
        })}

        {items.length === 0 && (
          <p className="px-2.5 py-6 text-center text-[13.5px] text-ink-2">
            No invoice, client or brand matches “{query.trim()}”.
          </p>
        )}
      </div>

      <div className="flex h-[38px] shrink-0 items-center gap-4 border-t bg-surface-2 px-3.5 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <CornerDownLeft className="size-3.5" />
          to open
        </span>
        <span>↑↓ to move</span>
        <span className="flex-1" />
        <span>{resultSummary(groups)}</span>
      </div>
    </>
  );
}
