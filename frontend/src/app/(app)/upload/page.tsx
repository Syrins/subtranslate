"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  FileVideo,
  FileText,
  X,
  CheckCircle2,
  ArrowRight,
  HardDrive,
  Info,
  Loader2,
  AlertCircle,
  Languages,
  Music,
  Subtitles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuthContext } from "@/components/auth-provider";
import { toast } from "sonner";
import { formatBytes, getLangLabel } from "@/lib/utils";

interface TrackInfo {
  index: number;
  stream_index: number;
  codec: string;
  language: string;
  title?: string;
  channels?: number;
}

const subtitleExts = [".srt", ".ass", ".ssa", ".vtt"];

export default function UploadPage() {
  const router = useRouter();
  const { profile, plan, refreshProfile } = useAuthContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "processing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [projectName, setProjectName] = useState("");
  const [targetLang, setTargetLang] = useState("tr");
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [totalLines, setTotalLines] = useState(0);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackInfo[]>([]);
  const [audioTracks, setAudioTracks] = useState<TrackInfo[]>([]);
  const [detectedSourceLang, setDetectedSourceLang] = useState<string | null>(null);

  const storageUsed = profile?.storage_used_bytes || 0;
  const storageMax = (plan?.storage_gb || 5) * 1024 * 1024 * 1024;
  const dailyUsed = profile?.daily_jobs_used || 0;
  const dailyLimit = plan?.daily_job_limit || 3;
  const retentionDays = plan?.retention_days || 1;

  const isSubtitleFile = (name: string) => subtitleExts.some((ext) => name.toLowerCase().endsWith(ext));

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) pickFile(e.dataTransfer.files[0]);
  }, []);

  const pickFile = (file: File) => {
    setSelectedFile(file);
    setUploadStatus("idle");
    setErrorMsg("");
    setCreatedProjectId(null);
    if (!projectName) {
      setProjectName(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) pickFile(e.target.files[0]);
  };

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const startPolling = (projectId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const project = await api.getProject(projectId);
        if (project.status === "ready") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setUploadStatus("done");
          setTotalLines(project.total_lines || 0);
          setUploading(false);
          toast.success(`Proje hazır! ${project.total_lines} altyazı satırı bulundu.`);
          await refreshProfile();
        } else if (project.status === "failed") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          setUploadStatus("error");
          setErrorMsg("Dosya işlenirken bir hata oluştu.");
          setUploading(false);
          toast.error("Dosya işlenirken bir hata oluştu.");
        }
      } catch {
        // Polling error, keep trying
      }
    }, 2000);
  };

  const handleUpload = async () => {
    if (!selectedFile || !projectName.trim()) return;

    if (dailyUsed >= dailyLimit) {
      toast.error("Günlük yükleme limitinize ulaştınız.");
      return;
    }

    setUploading(true);
    setUploadStatus("uploading");
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("name", projectName.trim());

      let result: Record<string, unknown>;
      if (isSubtitleFile(selectedFile.name)) {
        // Subtitle files need target lang
        formData.append("target_lang", targetLang);
        result = await api.createSubtitleProject(formData) as Record<string, unknown>;
        setUploadStatus("done");
        setCreatedProjectId(result.id as string);
        setTotalLines((result.total_lines as number) || 0);
        toast.success(`Proje oluşturuldu! ${result.total_lines} satır bulundu.`);
        setUploading(false);
        await refreshProfile();
      } else {
        // Video files: no lang params needed, detected from MKV
        setUploadStatus("processing");
        result = await api.createProject(formData) as Record<string, unknown>;
        setCreatedProjectId(result.id as string);
        startPolling(result.id as string);
      }
    } catch (err: unknown) {
      setUploadStatus("error");
      const msg = err instanceof Error ? err.message : "Yükleme başarısız.";
      setErrorMsg(msg);
      toast.error(msg);
      setUploading(false);
    }
  };

  const clearFile = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    setSelectedFile(null);
    setUploadStatus("idle");
    setUploading(false);
    setErrorMsg("");
    setCreatedProjectId(null);
    setProjectName("");
    setSubtitleTracks([]);
    setAudioTracks([]);
    setDetectedSourceLang(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dosya Yükle</h1>
        <p className="text-muted-foreground">
          Video veya altyazı dosyanızı yükleyerek proje oluşturun
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-6">
              {!selectedFile ? (
                <div
                  className={`relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 transition-colors ${
                    dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Upload className="h-8 w-8 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-medium">Dosyayı sürükleyip bırakın</p>
                    <p className="text-sm text-muted-foreground">veya dosya seçmek için tıklayın</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">MKV</Badge>
                    <Badge variant="secondary">MP4</Badge>
                    <Badge variant="secondary">AVI</Badge>
                    <Badge variant="secondary">SRT</Badge>
                    <Badge variant="secondary">ASS</Badge>
                    <Badge variant="secondary">VTT</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Maksimum dosya boyutu: 2 GB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mkv,.mp4,.avi,.srt,.ass,.ssa,.vtt"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    onChange={handleFileInput}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-4 rounded-lg border p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      {isSubtitleFile(selectedFile.name) ? (
                        <FileText className="h-6 w-6 text-primary" />
                      ) : (
                        <FileVideo className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{selectedFile.name}</p>
                      <p className="text-sm text-muted-foreground">{formatBytes(selectedFile.size)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {uploadStatus === "done" && (
                        <Badge className="bg-green-500/10 text-green-500">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Hazır
                        </Badge>
                      )}
                      {uploadStatus === "error" && (
                        <Badge variant="destructive">
                          <AlertCircle className="mr-1 h-3 w-3" />
                          Hata
                        </Badge>
                      )}
                      {(uploadStatus === "uploading" || uploadStatus === "processing") && (
                        <Badge variant="secondary">
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          {uploadStatus === "uploading" ? "Yükleniyor..." : "İşleniyor..."}
                        </Badge>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearFile} disabled={uploading}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {uploadStatus === "idle" && (
                    <div className="space-y-4 rounded-lg border p-4">
                      <div className="space-y-2">
                        <Label>Proje Adı</Label>
                        <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Proje adı girin" />
                      </div>
                      {isSubtitleFile(selectedFile.name) && (
                        <div className="space-y-2">
                          <Label>Hedef Dil</Label>
                          <Select value={targetLang} onValueChange={setTargetLang}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="tr">Türkçe</SelectItem>
                              <SelectItem value="en">İngilizce</SelectItem>
                              <SelectItem value="ja">Japonca</SelectItem>
                              <SelectItem value="ko">Korece</SelectItem>
                              <SelectItem value="zh">Çince</SelectItem>
                              <SelectItem value="fr">Fransızca</SelectItem>
                              <SelectItem value="de">Almanca</SelectItem>
                              <SelectItem value="es">İspanyolca</SelectItem>
                              <SelectItem value="ar">Arapça</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <Button className="w-full" onClick={handleUpload} disabled={!projectName.trim()}>
                        <Upload className="mr-2 h-4 w-4" />
                        Yükle ve Proje Oluştur
                      </Button>
                    </div>
                  )}

                  {(uploadStatus === "uploading" || uploadStatus === "processing") && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {uploadStatus === "uploading" ? "Dosya yükleniyor..." : "Altyazılar çıkarılıyor..."}
                        </span>
                      </div>
                      <Progress value={uploadStatus === "uploading" ? 50 : 80} className="h-2" />
                    </div>
                  )}

                  {uploadStatus === "error" && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                      <p className="text-sm text-destructive">{errorMsg}</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setUploadStatus("idle")}>
                        Tekrar Dene
                      </Button>
                    </div>
                  )}

                  {uploadStatus === "done" && createdProjectId && (
                    <div className="space-y-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <p className="font-medium">Proje başarıyla oluşturuldu!</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{totalLines} altyazı satırı bulundu.</p>

                      {subtitleTracks.length > 0 && (
                        <div className="space-y-2">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <Subtitles className="h-4 w-4 text-primary" />
                            Altyazı Parçaları ({subtitleTracks.length})
                          </p>
                          <div className="space-y-1">
                            {subtitleTracks.map((t, i) => (
                              <div key={i} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-sm">
                                <Badge variant="outline" className="text-[10px]">{t.codec.toUpperCase()}</Badge>
                                <span className="font-medium">{getLangLabel(t.language)}</span>
                                {t.title && <span className="text-muted-foreground">— {t.title}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {audioTracks.length > 0 && (
                        <div className="space-y-2">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <Music className="h-4 w-4 text-primary" />
                            Ses Parçaları ({audioTracks.length})
                          </p>
                          <div className="space-y-1">
                            {audioTracks.map((t, i) => (
                              <div key={i} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-sm">
                                <Badge variant="outline" className="text-[10px]">{t.codec.toUpperCase()}</Badge>
                                <span className="font-medium">{getLangLabel(t.language)}</span>
                                {t.channels && <span className="text-muted-foreground">{t.channels}ch</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {detectedSourceLang && (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Languages className="h-4 w-4" />
                          Kaynak dil otomatik algılandı: <span className="font-medium text-foreground">{getLangLabel(detectedSourceLang)}</span>
                        </p>
                      )}

                      <div className="flex gap-2">
                        <Button onClick={() => router.push(`/translate?project=${createdProjectId}`)}>
                          Çeviriye Devam Et
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                        <Button variant="outline" onClick={() => router.push(`/editor?project=${createdProjectId}`)}>
                          Editöre Git
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Info className="h-4 w-4 text-primary" />
                Nasıl Çalışır?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 justify-center rounded-full p-0">1</Badge>
                <p>Video veya altyazı dosyanızı yükleyin</p>
              </div>
              <div className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 justify-center rounded-full p-0">2</Badge>
                <p>Sistem otomatik olarak altyazıları tespit eder ve çıkarır</p>
              </div>
              <div className="flex gap-3">
                <Badge variant="outline" className="h-6 w-6 shrink-0 justify-center rounded-full p-0">3</Badge>
                <p>Çeviri sayfasına geçerek AI ile çevirin</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-4 w-4 text-primary" />
                Depolama
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Kullanılan</span>
                <span>{formatBytes(storageUsed)} / {formatBytes(storageMax)}</span>
              </div>
              <Progress value={storageMax > 0 ? (storageUsed / storageMax) * 100 : 0} className="h-2" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Günlük Yükleme</span>
                <span>{dailyUsed} / {dailyLimit}</span>
              </div>
              <Progress value={dailyLimit > 0 ? (dailyUsed / dailyLimit) * 100 : 0} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Dosyalar {retentionDays} gün sonra otomatik silinir ({plan?.name || "Free"} Plan)
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
