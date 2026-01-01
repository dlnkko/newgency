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
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateVideoScenePrompts', request);
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
    const { video, transformationDescription } = body;

    if (!video) {
      return NextResponse.json(
        { error: 'Video file is required' },
        { status: 400 }
      );
    }

    if (!transformationDescription || !transformationDescription.trim()) {
      return NextResponse.json(
        { error: 'Transformation description is required' },
        { status: 400 }
      );
    }

    // Extract base64 data and MIME type
    const videoData = video.split(',')[1];
    const mimeType = video.split(';')[0].split(':')[1] || 'video/mp4';

    // Convert base64 to Buffer
    const videoBuffer = Buffer.from(videoData, 'base64');

    // Upload video to Gemini Files
    console.log('Uploading video to Gemini Files...');
    let videoFile;
    try {
      const videoUint8Array = new Uint8Array(videoBuffer);
      const videoBlob = new Blob([videoUint8Array], { type: mimeType });
      videoFile = await ai.files.upload({
        file: videoBlob,
        config: { mimeType: mimeType }
      });
      console.log('Video uploaded:', videoFile.uri);
    } catch (uploadError: any) {
      console.error('Error uploading video:', uploadError);
      return NextResponse.json(
        { error: 'Error uploading video to Gemini', details: uploadError.message },
        { status: 500 }
      );
    }

    // Wait for file to be ACTIVE
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
      const videoFileName = videoFile.name || videoFile.uri?.split('/').pop() || '';
      
      if (!videoFileName) {
        return NextResponse.json(
          { error: 'Failed to get file identifier' },
          { status: 500 }
        );
      }
      
      videoFile = await waitForFile(videoFile, videoFileName);
      
      if (!videoFile.uri) {
        return NextResponse.json(
          { error: 'File is missing required URI property' },
          { status: 500 }
        );
      }
    } catch (waitError: any) {
      return NextResponse.json(
        { error: 'Error waiting for file to be ready', details: waitError.message },
        { status: 500 }
      );
    }

    // Step 1: Analyze video and identify scenes
    console.log('Step 1: Analyzing video and identifying scenes...');
    const sceneAnalysisPrompt = `You are an expert video analyst. Analyze the provided video and identify all scene cuts, shots, and camera movements.

**Your Task:**
1. Identify each distinct scene, shot, or camera cut in the video
2. For each scene, note:
   - Start time (in seconds)
   - End time (in seconds)
   - Duration (in seconds)
   - Type of shot (close-up, medium shot, wide shot, etc.)
   - Camera movement (static, pan, zoom, dolly, etc.)
   - Visual content description
   - Lighting and aesthetic
   - Any significant visual changes from previous scene

3. **Filter Criteria - Only include relevant scenes:**
   - **INCLUDE** scenes that are 3+ seconds long OR have distinct visual changes (different shot type, camera movement, or composition)
   - **INCLUDE** scenes with significant camera movements or angle changes
   - **INCLUDE** scenes with different lighting or aesthetic
   - **OMIT** scenes that are less than 1 second and don't add significant visual value
   - **OMIT** very brief transitions or cuts that don't represent a distinct scene
   - **OMIT** scenes that are essentially the same as the previous scene with no meaningful change

4. Focus on scenes that would be useful for generating video generation prompts

**Output Format:**
Provide your response as a JSON array of scenes. Each scene should have:
{
  "sceneNumber": 1,
  "startTime": 0.0,
  "endTime": 3.5,
  "duration": 3.5,
  "shotType": "medium shot",
  "cameraMovement": "static",
  "description": "Brief description of what happens in this scene",
  "lighting": "natural daylight",
  "visualElements": ["person", "product", "background elements"]
}

Return ONLY the JSON array, no additional text or explanations.`;

    let sceneAnalysis;
    try {
      sceneAnalysis = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  fileUri: videoFile.uri,
                  mimeType: videoFile.mimeType
                }
              },
              {
                text: sceneAnalysisPrompt
              }
            ]
          }
        ]
      });
    } catch (analysisError: any) {
      console.error('Error analyzing video:', analysisError);
      return NextResponse.json(
        { error: 'Error analyzing video', details: analysisError.message },
        { status: 500 }
      );
    }

    // Extract scene analysis
    let scenesData: any[] = [];
    try {
      if (sceneAnalysis.candidates && sceneAnalysis.candidates[0]?.content?.parts) {
        const analysisText = sceneAnalysis.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('')
          .trim();

        console.log('Scene analysis received:', analysisText.substring(0, 500));

        // Try to extract JSON from the response
        const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          scenesData = JSON.parse(jsonMatch[0]);
        } else {
          // If no JSON array found, try to parse the whole response
          scenesData = JSON.parse(analysisText);
        }

        console.log(`Identified ${scenesData.length} scenes`);
      }
    } catch (parseError: any) {
      console.error('Error parsing scene analysis:', parseError);
      return NextResponse.json(
        { error: 'Error parsing scene analysis', details: parseError.message },
        { status: 500 }
      );
    }

    if (!scenesData || scenesData.length === 0) {
      return NextResponse.json(
        { error: 'No scenes were identified in the video' },
        { status: 400 }
      );
    }

    // Step 2: Generate prompts for each scene
    console.log(`Step 2: Generating prompts for ${scenesData.length} scenes...`);
    const scenePrompts: any[] = [];

    for (let i = 0; i < scenesData.length; i++) {
      const scene = scenesData[i];
      const isFirstScene = i === 0;
      console.log(`Generating prompt for scene ${i + 1}/${scenesData.length}...`);

      // Build reference image instructions for scenes after the first one
      const referenceImageInstructions = isFirstScene ? '' : `\n\n**CRITICAL - REFERENCE IMAGE FOR COHERENCE:**
An image will be attached as a reference (the generated image from the previous scene). You MUST:
- **Base all consistent elements on the attached reference image**: Use the same person appearance, product details, colors, branding, and visual style from the reference image
- **Maintain visual continuity**: If the person, product, or key visual elements appear in the reference image, describe them to match the reference exactly
- **Preserve established elements**: Colors, textures, lighting style, and aesthetic elements that are in the reference image should be maintained
- **For new elements**: If this scene introduces new environments, backgrounds, or additional characters that weren't in the reference, create them normally, but ensure they complement the reference image's style
- **Mention the reference explicitly**: In your prompts, explicitly state that consistent elements (person, product, colors, style) should be based on the attached reference image to ensure visual coherence

The reference image ensures visual continuity between scenes. Use it as the foundation for all elements that should remain consistent.`;

      const promptGenerationRequest = `You are an expert prompt engineer for AI image and video generation. You have analyzed a video and identified a specific scene. Your task is to generate TWO detailed prompts that recreate this scene, but adapted according to the user's transformation request.${referenceImageInstructions}

**Original Scene Information:**
- Scene Number: ${scene.sceneNumber || i + 1}
- Time: ${scene.startTime || 0}s - ${scene.endTime || 0}s (${scene.duration || 0}s)
- Shot Type: ${scene.shotType || 'unknown'}
- Camera Movement: ${scene.cameraMovement || 'unknown'}
- Description: ${scene.description || 'No description'}
- Lighting: ${scene.lighting || 'unknown'}
- Visual Elements: ${Array.isArray(scene.visualElements) ? scene.visualElements.join(', ') : 'unknown'}

**User's Transformation Request:**
"${transformationDescription}"

**Your Task:**
Generate TWO extremely detailed, professional prompts:

1. **Nano Banana Pro Prompt**: A detailed, cinematic prompt to generate a high-quality reference image/asset that will help create the video. This image will be used as the base for video animation. The prompt should:${isFirstScene ? '' : '\n   - **CRITICAL**: An image will be attached as reference (from the previous scene). For all elements that should remain consistent (person appearance, product details, colors, branding, visual style), explicitly state: "Based on the attached reference image, maintain [specific element] exactly as shown in the reference" or "Use the same [element] from the attached reference image"\n   - **For consistent elements**: When describing the person, product, colors, or visual style that appeared in previous scenes, explicitly reference the attached image to ensure visual coherence\n   - **For new elements**: If this scene introduces new environments, backgrounds, or additional characters, create them normally but ensure they complement the reference image\'s established style'}
   - Create an asset that supports the specific video action and camera movement from the original scene
   - Include exact appearance, colors, materials, textures, lighting based on the original scene${isFirstScene ? '' : ' and the attached reference image'}
   - Professional studio-quality composition matching the original scene's aesthetic${isFirstScene ? '' : ' and maintaining visual continuity with the reference image'}
   - Perfect framing and positioning that supports the requested video action and camera movement
   - High-resolution, hyperrealistic details
   - Optimal lighting setup matching the original scene's lighting style${isFirstScene ? '' : ' (or adapting it while maintaining coherence with the reference)'}
   - Background and environment that supports the animation style${isFirstScene ? '' : ' (new environments can be created, but should complement the reference image\'s aesthetic)'}
   - Camera angle and perspective that works well for the specific action and camera movement
   - **Maintain the artistic essence** of the original scene (composition, lighting style, aesthetic, mood)
   - **Adapt the content** according to the user's transformation request
   - The asset should be optimized to help complete the video animation${isFirstScene ? '' : '\n   - **Visual coherence**: Ensure all consistent elements match the attached reference image to maintain visual continuity across scenes'}

2. **Video Animation Prompt**: An EXTREMELY detailed prompt describing the video animation based on the original scene's camera movement and action. **CRITICAL CONSTRAINTS:**
   - **MUST be EXACTLY ONE continuous paragraph** (no line breaks, no bullet points)
   - **MUST be UNDER 999 characters** (strictly enforced - count characters including spaces)
   - **MUST maintain maximum detail and precision** despite the character limit
   - **FAITHFULLY FOLLOW** the original scene's camera movement: "${scene.cameraMovement || 'unknown'}"
   - **ENHANCE** by adding professional cinematography and technical details
   - **PRESERVE** the original scene's camera movement type and action pacing
   - Use dense, efficient language: combine details into single phrases, use compound adjectives, merge related concepts
   - Include essential technical details: camera movements (dolly, pan, zoom, orbit) matching the original scene, lighting matching the original, cinematography techniques
   - Describe physical movements concisely but precisely (gravity, rotation speed, impact effects) based on the original scene
   - Include visual effects, depth of field, motion blur where appropriate
   - Specify color grading and aesthetic matching the original scene
   - **Maintain the artistic style and aesthetic** of the original scene
   - **Adapt the content/subject** to match the transformation request
   - **EVERY WORD MUST COUNT** - maximize information density while staying under 999 characters
   - **VERIFY CHARACTER COUNT** - ensure the prompt is exactly one paragraph and under 999 characters before finalizing
   - **CRITICAL PROHIBITION - NO TEXT OVERLAY**: You MUST NOT include, mention, or suggest ANY text overlay, on-screen text, captions, subtitles, or any text appearing in the video. Text overlays always look bad in generated videos. Describe ONLY visual elements, actions, camera movements, lighting, and composition - NO TEXT, NO CAPTIONS, NO SUBTITLES, NO ON-SCREEN TEXT OF ANY KIND.

**Critical Requirements:**
- Both prompts must maintain the artistic essence of the original scene
- Both prompts must adapt the content according to the user's transformation request
- The Nano Banana prompt should create an image that supports the video animation
- The video prompt should describe the animation/movement based on the original scene's camera work
- Make every detail explicit and clear
- The prompts should be ready to copy and paste directly into their respective tools

**Output Format:**
Provide your response EXACTLY in this format:

**NANO_BANANA_PROMPT:**
[Your detailed Nano Banana Pro prompt here - create an asset that helps complete the video animation${isFirstScene ? '' : '. IMPORTANT: Explicitly mention that consistent elements (person, product, colors, style) should be based on the attached reference image to ensure visual coherence'}]

**VIDEO_ANIMATION_PROMPT:**
[Your extremely detailed video animation prompt here - MUST be exactly ONE continuous paragraph, UNDER 999 characters total, maximum density and precision. Describe the camera movement and action based on the original scene. Count characters to ensure under 999.]`;

      try {
        const promptResult = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    fileUri: videoFile.uri,
                    mimeType: videoFile.mimeType
                  }
                },
                {
                  text: promptGenerationRequest
                }
              ]
            }
          ]
        });

        if (promptResult.candidates && promptResult.candidates[0]?.content?.parts) {
          const promptText = promptResult.candidates[0].content.parts
            .map((part: any) => part.text || '')
            .join('')
            .trim();

          // Extract Nano Banana Pro Prompt
          const nanoBananaMatch = promptText.match(/\*\*NANO_BANANA_PROMPT:\*\*\s*([\s\S]*?)(?=\*\*VIDEO_ANIMATION_PROMPT:\*\*|$)/i);
          const nanoBananaPrompt = nanoBananaMatch ? nanoBananaMatch[1].trim() : '';

          // Extract Video Animation Prompt
          const videoAnimationMatch = promptText.match(/\*\*VIDEO_ANIMATION_PROMPT:\*\*\s*([\s\S]*?)$/i);
          const videoAnimationPrompt = videoAnimationMatch ? videoAnimationMatch[1].trim() : '';

          if (nanoBananaPrompt && videoAnimationPrompt) {
            scenePrompts.push({
              sceneNumber: scene.sceneNumber || i + 1,
              startTime: scene.startTime || 0,
              endTime: scene.endTime || 0,
              duration: scene.duration || 0,
              description: scene.description || 'No description',
              nanoBananaPrompt: nanoBananaPrompt,
              videoAnimationPrompt: videoAnimationPrompt
            });
          } else {
            console.warn(`Failed to extract both prompts for scene ${i + 1}`);
          }
        }
      } catch (promptError: any) {
        console.error(`Error generating prompt for scene ${i + 1}:`, promptError);
        // Continue with other scenes even if one fails
      }
    }

    if (scenePrompts.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate prompts for any scenes' },
        { status: 500 }
      );
    }

    // Calculate usage and costs
    let totalUsage = {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0
    };

    // Extract usage from scene analysis
    const analysisUsage = (sceneAnalysis as any).usageMetadata;
    if (analysisUsage) {
      totalUsage.promptTokenCount += analysisUsage.promptTokenCount || 0;
      totalUsage.candidatesTokenCount += analysisUsage.candidatesTokenCount || 0;
      totalUsage.totalTokenCount += analysisUsage.totalTokenCount || (analysisUsage.promptTokenCount || 0) + (analysisUsage.candidatesTokenCount || 0);
    }

    // Note: Individual prompt generation usage would need to be tracked separately
    // For now, we'll estimate or skip detailed tracking for individual prompts

    const inputCostPerMillion = 0.5;
    const outputCostPerMillion = 3.0;
    const inputCost = (totalUsage.promptTokenCount / 1_000_000) * inputCostPerMillion;
    const outputCost = (totalUsage.candidatesTokenCount / 1_000_000) * outputCostPerMillion;
    const totalCost = inputCost + outputCost;

    const usageInfo = {
      promptTokenCount: totalUsage.promptTokenCount,
      candidatesTokenCount: totalUsage.candidatesTokenCount,
      totalTokenCount: totalUsage.totalTokenCount,
      inputCost,
      outputCost,
      totalCost,
      inputCostFormatted: `$${inputCost.toFixed(6)}`,
      outputCostFormatted: `$${outputCost.toFixed(6)}`,
      totalCostFormatted: `$${totalCost.toFixed(6)}`
    };

    console.log('\n=== REQUEST COMPLETE ===');
    console.log(`Generated ${scenePrompts.length} scene prompts`);
    console.log('Usage:', usageInfo);

    return NextResponse.json({
      success: true,
      scenePrompts: scenePrompts,
      usage: usageInfo
    });

  } catch (error: any) {
    console.error('Error generating video scene prompts:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

