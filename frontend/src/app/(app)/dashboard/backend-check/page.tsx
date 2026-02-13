"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  RefreshCcw,
  Server,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { formatBytes } from "@/lib/utils";

type CheckStatus = "idle" | "running" | "pass" | "fail";

interface CheckItem {
  id: string;
  title: string;
  description: string;
}

interface CheckResult extends CheckItem {
  status: CheckStatus;
  details: string | null;
  durationMs: number | null;
}

const CHECKS: CheckItem[] = [
  {
    id: "api-url",
    title: "API URL",
    description: "Frontend'in backend adresini dogru hedefe yonlendirdigini kontrol eder.",
  },
  {
    id: "health",
    title: "Health Endpoint",
    description: "Backend durumunu, ffmpeg/redis/supabase servislerini kontrol eder.",
  },
  {
    id: "session",
    title: "Auth Session",
    description: "Supabase oturumunun frontend tarafinda erisilebilir oldugunu kontrol eder.",
  },
  {
    id: "projects",
    title: "Projects API",
    description: "JWT ile korunan proje listeleme endpoint'inin calistigini test eder.",
  },
  {
    id: "storage",
    title: "Storage API",
    description: "Kullanim ve limit bilgisi donen storage endpoint'ini kontrol eder.",
  },
];

function makeInitialResults(): CheckResult[] {
  return CHECKS.map((check) => ({
    ...check,
    status: "idle",
    details: null,
    durationMs: null,
  }));
}

export default function BackendCheckPage() {
  const supabase = useMemo(() => createClient(), []);
  const [running, setRunning] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [results, setResults] = useState<CheckResult[]>(() => makeInitialResults());

  const setResult = (id: string, patch: Partial<CheckResult>) => {
    setResults((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const runSingle = async (id: string, check: () => Promise<string>) => {
    setResult(id, { status: "running", details: null, durationMs: null });
    const started = performance.now();

    try {
      const details = await check();
      setResult(id, {
        status: "pass",
        details,
        durationMs: Math.round(performance.now() - started),
      });
    } catch (error: unknown) {
      setResult(id, {
        status: "fail",
        details: error instanceof Error ? error.message : "Bilinmeyen hata",
        durationMs: Math.round(performance.now() - started),
      });
    }
  };

  const runAllChecks = async () => {
    if (running) return;

    setRunning(true);
    setResults(makeInitialResults());

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    await runSingle("api-url", async () => `NEXT_PUBLIC_API_URL = ${apiBase}`);

    await runSingle("health", async () => {
      const health = await api.health();
      if (health.status !== "ok") {
        throw new Error(`Health status: ${health.status}`);
      }
      if (!health.ffmpeg) throw new Error("FFmpeg servisi hazir degil.");
      if (!health.redis) throw new Error("Redis baglantisi basarisiz.");
      if (!health.supabase) throw new Error("Supabase baglantisi basarisiz.");
      return `Backend saglikli (version: ${health.version})`;
    });

    await runSingle("session", async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session?.access_token) {
        throw new Error("Aktif session bulunamadi. Once login olun.");
      }
      return data.session.user.email || data.session.user.id;
    });

    await runSingle("projects", async () => {
      const projects = await api.listProjects();
      return `${projects.length} proje listelendi.`;
    });

    await runSingle("storage", async () => {
      const storage = await api.getStorageInfo();
      if (!storage.ok) {
        throw new Error(storage.warning || "Storage endpoint ok=false dondu.");
      }
      return `${formatBytes(storage.used_bytes)} / ${formatBytes(storage.max_bytes)}`;
    });

    setLastRunAt(new Date().toLocaleString("tr-TR"));
    setRunning(false);
  };

  const passedCount = results.filter((item) => item.status === "pass").length;
  const failedCount = results.filter((item) => item.status === "fail").length;
  const finishedCount = passedCount + failedCount;

  const getIcon = (id: string) => {
    if (id === "health") return Server;
    if (id === "session") return ShieldCheck;
    if (id === "projects") return Database;
    if (id === "storage") return HardDrive;
    return Wrench;
  };

  const getStatusBadge = (status: CheckStatus) => {
    if (status === "pass") return <Badge className="bg-green-600">PASS</Badge>;
    if (status === "fail") return <Badge variant="destructive">FAIL</Badge>;
    if (status === "running") return <Badge variant="secondary">RUNNING</Badge>;
    return <Badge variant="outline">IDLE</Badge>;
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Button variant="ghost" className="-ml-3 mb-2 h-8 px-2" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Backend Quick Check</h1>
          <p className="text-sm text-muted-foreground">
            2 dakikalik hizli kontrol. Bu ozelligi kaldirmak icin sadece bu dosyayi silmeniz yeterli.
          </p>
        </div>
        <Button onClick={runAllChecks} disabled={running}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
          {running ? "Kontrol Ediliyor" : "Kontrolu Baslat"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ozet</CardTitle>
          <CardDescription>
            {lastRunAt ? `Son calisma: ${lastRunAt}` : "Henuz calistirilmadi."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Toplam: {results.length}</Badge>
          <Badge variant="outline">Tamamlanan: {finishedCount}</Badge>
          <Badge className="bg-green-600">Pass: {passedCount}</Badge>
          <Badge variant="destructive">Fail: {failedCount}</Badge>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {results.map((item) => {
          const Icon = getIcon(item.id);
          return (
            <Card key={item.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-md border p-2">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  {getStatusBadge(item.status)}
                </div>

                {(item.details || item.durationMs !== null) && (
                  <div className="mt-4 rounded-md bg-muted/50 p-3 text-xs">
                    {item.details && <p>{item.details}</p>}
                    {item.durationMs !== null && (
                      <p className="mt-1 text-muted-foreground">Sure: {item.durationMs} ms</p>
                    )}
                  </div>
                )}

                {item.status === "fail" && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Bu adimda hata var.
                  </div>
                )}

                {item.status === "pass" && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-green-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Bu adim basarili.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
