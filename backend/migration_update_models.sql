-- Update default models to current stable versions
UPDATE translation_engines SET model = 'gpt-4.1-mini' WHERE id = 'openai';
UPDATE translation_engines SET model = 'gemini-2.5-flash' WHERE id = 'gemini';
UPDATE translation_engines SET model = 'openai/gpt-4.1-mini' WHERE id = 'openrouter';
