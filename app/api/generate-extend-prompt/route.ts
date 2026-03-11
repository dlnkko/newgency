import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export const maxDuration = 60; // 60 seconds for Vercel Pro plan

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateExtendPrompt', request);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          details: rateLimitResult.error,
          limit: rateLimitResult.limit,
          remaining: rateLimitResult.remaining,
          reset: rateLimitResult.reset,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimitResult.limit?.toString() || '',
            'X-RateLimit-Remaining': rateLimitResult.remaining?.toString() || '0',
            'X-RateLimit-Reset': rateLimitResult.reset?.toString() || '',
            'Retry-After': rateLimitResult.reset?.toString() || '3600',
          },
        }
      );
    }

    // Check and consume user credit
    const creditError = await verifyAndConsumeCredit(request);
    if (creditError) {
      return creditError;
    }

    // Initialize AI client at runtime (uses user's API key if configured)
    const ai = await getGoogleGenAI(request);
    
    const body = await request.json();
    const { originalPrompt, newScript, newActions } = body;

    if (!originalPrompt || !originalPrompt.trim()) {
      return NextResponse.json(
        { error: 'Original prompt is required' },
        { status: 400 }
      );
    }

    if (!newScript && !newActions) {
      return NextResponse.json(
        { error: 'Either new script or new actions must be provided' },
        { status: 400 }
      );
    }

    const prompt = `Act as a *Senior Prompt Engineer specializing in AI Hyperrealistic Video Generation*. Your task is to create a CONTINUATION/EXTENSION of an existing video prompt, maintaining perfect continuity with the original.

**ORIGINAL VIDEO PROMPT:**
${originalPrompt}

**NEW ELEMENTS TO INTEGRATE:**
${newScript ? `**New Script:**\n${newScript}\n` : ''}${newActions ? `**New Actions:**\n${newActions}\n` : ''}

**CRITICAL REQUIREMENTS FOR CONTINUITY:**

1. **CHARACTER CONTINUITY (MANDATORY):**
   - Analyze the original prompt to identify the character description (e.g., "24 year old man", "young woman", "middle-aged person", etc.)
   - In the extended prompt, refer to the character as "the same [character description]" or "the same man/woman/person" or simply "the same character"
   - Example: If original says "24 year old man", extended should say "the same 24 year old man" or "the same man"
   - NEVER create a new character - it must be the EXACT SAME person

2. **LOCATION AND SETTING CONTINUITY:**
   - If newActions does NOT mention a different location, setting, or environment, you MUST maintain:
     * The EXACT same location/setting from the original
     * The EXACT same lighting conditions
     * The EXACT same camera angle
     * The EXACT same composition
     * The EXACT same visual style and aesthetic
   - Only change location/setting if newActions explicitly mentions a different place or environment
   - If location is maintained, use phrases like "in the same location", "continuing in the same setting", or simply describe the same place

3. **VISUAL SPECIFICATIONS CONTINUITY:**
   - Maintain ALL visual specifications from the original:
     * Camera angle (same angle unless newActions specifies otherwise)
     * Lighting (same lighting unless newActions specifies otherwise)
     * Composition (same composition unless newActions specifies otherwise)
     * Style (same hyperrealistic UGC style, mobile aesthetic, etc.)
     * Quality descriptors (same 8K, photorealistic, etc.)
   - Only change these if newActions explicitly requests different specifications

4. **SCRIPT INTEGRATION:**
   - If newScript is provided, it MUST be spoken throughout the ENTIRE 10-second video
   - Integrate the script seamlessly with the actions
   - Use phrases like "while [action], says [script portion]" or "as [action happens], narrates [script portion]"
   - Distribute the script throughout the 10-second duration
   - Ensure the script is mentioned early and flows naturally with the actions

5. **DURATION:**
   - The extended prompt MUST be exactly 10 seconds
   - Adjust pacing and script distribution to fit within 10 seconds

6. **ACTION INTEGRATION:**
   - If newActions is provided, integrate them with the script (if provided)
   - Maintain natural flow and coherence
   - Actions should feel like a continuation, not a completely new scene

7. **STYLE CONSISTENCY:**
   - Maintain the EXACT same style from the original (UGC, hyperrealistic, mobile aesthetic, etc.)
   - Keep all quality descriptors and technical specifications

**OUTPUT FORMAT:**
- Respond with ONLY the extended video prompt text
- NO introductory phrases like "This is the prompt..." or "Here's the extended prompt:"
- The prompt should be a single, comprehensive description ready for AI video generation
- Ensure it's exactly 10 seconds in duration
- Maintain perfect continuity with the original

**EXAMPLES OF CONTINUITY:**

Original: "A 24 year old man in a kitchen, holding a product, says 'This changed my life'"
Extended (script only): "The same 24 year old man in the same kitchen, continuing to hold the product, says '[new script]' while maintaining the same camera angle and lighting"

Original: "Young woman in bedroom, natural lighting, showing product"
Extended (actions only, no location change): "The same young woman in the same bedroom, with the same natural lighting, [new actions], maintaining the same camera angle and composition"

**YOUR TASK:**
Create a 10-second extended video prompt that:
- Maintains perfect character continuity (same person)
- Maintains location, lighting, camera angle, and composition (unless explicitly changed in newActions)
- Integrates newScript throughout the entire 10 seconds (if provided)
- Integrates newActions naturally (if provided)
- Feels like a seamless continuation of the original video
- Maintains all style and quality specifications from the original`;

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });

    // Si Gemini bloqueó por políticas (PROHIBITED_CONTENT, etc.), devolver error claro
    const promptFeedback = (result as any)?.promptFeedback;
    if (promptFeedback?.blockReason) {
      console.error('Gemini blocked extend-prompt at prompt level:', promptFeedback.blockReason);
      return NextResponse.json(
        {
          error: 'Content was blocked by AI safety filters',
          details:
            promptFeedback.blockReason === 'PROHIBITED_CONTENT'
              ? 'Gemini bloqueó este contenido por sus políticas. Suaviza el texto del script o las acciones (evita contenido sexual, violento o de odio) y vuelve a intentar.'
              : 'Gemini bloqueó este contenido. Ajusta el texto y vuelve a intentar.',
          blockReason: promptFeedback.blockReason,
        },
        { status: 400 }
      );
    }

    // Extract the generated text from the response
    let extendPrompt = '';
    const candidate = result.candidates?.[0];

    if (candidate?.content?.parts && Array.isArray(candidate.content.parts)) {
      extendPrompt = candidate.content.parts
        .map((part: any) => part.text || '')
        .join('')
        .trim();
    } else if ((candidate?.content as any)?.text) {
      extendPrompt = ((candidate?.content as any)?.text ?? '').trim();
    } else if ((result as any).text) {
      extendPrompt = (result as any).text.trim();
    }

    // Clean up the prompt - remove any introductory phrases
    extendPrompt = extendPrompt.trim();
    
    // Remove common introductory phrases
    const introPhrases = [
      'This is the extended prompt:',
      'Here is the extended prompt:',
      'The extended prompt is:',
      'Extended prompt:',
      'This is the prompt:',
      'Here is the prompt:',
      'The prompt is:',
      'Prompt:',
      'Here\'s the extended prompt:',
      'Here\'s the prompt:'
    ];
    
    for (const phrase of introPhrases) {
      if (extendPrompt.toLowerCase().startsWith(phrase.toLowerCase())) {
        extendPrompt = extendPrompt.substring(phrase.length).trim();
        // Remove leading colon if present
        if (extendPrompt.startsWith(':')) {
          extendPrompt = extendPrompt.substring(1).trim();
        }
        break;
      }
    }

    if (!extendPrompt || extendPrompt.length === 0) {
      const noCandidates = !result.candidates?.length;
      return NextResponse.json(
        {
          error: 'Failed to generate extend prompt',
          details: noCandidates
            ? 'Gemini no devolvió texto (puede ser bloqueo por contenido). Prueba con un script o acciones más neutros.'
            : 'No se pudo extraer el prompt de la respuesta. Vuelve a intentar.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      prompt: extendPrompt
    });

  } catch (error: any) {
    console.error('Error generating extend prompt:', error);
    
    // Check if it's a credit error
    if (error.message && error.message.includes('Insufficient credits')) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Error generating extend prompt',
        details: error.message || 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}

