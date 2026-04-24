import { Outlet, NavLink, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sparkles, MessageSquareReply, Mic2, History, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/app", label: "Generate", icon: MessageSquareReply, end: true },
  { to: "/app/voice", label: "Voice", icon: Mic2 },
  { to: "/app/history", label: "History", icon: History },
];

export default function AppShell() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <aside className="fixed inset-y-0 left-0 w-60 border-r border-border bg-card/60 backdrop-blur-sm flex flex-col">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-border">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-soft">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">ReplyKit</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user.email}</div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full justify-start gap-2">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="ml-60 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
