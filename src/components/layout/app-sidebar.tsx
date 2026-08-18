"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  ChartNoAxesColumn,
  ChevronUp,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  LayoutPanelLeft,
  Search,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { BrandSwitcher } from "./brand-switcher";
import { PlanCard } from "./plan-card";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useBrands } from "@/hooks/use-brands";
import { useClients } from "@/hooks/use-clients";
import { useInvoices } from "@/hooks/use-invoices";
import { FEATURES } from "@/lib/features";

interface NavItem {
  label: string;
  icon: typeof LayoutDashboard;
  href: string;
  flag?: keyof typeof FEATURES;
  /** Rendered right-aligned: a plain count, or a blue badge when `emphasis`. */
  count?: number;
  emphasis?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Six flat destinations became three labelled groups, so the list reads as a
 * hierarchy rather than a pile.
 *
 * "Invoices" points at /invoices — a real list. It used to point at
 * /invoices/create, so a nav item named after a noun performed a create
 * action; creating now lives on the header's primary button.
 */
function navGroups(counts: {
  invoices: number;
  brands: number;
  clients: number;
  followups: number;
}): NavGroup[] {
  return [
    {
      label: "Essentials",
      items: [
        { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
        {
          label: "Follow-ups",
          icon: Bell,
          href: "/followups",
          flag: "followups",
          count: counts.followups,
          emphasis: true,
        },
      ],
    },
    {
      label: "Work",
      items: [
        { label: "Invoices", icon: FileText, href: "/invoices", count: counts.invoices },
        { label: "Brands", icon: Building2, href: "/brands", count: counts.brands },
        { label: "Clients", icon: Users, href: "/clients", count: counts.clients },
      ],
    },
    {
      label: "Measure",
      items: [{ label: "Reports", icon: ChartNoAxesColumn, href: "/reports" }],
    },
  ];
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      data-active={active || undefined}
      className={cn(
        "flex h-[38px] items-center gap-[11px] rounded-[10px] px-[11px] text-[14.5px] tracking-[-0.005em] transition-colors",
        active
          ? "border bg-surface font-medium text-ink shadow-[var(--shadow-pill)]"
          : "text-ink-2 hover:text-ink"
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-ink" : "text-ink-2")} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.count != null && item.count > 0 && (
        <span
          className={cn(
            "shrink-0 tabular-nums",
            item.emphasis
              ? "inline-flex h-[21px] min-w-[21px] items-center justify-center rounded-full bg-blue px-1.5 text-xs font-semibold text-white"
              : "text-[13px] text-ink-3"
          )}
        >
          {item.count}
        </span>
      )}
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { invoices } = useInvoices();
  const { brands } = useBrands();
  const { clients } = useClients();

  // Reminders only ever go out for an unpaid invoice on a live schedule, so
  // this counts the same population the follow-ups queue does rather than
  // every invoice.
  const followupCount = invoices.filter(
    (invoice) =>
      (invoice.status === "sent" || invoice.status === "overdue") && !invoice.followupsPaused
  ).length;

  const groups = navGroups({
    invoices: invoices.length,
    brands: brands.length,
    clients: clients.length,
    followups: followupCount,
  }).map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.flag || FEATURES[item.flag]),
  }));

  return (
    <Sidebar collapsible="icon" className="bg-canvas">
      <SidebarHeader className="gap-0 border-b p-0">
        <div className="flex items-center gap-2 p-3">
          <div className="min-w-0 flex-1">
            <BrandSwitcher />
          </div>
          <SidebarTrigger className="size-8 shrink-0 text-ink-2" />
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        <div className="px-3 pt-3.5">
          <Link
            href="/invoices"
            className="flex h-10 items-center gap-2.5 rounded-[11px] bg-field px-3 text-[14.5px] text-ink-3 transition-colors hover:text-ink-2"
          >
            <Search className="size-[17px]" />
            <span className="flex-1">Search</span>
            <span className="inline-flex size-[22px] items-center justify-center rounded-md border bg-surface text-xs">
              /
            </span>
          </Link>
        </div>

        {groups.map((group, index) => (
          <div key={group.label}>
            {index > 0 && <div className="h-px bg-line" />}
            <div className="flex flex-col gap-0.5 px-3 py-3.5">
              <div className="flex h-[26px] items-center justify-between px-[11px]">
                <span className="text-[13px] font-medium tracking-[-0.005em] text-ink-3">
                  {group.label}
                </span>
                <ChevronUp className="size-[15px] text-ink-3" />
              </div>
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} active={isNavItemActive(pathname, item.href)} />
              ))}
            </div>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter className="gap-1 p-3">
        {FEATURES.billing && <PlanCard />}
        <div className="flex items-center gap-[11px] rounded-[10px] px-[11px] py-2 text-[14.5px] text-ink-2">
          <LayoutPanelLeft className="size-[18px]" />
          <span className="flex-1">Appearance</span>
          <ThemeToggle />
        </div>
        <div className="flex h-[38px] items-center gap-[11px] rounded-[10px] px-[11px] text-[14.5px] text-ink-2">
          <LifeBuoy className="size-[18px]" />
          <span className="flex-1">Help &amp; support</span>
        </div>
        <UserMenu />
      </SidebarFooter>
    </Sidebar>
  );
}
