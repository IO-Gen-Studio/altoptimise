import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  ChevronDown,
  Cog,
  Database,
  Droplets,
  Flame,
  LayoutGrid,
  LogOut,
  Shield,
  Sun,
  User,
  Users,
  Zap,
} from "lucide-react";
import { type ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, useLauncher } from "@/lib/launcher-context";

const NAV = [
  { to: "/" as const, label: "Launcher", icon: LayoutGrid, disabled: false },
  { to: "/organisations", label: "Organisations", icon: Building2, disabled: true },
  { to: "/users", label: "Users", icon: Users, disabled: true },
  { to: "/settings", label: "Settings", icon: Cog, disabled: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { org, orgs, setOrgId, persona, personas, setPersonaId } = useLauncher();

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-[image:var(--gradient-brand)] text-white shadow-sm">
            <Zap className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">Optimise</div>
            <div className="text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
              Energy Suite
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const cls = cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              item.disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
            );
            if (item.disabled) {
              return (
                <button key={item.to} type="button" className={cls} disabled>
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <span className="rounded bg-sidebar-accent/60 px-1.5 py-0.5 text-[9px] uppercase tracking-widest">
                    Soon
                  </span>
                </button>
              );
            }
            return (
              <Link key={item.to} to="/" className={cls}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="rounded-md bg-sidebar-accent/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/70">
              <Database className="h-3.5 w-3.5" /> Data Streams
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-[11px]">
              <StreamPill icon={Zap} label="Electricity" />
              <StreamPill icon={Flame} label="Gas" />
              <StreamPill icon={Droplets} label="Water" />
              <StreamPill icon={Sun} label="Solar PV" />
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
          {/* Org switcher */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-9 gap-2 pr-2">
                <Building2 className="h-4 w-4 text-primary" />
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Organisation
                  </span>
                  <span className="text-sm font-medium">{org.name}</span>
                </div>
                <ChevronDown className="ml-1 h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Switch organisation</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={org.id} onValueChange={setOrgId}>
                {orgs.map((o) => (
                  <DropdownMenuRadioItem key={o.id} value={o.id}>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{o.name}</span>
                      <span className="text-xs text-muted-foreground">{o.location}</span>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-2 hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 lg:flex">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            All data streams connected
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="hidden gap-1 md:inline-flex">
              <Activity className="h-3 w-3" /> Live
            </Badge>

            {/* Persona switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-10 gap-2 pl-2 pr-3">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                      {persona.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden flex-col items-start leading-tight md:flex">
                    <span className="text-sm font-medium">{persona.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {ROLE_LABEL[persona.role]}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Test as persona</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={persona.id} onValueChange={setPersonaId}>
                  {personas.map((p) => (
                    <DropdownMenuRadioItem key={p.id} value={p.id}>
                      <div className="flex w-full items-center justify-between gap-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.email}</span>
                        </div>
                        <RoleBadge role={p.role} />
                      </div>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Shield className="mr-2 h-4 w-4" /> Permissions
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

function StreamPill({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-sidebar/60 px-2 py-1">
      <Icon className="h-3 w-3 text-primary" />
      <span className="truncate">{label}</span>
      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" />
    </div>
  );
}

function RoleBadge({ role }: { role: import("@/lib/launcher-context").Role }) {
  const map = {
    super_admin: "bg-primary/15 text-primary",
    data_analyst: "bg-blue-500/15 text-blue-600",
    viewer: "bg-muted text-muted-foreground",
  } as const;
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", map[role])}>
      {ROLE_LABEL[role]}
    </span>
  );
}