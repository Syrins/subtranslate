import { createClient } from "@/lib/supabase/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_REQUEST_TIMEOUT_MS = 15000;

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  isFormData?: boolean;
  timeoutMs?: number;
}

class ApiClient {
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  async request<T = unknown>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const { method = "GET", body, headers = {}, isFormData = false, timeoutMs = API_REQUEST_TIMEOUT_MS } = options;
    const authHeaders = await this.getAuthHeaders();

    const fetchHeaders: Record<string, string> = {
      ...authHeaders,
      ...headers,
    };

    if (!isFormData && body) {
      fetchHeaders["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, {
        method,
        headers: fetchHeaders,
        body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError(408, "Request timed out. Please try again.");
      }
      throw new ApiError(0, err instanceof Error ? err.message : "Network request failed");
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new ApiError(res.status, error.detail || "Bir hata oluştu");
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  // Projects
  listProjects() {
    return this.request<Project[]>("/api/projects");
  }

  getProject(id: string) {
    return this.request<Project>(`/api/projects/${id}`);
  }

  createProject(formData: FormData) {
    return this.request<{ id: string; status: string; total_lines: number }>("/api/projects", {
      method: "POST",
      body: formData,
      isFormData: true,
      timeoutMs: 5 * 60 * 1000,
    });
  }

  createSubtitleProject(formData: FormData) {
    return this.request<{ id: string; status: string; total_lines: number; format: string }>("/api/projects/subtitle", {
      method: "POST",
      body: formData,
      isFormData: true,
      timeoutMs: 5 * 60 * 1000,
    });
  }

  deleteProject(id: string) {
    return this.request(`/api/projects/${id}`, { method: "DELETE" });
  }

  getStorageInfo() {
    return this.request<StorageInfo>("/api/projects/storage/info");
  }

  createWebPreview(projectId: string) {
    return this.request<{ video_url: string; cached: boolean; error?: string }>(`/api/projects/${projectId}/web-preview`, {
      method: "POST",
      timeoutMs: 5 * 60 * 1000,
    });
  }

  getSubtitleTracks(projectId: string) {
    return this.request<SubtitleTrack[]>(`/api/projects/${projectId}/tracks`);
  }

  getSubtitles(projectId: string, subtitleFileId?: string) {
    const params = subtitleFileId ? `?subtitle_file_id=${subtitleFileId}` : "";
    return this.request<SubtitleLine[]>(`/api/projects/${projectId}/subtitles${params}`);
  }

  batchUpdateSubtitles(projectId: string, edits: Record<string, string | { translated_text?: string; start_time?: string; end_time?: string }>) {
    return this.request<{ updated: number }>(`/api/projects/${projectId}/subtitles/batch`, {
      method: "PATCH",
      body: { edits },
    });
  }

  exportSrt(projectId: string, translated = true, subtitleFileId?: string) {
    const trackParam = subtitleFileId ? `&subtitle_file_id=${encodeURIComponent(subtitleFileId)}` : "";
    return this.request<{ filename: string; content: string }>(
      `/api/projects/${projectId}/export-srt?translated=${translated}${trackParam}`
    );
  }

  // Translation
  createTranslationJob(body: TranslationJobCreate) {
    return this.request<{ id: string; status: string }>("/api/translate", {
      method: "POST",
      body,
    });
  }

  getTranslationJob(jobId: string) {
    return this.request<TranslationJob>(`/api/translate/${jobId}`);
  }

  cancelTranslationJob(jobId: string) {
    return this.request(`/api/translate/${jobId}/cancel`, { method: "POST" });
  }

  getTranslationHistory(projectId: string) {
    return this.request<TranslationJob[]>(`/api/translate/history/${projectId}`);
  }

  // Export
  createExportJob(body: ExportJobCreate) {
    return this.request<{ id: string; status: string }>("/api/export", {
      method: "POST",
      body,
    });
  }

  getExportJob(jobId: string) {
    return this.request<ExportJob>(`/api/export/${jobId}`);
  }

  cancelExportJob(jobId: string) {
    return this.request(`/api/export/${jobId}/cancel`, { method: "POST" });
  }

  getActiveExportJob(projectId: string) {
    return this.request<ExportJob | null>(`/api/export/active/${projectId}`);
  }

  deletePreviousExport(projectId: string) {
    return this.request<{ deleted_files: number; message: string }>(`/api/export/previous/${projectId}`, { method: "DELETE" });
  }

  getExportDownload(jobId: string) {
    return this.request<{ url: string; expires_in: number }>(`/api/export/${jobId}/download`);
  }

  markUploadedToOwnStorage(projectId: string) {
    return this.request(`/api/export/${projectId}/uploaded-to-own-storage`, { method: "POST" });
  }

  // Storage file management
  listStoredFiles(location: "system" | "external" | "all" = "all") {
    return this.request<StoredFile[]>(`/api/projects/storage/files?location=${location}`);
  }

  deleteStoredFile(fileId: string) {
    return this.request<{ ok: boolean }>(`/api/projects/storage/files/${fileId}`, { method: "DELETE" });
  }

  getStoredFileUrl(fileId: string) {
    return this.request<{ url: string; storage_path: string }>(`/api/projects/storage/files/${fileId}/url`);
  }

  // Glossary
  listGlossary() {
    return this.request<GlossaryTerm[]>("/api/glossary");
  }

  createGlossaryTerm(body: { source_term: string; target_term: string; source_lang: string; target_lang: string }) {
    return this.request<GlossaryTerm>("/api/glossary", { method: "POST", body });
  }

  deleteGlossaryTerm(id: string) {
    return this.request(`/api/glossary/${id}`, { method: "DELETE" });
  }

  // External Storage Config
  testStorageConnection() {
    return this.request<ExternalStorageTestResult>("/api/storage-config/test", { method: "POST" });
  }

  testCustomStorageConnection(body: Record<string, string>) {
    return this.request<ExternalStorageTestResult>("/api/storage-config/test-custom", {
      method: "POST",
      body,
    });
  }

  listExternalFiles(prefix = "", maxKeys = 200) {
    const params = new URLSearchParams();
    if (prefix) params.set("prefix", prefix);
    params.set("max_keys", String(maxKeys));
    return this.request<ExternalFileListResult>(`/api/storage-config/files?${params.toString()}`);
  }

  getExternalFileInfo(key: string) {
    return this.request<ExternalFileInfo>(`/api/storage-config/files/info?key=${encodeURIComponent(key)}`);
  }

  getExternalFileUrl(key: string, expiresIn = 3600) {
    return this.request<{ ok: boolean; url: string; expires_in: number }>(
      `/api/storage-config/files/url?key=${encodeURIComponent(key)}&expires_in=${expiresIn}`
    );
  }

  deleteExternalFile(key: string) {
    return this.request<{ ok: boolean; message: string }>(
      `/api/storage-config/files?key=${encodeURIComponent(key)}`,
      { method: "DELETE" }
    );
  }

  renameExternalFile(oldKey: string, newKey: string) {
    return this.request<{ ok: boolean; message: string }>("/api/storage-config/files/rename", {
      method: "POST",
      body: { old_key: oldKey, new_key: newKey },
    });
  }

  // Health
  health() {
    return this.request<HealthCheck>("/health");
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Types
export interface Project {
  id: string;
  user_id: string;
  name: string;
  file_name: string;
  file_size_bytes: number;
  duration_seconds: number;
  video_codec: string | null;
  width: number;
  height: number;
  status: string;
  source_lang: string;
  target_lang: string;
  total_lines: number;
  translated_lines: number;
  video_url: string | null;
  needs_transcode?: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubtitleTrack {
  id: string;
  language: string;
  format: string;
  track_index: number;
  total_lines: number;
}

export interface SubtitleLine {
  id: string;
  subtitle_file_id: string;
  project_id: string;
  line_number: number;
  start_time: string;
  end_time: string;
  original_text: string;
  translated_text: string | null;
  style: Record<string, unknown> | null;
  is_translated: boolean;
}

export interface TranslationJobCreate {
  project_id: string;
  subtitle_file_id?: string;
  engine: "openai" | "deepl" | "gemini" | "openrouter";
  model_id?: string;
  source_lang: string;
  target_lang: string;
  context_enabled?: boolean;
  glossary_enabled?: boolean;
}

export interface TranslationJob {
  id: string;
  project_id: string;
  engine: string;
  status: string;
  progress: number;
  total_lines: number;
  translated_lines: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ExportJobCreate {
  project_id: string;
  mode: "burn_in" | "soft_sub";
  resolution?: string;
  video_codec?: string;
  audio_codec?: string;
  include_watermark?: boolean;
  watermark_text?: string;
  watermark_position?: string;
  keep_audio_tracks?: boolean;
  upload_to_storage?: boolean;
  subtitle_style?: Record<string, unknown>;
}

export interface ExportJob {
  id: string;
  project_id: string;
  status: string;
  progress: number;
  mode: string;
  resolution: string;
  output_file_url: string | null;
  output_file_size_bytes: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface StorageInfo {
  ok: boolean;
  used_bytes: number;
  max_bytes: number;
  available_bytes: number;
  freed_bytes: number;
  deleted_files: unknown[];
  warning: string | null;
}

export interface StoredFile {
  id: string;
  user_id: string;
  project_id: string;
  file_type: string;
  storage_path: string;
  file_size_bytes: number;
  cdn_url: string;
  uploaded_to_user_storage: boolean;
  expires_at: string | null;
  created_at: string;
  project_name: string;
}

export interface GlossaryTerm {
  id: string;
  user_id: string;
  source_term: string;
  target_term: string;
  source_lang: string;
  target_lang: string;
}

export interface ExternalStorageTestResult {
  ok: boolean;
  message: string;
}

export interface ExternalBucketFile {
  key: string;
  size: number;
  last_modified: string;
  etag: string;
}

export interface ExternalFileListResult {
  ok: boolean;
  files: ExternalBucketFile[];
  truncated: boolean;
  count: number;
  message?: string;
}

export interface ExternalFileInfo {
  ok: boolean;
  key: string;
  size: number;
  content_type: string;
  last_modified: string;
  etag: string;
}

export interface HealthCheck {
  status: string;
  version: string;
  ffmpeg: boolean;
  redis: boolean;
  supabase: boolean;
  r2: boolean;
}

export interface UserProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  status: string;
  plan_id: string;
  lines_used_this_month: number;
  daily_jobs_used: number;
  storage_used_bytes: number;
  default_engine: string;
  default_source_lang: string;
  default_target_lang: string;
  email_notifications: boolean;
  export_notifications: boolean;
  locale: string;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  lines_per_month: number;
  storage_gb: number;
  daily_job_limit: number;
  retention_days: number;
  can_use_system_keys: boolean;
  max_export_resolution: string;
  watermark_required: boolean;
  price_monthly: number;
  priority_queue: boolean;
  api_access: boolean;
  team_management: boolean;
}

export const api = new ApiClient();
