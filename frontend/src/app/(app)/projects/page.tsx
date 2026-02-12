"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FolderOpen,
  Plus,
  Search,
  MoreHorizontal,
  FileVideo,
  Clock,
  Languages,
  Trash2,
  Edit,
  Download,
  Filter,
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, type Project } from "@/lib/api";
import { toast } from "sonner";
import { useFetchOnFocus } from "@/hooks/use-fetch-on-focus";
import { formatBytes, timeAgo, getLangLabel } from "@/lib/utils";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; color: string }> = {
  uploading: { label: "Yükleniyor", variant: "secondary", color: "text-blue-500" },
  processing: { label: "İşleniyor", variant: "secondary", color: "text-blue-500" },
  ready: { label: "Hazır", variant: "outline", color: "text-gray-500" },
  translating: { label: "Çevriliyor", variant: "secondary", color: "text-amber-500" },
  translated: { label: "Çevrildi", variant: "default", color: "text-green-500" },
  editing: { label: "Düzenleniyor", variant: "secondary", color: "text-purple-500" },
  exporting: { label: "Dışa Aktarılıyor", variant: "secondary", color: "text-orange-500" },
  exported: { label: "Tamamlandı", variant: "default", color: "text-green-500" },
  failed: { label: "Hata", variant: "destructive", color: "text-red-500" },
};


export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { data: projects = [], loading, setData: setProjects } = useFetchOnFocus(
    () => api.listProjects(),
    { pathPrefix: "/projects" }
  );

  const handleDelete = async (id: string) => {
    if (!confirm("Bu projeyi silmek istediğinize emin misiniz?")) return;
    try {
      await api.deleteProject(id);
      setProjects((prev) => (prev || []).filter((p) => p.id !== id));
      toast.success("Proje silindi.");
    } catch {
      toast.error("Proje silinemedi.");
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projeler</h1>
          <p className="text-muted-foreground">
            Tüm altyazı çeviri projelerinizi yönetin
          </p>
        </div>
        <Button asChild>
          <Link href="/upload">
            <Plus className="mr-2 h-4 w-4" />
            Yeni Proje
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Proje ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="uploading">Yükleniyor</SelectItem>
            <SelectItem value="translated">Çevrildi</SelectItem>
            <SelectItem value="editing">Düzenleniyor</SelectItem>
            <SelectItem value="exporting">Dışa Aktarılıyor</SelectItem>
            <SelectItem value="done">Tamamlandı</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Project Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredProjects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => {
            const status = statusConfig[project.status] || statusConfig.ready;
            return (
              <Card
                key={project.id}
                className="group transition-all hover:border-primary/30 hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <FileVideo className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-sm">{project.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {project.file_name}
                        </CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/editor?project=${project.id}`}>
                            <Edit className="mr-2 h-4 w-4" />
                            Düzenle
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/export?project=${project.id}`}>
                            <Download className="mr-2 h-4 w-4" />
                            Dışa Aktar
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(project.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(project.file_size_bytes)}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Languages className="h-3 w-3" />
                        {getLangLabel(project.source_lang)} → {getLangLabel(project.target_lang)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {timeAgo(project.created_at)}
                      </span>
                    </div>
                    {project.total_lines > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Çeviri</span>
                          <span>
                            {project.translated_lines} / {project.total_lines}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${(project.translated_lines / project.total_lines) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FolderOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium">Proje bulunamadı</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? "Arama kriterlerinize uygun proje yok"
                  : "Henüz proje oluşturmadınız"}
              </p>
            </div>
            <Button asChild className="mt-2">
              <Link href="/upload">
                <Plus className="mr-2 h-4 w-4" />
                Yeni Proje Oluştur
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
