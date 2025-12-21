import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { checkRateLimit } from '@/lib/rate-limit';
import axios from 'axios';

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

function getScrapeCreatorsApiKey() {
  const apiKey = process.env.SCRAPECREATORS_API_KEY;
  
  if (!apiKey) {
    throw new Error('SCRAPECREATORS_API_KEY is not set in environment variables. Please configure it in Vercel dashboard or .env.local file.');
  }
  
  return apiKey;
}

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
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
    const scrapeCreatorsApiKey = getScrapeCreatorsApiKey();
    
    const body = await request.json();
    const { videoUrl, productDescription } = body;

    if (!videoUrl || !videoUrl.trim()) {
      return NextResponse.json(
        { error: 'Video URL is required' },
        { status: 400 }
      );
    }

    if (!productDescription || !productDescription.trim()) {
      return NextResponse.json(
        { error: 'Product description is required' },
        { status: 400 }
      );
    }

    // Detect platform and extract transcript
    const isInstagram = videoUrl.includes('instagram.com/reel') || videoUrl.includes('instagram.com/p/');
    const isTikTok = videoUrl.includes('tiktok.com');

    if (!isInstagram && !isTikTok) {
      return NextResponse.json(
        { error: 'Invalid URL. Please provide an Instagram Reel or TikTok URL.' },
        { status: 400 }
      );
    }

    let transcript = '';
    
    try {
      if (isInstagram) {
        // Instagram Reel transcript
        const response = await axios.get(
          `https://api.scrapecreators.com/v2/instagram/media/transcript?url=${encodeURIComponent(videoUrl)}`,
          {
            headers: { 'x-api-key': scrapeCreatorsApiKey }
          }
        );
        
        const data = response.data;
        if (data.transcripts && Array.isArray(data.transcripts) && data.transcripts.length > 0) {
          transcript = data.transcripts[0].text || '';
        } else if (data.text) {
          // Fallback to direct text property if transcripts array doesn't exist
          transcript = data.text;
        } else {
          return NextResponse.json(
            { error: 'Could not extract transcript from Instagram Reel. The video may not have captions.' },
            { status: 400 }
          );
        }
      } else if (isTikTok) {
        // TikTok transcript
        const response = await axios.get(
          `https://api.scrapecreators.com/v1/tiktok/video/transcript?url=${encodeURIComponent(videoUrl)}`,
          {
            headers: { 'x-api-key': scrapeCreatorsApiKey }
          }
        );
        
        const data = response.data;
        if (data.transcript) {
          // TikTok transcript might be an array or object, join it if it's an array
          if (Array.isArray(data.transcript)) {
            transcript = data.transcript.map((item: any) => {
              if (typeof item === 'string') return item;
              if (item.text) return item.text;
              return '';
            }).join(' ').trim();
          } else if (typeof data.transcript === 'string') {
            transcript = data.transcript;
          } else if (data.transcript.text) {
            transcript = data.transcript.text;
          } else {
            return NextResponse.json(
              { error: 'Could not extract transcript from TikTok video. The video may not have captions.' },
              { status: 400 }
            );
          }
        } else {
          return NextResponse.json(
            { error: 'Could not extract transcript from TikTok video. The video may not have captions.' },
            { status: 400 }
          );
        }
      }
    } catch (scrapeError: any) {
      console.error('Error scraping transcript:', scrapeError);
      return NextResponse.json(
        { 
          error: 'Failed to extract transcript from video',
          details: scrapeError.response?.data?.message || scrapeError.message || 'Could not access video transcript'
        },
        { status: 500 }
      );
    }

    if (!transcript || !transcript.trim()) {
      return NextResponse.json(
        { error: 'Empty transcript received. The video may not have captions.' },
        { status: 400 }
      );
    }

    console.log('Transcript extracted, length:', transcript.length);

    // Transform transcript using Gemini 3
    const transformationPrompt = `You are an expert creative writer specializing in viral marketing scripts. Your task is to creatively transform a viral video transcript into a new, improved script for the user's product while maintaining the essence, energy, and storytelling magic of the original.

**Original Video Transcript:**
${transcript}

**Product Description:**
${productDescription}

**Your Creative Task:**
Transform the original viral video transcript into a fresh, creative script for the user's product. You MUST:

1. **Be Creative, Don't Copy** - Rewrite everything in your own words. NEVER copy exact phrases or sentences from the original. Instead, capture the essence, energy, and style but express it creatively and uniquely.

2. **Maintain the Storytelling DNA** - Keep the same narrative structure, flow, pacing, and storytelling arc (hook, buildup, reveal, payoff). But express it with fresh, creative language.

3. **Preserve Tone and Energy** - Match the exact energy level, speaking style, and conversational tone. If it's enthusiastic, be enthusiastic. If it's calm and reassuring, be calm and reassuring. If it's bold and provocative, be bold and provocative.

4. **Enhance and Improve** - Don't just adapt, IMPROVE the script. Add relevant details about the user's product that make sense. Include specific benefits, features, or uses that are coherent with the product description. Make it more compelling and convincing than the original.

5. **Adapt Hooks and Body Creatively** - Transform the opening hook to be attention-grabbing for the user's product, but maintain the same hook style and energy. Adapt the body content to showcase the product's unique value while maintaining the narrative flow.

6. **Keep Natural Language** - The script should feel authentic, conversational, and natural - like a real person enthusiastically talking about the product.

**Critical Requirements:**
- **NEVER copy exact phrases or sentences** - Everything must be creatively rewritten
- Maintain the emotional triggers, promises, and calls-to-action structure, but express them uniquely
- Add relevant product details, benefits, and features that enhance the script
- Keep the same energy, enthusiasm level, and speaking style
- The script should feel fresh and creative, not like a template
- Maintain the original's storytelling magic but with new, improved content
- Do NOT add analysis or explanations - just output the transformed script
- **CRITICAL FORMATTING**: The script must be output as a SINGLE, CONTINUOUS PARAGRAPH with no line breaks, no bullet points, and no special formatting. Just one flowing paragraph of text.

**Output:**
Provide ONLY the creatively transformed script as a single continuous paragraph. It should be a fresh, improved version that captures the original's energy and structure but is completely rewritten with creative, unique language focused on the user's product. No headers, no explanations, no line breaks - just the script text flowing naturally in one paragraph.`;

    let result;
    try {
      result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [{ text: transformationPrompt }],
          },
        ],
      });
    } catch (geminiError: any) {
      console.error('Error calling Gemini:', geminiError);
      return NextResponse.json(
        { 
          error: 'Error transforming script with Gemini',
          details: geminiError.message || 'Could not process request with AI'
        },
        { status: 500 }
      );
    }

    // Extract script text from response and ensure it's a single paragraph
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
        { error: 'Failed to generate script text from AI response' },
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

      console.log('=== Viral Script Generation Cost ===');
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
    console.error('Error generating viral script:', error);
    
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'API configuration error. Please check your environment variables.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate viral script' },
      { status: 500 }
    );
  }
}
