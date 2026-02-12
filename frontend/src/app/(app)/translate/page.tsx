"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useFetchOnFocus } from "@/hooks/use-fetch-on-focus";
import { getLangLabel } from "@/lib/utils";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Languages,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Loader2,
  XCircle,
  FolderOpen,
  AlertTriangle,
  Key,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type Project, type SubtitleLine, type SubtitleTrack, type TranslationJob } from "@/lib/api";
import { useAuthContext } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const ALL_ENGINES = [
  { id: "openai", name: "OpenAI GPT-4", description: "En yüksek kalite, bağlam duyarlı çeviri", badge: "Önerilen" },
  { id: "deepl", name: "DeepL Pro", description: "Hızlı ve doğal çeviri", badge: "Hızlı" },
  { id: "gemini", name: "Google Gemini", description: "Çok dilli destek, uygun fiyat", badge: "Ekonomik" },
];

export default function TranslatePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <TranslatePageInner />
    </Suspense>
  );
}

function TranslatePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get("project");
  const { plan } = useAuthContext();
  const supabase = createClient();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [project, setProject] = useState<Project | null>(null);
  const [allSubtitles, setAllSubtitles] = useState<SubtitleLine[]>([]);
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [selectedEngine, setSelectedEngine] = useState("openai");
  const [targetLang, setTargetLang] = useState("tr");
  const [glossaryEnabled, setGlossaryEnabled] = useState(false);
  const [contextEnabled, setContextEnabled] = useState(true);

  // User API keys
  const [userApiKeys, setUserApiKeys] = useState<Record<string, boolean>>({});

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isFreePlan = !plan || plan.id === "free";

  // Filter subtitles by selected track
  const subtitles = useMemo(() => {
    if (!selectedTrackId) return allSubtitles;
    return allSubtitles.filter((s) => s.subtitle_file_id === selectedTrackId);
  }, [allSubtitles, selectedTrackId]);

  // Selected track info
  const selectedTrack = useMemo(() => {
    return tracks.find((t) => t.id === selectedTrackId) || null;
  }, [tracks, selectedTrackId]);

  // Load projects list (refreshes on navigation back)
  const { data: fetchedProjects } = useFetchOnFocus(
    () => api.listProjects(),
    { pathPrefix: "/translate" }
  );
  useEffect(() => {
    if (fetchedProjects) setProjects(fetchedProjects);
  }, [fetchedProjects]);

  // Load user API keys
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase.from("user_api_keys").select("engine, api_key_encrypted").eq("user_id", data.user.id).then(({ data: keys }) => {
        const map: Record<string, boolean> = {};
        for (const k of (keys || []) as Array<{ engine: string; api_key_encrypted: string | null }>) {
          if (k.api_key_encrypted) map[k.engine] = true;
        }
        setUserApiKeys(map);
      });
    });
  }, []);

  // Load selected project + subtitles + tracks
  useEffect(() => {
    if (!selectedProjectId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.getProject(selectedProjectId),
      api.getSubtitles(selectedProjectId),
      api.getSubtitleTracks(selectedProjectId),
    ]).then(([proj, subs, trks]) => {
      setProject(proj);
      setAllSubtitles(subs);
      setTracks(trks);
      // Auto-select first track
      if (trks.length > 0) {
        setSelectedTrackId(trks[0].id);
      }
      if (proj.target_lang) setTargetLang(proj.target_lang);
    }).catch(() => toast.error("Proje yüklenemedi."))
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  // Poll job status
  const startPolling = useCallback((jid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job = await api.getTranslationJob(jid);
        setJobStatus(job.status);
        setJobProgress(job.progress);
        if (job.status === "completed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          toast.success("Çeviri tamamlandı!");
          // Refresh both subtitles and project data
          const [subs, proj] = await Promise.all([
            api.getSubtitles(selectedProjectId),
            api.getProject(selectedProjectId),
          ]);
          setAllSubtitles(subs);
          setProject(proj);
        } else if (job.status === "failed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          toast.error(job.error_message || "Çeviri başarısız.");
        }
      } catch { /* ignore */ }
    }, 2000);
  }, [selectedProjectId]);

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const startTranslation = async () => {
    if (!selectedProjectId || !selectedTrackId) return;
    const track = tracks.find((t) => t.id === selectedTrackId);
    if (!track) return;

    try {
      const result = await api.createTranslationJob({
        project_id: selectedProjectId,
        subtitle_file_id: selectedTrackId,
        engine: selectedEngine as "openai" | "deepl" | "gemini",
        source_lang: track.language,
        target_lang: targetLang,
        context_enabled: contextEnabled,
        glossary_enabled: glossaryEnabled,
      });
      setJobId(result.id);
      setJobStatus("queued");
      setJobProgress(0);
      toast.info("Çeviri başlatıldı...");
      startPolling(result.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Çeviri başlatılamadı.");
    }
  };

  const cancelTranslation = async () => {
    if (!jobId) return;
    try {
      await api.cancelTranslationJob(jobId);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setJobStatus("cancelled");
      toast.info("Çeviri iptal edildi.");
    } catch { /* ignore */ }
  };

  const isTranslating = jobStatus === "queued" || jobStatus === "processing";
  const translatedCount = subtitles.filter((s) => s.is_translated).length;

  // Check if selected engine has a user key
  const hasUserKey = userApiKeys[selectedEngine] || false;
  const canUseEngine = hasUserKey || !isFreePlan;

  if (!selectedProjectId) {
    return (
      <div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center gap-4 p-6">
        <FolderOpen className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Proje Seçin</h2>
        <p className="text-muted-foreground">Çeviri yapmak için bir proje seçin</p>
        <Select value="" onValueChange={(v) => { setSelectedProjectId(v); router.replace(`/translate?project=${v}`); }}>
          <SelectTrigger className="w-[300px]"><SelectValue placeholder="Proje seçin..." /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name} ({p.total_lines} satır)</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v); router.replace(`/translate?project=${v}`); }}>
            <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {subtitles.length} satır • {translatedCount} çevrildi
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isTranslating && (
            <div className="flex items-center gap-2">
              <Progress value={jobProgress} className="h-2 w-24" />
              <span className="text-xs text-muted-foreground">{jobProgress}%</span>
              <Button size="sm" variant="ghost" onClick={cancelTranslation}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          )}
          {translatedCount === subtitles.length && subtitles.length > 0 && !isTranslating && (
            <Button size="sm" onClick={() => router.push(`/editor?project=${selectedProjectId}`)}>
              Editöre Git <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          <Button size="sm" onClick={startTranslation} disabled={isTranslating || loading || !canUseEngine || !selectedTrackId}>
            {isTranslating ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Çevriliyor...</>
            ) : (
              <><Sparkles className="mr-1.5 h-3.5 w-3.5" />{translatedCount > 0 ? "Tekrar Çevir" : "Çeviriyi Başlat"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - settings */}
        <div className="w-[400px] shrink-0 overflow-y-auto border-r">
          <div className="flex flex-col gap-2 p-4">
            {/* KAYNAK ALTYAZI SEÇİMİ */}
            <div className="rounded-lg border p-4">
              <p className="mb-3 text-xs font-semibold text-muted-foreground">KAYNAK ALTYAZI</p>
              {tracks.length > 0 ? (
                <Select value={selectedTrackId} onValueChange={setSelectedTrackId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Altyazı seçin..." /></SelectTrigger>
                  <SelectContent>
                    {tracks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {getLangLabel(t.language)} — {t.format.toUpperCase()} ({t.total_lines} satır)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">Bu projede altyazı parçası bulunamadı.</p>
              )}
              {selectedTrack && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Kaynak: <span className="font-medium text-foreground">{getLangLabel(selectedTrack.language)}</span> • {selectedTrack.total_lines} satır
                </p>
              )}
            </div>

            {/* HEDEF DİL */}
            <div className="rounded-lg border p-4">
              <p className="mb-3 text-xs font-semibold text-muted-foreground">HEDEF DİL</p>
              <Select value={targetLang} onValueChange={setTargetLang}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
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
                  <SelectItem value="ru">Rusça</SelectItem>
                  <SelectItem value="it">İtalyanca</SelectItem>
                  <SelectItem value="pt">Portekizce</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ÇEVİRİ MOTORU */}
            <div className="space-y-2 rounded-lg border p-4">
              <p className="text-xs font-semibold text-muted-foreground">ÇEVİRİ MOTORU</p>

              {/* Kullanıcının kendi key'leri olan motorlar */}
              {ALL_ENGINES.filter((e) => userApiKeys[e.id]).length > 0 && (
                <div className="mb-1">
                  <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-green-600">
                    <Key className="h-3 w-3" /> Kendi API Anahtarlarınız
                  </p>
                  {ALL_ENGINES.filter((e) => userApiKeys[e.id]).map((engine) => (
                    <div
                      key={engine.id}
                      className={`mb-1 flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        selectedEngine === engine.id ? "border-primary bg-primary/5" : "hover:bg-accent"
                      }`}
                      onClick={() => setSelectedEngine(engine.id)}
                    >
                      <div className={`h-3 w-3 shrink-0 rounded-full border-2 ${
                        selectedEngine === engine.id ? "border-primary bg-primary" : "border-muted-foreground/50"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{engine.name}</span>
                          <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">Kendi Key</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{engine.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Sistem API motorları */}
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                  <Languages className="h-3 w-3" /> Sistem API
                </p>
                {isFreePlan && (
                  <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      Free planda sistem API kullanılamaz. Kendi API anahtarınızı <button className="font-medium underline" onClick={() => router.push("/settings")}>Ayarlar</button>’dan ekleyin veya ücretli plana geçin.
                    </p>
                  </div>
                )}
                {ALL_ENGINES.filter((e) => !userApiKeys[e.id]).map((engine) => (
                  <div
                    key={engine.id}
                    className={`mb-1 flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                      isFreePlan ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                    } ${
                      selectedEngine === engine.id && !isFreePlan ? "border-primary bg-primary/5" : "hover:bg-accent"
                    }`}
                    onClick={() => { if (!isFreePlan) setSelectedEngine(engine.id); }}
                  >
                    <div className={`h-3 w-3 shrink-0 rounded-full border-2 ${
                      selectedEngine === engine.id && !isFreePlan ? "border-primary bg-primary" : "border-muted-foreground/50"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{engine.name}</span>
                        <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px]">{engine.badge}</Badge>
                        {isFreePlan && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{engine.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* GELİŞMİŞ */}
            <div className="space-y-3 rounded-lg border p-4">
              <p className="text-xs font-semibold text-muted-foreground">GELİŞMİŞ</p>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-sm">Bağlam Duyarlı</Label>
                  <p className="text-xs text-muted-foreground">Önceki satırları bağlam olarak kullan</p>
                </div>
                <Switch checked={contextEnabled} onCheckedChange={setContextEnabled} />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="text-sm">Sözlük</Label>
                  <p className="text-xs text-muted-foreground">Özel terim sözlüğü kullan</p>
                </div>
                <Switch checked={glossaryEnabled} onCheckedChange={setGlossaryEnabled} />
              </div>
            </div>
          </div>
        </div>

        {/* Right - Translation table */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="grid shrink-0 grid-cols-[40px_1fr_1fr] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>#</span>
            <span>Orijinal {selectedTrack ? `(${getLangLabel(selectedTrack.language)})` : ""}</span>
            <span>Çeviri ({getLangLabel(targetLang)})</span>
          </div>

          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : subtitles.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                <AlertTriangle className="h-8 w-8" />
                <p className="text-sm">Seçilen altyazı parçasında satır bulunamadı.</p>
              </div>
            ) : (
              <div className="divide-y">
                {subtitles.map((sub) => (
                  <div
                    key={sub.id}
                    className={`grid grid-cols-[40px_1fr_1fr] gap-3 px-4 py-2.5 text-sm transition-colors ${
                      sub.is_translated ? "bg-green-500/5" : "hover:bg-accent"
                    }`}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{sub.line_number}</span>
                    <div className="min-w-0 overflow-hidden">
                      <p className="overflow-hidden text-ellipsis text-sm">{sub.original_text}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{sub.start_time} → {sub.end_time}</p>
                    </div>
                    <div className="flex min-w-0 items-start gap-1.5 overflow-hidden">
                      {sub.translated_text ? (
                        <>
                          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                          <span className="overflow-hidden text-ellipsis">{sub.translated_text}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
