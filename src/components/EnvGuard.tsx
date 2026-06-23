import { AlertTriangle } from "lucide-react";
import { isSupabaseConfigured, missingSupabaseEnvVars } from "@/lib/supabase";
import type { ReactNode } from "react";

export function EnvGuard({ children }: { children: ReactNode }) {
  if (isSupabaseConfigured()) return <>{children}</>;
  const missing = missingSupabaseEnvVars();
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="glass max-w-lg rounded-2xl p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-destructive/15 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Backend not configured</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The application can't reach its backend because required environment variables are missing.
        </p>
        <ul className="mx-auto mt-4 inline-block rounded-lg border border-border/60 bg-background/40 px-4 py-3 text-left font-mono text-xs">
          {missing.map((v) => (
            <li key={v}>• {v}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Add them to your <span className="font-mono">.env</span> file or your hosting environment, then reload.
        </p>
      </div>
    </div>
  );
}
