import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';
import { recordGeneration } from '@/lib/generation-check';

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateFrameAnimation', request);
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
    const { startFrame, lastFrame, animationDescription, isUGC } = body;

    if (!startFrame || !lastFrame || !animationDescription) {
      return NextResponse.json(
        { error: 'Start frame, last frame, and animation description are required' },
        { status: 400 }
      );
    }

    console.log('Generating frame animation prompt...');
    console.log('Animation description:', animationDescription);

    // Convert base64 to Buffer
    const startFrameBuffer = Buffer.from(startFrame.split(',')[1], 'base64');
    const startFrameMime = startFrame.split(';')[0].split(':')[1] || 'image/png';
    const lastFrameBuffer = Buffer.from(lastFrame.split(',')[1], 'base64');
    const lastFrameMime = lastFrame.split(';')[0].split(':')[1] || 'image/png';

    // Upload images to Gemini Files
    console.log('Uploading images to Gemini Files...');
    let startFrameFile, lastFrameFile;
    try {
      const startFrameUint8Array = new Uint8Array(startFrameBuffer);
      const startFrameBlob = new Blob([startFrameUint8Array], { type: startFrameMime });
      startFrameFile = await ai.files.upload({
        file: startFrameBlob,
        config: { mimeType: startFrameMime }
      });
      console.log('Start frame uploaded:', startFrameFile.uri);

      const lastFrameUint8Array = new Uint8Array(lastFrameBuffer);
      const lastFrameBlob = new Blob([lastFrameUint8Array], { type: lastFrameMime });
      lastFrameFile = await ai.files.upload({
        file: lastFrameBlob,
        config: { mimeType: lastFrameMime }
      });
      console.log('Last frame uploaded:', lastFrameFile.uri);
    } catch (uploadError: any) {
      console.error('Error uploading images:', uploadError);
      return NextResponse.json(
        { error: 'Error uploading images to Gemini', details: uploadError.message },
        { status: 500 }
      );
    }

    // Wait for files to be ACTIVE
    const maxWaitTime = 60000;
    const checkInterval = 2000;
    const startTime = Date.now();

    const waitForFile = async (file: any, fileName: string) => {
      if (file.state === 'ACTIVE') return file;
      
      while (file.state !== 'ACTIVE') {
        if (Date.now() - startTime > maxWaitTime) {
          throw new Error(`Timeout waiting for ${fileName} to be ready`);
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

    try {
      startFrameFile = await waitForFile(startFrameFile, 'start frame');
      lastFrameFile = await waitForFile(lastFrameFile, 'last frame');
    } catch (waitError: any) {
      console.error('Error waiting for files:', waitError);
      return NextResponse.json(
        { error: 'Error waiting for files to be ready', details: waitError.message },
        { status: 500 }
      );
    }

    // Build UGC-specific instructions
    const ugcInstructions = isUGC ? `
**CRITICAL - UGC HYPERREALISTIC MODE (ACTIVE):**
The video MUST be generated as hyperrealistic UGC content, as if recorded by a real person on their iPhone. You MUST:
- Maintain authentic mobile phone grain and noise typical of iPhone cameras
- Include realistic shadows with proper falloff, authentic density, and natural softness
- Use photorealistic lighting with natural diffusion and authentic color temperature
- Include hyperrealistic textures (skin with pores, fabric with visible weave, product surfaces with authentic material details)
- Apply iPhone camera characteristics (natural color science, realistic depth of field, authentic exposure, slight lens distortion)
- Include real-world imperfections (motion blur, focus breathing, chromatic aberration, lens flare when appropriate)
- **CRITICAL - NO BACKGROUND BLUR**: The background MUST be completely sharp and in focus, exactly as iPhone cameras record in vertical/portrait mode. NEVER apply blur, bokeh, or depth of field effects to the background.
` : '';

    // Generate optimized animation prompt
    const frameAnimationPrompt = `You are an expert AI prompt engineer specializing in professional video animations between two key frames. Your task is to analyze two images (starting frame and last frame) and create an EXTREMELY detailed, optimized prompt for animating between them.

**CRITICAL - IMAGE ANALYSIS REQUIREMENTS:**
You will receive TWO images that will be attached to the final prompt:
1. **Starting Frame Image** (first image): This is the initial state that will be attached
2. **Last Frame Image** (second image): This is the final state that will be attached

**STEP 1 - ANALYZE STARTING FRAME:**
Carefully examine the FIRST image (starting frame). Describe EXACTLY what you see:
- What objects, characters, or elements are present? (describe only what is VISIBLY present, do NOT invent)
- What is their position, orientation, and state?
- What is the composition, camera angle, and framing?
- What is the lighting, colors, and atmosphere?
- Be PRECISE and ACCURATE - only describe what is actually visible in the image

**STEP 2 - ANALYZE LAST FRAME:**
Carefully examine the SECOND image (last frame). Describe EXACTLY what you see:
- What objects, characters, or elements are present? (describe only what is VISIBLY present, do NOT invent)
- What is their position, orientation, and state?
- What is the composition, camera angle, and framing?
- What is the lighting, colors, and atmosphere?
- Be PRECISE and ACCURATE - only describe what is actually visible in the image

**STEP 3 - USER REQUEST:**
The user wants: "${animationDescription}"

**STEP 4 - GENERATE FINAL PROMPT:**
Create a video animation prompt that:
1. **Explicitly references the starting frame**: Begin with "In the starting frame (as shown in the attached first image), there is..." and describe EXACTLY what is in the starting frame image
2. **Explicitly references the last frame**: Then state "In the last frame (as shown in the attached second image), there is..." and describe EXACTLY what is in the last frame image
3. **Describes the animation transition**: Explain how the animation moves from the starting frame to the last frame, incorporating the user's request: "${animationDescription}"
4. **Adds professional cinematography**: Include camera movements (dolly zoom, pan, zoom, orbit, etc.), lighting transitions, physics, timing, and pacing
5. **Mentions image attachments**: Make it clear that both images will be attached to the prompt

**CRITICAL CONSTRAINTS:**
- **MUST be EXACTLY ONE continuous paragraph** (no line breaks, no bullet points)
- **MUST be UNDER 999 characters** (strictly enforced - count characters including spaces)
- **MUST explicitly reference "starting frame" and "last frame"** and mention that images will be attached
- **MUST describe ONLY what is actually visible** in the images - NEVER invent, assume, or hallucinate elements that are not present
- **MUST be PRECISE and ACCURATE** - if you cannot see something clearly, do not describe it
- **FAITHFULLY FOLLOW** the user's request: "${animationDescription}"
- Use dense, efficient language: combine details into single phrases, use compound adjectives, merge related concepts
- Include essential technical details: camera movements (dolly zoom, pan, zoom, orbit), lighting transitions, physics (if applicable), cinematography techniques
- Describe physical movements concisely but precisely (gravity, rotation speed, impact effects, smooth transitions)
- Include visual effects, depth of field, motion blur where appropriate
- Specify color grading and aesthetic
- **EVERY WORD MUST COUNT** - maximize information density while staying under 999 characters
- **VERIFY CHARACTER COUNT** - ensure the prompt is exactly one paragraph and under 999 characters before finalizing
- **CRITICAL PROHIBITION - NO TEXT OVERLAY**: You MUST NOT include, mention, or suggest ANY text overlay, on-screen text, captions, subtitles, or any text appearing in the video. Text overlays always look bad in generated videos. Describe ONLY visual elements, actions, camera movements, lighting, and composition - NO TEXT, NO CAPTIONS, NO SUBTITLES, NO ON-SCREEN TEXT OF ANY KIND.
- **CRITICAL PROHIBITION - NO HALLUCINATION**: You MUST NOT invent, assume, or describe elements that are not clearly visible in the images. Only describe what you can actually see. If something is unclear or not present, do not mention it.

${ugcInstructions}

**Output Format Example:**
"In the starting frame (as shown in the attached first image), there is [exact description of what is in the starting frame]. Then [describe the animation transition incorporating user's request], leading to the last frame (as shown in the attached second image), where there is [exact description of what is in the last frame]. [Add cinematography details: camera movements, lighting, timing, etc.]"

**Output:**
Provide ONLY the final, complete, EXTREMELY DETAILED prompt ready for AI video generation. The prompt must:
- Explicitly reference "starting frame" and "last frame" and mention that images will be attached
- Describe EXACTLY what is in each frame (only what is visible, no inventions)
- Describe the smooth animation transition from starting frame to last frame
- Incorporate the user's specific request: "${animationDescription}"
- Include professional cinematography and technical details
- Be ready to copy and paste directly into video AI tools (attach both starting and last frame images when using)
- Do NOT include explanations, analysis, or additional text - ONLY the final detailed prompt
- MUST be exactly ONE continuous paragraph, UNDER 999 characters total`;

    let animationPrompt;
    try {
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  fileUri: startFrameFile.uri,
                  mimeType: startFrameFile.mimeType
                }
              },
              {
                fileData: {
                  fileUri: lastFrameFile.uri,
                  mimeType: lastFrameFile.mimeType
                }
              },
              {
                text: frameAnimationPrompt
              }
            ]
          }
        ]
      });

      // Extract the generated prompt
      if (result.candidates && result.candidates[0]?.content?.parts) {
        animationPrompt = result.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('')
          .trim();
      } else if ((result as any).text) {
        animationPrompt = (result as any).text.trim();
      }

      // Validate character count
      if (animationPrompt && animationPrompt.length > 999) {
        console.warn(`Generated prompt exceeds 999 characters (${animationPrompt.length}), truncating...`);
        animationPrompt = animationPrompt.substring(0, 999).trim();
      }

      console.log('Frame animation prompt generated:', animationPrompt?.substring(0, 100) + '...');
      console.log('Character count:', animationPrompt?.length || 0);
    } catch (error: any) {
      console.error('Error generating frame animation prompt:', error);
      return NextResponse.json(
        { error: 'Error generating frame animation prompt', details: error.message },
        { status: 500 }
      );
    }

    if (!animationPrompt) {
      return NextResponse.json(
        { error: 'Failed to generate animation prompt' },
        { status: 500 }
      );
    }

    // Record generation after successful completion
    await recordGeneration(request);

    return NextResponse.json({
      success: true,
      prompt: animationPrompt
    });
  } catch (error: any) {
    console.error('Error generating frame animation prompt:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

