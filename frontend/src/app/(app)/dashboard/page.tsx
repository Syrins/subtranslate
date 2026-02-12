"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  Upload,
  Languages,
  Subtitles,
  Download,
  FolderOpen,
  Clock,
  FileVideo,
  TrendingUp,
  Zap,
  ArrowRight,
  HardDrive,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuthContext } from "@/components/auth-provider";
import { api, type Project } from "@/lib/api";
import { useFetchOnFocus } from "@/hooks/use-fetch-on-focus";
import { formatBytes, timeAgo } from "@/lib/utils";

const workflowSteps = [
  {
    step: 1,
    title: "Video Yükle",
    description: "MKV dosyanızı yükleyin veya link yapıştırın",
    icon: Upload,
    href: "/upload",
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    step: 2,
    title: "Altyazı Çevir",
    description: "AI destekli çeviri motorları ile çevirin",
    icon: Languages,
    href: "/translate",
    color: "bg-green-500/10 text-green-500",
  },
  {
    step: 3,
    title: "Düzenle & Stillendir",
    description: "Altyazıyı düzenleyin, font ve renk ayarlayın",
    icon: Subtitles,
    href: "/editor",
    color: "bg-purple-500/10 text-purple-500",
  },
  {
    step: 4,
    title: "Dışa Aktar",
    description: "Yüksek kalite MP4 olarak dışa aktarın",
    icon: Download,
    href: "/export",
    color: "bg-amber-500/10 text-amber-500",
  },
];

const statusLabels: Record<string, string> = {
  uploading: "Yükleniyor",
  processing: "İşleniyor",
  ready: "Hazır",
  translating: "Çevriliyor",
  translated: "Çevrildi",
  editing: "Düzenleniyor",
  exporting: "Dışa Aktarılıyor",
  exported: "Tamamlandı",
  failed: "Hata",
};

export default function DashboardPage() {
  const { profile, plan, refreshProfile } = useAuthContext();
  const { data: projects = [], loading } = useFetchOnFocus(
    () => api.listProjects(),
    { pathPrefix: "/dashboard" }
  );

  // Refresh profile on dashboard visit to get latest usage stats
  const profileRefreshedRef = useRef(false);
  useEffect(() => {
    if (!profileRefreshedRef.current && profile) {
      profileRefreshedRef.current = true;
      refreshProfile();
    }
  }, [profile, refreshProfile]);

  const totalLines = projects.reduce((sum, p) => sum + (p.translated_lines || 0), 0);
  const exportedCount = projects.filter((p) => p.status === "exported").length;
  const lineLimit = plan?.lines_per_month || 1000;
  const linesUsed = profile?.lines_used_this_month || 0;
  const storageUsed = profile?.storage_used_bytes || 0;
  const storageMax = (plan?.storage_gb || 5) * 1024 * 1024 * 1024;
  const dailyUsed = profile?.daily_jobs_used || 0;
  const dailyLimit = plan?.daily_job_limit || 3;

  const recentProjects = projects.slice(0, 5);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Toplam Proje</CardTitle>
            <FolderOpen className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
            <p className="text-xs text-muted-foreground">Aktif proje</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Çevrilen Satır</CardTitle>
            <Languages className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{linesUsed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">/ {lineLimit.toLocaleString()} bu ay</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Günlük Yükleme</CardTitle>
            <Upload className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dailyUsed} / {dailyLimit}</div>
            <p className="text-xs text-muted-foreground">Bugün kullanılan</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Depolama</CardTitle>
            <HardDrive className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBytes(storageUsed)}</div>
            <p className="text-xs text-muted-foreground">/ {formatBytes(storageMax)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Workflow Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            İş Akışı
          </CardTitle>
          <CardDescription>
            4 adımda videonuzu çevrilmiş altyazılarla dışa aktarın
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflowSteps.map((step) => (
              <Link key={step.step} href={step.href}>
                <div className="group relative flex flex-col gap-3 rounded-xl border p-4 transition-all hover:border-primary/50 hover:shadow-md">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${step.color}`}>
                      <step.icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="h-6 w-6 justify-center rounded-full p-0 text-xs">
                      {step.step}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                  <ArrowRight className="absolute right-3 top-3 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Projects & Subscription */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  Son Projeler
                </CardTitle>
                <CardDescription>En son üzerinde çalıştığınız projeler</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/projects">Tümünü Gör</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : recentProjects.length > 0 ? (
              <div className="space-y-2">
                {recentProjects.map((project) => (
                  <Link key={project.id} href={`/editor?project=${project.id}`}>
                    <div className="flex items-center gap-4 rounded-lg border p-3 transition-colors hover:bg-accent">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <FileVideo className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {project.total_lines} satır • {timeAgo(project.created_at)}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {statusLabels[project.status] || project.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <FileVideo className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Henüz proje yok</p>
                  <p className="text-sm text-muted-foreground">İlk projenizi oluşturmak için video yükleyin</p>
                </div>
                <Button asChild className="mt-2">
                  <Link href="/upload">
                    <Upload className="mr-2 h-4 w-4" />
                    Video Yükle
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Abonelik</CardTitle>
            <CardDescription>Mevcut plan ve kullanım</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{plan?.name || "Free"} Plan</span>
              <Badge>Aktif</Badge>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Çeviri Kotası</span>
                <span>{linesUsed.toLocaleString()} / {lineLimit.toLocaleString()} satır</span>
              </div>
              <Progress value={lineLimit > 0 ? (linesUsed / lineLimit) * 100 : 0} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Depolama</span>
                <span>{formatBytes(storageUsed)} / {formatBytes(storageMax)}</span>
              </div>
              <Progress value={storageMax > 0 ? (storageUsed / storageMax) * 100 : 0} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Günlük Yükleme</span>
                <span>{dailyUsed} / {dailyLimit}</span>
              </div>
              <Progress value={dailyLimit > 0 ? (dailyUsed / dailyLimit) * 100 : 0} className="h-2" />
            </div>
            <Button variant="outline" className="mt-2 w-full" asChild>
              <Link href="/settings">
                <Zap className="mr-2 h-4 w-4" />
                Planı Yükselt
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
