"use client";

import { useState } from "react";
import {
  RefreshCw,
  Cpu,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Job {
  id: string;
  user: string;
  type: string;
  file: string;
  status: string;
  progress: number;
  engine: string;
  lines: number;
  duration: string;
}

const initialJobs: Job[] = [
  { id: "job_001", user: "Ahmet Yılmaz", type: "translation", file: "naruto_ep01.mkv", status: "completed", progress: 100, engine: "OpenAI", lines: 342, duration: "2m 14s" },
  { id: "job_002", user: "Mehmet Kaya", type: "export", file: "aot_s4_ep12.mkv", status: "processing", progress: 67, engine: "—", lines: 0, duration: "5m 32s" },
  { id: "job_003", user: "Elif Demir", type: "translation", file: "jjk_movie.mkv", status: "queued", progress: 0, engine: "DeepL", lines: 580, duration: "—" },
  { id: "job_004", user: "Selin Arslan", type: "export", file: "spy_family_ep08.mkv", status: "failed", progress: 34, engine: "—", lines: 0, duration: "1m 45s" },
  { id: "job_005", user: "Can Öztürk", type: "translation", file: "demon_slayer_ep01.mkv", status: "completed", progress: 100, engine: "Gemini", lines: 210, duration: "1m 02s" },
  { id: "job_006", user: "Ayşe Yıldız", type: "translation", file: "one_piece_ep1100.mkv", status: "processing", progress: 45, engine: "OpenAI", lines: 890, duration: "3m 10s" },
  { id: "job_007", user: "Burak Koç", type: "export", file: "chainsaw_man_ep12.mkv", status: "queued", progress: 0, engine: "—", lines: 0, duration: "—" },
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

export default function AdminJobsPage() {
  const [workerCount, setWorkerCount] = useState([4]);
  const [rateLimitPerMin, setRateLimitPerMin] = useState([60]);
  const [cancelJob, setCancelJob] = useState<Job | null>(null);
  const [retryJob, setRetryJob] = useState<Job | null>(null);

  const counts = {
    queued: initialJobs.filter((j) => j.status === "queued").length,
    processing: initialJobs.filter((j) => j.status === "processing").length,
    completed: initialJobs.filter((j) => j.status === "completed").length,
    failed: initialJobs.filter((j) => j.status === "failed").length,
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">İşler & Kuyruk</h1>
          <p className="text-xs text-muted-foreground">{initialJobs.length} toplam iş</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Yenile
        </Button>
      </div>

      {/* Status badges */}
      <div className="flex gap-2">
        <Badge variant="outline" className="gap-1">
          <div className="h-2 w-2 rounded-full bg-yellow-500" />
          Kuyrukta: {counts.queued}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          İşleniyor: {counts.processing}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          Tamamlanan: {counts.completed}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          Başarısız: {counts.failed}
        </Badge>
      </div>

      {/* Jobs Table */}
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-[70px_1fr_1fr_80px_70px_100px_70px_80px_60px] gap-2 border-b bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>ID</span>
            <span>Dosya</span>
            <span>Kullanıcı</span>
            <span>Tür</span>
            <span>Motor</span>
            <span>İlerleme</span>
            <span>Süre</span>
            <span>Durum</span>
            <span></span>
          </div>
          {initialJobs.map((job) => (
            <div key={job.id} className="grid grid-cols-[70px_1fr_1fr_80px_70px_100px_70px_80px_60px] items-center gap-2 border-b px-4 py-3 text-sm last:border-0 hover:bg-muted/30">
              <span className="font-mono text-[11px] text-muted-foreground">{job.id}</span>
              <span className="truncate font-medium">{job.file}</span>
              <span className="truncate text-muted-foreground">{job.user}</span>
              <Badge variant="outline" className="w-fit text-[10px]">
                {job.type === "translation" ? "Çeviri" : "Export"}
              </Badge>
              <span className="text-xs">{job.engine}</span>
              <div className="flex items-center gap-1.5">
                <Progress value={job.progress} className="h-1.5 w-14" />
                <span className="text-[10px] text-muted-foreground">{job.progress}%</span>
              </div>
              <span className="text-xs text-muted-foreground">{job.duration}</span>
              <Badge variant="outline" className={`${statusStyle[job.status]} w-fit border-0 text-[10px]`}>
                {statusLabel[job.status]}
              </Badge>
              <div className="flex gap-0.5">
                {(job.status === "processing" || job.status === "queued") && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCancelJob(job)}>
                    <XCircle className="h-3 w-3 text-destructive" />
                  </Button>
                )}
                {job.status === "failed" && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setRetryJob(job)}>
                    <RotateCcw className="h-3 w-3 text-primary" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Worker Settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Cpu className="h-4 w-4 text-primary" />
            Worker Ayarları
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-sm">Aktif Worker Sayısı</Label>
                <span className="text-sm font-medium">{workerCount[0]}</span>
              </div>
              <Slider value={workerCount} onValueChange={setWorkerCount} min={1} max={16} step={1} />
              <p className="text-[11px] text-muted-foreground">Paralel çalışacak worker sayısı</p>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="text-sm">Rate Limit (istek/dk)</Label>
                <span className="text-sm font-medium">{rateLimitPerMin[0]}</span>
              </div>
              <Slider value={rateLimitPerMin} onValueChange={setRateLimitPerMin} min={10} max={500} step={10} />
              <p className="text-[11px] text-muted-foreground">Dakikada maksimum API isteği</p>
            </div>
          </div>
          <Button size="sm">Kaydet</Button>
        </CardContent>
      </Card>

      {/* Cancel Job Confirm */}
      <AlertDialog open={!!cancelJob} onOpenChange={() => setCancelJob(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>İşi İptal Et</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{cancelJob?.file}</strong> dosyasının işlemini iptal etmek istediğinize emin misiniz?
              İlerleme kaybolacaktır.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => setCancelJob(null)}>
              İptal Et
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Retry Job Confirm */}
      <AlertDialog open={!!retryJob} onOpenChange={() => setRetryJob(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>İşi Tekrar Dene</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{retryJob?.file}</strong> dosyasının işlemini tekrar kuyruğa eklemek istediğinize emin misiniz?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction onClick={() => setRetryJob(null)}>Tekrar Dene</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
