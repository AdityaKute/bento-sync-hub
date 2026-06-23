import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle2, Download, Loader2, Package, Trash2, XCircle } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";
import type { AdminLoaderData, AdminRow } from "./admin.server";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Vault" }] }),
  beforeLoad: async () => {
    try {
      const { loadAdminData } = await import("./admin.server");
      const adminData = await loadAdminData();
      return { adminData };
    } catch (error: any) {
      return { adminData: null, adminError: error?.message ?? String(error) } as any;
    }
  },
  component: Admin,
});

type DashboardRow = AdminRow;

const STORAGE_BUCKET = "user-uploads";
const SLOTS = [1, 2, 3, 4, 5, 6] as const;

function Admin() {
  const { user, profile, profileLoading } = useAuth();
  const { adminData, adminError } = Route.useRouteContext() as {
    adminData: AdminLoaderData | null;
    adminError?: string;
  };
  const navigate = useNavigate();
  const [rows, setRows] = useState<DashboardRow[] | null>(adminData?.rows ?? null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const isAllowedAdmin =
    user?.email?.toLowerCase() === "admin@gmail.com" &&
    profile?.email?.toLowerCase() === "admin@gmail.com";

  useEffect(() => {
    if (adminData) {
      setRows(adminData.rows);
    }
  }, [adminData]);

  useEffect(() => {
    if (!user || profileLoading) return;
    if (!isAllowedAdmin) {
      toast.error("Unauthorized — admin access required");
      navigate({ to: "/dashboard", replace: true });
      return;
    }
  }, [user, profileLoading, isAllowedAdmin, navigate]);

  const refresh = async () => {
    const { data: profiles, error } = await supabase
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
      toast.error("Unable to refresh admin data.");
      return;
    }

    const nextRows: DashboardRow[] = (profiles ?? [])
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

    setRows(nextRows);
  };

  useEffect(() => {
    if (!isAllowedAdmin) return;
    if (!adminData && adminError && rows === null) {
      void refresh();
    }
  }, [adminData, adminError, isAllowedAdmin, rows]);

  const downloadUserZip = async (row: DashboardRow) => {
    setDownloadingId(row.id);
    try {
      const zip = new JSZip();
      const folder = zip.folder(row.email.replace(/@.*/, "")) ?? zip;

      for (const slot of SLOTS) {
        const key = `file_${slot}_url` as const;
        const path = row[key];
        if (!path) continue;
        const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
        if (error || !data) continue;
        const extension = path.split(".").pop() ?? "bin";
        folder.file(`file_${slot}.${extension}`, data);
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `${row.email.replace(/@.*/, "")}_files.zip`);
      toast.success(`Downloaded ${row.email}'s files`);
    } catch (error: any) {
      toast.error(error.message ?? "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

  const downloadAllZip = async () => {
    if (!rows) return;
    setDownloadingAll(true);
    try {
      const zip = new JSZip();
      for (const row of rows) {
        const hasAny = SLOTS.some((slot) => !!row[`file_${slot}_url` as const]);
        if (!hasAny) continue;
        const folder = zip.folder(row.email.replace(/@.*/, "")) ?? zip;
        for (const slot of SLOTS) {
          const key = `file_${slot}_url` as const;
          const path = row[key];
          if (!path) continue;
          const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
          if (error || !data) continue;
          const extension = path.split(".").pop() ?? "bin";
          folder.file(`file_${slot}.${extension}`, data);
        }
      }
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `all_users_files.zip`);
      toast.success("Downloaded all user files");
    } catch (error: any) {
      toast.error(error.message ?? "Download failed");
    } finally {
      setDownloadingAll(false);
    }
  };

  const deleteAllUsers = async () => {
    if (!rows || rows.length === 0) return;
    if (!window.confirm(`Delete all fetched users and their uploaded files? This cannot be undone.`)) {
      return;
    }

    setDeletingAll(true);

    try {
      const filePaths = rows
        .flatMap((row) => SLOTS.map((slot) => row[`file_${slot}_url` as const]))
        .filter(Boolean) as string[];

      if (filePaths.length > 0) {
        const { error: deleteStorageError } = await supabase.storage.from(STORAGE_BUCKET).remove(filePaths);
        if (deleteStorageError) throw deleteStorageError;
      }

      const ids = rows.map((row) => row.id);

      if (ids.length > 0) {
        const { error: deleteUserFilesError } = await supabase.from("user_files").delete().in("profile_id", ids);
        if (deleteUserFilesError) {
          const message = deleteUserFilesError.message ?? "";
          if (!/does not exist|column|undefined/i.test(message)) {
            throw deleteUserFilesError;
          }
        }

        const { error: deleteProfilesError } = await supabase.from("profiles").delete().in("id", ids);
        if (deleteProfilesError) throw deleteProfilesError;
      }

      toast.success("Deleted all fetched users and linked files.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to delete all users");
    } finally {
      setDeletingAll(false);
    }
  };

  const effectiveRows = rows ?? [];
  const totalUploaded = effectiveRows.reduce(
    (sum, row) => sum + SLOTS.filter((slot) => !!row[`file_${slot}_url` as const]).length,
    0,
  );
  const completeVaults = effectiveRows.filter((row) =>
    SLOTS.every((slot) => !!row[`file_${slot}_url` as const]),
  ).length;
  const emptyVaults = effectiveRows.filter((row) =>
    SLOTS.every((slot) => !row[`file_${slot}_url` as const]),
  ).length;

  if (profileLoading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-12">
        <div className="rounded-3xl border border-border/70 bg-background/90 p-8 text-center shadow-lg">
          <p className="text-lg font-semibold">Loading admin console…</p>
          <p className="mt-2 text-sm text-muted-foreground">Please wait while we verify your access.</p>
        </div>
      </div>
    );
  }

  if (!profile?.role) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <AppHeader subtitle="Admin console" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="glass lg:col-span-2 p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">User management</h2>
              <p className="text-xs text-muted-foreground">{effectiveRows.length} registered users</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void downloadAllZip()}
                disabled={downloadingAll || effectiveRows.length === 0}
                className="bg-green-100 text-green-800 hover:bg-green-200"
              >
                {downloadingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
                Download All
              </Button>
              <Button
                onClick={() => void deleteAllUsers()}
                disabled={downloadingAll || deletingAll || effectiveRows.length === 0}
                className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
              >
                {deletingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete All
              </Button>
            </div>
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username (Email)</TableHead>
                  {SLOTS.map((slot) => (
                    <TableHead key={slot} className="text-center">File {slot}</TableHead>
                  ))}
                  <TableHead className="text-right">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows === null
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={9}><Skeleton className="h-6 w-full" /></TableCell>
                      </TableRow>
                    ))
                  : effectiveRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.email}</TableCell>
                        {SLOTS.map((slot) => {
                          const key = `file_${slot}_url` as const;
                          const hasFile = !!row[key];
                          return (
                            <TableCell key={slot} className="text-center">
                              {hasFile ? (
                                <CheckCircle2 className="mx-auto h-5 w-5 text-success" />
                              ) : (
                                <XCircle className="mx-auto h-5 w-5 text-destructive/80" />
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={downloadingId === row.id || !SLOTS.some((slot) => !!row[`file_${slot}_url` as const])}
                            onClick={() => void downloadUserZip(row)}
                          >
                            {downloadingId === row.id ? (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="mr-2 h-3.5 w-3.5" />
                            )}
                            Download
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                {rows !== null && effectiveRows.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No users yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {rows === null && Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
            {rows !== null && effectiveRows.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No users yet.</p>
            )}
            {effectiveRows.map((row) => {
              const uploadedCount = SLOTS.filter((slot) => !!row[`file_${slot}_url` as const]).length;
              return (
                <div key={row.id} className="rounded-xl border border-border/60 bg-background/40 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{row.email}</p>
                      <p className="text-xs text-muted-foreground">{uploadedCount} / 6 files uploaded</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-9 shrink-0"
                        disabled={downloadingId === row.id || uploadedCount === 0}
                        onClick={() => void downloadUserZip(row)}
                      >
                        {downloadingId === row.id ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        Download
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5" role="list" aria-label={`File status for ${row.email}`}>
                    {SLOTS.map((slot) => {
                      const key = `file_${slot}_url` as const;
                      const hasFile = !!row[key];
                      return (
                        <div
                          key={slot}
                          role="listitem"
                          className={`flex h-11 flex-col items-center justify-center rounded-md text-[10px] font-medium ${
                            hasFile ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive/80"
                          }`}
                        >
                          {hasFile ? (
                            <CheckCircle2 className="h-4 w-4" aria-label="Uploaded" />
                          ) : (
                            <XCircle className="h-4 w-4" aria-label="Missing" />
                          )}
                          <span className="mt-0.5">F{slot}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="glass lg:col-span-1 p-5">
          <h2 className="text-lg font-semibold">Admin overview</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Stat label="Users" value={effectiveRows.length} />
            <Stat label="Files" value={totalUploaded} />
            <Stat label="Complete" value={completeVaults} />
            <Stat label="Empty" value={emptyVaults} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
