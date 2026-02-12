"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useFetchOnFocus } from "@/hooks/use-fetch-on-focus";
import {
  Subtitles,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Save,
  Download,
  Eye,
  Palette,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Loader2,
  FolderOpen,
  Upload,
  Search,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, type Project, type SubtitleLine } from "@/lib/api";
import { useAuthContext } from "@/components/auth-provider";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Popular Google Fonts list
const GOOGLE_FONTS = [
  "Roboto", "Open Sans", "Noto Sans", "Lato", "Montserrat", "Poppins",
  "Inter", "Oswald", "Raleway", "Nunito", "Ubuntu", "Rubik",
  "Noto Sans JP", "Noto Sans KR", "Noto Sans TC", "Noto Sans SC",
  "Source Sans 3", "PT Sans", "Merriweather", "Playfair Display",
  "Fira Sans", "Barlow", "Mulish", "Quicksand", "Titillium Web",
  "Karla", "Cabin", "Libre Franklin", "Work Sans", "DM Sans",
  "Josefin Sans", "Archivo", "Manrope", "Outfit", "Lexend",
  "Space Grotesk", "Plus Jakarta Sans", "Sora", "Albert Sans",
  "Figtree", "Geist", "Onest", "Wix Madefor Display",
  "Bebas Neue", "Anton", "Righteous", "Bangers", "Permanent Marker",
  "Pacifico", "Lobster", "Dancing Script", "Caveat",
  "Noto Serif", "Noto Serif JP", "Noto Serif KR",
  "Source Serif 4", "Crimson Text", "Bitter", "Lora",
  "IBM Plex Sans", "IBM Plex Mono", "JetBrains Mono", "Fira Code",
  "Arial", "Helvetica", "Times New Roman", "Georgia", "Verdana", "Courier New",
];

const loadedFonts = new Set<string>();
function loadGoogleFont(fontName: string) {
  // Skip system fonts
  const systemFonts = ["Arial", "Helvetica", "Times New Roman", "Georgia", "Verdana", "Courier New"];
  if (systemFonts.includes(fontName) || loadedFonts.has(fontName)) return;
  loadedFonts.add(fontName);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

/** Debounced color state hook — prevents re-render on every pixel drag */
function useDebouncedColor(initial: string, delay = 50): [string, string, (v: string) => void] {
  const [committed, setCommitted] = useState(initial);
  const [live, setLive] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useCallback((v: string) => {
    setLive(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCommitted(v), delay);
  }, [delay]);
  return [committed, live, update];
}

/** Parse SRT time "HH:MM:SS,mmm" or "HH:MM:SS.mmm" to seconds */
function srtTimeToSeconds(t: string): number {
  const clean = t.replace(",", ".").trim();
  const parts = clean.split(":");
  if (parts.length !== 3) return 0;
  const h = parseFloat(parts[0]);
  const m = parseFloat(parts[1]);
  const s = parseFloat(parts[2]);
  return h * 3600 + m * 60 + s;
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
      <EditorPageInner />
    </Suspense>
  );
}

function EditorPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get("project");
  const { user } = useAuthContext();

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState<SubtitleLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(true);

  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState<string>("");
  const [videoRect, setVideoRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Style settings
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState(24);
  const [fontColor, fontColorLive, setFontColor] = useDebouncedColor("#FFFFFF");
  const [outlineColor, outlineColorLive, setOutlineColor] = useDebouncedColor("#000000");
  const [outlineWidth, setOutlineWidth] = useState(2);
  const [shadowColor, shadowColorLive, setShadowColor] = useDebouncedColor("#000000");
  const [shadowDepth, setShadowDepth] = useState(1);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [alignment, setAlignment] = useState("center");
  const [marginV, setMarginV] = useState(30);
  const [bgOpacity, setBgOpacity] = useState(0.6);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [fontSearch, setFontSearch] = useState("");
  const [showFontPicker, setShowFontPicker] = useState(false);
  const fontPickerRef = useRef<HTMLDivElement>(null);

  // Filter fonts based on search
  const filteredFonts = useMemo(() => {
    if (!fontSearch.trim()) return GOOGLE_FONTS;
    const q = fontSearch.toLowerCase();
    return GOOGLE_FONTS.filter(f => f.toLowerCase().includes(q));
  }, [fontSearch]);

  // Load selected font
  useEffect(() => { loadGoogleFont(fontFamily); }, [fontFamily]);

  // Close font picker on outside click
  useEffect(() => {
    if (!showFontPicker) return;
    const handler = (e: MouseEvent) => {
      if (fontPickerRef.current && !fontPickerRef.current.contains(e.target as Node)) {
        setShowFontPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFontPicker]);

  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});

  // Export
  const [exporting, setExporting] = useState(false);

  // Scroll ref for auto-scrolling subtitle list
  const lineRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Calculate actual video render rect inside the object-contain container
  const updateVideoRect = useCallback(() => {
    const video = videoRef.current;
    const container = videoContainerRef.current;
    if (!video || !container || !video.videoWidth || !video.videoHeight) {
      setVideoRect(null);
      return;
    }
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const containerRatio = cw / ch;
    const videoRatio = vw / vh;
    let renderW: number, renderH: number;
    if (videoRatio > containerRatio) {
      // Video is wider than container → pillarbox (black bars top/bottom)
      renderW = cw;
      renderH = cw / videoRatio;
    } else {
      // Video is taller → letterbox (black bars left/right)
      renderH = ch;
      renderW = ch * videoRatio;
    }
    setVideoRect({
      top: (ch - renderH) / 2,
      left: (cw - renderW) / 2,
      width: renderW,
      height: renderH,
    });
  }, []);

  // Recalculate video rect on resize
  useEffect(() => {
    const container = videoContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => updateVideoRect());
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateVideoRect]);

  // Load projects list (refreshes on navigation back)
  const { data: fetchedProjects } = useFetchOnFocus(
    () => api.listProjects(),
    { pathPrefix: "/editor" }
  );
  useEffect(() => {
    if (fetchedProjects) setProjects(fetchedProjects);
  }, [fetchedProjects]);

  useEffect(() => {
    if (!selectedProjectId) { setLoading(false); return; }
    setLoading(true);
    setPendingEdits({});
    Promise.all([
      api.getProject(selectedProjectId),
      api.getSubtitles(selectedProjectId),
    ]).then(([proj, subs]) => {
      setProject(proj);
      setLines(subs);
      if (subs.length > 0) setSelectedLineId(subs[0].id);
    }).catch(() => toast.error("Proje yüklenemedi."))
      .finally(() => setLoading(false));
  }, [selectedProjectId]);

  // Pre-compute time ranges for O(1) subtitle lookup instead of O(n) find on every frame
  const timeIndex = useMemo(() => {
    return lines.map((l) => ({
      id: l.id,
      start: srtTimeToSeconds(l.start_time),
      end: srtTimeToSeconds(l.end_time),
      text: l.translated_text || l.original_text,
    }));
  }, [lines]);

  // Video time update → find active subtitle using pre-computed index
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);

    const active = timeIndex.find((l) => t >= l.start && t <= l.end);

    if (active) {
      setActiveSubtitle(active.text);
      if (active.id !== selectedLineId) {
        setSelectedLineId(active.id);
        lineRefs.current[active.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else {
      setActiveSubtitle("");
    }
  }, [timeIndex, selectedLineId]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const skipLines = (dir: number) => {
    const idx = lines.findIndex((l) => l.id === selectedLineId);
    const next = idx + dir;
    if (next >= 0 && next < lines.length) {
      const line = lines[next];
      setSelectedLineId(line.id);
      seekTo(srtTimeToSeconds(line.start_time));
      lineRefs.current[line.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleVolumeChange = (val: number[]) => {
    const v = val[0];
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
    setIsMuted(v === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const currentLine = lines.find((l) => l.id === selectedLineId);

  const updateTranslation = (id: string, text: string) => {
    setLines((prev) => prev.map((l) => l.id === id ? { ...l, translated_text: text } : l));
    setPendingEdits((prev) => ({ ...prev, [id]: text }));
  };

  const saveAll = async () => {
    const edits = Object.entries(pendingEdits);
    if (edits.length === 0) { toast.info("Değişiklik yok."); return; }
    setSaving(true);
    try {
      const editMap: Record<string, string> = {};
      for (const [lineId, text] of edits) {
        editMap[lineId] = text;
      }
      const result = await api.batchUpdateSubtitles(selectedProjectId, editMap);
      setPendingEdits({});
      toast.success(`${result.updated} satır kaydedildi.`);
    } catch {
      toast.error("Kaydetme başarısız.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadSrt = async () => {
    try {
      const result = await api.exportSrt(selectedProjectId, true);
      const blob = new Blob([result.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("SRT dosyası indirildi.");
    } catch {
      toast.error("SRT indirme başarısız.");
    }
  };

  const handleExportClick = async () => {
    setExporting(true);
    try {
      // Save pending edits before navigating
      if (Object.keys(pendingEdits).length > 0) {
        await api.batchUpdateSubtitles(selectedProjectId, pendingEdits);
        setPendingEdits({});
      }
    } catch {
      toast.error("Kaydetme başarısız, yine de dışa aktarma sayfasına gidiliyor.");
    }
    // Save subtitle style to localStorage so export page can use it for burn-in
    const alignmentMap: Record<string, number> = { left: 1, center: 2, right: 3 };
    const subtitleStyle = {
      font_family: fontFamily,
      font_size: fontSize,
      font_color: fontColor,
      bold: isBold,
      italic: isItalic,
      outline_width: outlineWidth,
      outline_color: outlineColor,
      shadow_depth: shadowDepth,
      shadow_color: shadowColor,
      alignment: alignmentMap[alignment] || 2,
      margin_v: marginV,
      bg_opacity: bgOpacity,
      letter_spacing: letterSpacing,
    };
    try { localStorage.setItem("export_subtitle_style", JSON.stringify(subtitleStyle)); } catch { /* ignore */ }
    setExporting(false);
    router.push(`/export?project=${selectedProjectId}`);
  };

  // Video source URL
  const videoUrl = project?.video_url ? `${API_BASE}${project.video_url}` : null;

  if (!selectedProjectId) {
    return (
      <div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center gap-4 p-6">
        <FolderOpen className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-bold">Proje Seçin</h2>
        <p className="text-muted-foreground">Düzenlemek için bir proje seçin</p>
        <Select value="" onValueChange={(v) => { setSelectedProjectId(v); router.replace(`/editor?project=${v}`); }}>
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

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v); router.replace(`/editor?project=${v}`); }}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="text-xs">{lines.length} satır</Badge>
          {Object.keys(pendingEdits).length > 0 && (
            <Badge variant="outline" className="text-xs text-amber-500">{Object.keys(pendingEdits).length} değişiklik</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={saveAll} disabled={saving || Object.keys(pendingEdits).length === 0}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
            Kaydet
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadSrt}>
            <Download className="mr-1 h-3.5 w-3.5" />
            SRT İndir
          </Button>
          <Button size="sm" onClick={handleExportClick}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            Dışa Aktar
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Video player */}
        <div className="flex w-[55%] flex-col border-r">
          <div ref={videoContainerRef} className="relative flex-1 bg-black">
            {videoUrl ? (
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-contain"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    setDuration(videoRef.current.duration);
                    updateVideoRect();
                  }
                }}
                onResize={() => updateVideoRect()}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                preload="metadata"
              >
                <source src={videoUrl} />
              </video>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Subtitles className="mx-auto mb-2 h-12 w-12 opacity-30" />
                  <p className="text-sm opacity-50">Video dosyası yok (sadece altyazı projesi)</p>
                </div>
              </div>
            )}
            {/* Subtitle overlay - positioned relative to actual video render area */}
            <div
              className="pointer-events-none absolute flex items-end justify-center"
              style={videoRect ? {
                top: `${videoRect.top}px`,
                left: `${videoRect.left}px`,
                width: `${videoRect.width}px`,
                height: `${videoRect.height}px`,
                paddingBottom: `${marginV}px`,
              } : {
                inset: 0,
                paddingBottom: `${marginV}px`,
              }}
            >
              <div
                className="max-w-[80%] rounded px-3 py-1 text-center"
                style={{
                  fontFamily,
                  fontSize: `${fontSize}px`,
                  color: fontColor,
                  fontWeight: isBold ? "bold" : "normal",
                  fontStyle: isItalic ? "italic" : "normal",
                  textShadow: `${shadowDepth}px ${shadowDepth}px 0 ${shadowColor}`,
                  WebkitTextStroke: `${outlineWidth * 0.3}px ${outlineColor}`,
                  textAlign: alignment as "left" | "center" | "right",
                  visibility: activeSubtitle || (!videoUrl && currentLine) ? "visible" : "hidden",
                  backgroundColor: `rgba(0, 0, 0, ${bgOpacity})`,
                  letterSpacing: `${letterSpacing}px`,
                }}
              >
                {activeSubtitle || currentLine?.translated_text || currentLine?.original_text || ""}
              </div>
            </div>
          </div>
          {/* Video controls */}
          <div className="flex flex-col gap-1 border-t bg-muted/30 px-4 py-2">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={([v]) => seekTo(v)}
              className="w-full"
            />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => skipLines(-1)}>
                <SkipBack className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlay}>
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => skipLines(1)}>
                <SkipForward className="h-4 w-4" />
              </Button>
              <span className="font-mono text-xs text-muted-foreground">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <div className="flex-1" />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleMute}>
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.05}
                onValueChange={handleVolumeChange}
                className="w-24"
              />
            </div>
          </div>
        </div>

        {/* Right: Subtitle list + style */}
        <div className="flex w-[45%] flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-xs font-semibold text-muted-foreground">ALTYAZI SATIRLARI</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowOriginal(!showOriginal)}>
                <Eye className="mr-1 h-3 w-3" />
                {showOriginal ? "Orijinali Gizle" : "Orijinali Göster"}
              </Button>
            </div>
            <ScrollArea className="h-[calc(100%-37px)]">
              <div className="divide-y">
                {lines.map((line) => (
                  <div
                    key={line.id}
                    ref={(el) => { lineRefs.current[line.id] = el; }}
                    className={`cursor-pointer px-4 py-2 transition-colors ${
                      selectedLineId === line.id ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-accent"
                    }`}
                    onClick={() => {
                      setSelectedLineId(line.id);
                      seekTo(srtTimeToSeconds(line.start_time));
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-muted-foreground">#{line.line_number}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{line.start_time} → {line.end_time}</span>
                      {line.id in pendingEdits && (
                        <Badge variant="outline" className="h-4 text-[9px] text-amber-500 px-1">düzenlendi</Badge>
                      )}
                    </div>
                    {showOriginal && (
                      <p className="text-xs text-muted-foreground mb-0.5">{line.original_text}</p>
                    )}
                    <Textarea
                      value={line.translated_text || ""}
                      onChange={(e) => updateTranslation(line.id, e.target.value)}
                      className="min-h-[36px] resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                      rows={1}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Style settings */}
          <div className="shrink-0 border-t">
            <div className="flex items-center gap-2 border-b px-4 py-2">
              <Palette className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground">STİL AYARLARI</span>
            </div>
            <ScrollArea className="max-h-[320px]">
              <div className="grid grid-cols-2 gap-3 p-4">
                {/* Font picker with search */}
                <div className="col-span-2 space-y-1 relative" ref={fontPickerRef}>
                  <Label className="text-[10px]">Font</Label>
                  <Button
                    variant="outline"
                    className="h-8 w-full justify-between text-xs"
                    onClick={() => setShowFontPicker(!showFontPicker)}
                  >
                    <span style={{ fontFamily }} className="truncate">{fontFamily}</span>
                    <Type className="h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                  {showFontPicker && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-lg">
                      <div className="flex items-center gap-2 border-b px-3 py-2">
                        <Search className="h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          autoFocus
                          value={fontSearch}
                          onChange={(e) => setFontSearch(e.target.value)}
                          placeholder="Font ara..."
                          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                        />
                      </div>
                      <div className="max-h-[200px] overflow-y-auto p-1">
                        {filteredFonts.map((font) => {
                          loadGoogleFont(font);
                          return (
                            <button
                              key={font}
                              className={`w-full rounded px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
                                fontFamily === font ? "bg-primary/10 font-medium text-primary" : ""
                              }`}
                              style={{ fontFamily: font }}
                              onClick={() => { setFontFamily(font); setShowFontPicker(false); setFontSearch(""); }}
                            >
                              {font}
                            </button>
                          );
                        })}
                        {filteredFonts.length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">Sonuç bulunamadı</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Boyut: {fontSize}px</Label>
                  <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v)} min={12} max={72} step={1} className="mt-2" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Harf Aralığı: {letterSpacing}px</Label>
                  <Slider value={[letterSpacing]} onValueChange={([v]) => setLetterSpacing(v)} min={-2} max={10} step={0.5} className="mt-2" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Yazı Rengi</Label>
                  <div className="flex gap-2">
                    <input type="color" value={fontColorLive} onChange={(e) => setFontColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border p-0.5" />
                    <Input value={fontColorLive} onChange={(e) => setFontColor(e.target.value)} className="h-8 flex-1 font-mono text-xs" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Arkaplan: {Math.round(bgOpacity * 100)}%</Label>
                  <Slider value={[bgOpacity]} onValueChange={([v]) => setBgOpacity(v)} min={0} max={1} step={0.05} className="mt-2" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Çerçeve: {outlineWidth}px</Label>
                  <div className="flex gap-2">
                    <input type="color" value={outlineColorLive} onChange={(e) => setOutlineColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border p-0.5" />
                    <Slider value={[outlineWidth]} onValueChange={([v]) => setOutlineWidth(v)} min={0} max={5} step={0.5} className="flex-1 mt-2" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Gölge: {shadowDepth}px</Label>
                  <div className="flex gap-2">
                    <input type="color" value={shadowColorLive} onChange={(e) => setShadowColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border p-0.5" />
                    <Slider value={[shadowDepth]} onValueChange={([v]) => setShadowDepth(v)} min={0} max={5} step={0.5} className="flex-1 mt-2" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Konum: {marginV}px</Label>
                  <Slider value={[marginV]} onValueChange={([v]) => setMarginV(v)} min={0} max={100} step={1} className="mt-2" />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <Button variant={isBold ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setIsBold(!isBold)}>
                    <Bold className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant={isItalic ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setIsItalic(!isItalic)}>
                    <Italic className="h-3.5 w-3.5" />
                  </Button>
                  <Separator orientation="vertical" className="h-6" />
                  <Button variant={alignment === "left" ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setAlignment("left")}>
                    <AlignLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant={alignment === "center" ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setAlignment("center")}>
                    <AlignCenter className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant={alignment === "right" ? "default" : "outline"} size="icon" className="h-8 w-8" onClick={() => setAlignment("right")}>
                    <AlignRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

    </div>
  );
}
