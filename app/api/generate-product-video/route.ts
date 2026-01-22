import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';
import { recordGeneration } from '@/lib/generation-check';

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateProductVideo', request);
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
    const { productImage, actionDescription, animateOnly, nanoBananaOnly, isUGC } = body;

    if (!productImage || !actionDescription) {
      return NextResponse.json(
        { error: 'Product image and action description are required' },
        { status: 400 }
      );
    }

    console.log('Generating product video animation prompts...');
    console.log('Action description:', actionDescription);

    // Convert base64 to Buffer
    const productBuffer = Buffer.from(productImage.split(',')[1], 'base64');
    const productMime = productImage.split(';')[0].split(':')[1] || 'image/png';

    // Upload product image to Gemini Files
    console.log('Uploading product image to Gemini Files...');
    let productFile;
    try {
      const productUint8Array = new Uint8Array(productBuffer);
      const productBlob = new Blob([productUint8Array], { type: productMime });
      productFile = await ai.files.upload({
        file: productBlob,
        config: { mimeType: productMime }
      });
      console.log('Product image uploaded:', productFile.uri);
    } catch (uploadError: any) {
      console.error('Error uploading image:', uploadError);
      return NextResponse.json(
        { error: 'Error uploading image to Gemini', details: uploadError.message },
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
      const productFileName = productFile.name || productFile.uri?.split('/').pop() || '';
      
      if (!productFileName) {
        return NextResponse.json(
          { error: 'Failed to get file identifier' },
          { status: 500 }
        );
      }
      
      productFile = await waitForFile(productFile, productFileName);
      
      if (!productFile.uri) {
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

    // If nanoBananaOnly is true, generate only the Nano Banana prompt
    if (nanoBananaOnly) {
      const nanoBananaPromptRequest = `You are an expert AI prompt engineer specializing in professional product video animations. You are creating a prompt for Nano Banana Pro to generate a reference image that will be used as the base for video animation.

**Context:**
- Product: Analyze the provided product image carefully
- User's Request for Animation: "${actionDescription}"

**CRITICAL INSTRUCTION:**
You MUST create a prompt that generates the PERFECT frame for the animation the user described. The image must be optimized to support the specific video action requested.

**Your Task:**
Generate a detailed, cinematic prompt for Nano Banana Pro that:
1. **Optimizes for the animation**: The image must be framed and composed to support the specific animation described: "${actionDescription}"
   - If the animation involves rotation: create an image that shows the product in a way that allows for rotation
   - If the animation involves falling/movement: position the product to support that movement
   - If the animation involves close-ups: create an image that allows for detailed close-up shots
   - If the animation involves specific angles: frame the product from the angle that supports the animation

2. **Includes exact product details**: 
   - Exact appearance, colors, materials, textures from the provided product image
   - Professional studio-quality composition
   - High-resolution, hyperrealistic details

3. **Optimal lighting setup**: 
   - Lighting that supports the specific video animation requested
   - Background and environment that supports the animation style
   - Camera angle and perspective that works well for the specific action requested

4. **Frame optimization**:
   - The image should be the perfect starting frame for the animation
   - Consider what elements need to be visible for the animation to work
   - Ensure the composition allows for the movement/action described

**Output Format:**
Provide your response EXACTLY in this format:

**NANO_BANANA_PROMPT:**
[Your detailed Nano Banana Pro prompt here - create an asset optimized for the animation: "${actionDescription}"]`;

      try {
        const result = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    fileUri: productFile.uri,
                    mimeType: productFile.mimeType
                  }
                },
                {
                  text: nanoBananaPromptRequest
                }
              ]
            }
          ]
        });

        let nanoBananaPrompt = '';
        if (result.candidates && result.candidates[0]?.content?.parts) {
          const responseText = result.candidates[0].content.parts
            .map((part: any) => part.text || '')
            .join('')
            .trim();

          // Extract Nano Banana prompt
          const nanoBananaMatch = responseText.match(/\*\*NANO_BANANA_PROMPT:\*\*\s*([\s\S]*?)$/i);
          if (nanoBananaMatch) {
            nanoBananaPrompt = nanoBananaMatch[1].trim();
          } else {
            // Fallback: use the whole response
            nanoBananaPrompt = responseText;
          }
        }

        if (!nanoBananaPrompt) {
          return NextResponse.json(
            { error: 'Failed to generate Nano Banana prompt' },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          nanoBananaPrompt: nanoBananaPrompt
        });
      } catch (error: any) {
        console.error('Error generating Nano Banana prompt:', error);
        return NextResponse.json(
          { error: 'Error generating Nano Banana prompt', details: error.message },
          { status: 500 }
        );
      }
    }

    // If animateOnly is true, generate only the video animation prompt based on the uploaded image
    if (animateOnly) {
      const ugcInstructions = isUGC ? `\n\n**CRITICAL - UGC HYPERREALISTIC ANIMATION (IMAGE IS A HYPERREALISTIC PERSON):**
The attached image is a hyperrealistic person (UGC style). You MUST create an animation prompt that:
- **MAXIMUM HYPERREALISM**: The animation must be absolutely hyperrealistic, maintaining the same level of realism as the attached image
- **FAITHFUL TO IMAGE**: Every detail from the attached image must be preserved - skin texture, facial features, hair, clothing, lighting conditions, shadows, colors, and all visual elements
- **HYPERREALISTIC MOVEMENT**: All movements must be natural and hyperrealistic - no exaggerated motions, no artificial movements, everything must look completely real
- **PRESERVE LIGHTING**: Maintain the exact lighting conditions from the attached image - light direction, intensity, color temperature, shadows, highlights, and all lighting details
- **PRESERVE SHADOWS**: Maintain all shadows exactly as they appear in the attached image - shadow positions, softness, darkness, and any shadow details
- **PRESERVE TEXTURES**: Maintain all textures exactly - skin texture, fabric textures, any material textures visible in the image
- **PRESERVE COLORS**: Maintain the exact color palette, color temperature, and color grading from the attached image
- **NO CAMERA MOVEMENT UNLESS REQUESTED**: You MUST NOT include ANY camera movement (pan, tilt, zoom, dolly, orbit, tracking, etc.) UNLESS the user explicitly requests it in their description. The camera must remain static and fixed in position. Only animate the person/subject in the frame.
- **CAMERA MOVEMENT EXCEPTION**: If the user explicitly mentions camera movements (e.g., "camera zooms in", "camera moves", "camera follows", "pan", "tilt", etc.), then you may include those specific camera movements the user requested. Otherwise, NO camera movement.
- **NATURAL ANIMATION**: Focus on natural, realistic movements of the person - facial expressions, body movements, gestures, etc. - all must be hyperrealistic and natural
- **PRESERVE VISUAL FIDELITY**: The animated result must look exactly like the attached image came to life, with no visual changes except for the natural movements described` : '';

      const animationPromptRequest = `You are an expert AI prompt engineer specializing in professional product video animations. You are creating a video animation prompt that will animate an uploaded image.

**Context:**
- Product Image: Analyze the provided product image carefully - this image will be attached to the video AI model
- User's Original Request: "${actionDescription}" - This is the original description the user provided. The animation MUST follow this description exactly.${ugcInstructions}

**CRITICAL INSTRUCTION:**
You MUST respect and follow EXACTLY what the user requested. Your job is to:
1. Analyze the attached product image to understand what elements need to be animated
2. Take the user's description and enhance it with professional cinematography details
3. Add technical details (camera movements, lighting, physics) to make it executable${isUGC ? ' (BUT: NO camera movements unless explicitly requested by user)' : ''}
4. BUT keep the core action, pacing, and style that the user described
5. Ensure the animation prompt correctly animates the elements visible in the attached image
6. If the user mentions "quick cuts" or "different shots", include those
7. If the user mentions "slow rotation" or "slow movement", keep it slow
8. If the user wants "detailed close-ups", include detailed close-up shots
9. Don't add actions the user didn't request
10. Don't change the pacing the user described (fast cuts stay fast, slow movements stay slow)${isUGC ? '\n11. **CRITICAL**: Do NOT add any camera movements unless the user explicitly requests them. The camera must remain static.' : ''}

**Your Task:**
Generate ONE extremely detailed video animation prompt that:

**CRITICAL - IMAGE WILL BE ATTACHED:**
- The product image provided will be attached to the video AI model when this prompt is used
- You MUST explicitly mention in the prompt that the animation should be based on the attached image
- The prompt must describe how to animate the elements visible in the attached image
- Ensure the prompt correctly identifies what should be animated from the image (product, background, lighting, etc.)
- The animation should respect the visual elements, colors, composition, and style of the attached image

**Video Animation Prompt Requirements:**
- **MUST be EXACTLY ONE continuous paragraph** (no line breaks, no bullet points)
- **MUST be UNDER 999 characters** (strictly enforced - count characters including spaces)
- **MUST maintain maximum detail and precision** despite the character limit
- **FAITHFULLY FOLLOW** the user's request: "${actionDescription}"
- **ENHANCE** the user's description by adding professional cinematography and technical details${isUGC ? ' (BUT preserve all hyperrealistic details from the attached image)' : ''}
- **ANIMATE THE ATTACHED IMAGE**: Explicitly state that the animation should be based on the attached product image${isUGC ? '. The animation must preserve ALL hyperrealistic details - lighting, shadows, textures, colors - exactly as shown in the attached image' : ''}
- **FOLLOW THE ORIGINAL DESCRIPTION**: The animation MUST follow the user's original request: "${actionDescription}". This description was provided at the beginning and must be respected.
- **RESPECT** the pacing, cuts, and movements the user described:
  * If user says "quick cuts" or "different shots" → include quick cuts between shots
  * If user says "slow rotation" or "slowly" → keep it slow and detailed
  * If user says "detailed close-ups" → include detailed close-up shots
  * If user says "show front part" → make sure to show the front part clearly${isUGC ? '\n  * **CRITICAL**: If user does NOT mention camera movements → DO NOT include any camera movements. Camera must remain static.' : ''}
- Use dense, efficient language: combine details into single phrases, use compound adjectives, merge related concepts
- Include essential technical details:${isUGC ? ' lighting (preserved from image), physics (if applicable),' : ' camera movements (dolly, pan, zoom, orbit), lighting, physics (if applicable), cinematography techniques'}${isUGC ? ' BUT NO camera movements unless explicitly requested' : ''}
- Describe physical movements concisely but precisely (gravity, rotation speed, impact effects)${isUGC ? ', maintaining hyperrealistic natural motion' : ''}
- Include visual effects, depth of field, motion blur where appropriate${isUGC ? ', all hyperrealistic and matching the attached image' : ''}
- Specify color grading and aesthetic matching the attached image${isUGC ? ' EXACTLY - preserve all colors, lighting, and visual characteristics' : ''}
- Follow the sequence the user described
- **EVERY WORD MUST COUNT** - maximize information density while staying under 999 characters
- **VERIFY CHARACTER COUNT** - ensure the prompt is exactly one paragraph and under 999 characters before finalizing
- **CRITICAL PROHIBITION - NO TEXT OVERLAY**: You MUST NOT include, mention, or suggest ANY text overlay, on-screen text, captions, subtitles, or any text appearing in the video. Text overlays always look bad in generated videos. Describe ONLY visual elements, actions, camera movements, lighting, and composition - NO TEXT, NO CAPTIONS, NO SUBTITLES, NO ON-SCREEN TEXT OF ANY KIND.${isUGC ? '\n- **CRITICAL - NO CAMERA MOVEMENT**: You MUST NOT include ANY camera movements (pan, tilt, zoom, dolly, orbit, tracking, etc.) UNLESS the user explicitly requested camera movements in their description. The camera must remain static and fixed.' : ''}

**Output Format:**
Provide your response EXACTLY in this format:

**VIDEO_ANIMATION_PROMPT:**
[Your extremely detailed video animation prompt here - MUST be exactly ONE continuous paragraph, UNDER 999 characters total, maximum density and precision. The prompt MUST explicitly mention that the animation should be based on the attached product image. Faithfully follow the user's request: "${actionDescription}" and enhance it with professional details. Use efficient, dense language. Count characters to ensure under 999.]`;

      try {
        const result = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    fileUri: productFile.uri,
                    mimeType: productFile.mimeType
                  }
                },
                {
                  text: animationPromptRequest
                }
              ]
            }
          ]
        });

        let videoPrompt = '';
        if (result.candidates && result.candidates[0]?.content?.parts) {
          const responseText = result.candidates[0].content.parts
            .map((part: any) => part.text || '')
            .join('')
            .trim();

          // Extract video animation prompt
          const videoPromptMatch = responseText.match(/\*\*VIDEO_ANIMATION_PROMPT:\*\*\s*([\s\S]*?)$/i);
          if (videoPromptMatch) {
            videoPrompt = videoPromptMatch[1].trim();
          } else {
            // Fallback: use the whole response
            videoPrompt = responseText;
          }
        }

        if (!videoPrompt) {
          return NextResponse.json(
            { error: 'Failed to generate animation prompt' },
            { status: 500 }
          );
        }

        // Record generation after successful completion
        await recordGeneration(request);

        return NextResponse.json({
          success: true,
          videoPrompt: videoPrompt
        });
      } catch (error: any) {
        console.error('Error generating animation prompt:', error);
        return NextResponse.json(
          { error: 'Error generating animation prompt', details: error.message },
          { status: 500 }
        );
      }
    }

    // Generate both prompts in a single call (original behavior)
    const promptGenerationRequest = `You are an expert AI prompt engineer specializing in professional product video animations. You are creating prompts for animating a product video.

**Context:**
- Product: Analyze the provided product image carefully
- User's Request: "${actionDescription}"

**CRITICAL INSTRUCTION:**
You MUST respect and follow EXACTLY what the user requested. Your job is to:
1. Take the user's description and enhance it with professional cinematography details
2. Add technical details (camera movements, lighting, physics) to make it executable
3. BUT keep the core action, pacing, and style that the user described
4. If the user mentions "quick cuts" or "different shots", include those
5. If the user mentions "slow rotation" or "slow movement", keep it slow
6. If the user wants "detailed close-ups", include detailed close-ups
7. Don't add actions the user didn't request
8. Don't change the pacing the user described (fast cuts stay fast, slow movements stay slow)

**Your Task:**
Generate TWO extremely detailed, professional prompts:

1. **Nano Banana Pro Prompt**: A detailed, cinematic prompt to generate a high-quality reference image/asset of the product that will help create the video the user requested. This image will be used as the base for video animation. The prompt should:
   - Create an asset that supports the specific video action the user described
   - If user wants "different shots/detailed close-ups": generate a product image that shows the product in a way that allows for those shots
   - If user wants "rotation showing front": generate a product image that clearly shows the front and allows for rotation
   - Include exact product appearance, colors, materials, textures, lighting
   - Professional studio-quality composition
   - Perfect framing and positioning that supports the requested video action
   - High-resolution, hyperrealistic details
   - Optimal lighting setup for the specific video animation requested
   - Background and environment that supports the animation style
   - Camera angle and perspective that works well for the specific action requested
   - The asset should be optimized to help complete the video the user wants

2. **Video Animation Prompt**: An EXTREMELY detailed prompt describing the video animation. **CRITICAL CONSTRAINTS:**
   - **MUST be EXACTLY ONE continuous paragraph** (no line breaks, no bullet points)
   - **MUST be UNDER 999 characters** (strictly enforced - count characters including spaces)
   - **MUST maintain maximum detail and precision** despite the character limit
   - **FAITHFULLY FOLLOW** the user's request: "${actionDescription}"
   - **ENHANCE** the user's description by adding professional cinematography and technical details
   - **RESPECT** the pacing, cuts, and movements the user described:
     * If user says "quick cuts" or "different shots" → include quick cuts between shots
     * If user says "slow rotation" or "slowly" → keep it slow and detailed
     * If user says "detailed close-ups" → include detailed close-up shots
     * If user says "show front part" → make sure to show the front part clearly
   - Use dense, efficient language: combine details into single phrases, use compound adjectives, merge related concepts
   - Include essential technical details: camera movements (dolly, pan, zoom, orbit), lighting, physics (if applicable), cinematography techniques
   - Describe physical movements concisely but precisely (gravity, rotation speed, impact effects)
   - Include visual effects, depth of field, motion blur where appropriate
   - Specify color grading and aesthetic
   - Follow the sequence the user described
   - **EVERY WORD MUST COUNT** - maximize information density while staying under 999 characters
   - **VERIFY CHARACTER COUNT** - ensure the prompt is exactly one paragraph and under 999 characters before finalizing
   - **CRITICAL PROHIBITION - NO TEXT OVERLAY**: You MUST NOT include, mention, or suggest ANY text overlay, on-screen text, captions, subtitles, or any text appearing in the video. Text overlays always look bad in generated videos. Describe ONLY visual elements, actions, camera movements, lighting, and composition - NO TEXT, NO CAPTIONS, NO SUBTITLES, NO ON-SCREEN TEXT OF ANY KIND.

**Critical Requirements:**
- Both prompts must be optimized for professional product advertising
- The video prompt MUST follow the user's request structure and pacing
- If user mentions "quick cuts" or "different shots", the video prompt should include quick cuts
- If user mentions "slow" or "slowly", keep those movements slow
- If user wants "detailed close-ups", include detailed close-up shots
- Don't add actions or movements the user didn't request
- Enhance with technical details but keep the core action the same
- Default to cinematic, studio-quality aesthetic unless user specifies otherwise
- Make every detail explicit and clear
- The prompts should be ready to copy and paste directly into their respective tools

**Output Format:**
Provide your response EXACTLY in this format:

**NANO_BANANA_PROMPT:**
[Your detailed Nano Banana Pro prompt here - create an asset that helps complete the video the user requested]

**VIDEO_ANIMATION_PROMPT:**
[Your extremely detailed video animation prompt here - MUST be exactly ONE continuous paragraph, UNDER 999 characters total, maximum density and precision. Faithfully follow the user's request: "${actionDescription}" and enhance it with professional details. Use efficient, dense language. Count characters to ensure under 999.]`;

    try {
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  fileUri: productFile.uri,
                  mimeType: productFile.mimeType
                }
              },
              {
                text: promptGenerationRequest
              }
            ]
          }
        ]
      });

      let responseText = '';
      if (result.candidates && result.candidates[0]?.content?.parts) {
        responseText = result.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('');
      }

      console.log('Response received, length:', responseText.length);

      // Parse the response to extract both prompts
      const nanoBananaMatch = responseText.match(/\*\*NANO_BANANA_PROMPT:\*\*\s*([\s\S]*?)(?=\*\*VIDEO_ANIMATION_PROMPT:\*\*|$)/i);
      const videoPromptMatch = responseText.match(/\*\*VIDEO_ANIMATION_PROMPT:\*\*\s*([\s\S]*?)$/i);

      let nanoBananaPrompt = nanoBananaMatch ? nanoBananaMatch[1].trim() : 'Failed to generate Nano Banana prompt';
      let videoPrompt = videoPromptMatch ? videoPromptMatch[1].trim() : 'Failed to generate video animation prompt';
      
      // Ensure video prompt is a single paragraph and under 999 characters
      if (videoPrompt) {
        // Remove any line breaks to make it a single paragraph
        videoPrompt = videoPrompt.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
        
        // If over 999 characters, we need to optimize it
        if (videoPrompt.length > 999) {
          console.log(`Video prompt is ${videoPrompt.length} characters, needs to be under 999. Optimizing...`);
          
          // Try to optimize by removing redundant words while keeping essential details
          // First, try to regenerate with stricter constraints
          try {
            const optimizationPrompt = `Optimize this video animation prompt to be UNDER 999 characters while maintaining ALL essential details and precision. Make it ONE continuous paragraph with maximum information density.

**Current Prompt (${videoPrompt.length} characters):**
${videoPrompt}

**Requirements:**
- Must be EXACTLY ONE paragraph (no line breaks)
- Must be UNDER 999 characters (strictly enforced)
- Maintain ALL essential technical details (camera movements, lighting, physics, cinematography)
- Keep the core action and pacing from the original
- Use dense, efficient language
- Every word must count

**Output:**
Provide ONLY the optimized prompt as a single continuous paragraph, under 999 characters.`;

            const optimizationResult = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: optimizationPrompt
                    }
                  ]
                }
              ]
            });

            let optimizedText = '';
            if (optimizationResult.candidates && optimizationResult.candidates[0]?.content?.parts) {
              optimizedText = optimizationResult.candidates[0].content.parts
                .map((part: any) => part.text || '')
                .join('');
            }
            
            if (optimizedText) {
              optimizedText = optimizedText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
              
              // If still over 999, truncate intelligently
              if (optimizedText.length <= 999) {
                videoPrompt = optimizedText;
                console.log(`Optimized prompt to ${videoPrompt.length} characters`);
              } else {
                console.warn(`Optimized prompt still ${optimizedText.length} characters, truncating...`);
                // Truncate at word boundary
                videoPrompt = optimizedText.substring(0, 996).trim();
                const lastSpace = videoPrompt.lastIndexOf(' ');
                if (lastSpace > 0) {
                  videoPrompt = videoPrompt.substring(0, lastSpace).trim();
                }
                console.log(`Truncated prompt to ${videoPrompt.length} characters`);
              }
            }
          } catch (optError) {
            console.error('Error optimizing prompt, truncating:', optError);
            // Fallback: truncate at word boundary
            videoPrompt = videoPrompt.substring(0, 996).trim();
            const lastSpace = videoPrompt.lastIndexOf(' ');
            if (lastSpace > 0) {
              videoPrompt = videoPrompt.substring(0, lastSpace).trim();
            }
          }
        }
        
        console.log(`Final video prompt length: ${videoPrompt.length} characters`);
      }

      // Calculate costs (server-side only, not sent to frontend)
      let costInfo = null;
      try {
        const usageMetadata = (result as any).usageMetadata;
        if (usageMetadata) {
          const promptTokenCount = usageMetadata.promptTokenCount || 0;
          const candidatesTokenCount = usageMetadata.candidatesTokenCount || 0;
          const totalTokenCount = usageMetadata.totalTokenCount || (promptTokenCount + candidatesTokenCount);

          // Gemini 3 Flash Preview pricing: Input $0.50/M tokens, Output $3/M tokens
          const inputCostPerMillion = 0.5;
          const outputCostPerMillion = 3.0;

          const inputCost = (promptTokenCount / 1_000_000) * inputCostPerMillion;
          const outputCost = (candidatesTokenCount / 1_000_000) * outputCostPerMillion;
          const totalCost = inputCost + outputCost;

          costInfo = {
            inputCost,
            outputCost,
            totalCost,
            promptTokenCount,
            candidatesTokenCount,
            totalTokenCount
          };

          console.log('\n=== PRODUCT VIDEO PROMPT GENERATION COST ===');
          console.log(`Input tokens: ${promptTokenCount.toLocaleString()}, Cost: $${inputCost.toFixed(6)}`);
          console.log(`Output tokens: ${candidatesTokenCount.toLocaleString()}, Cost: $${outputCost.toFixed(6)}`);
          console.log(`Total tokens: ${totalTokenCount.toLocaleString()}, Total cost: $${totalCost.toFixed(6)}`);
        }
      } catch (costError) {
        console.error('Error calculating costs:', costError);
      }

      console.log('\n=== Prompts generated successfully ===');

      // Credit already consumed in verifyAndConsumeCredit

      return NextResponse.json({
        success: true,
        nanoBananaPrompt: nanoBananaPrompt,
        videoPrompt: videoPrompt
      });

    } catch (generationError: any) {
      console.error('Error generating prompts:', generationError);
      return NextResponse.json(
        {
          error: 'Error generating prompts',
          details: generationError.message || 'Unknown error'
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error in product video generation:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
