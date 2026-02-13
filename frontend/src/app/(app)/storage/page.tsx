"use client";
 
import { useState, useEffect, useCallback, useRef } from "react";
import {
  HardDrive,
  Cloud,
  Trash2,
  Download,
  Search,
  RefreshCw,
  FileVideo,
  FileText,
  File as FileIcon,
  ExternalLink,
  Loader2,
  AlertTriangle,
  FolderOpen,
  Copy,
  Pencil,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useAuthContext } from "@/components/auth-provider";
import {
  api,
  type StoredFile,
  type StorageInfo,
  type ExternalBucketFile,
} from "@/lib/api";
import { toast } from "sonner";
import { formatBytes, timeAgo } from "@/lib/utils";
 
const ITEMS_PER_PAGE = 20;
 
function getFileIcon(fileType: string) {
  if (fileType.includes("video") || fileType === "source_video" || fileType === "export_video")
    return <FileVideo className="h-4 w-4 text-blue-500" />;
  if (fileType.includes("subtitle") || fileType.includes("srt") || fileType.includes("ass"))
    return <FileText className="h-4 w-4 text-green-500" />;
  if (fileType.includes("thumbnail") || fileType.includes("preview"))
    return <ImageIcon className="h-4 w-4 text-purple-500" />;
  return <FileIcon className="h-4 w-4 text-muted-foreground" />;
}
 
function fileTypeLabel(ft: string) {
  const map: Record<string, string> = {
    source_video: "Kaynak Video",
    export_video: "Dışa Aktarım",
    subtitle_srt: "Altyazı (SRT)",
    subtitle_ass: "Altyazı (ASS)",
    subtitle_ssa: "Altyazı (SSA)",
    subtitle_vtt: "Altyazı (VTT)",
    thumbnail: "Küçük Resim",
    preview: "Önizleme",
  };
  return map[ft] || ft;
}
 
export default function StoragePage() {
  const { profile, plan, refreshProfile } = useAuthContext();
 
  const [activeTab, setActiveTab] = useState("system");
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
 
  // System files
  const [systemFiles, setSystemFiles] = useState<StoredFile[]>([]);
  const [loadingSystem, setLoadingSystem] = useState(false);
  const [systemSearch, setSystemSearch] = useState("");
  const [systemPage, setSystemPage] = useState(0);
 
  // External files
  const [externalFiles, setExternalFiles] = useState<ExternalBucketFile[]>([]);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [externalSearch, setExternalSearch] = useState("");
  const [externalPage, setExternalPage] = useState(0);
  const [hasExternalStorage, setHasExternalStorage] = useState(false);
 
  // Deleting state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
 
  // Rename state for external files
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
 
  const loadStorageInfo = useCallback(async () => {
    setLoadingInfo(true);
    try {
      const info = await api.getStorageInfo();
      setStorageInfo(info);
    } catch {
      /* ignore */
    }
    setLoadingInfo(false);
  }, []);
 
  const loadSystemFiles = useCallback(async () => {
    setLoadingSystem(true);
    try {
      const files = await api.listStoredFiles("system");
      setSystemFiles(files);
    } catch {
      toast.error("Dosyalar yüklenemedi.");
    }
    setLoadingSystem(false);
  }, []);
 
  const loadExternalFiles = useCallback(async () => {
    setLoadingExternal(true);
    try {
      const result = await api.listExternalFiles("", 1000);
      setExternalFiles(result.files || []);
      setHasExternalStorage(true);
    } catch {
      setHasExternalStorage(false);
    }
    setLoadingExternal(false);
  }, []);
 
  useEffect(() => {
    loadStorageInfo();
    loadSystemFiles();
    loadExternalFiles();
  }, [loadStorageInfo, loadSystemFiles, loadExternalFiles]);
 
  // Filtered + paginated system files
  const filteredSystem = systemFiles.filter((f) => {
    if (!systemSearch) return true;
    const q = systemSearch.toLowerCase();
    return (
      f.project_name?.toLowerCase().includes(q) ||
      f.file_type.toLowerCase().includes(q) ||
      f.storage_path.toLowerCase().includes(q)
    );
  });
  const systemTotalPages = Math.max(1, Math.ceil(filteredSystem.length / ITEMS_PER_PAGE));
  const pagedSystem = filteredSystem.slice(
    systemPage * ITEMS_PER_PAGE,
    (systemPage + 1) * ITEMS_PER_PAGE
  );
 
  // Filtered + paginated external files
  const filteredExternal = externalFiles.filter((f) => {
    if (!externalSearch) return true;
    return f.key.toLowerCase().includes(externalSearch.toLowerCase());
  });
  const externalTotalPages = Math.max(1, Math.ceil(filteredExternal.length / ITEMS_PER_PAGE));
  const pagedExternal = filteredExternal.slice(
    externalPage * ITEMS_PER_PAGE,
    (externalPage + 1) * ITEMS_PER_PAGE
  );
 
  const handleDeleteSystemFile = async (fileId: string) => {
    setDeletingId(fileId);
    try {
      await api.deleteStoredFile(fileId);
      setSystemFiles((prev) => prev.filter((f) => f.id !== fileId));
      toast.success("Dosya silindi.");
      loadStorageInfo();
      refreshProfile();
    } catch {
      toast.error("Dosya silinemedi.");
    }
    setDeletingId(null);
  };
 
  const handleGetUrl = async (fileId: string) => {
    try {
      const result = await api.getStoredFileUrl(fileId);
      if (result.url) {
        await navigator.clipboard.writeText(result.url);
        toast.success("URL kopyalandı!");
      }
    } catch {
      toast.error("URL alınamadı.");
    }
  };
 
  const handleDeleteExternal = async (key: string) => {
    setDeletingKey(key);
    try {
      await api.deleteExternalFile(key);
      setExternalFiles((prev) => prev.filter((f) => f.key !== key));
      toast.success("Dosya silindi.");
    } catch {
      toast.error("Dosya silinemedi.");
    }
    setDeletingKey(null);
  };
 
  const handleExternalUrl = async (key: string) => {
    try {
      const result = await api.getExternalFileUrl(key);
      if (result.url) {
        window.open(result.url, "_blank");
      }
    } catch {
      toast.error("URL alınamadı.");
    }
  };
 
  const handleStartRename = (key: string) => {
    setRenamingKey(key);
    setRenameValue(key);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };
 
  const handleConfirmRename = async () => {
    if (!renamingKey || !renameValue || renameValue === renamingKey) {
      setRenamingKey(null);
      return;
    }
    try {
      await api.renameExternalFile(renamingKey, renameValue);
      setExternalFiles((prev) =>
        prev.map((f) => (f.key === renamingKey ? { ...f, key: renameValue } : f))
      );
      toast.success("Dosya yeniden adlandırıldı.");
    } catch {
      toast.error("Yeniden adlandırma başarısız.");
    }
    setRenamingKey(null);
  };
 
  const usedBytes = storageInfo?.used_bytes ?? profile?.storage_used_bytes ?? 0;
  const maxBytes = storageInfo?.max_bytes ?? (plan ? plan.storage_gb * 1024 * 1024 * 1024 : 0);
  const usagePercent = maxBytes > 0 ? Math.min((usedBytes / maxBytes) * 100, 100) : 0;
 
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Depolama</h1>
          <p className="text-sm text-muted-foreground">Dosyalarınızı yönetin ve depolama alanınızı takip edin</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            loadStorageInfo();
            loadSystemFiles();
            loadExternalFiles();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Yenile
        </Button>
      </div>
 
      {/* Storage usage card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              <span className="font-medium">Depolama Kullanımı</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {loadingInfo ? "..." : `${formatBytes(usedBytes)} / ${formatBytes(maxBytes)}`}
            </span>
          </div>
          <Progress value={usagePercent} className="h-2" />
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{systemFiles.length} sistem dosyası</span>
            <span>%{usagePercent.toFixed(1)} kullanılıyor</span>
          </div>
        </CardContent>
      </Card>
 
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="system" className="gap-2">
            <HardDrive className="h-4 w-4" />
            Sistem Dosyaları
            <Badge variant="secondary" className="ml-1 text-[10px]">{filteredSystem.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="external" className="gap-2">
            <Cloud className="h-4 w-4" />
            Harici Depolama
            {hasExternalStorage && (
              <Badge variant="secondary" className="ml-1 text-[10px]">{filteredExternal.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>
 
        {/* System Files Tab */}
        <TabsContent value="system" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Sistem Dosyaları</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Dosya ara..."
                    value={systemSearch}
                    onChange={(e) => { setSystemSearch(e.target.value); setSystemPage(0); }}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
              </div>
              <CardDescription>R2 üzerinde saklanan proje dosyalarınız</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSystem ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : pagedSystem.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {systemSearch ? "Aramayla eşleşen dosya bulunamadı." : "Henüz dosya yok."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border">
                    <div className="grid grid-cols-[1fr_140px_100px_100px_80px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                      <span>Dosya</span>
                      <span>Proje</span>
                      <span>Boyut</span>
                      <span>Tarih</span>
                      <span className="text-right">İşlem</span>
                    </div>
                    {pagedSystem.map((file) => (
                      <div
                        key={file.id}
                        className="grid grid-cols-[1fr_140px_100px_100px_80px] gap-2 items-center border-b last:border-0 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {getFileIcon(file.file_type)}
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{fileTypeLabel(file.file_type)}</p>
                            <p className="truncate text-[10px] text-muted-foreground">{file.storage_path.split("/").pop()}</p>
                          </div>
                        </div>
                        <span className="truncate text-xs text-muted-foreground">{file.project_name || "—"}</span>
                        <span className="text-xs">{formatBytes(file.file_size_bytes)}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(file.created_at)}</span>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="URL Kopyala"
                            onClick={() => handleGetUrl(file.id)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Sil"
                            disabled={deletingId === file.id}
                            onClick={() => handleDeleteSystemFile(file.id)}
                          >
                            {deletingId === file.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
 
                  {/* Pagination */}
                  {systemTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-xs text-muted-foreground">
                        {filteredSystem.length} dosyadan {systemPage * ITEMS_PER_PAGE + 1}-{Math.min((systemPage + 1) * ITEMS_PER_PAGE, filteredSystem.length)} gösteriliyor
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={systemPage === 0}
                          onClick={() => setSystemPage((p) => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs px-2">{systemPage + 1} / {systemTotalPages}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={systemPage >= systemTotalPages - 1}
                          onClick={() => setSystemPage((p) => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
 
        {/* External Files Tab */}
        <TabsContent value="external" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Harici Depolama</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Dosya ara..."
                    value={externalSearch}
                    onChange={(e) => { setExternalSearch(e.target.value); setExternalPage(0); }}
                    className="pl-9 h-9 text-sm"
                  />
                </div>
              </div>
              <CardDescription>Kendi R2/B2 depolama alanınızdaki dosyalar</CardDescription>
            </CardHeader>
            <CardContent>
              {!hasExternalStorage ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Cloud className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium mb-1">Harici depolama yapılandırılmamış</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    Ayarlar sayfasından R2 veya B2 depolama bağlantınızı yapılandırın.
                  </p>
                  <Button variant="outline" size="sm" onClick={() => window.location.href = "/settings"}>
                    Ayarlara Git
                  </Button>
                </div>
              ) : loadingExternal ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : pagedExternal.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {externalSearch ? "Aramayla eşleşen dosya bulunamadı." : "Bucket boş."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border">
                    <div className="grid grid-cols-[1fr_100px_120px_100px] gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                      <span>Dosya Adı</span>
                      <span>Boyut</span>
                      <span>Tarih</span>
                      <span className="text-right">İşlem</span>
                    </div>
                    {pagedExternal.map((file) => (
                      <div
                        key={file.key}
                        className="grid grid-cols-[1fr_100px_120px_100px] gap-2 items-center border-b last:border-0 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors"
                      >
                        <div className="min-w-0">
                          {renamingKey === file.key ? (
                            <div className="flex items-center gap-1">
                              <Input
                                ref={renameInputRef}
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleConfirmRename();
                                  if (e.key === "Escape") setRenamingKey(null);
                                }}
                                className="h-7 text-xs"
                              />
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleConfirmRename}>
                                <Check className="h-3 w-3 text-green-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRenamingKey(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <p className="truncate text-xs font-medium" title={file.key}>{file.key}</p>
                          )}
                        </div>
                        <span className="text-xs">{formatBytes(file.size)}</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(file.last_modified)}</span>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="İndir"
                            onClick={() => handleExternalUrl(file.key)}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Yeniden Adlandır"
                            onClick={() => handleStartRename(file.key)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Sil"
                            disabled={deletingKey === file.key}
                            onClick={() => handleDeleteExternal(file.key)}
                          >
                            {deletingKey === file.key ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
 
                  {/* Pagination */}
                  {externalTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-xs text-muted-foreground">
                        {filteredExternal.length} dosyadan {externalPage * ITEMS_PER_PAGE + 1}-{Math.min((externalPage + 1) * ITEMS_PER_PAGE, filteredExternal.length)} gösteriliyor
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={externalPage === 0}
                          onClick={() => setExternalPage((p) => p - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs px-2">{externalPage + 1} / {externalTotalPages}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={externalPage >= externalTotalPages - 1}
                          onClick={() => setExternalPage((p) => p + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}