"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  Building2,
  ChartNoAxesColumn,
  CirclePlus,
  FileText,
  LayoutDashboard,
  Mail,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { BrandSwitcher } from "./brand-switcher";
import { PlanCard } from "./plan-card";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  { label: "Invoices", icon: FileText, href: "/invoices/create" },
  { label: "Brands", icon: Building2, href: "/brands" },
  { label: "Clients", icon: Users, href: "/clients" },
  { label: "Follow-ups", icon: Bell, href: "/followups" },
  { label: "Reports", icon: ChartNoAxesColumn, href: "/reports" },
];

// The current user is a static local record — there is no auth in this build.
const LOCAL_USER = { name: "Sivan", email: "hello@sivansundar.com" };

function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") {
    if (pathname === "/") return true;
    // Dashboard is also active on an invoice's detail page, e.g. /invoices/abc123
    // (but not /invoices/create or /invoices/abc123/edit).
    return /^\/invoices\/[^/]+$/.test(pathname) && pathname !== "/invoices/create";
  }

  const base = href === "/invoices/create" ? "/invoices" : href;
  return pathname.startsWith(base);
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <BrandSwitcher />
        <div className="flex items-center gap-2 px-0">
          <Link href="/invoices/create" className="flex-1">
            <Button size="sm" className="h-8 w-full gap-1.5">
              <CirclePlus className="h-4 w-4" />
              Quick create
            </Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            title="Inbox"
            onClick={() => toast("Inbox lives just outside this build")}
          >
            <Mail className="h-4 w-4" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {NAV_ITEMS.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={isNavItemActive(pathname, item.href)}>
                <Link href={item.href}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <PlanCard />
        <div className="flex items-center gap-2 p-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-accent text-xs font-medium">
            {LOCAL_USER.name.charAt(0)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{LOCAL_USER.name}</span>
            <span className="truncate text-xs text-muted-foreground">{LOCAL_USER.email}</span>
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
