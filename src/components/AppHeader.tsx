import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";

export function AppHeader({ subtitle, action }: { subtitle?: string; action?: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <header className="glass sticky top-0 z-30 flex items-center justify-between gap-4 rounded-2xl px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          {profile?.role === "admin" ? <Shield className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{subtitle ?? "Workspace"}</p>
          <h1 className="truncate text-base font-semibold sm:text-lg">
            Welcome, <span className="text-primary">{profile?.display_name ?? profile?.email ?? "…"}</span>
          </h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {action}
        <Button
          size="sm"
          variant="outline"
          className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
          disabled={isSigningOut}
          onClick={async () => {
            setIsSigningOut(true);
            try {
              await signOut();
              navigate({ to: "/auth", replace: true });
            } finally {
              setIsSigningOut(false);
            }
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </div>
    </header>
  );
}
