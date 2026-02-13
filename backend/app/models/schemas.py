from pydantic import BaseModel
from typing import Optional
from enum import Enum


# --- Enums ---
class ProjectStatus(str, Enum):
    uploading = "uploading"
    processing = "processing"
    ready = "ready"
    translating = "translating"
    translated = "translated"
    editing = "editing"
    exporting = "exporting"
    exported = "exported"
    failed = "failed"


class JobStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class EngineType(str, Enum):
    openai = "openai"
    deepl = "deepl"
    gemini = "gemini"
    openrouter = "openrouter"


class ExportMode(str, Enum):
    burn_in = "burn_in"
    soft_sub = "soft_sub"


class VideoCodec(str, Enum):
    h264 = "h264"
    h265 = "h265"
    vp9 = "vp9"
    av1 = "av1"
    copy = "copy"


# --- Request Schemas ---
class ProjectCreate(BaseModel):
    name: str
    source_lang: str = "ja"
    target_lang: str = "tr"


class TranslationJobCreate(BaseModel):
    project_id: str
    subtitle_file_id: Optional[str] = None
    engine: EngineType = EngineType.openai
    model_id: Optional[str] = None
    source_lang: str
    target_lang: str
    context_enabled: bool = True
    glossary_enabled: bool = False


class ExportJobCreate(BaseModel):
    project_id: str
    mode: ExportMode = ExportMode.burn_in
    resolution: str = "original"
    video_codec: VideoCodec = VideoCodec.copy
    audio_codec: str = "copy"
    include_watermark: bool = False
    watermark_text: Optional[str] = None
    watermark_position: str = "bottom-right"
    keep_audio_tracks: bool = True
    upload_to_storage: bool = False
    subtitle_style: Optional[dict] = None


class SubtitleLineUpdate(BaseModel):
    translated_text: Optional[str] = None
    style: Optional[dict] = None


class SubtitleStyleUpdate(BaseModel):
    font_family: str = "Arial"
    font_size: int = 48
    color: str = "#FFFFFF"
    outline: int = 2
    shadow: int = 1
    bold: bool = False
    italic: bool = False
    alignment: int = 2
    margin_v: int = 30


class UrlDownloadRequest(BaseModel):
    url: str
    name: Optional[str] = None


class GlossaryTermCreate(BaseModel):
    source_term: str
    target_term: str
    source_lang: str
    target_lang: str


# --- Response Schemas ---
class MediaInfo(BaseModel):
    duration_seconds: int = 0
    file_size_bytes: int = 0
    video_codec: Optional[str] = None
    width: int = 0
    height: int = 0
    audio_tracks: list[dict] = []
    subtitle_streams: list[dict] = []


class ProjectResponse(BaseModel):
    id: str
    name: str
    file_name: str
    status: str
    source_lang: str
    target_lang: str
    total_lines: int = 0
    translated_lines: int = 0
    created_at: str


class JobResponse(BaseModel):
    id: str
    project_id: str
    status: str
    progress: int = 0
    created_at: str


class StorageInfoResponse(BaseModel):
    ok: bool
    used_bytes: int = 0
    max_bytes: int = 0
    available_bytes: int = 0
    freed_bytes: int = 0
    deleted_files: list[dict] = []
    warning: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    ffmpeg: bool = False
    redis: bool = False
    supabase: bool = False
    r2: bool = False
