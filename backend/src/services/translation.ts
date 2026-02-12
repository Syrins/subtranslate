import OpenAI from 'openai';
import * as deepl from 'deepl-node';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config';

// Parse SRT format
function parseSRT(content: string): Array<{ index: number; text: string; timing: string }> {
  const blocks = content.trim().split('\n\n');
  return blocks.map(block => {
    const lines = block.split('\n');
    const index = parseInt(lines[0]);
    const timing = lines[1];
    const text = lines.slice(2).join('\n');
    return { index, timing, text };
  });
}

// Format back to SRT
function formatSRT(entries: Array<{ index: number; text: string; timing: string }>): string {
  return entries
    .map(entry => `${entry.index}\n${entry.timing}\n${entry.text}`)
    .join('\n\n');
}

// Translate using OpenAI
async function translateWithOpenAI(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (!config.openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }
  
  const openai = new OpenAI({ apiKey: config.openaiApiKey });
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [
      {
        role: 'system',
        content: `You are a professional translator. Translate the following subtitle text from ${sourceLang} to ${targetLang}. Preserve timing codes and formatting. Only return the translated text, nothing else.`,
      },
      {
        role: 'user',
        content: text,
      },
    ],
    temperature: 0.3,
  });
  
  return response.choices[0]?.message?.content || text;
}

// Translate using DeepL
async function translateWithDeepL(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (!config.deeplApiKey) {
    throw new Error('DeepL API key not configured');
  }
  
  const translator = new deepl.Translator(config.deeplApiKey);
  
  // DeepL expects language codes like 'EN', 'DE', etc.
  const targetLangCode = targetLang.toUpperCase().substring(0, 2);
  
  const result = await translator.translateText(
    text,
    null, // auto-detect source language
    targetLangCode as deepl.TargetLanguageCode
  );
  
  return result.text;
}

// Translate using Google Gemini
async function translateWithGemini(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  if (!config.geminiApiKey) {
    throw new Error('Gemini API key not configured');
  }
  
  const genAI = new GoogleGenerativeAI(config.geminiApiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
  
  const prompt = `Translate the following subtitle text from ${sourceLang} to ${targetLang}. Preserve all timing codes and formatting exactly. Only return the translated text:\n\n${text}`;
  
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

// Main translation function
export async function translateSubtitle(
  content: string,
  sourceLang: string,
  targetLang: string,
  service: 'openai' | 'deepl' | 'gemini'
): Promise<string> {
  try {
    // Parse SRT to extract text blocks
    const entries = parseSRT(content);
    
    // Translate each text block
    const translatedEntries = await Promise.all(
      entries.map(async (entry) => {
        let translatedText: string;
        
        switch (service) {
          case 'openai':
            translatedText = await translateWithOpenAI(entry.text, sourceLang, targetLang);
            break;
          case 'deepl':
            translatedText = await translateWithDeepL(entry.text, sourceLang, targetLang);
            break;
          case 'gemini':
            translatedText = await translateWithGemini(entry.text, sourceLang, targetLang);
            break;
          default:
            throw new Error(`Unknown translation service: ${service}`);
        }
        
        return {
          ...entry,
          text: translatedText,
        };
      })
    );
    
    // Format back to SRT
    return formatSRT(translatedEntries);
  } catch (error) {
    console.error('Translation error:', error);
    throw new Error(`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
