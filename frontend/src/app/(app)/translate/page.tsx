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
  Search,
  ChevronsUpDown,
  Check,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { api, type SubtitleLine, type SubtitleTrack } from "@/lib/api";
import { useAuthContext } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const ALL_ENGINES = [
  {
    id: "openai", name: "OpenAI", description: "GPT-5, GPT-4.1 ve diğer modeller", badge: "Önerilen",
    allowCustomModel: false,
    models: [
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini (Önerilen)" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "gpt-5-nano", label: "GPT-5 Nano" },
      { id: "gpt-5-mini", label: "GPT-5 Mini" },
      { id: "gpt-5", label: "GPT-5" },
      { id: "gpt-5.2", label: "GPT-5.2" },
    ],
  },
  {
    id: "openrouter", name: "OpenRouter", description: "Yüzlerce modele tek API ile erişin", badge: "Çok Model",
    allowCustomModel: true,
    models: [
      { id: "openai/gpt-4.1-mini", label: "OpenAI GPT-4.1 Mini" },
      { id: "openai/gpt-4.1", label: "OpenAI GPT-4.1" },
      { id: "openai/gpt-4o", label: "OpenAI GPT-4o" },
      { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini" },
      { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
      { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "deepseek/deepseek-chat-v3", label: "DeepSeek V3" },
      { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
    ],
  },
  {
    id: "gemini", name: "Google Gemini", description: "Gemini 2.5 ve 3 modelleri", badge: "Ekonomik",
    allowCustomModel: false,
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (Önerilen)" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash (Preview)" },
      { id: "gemini-3-pro-preview", label: "Gemini 3 Pro (Preview)" },
    ],
  },
  {
    id: "deepl", name: "DeepL Pro", description: "Hızlı ve doğal çeviri", badge: "Hızlı",
    allowCustomModel: false,
    models: [],
  },
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
  const { plan, loading: authLoading } = useAuthContext();
  const supabase = createClient();

  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [allSubtitles, setAllSubtitles] = useState<SubtitleLine[]>([]);
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string>("");
  const [loading, setLoading] = useState(Boolean(projectId));

  const [selectedEngine, setSelectedEngine] = useState("openai");
  const [selectedModel, setSelectedModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
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
  const {
    data: fetchedProjects,
    loading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useFetchOnFocus(
    () => api.listProjects(),
    { pathPrefix: "/translate", dedupMs: 0 }
  );
  const projects = fetchedProjects ?? [];

  useEffect(() => {
    if (!authLoading) {
      refetchProjects();
    }
  }, [authLoading, refetchProjects]);

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
  }, [supabase]);

  const loadSelectedProjectData = useCallback(async (pid: string) => {
    setLoading(true);
    try {
      const [proj, subs, trks] = await Promise.all([
        api.getProject(pid),
        api.getSubtitles(pid),
        api.getSubtitleTracks(pid),
      ]);
      setAllSubtitles(subs);
      setTracks(trks);
      if (trks.length > 0) {
        setSelectedTrackId(trks[0].id);
      }
      if (proj.target_lang) setTargetLang(proj.target_lang);
    } catch {
      toast.error("Proje yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load selected project + subtitles + tracks
  useEffect(() => {
    if (!selectedProjectId) return;
    void loadSelectedProjectData(selectedProjectId);
  }, [selectedProjectId, loadSelectedProjectData]);

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
          // Refresh subtitles after translation
          const subs = await api.getSubtitles(selectedProjectId);
          setAllSubtitles(subs);
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
      const resolvedModel = selectedModel === "_custom" ? customModel : selectedModel;
      const result = await api.createTranslationJob({
        project_id: selectedProjectId,
        subtitle_file_id: selectedTrackId,
        engine: selectedEngine as "openai" | "deepl" | "gemini" | "openrouter",
        model_id: resolvedModel || undefined,
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
    if (authLoading || (projectsLoading && fetchedProjects === undefined)) {
      return (
        <div className="flex h-[calc(100vh-3rem)] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (projectsError) {
      return (
        <div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center gap-4 p-6">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-xl font-bold">Projeler yuklenemedi</h2>
          <p className="text-sm text-muted-foreground">Lutfen tekrar deneyin.</p>
          <Button onClick={() => refetchProjects()}>
            Tekrar Dene
          </Button>
        </div>
      );
    }

    if (projects.length === 0) {
      return (
        <div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center gap-4 p-6 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-bold">Henuz proje yok</h2>
          <p className="text-muted-foreground">Ceviriye baslamak icin once bir proje olusturun.</p>
          <Button onClick={() => router.push("/upload")}>
            Proje Olustur
          </Button>
        </div>
      );
    }

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
    <div className="-mt-px flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
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
                      onClick={() => { setSelectedEngine(engine.id); setSelectedModel(""); setCustomModel(""); setModelSearch(""); }}
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
                      Free planda sistem API kullanılamaz. Kendi API anahtarınızı <button className="font-medium underline" onClick={() => router.push("/settings")}>Ayarlar</button>&apos;dan ekleyin veya ücretli plana geçin.
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
                    onClick={() => { if (!isFreePlan) { setSelectedEngine(engine.id); setSelectedModel(""); setCustomModel(""); setModelSearch(""); } }}
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

            {/* MODEL SEÇİMİ */}
            {(() => {
              const currentEngine = ALL_ENGINES.find((e) => e.id === selectedEngine);
              if (!currentEngine || currentEngine.models.length === 0) return null;
              const filteredModels = currentEngine.models.filter((m) =>
                m.label.toLowerCase().includes(modelSearch.toLowerCase()) ||
                m.id.toLowerCase().includes(modelSearch.toLowerCase())
              );
              const selectedLabel = selectedModel === "_custom"
                ? (customModel || "Özel model...")
                : currentEngine.models.find((m) => m.id === selectedModel)?.label || "Varsayılan";
              return (
                <div className="space-y-2 rounded-lg border p-4">
                  <p className="text-xs font-semibold text-muted-foreground">MODEL SEÇİMİ</p>
                  <Popover open={modelPopoverOpen} onOpenChange={setModelPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-9 w-full justify-between text-xs font-normal">
                        <span className="truncate">{selectedLabel}</span>
                        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <div className="flex items-center border-b px-3 py-2">
                        <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                        <input
                          placeholder="Model ara..."
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                        />
                      </div>
                      <ScrollArea className="max-h-56">
                        <div className="p-1">
                          <button
                            className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${!selectedModel ? "bg-accent" : ""}`}
                            onClick={() => { setSelectedModel(""); setCustomModel(""); setModelSearch(""); setModelPopoverOpen(false); }}
                          >
                            <Check className={`h-3 w-3 ${!selectedModel ? "opacity-100" : "opacity-0"}`} />
                            Varsayılan
                          </button>
                          {filteredModels.map((m) => (
                            <button
                              key={m.id}
                              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${selectedModel === m.id ? "bg-accent" : ""}`}
                              onClick={() => { setSelectedModel(m.id); setCustomModel(""); setModelSearch(""); setModelPopoverOpen(false); }}
                            >
                              <Check className={`h-3 w-3 ${selectedModel === m.id ? "opacity-100" : "opacity-0"}`} />
                              {m.label}
                            </button>
                          ))}
                          {currentEngine.allowCustomModel && (
                            <button
                              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${selectedModel === "_custom" ? "bg-accent" : ""}`}
                              onClick={() => { setSelectedModel("_custom"); setModelSearch(""); setModelPopoverOpen(false); }}
                            >
                              <Check className={`h-3 w-3 ${selectedModel === "_custom" ? "opacity-100" : "opacity-0"}`} />
                              Özel model gir...
                            </button>
                          )}
                          {filteredModels.length === 0 && !currentEngine.allowCustomModel && (
                            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Sonuç bulunamadı</p>
                          )}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                  {selectedModel === "_custom" && (
                    <input
                      type="text"
                      placeholder="Örn: openai/gpt-4o-mini"
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Boş bırakırsanız motorun varsayılan modeli kullanılır
                  </p>
                </div>
              );
            })()}

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
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden pr-4">
          <div
            className="grid shrink-0 gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground"
            style={{ gridTemplateColumns: "40px minmax(0, 1fr) minmax(0, 1fr)" }}
          >
            <span>#</span>
            <span>Orijinal {selectedTrack ? `(${getLangLabel(selectedTrack.language)})` : ""}</span>
            <span>Çeviri ({getLangLabel(targetLang)})</span>
          </div>

          <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
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
              <div className="space-y-1 p-2">
                {subtitles.map((sub) => (
                  <div
                    key={sub.id}
                    className={`grid min-w-0 rounded-md gap-3 px-4 py-2.5 text-sm transition-colors ${
                      sub.is_translated ? "bg-green-500/8" : "hover:bg-accent/50"
                    }`}
                    style={{ gridTemplateColumns: "40px minmax(0, 1fr) minmax(0, 1fr)" }}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{sub.line_number}</span>
                    <div className="min-w-0 overflow-hidden">
                      <div className="translate-cell-scroll min-w-0 w-full overflow-x-auto overflow-y-hidden rounded-md">
                        <p className="inline-block min-w-full whitespace-nowrap px-1 text-sm">{sub.original_text}</p>
                      </div>
                      <p className="font-mono text-[10px] text-muted-foreground">{sub.start_time} → {sub.end_time}</p>
                    </div>
                    <div className="flex min-w-0 items-start gap-1.5 overflow-hidden">
                      {sub.translated_text ? (
                        <>
                          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                          <div className="translate-cell-scroll min-w-0 w-full flex-1 overflow-x-auto overflow-y-hidden rounded-md">
                            <p className="inline-block min-w-full whitespace-nowrap px-1">{sub.translated_text}</p>
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

