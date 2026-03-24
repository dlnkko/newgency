import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export const maxDuration = 60; // 60 seconds for Vercel Pro plan

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateVideoPromptFromScript', request);
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
    const { script, productImage, isUGC = true, ugcCameraMode = 'selfie', productPhotoWillBeAttached = false } = body;

    if (!script || !script.trim()) {
      return NextResponse.json(
        { error: 'Script is required' },
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

    const ugcCameraModeInstructions = isUGC
      ? (ugcCameraMode === 'gimbal'
          ? `
**CRITICAL - UGC CAMERA MODE: GIMBAL (ABSOLUTE OVERRIDE):**
- The camera must be stabilized and smooth (no camera shake, no jitter).
- Movement style: slow tracking walk-and-talk following a content creator from behind, then gradually arc/orbit to a front-facing angle.
- Keep chest-height glide and steady focus on the subject.
- Lighting should feel natural and warm.
- Prefer camera angle language equivalent to **Steady/gimbal** in all scenes unless script explicitly demands otherwise.`
          : `
**CRITICAL - UGC CAMERA MODE: SELFIE (ABSOLUTE OVERRIDE):**
- The avatar/creator is holding the phone while filming themselves.
- Movement should be hyperrealistic handheld selfie: natural micro-shake, tiny jitter from grip and walking, authentic mobile capture imperfections.
- Prefer camera angle language equivalent to **Selfie Camera** in all scenes unless script explicitly demands POV/frontal for a specific moment.`)
      : '';

    // Build UGC-specific instructions
    const ugcInstructions = isUGC ? `
**CRITICAL - UGC HYPERREALISTIC MODE (ACTIVE):**
The video MUST be generated as hyperrealistic UGC content, as if recorded by a real person on their iPhone. You MUST:

1. **Decide characters/people**: Based on the script, determine who should appear (age, gender, appearance, role, demographics) and make them feel authentic and relatable. Consider the target audience and make characters that would resonate with them.

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

4. **Decide camera angles**: For each scene, intelligently choose from these camera angles based on what fits the action:
   - **Selfie Camera**: Use when the character is holding the phone themselves (selfie-style). Natural shaky camera movements, MORE PRONOUNCED when there's character movement or action.
   - **Frontal Camera**: Use for POV (Point of View) perspective - the character is NOT visible, only their perspective. Use when script mentions "POV" or first-person actions.
   - **Steady**: Use when the phone is placed in a fixed position (on a table, shelf, etc.) recording the characters in third person. Use when character needs both hands or cannot hold the phone.

5. **Decide dialogue mode**: For each scene, intelligently determine:
   - **Lip Sync**: true if character should visibly speak the words (character's mouth moves to match dialogue)
   - **Voiceover**: true if voice should play over actions without visible speech (character doesn't move mouth, voice plays over scene)
   - **No Dialogue**: true if scene should have no dialogue/speech at all

6. **Decide duration**: Estimate appropriate duration in seconds (1-15) for each scene based on script length and pacing. Default to 1 if not specified.

7. **Maintain 100% hyperrealism**: The video must look exactly like real iPhone-recorded content with:
   - Natural handheld camera movements (slight shake, imperfect zoom, quick pan, authentic mobile recording aesthetic)
   - Enhanced shaky camera when Selfie Camera is selected AND there's character movement or action
   - Authentic mobile phone grain and noise typical of iPhone cameras
   - Realistic shadows with proper falloff, authentic density, and natural softness
   - Photorealistic lighting with natural diffusion and authentic color temperature
   - Hyperrealistic textures (skin with pores, fabric with visible weave, product surfaces with authentic material details)
   - iPhone camera characteristics (natural color science, realistic depth of field, authentic exposure, slight lens distortion)
   - Real-world imperfections (motion blur, focus breathing, chromatic aberration, lens flare when appropriate)
   - **CRITICAL - NO BACKGROUND BLUR**: The background MUST be completely sharp and in focus, exactly as iPhone cameras record in vertical/portrait mode. NEVER apply blur, bokeh, or depth of field effects to the background. The entire scene (foreground, subject, and background) must be equally sharp and focused, as if recorded with an iPhone in standard camera mode. This is essential for authentic UGC realism.
   - **CRITICAL - NATURAL CHARACTER EXPRESSIONS AND GESTURES**: Characters MUST have natural, organic expressions and gestures that feel completely authentic and human. They must NOT look like robots or static statues. Natural facial expressions, organic gestures, natural body movement, authentic reactions.

**CRITICAL HYPERREALISM REQUIREMENTS (MANDATORY):**
- **Ultra-realistic shadows**: Natural, soft shadows with proper falloff, realistic shadow edges, authentic shadow density and color that matches the light source
- **Photorealistic lighting**: Natural light behavior, realistic light diffusion, authentic light temperature and color casts, genuine light reflections and highlights
- **Hyperrealistic textures**: Every surface must show realistic material properties - skin texture with pores and natural imperfections, fabric textures with visible weave, product surfaces with authentic material details
- **iPhone camera characteristics**: Subtle mobile phone grain, natural iPhone color science, realistic depth of field, authentic exposure characteristics, slight lens distortion typical of iPhone cameras
- **CRITICAL - NO BACKGROUND BLUR (MANDATORY)**: The background MUST be completely sharp and in focus, exactly as iPhone cameras record in vertical/portrait mode. NEVER apply blur, bokeh, shallow depth of field, or any depth-of-field effects to the background. The entire scene (foreground, subject, and background) must be equally sharp and focused, as if recorded with an iPhone in standard camera mode. This is essential for authentic UGC realism - real iPhone recordings in vertical mode keep everything in focus.
- **Real-world imperfections**: Natural motion blur during movement, authentic focus breathing, realistic chromatic aberration in high contrast areas, genuine lens flare when appropriate
- **Environmental authenticity**: Realistic light interaction with surfaces, authentic material response to lighting, genuine atmospheric perspective, natural light scattering
- **Natural handheld movements**: The camera should feel like someone is holding their iPhone, with natural shake, imperfect movements, and authentic mobile recording aesthetic
- **Enhanced shaky camera**: When Selfie Camera is selected AND there's character movement or action, the camera shake MUST be MORE PRONOUNCED and REALISTIC, as if the person is genuinely holding the phone with their hand while moving

The goal is absolute photorealism - the video should be impossible to distinguish from a real iPhone recording. The background must be completely sharp, just like real iPhone footage.` : `
**PROFESSIONAL VIDEO MODE:**
Generate a professional video prompt with high production quality. Focus on clear storytelling, good composition, and professional aesthetics.`;

    const productImageNote = productImageFile 
      ? (productPhotoWillBeAttached 
          ? '**CRITICAL - PRODUCT IMAGE**: You have access to a product image that WILL BE ATTACHED to the final video generation. Analyze it carefully and incorporate its visual details (colors, materials, textures, design, branding) into the prompt. Reference it as "the product shown in the attached image" or "the product from the attached image" throughout your prompts.'
          : '**CRITICAL - PRODUCT IMAGE**: You have access to a product image. Analyze it carefully and incorporate its visual details (colors, materials, textures, design, branding) into the prompt. Reference it as "the product" throughout your prompts.')
      : '';

    const generationPrompt = `You are an expert AI prompt engineer specializing in ${isUGC ? 'hyperrealistic UGC (User-Generated Content)' : 'professional'} video prompts. Your task is to analyze a script and create complete, ready-to-use video prompts formatted as scenes.

**User's Script:**
${script}

${productImageNote}

${ugcInstructions}
${ugcCameraModeInstructions}

**Your Task:**
Analyze the script and break it down into logical scenes. For EACH scene, you MUST:
1. **Distribute the script** across scenes intelligently - determine which parts of the script belong to which scene
2. **Choose ALL parameters automatically**:
   - **Composition**: Choose 1-2 from: "UGC Close-up", "Product in Real Use", "Everyday Life", "Authentic Unboxing"
   - **Camera Angle**: Choose 1-2 from: "Selfie Camera", "Frontal Camera", "Steady" (use "Frontal Camera" if POV is mentioned)
   - **Lighting**: Choose ONE from: "Night Outside", "Day Outside", "Artificial Light Inside", "Natural Light Inside"
   - **Duration**: Estimate appropriate duration in seconds (1-15) based on script length for that scene
   - **Dialogue Mode**: Determine if it's lipSync, voiceover, or noDialogue based on the script content
3. **Generate a detailed Action description** for each scene that includes:
   - Character description (age, gender, appearance, clothing)
   - What's happening in the scene
   - Camera angle and composition details
   - Lighting details
   - Hyperrealistic UGC characteristics
   - Script integration (how the script is spoken - lip sync, voiceover, or no dialogue)
   - All technical details (shadows, textures, iPhone characteristics, etc.)

**CRITICAL OUTPUT FORMAT:**
You MUST respond with scenes formatted EXACTLY like this example:

Scene 1:
- Action: A hyperrealistic UGC video captures a fit woman in her late 20s with a sleek ponytail and athletic wear walking along a sunny urban sidewalk, recorded as an authentic handheld selfie with natural iPhone camera shakes and 100% visual clarity. The scene features bright daytime outdoor lighting with hyperrealistic soft shadows and photorealistic skin textures, ensuring the entire background remains completely sharp and in focus without any blur or bokeh. As she moves with a confident stride through the photorealistic street environment, a voiceover narrates, "right now im going to the gym, i want to show you guys something," while the woman looks directly into the lens with a natural, closed-mouth expression and no visible speech. The composition utilizes a medium selfie angle with realistic environmental light scattering and genuine iPhone color science, creating an indistinguishable real-world recording with authentic material response and sharp, high-density detail across all surfaces.

Scene 2:
- Action: Hyperrealistic iPhone POV close-up in a sun-drenched gym where the camera captures the character's first-person perspective grabbing the product shown in the attached image. Authentic handheld motion with natural jitter emphasizes the UGC aesthetic as a hand reaches into the frame, showing photorealistic skin textures and pores. The scene is bathed in natural indoor light from large windows, creating soft, ultra-realistic shadows and genuine light diffusion across the gym equipment in the background, which remains entirely sharp and in focus without any blur. While the character remains silent, a voiceover narrates, 'this is my new creatine and it saved my life completely,' precisely as the product shown in the attached image is lifted and inspected closely. The visual remains crisp with subtle mobile grain and photorealistic material textures, ensuring a 100% authentic, clear background throughout the 5-second duration.

Scene 3:
- Action: This final hyperrealistic 5-second UGC scene transitions to a POV Frontal Camera perspective using natural indoor window light, showing the fit woman's hands as she uses the product from the attached image in a Product in Real Use composition. The entire frame remains perfectly sharp with no background blur, capturing photorealistic textures of the skin and surfaces under soft, ultra-realistic shadows. As the voiceover narration says, "I'm feeling stronger and my performance has improved," the camera cuts to a Steady, fixed-position shot representing the phone placed on a counter for an Everyday Life moment. She is now visible in full-frame, showcasing her athletic gym outfit with visible fabric weave and authentic material response. The woman performs a quick, confident adjustment of her clothes and gives a subtle, knowing look toward the camera—without moving her lips—as the narration concludes, "you're missing out if you don't buy this," all rendered with authentic iPhone color science and subtle handheld grain.

**CRITICAL REQUIREMENTS:**
- **MANDATORY**: Each scene must start with "Scene X:" followed by "- Action:"
- **MANDATORY**: Each Action must be a single, detailed paragraph (no line breaks within the Action)
- **MANDATORY**: Include ALL hyperrealistic UGC details in each Action
- **MANDATORY**: Integrate the script naturally into each scene (specify if it's voiceover, lip sync, or no dialogue)
- **MANDATORY**: Reference the product image if provided (use "the product shown in the attached image" or "the product from the attached image")
- **MANDATORY**: Include camera angle, composition, lighting, and all technical details in the Action description
- **MANDATORY**: Ensure background is always sharp and in focus (no blur)
- **MANDATORY**: Include natural character expressions and gestures (not robotic)
- **MANDATORY**: If Selfie Camera is used with movement, emphasize enhanced shaky camera
- ${isUGC && ugcCameraMode === 'gimbal' ? '**MANDATORY (Gimbal mode)**: Keep movement smooth and stabilized; avoid any shake/jitter language.' : '**MANDATORY (Selfie mode)**: Emphasize authentic handheld selfie movement and natural shake.'}
- **MANDATORY**: Generate 1-5 scenes based on script complexity and natural breaks
- **MANDATORY**: All content must be in English
- **MANDATORY**: Each scene should be self-contained and complete

**Important:**
- Distribute the script intelligently across scenes - don't cram everything into one scene
- Choose parameters that best fit each scene's narrative purpose
- Maintain consistency in character, location, and style across scenes
- Make each Action description extremely detailed and hyperrealistic`;

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

    // Validate that the generated prompt is not just the input script
    const scriptLower = script.toLowerCase().trim();
    const promptLower = generatedText.toLowerCase().trim();
    
    // Check if the generated prompt is too similar to the input (likely means AI just echoed the input)
    if (promptLower.includes(scriptLower) && promptLower.length < scriptLower.length * 2) {
      console.error('Generated prompt appears to be just the input script. Prompt:', generatedText.substring(0, 200));
      return NextResponse.json(
        { error: 'AI returned input instead of generating prompt. Please try again.' },
        { status: 500 }
      );
    }

    // Ensure the prompt contains scene markers (indicates it was actually generated)
    if (!generatedText.includes('Scene') && !generatedText.includes('scene')) {
      console.error('Generated prompt does not contain scene markers. Prompt:', generatedText.substring(0, 200));
      return NextResponse.json(
        { error: 'Generated prompt does not match expected format. Please try again.' },
        { status: 500 }
      );
    }

    // Credit already consumed in verifyAndConsumeCredit

    return NextResponse.json({
      success: true,
      prompt: generatedText
    });
  } catch (error: any) {
    console.error('Error generating video prompt from script:', error);
    
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'API configuration error. Please check your environment variables.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate video prompt from script' },
      { status: 500 }
    );
  }
}

