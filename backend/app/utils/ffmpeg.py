import subprocess
import json
import shutil
from pathlib import Path
from typing import Optional
import structlog
import static_ffmpeg

logger = structlog.get_logger()

# Ensure static binaries are downloaded on import
static_ffmpeg.add_paths()


def get_ffmpeg_path() -> str:
    """Get ffmpeg binary path - uses static-ffmpeg (auto-downloads static binary)."""
    ffmpeg, _ = static_ffmpeg.run.get_or_fetch_platform_executables_else_raise()
    return ffmpeg


def get_ffprobe_path() -> str:
    """Get ffprobe binary path - uses static-ffmpeg (auto-downloads static binary)."""
    _, ffprobe = static_ffmpeg.run.get_or_fetch_platform_executables_else_raise()
    return ffprobe


def probe_file(file_path: str) -> dict:
    """Probe a media file and return full metadata as dict."""
    ffprobe = get_ffprobe_path()
    cmd = [
        ffprobe, "-v", "quiet",
        "-print_format", "json",
        "-show_format", "-show_streams",
        str(file_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        logger.error("ffprobe_failed", stderr=result.stderr[:500], file=file_path)
        raise RuntimeError(f"ffprobe failed: {result.stderr[:200]}")
    return json.loads(result.stdout)


def get_media_info(file_path: str) -> dict:
    """Extract structured media info from a file."""
    data = probe_file(file_path)
    streams = data.get("streams", [])
    fmt = data.get("format", {})

    video_streams = [s for s in streams if s.get("codec_type") == "video"]
    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
    subtitle_streams = [s for s in streams if s.get("codec_type") == "subtitle"]

    duration = float(fmt.get("duration", 0))
    file_size = int(fmt.get("size", 0))

    video_codec = video_streams[0].get("codec_name") if video_streams else None
    width = int(video_streams[0].get("width", 0)) if video_streams else 0
    height = int(video_streams[0].get("height", 0)) if video_streams else 0

    subtitles = []
    for i, s in enumerate(subtitle_streams):
        tags = s.get("tags", {})
        subtitles.append({
            "index": s.get("index"),
            "stream_index": i,
            "codec": s.get("codec_name", "unknown"),
            "language": tags.get("language", "und"),
            "title": tags.get("title", ""),
        })

    audio_tracks = []
    for i, a in enumerate(audio_streams):
        tags = a.get("tags", {})
        audio_tracks.append({
            "index": a.get("index"),
            "stream_index": i,
            "codec": a.get("codec_name", "unknown"),
            "language": tags.get("language", "und"),
            "channels": a.get("channels", 2),
        })

    return {
        "duration_seconds": int(duration),
        "file_size_bytes": file_size,
        "video_codec": video_codec,
        "width": width,
        "height": height,
        "audio_tracks": audio_tracks,
        "subtitle_streams": subtitles,
        "format_name": fmt.get("format_name", ""),
    }


def extract_subtitle_track(
    input_path: str,
    output_path: str,
    stream_index: int,
    output_format: str = "srt",
) -> str:
    """Extract a single subtitle track from a video file."""
    ffmpeg = get_ffmpeg_path()
    cmd = [
        ffmpeg, "-y", "-v", "warning",
        "-i", str(input_path),
        "-map", f"0:s:{stream_index}",
        "-c:s", output_format if output_format != "srt" else "srt",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        logger.error("extract_subtitle_failed", stderr=result.stderr[:500])
        raise RuntimeError(f"Subtitle extraction failed: {result.stderr[:200]}")
    return str(output_path)


def extract_all_subtitles(input_path: str, output_dir: str) -> list[dict]:
    """Extract all subtitle tracks from a video file."""
    info = get_media_info(input_path)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for sub in info["subtitle_streams"]:
        ext = "ass" if sub["codec"] in ("ass", "ssa") else "srt"
        out_file = out_dir / f"sub_{sub['stream_index']}_{sub['language']}.{ext}"
        try:
            extract_subtitle_track(input_path, str(out_file), sub["stream_index"], ext)
            results.append({
                **sub,
                "format": ext,
                "file_path": str(out_file),
                "extracted": True,
            })
        except Exception as e:
            logger.warning("subtitle_extract_skip", index=sub["stream_index"], error=str(e))
            results.append({**sub, "format": ext, "extracted": False, "error": str(e)})

    return results


def _escape_ffmpeg_path(path: str) -> str:
    """Escape a file path for use in ffmpeg filter expressions.
    
    On Windows, backslashes must be replaced with forward slashes or
    double-escaped, and colons after drive letters need escaping.
    FFmpeg subtitle filter treats \\ as escape sequences (e.g. \\t = tab).
    """
    # Convert to forward slashes (works on all platforms in ffmpeg)
    escaped = path.replace("\\", "/")
    # Escape colons (C:/... -> C\\:/...) for ffmpeg filter syntax
    if len(escaped) >= 2 and escaped[1] == ":":
        escaped = escaped[0] + "\\:" + escaped[2:]
    return escaped


def burn_subtitles(
    input_path: str,
    subtitle_path: str,
    output_path: str,
    resolution: Optional[str] = None,
    video_codec: str = "libx264",
    audio_codec: str = "copy",
    watermark_text: Optional[str] = None,
    watermark_opacity: float = 0.3,
    progress_callback=None,
    subtitle_style: Optional[dict] = None,
) -> str:
    """Burn subtitles into video (hardcoded). Optionally add watermark."""
    ffmpeg = get_ffmpeg_path()

    # Escape subtitle path for ffmpeg filter (Windows backslash fix)
    escaped_sub_path = _escape_ffmpeg_path(subtitle_path)

    # Build filter chain
    sub_ext = Path(subtitle_path).suffix.lower()
    if sub_ext in (".ass", ".ssa"):
        vf = f"ass='{escaped_sub_path}'"
    else:
        # Build force_style from subtitle_style dict if provided
        force_style = _build_force_style(subtitle_style)
        if force_style:
            vf = f"subtitles='{escaped_sub_path}':force_style='{force_style}'"
        else:
            vf = f"subtitles='{escaped_sub_path}'"

    # Resolution scaling
    scale_map = {"480p": "854:480", "720p": "1280:720", "1080p": "1920:1080", "1440p": "2560:1440", "4k": "3840:2160"}
    if resolution and resolution in scale_map:
        vf = f"scale={scale_map[resolution]}:force_original_aspect_ratio=decrease,pad={scale_map[resolution].replace(':', ':')}:(ow-iw)/2:(oh-ih)/2,{vf}"

    # Watermark
    if watermark_text:
        wm = f"drawtext=text='{watermark_text}':fontsize=24:fontcolor=white@{watermark_opacity}:x=w-tw-20:y=h-th-20"
        vf = f"{vf},{wm}"

    # Codec args — 'copy' cannot be used with burn-in (needs re-encoding for filter)
    if video_codec == "copy":
        video_codec = "libx264"
        logger.warning("burn_subtitles_copy_override", msg="copy codec overridden to libx264 for burn-in mode")

    codec_args = ["-c:v", video_codec]
    if video_codec == "libx264":
        codec_args += ["-preset", "medium", "-crf", "23"]
    elif video_codec == "libx265":
        codec_args += ["-preset", "medium", "-crf", "28"]
    elif video_codec == "libvpx-vp9":
        codec_args += ["-b:v", "0", "-crf", "30"]

    cmd = [
        ffmpeg, "-y", "-v", "warning", "-progress", "pipe:1",
        "-i", str(input_path),
        "-vf", vf,
        *codec_args,
        "-c:a", audio_codec,
        "-movflags", "+faststart",
        str(output_path),
    ]

    logger.info("burn_subtitles_start", cmd=" ".join(cmd))

    # Get total duration for progress calculation
    total_duration_us = 0
    try:
        info = probe_file(input_path)
        dur = float(info.get("format", {}).get("duration", 0))
        total_duration_us = int(dur * 1_000_000)
    except Exception:
        pass

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stderr_lines = []
    try:
        for line in proc.stdout:
            line = line.strip()
            if line.startswith("out_time_us=") and total_duration_us > 0 and progress_callback:
                try:
                    current_us = int(line.split("=")[1])
                    pct = min(int(current_us * 100 / total_duration_us), 99)
                    progress_callback(pct)
                except (ValueError, IndexError):
                    pass
            elif line == "progress=end":
                if progress_callback:
                    progress_callback(100)
        proc.wait(timeout=7200)
        if proc.stderr:
            stderr_lines = proc.stderr.readlines()
    except subprocess.TimeoutExpired:
        proc.kill()
        raise RuntimeError("FFmpeg timed out after 2 hours")

    if proc.returncode != 0:
        err_text = "".join(stderr_lines)[:1000]
        logger.error("burn_subtitles_failed", stderr=err_text)
        raise RuntimeError(f"Burn subtitles failed: {err_text[:300]}")

    return str(output_path)


def _build_force_style(style: Optional[dict]) -> str:
    """Build ffmpeg subtitles force_style string from editor style settings."""
    if not style:
        return ""
    parts = []
    if style.get("font_family"):
        parts.append(f"FontName={style['font_family']}")
    if style.get("font_size"):
        parts.append(f"FontSize={style['font_size']}")
    if style.get("font_color"):
        # Convert #RRGGBB to ASS &HBBGGRR& format
        hex_color = style["font_color"].lstrip("#")
        if len(hex_color) == 6:
            r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
            parts.append(f"PrimaryColour=&H00{b}{g}{r}&")
    if style.get("bold"):
        parts.append("Bold=1")
    if style.get("italic"):
        parts.append("Italic=1")
    if style.get("outline_width") is not None:
        parts.append(f"Outline={style['outline_width']}")
    if style.get("outline_color"):
        hex_color = style["outline_color"].lstrip("#")
        if len(hex_color) == 6:
            r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
            parts.append(f"OutlineColour=&H00{b}{g}{r}&")
    if style.get("shadow_depth") is not None:
        parts.append(f"Shadow={style['shadow_depth']}")
    if style.get("alignment") is not None:
        parts.append(f"Alignment={style['alignment']}")
    if style.get("margin_v") is not None:
        parts.append(f"MarginV={style['margin_v']}")
    # BackColour: bg_opacity takes priority (opaque box), otherwise use shadow_color
    if style.get("bg_opacity") is not None and style["bg_opacity"] > 0:
        parts.append("BorderStyle=3")
        alpha = int((1 - style["bg_opacity"]) * 255)
        parts.append(f"BackColour=&H{alpha:02X}000000&")
    elif style.get("shadow_color"):
        hex_color = style["shadow_color"].lstrip("#")
        if len(hex_color) == 6:
            r, g, b = hex_color[0:2], hex_color[2:4], hex_color[4:6]
            parts.append(f"BackColour=&H00{b}{g}{r}&")
    if style.get("letter_spacing") is not None:
        parts.append(f"Spacing={style['letter_spacing']}")
    return ",".join(parts)


def mux_subtitles(
    input_path: str,
    subtitle_path: str,
    output_path: str,
    language: str = "tur",
    title: str = "Turkish",
) -> str:
    """Mux (soft-sub) subtitles into video container."""
    ffmpeg = get_ffmpeg_path()
    cmd = [
        ffmpeg, "-y", "-v", "warning",
        "-i", str(input_path),
        "-i", str(subtitle_path),
        "-c", "copy",
        "-c:s", "srt",
        f"-metadata:s:s:0", f"language={language}",
        f"-metadata:s:s:0", f"title={title}",
        "-disposition:s:0", "default",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(f"Mux subtitles failed: {result.stderr[:200]}")
    return str(output_path)
