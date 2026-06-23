import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminRow = {
  id: string;
  email: string;
  role: "user" | "admin";
  file_1_url: string | null;
  file_2_url: string | null;
  file_3_url: string | null;
  file_4_url: string | null;
  file_5_url: string | null;
  file_6_url: string | null;
};

export type AdminLoaderData = {
  rows: AdminRow[];
  totalUsers: number;
  totalFiles: number;
  completeVaults: number;
  emptyVaults: number;
};

const FILE_SLOTS = [1, 2, 3, 4, 5, 6] as const;

export async function loadAdminData(): Promise<AdminLoaderData> {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select(`
      id,
      email,
      role,
      user_files (
        file_1_url,
        file_2_url,
        file_3_url,
        file_4_url,
        file_5_url,
        file_6_url
      )
    `)
    .neq("email", "admin@gmail.com")
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const rows: AdminRow[] = (profiles ?? [])
    .filter((profile: any) => profile?.id)
    .map((profile: any) => {
      const uf = Array.isArray(profile.user_files)
        ? profile.user_files[0] ?? {}
        : profile.user_files ?? {};

      return {
        id: profile.id,
        email: profile.email,
        role: profile.role === "admin" ? "admin" : "user",
        file_1_url: uf.file_1_url ?? null,
        file_2_url: uf.file_2_url ?? null,
        file_3_url: uf.file_3_url ?? null,
        file_4_url: uf.file_4_url ?? null,
        file_5_url: uf.file_5_url ?? null,
        file_6_url: uf.file_6_url ?? null,
      };
    });

  const existingProfileIds = new Set(rows.map((row) => row.id));
  const { data: authUsers, error: authUsersError } = await (supabaseAdmin as any)
    .from("auth.users")
    .select("id,email")
    .neq("email", "admin@gmail.com");

  if (authUsersError) {
    throw authUsersError;
  }

  const fallbackRows: AdminRow[] = (authUsers ?? [])
    .filter((user: any) => user?.id && !existingProfileIds.has(user.id))
    .map((user: any) => ({
      id: user.id,
      email: user.email,
      role: "user",
      file_1_url: null,
      file_2_url: null,
      file_3_url: null,
      file_4_url: null,
      file_5_url: null,
      file_6_url: null,
    }));

  const allRows = [...rows, ...fallbackRows].sort((a, b) => a.email.localeCompare(b.email));

  const totalFiles = allRows.reduce(
    (count, row) =>
      count + FILE_SLOTS.filter((slot) => !!row[`file_${slot}_url` as const]).length,
    0,
  );
  const completeVaults = allRows.filter((row) =>
    FILE_SLOTS.every((slot) => !!row[`file_${slot}_url` as const]),
  ).length;
  const emptyVaults = allRows.filter((row) =>
    FILE_SLOTS.every((slot) => !row[`file_${slot}_url` as const]),
  ).length;

  return {
    rows: allRows,
    totalUsers: allRows.length,
    totalFiles,
    completeVaults,
    emptyVaults,
  };
}
