"use client";

import { useState, useEffect, useRef, useCallback, useMemo, Suspense, memo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
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
  Palette,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, type Project, type SubtitleLine, type SubtitleTrack } from "@/lib/api";
import { cn } from "@/lib/utils";
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
function useDebouncedColor(initial: string, delay = 50): [string, string, (v: string) => void, (v: string) => void] {
  const [committed, setCommitted] = useState(initial);
  const [live, setLive] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useCallback((v: string) => {
    setLive(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCommitted(v), delay);
  }, [delay]);
  const reset = useCallback((v: string) => {
    setCommitted(v);
    setLive(v);
  }, []);
  return [committed, live, update, reset];
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

/** Convert seconds back to SRT time "HH:MM:SS,mmm" */
function secondsToSrtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatTrackLabel(track: SubtitleTrack): string {
  const lang = (track.language || "und").toUpperCase();
  return `#${track.track_index} ${lang} (${track.total_lines} satir)`;
}

function getSubtitleMemoryKeys(line: Pick<SubtitleLine, "line_number" | "start_time" | "end_time">): string[] {
  return [
    `time:${line.start_time}|${line.end_time}`,
    `line:${line.line_number}`,
  ];
}

// --- LocalStorage edit tracking ---
type LineEdit = {
  translated_text?: string;
  start_time?: string;
  end_time?: string;
};
type ProjectEdits = {
  edits: Record<string, LineEdit>;
  updated_at: string;
};

function getEditsStorageKey(projectId: string, trackId: string): string {
  return `editor_edits_${projectId}_${trackId}`;
}

function loadEditsFromStorage(projectId: string, trackId: string): Record<string, LineEdit> {
  try {
    const raw = localStorage.getItem(getEditsStorageKey(projectId, trackId));
    if (!raw) return {};
    const parsed: ProjectEdits = JSON.parse(raw);
    return parsed.edits || {};
  } catch { return {}; }
}

function saveEditsToStorage(projectId: string, trackId: string, edits: Record<string, LineEdit>): void {
  try {
    const data: ProjectEdits = { edits, updated_at: new Date().toISOString() };
    localStorage.setItem(getEditsStorageKey(projectId, trackId), JSON.stringify(data));
  } catch { /* ignore */ }
}

function clearEditsFromStorage(projectId: string, trackId: string): void {
  try { localStorage.removeItem(getEditsStorageKey(projectId, trackId)); } catch { /* ignore */ }
}

type VideoRect = { top: number; left: number; width: number; height: number } | null;

type SubtitleOverlayStyle = {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  isBold: boolean;
  isItalic: boolean;
  shadowDepth: number;
  shadowColor: string;
  outlineWidth: number;
  outlineColor: string;
  alignment: "left" | "center" | "right";
  bgOpacity: number;
  letterSpacing: number;
};

const SubtitleOverlay = memo(function SubtitleOverlay({
  videoRect,
  marginV,
  activeSubtitle,
  fallbackSubtitle,
  stylePreset,
}: {
  videoRect: VideoRect;
  marginV: number;
  activeSubtitle: string;
  fallbackSubtitle: string;
  stylePreset: SubtitleOverlayStyle;
}) {
  const text = activeSubtitle || fallbackSubtitle || "";

  return (
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
          fontFamily: stylePreset.fontFamily,
          fontSize: `${stylePreset.fontSize}px`,
          color: stylePreset.fontColor,
          fontWeight: stylePreset.isBold ? "bold" : "normal",
          fontStyle: stylePreset.isItalic ? "italic" : "normal",
          textShadow: `${stylePreset.shadowDepth}px ${stylePreset.shadowDepth}px 0 ${stylePreset.shadowColor}`,
          WebkitTextStroke: `${stylePreset.outlineWidth * 0.3}px ${stylePreset.outlineColor}`,
          textAlign: stylePreset.alignment,
          visibility: text ? "visible" : "hidden",
          backgroundColor: `rgba(0, 0, 0, ${stylePreset.bgOpacity})`,
          letterSpacing: `${stylePreset.letterSpacing}px`,
        }}
      >
        {text}
      </div>
    </div>
  );
});

const SubtitleListPanel = memo(function SubtitleListPanel({
  lines,
  tracks,
  selectedTrackId,
  selectedLineId,
  showOriginal,
  isTrackLoading,
  pendingEdits,
  lineRefs,
  onTrackChange,
  onShowOriginalChange,
  onSelectLine,
  onUpdateTranslation,
  onUpdateTiming,
}: {
  lines: SubtitleLine[];
  tracks: SubtitleTrack[];
  selectedTrackId: string;
  selectedLineId: string | null;
  showOriginal: boolean;
  isTrackLoading: boolean;
  pendingEdits: Record<string, LineEdit>;
  lineRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  onTrackChange: (trackId: string) => void;
  onShowOriginalChange: (show: boolean) => void;
  onSelectLine: (lineId: string, startTime: string) => void;
  onUpdateTranslation: (lineId: string, text: string) => void;
  onUpdateTiming: (lineId: string, field: "start_time" | "end_time", value: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="space-y-2 border-b px-4 py-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-muted-foreground">ALTYAZI SATIRLARI</span>
          <Select value={showOriginal ? "show" : "hide"} onValueChange={(v) => onShowOriginalChange(v === "show")}>
            <SelectTrigger className="h-7 w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="show">Orijinali Goster</SelectItem>
              <SelectItem value="hide">Orijinali Gizle</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {tracks.length > 0 && (
          <Select value={selectedTrackId} onValueChange={onTrackChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Altyazi track secin..." />
            </SelectTrigger>
            <SelectContent>
              {tracks.map((track) => (
                <SelectItem key={track.id} value={track.id}>
                  {formatTrackLabel(track)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isTrackLoading && (
        <div className="flex items-center justify-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Altyazi satirlari yukleniyor...
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="divide-y">
          {lines.map((line) => {
            const hasEdit = line.id in pendingEdits;
            const isSelected = selectedLineId === line.id;
            return (
              <div
                key={line.id}
                ref={(el) => { lineRefs.current[line.id] = el; }}
                className={`cursor-pointer px-4 py-2 transition-colors ${
                  isSelected ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-accent"
                }`}
                onClick={() => onSelectLine(line.id, line.start_time)}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">#{line.line_number}</span>
                  {hasEdit && (
                    <Badge variant="outline" className="h-4 px-1 text-[9px] text-amber-500">duzenlendi</Badge>
                  )}
                </div>
                {/* Timing inputs */}
                <div className="mb-1 flex items-center gap-1">
                  <input
                    type="text"
                    value={line.start_time}
                    onChange={(e) => onUpdateTiming(line.id, "start_time", e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-5 w-[105px] rounded border border-transparent bg-transparent px-1 font-mono text-[10px] text-muted-foreground hover:border-border focus:border-primary focus:outline-none"
                  />
                  <span className="text-[10px] text-muted-foreground/50">{"\u2192"}</span>
                  <input
                    type="text"
                    value={line.end_time}
                    onChange={(e) => onUpdateTiming(line.id, "end_time", e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-5 w-[105px] rounded border border-transparent bg-transparent px-1 font-mono text-[10px] text-muted-foreground hover:border-border focus:border-primary focus:outline-none"
                  />
                </div>
                {showOriginal && (
                  <p className="mb-0.5 text-xs text-muted-foreground">{line.original_text}</p>
                )}
                <Textarea
                  value={line.translated_text || ""}
                  onChange={(e) => onUpdateTranslation(line.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="min-h-[36px] resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                  rows={1}
                />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
});

const StyleSettingsPanel = memo(function StyleSettingsPanel({
  fontFamily,
  fontSearch,
  showFontPicker,
  filteredFonts,
  fontPickerRef,
  setFontFamily,
  setFontSearch,
  setShowFontPicker,
  fontSize,
  setFontSize,
  letterSpacing,
  setLetterSpacing,
  fontColorLive,
  setFontColor,
  bgOpacity,
  setBgOpacity,
  outlineColorLive,
  outlineWidth,
  setOutlineColor,
  setOutlineWidth,
  marginV,
  setMarginV,
  isBold,
  isItalic,
  setIsBold,
  setIsItalic,
  containerClassName,
}: {
  fontFamily: string;
  fontSearch: string;
  showFontPicker: boolean;
  filteredFonts: string[];
  fontPickerRef: MutableRefObject<HTMLDivElement | null>;
  setFontFamily: Dispatch<SetStateAction<string>>;
  setFontSearch: Dispatch<SetStateAction<string>>;
  setShowFontPicker: Dispatch<SetStateAction<boolean>>;
  fontSize: number;
  setFontSize: Dispatch<SetStateAction<number>>;
  letterSpacing: number;
  setLetterSpacing: Dispatch<SetStateAction<number>>;
  fontColorLive: string;
  setFontColor: (value: string) => void;
  bgOpacity: number;
  setBgOpacity: Dispatch<SetStateAction<number>>;
  outlineColorLive: string;
  outlineWidth: number;
  setOutlineColor: (value: string) => void;
  setOutlineWidth: Dispatch<SetStateAction<number>>;
  marginV: number;
  setMarginV: Dispatch<SetStateAction<number>>;
  isBold: boolean;
  isItalic: boolean;
  setIsBold: Dispatch<SetStateAction<boolean>>;
  setIsItalic: Dispatch<SetStateAction<boolean>>;
  containerClassName?: string;
}) {
  return (
    <div className={cn("flex min-h-0 shrink-0 flex-col border-t", containerClassName)}>
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Palette className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-muted-foreground">STIL AYARLARI</span>
      </div>
      <div className="px-5 py-4">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Font Ailesi (altyazi tipi)</Label>
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1" ref={fontPickerRef}>
                  <Button
                    variant="outline"
                    className="h-8 w-full justify-between text-sm"
                    onClick={() => setShowFontPicker((prev) => !prev)}
                  >
                    <span style={{ fontFamily }} className="truncate">{fontFamily}</span>
                    <Type className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                  {showFontPicker && (
                    <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                      <div className="flex items-center gap-2 border-b px-3 py-2">
                        <Search className="h-4 w-4 text-muted-foreground" />
                        <input
                          autoFocus
                          value={fontSearch}
                          onChange={(e) => setFontSearch(e.target.value)}
                          placeholder="Font ara..."
                          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                      </div>
                      <div className="max-h-[160px] overflow-y-auto p-1">
                        {filteredFonts.map((font) => {
                          loadGoogleFont(font);
                          return (
                            <button
                              key={font}
                              className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                                fontFamily === font ? "bg-primary/10 font-medium text-primary" : ""
                              }`}
                              style={{ fontFamily: font }}
                              onClick={() => {
                                setFontFamily(font);
                                setShowFontPicker(false);
                                setFontSearch("");
                              }}
                            >
                              {font}
                            </button>
                          );
                        })}
                        {filteredFonts.length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">Sonuc bulunamadi</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <Button variant={isBold ? "default" : "outline"} size="icon" className="h-8 w-8 shrink-0" onClick={() => setIsBold((prev) => !prev)}>
                  <Bold className="h-4 w-4" />
                </Button>
                <Button variant={isItalic ? "default" : "outline"} size="icon" className="h-8 w-8 shrink-0" onClick={() => setIsItalic((prev) => !prev)}>
                  <Italic className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Yazi Rengi (metin rengini degistirir)</Label>
              <div className="flex w-full items-center gap-2">
                <input type="color" value={fontColorLive} onChange={(e) => setFontColor(e.target.value)} className="h-8 w-10 shrink-0 cursor-pointer rounded border p-0.5" />
                <Input value={fontColorLive} onChange={(e) => setFontColor(e.target.value)} className="h-8 flex-1 font-mono text-xs" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Cerceve: {outlineWidth}px (okunurlugu artirir)</Label>
              <div className="flex w-full items-center gap-2">
                <input type="color" value={outlineColorLive} onChange={(e) => setOutlineColor(e.target.value)} className="h-8 w-10 shrink-0 cursor-pointer rounded border p-0.5" />
                <Slider value={[outlineWidth]} onValueChange={([v]) => setOutlineWidth(v)} min={0} max={5} step={0.5} className="flex-1" />
              </div>
            </div>

          </div>

          <div className="space-y-4 md:border-l md:pl-5">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Boyut: {fontSize}px (yaziyi buyutur/kucultur)</Label>
              <Slider value={[fontSize]} onValueChange={([v]) => setFontSize(v)} min={12} max={72} step={1} className="w-full" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Harf Araligi: {letterSpacing}px (harfler arasi mesafe)</Label>
              <Slider value={[letterSpacing]} onValueChange={([v]) => setLetterSpacing(v)} min={-2} max={10} step={0.5} className="w-full" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Arkaplan: {Math.round(bgOpacity * 100)}% (zemin opakligi)</Label>
              <Slider value={[bgOpacity]} onValueChange={([v]) => setBgOpacity(v)} min={0} max={1} step={0.05} className="w-full" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Konum: {marginV}px (alttan yukseklik)</Label>
              <Slider value={[marginV]} onValueChange={([v]) => setMarginV(v)} min={0} max={100} step={1} className="w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

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
  const { loading: authLoading } = useAuthContext();

  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [project, setProject] = useState<Project | null>(null);
  const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [lines, setLines] = useState<SubtitleLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackLoading, setTrackLoading] = useState(false);
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
  const [videoRect, setVideoRect] = useState<VideoRect>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState(16 / 9);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  // Style settings
  const [fontFamily, setFontFamily] = useState("Arial");
  const [fontSize, setFontSize] = useState(24);
  const [fontColor, fontColorLive, setFontColor, resetFontColor] = useDebouncedColor("#FFFFFF");
  const [outlineColor, outlineColorLive, setOutlineColor, resetOutlineColor] = useDebouncedColor("#000000");
  const [outlineWidth, setOutlineWidth] = useState(2);
  const shadowColor = "#000000";
  const shadowDepth = 0;
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const alignment: "left" | "center" | "right" = "center";
  const [marginV, setMarginV] = useState(30);
  const [bgOpacity, setBgOpacity] = useState(0.6);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [fontSearch, setFontSearch] = useState("");
  const [showFontPicker, setShowFontPicker] = useState(false);
  const fontPickerRef = useRef<HTMLDivElement>(null);
  const styleInitializedRef = useRef(false);

  // Load saved style from localStorage when project changes
  useEffect(() => {
    if (!selectedProjectId) return;
    styleInitializedRef.current = false;
    try {
      const raw = localStorage.getItem(`subtitle_style_${selectedProjectId}`);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.font_family) setFontFamily(s.font_family);
        if (s.font_size) setFontSize(s.font_size);
        if (s.font_color) resetFontColor(s.font_color);
        if (s.outline_color) resetOutlineColor(s.outline_color);
        if (s.outline_width !== undefined) setOutlineWidth(s.outline_width);
        if (s.bold !== undefined) setIsBold(s.bold);
        if (s.italic !== undefined) setIsItalic(s.italic);
        if (s.margin_v !== undefined) setMarginV(s.margin_v);
        if (s.bg_opacity !== undefined) setBgOpacity(s.bg_opacity);
        if (s.letter_spacing !== undefined) setLetterSpacing(s.letter_spacing);
      }
    } catch { /* ignore */ }
    // Small delay to avoid the initial state changes triggering a save
    const t = setTimeout(() => { styleInitializedRef.current = true; }, 100);
    return () => clearTimeout(t);
  }, [selectedProjectId, resetFontColor, resetOutlineColor]);

  // Auto-save style to localStorage whenever any style property changes
  useEffect(() => {
    if (!selectedProjectId || !styleInitializedRef.current) return;
    const style = {
      font_family: fontFamily,
      font_size: fontSize,
      font_color: fontColor,
      bold: isBold,
      italic: isItalic,
      outline_width: outlineWidth,
      outline_color: outlineColor,
      shadow_depth: 0,
      shadow_color: "#000000",
      alignment: 2,
      margin_v: marginV,
      bg_opacity: bgOpacity,
      letter_spacing: letterSpacing,
    };
    try {
      localStorage.setItem(`subtitle_style_${selectedProjectId}`, JSON.stringify(style));
      // Also update global key for backward compat with export page
      localStorage.setItem("export_subtitle_style", JSON.stringify(style));
    } catch { /* ignore */ }
  }, [selectedProjectId, fontFamily, fontSize, fontColor, isBold, isItalic, outlineWidth, outlineColor, marginV, bgOpacity, letterSpacing]);

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

  const [pendingEdits, setPendingEdits] = useState<Record<string, LineEdit>>({});
  const translationMemoryRef = useRef<Record<string, string>>({});

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

  useEffect(() => {
    updateVideoRect();
  }, [videoAspectRatio, updateVideoRect]);

  // Load projects list (refreshes on navigation back)
  const {
    data: fetchedProjects,
    loading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useFetchOnFocus(
    () => api.listProjects(),
    { pathPrefix: "/editor", dedupMs: 0 }
  );
  const projects = fetchedProjects ?? [];

  useEffect(() => {
    if (!authLoading) {
      refetchProjects();
    }
  }, [authLoading, refetchProjects]);

  useEffect(() => {
    if (!selectedProjectId) {
      setLoading(false);
      setTrackLoading(false);
      setVideoAspectRatio(16 / 9);
      setProject(null);
      setTracks([]);
      setSelectedTrackId("");
      setLines([]);
      setSelectedLineId(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setTrackLoading(false);
    setPendingEdits({});
    setVideoAspectRatio(16 / 9);
    translationMemoryRef.current = {};
    setTracks([]);
    setLines([]);
    setSelectedLineId(null);

    Promise.all([
      api.getProject(selectedProjectId),
      api.getSubtitleTracks(selectedProjectId),
    ])
      .then(([proj, projectTracks]) => {
        if (cancelled) return;

        setProject(proj);
        setTracks(projectTracks);

        setSelectedTrackId((prev) => {
          if (prev && projectTracks.some((track) => track.id === prev)) {
            return prev;
          }
          return projectTracks[0]?.id || "";
        });

        if (projectTracks.length === 0) {
          setLines([]);
          setSelectedLineId(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Proje yuklenemedi.");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId || !selectedTrackId) return;

    let cancelled = false;
    setTrackLoading(true);
    setPendingEdits({});

    api.getSubtitles(selectedProjectId, selectedTrackId)
      .then((subs) => {
        if (cancelled) return;
        const memory = translationMemoryRef.current;

        for (const line of subs) {
          const translated = line.translated_text?.trim();
          if (!translated) continue;
          for (const key of getSubtitleMemoryKeys(line)) {
            memory[key] = translated;
          }
        }

        const mergedSubs = subs.map((line) => {
          const translated = line.translated_text?.trim();
          if (translated) return line;

          for (const key of getSubtitleMemoryKeys(line)) {
            const remembered = memory[key];
            if (remembered) {
              return { ...line, translated_text: remembered };
            }
          }
          return line;
        });

        // Restore unsaved edits from localStorage
        const savedEdits = loadEditsFromStorage(selectedProjectId, selectedTrackId);
        if (Object.keys(savedEdits).length > 0) {
          const restoredSubs = mergedSubs.map((line) => {
            const edit = savedEdits[line.id];
            if (!edit) return line;
            return {
              ...line,
              ...(edit.translated_text !== undefined ? { translated_text: edit.translated_text } : {}),
              ...(edit.start_time !== undefined ? { start_time: edit.start_time } : {}),
              ...(edit.end_time !== undefined ? { end_time: edit.end_time } : {}),
            };
          });
          setLines(restoredSubs);
          setPendingEdits(savedEdits);
        } else {
          setLines(mergedSubs);
        }
        setSelectedLineId(mergedSubs.length > 0 ? mergedSubs[0].id : null);
      })
      .catch(() => {
        if (!cancelled) toast.error("Altyazi satirlari yuklenemedi.");
      })
      .finally(() => {
        if (!cancelled) {
          setTrackLoading(false);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, selectedTrackId]);

  // Auto-save pending edits to localStorage on every change
  const pendingEditsRef = useRef(pendingEdits);
  pendingEditsRef.current = pendingEdits;
  useEffect(() => {
    if (!selectedProjectId || !selectedTrackId) return;
    const timer = setTimeout(() => {
      if (Object.keys(pendingEditsRef.current).length > 0) {
        saveEditsToStorage(selectedProjectId, selectedTrackId, pendingEditsRef.current);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [pendingEdits, selectedProjectId, selectedTrackId]);

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
  const lastTimeUiRef = useRef(0);
  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    if (Math.abs(t - lastTimeUiRef.current) >= 0.04) {
      setCurrentTime(t);
      lastTimeUiRef.current = t;
    }

    // Use a half-open interval [start, end) to avoid boundary overlap between adjacent lines.
    const active = timeIndex.find((l) => t >= l.start && t < l.end);

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

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekTo = useCallback((seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const skipLines = useCallback((dir: number) => {
    const idx = lines.findIndex((l) => l.id === selectedLineId);
    const next = idx + dir;
    if (next >= 0 && next < lines.length) {
      const line = lines[next];
      setSelectedLineId(line.id);
      seekTo(srtTimeToSeconds(line.start_time));
      lineRefs.current[line.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [lines, seekTo, selectedLineId]);

  const handleVolumeChange = useCallback((val: number[]) => {
    const v = val[0];
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
    setIsMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    if (isMuted) {
      videoRef.current.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      videoRef.current.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const currentLine = useMemo(
    () => lines.find((l) => l.id === selectedLineId),
    [lines, selectedLineId]
  );

  const updateTranslation = useCallback((id: string, text: string) => {
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;

      for (const key of getSubtitleMemoryKeys(l)) {
        if (text.trim()) {
          translationMemoryRef.current[key] = text;
        } else {
          delete translationMemoryRef.current[key];
        }
      }
      return { ...l, translated_text: text };
    }));
    setPendingEdits((prev) => {
      const existing = prev[id] || {};
      return { ...prev, [id]: { ...existing, translated_text: text } };
    });
  }, []);

  const updateTiming = useCallback((id: string, field: "start_time" | "end_time", value: string) => {
    setLines((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      return { ...l, [field]: value };
    }));
    setPendingEdits((prev) => {
      const existing = prev[id] || {};
      return { ...prev, [id]: { ...existing, [field]: value } };
    });
  }, []);

  const handleLineSelect = useCallback((lineId: string, startTime: string) => {
    setSelectedLineId(lineId);
    seekTo(srtTimeToSeconds(startTime));
  }, [seekTo]);

  const handleShowOriginalChange = useCallback((show: boolean) => {
    setShowOriginal(show);
  }, []);

  const handleTrackChange = useCallback((trackId: string) => {
    if (trackId === selectedTrackId) return;
    setSelectedTrackId(trackId);
  }, [selectedTrackId]);

  const saveAll = async () => {
    const editEntries = Object.entries(pendingEdits);
    if (editEntries.length === 0) { toast.info("Değişiklik yok."); return; }
    setSaving(true);
    try {
      const editMap: Record<string, LineEdit> = {};
      for (const [lineId, edit] of editEntries) {
        editMap[lineId] = edit;
      }
      const result = await api.batchUpdateSubtitles(selectedProjectId, editMap);
      setPendingEdits({});
      if (selectedTrackId) clearEditsFromStorage(selectedProjectId, selectedTrackId);
      toast.success(`${result.updated} satır kaydedildi.`);
    } catch {
      toast.error("Kaydetme başarısız.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadSrt = async () => {
    try {
      const result = await api.exportSrt(selectedProjectId, true, selectedTrackId || undefined);
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
    try {
      // Save pending edits before navigating
      if (Object.keys(pendingEdits).length > 0) {
        await api.batchUpdateSubtitles(selectedProjectId, pendingEdits);
        setPendingEdits({});
        if (selectedTrackId) clearEditsFromStorage(selectedProjectId, selectedTrackId);
      }
    } catch {
      // If backend save fails, ensure localStorage has the edits so export page can read them
      if (selectedTrackId) saveEditsToStorage(selectedProjectId, selectedTrackId, pendingEdits);
      toast.error("Kaydetme başarısız, yine de dışa aktarma sayfasına gidiliyor.");
    }
    // Style is already auto-saved to localStorage via useEffect, just navigate
    router.push(`/export?project=${selectedProjectId}&track=${selectedTrackId}`);
  };

  // Video source URL — use videoSrc (which may be overridden by web preview)
  const videoUrl = videoSrc || (project?.video_url ? `${API_BASE}${project.video_url}` : null);

  // Request web preview (shared helper)
  const previewRequestedRef = useRef(false);
  const requestWebPreview = useCallback(() => {
    if (previewRequestedRef.current || previewLoading || !selectedProjectId) return;
    previewRequestedRef.current = true;
    setPreviewLoading(true);
    setVideoError("Tarayici uyumlu format olusturuluyor...");
    api.createWebPreview(selectedProjectId)
      .then((result) => {
        if (result.video_url) {
          setVideoSrc(`${API_BASE}${result.video_url}`);
          setVideoError(null);
        } else {
          setVideoError("Video oynatma desteklenmiyor.");
        }
      })
      .catch(() => {
        setVideoError("Video onizleme olusturulamadi.");
      })
      .finally(() => setPreviewLoading(false));
  }, [selectedProjectId, previewLoading]);

  // Set initial videoSrc when project loads + auto-request preview if needs_transcode
  useEffect(() => {
    previewRequestedRef.current = false;
    setVideoError(null);
    setPreviewLoading(false);
    if (project?.video_url) {
      setVideoSrc(`${API_BASE}${project.video_url}`);
      // If backend says this file needs transcoding, request preview immediately
      if (project.needs_transcode) {
        // Small delay to let state settle
        setTimeout(() => requestWebPreview(), 100);
      }
    } else {
      setVideoSrc(null);
    }
  }, [project?.video_url, project?.needs_transcode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect missing audio after video loads (MKV with unsupported audio codec)
  const handleVideoLoadedData = useCallback(() => {
    if (!videoRef.current || previewRequestedRef.current) return;
    const v = videoRef.current as HTMLVideoElement & {
      webkitAudioDecodedByteCount?: number;
      mozHasAudio?: boolean;
      audioTracks?: { length: number };
    };
    // Check after a short delay to let browser decode some audio
    setTimeout(() => {
      const hasAudio =
        v.mozHasAudio ||
        (typeof v.webkitAudioDecodedByteCount !== "undefined" && v.webkitAudioDecodedByteCount > 0) ||
        (v.audioTracks && v.audioTracks.length > 0);
      if (!hasAudio && !previewRequestedRef.current) {
        requestWebPreview();
      }
    }, 500);
  }, [requestWebPreview]);
  const fallbackSubtitle = useMemo(
    () => currentLine?.translated_text || currentLine?.original_text || "",
    [currentLine]
  );
  const overlayStylePreset = useMemo<SubtitleOverlayStyle>(() => ({
    fontFamily,
    fontSize,
    fontColor,
    isBold,
    isItalic,
    shadowDepth,
    shadowColor,
    outlineWidth,
    outlineColor,
    alignment,
    bgOpacity,
    letterSpacing,
  }), [
    fontFamily,
    fontSize,
    fontColor,
    isBold,
    isItalic,
    shadowDepth,
    shadowColor,
    outlineWidth,
    outlineColor,
    alignment,
    bgOpacity,
    letterSpacing,
  ]);

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
        <div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center gap-4 p-6 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-bold">Projeler yuklenemedi</h2>
          <p className="text-muted-foreground">Lutfen tekrar deneyin.</p>
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
          <p className="text-muted-foreground">Editor icin once bir proje olusturun.</p>
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
        <div className="flex w-[58%] min-h-0 flex-col border-r">
          <div
            ref={videoContainerRef}
            className="relative w-full shrink-0 bg-black"
            style={{ aspectRatio: videoAspectRatio }}
          >
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full object-contain"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      setDuration(videoRef.current.duration);
                      const { videoWidth, videoHeight } = videoRef.current;
                      if (videoWidth > 0 && videoHeight > 0) {
                        setVideoAspectRatio(videoWidth / videoHeight);
                      }
                      videoRef.current.volume = volume;
                      // Only clear error if not in the middle of preview loading
                      if (!previewLoading) setVideoError(null);
                      requestAnimationFrame(updateVideoRect);
                    }
                  }}
                  onError={requestWebPreview}
                  onLoadedData={handleVideoLoadedData}
                  onResize={() => updateVideoRect()}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  preload="auto"
                  playsInline
                  src={videoUrl}
                />
                {(videoError || previewLoading) && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
                    <div className="text-center text-white">
                      {previewLoading ? (
                        <>
                          <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" />
                          <p className="text-sm">Tarayici uyumlu format olusturuluyor...</p>
                          <p className="text-xs text-muted-foreground mt-1">Bu islem birkaç dakika surebilir</p>
                        </>
                      ) : (
                        <>
                          <Subtitles className="mx-auto mb-2 h-8 w-8 opacity-50" />
                          <p className="text-sm">{videoError}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Subtitles className="mx-auto mb-2 h-12 w-12 opacity-30" />
                  <p className="text-sm opacity-50">Video dosyası yok (sadece altyazı projesi)</p>
                </div>
              </div>
            )}
            {/* Subtitle overlay - positioned relative to actual video render area */}
            <SubtitleOverlay
              videoRect={videoRect}
              marginV={marginV}
              activeSubtitle={activeSubtitle}
              fallbackSubtitle={!videoUrl ? fallbackSubtitle : ""}
              stylePreset={overlayStylePreset}
            />
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

          <StyleSettingsPanel
            containerClassName="min-h-0 flex-1"
            fontFamily={fontFamily}
            fontSearch={fontSearch}
            showFontPicker={showFontPicker}
            filteredFonts={filteredFonts}
            fontPickerRef={fontPickerRef}
            setFontFamily={setFontFamily}
            setFontSearch={setFontSearch}
            setShowFontPicker={setShowFontPicker}
            fontSize={fontSize}
            setFontSize={setFontSize}
            letterSpacing={letterSpacing}
            setLetterSpacing={setLetterSpacing}
            fontColorLive={fontColorLive}
            setFontColor={setFontColor}
            bgOpacity={bgOpacity}
            setBgOpacity={setBgOpacity}
            outlineColorLive={outlineColorLive}
            outlineWidth={outlineWidth}
            setOutlineColor={setOutlineColor}
            setOutlineWidth={setOutlineWidth}
            marginV={marginV}
            setMarginV={setMarginV}
            isBold={isBold}
            isItalic={isItalic}
            setIsBold={setIsBold}
            setIsItalic={setIsItalic}
          />
        </div>

        {/* Right: Subtitle list */}
        <div className="flex w-[42%] min-h-0 flex-col overflow-hidden">
          <SubtitleListPanel
            lines={lines}
            tracks={tracks}
            selectedTrackId={selectedTrackId}
            selectedLineId={selectedLineId}
            showOriginal={showOriginal}
            isTrackLoading={trackLoading}
            pendingEdits={pendingEdits}
            lineRefs={lineRefs}
            onTrackChange={handleTrackChange}
            onShowOriginalChange={handleShowOriginalChange}
            onSelectLine={handleLineSelect}
            onUpdateTranslation={updateTranslation}
            onUpdateTiming={updateTiming}
          />
        </div>
      </div>

    </div>
  );
}
