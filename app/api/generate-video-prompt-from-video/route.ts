import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateVideoPromptFromVideo', request);
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
    const { video, duration } = body;

    if (!video) {
      return NextResponse.json(
        { error: 'Video is required' },
        { status: 400 }
      );
    }

    if (!duration || duration < 8 || duration > 15) {
      return NextResponse.json(
        { error: 'Duration must be between 8 and 15 seconds' },
        { status: 400 }
      );
    }

    console.log('Processing video for prompt generation...');
    console.log('Target duration:', duration, 'seconds');

    // Convert base64 to Buffer
    const videoBuffer = Buffer.from(video.split(',')[1], 'base64');
    const videoMime = video.split(';')[0].split(':')[1] || 'video/mp4';
    
    // Convert to supported format if needed
    let finalMime = videoMime;
    const supportedFormats = ['video/mp4', 'video/mov', 'video/quicktime', 'video/webm'];
    if (!supportedFormats.includes(videoMime.toLowerCase())) {
      console.log(`Converting unsupported format ${videoMime} to MP4`);
      finalMime = 'video/mp4';
    }

    // Upload video to Gemini Files
    let videoFile = null;
    try {
      console.log('Uploading video to Gemini Files...');
      const videoUint8Array = new Uint8Array(videoBuffer);
      const videoBlob = new Blob([videoUint8Array], { type: finalMime });
      
      videoFile = await ai.files.upload({
        file: videoBlob,
        config: { mimeType: finalMime }
      });
      console.log('Video uploaded:', videoFile.uri);

      // Wait for file to be ACTIVE
      const maxWaitTime = 120000; // 2 minutes for videos
      const checkInterval = 3000; // Check every 3 seconds
      const startTime = Date.now();

      const waitForFile = async (file: any, fileName: string) => {
        if (file.state === 'ACTIVE') return file;
        
        while (file.state !== 'ACTIVE') {
          if (Date.now() - startTime > maxWaitTime) {
            throw new Error(`Timeout waiting for video to be ready`);
          }
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          
          try {
            const fileInfo = await ai.files.get({ name: fileName });
            file = fileInfo;
          } catch (err) {
            console.error(`Error checking file status for ${fileName}:`, err);
          }
        }
        return file;
      };

      const videoFileName = videoFile.name || videoFile.uri?.split('/').pop() || '';
      if (videoFileName) {
        videoFile = await waitForFile(videoFile, videoFileName);
        if (!videoFile.uri) {
          return NextResponse.json(
            { error: 'Video file is missing required URI property' },
            { status: 500 }
          );
        }
        console.log('Video file is ready:', videoFile.state);
      }
    } catch (uploadError: any) {
      console.error('Error uploading video:', {
        message: uploadError.message,
        status: uploadError.status,
        code: uploadError.code,
        response: uploadError.response?.data,
        stack: process.env.NODE_ENV === 'development' ? uploadError.stack : undefined
      });
      
      // Check for API key errors
      if (uploadError.message?.includes('API key') || uploadError.message?.includes('API_KEY') || uploadError.status === 401) {
        return NextResponse.json(
          { 
            error: 'Google Gemini API key is not valid', 
            details: 'The GOOGLE_GENAI_API_KEY environment variable is not valid or has expired. Please verify it in your production environment settings (Vercel dashboard → Settings → Environment Variables).'
          },
          { status: 401 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Error uploading video', 
          details: uploadError.message || 'Could not upload the video to Gemini Files',
          ...(process.env.NODE_ENV === 'development' && {
            fullError: uploadError.toString(),
            stack: uploadError.stack
          })
        },
        { status: 500 }
      );
    }

    // Generate prompt from video analysis
    const videoAnalysisPrompt = `You are an expert AI video prompt engineer. Analyze the attached reference video and create an extremely detailed, comprehensive prompt that would generate this exact video.

**CRITICAL REQUIREMENTS:**
1. **Video Format/Type**: First, identify the EXACT format and type:
   - Is it a screen recording? (iPhone screen, computer screen, app interface, etc.)
   - Is it a video recording? (taken with iPhone, camera, etc.)
   - What device/medium is shown or used? (iPhone, computer, tablet, etc.)
   - Be VERY specific about the format/type

2. **Actions and Movements**: Describe ALL actions, movements, and transitions in the video:
   - Every action that happens in the video
   - Camera movements (pan, zoom, tilt, tracking, etc.)
   - Subject movements and actions
   - Transitions between scenes or shots
   - Timing and pacing of actions

3. **Camera Cuts and Shots**: Describe ALL camera cuts, shot changes, and editing:
   - Number of cuts/shots
   - Type of each cut (hard cut, fade, transition, etc.)
   - Duration of each shot
   - Shot sequence and order
   - Camera angles for each shot (close-up, medium, wide, etc.)

4. **Camera Angles and Perspectives**: Describe ALL camera angles and perspectives:
   - Exact camera angles for each shot (frontal, side, three-quarter, from above, from below, etc.)
   - Perspective (first-person, third-person, etc.)
   - Camera position and movement
   - Framing and composition for each shot

5. **Hyperrealism and Visual Quality**: Describe ALL visual characteristics:
   - Lighting style (natural, artificial, studio, etc.) - direction, intensity, color temperature
   - Textures and materials visible
   - Color palette, saturation, contrast
   - Image quality and sharpness
   - Depth of field and focus
   - Overall aesthetic and visual style

6. **Technical Details**: Include all technical specifications:
   - Video quality and resolution appearance
   - Frame rate characteristics
   - Color grading and post-processing style
   - Any visual effects or filters

7. **Duration and Pacing**: The video must be exactly ${duration} seconds long. Adjust the pacing, number of shots, and action timing to fit perfectly within ${duration} seconds:
   - Calculate how many shots/cuts can fit in ${duration} seconds
   - Adjust action timing to match ${duration} seconds
   - Ensure the prompt describes a video that will be exactly ${duration} seconds when generated
   - If the reference video is longer, condense it. If shorter, expand it naturally.

**Your Task:**
Create an extremely detailed prompt that describes:
- The EXACT format/type of the video (screenshot, screen recording, video recording, etc.)
- ALL actions, movements, and transitions
- ALL camera cuts, shots, and editing
- ALL camera angles and perspectives
- ALL visual characteristics (lighting, textures, colors, quality)
- Technical details and specifications
- Duration-adjusted pacing to fit exactly ${duration} seconds

**Critical Requirements:**
- The prompt must be extremely detailed and comprehensive
- Describe the video as if you were going to generate this exact same video
- Include all technical and aesthetic details
- Be specific about actions, camera cuts, angles, lighting, textures, colors, and style
- The prompt should capture everything that makes this video unique
- **MOST IMPORTANT**: The prompt must describe a video that will be exactly ${duration} seconds long when generated. Adjust pacing, number of shots, and action timing accordingly.

**Output Format:**
Provide ONLY the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete prompt text that would generate this exact video, adjusted to ${duration} seconds duration.`;

    try {
      console.log('Generating prompt from video analysis...');
      
      const videoParts: any[] = [
        {
          fileData: {
            fileUri: videoFile.uri,
            mimeType: videoFile.mimeType || finalMime
          }
        },
        {
          text: videoAnalysisPrompt
        }
      ];

      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: videoParts
          }
        ]
      });

      // Extract the prompt from response
      let promptText = '';
      if (result.candidates && result.candidates[0]?.content?.parts) {
        promptText = result.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('')
          .trim();
      } else if ((result as any).text) {
        promptText = (result as any).text.trim();
      }

      if (!promptText || promptText.length === 0) {
        console.error('No prompt text in response:', result);
        return NextResponse.json(
          { error: 'Failed to generate prompt text from AI response' },
          { status: 500 }
        );
      }

      console.log('Prompt generated successfully, length:', promptText.length);

      // Calculate costs (for backend logging only)
      const usageMetadata = (result as any).usageMetadata;
      if (usageMetadata) {
        const inputTokens = usageMetadata.promptTokenCount || 0;
        const outputTokens = usageMetadata.candidatesTokenCount || 0;
        const totalTokens = inputTokens + outputTokens;
        
        // Gemini 3 Flash pricing
        const inputCost = (inputTokens / 1_000_000) * 0.075; // $0.075 per 1M tokens
        const outputCost = (outputTokens / 1_000_000) * 0.30; // $0.30 per 1M tokens
        const totalCost = inputCost + outputCost;

        console.log('=== Video Prompt Generation Cost ===');
        console.log(`Input tokens: ${inputTokens.toLocaleString()}`);
        console.log(`Output tokens: ${outputTokens.toLocaleString()}`);
        console.log(`Total tokens: ${totalTokens.toLocaleString()}`);
        console.log(`Input cost: $${inputCost.toFixed(6)}`);
        console.log(`Output cost: $${outputCost.toFixed(6)}`);
        console.log(`Total cost: $${totalCost.toFixed(6)}`);
        console.log('===================================');
      }

      return NextResponse.json({
        prompt: promptText,
        usage: usageMetadata
      });
    } catch (geminiError: any) {
      console.error('Error calling Gemini:', geminiError);
      return NextResponse.json(
        { 
          error: 'Error generating prompt from video',
          details: geminiError.message || 'Could not process video with AI'
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error generating video prompt from video:', error);
    
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'API configuration error. Please check your environment variables.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate video prompt from video' },
      { status: 500 }
    );
  }
}

