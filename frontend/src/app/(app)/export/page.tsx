"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useFetchOnFocus } from "@/hooks/use-fetch-on-focus";
import { formatBytes, formatDuration } from "@/lib/utils";
import Link from "next/link";
import {
  Download,
  CheckCircle2,
  Loader2,
  FileVideo,
  Film,
  Volume2,
  Subtitles,
  Palette,
  Zap,
  Info,
  FolderOpen,
  HardDrive,
  ArrowLeft,
  Clock,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type Project } from "@/lib/api";
import { useAuthContext } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ExportPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
      <ExportPageInner />
    </Suspense>
  );
}

function ExportPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get("project");
  const { user, plan } = useAuthContext();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [project, setProject] = useState<Project | null>(null);

  // Export settings
  const [subtitleMode, setSubtitleMode] = useState("burn_in");
  const [resolution, setResolution] = useState("original");
  const [videoCodec, setVideoCodec] = useState("h264");
  const [audioCodec, setAudioCodec] = useState("aac");
  const [includeWatermark, setIncludeWatermark] = useState(false);
  const [watermarkText, setWatermarkText] = useState("SubTranslate");
  const [keepAudioTracks, setKeepAudioTracks] = useState(true);

  // Subtitle style from editor (stored in localStorage)
  const [subtitleStyle, setSubtitleStyle] = useState<Record<string, unknown> | null>(null);

  // Delivery method
  const [deliveryMethod, setDeliveryMethod] = useState<"download" | "storage">("download");
  const [hasUserStorage, setHasUserStorage] = useState(false);
  const [checkingStorage, setCheckingStorage] = useState(true);

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load projects list (refreshes on navigation back)
  const { data: fetchedProjects } = useFetchOnFocus(
    () => api.listProjects(),
    { pathPrefix: "/export" }
  );
  useEffect(() => {
    if (fetchedProjects) setProjects(fetchedProjects);
  }, [fetchedProjects]);

  // Load subtitle style from localStorage (set by editor page)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("export_subtitle_style");
      if (raw) setSubtitleStyle(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    api.getProject(selectedProjectId).then(setProject).catch(() => {});
  }, [selectedProjectId]);

  // Check if user has storage config
  useEffect(() => {
    if (!user) { setCheckingStorage(false); return; }
    setCheckingStorage(true);
    const supabase = createClient();
    supabase
      .from("user_storage_configs")
      .select("id, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .then(({ data }) => {
        setHasUserStorage(!!(data && data.length > 0));
        setCheckingStorage(false);
      }, () => {
        setCheckingStorage(false);
      });
  }, [user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startPolling = useCallback((jid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job = await api.getExportJob(jid);
        setJobStatus(job.status);
        setJobProgress(job.progress);
        if (job.status === "completed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          toast.success("Dışa aktarma tamamlandı!");
          try {
            const dl = await api.getExportDownload(jid);
            // Prepend API_BASE to relative URL from backend
            const fullUrl = dl.url.startsWith("http") ? dl.url : `${API_BASE}${dl.url}`;
            setDownloadUrl(fullUrl);
          } catch { /* ignore */ }
          // Refresh project data
          if (selectedProjectId) {
            api.getProject(selectedProjectId).then(setProject).catch(() => {});
          }
        } else if (job.status === "failed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
          setErrorMsg(job.error_message || "Dışa aktarma başarısız.");
          toast.error(job.error_message || "Dışa aktarma başarısız.");
        }
      } catch { /* ignore */ }
    }, 3000);
  }, []);

  const startExport = async () => {
    if (!selectedProjectId) return;
    setErrorMsg(null);
    setDownloadUrl(null);
    setElapsedTime(0);
    try {
      const result = await api.createExportJob({
        project_id: selectedProjectId,
        mode: subtitleMode as "burn_in" | "soft_sub",
        resolution,
        video_codec: videoCodec,
        audio_codec: audioCodec,
        include_watermark: includeWatermark,
        watermark_text: includeWatermark ? watermarkText : undefined,
        keep_audio_tracks: keepAudioTracks,
        upload_to_storage: deliveryMethod === "storage",
        subtitle_style: subtitleMode === "burn_in" ? subtitleStyle ?? undefined : undefined,
      });
      setJobId(result.id);
      setJobStatus("queued");
      setJobProgress(0);
      toast.info("Dışa aktarma başlatıldı...");
      startPolling(result.id);
      // Start elapsed timer
      timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Dışa aktarma başlatılamadı.");
    }
  };

  const cancelExport = async () => {
    if (!jobId) return;
    try {
      await api.cancelExportJob(jobId);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setJobStatus("cancelled");
      toast.info("Dışa aktarma iptal edildi.");
    } catch { /* ignore */ }
  };

  const handleUploadToStorage = async () => {
    if (!jobId || !selectedProjectId) return;
    try {
      await api.markUploadedToOwnStorage(selectedProjectId);
      toast.success("Dosya kendi depolamanıza yüklendi olarak işaretlendi.");
    } catch {
      toast.error("İşaretleme başarısız.");
    }
  };

  const resetExport = () => {
    setJobId(null);
    setJobStatus(null);
    setJobProgress(0);
    setDownloadUrl(null);
    setErrorMsg(null);
    setElapsedTime(0);
  };

  const isExporting = jobStatus === "queued" || jobStatus === "processing";
  const exportDone = jobStatus === "completed";
  const planName = plan?.name || "Free";
  const watermarkRequired = plan?.watermark_required ?? true;

  if (!selectedProjectId) {
    return (
      <div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center gap-4 p-6">
        <FolderOpen className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Proje Seçin</h2>
        <p className="text-muted-foreground">Dışa aktarmak için bir proje seçin</p>
        <Select value="" onValueChange={(v) => { setSelectedProjectId(v); router.replace(`/export?project=${v}`); }}>
          <SelectTrigger className="w-[300px]"><SelectValue placeholder="Proje seçin..." /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push(`/editor?project=${selectedProjectId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dışa Aktar</h1>
            <p className="text-sm text-muted-foreground">Çevrilmiş altyazılarla videonuzu dışa aktarın</p>
          </div>
        </div>
        <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v); router.replace(`/export?project=${v}`); resetExport(); }}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Settings */}
        <div className="lg:col-span-2 space-y-4">
          {/* Subtitle mode */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Subtitles className="h-4 w-4 text-primary" />
                Altyazı Modu
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={subtitleMode} onValueChange={setSubtitleMode}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="burn_in" disabled={isExporting}>Burn-in (Gömülü)</TabsTrigger>
                  <TabsTrigger value="soft_sub" disabled={isExporting}>Soft-Sub (Ayrı)</TabsTrigger>
                </TabsList>
                <TabsContent value="burn_in" className="mt-4">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start gap-2">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Burn-in Modu</p>
                        <p className="text-xs text-muted-foreground">Altyazılar videoya kalıcı olarak yazılır. Tüm oynatıcılarda görünür.</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="soft_sub" className="mt-4">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-start gap-2">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium">Soft-Sub Modu</p>
                        <p className="text-xs text-muted-foreground">Altyazılar ayrı parça olarak eklenir. MKV formatında. Açılıp kapatılabilir.</p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Video settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Film className="h-4 w-4 text-primary" />
                Video Ayarları
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Çözünürlük</Label>
                  <Select value={resolution} onValueChange={setResolution} disabled={isExporting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="original">Orijinal{project?.width ? ` (${project.width}x${project.height})` : ""}</SelectItem>
                      <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                      <SelectItem value="720p">720p (HD)</SelectItem>
                      <SelectItem value="480p">480p (SD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Video Codec</Label>
                  <Select value={videoCodec} onValueChange={setVideoCodec} disabled={isExporting || subtitleMode === "soft_sub"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="h264">H.264 (Uyumlu)</SelectItem>
                      <SelectItem value="h265">H.265 (Küçük boyut)</SelectItem>
                      <SelectItem value="copy">Kopyala (Hızlı)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audio settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Volume2 className="h-4 w-4 text-primary" />
                Ses Ayarları
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Ses Codec</Label>
                  <Select value={audioCodec} onValueChange={setAudioCodec} disabled={isExporting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="aac">AAC</SelectItem>
                      <SelectItem value="opus">Opus</SelectItem>
                      <SelectItem value="copy">Kopyala (Hızlı)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Tüm Ses Parçaları</Label>
                    <p className="text-xs text-muted-foreground">Orijinal ses parçalarını koru</p>
                  </div>
                  <Switch checked={keepAudioTracks} onCheckedChange={setKeepAudioTracks} disabled={isExporting} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Watermark */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4 text-primary" />
                Filigran
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Filigran Ekle</Label>
                  <p className="text-xs text-muted-foreground">
                    {watermarkRequired ? "Free planda filigran zorunludur" : "Videoya metin filigranı ekle"}
                  </p>
                </div>
                <Switch checked={includeWatermark || watermarkRequired} onCheckedChange={setIncludeWatermark} disabled={watermarkRequired || isExporting} />
              </div>
              {(includeWatermark || watermarkRequired) && (
                <div className="space-y-2">
                  <Label>Filigran Metni</Label>
                  <Input value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} placeholder="Filigran metni..." disabled={isExporting} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delivery method */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-4 w-4 text-primary" />
                Teslim Yöntemi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    deliveryMethod === "download"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-accent"
                  }`}
                  onClick={() => setDeliveryMethod("download")}
                  disabled={isExporting}
                >
                  <Download className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Dosyayı İndir</p>
                    <p className="text-xs text-muted-foreground">Video encode edilip tarayıcıdan indirilir</p>
                  </div>
                </button>
                <button
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    deliveryMethod === "storage"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : hasUserStorage ? "hover:bg-accent" : "opacity-50 cursor-not-allowed"
                  }`}
                  onClick={() => hasUserStorage && setDeliveryMethod("storage")}
                  disabled={isExporting || !hasUserStorage}
                >
                  <HardDrive className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Kendi Depolamanıza Yükle</p>
                    <p className="text-xs text-muted-foreground">
                      {checkingStorage
                        ? "Kontrol ediliyor..."
                        : hasUserStorage
                          ? "Video encode edilip kendi R2/B2 depolamanıza yüklenir"
                          : "Henüz depolama yapılandırmanız yok"}
                    </p>
                    {!hasUserStorage && !checkingStorage && (
                      <Button variant="link" className="h-auto p-0 text-xs mt-1" asChild onClick={(e) => e.stopPropagation()}>
                        <Link href="/settings">Ayarlar → Depolama</Link>
                      </Button>
                    )}
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Summary + Action */}
        <div className="space-y-4">
          {/* Project info */}
          {project && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />
                  Proje Bilgisi
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ad</span>
                  <span className="font-medium truncate ml-2 max-w-[140px]">{project.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dosya</span>
                  <span className="truncate ml-2 max-w-[140px] text-xs">{project.file_name}</span>
                </div>
                {project.duration_seconds > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Süre</span>
                    <span>{formatDuration(project.duration_seconds)}</span>
                  </div>
                )}
                {project.width > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Çözünürlük</span>
                    <span>{project.width}x{project.height}</span>
                  </div>
                )}
                {project.file_size_bytes > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Boyut</span>
                    <span>{formatBytes(project.file_size_bytes)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Satır</span>
                  <span>{project.translated_lines}/{project.total_lines} çevrildi</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Export summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileVideo className="h-4 w-4 text-primary" />
                Dışa Aktarma Özeti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Altyazı Modu</span>
                  <Badge variant="secondary" className="text-xs">{subtitleMode === "burn_in" ? "Burn-in" : "Soft-Sub"}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Çözünürlük</span>
                  <span>{resolution === "original" ? "Orijinal" : resolution}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Video Codec</span>
                  <span>{videoCodec === "copy" ? "Kopyala" : videoCodec.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ses Codec</span>
                  <span>{audioCodec === "copy" ? "Kopyala" : audioCodec.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Filigran</span>
                  <span>{includeWatermark || watermarkRequired ? watermarkText : "Yok"}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Teslim</span>
                  <Badge variant="outline" className="text-xs">
                    {deliveryMethod === "download" ? "İndir" : "Depolamaya Yükle"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action card */}
          <Card>
            <CardContent className="pt-6">
              {!isExporting && !exportDone && !errorMsg && jobStatus !== "cancelled" ? (
                <Button className="w-full" size="lg" onClick={startExport} disabled={!project}>
                  <Download className="mr-2 h-5 w-5" />
                  Dışa Aktarmayı Başlat
                </Button>
              ) : isExporting ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {jobProgress < 5
                          ? "Başlatılıyor..."
                          : jobProgress < 20
                            ? "Video indiriliyor..."
                            : jobProgress < 30
                              ? "Altyazı hazırlanıyor..."
                              : jobProgress < 90
                                ? "Video encode ediliyor..."
                                : jobProgress < 95
                                  ? "Sunucuya yükleniyor..."
                                  : "Tamamlanıyor..."}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDuration(elapsedTime)}</span>
                      </div>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{jobProgress}%</span>
                  </div>
                  <Progress value={jobProgress} className="h-2" />
                  <Button variant="outline" className="w-full" onClick={cancelExport}>İptal Et</Button>
                </div>
              ) : errorMsg ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm text-destructive">{errorMsg}</p>
                  </div>
                  <Button className="w-full" onClick={resetExport}>Tekrar Dene</Button>
                </div>
              ) : jobStatus === "cancelled" ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <p className="text-sm text-amber-600">Dışa aktarma iptal edildi.</p>
                  </div>
                  <Button className="w-full" onClick={resetExport}>Yeni Dışa Aktarma</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">Dışa aktarma tamamlandı!</p>
                      <p className="text-xs text-muted-foreground">
                        {elapsedTime > 0 && `${formatDuration(elapsedTime)} sürdü`}
                      </p>
                    </div>
                  </div>
                  {downloadUrl && deliveryMethod === "download" && (
                    <Button className="w-full" size="lg" asChild>
                      <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-2 h-5 w-5" />
                        Videoyu İndir
                      </a>
                    </Button>
                  )}
                  {downloadUrl && deliveryMethod === "storage" && (
                    <div className="space-y-2">
                      <Button className="w-full" size="lg" onClick={handleUploadToStorage}>
                        <HardDrive className="mr-2 h-5 w-5" />
                        Depolamaya Yüklendi Olarak İşaretle
                      </Button>
                      <Button variant="outline" className="w-full" asChild>
                        <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                          <Download className="mr-2 h-4 w-4" />
                          Yine de İndir
                        </a>
                      </Button>
                    </div>
                  )}
                  <Button variant="ghost" className="w-full" onClick={resetExport}>
                    Yeni Dışa Aktarma
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Plan info */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-2">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-medium">{planName} Plan</p>
                  <p className="text-xs text-muted-foreground">
                    {watermarkRequired
                      ? "720p maksimum çözünürlük, filigran zorunlu. Daha yüksek kalite için Pro plana yükseltin."
                      : `${plan?.max_export_resolution || "1080p"} maksimum çözünürlük.`}
                  </p>
                  {watermarkRequired && (
                    <Button variant="link" className="h-auto p-0 text-xs" asChild>
                      <Link href="/settings">Planı Yükselt →</Link>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
