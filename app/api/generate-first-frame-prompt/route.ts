import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export const maxDuration = 60; // 60 seconds for Vercel Pro plan

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateFirstFramePrompt', request);
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
    const { videoPrompt } = body;

    if (!videoPrompt || !videoPrompt.trim()) {
      return NextResponse.json(
        { error: 'Video prompt is required' },
        { status: 400 }
      );
    }

    const prompt = `Act as a *Senior Prompt Engineer specializing in AI Hyperrealistic Image Generation*. Your task is to create a detailed image prompt that represents the FIRST FRAME of a video based on the provided video prompt.

**VIDEO PROMPT PROVIDED:**
${videoPrompt}

**YOUR TASK:**
Transform this video prompt into a detailed, comprehensive image prompt that captures the FIRST FRAME of the video. The image prompt must:

1. **Capture the Initial Moment**: Describe exactly what would be seen in the very first frame (0:00) of the video
2. **Maintain All Visual Elements**: Include all visual details, composition, lighting, camera angles, and styling from the video prompt
3. **Remove Temporal Elements**: Remove any references to movement, transitions, time-based actions, or sequences that happen over time
4. **Freeze the Action**: Describe the scene as a single, frozen moment in time - the exact instant the video begins
5. **Preserve Quality**: Maintain all quality descriptors (hyperrealistic, photorealistic, 8K, etc.)
6. **Preserve Style**: Keep all style elements (UGC aesthetic, mobile camera, cinematic, etc.)
7. **Preserve Composition**: Keep the exact composition, framing, and camera angle described in the video prompt
8. **Preserve Lighting**: Maintain all lighting details and mood
9. **Preserve Product/Character Details**: Include all product, character, and environment details exactly as described

**CRITICAL REQUIREMENTS:**
- The image prompt must be a SINGLE, FROZEN MOMENT - no movement, no time progression
- Remove phrases like "while", "as", "then", "transitions to", "cuts to", "moves", "slowly", "gradually", etc.
- Keep static descriptions: poses, expressions, positions, compositions
- Maintain all visual quality and style descriptors
- The prompt should be ready to use directly in an AI image generator
- Output ONLY the image prompt itself, without any introductory text or explanations

**OUTPUT FORMAT:**
Respond with ONLY the image prompt text, nothing else. No explanations, no "This is the prompt..." - just the prompt itself.`;

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });

    // Extract the generated text from the response
    let firstFramePrompt = '';
    
    if (result.candidates && result.candidates[0]?.content?.parts) {
      firstFramePrompt = result.candidates[0].content.parts
        .map((part: any) => part.text || '')
        .join('')
        .trim();
    } else if ((result as any).text) {
      firstFramePrompt = (result as any).text.trim();
    }

    // Clean up the prompt - remove any introductory phrases
    firstFramePrompt = firstFramePrompt.trim();
    
    // Remove common introductory phrases
    const introPhrases = [
      'This is the prompt:',
      'Here is the prompt:',
      'The image prompt is:',
      'Prompt:',
      'Image prompt:',
      'This is the image prompt:',
      'Here\'s the prompt:'
    ];
    
    for (const phrase of introPhrases) {
      if (firstFramePrompt.toLowerCase().startsWith(phrase.toLowerCase())) {
        firstFramePrompt = firstFramePrompt.substring(phrase.length).trim();
        // Remove leading colon if present
        if (firstFramePrompt.startsWith(':')) {
          firstFramePrompt = firstFramePrompt.substring(1).trim();
        }
        break;
      }
    }

    if (!firstFramePrompt || firstFramePrompt.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate first frame prompt' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      prompt: firstFramePrompt
    });

  } catch (error: any) {
    console.error('Error generating first frame prompt:', error);
    
    // Check if it's a credit error
    if (error.message && error.message.includes('Insufficient credits')) {
      return NextResponse.json(
        { error: 'Insufficient credits' },
        { status: 402 }
      );
    }
    
    return NextResponse.json(
      {
        error: 'Error generating first frame prompt',
        details: error.message || 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}

