import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  email: string;
  role: "user" | "admin";
  created_at: string;
};

type AuthCtx = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadProfile = async (uid: string) => {
    setProfileLoading(true);
    try {
      const { data: roleRows, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);

      if (roleError) throw roleError;

      const isAdmin = (roleRows ?? []).some((row) => row.role === "admin");
      const role: Profile["role"] = isAdmin ? "admin" : "user";

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, role, created_at")
        .eq("id", uid)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const normalizedProfile: Profile = {
          ...(data as Profile),
          role: (data.role === "admin" || isAdmin) ? "admin" : "user",
        };

        if (normalizedProfile.role !== data.role) {
          await supabase
            .from("profiles")
            .update({ role: normalizedProfile.role })
            .eq("id", uid);
        }

        setProfile(normalizedProfile);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const email = userData?.user?.email ?? "";

      const { error: upsertError } = await supabase
        .from("profiles")
        .upsert(
          {
            id: uid,
            email,
            role,
          },
          { onConflict: "id" },
        );

      if (upsertError) throw upsertError;

      const { data: refreshedData, error: refreshedError } = await supabase
        .from("profiles")
        .select("id, email, role, created_at")
        .eq("id", uid)
        .maybeSingle();

      if (refreshedError) throw refreshedError;
      setProfile((refreshedData as Profile | null) ?? null);
    } catch {
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!isMounted) return;
      setSession(s);
      if (s?.user) {
        void loadProfile(s.user.id);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      if (data.session?.user) {
        void loadProfile(data.session.user.id);
      } else {
        setProfileLoading(false);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        profileLoading,
        refreshProfile: async () => {
          if (session?.user) {
            await loadProfile(session.user.id);
          }
        },
        signOut: async () => {
          await supabase.auth.signOut();
          setProfile(null);
          setSession(null);
          setProfileLoading(false);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
