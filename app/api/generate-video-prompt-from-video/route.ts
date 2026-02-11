import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export const maxDuration = 120; // 120 seconds for video processing (Vercel Pro plan)

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
    
    let body: any;
    try {
      body = await request.json();
    } catch (jsonError: any) {
      console.error('Error parsing request body:', jsonError);
      return NextResponse.json(
        {
          error: 'Invalid request format',
          details: 'The request body is not valid JSON. Please try again.'
        },
        { status: 400 }
      );
    }
    
    const { video, duration, image, changes, script } = body;

    if (!video) {
      return NextResponse.json(
        { error: 'Video is required' },
        { status: 400 }
      );
    }

    // Validate video base64 format
    if (!video.includes(',')) {
      return NextResponse.json(
        { 
          error: 'Invalid video format', 
          details: 'The video data is not in a valid base64 format. Please try uploading the video again.'
        },
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

    // Convert base64 to Buffer with error handling
    let videoBuffer: Buffer;
    let videoMime: string;
    try {
      const base64Data = video.split(',')[1];
      if (!base64Data || base64Data.trim() === '') {
        throw new Error('Empty base64 data');
      }
      videoBuffer = Buffer.from(base64Data, 'base64');
      if (videoBuffer.length === 0) {
        throw new Error('Invalid base64 data');
      }
      videoMime = video.split(';')[0].split(':')[1] || 'video/mp4';
    } catch (base64Error: any) {
      console.error('Error parsing base64 video:', base64Error);
      return NextResponse.json(
        { 
          error: 'Invalid video data', 
          details: 'The video data is corrupted or invalid. Please try uploading the video again.'
        },
        { status: 400 }
      );
    }
    
    // Convert to supported format if needed
    let finalMime = videoMime;
    const supportedFormats = ['video/mp4', 'video/mov', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/avi'];
    if (!supportedFormats.includes(videoMime.toLowerCase())) {
      console.log(`Converting unsupported format ${videoMime} to MP4`);
      finalMime = 'video/mp4';
    }
    
    // Validate video buffer size (max 100MB)
    const maxVideoSize = 100 * 1024 * 1024; // 100MB
    if (videoBuffer.length > maxVideoSize) {
      return NextResponse.json(
        { 
          error: 'Video file too large', 
          details: `Video size (${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB) exceeds the maximum limit of 100MB. Please use a smaller video file.`
        },
        { status: 400 }
      );
    }
    
    console.log(`Video size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB, MIME type: ${finalMime}`);

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

    // Upload image to Gemini Files if provided
    let imageFile = null;
    if (image) {
      try {
        console.log('Uploading reference image to Gemini Files...');
        
        // Validate image base64 format
        if (!image.includes(',')) {
          throw new Error('Invalid image format: not in valid base64 format');
        }
        
        let imageBuffer: Buffer;
        try {
          const base64Data = image.split(',')[1];
          if (!base64Data || base64Data.trim() === '') {
            throw new Error('Empty base64 data');
          }
          imageBuffer = Buffer.from(base64Data, 'base64');
          if (imageBuffer.length === 0) {
            throw new Error('Invalid base64 data');
          }
        } catch (base64Error: any) {
          console.error('Error parsing base64 image:', base64Error);
          throw new Error('Invalid image data: corrupted or invalid base64 format');
        }
        
        let imageMime = image.split(';')[0].split(':')[1] || 'image/png';
        
        // Convert unsupported formats to PNG
        const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        if (!supportedFormats.includes(imageMime.toLowerCase())) {
          console.log(`Converting unsupported format ${imageMime} to PNG`);
          imageMime = 'image/png';
        }
        
        const imageUint8Array = new Uint8Array(imageBuffer);
        const imageBlob = new Blob([imageUint8Array], { type: imageMime });
        imageFile = await ai.files.upload({
          file: imageBlob,
          config: { mimeType: imageMime }
        });
        console.log('Reference image uploaded:', imageFile.uri);

        // Wait for file to be ACTIVE
        const maxWaitTime = 60000;
        const checkInterval = 2000;
        const startTime = Date.now();

        const waitForFile = async (file: any, fileName: string) => {
          if (file.state === 'ACTIVE') return file;
          
          while (file.state !== 'ACTIVE') {
            if (Date.now() - startTime > maxWaitTime) {
              throw new Error(`Timeout waiting for image to be ready`);
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

        const imageFileName = imageFile.name || imageFile.uri?.split('/').pop() || '';
        if (imageFileName) {
          imageFile = await waitForFile(imageFile, imageFileName);
          if (!imageFile.uri) {
            throw new Error('Image file is missing required URI property');
          }
        }
      } catch (uploadError: any) {
        console.error('Error uploading image:', uploadError);
        return NextResponse.json(
          { error: 'Error uploading image to Gemini', details: uploadError.message },
          { status: 500 }
        );
      }
    }

    // Build changes instruction if provided
    let changesInstruction = '';
    if (changes && changes.trim()) {
      changesInstruction = `\n\n**USER'S REQUESTED CHANGES:**
The user wants to make the following changes to the video:
"${changes.trim()}"

**CRITICAL - APPLY CHANGES:**
- You MUST incorporate these changes into the generated prompt
- If the user mentions changes related to the uploaded image, analyze the image and apply those changes
- Maintain the same video structure, camera cuts, and pacing from the reference video
- Apply the requested changes while preserving the overall style and format of the reference video
- If the user wants to change the product/subject to match the uploaded image, describe the product/subject from the image in detail
- If the user wants to change background, lighting, or other elements, incorporate those changes into the prompt`;
    }

    // Build image instruction if provided
    let imageInstruction = '';
    if (imageFile) {
      imageInstruction = `\n\n**REFERENCE IMAGE PROVIDED:**
A reference image has been uploaded and will be attached. This image provides visual context for the changes the user wants to make.${changes && changes.trim() ? ' The user has described specific changes related to this image.' : ' Analyze this image to understand what modifications should be applied to the video.'}

**CRITICAL - USE THE IMAGE:**
- If the user's changes mention the image, analyze the image and incorporate its elements into the prompt
- Describe the product/subject from the image if relevant to the changes
- Use the image to understand visual style, colors, textures, or other elements that should be applied to the video
- The image will be attached to the final prompt, so reference it appropriately`;
    }

    // Build script instruction if provided
    let scriptInstruction = '';
    if (script && script.trim()) {
      // Calculate script word count and estimated duration
      const scriptWords = script.trim().split(/\s+/).length;
      const estimatedScriptDuration = Math.round(scriptWords / 2.5); // Average speaking rate: 2.5 words per second
      
      scriptInstruction = `\n\n**SCRIPT/DIALOGUE PROVIDED:**
A script/dialogue has been provided for this video. You MUST integrate it seamlessly and coherently with the actions and movements from the reference video.

**Script provided:**
"${script.trim()}"

**Script Analysis:**
- Script word count: ~${scriptWords} words
- Estimated script duration: ~${estimatedScriptDuration} seconds
- Target video duration: ${duration} seconds

**CRITICAL - SCRIPT INTEGRATION REQUIREMENTS:**
1. **Script-Action Synchronization**: 
   - Map script portions to specific actions from the reference video
   - Integrate dialogue with actions using natural phrasing like "while [action], says [script portion]" or "as [action], narrates [script portion]"
   - Ensure script portions align with the timing of corresponding actions

2. **Duration Adjustment**:
   - The video must be exactly ${duration} seconds long
   - If the script is too long for ${duration} seconds, adapt it intelligently:
     * Prioritize the most important parts of the script
     * Condense or summarize less critical portions
     * Maintain coherence and natural flow
     * Do not sacrifice too much content, but ensure it fits within ${duration} seconds
   - If the script is shorter than ${duration} seconds, distribute it naturally throughout the video, synchronized with actions
   - The script should be mentioned as early as possible if it's long but achievable within the time limit

3. **Natural Integration**:
   - Script should feel natural and organic, not forced
   - Dialogue should flow naturally with the actions
   - Maintain the pacing and rhythm of the reference video while incorporating the script
   - If the reference video has dialogue, replace it with the provided script while maintaining the same timing and structure

4. **Voiceover/Lip Sync**:
   - If the reference video shows the character speaking (lip sync), the script should be synchronized with lip movements
   - If the reference video uses voiceover (character doesn't visibly speak), maintain that style with the new script
   - Match the delivery style (tone, pace, emphasis) from the reference video`;
    }

    // Generate prompt from video analysis
    const videoAnalysisPrompt = `You are an expert AI video prompt engineer. Analyze the attached reference video${imageFile ? ' and reference image' : ''} and create an extremely detailed, comprehensive prompt that would generate this exact video${changes && changes.trim() ? ' with the requested modifications' : ''}.

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
Provide ONLY the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete prompt text that would generate this exact video${changes && changes.trim() ? ' with the requested changes applied' : ''}, adjusted to ${duration} seconds duration.${changesInstruction}${imageInstruction}${scriptInstruction}`;

    try {
      console.log('Generating prompt from video analysis...');
      
      const videoParts: any[] = [
        {
          fileData: {
            fileUri: videoFile.uri,
            mimeType: videoFile.mimeType || finalMime
          }
        }
      ];

      // Add image if provided
      if (imageFile) {
        videoParts.push({
          fileData: {
            fileUri: imageFile.uri,
            mimeType: imageFile.mimeType || 'image/png'
          }
        });
      }

      // Add text prompt
      videoParts.push({
        text: videoAnalysisPrompt
      });

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
      console.error('Error calling Gemini:', {
        message: geminiError.message,
        status: geminiError.status,
        code: geminiError.code,
        response: geminiError.response?.data,
        stack: process.env.NODE_ENV === 'development' ? geminiError.stack : undefined
      });
      
      // Check for API key errors
      if (geminiError.message?.includes('API key') || geminiError.message?.includes('API_KEY') || geminiError.status === 401) {
        return NextResponse.json(
          { 
            error: 'Google Gemini API key is not valid', 
            details: 'The GOOGLE_GENAI_API_KEY environment variable is not valid or has expired. Please verify it in your production environment settings (Vercel dashboard → Settings → Environment Variables).'
          },
          { status: 401 }
        );
      }
      
      // Check for rate limit errors
      if (geminiError.status === 429 || geminiError.message?.includes('rate limit')) {
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded',
            details: 'Too many requests to Google Gemini API. Please try again later.'
          },
          { status: 429 }
        );
      }
      
      // Check for video-related errors
      if (geminiError.message?.includes('video') || geminiError.message?.includes('Video') || geminiError.message?.includes('file')) {
        return NextResponse.json(
          { 
            error: 'Error processing video',
            details: geminiError.message || 'The video file could not be processed. Please ensure the video is in a supported format (MP4, MOV, WebM) and try again.'
          },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { 
          error: 'Error generating prompt from video',
          details: geminiError.message || 'Could not process video with AI. Please try again with a different video.'
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error generating video prompt from video (outer catch):', {
      message: error.message,
      name: error.name,
      status: error.status,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    // Check for API key initialization errors
    if (error.message?.includes('GOOGLE_GENAI_API_KEY') || error.message?.includes('API key')) {
      return NextResponse.json(
        {
          error: 'Google Gemini API key is not configured',
          details: 'The GOOGLE_GENAI_API_KEY environment variable is missing or invalid. Please configure it in your production environment (Vercel dashboard → Settings → Environment Variables).'
        },
        { status: 500 }
      );
    }
    
    // Check for video-related errors
    if (error.message?.includes('video') || error.message?.includes('Video') || error.message?.includes('file') || error.message?.includes('base64')) {
      return NextResponse.json(
        {
          error: 'Error processing video',
          details: error.message || 'There was an error processing the video file. Please ensure the video is in a supported format (MP4, MOV, WebM) and try again.'
        },
        { status: 400 }
      );
    }
    
    // Check for timeout errors
    if (error.message?.includes('timeout') || error.message?.includes('Timeout') || error.message?.includes('TIMEOUT')) {
      return NextResponse.json(
        {
          error: 'Request timeout',
          details: 'The request took too long to process. Please try again with a smaller video file.'
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { 
        error: error.message || 'Failed to generate video prompt from video',
        details: 'An unexpected error occurred. Please try again or contact support if the problem persists.'
      },
      { status: 500 }
    );
  }
}




