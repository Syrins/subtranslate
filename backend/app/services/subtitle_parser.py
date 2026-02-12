import pysubs2
import chardet
from pathlib import Path
import structlog

logger = structlog.get_logger()


def detect_encoding(file_path: str) -> str:
    """Detect file encoding using chardet."""
    with open(file_path, "rb") as f:
        raw = f.read(10000)
    result = chardet.detect(raw)
    return result.get("encoding", "utf-8") or "utf-8"


def parse_subtitle_file(file_path: str) -> list[dict]:
    """Parse a subtitle file (SRT/ASS/SSA/VTT) and return structured lines."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Subtitle file not found: {file_path}")

    encoding = detect_encoding(file_path)
    logger.info("parse_subtitle", file=path.name, encoding=encoding)

    subs = pysubs2.load(str(path), encoding=encoding)
    lines = []
    line_num = 0

    for event in subs:
        if event.is_comment:
            continue

        line_num += 1
        lines.append({
            "line_number": line_num,
            "start_time": format_time_srt(event.start),
            "end_time": format_time_srt(event.end),
            "original_text": event.plaintext.strip(),
            "style": {
                "name": event.style if hasattr(event, "style") else "Default",
                "bold": getattr(event, "bold", False),
                "italic": getattr(event, "italic", False),
            },
        })

    return lines


def format_time_srt(ms: int) -> str:
    """Convert milliseconds to SRT time format (HH:MM:SS,mmm)."""
    hours = ms // 3_600_000
    ms %= 3_600_000
    minutes = ms // 60_000
    ms %= 60_000
    seconds = ms // 1_000
    millis = ms % 1_000
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def write_srt(lines: list[dict], output_path: str, use_translated: bool = True) -> str:
    """Write subtitle lines to SRT format."""
    with open(output_path, "w", encoding="utf-8") as f:
        for i, line in enumerate(lines, 1):
            if use_translated:
                text = line.get("translated_text") or line.get("original_text", "")
            else:
                text = line.get("original_text", "")
            start = line["start_time"]
            end = line["end_time"]
            f.write(f"{i}\n{start} --> {end}\n{text}\n\n")
    return output_path


def write_ass(lines: list[dict], output_path: str, style: dict | None = None) -> str:
    """Write subtitle lines to ASS format with optional styling."""
    subs = pysubs2.SSAFile()

    if style:
        default_style = pysubs2.SSAStyle(
            fontname=style.get("font_family", "Arial"),
            fontsize=style.get("font_size", 48),
            primarycolor=pysubs2.Color(*hex_to_rgba(style.get("color", "#FFFFFF"))),
            bold=style.get("bold", False),
            italic=style.get("italic", False),
            outline=style.get("outline", 2),
            shadow=style.get("shadow", 1),
            alignment=style.get("alignment", 2),
            marginv=style.get("margin_v", 30),
        )
        subs.styles["Default"] = default_style

    for line in lines:
        text = line.get("translated_text") or line.get("original_text", "")
        start_ms = srt_time_to_ms(line["start_time"])
        end_ms = srt_time_to_ms(line["end_time"])
        event = pysubs2.SSAEvent(start=start_ms, end=end_ms, text=text)
        subs.events.append(event)

    subs.save(output_path)
    return output_path


def srt_time_to_ms(time_str: str) -> int:
    """Convert SRT time (HH:MM:SS,mmm) to milliseconds."""
    time_str = time_str.replace(",", ".")
    parts = time_str.split(":")
    hours = int(parts[0])
    minutes = int(parts[1])
    sec_parts = parts[2].split(".")
    seconds = int(sec_parts[0])
    millis = int(sec_parts[1]) if len(sec_parts) > 1 else 0
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + millis


def hex_to_rgba(hex_color: str) -> tuple[int, int, int, int]:
    """Convert hex color to RGBA tuple."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
        return (r, g, b, 0)
    elif len(hex_color) == 8:
        r, g, b, a = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16), int(hex_color[6:8], 16)
        return (r, g, b, a)
    return (255, 255, 255, 0)
