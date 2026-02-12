"use client";

import {
  Users,
  Activity,
  Languages,
  FileVideo,
  HardDrive,
  Cpu,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const stats = [
  { label: "Toplam Kullanıcı", value: "1,247", icon: Users, change: "+12 bu hafta", color: "text-blue-500 bg-blue-500/10" },
  { label: "Bugün Aktif", value: "89", icon: Activity, change: "son 24 saat", color: "text-green-500 bg-green-500/10" },
  { label: "Toplam Proje", value: "4,832", icon: FileVideo, change: "+48 bu hafta", color: "text-purple-500 bg-purple-500/10" },
  { label: "Çevrilen Satır", value: "2.5M", icon: Languages, change: "toplam", color: "text-amber-500 bg-amber-500/10" },
];

const recentJobs = [
  { file: "naruto_ep01.mkv", user: "Ahmet Yılmaz", type: "Çeviri", status: "completed", duration: "2m 14s" },
  { file: "aot_s4_ep12.mkv", user: "Mehmet Kaya", type: "Export", status: "processing", duration: "5m 32s" },
  { file: "jjk_movie.mkv", user: "Elif Demir", type: "Çeviri", status: "queued", duration: "—" },
  { file: "spy_family_ep08.mkv", user: "Selin Arslan", type: "Export", status: "failed", duration: "1m 45s" },
];

const statusStyle: Record<string, string> = {
  completed: "text-green-500 bg-green-500/10",
  processing: "text-blue-500 bg-blue-500/10",
  queued: "text-yellow-500 bg-yellow-500/10",
  failed: "text-red-500 bg-red-500/10",
};

const statusLabel: Record<string, string> = {
  completed: "Tamamlandı",
  processing: "İşleniyor",
  queued: "Kuyrukta",
  failed: "Başarısız",
};

export default function AdminOverviewPage() {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Genel Bakış</h1>
        <p className="text-xs text-muted-foreground">Sistem durumu ve istatistikler</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="mt-1 text-2xl font-bold">{s.value}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{s.change}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.color}`}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Health */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="h-4 w-4 text-primary" />
              Sunucu Durumu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span>CPU</span><span>42%</span></div>
              <Progress value={42} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span>Bellek</span><span>68%</span></div>
              <Progress value={68} className="h-2" />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Uptime</span>
              <Badge variant="secondary">99.97%</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <HardDrive className="h-4 w-4 text-primary" />
              Depolama
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span>Kullanılan</span><span>128.5 / 500 GB</span></div>
              <Progress value={25.7} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="font-semibold">4,832</p>
                <p className="text-muted-foreground">Dosya</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="font-semibold">128.5 GB</p>
                <p className="text-muted-foreground">Kullanılan</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-primary" />
              Kuyruk Durumu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-lg font-semibold">12</p>
                <p className="text-muted-foreground">Kuyrukta</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2 text-center">
                <p className="text-lg font-semibold">4</p>
                <p className="text-muted-foreground">Aktif Worker</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Ort. İşlem Süresi</span>
              <span className="font-medium">3m 24s</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Jobs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Son İşlemler</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div key={job.file} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`${statusStyle[job.status]} border-0 text-[10px]`}>
                    {statusLabel[job.status]}
                  </Badge>
                  <div>
                    <p className="font-medium">{job.file}</p>
                    <p className="text-xs text-muted-foreground">{job.user} • {job.type}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{job.duration}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
