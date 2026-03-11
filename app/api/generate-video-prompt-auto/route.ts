import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateVideoPromptAuto', request);
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
    const { description, productImage, isUGC = true, bRollAnimation = false, bRollSceneCount = 2 } = body;

    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    // Handle product image if provided
    let productImageFile = null;
    if (productImage) {
      try {
        console.log('Uploading product image to Gemini Files...');
        const productBuffer = Buffer.from(productImage.split(',')[1], 'base64');
        let productMime = productImage.split(';')[0].split(':')[1] || 'image/png';
        
        const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        if (!supportedFormats.includes(productMime.toLowerCase())) {
          productMime = 'image/png';
        }
        
        const productUint8Array = new Uint8Array(productBuffer);
        const productBlob = new Blob([productUint8Array], { type: productMime });
        productImageFile = await ai.files.upload({
          file: productBlob,
          config: { mimeType: productMime }
        });
        console.log('Product image uploaded:', productImageFile.uri);
        
        // Wait for file to be ACTIVE
        const maxWaitTime = 60000;
        const checkInterval = 2000;
        const startTime = Date.now();
        
        while (productImageFile.state !== 'ACTIVE') {
          if (Date.now() - startTime > maxWaitTime) {
            throw new Error('Timeout waiting for product image to be ready');
          }
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          
          try {
            const fileName = productImageFile.name || productImageFile.uri?.split('/').pop() || '';
            if (fileName) {
              const fileInfo = await ai.files.get({ name: fileName });
              productImageFile = fileInfo;
            }
          } catch (err) {
            console.error('Error checking file status:', err);
          }
        }
      } catch (imageError: any) {
        console.error('Error uploading product image:', imageError);
        // Continue without image if upload fails
      }
    }

    // Build UGC-specific instructions
    const ugcInstructions = isUGC ? `
**CRITICAL - UGC HYPERREALISTIC MODE (ACTIVE):**
The video MUST be generated as hyperrealistic UGC content, as if recorded by a real person on their iPhone. You MUST:

1. **Decide characters/people**: Based on the description, determine who should appear (age, gender, appearance, role, demographics) and make them feel authentic and relatable. Consider the target audience and make characters that would resonate with them.

2. **Decide camera compositions**: For each scene, intelligently choose from these UGC compositions based on what fits the narrative:
   - **UGC Close-up**: Use for extreme close-ups of product details, textures, intimate moments, or when showing specific product features
   - **Product in Real Use**: Use for showing the product being used naturally in real life, demonstrating functionality
   - **Everyday Life**: Use for integrating the product into authentic daily scenarios, showing it in natural context
   - **Authentic Unboxing**: Use for first-person unboxing, reveal moments, or when introducing the product

3. **Decide lighting/ambience**: For each scene, intelligently choose from these UGC lighting options based on what fits the narrative:
   - **Night Outside**: Use for outdoor nighttime scenarios, evening use cases, or when night atmosphere fits the story
   - **Day Outside**: Use for outdoor daytime scenarios, bright natural settings, or when daylight fits the story
   - **Artificial Light Inside**: Use for indoor scenarios with artificial lighting, home environments, or when indoor artificial light fits the story
   - **Natural Light Inside**: Use for indoor scenarios with natural window light, bright indoor spaces, or when natural indoor light fits the story

4. **Maintain 100% hyperrealism**: The video must look exactly like real iPhone-recorded content with:
   - Natural handheld camera movements (slight shake, imperfect zoom, quick pan, authentic mobile recording aesthetic)
   - Authentic mobile phone grain and noise typical of iPhone cameras
   - Realistic shadows with proper falloff, authentic density, and natural softness
   - Photorealistic lighting with natural diffusion and authentic color temperature
   - Hyperrealistic textures (skin with pores, fabric with visible weave, product surfaces with authentic material details)
   - iPhone camera characteristics (natural color science, realistic depth of field, authentic exposure, slight lens distortion)
   - Real-world imperfections (motion blur, focus breathing, chromatic aberration, lens flare when appropriate)
   - **CRITICAL - NO BACKGROUND BLUR**: The background MUST be completely sharp and in focus, exactly as iPhone cameras record in vertical/portrait mode. NEVER apply blur, bokeh, or depth of field effects to the background. The entire scene (foreground, subject, and background) must be equally sharp and focused, as if recorded with an iPhone in standard camera mode. This is essential for authentic UGC realism.

**CRITICAL HYPERREALISM REQUIREMENTS (MANDATORY):**
- **Ultra-realistic shadows**: Natural, soft shadows with proper falloff, realistic shadow edges, authentic shadow density and color that matches the light source
- **Photorealistic lighting**: Natural light behavior, realistic light diffusion, authentic light temperature and color casts, genuine light reflections and highlights
- **Hyperrealistic textures**: Every surface must show realistic material properties - skin texture with pores and natural imperfections, fabric textures with visible weave, product surfaces with authentic material details
- **iPhone camera characteristics**: Subtle mobile phone grain, natural iPhone color science, realistic depth of field, authentic exposure characteristics, slight lens distortion typical of iPhone cameras
- **CRITICAL - NO BACKGROUND BLUR (MANDATORY)**: The background MUST be completely sharp and in focus, exactly as iPhone cameras record in vertical/portrait mode. NEVER apply blur, bokeh, shallow depth of field, or any depth-of-field effects to the background. The entire scene (foreground, subject, and background) must be equally sharp and focused, as if recorded with an iPhone in standard camera mode. This is essential for authentic UGC realism - real iPhone recordings in vertical mode keep everything in focus.
- **Real-world imperfections**: Natural motion blur during movement, authentic focus breathing, realistic chromatic aberration in high contrast areas, genuine lens flare when appropriate
- **Environmental authenticity**: Realistic light interaction with surfaces, authentic material response to lighting, genuine atmospheric perspective, natural light scattering
- **Natural handheld movements**: The camera should feel like someone is holding their iPhone, with natural shake, imperfect movements, and authentic mobile recording aesthetic

The goal is absolute photorealism - the video should be impossible to distinguish from a real iPhone recording. The background must be completely sharp, just like real iPhone footage.` : `
**PROFESSIONAL VIDEO MODE:**
Generate a professional video prompt with high production quality. Focus on clear storytelling, good composition, and professional aesthetics.`;

    // B-roll animation mode: action-only, no script, hyperrealistic visuals
    const bRollInstructions = bRollAnimation ? `
**CRITICAL - B-ROLL ANIMATION MODE (ACTIVE):**
The user's description is the ACTION only. Generate pure B-roll style scenes:
- **NO SCRIPT**: Every scene MUST have script: null. There is no dialogue, no voiceover, no narration.
- **NO DIALOGUE**: For EVERY scene set noDialogue: true, lipSync: false, voiceover: false.
- **ACTION FOCUS**: The description describes only what we SEE: movements, close-ups, product shots, transitions. Interpret it as visual/action only.
- **HYPERREALISTIC**: Each scene must be hyperrealistic UGC-style, focused entirely on the action and visuals (lighting, textures, camera movement, composition). No spoken content.
- **B-ROLL STYLE**: Think cinematic B-roll: cuts, close-ups, product in use, hands, details. Pure visual storytelling.
- **SCENE COUNT (MANDATORY)**: Generate EXACTLY ${bRollSceneCount === 1 ? 'ONE (1) SCENE' : 'TWO (2) SCENES'} in total, no more and no less.
  - If 1 scene: Describe ONE continuous, coherent action without many changes or jumps; keep it simple and focused in a single flow.
  - If 2 scenes: Describe EXACTLY TWO distinct actions/scenes that flow naturally; do NOT create a third scene.` : '';

    const generationPrompt = `You are an expert AI prompt engineer specializing in ${isUGC ? 'hyperrealistic UGC (User-Generated Content)' : 'professional'} video prompts. Your task is to create a complete, ready-to-use video prompt based on the user's description.

**User's Request:**
${description}

${productImageFile ? '**Product Image:** You have access to a product image. Analyze it carefully and incorporate its visual details (colors, materials, textures, design, branding) into the prompt.' : ''}
${bRollInstructions}

${ugcInstructions}

**Your Task:**
Deconstruct the user's description into structured scenes with ALL parameters automatically filled. Generate a JSON response with complete scene configurations.

**CRITICAL REQUIREMENTS:**
1. **Analyze the description** and identify ALL distinct scenes, actions, or moments
2. **For EACH scene, determine ALL parameters:**
   - **Action**: Detailed action description ${isUGC ? 'with hyperrealistic UGC details' : 'with professional quality'}${bRollAnimation ? ' (B-roll mode: action/visual only, no dialogue)' : ''}
   - **Script** (if dialogue/narration is needed): Generate appropriate script/dialogue for the scene, or null if no dialogue${bRollAnimation ? '. **B-roll mode: ALWAYS null**' : ''}
   - **Composition**: Choose 1-2 from: "UGC Close-up", "Product in Real Use", "Everyday Life", "Authentic Unboxing" - select what best fits the scene
   - **Camera Angle**: Choose 1-2 from: "Selfie Camera", "Frontal Camera", "Steady" - select what best fits the action (use "Frontal Camera" if POV is mentioned)
   - **Lighting**: Choose ONE from: "Night Outside", "Day Outside", "Artificial Light Inside", "Natural Light Inside" - select what best fits the scene
   - **Duration**: Estimate appropriate duration in seconds (1-15), or 1 for default
   - **Lip Sync**: true if character should visibly speak, false otherwise
   - **Voiceover**: true if voice should play over actions without visible speech, false otherwise
   - **No Dialogue**: true if scene should have no dialogue/speech at all, false otherwise

3. **Decide characters/people**: Based on the description, determine who should appear, their characteristics, and maintain consistency across scenes

4. **Maintain narrative flow**: Ensure scenes connect logically and tell a cohesive story

**Output Format - CRITICAL:**
You MUST respond with a valid JSON object in this EXACT format:
\`\`\`json
{
  "scenes": [
    {
      "action": "Detailed action description for scene 1...",
      "script": "Script text if needed, or null",
      "composition": ["UGC Close-up", "Everyday Life"],
      "cameraAngle": ["Selfie Camera"],
      "lighting": "Natural Light Inside",
      "duration": 5,
      "lipSync": false,
      "voiceover": false,
      "noDialogue": false
    },
    {
      "action": "Detailed action description for scene 2...",
      "script": null,
      "composition": ["Product in Real Use"],
      "cameraAngle": ["Frontal Camera"],
      "lighting": "Day Outside",
      "duration": 8,
      "lipSync": false,
      "voiceover": true,
      "noDialogue": false
    }
  ]
}
\`\`\`

**CRITICAL RULES:**
- **MANDATORY**: Respond ONLY with valid JSON, no additional text before or after
- **MANDATORY**: All scenes must have ALL required fields (action, script, composition, cameraAngle, lighting, duration, lipSync, voiceover, noDialogue)
- **MANDATORY**: Composition and cameraAngle must be arrays (can have 1-2 items)
- **MANDATORY**: Lighting must be a single string from the options
- **MANDATORY**: Duration must be a number (1-15)
- **MANDATORY**: lipSync, voiceover, noDialogue must be booleans (true/false)
- **MANDATORY**: If no dialogue needed, set script to null and noDialogue to true
- **MANDATORY**: If script is provided, set lipSync or voiceover appropriately (not both true)
- **MANDATORY**: Generate 1-5 scenes based on the description complexity
- **MANDATORY**: All content must be in English
${isUGC ? '- **MANDATORY**: All scenes must maintain hyperrealistic UGC characteristics' : ''}
${bRollAnimation ? '- **MANDATORY (B-roll mode)**: Every scene MUST have script: null, noDialogue: true, lipSync: false, voiceover: false. Action-only, no spoken content.' : ''}

**Important:**
- If a hook is mentioned, make the first scene extremely attention-grabbing
- If product showcase is requested, ensure the product is clearly visible and well-lit
- Maintain consistency in character, location, and style across scenes
- Choose parameters that best fit each scene's narrative purpose`;

    // Build parts array
    const parts: any[] = [];
    
    if (productImageFile) {
      parts.push({
        fileData: {
          fileUri: productImageFile.uri,
          mimeType: productImageFile.mimeType
        }
      });
    }
    
    parts.push({
      text: generationPrompt
    });

    console.log('Sending request to Gemini with prompt length:', generationPrompt.length);
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: parts
        }
      ]
    });

    console.log('Gemini response received:', {
      hasCandidates: !!result.candidates,
      candidatesLength: result.candidates?.length,
      firstCandidate: result.candidates?.[0] ? 'exists' : 'missing'
    });

    // Extract the generated prompt
    let generatedText = '';
    if (result.candidates && result.candidates[0]?.content?.parts) {
      generatedText = result.candidates[0].content.parts
        .map((part: any) => part.text || '')
        .join('')
        .trim();
    } else if ((result as any).text) {
      generatedText = (result as any).text.trim();
    }

    console.log('Extracted prompt length:', generatedText.length);
    console.log('First 200 chars of generated prompt:', generatedText.substring(0, 200));

    if (!generatedText) {
      console.error('No prompt generated - result structure:', JSON.stringify(result, null, 2));
      return NextResponse.json(
        { error: 'Failed to generate prompt - no content returned from AI' },
        { status: 500 }
      );
    }

    // Validate that the generated prompt is not just the input description
    const descriptionLower = description.toLowerCase().trim();
    const promptLower = generatedText.toLowerCase().trim();
    
    // Check if the generated prompt is too similar to the input (likely means AI just echoed the input)
    if (promptLower.includes(descriptionLower) && promptLower.length < descriptionLower.length * 2) {
      console.error('Generated prompt appears to be just the input description. Prompt:', generatedText.substring(0, 200));
      return NextResponse.json(
        { error: 'AI returned input instead of generating prompt. Please try again.' },
        { status: 500 }
      );
    }

    // Ensure the response contains JSON structure (indicates it was actually generated)
    if (!generatedText.includes('{') && !generatedText.includes('Scene')) {
      console.error('Generated prompt does not contain expected structure. Prompt:', generatedText.substring(0, 200));
      return NextResponse.json(
        { error: 'Generated prompt does not match expected format. Please try again.' },
        { status: 500 }
      );
    }

    // Credit already consumed in verifyAndConsumeCredit

    // Strip markdown code blocks so we can parse JSON (model often returns ```json\n{...}\n```)
    let jsonStr = generatedText.trim();
    const codeBlockStart = /^\s*```(?:json)?\s*\n?/i;
    const codeBlockEnd = /\n?\s*```\s*$/;
    if (codeBlockStart.test(jsonStr)) jsonStr = jsonStr.replace(codeBlockStart, '');
    if (codeBlockEnd.test(jsonStr)) jsonStr = jsonStr.replace(codeBlockEnd, '').trim();

    // Try to parse as JSON if it looks like JSON, otherwise return as text
    let parsed = null;
    let scenesArray: Array<{ action?: string; script?: string | null; composition?: string[]; cameraAngle?: string[]; lighting?: string; duration?: number; lipSync?: boolean; voiceover?: boolean; noDialogue?: boolean }> | null = null;
    if (jsonStr.includes('{') && jsonStr.includes('}')) {
      try {
        parsed = JSON.parse(jsonStr);
        // API returns { scenes: [ ... ] } so extract the array
        scenesArray = parsed?.scenes && Array.isArray(parsed.scenes) ? parsed.scenes : null;
      } catch (e) {
        // Not valid JSON, that's okay - return as text prompt
        console.log('Response is not valid JSON, returning as text prompt');
      }
    }

    // If B-roll has a fixed scene count, enforce it by slicing the array
    let effectiveScenes = scenesArray;
    if (bRollAnimation && scenesArray && scenesArray.length > 0) {
      const targetCount = bRollSceneCount === 1 ? 1 : 2;
      effectiveScenes = scenesArray.slice(0, targetCount);
    }

    // Build single paragraph for output (redactado): join all scene actions, like manual UGC generator
    const paragraphPrompt = effectiveScenes && effectiveScenes.length > 0
      ? effectiveScenes.map((s: any) => (s.action || '').trim()).filter(Boolean).join(' ')
      : generatedText;

    return NextResponse.json({
      success: true,
      prompt: paragraphPrompt,
      scenes: effectiveScenes
    });
  } catch (error: any) {
    console.error('Error generating automatic video prompt:', error);
    
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'API configuration error. Please check your environment variables.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate video prompt' },
      { status: 500 }
    );
  }
}


