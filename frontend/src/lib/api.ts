import { createClient } from "@/lib/supabase/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  isFormData?: boolean;
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
    const { method = "GET", body, headers = {}, isFormData = false } = options;
    const authHeaders = await this.getAuthHeaders();

    const fetchHeaders: Record<string, string> = {
      ...authHeaders,
      ...headers,
    };

    if (!isFormData && body) {
      fetchHeaders["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: fetchHeaders,
      body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
    });

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
    });
  }

  createSubtitleProject(formData: FormData) {
    return this.request<{ id: string; status: string; total_lines: number; format: string }>("/api/projects/subtitle", {
      method: "POST",
      body: formData,
      isFormData: true,
    });
  }

  deleteProject(id: string) {
    return this.request(`/api/projects/${id}`, { method: "DELETE" });
  }

  getStorageInfo() {
    return this.request<StorageInfo>("/api/projects/storage/info");
  }

  getSubtitleTracks(projectId: string) {
    return this.request<SubtitleTrack[]>(`/api/projects/${projectId}/tracks`);
  }

  getSubtitles(projectId: string, subtitleFileId?: string) {
    const params = subtitleFileId ? `?subtitle_file_id=${subtitleFileId}` : "";
    return this.request<SubtitleLine[]>(`/api/projects/${projectId}/subtitles${params}`);
  }

  batchUpdateSubtitles(projectId: string, edits: Record<string, string>) {
    return this.request<{ updated: number }>(`/api/projects/${projectId}/subtitles/batch`, {
      method: "PATCH",
      body: { edits },
    });
  }

  exportSrt(projectId: string, translated = true) {
    return this.request<{ filename: string; content: string }>(
      `/api/projects/${projectId}/export-srt?translated=${translated}`
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

  getExportDownload(jobId: string) {
    return this.request<{ url: string; expires_in: number }>(`/api/export/${jobId}/download`);
  }

  markUploadedToOwnStorage(projectId: string) {
    return this.request(`/api/export/${projectId}/uploaded-to-own-storage`, { method: "POST" });
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
  engine: "openai" | "deepl" | "gemini";
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

export interface GlossaryTerm {
  id: string;
  user_id: string;
  source_term: string;
  target_term: string;
  source_lang: string;
  target_lang: string;
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
