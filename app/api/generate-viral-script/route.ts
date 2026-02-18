import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';
import axios from 'axios';

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

    // Check and consume user credit
    const creditError = await verifyAndConsumeCredit(request);
    if (creditError) {
      return creditError;
    }

    // Initialize AI client at runtime (uses user's API key if configured)
    const ai = await getGoogleGenAI(request);
    const scrapeCreatorsApiKey = getScrapeCreatorsApiKey();
    
    const body = await request.json();
    const { videoUrl, metaAdUrl, video, productDescription, creativeAngle, duration } = body;

    // Either videoUrl, metaAdUrl, or uploaded video must be provided
    if ((!videoUrl || !videoUrl.trim()) && (!metaAdUrl || !metaAdUrl.trim()) && !video) {
      return NextResponse.json(
        { error: 'Either Video URL, Meta Ad URL, or uploaded video is required' },
        { status: 400 }
      );
    }

    if (!productDescription || !productDescription.trim()) {
      return NextResponse.json(
        { error: 'Product description is required' },
        { status: 400 }
      );
    }

    let transcript = '';

    // Handle Meta Ad URL first (if provided)
    if (metaAdUrl && metaAdUrl.trim()) {
      try {
        // Extract ad ID from Meta Ad URL
        let adId: string | null = null;
        try {
          const urlObj = new URL(metaAdUrl);
          adId = urlObj.searchParams.get('id');
        } catch (urlError) {
          const idMatch = metaAdUrl.match(/[?&]id=(\d+)/);
          if (idMatch) {
            adId = idMatch[1];
          }
        }

        if (!adId) {
          return NextResponse.json(
            { error: 'Could not extract ad ID from URL. Make sure the URL has the correct format: https://www.facebook.com/ads/library/?id=XXXXX' },
            { status: 400 }
          );
        }

        // Call ScrapeCreators API to get Meta Ad transcript
        const response = await axios.get(
          `https://api.scrapecreators.com/v1/facebook/adLibrary/ad?id=${adId}&get_transcript=true`,
          {
            headers: {
              'x-api-key': scrapeCreatorsApiKey
            },
            timeout: 30000,
            validateStatus: (status) => status < 500
          }
        );

        if (response.status === 402) {
          return NextResponse.json(
            {
              error: 'No credits in ScrapeCreators',
              details: 'Your ScrapeCreators account does not have available credits. Please purchase more credits at https://scrapecreators.com'
            },
            { status: 402 }
          );
        }

        if (response.status >= 400) {
          return NextResponse.json(
            {
              error: 'Error getting ad data',
              details: response.data?.message || response.data?.error || 'Could not access Meta Ad'
            },
            { status: response.status }
          );
        }

        let data = response.data;
        
        // Handle nested message structure (similar to analyze route)
        if (data && typeof data === 'object' && 'message' in data && !('snapshot' in data)) {
          const messageData = data.message;
          if (messageData && typeof messageData === 'object' && 'snapshot' in messageData) {
            data = messageData;
          } else if (typeof messageData === 'string') {
            try {
              const parsed = JSON.parse(messageData);
              if (parsed && typeof parsed === 'object' && 'snapshot' in parsed) {
                data = parsed;
              }
            } catch (e) {
              // Continue with original data
            }
          }
        }
        
        // Extract transcript from Meta Ad response - check multiple possible locations
        if (data?.snapshot?.transcript) {
          transcript = data.snapshot.transcript;
        } else if (data?.snapshot?.videos?.[0]?.transcript) {
          transcript = data.snapshot.videos[0].transcript;
        } else if (data?.snapshot?.video?.transcript) {
          transcript = data.snapshot.video.transcript;
        } else if (data?.transcript) {
          transcript = data.transcript;
        } else if (data?.snapshot?.cards?.[0]?.transcript) {
          transcript = data.snapshot.cards[0].transcript;
        } else if (data?.snapshot?.cards?.[0]?.video?.transcript) {
          transcript = data.snapshot.cards[0].video.transcript;
        } else {
          return NextResponse.json(
            { error: 'Could not extract transcript from Meta Ad. The ad may not have a video with captions.' },
            { status: 400 }
          );
        }
        
        // Ensure transcript is a string
        if (typeof transcript !== 'string') {
          transcript = String(transcript || '').trim();
        }
      } catch (scrapeError: any) {
        console.error('Error scraping Meta Ad:', scrapeError);
        return NextResponse.json(
          { 
            error: 'Failed to extract transcript from Meta Ad',
            details: scrapeError.response?.data?.message || scrapeError.message || 'Could not access Meta Ad transcript'
          },
          { status: 500 }
        );
      }
    } else if (videoUrl && videoUrl.trim()) {
      // Handle regular video URL (Instagram/TikTok)
      // Detect platform and extract transcript
      const isInstagram = videoUrl.includes('instagram.com/reel') || videoUrl.includes('instagram.com/p/');
      const isTikTok = videoUrl.includes('tiktok.com');

      if (!isInstagram && !isTikTok) {
        return NextResponse.json(
          { error: 'Invalid URL. Please provide an Instagram Reel or TikTok URL.' },
          { status: 400 }
        );
      }

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
    } else if (video) {
      // Handle uploaded video
      try {
        console.log('Processing uploaded video for transcript extraction...');
        const videoBuffer = Buffer.from(video.split(',')[1], 'base64');
        const videoUint8Array = new Uint8Array(videoBuffer);
        const videoBlob = new Blob([videoUint8Array], { type: 'video/mp4' });
        
        // Upload video to Gemini Files
        console.log('Uploading video to Gemini Files...');
        let myfile = await ai.files.upload({
          file: videoBlob,
          config: { mimeType: 'video/mp4' }
        });
        
        console.log('Video uploaded to Gemini:', myfile.uri);
        
        // Wait for file to be ACTIVE
        const maxWaitTime = 60000;
        const checkInterval = 2000;
        const startTime = Date.now();
        
        let fileName = myfile.name;
        if (!fileName && myfile.uri) {
          const uriParts = myfile.uri.split('/');
          fileName = uriParts[uriParts.length - 1];
        }
        
        if (myfile.state !== 'ACTIVE') {
          while (myfile.state !== 'ACTIVE') {
            if (Date.now() - startTime > maxWaitTime) {
              throw new Error('Timeout waiting for video to be ready');
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            
            try {
              if (fileName) {
                const fileInfo = await ai.files.get({ name: fileName });
                myfile = fileInfo;
              }
            } catch (err) {
              console.error('Error checking file status:', err);
            }
          }
        }
        
        console.log('Video is ready, extracting transcript...');
        
        // Extract transcript using Gemini
        const transcriptPrompt = `Extract the complete transcript from this video. Include all spoken words, dialogue, and narration. Return ONLY the transcript text, nothing else. If there is no speech in the video, return "No speech detected in video."`;
        
        const result = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    fileUri: myfile.uri,
                    mimeType: myfile.mimeType
                  }
                },
                { text: transcriptPrompt }
              ]
            }
          ]
        });
        
        // Extract transcript from response
        if (result.candidates && result.candidates[0]?.content?.parts) {
          transcript = result.candidates[0].content.parts
            .map((part: any) => part.text || '')
            .join('')
            .trim();
        } else if ((result as any).text) {
          transcript = (result as any).text.trim();
        }
        
        if (!transcript || transcript.toLowerCase().includes('no speech detected')) {
          return NextResponse.json(
            { error: 'No speech detected in the uploaded video. The video may not have audio or dialogue.' },
            { status: 400 }
          );
        }
        
        console.log('Transcript extracted from uploaded video:', transcript.substring(0, 100) + '...');
      } catch (videoError: any) {
        console.error('Error processing uploaded video:', videoError);
        return NextResponse.json(
          { 
            error: 'Failed to extract transcript from uploaded video',
            details: videoError.message || 'Could not process video'
          },
          { status: 500 }
        );
      }
    }

    if (!transcript || !transcript.trim()) {
      return NextResponse.json(
        { error: 'Empty transcript received. The video may not have captions.' },
        { status: 400 }
      );
    }

    console.log('Transcript extracted, length:', transcript.length);

    // Build duration instructions
    const durationInstructions = duration && duration > 0
      ? `\n\n**CRITICAL DURATION CONSTRAINT:**
The script MUST be adapted to fit within **${duration} seconds** of video time. This is approximately ${Math.round(duration * 2.5)}-${Math.round(duration * 3)} words when spoken at a natural pace (2.5-3 words per second).

**Duration Adaptation Requirements:**
- **For ${duration}s videos**: The script must be concise and impactful. Every word must count.
- **Pacing**: Adjust the pacing to fit the ${duration}-second timeframe. If the original is longer, condense it. If shorter, expand it naturally.
- **Key Elements**: Prioritize the most important hooks, benefits, and calls-to-action within the time constraint.
- **Natural Flow**: The script should feel complete and natural within ${duration} seconds - not rushed, not stretched.
- **Word Count Target**: Aim for approximately ${Math.round(duration * 2.5)}-${Math.round(duration * 3)} words total to fit comfortably in ${duration} seconds when spoken naturally.`
      : '';

    // Build creative angle instructions
    const creativeAngleInstructions = creativeAngle && creativeAngle.trim()
      ? `\n\n**CREATIVE ANGLE (MANDATORY):**
The user has provided a specific creative angle that you MUST follow:
"${creativeAngle}"

**Your Task:**
- The script MUST be generated based on this creative angle
- Maintain the format, structure, and style of the original scraped video
- Incorporate the product description naturally within this creative angle
- The creative angle should guide the narrative approach, tone, and focus of the script
- While following the creative angle, still maintain the storytelling DNA and energy of the original video format`
      : '';

    // Transform transcript using Gemini 3
    const transformationPrompt = `You are an expert creative writer specializing in viral marketing scripts. Your task is to creatively transform a viral video transcript into a new, improved script for the user's product while maintaining the essence, energy, and storytelling magic of the original.

**Original Video Transcript:**
${transcript}

**Product Description:**
${productDescription}${creativeAngleInstructions}${durationInstructions}

**Your Creative Task:**
Transform the original viral video transcript into a fresh, creative script for the user's product. You MUST:

1. **Be Creative, Don't Copy** - Rewrite everything in your own words. NEVER copy exact phrases or sentences from the original. Instead, capture the essence, energy, and style but express it creatively and uniquely.

2. **Maintain the Storytelling DNA** - Keep the same narrative structure, flow, pacing, and storytelling arc (hook, buildup, reveal, payoff). But express it with fresh, creative language.

3. **Preserve Tone and Energy** - Match the exact energy level, speaking style, and conversational tone. If it's enthusiastic, be enthusiastic. If it's calm and reassuring, be calm and reassuring. If it's bold and provocative, be bold and provocative.

4. **Enhance and Improve** - Don't just adapt, IMPROVE the script. Add relevant details about the user's product that make sense. Include specific benefits, features, or uses that are coherent with the product description. Make it more compelling and convincing than the original.

5. **Adapt Hooks and Body Creatively** - Transform the opening hook to be attention-grabbing for the user's product, but maintain the same hook style and energy. Adapt the body content to showcase the product's unique value while maintaining the narrative flow.

6. **Keep Natural Language** - The script should feel authentic, conversational, and natural - like a real person enthusiastically talking about the product.${creativeAngleInstructions ? '\n\n7. **Follow Creative Angle** - The script must be generated based on the provided creative angle while maintaining the format and style of the original video.' : ''}${durationInstructions ? '\n\n8. **Respect Duration** - The script must fit within the specified duration when spoken naturally.' : ''}

**Critical Requirements:**
- **NEVER copy exact phrases or sentences** - Everything must be creatively rewritten
- Maintain the emotional triggers, promises, and calls-to-action structure, but express them uniquely
- Add relevant product details, benefits, and features that enhance the script
- Keep the same energy, enthusiasm level, and speaking style
- The script should feel fresh and creative, not like a template
- Maintain the original's storytelling magic but with new, improved content
- Do NOT add analysis or explanations - just output the transformed script
- **CRITICAL FORMATTING**: The script must be output as a SINGLE, CONTINUOUS PARAGRAPH with no line breaks, no bullet points, and no special formatting. Just one flowing paragraph of text.${durationInstructions ? `\n- **WORD COUNT**: The script must be approximately ${Math.round((duration || 30) * 2.5)}-${Math.round((duration || 30) * 3)} words to fit in ${duration} seconds when spoken naturally.` : ''}

**Output:**
Provide ONLY the creatively transformed script as a single continuous paragraph. It should be a fresh, improved version that captures the original's energy and structure but is completely rewritten with creative, unique language focused on the user's product.${creativeAngleInstructions ? ' The script must follow the provided creative angle.' : ''}${durationInstructions ? ` The script must fit within ${duration} seconds when spoken.` : ''} No headers, no explanations, no line breaks - just the script text flowing naturally in one paragraph.`;

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

    // Credit already consumed in verifyAndConsumeCredit

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
