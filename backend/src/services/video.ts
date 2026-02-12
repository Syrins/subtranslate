import ffmpeg from 'fluent-ffmpeg';
import { config } from '../config';
import path from 'path';
import fs from 'fs/promises';

if (config.ffmpegPath) {
  ffmpeg.setFfmpegPath(config.ffmpegPath);
}

if (config.ffprobePath) {
  ffmpeg.setFfprobePath(config.ffprobePath);
}

// Extract subtitles from video
export async function extractSubtitles(
  videoPath: string,
  outputDir: string
): Promise<Array<{ language: string; format: string; path: string }>> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, async (err, metadata) => {
      if (err) {
        return reject(err);
      }
      
      const subtitleStreams = metadata.streams?.filter(
        stream => stream.codec_type === 'subtitle'
      ) || [];
      
      if (subtitleStreams.length === 0) {
        return resolve([]);
      }
      
      const results: Array<{ language: string; format: string; path: string }> = [];
      
      for (let i = 0; i < subtitleStreams.length; i++) {
        const stream = subtitleStreams[i];
        const language = stream.tags?.language || `track${i}`;
        const format = stream.codec_name === 'ass' ? 'ass' : 'srt';
        const outputPath = path.join(outputDir, `subtitle_${i}_${language}.${format}`);
        
        await new Promise<void>((res, rej) => {
          ffmpeg(videoPath)
            .outputOptions([`-map 0:s:${i}`])
            .output(outputPath)
            .on('end', () => res())
            .on('error', rej)
            .run();
        });
        
        results.push({
          language,
          format,
          path: outputPath,
        });
      }
      
      resolve(results);
    });
  });
}

// Burn subtitles into video
export async function burnSubtitles(
  videoPath: string,
  subtitlePath: string,
  outputPath: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath)
      .outputOptions([
        '-c:v libx264',
        '-preset slow',
        '-crf 18',
        '-c:a copy',
        `-vf subtitles=${subtitlePath}`,
      ])
      .output(outputPath);
    
    if (onProgress) {
      command.on('progress', (progress) => {
        if (progress.percent) {
          onProgress(Math.round(progress.percent));
        }
      });
    }
    
    command
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

// Add watermark to video
export async function addWatermark(
  videoPath: string,
  watermarkText: string,
  outputPath: string,
  position: string = 'bottomright'
): Promise<void> {
  return new Promise((resolve, reject) => {
    let filterString = `drawtext=text='${watermarkText}':fontcolor=white:fontsize=24:box=1:boxcolor=black@0.5:boxborderw=5`;
    
    switch (position) {
      case 'topleft':
        filterString += ':x=10:y=10';
        break;
      case 'topright':
        filterString += ':x=(w-text_w-10):y=10';
        break;
      case 'bottomleft':
        filterString += ':x=10:y=(h-text_h-10)';
        break;
      case 'bottomright':
      default:
        filterString += ':x=(w-text_w-10):y=(h-text_h-10)';
        break;
    }
    
    ffmpeg(videoPath)
      .videoFilters(filterString)
      .outputOptions(['-c:a copy'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

// Export video with soft subtitles
export async function exportWithSoftSubs(
  videoPath: string,
  subtitlePath: string,
  outputPath: string,
  audioTracks?: number[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg(videoPath)
      .input(subtitlePath)
      .outputOptions([
        '-c:v copy',
        '-c:a copy',
        '-c:s mov_text', // MP4-compatible subtitle codec
        '-map 0:v',
        '-map 0:a',
        '-map 1:s',
      ]);
    
    if (audioTracks && audioTracks.length > 0) {
      // Map specific audio tracks
      command.outputOptions(
        audioTracks.map(track => `-map 0:a:${track}`)
      );
    }
    
    command
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

// Get video info
export async function getVideoInfo(videoPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        return reject(err);
      }
      resolve(metadata);
    });
  });
}
