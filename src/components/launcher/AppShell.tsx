import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
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
  Sun,
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
import { supabase } from "@/integrations/supabase/client";

type NavItem = { to: "/dashboard" | "/admin" | "/users"; label: string; icon: typeof LayoutGrid; adminOnly?: boolean };
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Launcher", icon: LayoutGrid },
  { to: "/admin", label: "Settings", icon: Cog, adminOnly: true },
  { to: "/users", label: "Users", icon: Users, adminOnly: true },
];
const NAV_DISABLED = [
  { label: "Reports", icon: Building2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { org, orgs, setOrgId, persona, isAdmin, signedIn } = useLauncher();
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.navigate({ to: "/auth", replace: true });
  };

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
          {NAV.filter((i) => !i.adminOnly || isAdmin).map((item) => {
            const active = pathname === item.to;
            const cls = cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            );
            return (
              <Link key={item.to} to={item.to} className={cls}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {NAV_DISABLED.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/50",
                "cursor-not-allowed",
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{item.label}</span>
              <span className="rounded bg-sidebar-accent/60 px-1.5 py-0.5 text-[9px] uppercase tracking-widest">Soon</span>
            </button>
          ))}
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
              <DropdownMenuLabel>Switch Organisation</DropdownMenuLabel>
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

            {!signedIn ? (
              <Button asChild size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            ) : (
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
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{persona.name}</span>
                  <span className="text-xs text-muted-foreground">{persona.email}</span>
                  <span className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {ROLE_LABEL[persona.role]}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            )}
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

