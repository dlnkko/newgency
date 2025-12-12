import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { checkRateLimit } from '@/lib/rate-limit';

// Helper function to get and validate API key at runtime
function getGoogleGenAI() {
  const googleApiKey = process.env.GOOGLE_GENAI_API_KEY;
  
  if (!googleApiKey) {
    throw new Error('GOOGLE_GENAI_API_KEY is not set in environment variables. Please configure it in Vercel dashboard or .env.local file.');
  }
  
  return new GoogleGenAI({ 
    apiKey: googleApiKey 
  });
}

export async function POST(request: NextRequest) {
  try {
    // Check rate limit (using same limit as generateViralScript)
    const rateLimitResult = await checkRateLimit('generateViralScript', request);
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

    // Initialize AI client at runtime
    const ai = getGoogleGenAI();
    
    const body = await request.json();
    const { originalScript, duration } = body;

    if (!originalScript || !originalScript.trim()) {
      return NextResponse.json(
        { error: 'Original script is required' },
        { status: 400 }
      );
    }

    if (!duration || ![15, 20, 30].includes(duration)) {
      return NextResponse.json(
        { error: 'Duration must be 15, 20, or 30 seconds' },
        { status: 400 }
      );
    }

    // Adapt script to specific duration
    const adaptationPrompt = `You are an expert at adapting viral video scripts to specific durations while maintaining the core storytelling, hooks, and energy.

**Original Script:**
${originalScript}

**Target Duration:**
${duration} seconds

**Your Task:**
Adapt the original script to fit exactly ${duration} seconds of spoken content. You MUST:

1. **Maintain the core structure** - Keep the same hooks, key messages, and storytelling flow
2. **Preserve the energy and tone** - Match the original's pace and emotional impact
3. **Optimize for duration** - Adjust pacing, remove or condense less critical parts, but keep all essential elements
4. **Keep it natural** - The script should feel organic and conversational, not rushed or cut off awkwardly
5. **Maintain conversion elements** - Keep all hooks, promises, calls-to-action, and emotional triggers

**Critical Requirements:**
- The adapted script should feel like the same script, just optimized for ${duration} seconds
- Keep the same style, voice, and personality
- Don't add new content, just optimize what exists
- Make it flow naturally at the target duration
- **CRITICAL FORMATTING**: The script must be output as a SINGLE, CONTINUOUS PARAGRAPH with no line breaks, no bullet points, and no special formatting. Just one flowing paragraph of text.

**Output:**
Provide ONLY the adapted script as a single continuous paragraph optimized for ${duration} seconds. No headers, no explanations, no line breaks - just the script text flowing naturally in one paragraph.`;

    let result;
    try {
      result = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
          {
            role: 'user',
            parts: [{ text: adaptationPrompt }],
          },
        ],
      });
    } catch (geminiError: any) {
      console.error('Error calling Gemini:', geminiError);
      return NextResponse.json(
        { 
          error: 'Error adapting script with Gemini',
          details: geminiError.message || 'Could not process request with AI'
        },
        { status: 500 }
      );
    }

    // Extract script text from response
    let scriptText = '';
    if (result.candidates && result.candidates[0]?.content?.parts) {
      scriptText = result.candidates[0].content.parts
        .map((part: any) => part.text || '')
        .join('')
        .trim()
        // Ensure it's a single paragraph (replace multiple line breaks with spaces)
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (!scriptText) {
      console.error('No script text in response:', result);
      return NextResponse.json(
        { error: 'Failed to generate adapted script from AI response' },
        { status: 500 }
      );
    }

    // Calculate costs (for backend logging only)
    const usageMetadata = (result as any).usageMetadata;
    if (usageMetadata) {
      const inputTokens = usageMetadata.promptTokenCount || 0;
      const outputTokens = usageMetadata.candidatesTokenCount || 0;
      const totalTokens = inputTokens + outputTokens;
      
      // Gemini 3 Pro pricing (as of latest update)
      // Input: $0.50 per 1M tokens, Output: $1.50 per 1M tokens
      const inputCost = (inputTokens / 1_000_000) * 0.50;
      const outputCost = (outputTokens / 1_000_000) * 1.50;
      const totalCost = inputCost + outputCost;

      console.log('=== Script Adaptation Cost ===');
      console.log(`Input tokens: ${inputTokens.toLocaleString()}`);
      console.log(`Output tokens: ${outputTokens.toLocaleString()}`);
      console.log(`Total tokens: ${totalTokens.toLocaleString()}`);
      console.log(`Input cost: $${inputCost.toFixed(6)}`);
      console.log(`Output cost: $${outputCost.toFixed(6)}`);
      console.log(`Total cost: $${totalCost.toFixed(6)}`);
      console.log('===================================');
    }

    return NextResponse.json({
      script: scriptText,
    });
  } catch (error: any) {
    console.error('Error adapting viral script:', error);
    
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'API configuration error. Please check your environment variables.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to adapt viral script' },
      { status: 500 }
    );
  }
}

