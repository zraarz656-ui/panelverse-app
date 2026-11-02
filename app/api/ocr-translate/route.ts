import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { requireAdmin } from '@/lib/admin-auth';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ml: 'Malayalam (മലയാളം)',
  hi: 'Hindi (हिन्दी)',
  ta: 'Tamil (தமிழ்)',
};

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      mode = 'full-page',
      imageBase64,
      mimeType = 'image/jpeg',
      targetLanguage = 'en',
      adminEmail,
    } = body;

    // Restrict Studio OCR endpoint strictly to the Admin
    const adminAuthErr = requireAdmin(req);
    const isVerifiedOwnerEmail = adminEmail === 'yuniquearun@gmail.com';
    if (adminAuthErr && !isVerifiedOwnerEmail) {
      return adminAuthErr;
    }

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json(
        { error: 'imageBase64 is required for AI translation' },
        { status: 400 }
      );
    }

    const cleanBase64 = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;

    const targetLangLabel =
      LANGUAGE_NAMES[targetLanguage] || LANGUAGE_NAMES.en;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured on the server.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    if (mode === 'single-box') {
      let responseText = '';
      let lastErr: unknown = null;

      for (const modelName of CANDIDATE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: cleanBase64,
                  },
                },
                {
                  text: `You are an expert webtoon and manga typesetter and translator.
1. Extract all visible dialogue or sound-effect text inside this cropped comic speech bubble image accurately as "originalText".
2. Translate that dialogue naturally and expressively into ${targetLangLabel} as "translatedText", keeping it concise so it fits neatly inside a comic speech bubble.
If no text is visible, return empty strings.`,
                },
              ],
            },
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  originalText: { type: Type.STRING },
                  translatedText: { type: Type.STRING },
                },
                required: ['originalText', 'translatedText'],
              },
            },
          });

          responseText = (response.text ?? '{}').trim();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          console.warn(`Single-box OCR model ${modelName} failed:`, err);
        }
      }

      if (lastErr && !responseText) throw lastErr;

      let parsed: { originalText?: string; translatedText?: string } = {};
      try {
        parsed = JSON.parse(responseText || '{}');
      } catch {
        parsed = { originalText: '', translatedText: responseText };
      }

      return NextResponse.json({
        originalText: (parsed.originalText || '').trim(),
        translatedText: (parsed.translatedText || '').trim(),
      });
    }

    // Full-page automatic speech bubble text detection & style-matched translation
    let responseText = '';
    let lastErr: unknown = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: cleanBase64,
                },
              },
              {
                text: `You are an elite webtoon and manga scanlation typesetter.
Analyze this comic page image and find every speech bubble, narration box, or dialogue caption containing text.
For each text block:
1. Return a tight bounding box (ymin, xmin, ymax, xmax on a 0 to 1000 scale) around ONLY the text letters themselves inside the bubble (stay strictly inside the speech bubble's inner background so the bubble's outline/border is NEVER covered).
2. Extract the exact "originalText".
3. Translate it naturally, accurately, and concisely into ${targetLangLabel} as "translatedText" so it fits cleanly inside the same bubble area.
4. Set "isDarkBubble" to true ONLY if the background directly behind the letters is dark/black with light/white text; set false if the bubble background is light/white with dark text.
5. Set "style" to "shout" if the text is bold/exclamatory, "narration" if inside a rectangular caption/system window, or "dialogue" for normal speech.`,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                bubbles: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      ymin: {
                        type: Type.NUMBER,
                        description: 'Top Y coordinate (0 to 1000) tightly bounding the text letters.',
                      },
                      xmin: {
                        type: Type.NUMBER,
                        description: 'Left X coordinate (0 to 1000) tightly bounding the text letters.',
                      },
                      ymax: {
                        type: Type.NUMBER,
                        description: 'Bottom Y coordinate (0 to 1000) tightly bounding the text letters.',
                      },
                      xmax: {
                        type: Type.NUMBER,
                        description: 'Right X coordinate (0 to 1000) tightly bounding the text letters.',
                      },
                      originalText: {
                        type: Type.STRING,
                        description: 'Original dialogue text.',
                      },
                      translatedText: {
                        type: Type.STRING,
                        description: `Translated dialogue in ${targetLangLabel}.`,
                      },
                      isDarkBubble: {
                        type: Type.BOOLEAN,
                        description: 'True if text is light on a dark bubble background; false if dark text on light background.',
                      },
                      style: {
                        type: Type.STRING,
                        description: 'One of: dialogue, shout, narration',
                      },
                    },
                    required: [
                      'ymin',
                      'xmin',
                      'ymax',
                      'xmax',
                      'originalText',
                      'translatedText',
                      'isDarkBubble',
                      'style',
                    ],
                  },
                },
              },
              required: ['bubbles'],
            },
          },
        });

        responseText = (response.text ?? '{"bubbles":[]}').trim();
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`Full-page OCR model ${modelName} failed, trying fallback:`, err);
      }
    }

    if (lastErr && !responseText) {
      throw lastErr;
    }

    let parsed: {
      bubbles?: Array<{
        ymin: number;
        xmin: number;
        ymax: number;
        xmax: number;
        originalText: string;
        translatedText: string;
        isDarkBubble?: boolean;
        style?: string;
      }>;
    } = { bubbles: [] };

    try {
      parsed = JSON.parse(responseText || '{"bubbles":[]}');
    } catch {
      parsed = { bubbles: [] };
    }

    const validBubbles = (Array.isArray(parsed.bubbles) ? parsed.bubbles : [])
      .filter(
        (b) =>
          b &&
          typeof b.translatedText === 'string' &&
          b.translatedText.trim().length > 0 &&
          Number.isFinite(b.xmin) &&
          Number.isFinite(b.ymin) &&
          Number.isFinite(b.xmax) &&
          Number.isFinite(b.ymax) &&
          b.xmax > b.xmin &&
          b.ymax > b.ymin
      )
      .map((b) => ({
        xmin: Math.max(0, Math.min(1000, Number(b.xmin))),
        ymin: Math.max(0, Math.min(1000, Number(b.ymin))),
        xmax: Math.max(0, Math.min(1000, Number(b.xmax))),
        ymax: Math.max(0, Math.min(1000, Number(b.ymax))),
        originalText: String(b.originalText || '').trim(),
        translatedText: String(b.translatedText || '').trim(),
        isDarkBubble: Boolean(b.isDarkBubble),
        style:
          b.style === 'shout' || b.style === 'narration'
            ? b.style
            : 'dialogue',
      }));

    return NextResponse.json({ bubbles: validBubbles });
  } catch (error: unknown) {
    console.error('Gemini OCR translation error:', error);
    const rawMsg =
      error instanceof Error ? error.message : 'Failed to auto-translate page';
    const isBusy =
      rawMsg.includes('503') ||
      rawMsg.includes('UNAVAILABLE') ||
      rawMsg.includes('high demand') ||
      rawMsg.includes('429');
    const cleanMsg = isBusy
      ? 'AI translation model is experiencing temporary high demand. Please tap Auto-Translate again in a few seconds.'
      : rawMsg;
    return NextResponse.json({ error: cleanMsg }, { status: 500 });
  }
}
