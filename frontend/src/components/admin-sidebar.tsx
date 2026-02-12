"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Users,
  Activity,
  Languages,
  Server,
  Bell,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const adminNav = [
  { title: "Genel Bakış", href: "/admin", icon: BarChart3 },
  { title: "Kullanıcılar", href: "/admin/users", icon: Users },
  { title: "İşler & Kuyruk", href: "/admin/jobs", icon: Activity },
  { title: "Çeviri Motorları", href: "/admin/engines", icon: Languages },
  { title: "Sistem Ayarları", href: "/admin/system", icon: Server },
  { title: "Bildirimler", href: "/admin/notifications", icon: Bell },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Admin Panel">
              <Link href="/admin">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">Admin Panel</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Sistem Yönetimi
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Yönetim</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Siteye Dön">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span className="truncate">Siteye Dön</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
