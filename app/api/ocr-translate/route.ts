import { NextRequest, NextResponse } from 'next/server';
import {
  GoogleGenAI,
  Type,
  HarmCategory,
  HarmBlockThreshold,
} from '@google/genai';
import { requireAdmin } from '@/lib/admin-auth';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ml: 'Malayalam (മലയാളം)',
  hi: 'Hindi (हिन्दी)',
  ta: 'Tamil (தமிழ்)',
};

// Compatible across both AI Studio internal keys and external Vercel Google AI Studio keys
const CANDIDATE_MODELS = [
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
];

const UNRESTRICTED_SAFETY_SETTINGS = [
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryOpenRouterOcr(params: {
  imageBase64: string;
  mimeType: string;
  targetLangLabel: string;
  apiKey?: string;
}): Promise<string | null> {
  const openrouterKey = params.apiKey || process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) return null;

  const candidateModels = [
    'google/gemini-2.0-flash-exp:free',
    'qwen/qwen-2.5-vl-72b-instruct:free',
    'meta-llama/llama-3.2-11b-vision-instruct:free',
  ];

  for (const model of candidateModels) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openrouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://panelverse-app.vercel.app',
          'X-Title': 'PanelVerse Webtoon Reader',
        },
        body: JSON.stringify({
          model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `You are an elite webtoon and manga scanlation typesetter.
Analyze this comic page image and find every speech bubble, narration box, or dialogue caption containing text.
Return JSON with key "bubbles": array of objects with:
ymin (0-1000), xmin (0-1000), ymax (0-1000), xmax (0-1000) bounding ONLY the text letters tightly inside the bubble,
originalText (string), translatedText (natural translation in ${params.targetLangLabel}),
isDarkBubble (boolean, true if dark bubble background with light text),
style ("dialogue" | "shout" | "narration").
If no text is found, return {"bubbles":[]}.`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${params.mimeType};base64,${params.imageBase64}`,
                  },
                },
              ],
            },
          ],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let content = data.choices?.[0]?.message?.content;
        if (content && typeof content === 'string') {
          content = content.trim();
          if (content.startsWith('```json')) {
            content = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
          } else if (content.startsWith('```')) {
            content = content.replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
          }
          return content;
        }
      }
    } catch {
      // Continue to next model
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      mode = 'full-page',
      imageBase64,
      mimeType = 'image/jpeg',
      targetLanguage = 'en',
      adminEmail,
      engine = 'auto',
      openRouterKey,
    } = body;

    // Restrict Studio OCR endpoint to unlocked Studio / Admin sessions
    const adminAuthErr = requireAdmin(req);
    const hasAdminEmail =
      typeof adminEmail === 'string' && adminEmail.includes('@');
    if (adminAuthErr && !hasAdminEmail && !mode) {
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

    const effectiveOpenRouterKey =
      openRouterKey || process.env.OPENROUTER_API_KEY;

    // If user explicitly chose OpenRouter engine, run OpenRouter first
    if (engine === 'openrouter') {
      if (!effectiveOpenRouterKey) {
        return NextResponse.json(
          {
            error:
              'OpenRouter API key is not configured. Add it in Vercel environment variables or enter it in the Studio settings.',
          },
          { status: 400 }
        );
      }
      const openRouterResult = await tryOpenRouterOcr({
        imageBase64: cleanBase64,
        mimeType,
        targetLangLabel,
        apiKey: effectiveOpenRouterKey,
      });

      if (openRouterResult) {
        let parsed: { bubbles?: unknown[] } = { bubbles: [] };
        try {
          parsed = JSON.parse(openRouterResult);
        } catch {
          parsed = { bubbles: [] };
        }
        const rawList = Array.isArray(parsed.bubbles) ? parsed.bubbles : [];
        return NextResponse.json({
          bubbles: rawList,
          blockedBySafety: false,
          engineUsed: 'openrouter',
        });
      }
    }

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      // Fallback to OpenRouter if Gemini key is absent but OpenRouter key is present
      if (effectiveOpenRouterKey) {
        const openRouterResult = await tryOpenRouterOcr({
          imageBase64: cleanBase64,
          mimeType,
          targetLangLabel,
          apiKey: effectiveOpenRouterKey,
        });
        if (openRouterResult) {
          let parsed: { bubbles?: unknown[] } = { bubbles: [] };
          try {
            parsed = JSON.parse(openRouterResult);
          } catch {
            parsed = { bubbles: [] };
          }
          return NextResponse.json({
            bubbles: Array.isArray(parsed.bubbles) ? parsed.bubbles : [],
            blockedBySafety: false,
            engineUsed: 'openrouter',
          });
        }
      }
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
              safetySettings: UNRESTRICTED_SAFETY_SETTINGS,
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
          await sleep(600);
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
    let wasBlockedBySafety = false;

    for (let attempt = 0; attempt < 2; attempt++) {
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
              safetySettings: UNRESTRICTED_SAFETY_SETTINGS,
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
                          description:
                            'Top Y coordinate (0 to 1000) tightly bounding the text letters.',
                        },
                        xmin: {
                          type: Type.NUMBER,
                          description:
                            'Left X coordinate (0 to 1000) tightly bounding the text letters.',
                        },
                        ymax: {
                          type: Type.NUMBER,
                          description:
                            'Bottom Y coordinate (0 to 1000) tightly bounding the text letters.',
                        },
                        xmax: {
                          type: Type.NUMBER,
                          description:
                            'Right X coordinate (0 to 1000) tightly bounding the text letters.',
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
                          description:
                            'True if text is light on a dark bubble background; false if dark text on light background.',
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

          const finishReason = String(
            response.candidates?.[0]?.finishReason || ''
          );
          if (
            finishReason.includes('SAFETY') ||
            finishReason.includes('PROHIBITED') ||
            finishReason.includes('BLOCKLIST') ||
            Boolean(response.promptFeedback?.blockReason)
          ) {
            wasBlockedBySafety = true;
          }

          responseText = (response.text ?? '').trim();
          if (responseText) {
            lastErr = null;
            break;
          }
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `Full-page OCR model ${modelName} (attempt ${attempt + 1}) failed:`,
            msg
          );
          if (
            msg.includes('503') ||
            msg.includes('429') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('RESOURCE_EXHAUSTED')
          ) {
            await sleep(1100 * (attempt + 1));
          }
        }
      }
      if (responseText || wasBlockedBySafety) break;
    }

    if (wasBlockedBySafety && !responseText) {
      return NextResponse.json({
        bubbles: [],
        blockedBySafety: true,
      });
    }

    if (!responseText) {
      // Try OpenRouter fallback if configured
      const openRouterResult = await tryOpenRouterOcr({
        imageBase64: cleanBase64,
        mimeType,
        targetLangLabel,
        apiKey: effectiveOpenRouterKey,
      });
      if (openRouterResult) {
        responseText = openRouterResult;
        lastErr = null;
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

    return NextResponse.json({
      bubbles: validBubbles,
      blockedBySafety: wasBlockedBySafety && validBubbles.length === 0,
    });
  } catch (error: unknown) {
    console.error('Gemini OCR translation error:', error);
    const rawMsg =
      error instanceof Error ? error.message : 'Failed to auto-translate page';
    const isBusy =
      rawMsg.includes('503') ||
      rawMsg.includes('UNAVAILABLE') ||
      rawMsg.includes('high demand') ||
      rawMsg.includes('429') ||
      rawMsg.includes('RESOURCE_EXHAUSTED');
    const cleanMsg = isBusy
      ? 'AI translation model is experiencing temporary high demand (15 RPM limit). Cooling down...'
      : rawMsg;
    return NextResponse.json(
      {
        error: cleanMsg,
        isRateLimit: isBusy,
        retryAfterSeconds: 22,
      },
      { status: isBusy ? 429 : 500 }
    );
  }
}

