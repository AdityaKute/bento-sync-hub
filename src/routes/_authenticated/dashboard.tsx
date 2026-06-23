import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CheckCircle2, FileImage, Loader2, RefreshCw, Save, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Vault" }] }),
  component: Dashboard,
});

const SLOTS = [1, 2, 3, 4, 5, 6] as const;
const SLOT_CLASSES: Record<number, string> = {
  1: "lg:col-span-2 lg:row-span-2",
  2: "lg:col-span-1",
  3: "lg:col-span-1 lg:row-span-2",
  4: "lg:col-span-1",
  5: "lg:col-span-2",
  6: "lg:col-span-3",
};
const MAX_FILE_SIZE = 1_500_000;
const STORAGE_BUCKET = "user-uploads";
const ALLOWED_FILES = /\.(jpg|jpeg|png)$/i;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

type UserFilesRow = {
  id: string;
  user_id: string;
  file_1_url: string | null;
  file_2_url: string | null;
  file_3_url: string | null;
  file_4_url: string | null;
  file_5_url: string | null;
  file_6_url: string | null;
  updated_at: string;
};

function Dashboard() {
  const { user, profile, profileLoading } = useAuth();
  const navigate = useNavigate();
  const [row, setRow] = useState<UserFilesRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Record<number, File>>({});
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [signed, setSigned] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  const isAllowedAdmin =
    user?.email?.toLowerCase() === "admin@gmail.com" &&
    profile?.email?.toLowerCase() === "admin@gmail.com";

  useEffect(() => {
    if (!user || profileLoading) return;
    if (isAllowedAdmin) {
      navigate({ to: "/admin" });
    }
  }, [user, profileLoading, isAllowedAdmin, navigate]);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("user_files")
        .select("id,user_id,file_1_url,file_2_url,file_3_url,file_4_url,file_5_url,file_6_url,updated_at")
        .eq("user_id", user.id)
        .maybeSingle();

      const nextRow = (data as UserFilesRow | null) ?? null;
      setRow(nextRow);

      const nextSigned: Record<number, string> = {};
      await Promise.all(
        SLOTS.map(async (slot) => {
          const key = `file_${slot}_url` as const;
          const path = nextRow?.[key] ?? null;
          if (!path) return;
          const { data: signedData } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600);
          if (signedData?.signedUrl) {
            nextSigned[slot] = signedData.signedUrl;
          }
        }),
      );
      setSigned(nextSigned);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      void refresh();
    }
  }, [user]);

  const hasPending = Object.keys(pending).length > 0;
  const uploadedSlots = useMemo(() => {
    const slots = new Set<number>();
    SLOTS.forEach((slot) => {
      const key = `file_${slot}_url` as const;
      if (row?.[key]) {
        slots.add(slot);
      }
    });
    return slots;
  }, [row]);

  const onPick = (slot: number, file: File | null) => {
    if (!file) return;
    try {
      const hasAllowedExt = ALLOWED_FILES.test(file.name);
      const hasAllowedMime = ALLOWED_MIME.has(file.type) || file.type === "";
      if (!hasAllowedExt || !hasAllowedMime) {
        throw new Error("Only JPG, PNG, PDF, and common document formats are allowed.");
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error("Each file must be smaller than 1.5 MB.");
      }
      setPending((prev) => ({ ...prev, [slot]: file }));
      setPreviews((prev) => ({
        ...prev,
        [slot]: file.type.startsWith("image/") ? URL.createObjectURL(file) : prev[slot],
      }));
      toast.success(`Selected ${file.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  };

  const saveAll = async () => {
    if (!user) return;
    setSaving(true);
      try {
        const payload: Database["public"]["Tables"]["user_files"]["Insert"] = {
          user_id: user.id,
          updated_at: new Date().toISOString(),
        };

      for (const slot of SLOTS) {
        const file = pending[slot];
        const key = `file_${slot}_url` as const;
        if (file) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${user.id}/slot-${slot}-${safeName}`;
          const { error: upErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(path, file, { upsert: true, contentType: file.type || "application/octet-stream" });
          if (upErr) throw upErr;
          payload[key] = path;
        } else {
          payload[key] = row?.[key] ?? null;
        }
      }

      const { error: dbErr } = await supabase.from("user_files").upsert(payload, { onConflict: "user_id" });
      if (dbErr) throw dbErr;

      toast.success("Files saved successfully");
      setPending({});
      setPreviews({});
      await refresh();
    } catch (error: any) {
      toast.error(error.message ?? "Upload failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-32 sm:p-6">
      <AppHeader subtitle="Personal vault" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Your document slots</h2>
          <p className="text-sm text-muted-foreground">Upload up to 6 files. Each file is limited to 1.5 MB.</p>
          <p className="mt-1 inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            Accepted formats: JPG, PNG, JPEG.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:auto-rows-[200px] lg:grid-cols-3">
        {SLOTS.map((slot) => {
          const isUploaded = uploadedSlots.has(slot);
          const previewUrl = previews[slot] ?? signed[slot];
          const key = `file_${slot}_url` as const;
          const storedPath = row?.[key] ?? null;
          return (
            <SlotCard
              key={slot}
              slot={slot}
              className={SLOT_CLASSES[slot]}
              loading={loading}
              uploaded={isUploaded}
              hasPending={!!pending[slot]}
              previewUrl={previewUrl}
              storedPath={storedPath}
              onPick={(file) => onPick(slot, file)}
            />
          );
        })}
      </div>

      {hasPending && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
          <div className="glass mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-2xl px-4 py-3 shadow-2xl">
            <p className="text-sm">
              <span className="font-semibold">{Object.keys(pending).length}</span> file(s) ready to save
            </p>
            <Button onClick={() => void saveAll()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SlotCard({
  slot,
  className,
  loading,
  uploaded,
  hasPending,
  previewUrl,
  storedPath,
  onPick,
}: {
  slot: number;
  className?: string;
  loading: boolean;
  uploaded: boolean;
  hasPending: boolean;
  previewUrl?: string;
  storedPath: string | null;
  onPick: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileName = storedPath?.split("/").pop() ?? "No file yet";
  const isImage = /\.(jpg|jpeg|png)$/i.test(fileName);

  if (loading) {
    return <Skeleton className={`h-full min-h-[200px] w-full rounded-2xl ${className ?? ""}`} />;
  }

  return (
    <Card className={`glass group relative min-h-[200px] overflow-hidden p-0 lg:min-h-0 ${className ?? ""}`}>
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      {previewUrl && isImage ? (
        <img src={previewUrl} alt={`Slot ${slot}`} className="absolute inset-0 h-full w-full object-cover opacity-80" />
      ) : null}
      <div className={`relative flex h-full flex-col justify-between p-4 ${previewUrl && isImage ? "bg-gradient-to-t from-background/90 via-background/40 to-transparent" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full bg-background/70 px-2.5 py-0.5 text-xs font-medium backdrop-blur">
            File Slot {slot}
          </span>
          {uploaded && !hasPending && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-[11px] font-medium text-success">
              <CheckCircle2 className="h-3 w-3" /> Uploaded
            </span>
          )}
          {hasPending && (
            <span className="rounded-full bg-accent/30 px-2 py-0.5 text-[11px] font-medium text-accent-foreground">Pending</span>
          )}
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            {previewUrl && !isImage ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileImage className="h-4 w-4 shrink-0" />
                <span className="truncate text-xs">{fileName}</span>
              </div>
            ) : !previewUrl ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileImage className="h-4 w-4 shrink-0" />
                <span className="truncate text-xs">No file yet</span>
              </div>
            ) : null}
          </div>
          <Button size="sm" variant={uploaded ? "secondary" : "default"} onClick={() => inputRef.current?.click()}>
            {uploaded ? (<><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Replace</>) : (<><Upload className="mr-1.5 h-3.5 w-3.5" /> Upload</>)}
          </Button>
        </div>
      </div>
    </Card>
  );
}
