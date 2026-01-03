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
    const rateLimitResult = await checkRateLimit('enhancePrompt', request);
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
    const { actionText, compositions, composition, lighting, duration, mainStyle, productFocus, allScenes, currentSceneIndex, productImage } = body;

    // Support both old format (single composition) and new format (array of compositions)
    const compositionArray = compositions || (composition ? [composition] : []);

    // Handle product image upload if provided
    let productImageFile = null;
    if (productImage) {
      try {
        console.log('Uploading product image to Gemini Files...');
        const productBuffer = Buffer.from(productImage.split(',')[1], 'base64');
        let productMime = productImage.split(';')[0].split(':')[1] || 'image/png';
        
        // Convert unsupported formats to PNG (Gemini supports: image/png, image/jpeg, image/webp, image/gif)
        const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        if (!supportedFormats.includes(productMime.toLowerCase())) {
          console.log(`Converting unsupported format ${productMime} to PNG`);
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
        
        const waitForFile = async (file: any, fileName: string) => {
          if (file.state === 'ACTIVE') return file;
          
          while (file.state !== 'ACTIVE') {
            if (Date.now() - startTime > maxWaitTime) {
              throw new Error(`Timeout waiting for product image to be ready`);
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
        
        const productFileName = productImageFile.name || productImageFile.uri?.split('/').pop() || '';
        if (productFileName) {
          productImageFile = await waitForFile(productImageFile, productFileName);
          if (!productImageFile.uri) {
            return NextResponse.json(
              { error: 'Product image file is missing required URI property' },
              { status: 500 }
            );
          }
        }
      } catch (uploadError: any) {
        console.error('Error uploading product image:', uploadError);
        return NextResponse.json(
          { error: 'Error uploading product image', details: uploadError.message },
          { status: 500 }
        );
      }
    }

    if (!actionText || !compositionArray || compositionArray.length === 0 || !lighting) {
      return NextResponse.json(
        { error: 'Action text, at least one composition, and lighting are required' },
        { status: 400 }
      );
    }

    // Extract person and location from first scene if available
    let consistencyRules = '';
    if (allScenes && Array.isArray(allScenes) && allScenes.length > 0 && currentSceneIndex !== undefined) {
      const firstScene = allScenes[0];
      if (firstScene && firstScene.action) {
        consistencyRules = `\n\n**CRITICAL CONSISTENCY RULES (MANDATORY):**
1. **SAME PERSON**: You MUST maintain the exact same person across ALL scenes. If the first scene describes a person (their appearance, age, gender, clothing, etc.), you MUST use the SAME person description in this scene. Do NOT change the person's characteristics unless explicitly stated in the action text.

2. **SAME LOCATION**: If the first scene (Scene 1) takes place in a specific location (e.g., "in a car", "at home", "in a kitchen", "outdoors", etc.), you MUST keep the SAME location in this scene UNLESS the current action text explicitly states a different location. Only change locations if the user explicitly mentions a location change in the action text.

3. **CONTEXT FROM FIRST SCENE**: 
   - First scene action: "${firstScene.action}"
   - Extract and maintain: person description, location, environment, and any key visual elements from the first scene.
   - Apply these consistently to the current scene unless explicitly overridden in the action text.

**Current Scene Index**: ${currentSceneIndex + 1} of ${allScenes.length}`;
      }
    }

    // Crear prompt para Gemini que mejore el texto con los parámetros de cámara e iluminación
    const compositionsList = compositionArray.length === 1 
      ? compositionArray[0]
      : compositionArray.join(', ');
    
    const compositionInstructions = compositionArray.length > 1
      ? `\n\n**CRITICAL COMPOSITION DISTRIBUTION TASK:**
You have been provided with MULTIPLE camera compositions that should be intelligently distributed throughout the action described. Your task is to analyze the action text and determine WHEN and WHERE each composition should be applied based on the logical flow of the action.

Available compositions:
${compositionArray.map((comp: string, idx: number) => `${idx + 1}. ${comp}`).join('\n')}

**Your job:** Read the action text carefully and identify different moments or phases within the same scene. Then, assign the most appropriate composition to each moment. For example:
- If the action is "person grabs the product and then consumes it", you might use "Everyday Life" for the grabbing moment and "Product in Real Use" for the consumption moment.
- If the action has multiple phases or transitions, distribute the compositions logically across those phases.

**Important:** 
- You must seamlessly transition between compositions within the same continuous scene
- The distribution should feel natural and logical based on the action described
- Incorporate the composition details at the appropriate moments in your enhanced prompt
- Make it clear which composition applies to which part of the action through your descriptive language`
      : '';

    // Get total number of scenes to adjust conciseness
    const totalScenes = allScenes && Array.isArray(allScenes) ? allScenes.length : 1;
    
    // Conciseness instructions based on total scenes
    const concisenessInstructions = totalScenes > 1
      ? `\n\n**CRITICAL CONCISENESS REQUIREMENT:**
This is scene ${currentSceneIndex !== undefined ? currentSceneIndex + 1 : 1} of ${totalScenes} total scenes. You MUST be more concise than usual while maintaining full power and detail:

- **For 2-3 scenes**: Be concise but comprehensive. Use efficient, high-impact language. Combine related details into single phrases. Avoid redundancy. Target: ~100-120 words per scene.

- **For 4-5 scenes**: Be significantly more concise. Use compact, dense descriptions. Merge multiple details into single clauses. Prioritize essential elements. Target: ~70-90 words per scene.

- **For 5+ scenes**: Be extremely concise. Use maximum density. Combine all related information into tight phrases. Focus only on critical visual and narrative elements. Target: ~50-70 words per scene.

**Your task**: Maintain ALL the power, detail, and authenticity requirements, but express them with maximum efficiency. Every word must carry maximum weight. Use compound adjectives, merged clauses, and efficient phrasing. The prompt must be shorter but equally powerful and detailed.`
      : '';

    // Duration-based instructions
    const durationInstructions = duration && duration > 0
      ? `\n\n**CRITICAL DURATION CONSTRAINT:**
This scene has a duration of **${duration} seconds**. You MUST adjust your prompt accordingly:

- **For short durations (1-3 seconds)**: Focus on a single, impactful moment. Use concise, high-impact descriptions. Prioritize the most essential visual elements. Keep the action description tight and focused on one key action or moment.

- **For medium durations (4-10 seconds)**: Balance detail with pacing. Include 2-3 key moments or actions. Allow for natural transitions between actions. Provide enough detail for visual richness without overwhelming the timeframe.

- **For longer durations (11+ seconds)**: You can include more detailed descriptions, multiple actions, transitions, and richer visual storytelling. Include more nuanced details about movements, expressions, and environmental elements. Allow for a more complete narrative arc within the scene.

**Your task**: Adjust the density and pacing of your prompt description to match the ${duration}-second duration. Ensure the action described can realistically unfold within this timeframe. If the action is too complex for the duration, simplify it. If the duration allows for more detail, enrich the description appropriately. The prompt should feel neither rushed (too much action for the time) nor stretched (too little action for the time).`
      : '';

    // Check if "UGC Close-up" is in the compositions
    const hasUgcCloseUp = compositionArray.some((comp: string) => 
      comp.toLowerCase().includes('ugc close') || comp.toLowerCase().includes('close-up')
    );

    // UGC Close-up specific instructions
    const ugcCloseUpInstructions = hasUgcCloseUp
      ? `\n\n**UGC CLOSE-UP MODE (ACTIVE):**
Since "UGC Close-up" composition is selected, you MUST focus the shot on the product or person in extreme close-up detail. Use shallow depth of field, sharp focus on textures and details, natural shaky camera movements typical of mobile close-up shots, and emphasize the intimate, detailed view of the product or person. The close-up should feel authentic and spontaneous, as if someone is naturally zooming in with their iPhone to show details.`
      : `\n\n**UGC SCENE COMPOSITION (NO CLOSE-UP):**
Since "UGC Close-up" is NOT selected, you MUST show the product and person together in the scene as a whole, maintaining a natural wide-to-medium shot that captures the complete scene context. DO NOT focus exclusively on the product or person in close-up. Instead, show them integrated naturally within the environment, maintaining the full scene context. The shot should feel like a natural, casual mobile recording that captures the entire scene organically, as if recorded from the iPhone of the AI avatar. Keep everything visible together in the frame, respecting the natural composition of the scene while maintaining 100% UGC hyperrealism.`;

    // Lighting-specific instructions for hyperrealistic UGC
    const lightingInstructions = lighting
      ? (() => {
          const lightingLower = lighting.toLowerCase();
          const hyperrealismBase = `\n\n**CRITICAL HYPERREALISM REQUIREMENTS (APPLIES TO ALL LIGHTING):**
The video MUST maintain 100% hyperrealism in ALL aspects, making it indistinguishable from a real iPhone-recorded video:
- **Ultra-realistic shadows**: Natural, soft shadows with proper falloff, realistic shadow edges, authentic shadow density and color that matches the light source
- **Hyperrealistic lighting**: Natural light behavior, realistic light diffusion, authentic light temperature and color casts, genuine light reflections and highlights
- **Photorealistic textures**: Every surface must show realistic material properties - skin texture with pores and natural imperfections, fabric textures with visible weave, product surfaces with authentic material details, all textures must look completely real
- **iPhone camera characteristics**: Subtle mobile phone grain, natural color science typical of iPhone cameras, realistic depth of field with natural bokeh, authentic exposure characteristics, slight lens distortion typical of phone cameras
- **Real-world imperfections**: Natural motion blur during movement, authentic focus breathing, realistic chromatic aberration in high contrast areas, genuine lens flare when appropriate
- **Environmental authenticity**: Realistic light interaction with surfaces, authentic material response to lighting, genuine atmospheric perspective, natural light scattering
The goal is absolute photorealism - the video should be impossible to distinguish from a real iPhone recording. Every shadow, light, texture, and detail must be hyperrealistic.`;
          
          if (lightingLower.includes('night outside')) {
            return `${hyperrealismBase}\n\n**LIGHTING: NIGHT OUTSIDE (HYPERREALISTIC UGC):**
The lighting MUST be authentic nighttime outdoor lighting as if someone is genuinely recording outside at night with their iPhone. Include: streetlights and car headlights visible in background with realistic light falloff and authentic shadows, natural moonlight casting soft, hyperrealistic shadows with proper edge softness, realistic iPhone recording at night with authentic grain, natural noise, and lower exposure typical of nighttime smartphone footage, warm artificial lights from buildings or streetlamps with realistic color temperature and light diffusion, authentic night atmosphere with hyperrealistic light interaction. The video should look exactly like real nighttime footage recorded on an iPhone - not professional lighting, but genuine iPhone night recording with all its characteristic qualities (authentic grain, natural noise, realistic exposure, hyperrealistic shadows with proper density and softness, genuine light sources with realistic falloff, etc.). Every shadow must be hyperrealistic with natural softness and proper density. Every light source must have realistic diffusion and color temperature.`;
          } else if (lightingLower.includes('day outside')) {
            return `${hyperrealismBase}\n\n**LIGHTING: DAY OUTSIDE (HYPERREALISTIC UGC):**
The lighting MUST be authentic daytime outdoor lighting as if someone is genuinely recording outside during the day with their iPhone. Include: bright and clear natural sunlight with hyperrealistic light diffusion and realistic color temperature, ultra-realistic shadows cast by natural light with proper edge softness, authentic density, and natural shadow color, authentic iPhone recording during daytime with natural color science typical of iPhone cameras, genuine outdoor ambient lighting with realistic light scattering, slight overexposure in bright areas typical of iPhone cameras with authentic highlight rolloff, hyperrealistic light interaction with all surfaces. The video should look exactly like real daytime footage recorded on an iPhone - not professional lighting, but genuine iPhone day recording with all its characteristic qualities (natural shadows with hyperrealistic softness and density, bright sunlight with realistic diffusion, slight overexposure in highlights with authentic rolloff, etc.). Every shadow must be hyperrealistic. Every light interaction must be photorealistic.`;
          } else if (lightingLower.includes('artificial light inside')) {
            return `${hyperrealismBase}\n\n**LIGHTING: ARTIFICIAL LIGHT INSIDE (HYPERREALISTIC UGC - CRITICAL):**
The lighting MUST be authentic indoor artificial lighting as if someone is genuinely recording inside with artificial lights using their iPhone, while maintaining ABSOLUTE HYPERREALISM in shadows, lights, and textures. Include: 
- **Hyperrealistic artificial light sources**: Warm or cool LED/incandescent lights with realistic color temperature, authentic light diffusion, genuine light falloff, natural light intensity distribution
- **Ultra-realistic shadows**: Natural shadows from indoor lights with proper edge softness, authentic shadow density that matches the light source, realistic shadow color (warm shadows from warm lights, cool shadows from cool lights), natural shadow falloff and softness
- **Photorealistic textures**: Every surface must show hyperrealistic material properties - skin with natural pores and imperfections under artificial light, fabrics with visible texture and realistic light interaction, product surfaces with authentic material details, all textures must respond realistically to the artificial light
- **Authentic iPhone recording**: Genuine iPhone color science under artificial lighting, realistic color cast from artificial light sources, natural exposure characteristics, subtle mobile phone grain, authentic depth of field
- **Realistic indoor ambient light**: Natural light interaction with indoor surfaces, authentic material response to artificial lighting, genuine atmospheric perspective, realistic light scattering in indoor environment
- **Real-world imperfections**: Natural motion blur, authentic focus characteristics, realistic chromatic aberration, genuine lens characteristics typical of iPhone cameras
The video should look exactly like real indoor footage recorded on an iPhone with artificial lighting - not professional lighting, but genuine iPhone indoor recording with ABSOLUTE HYPERREALISM. Every shadow must be hyperrealistic with natural softness, proper density, and authentic color. Every light must have realistic diffusion, color temperature, and falloff. Every texture must be photorealistic and respond authentically to the artificial light. The goal is to make it impossible to distinguish from a real iPhone recording.`;
          } else if (lightingLower.includes('natural light inside')) {
            return `${hyperrealismBase}\n\n**LIGHTING: NATURAL LIGHT INSIDE (HYPERREALISTIC UGC):**
The lighting MUST be authentic indoor natural lighting as if someone is genuinely recording inside near a window with their iPhone, maintaining absolute hyperrealism. Include: natural window light streaming indoors with hyperrealistic light diffusion and realistic color temperature, soft diffused daylight through windows with authentic light falloff, ultra-realistic indoor natural lighting with proper light scattering, authentic iPhone recording indoors with natural light showing genuine iPhone color science, hyperrealistic shadows from window light with natural edge softness, proper density, and authentic shadow color, bright and airy atmosphere with realistic atmospheric perspective. The video should look exactly like real indoor footage recorded on an iPhone near a window - not professional lighting, but genuine iPhone indoor recording with natural window light and all its characteristic qualities (soft diffused light with hyperrealistic diffusion, window shadows with ultra-realistic softness and density, bright and airy feel with authentic light interaction, etc.). Every shadow must be hyperrealistic. Every light interaction must be photorealistic.`;
          }
          return hyperrealismBase;
        })()
      : '';

    const productImageInstructions = productImageFile ? `\n\n**CRITICAL - PRODUCT IMAGE ATTACHED (MANDATORY ENHANCEMENT):**
A product image has been attached. You MUST:
- **CRITICAL: You MUST generate an ENHANCED prompt, NOT return the original action text**
- **Analyze the attached product image** to understand the exact product appearance, colors, materials, textures, design, branding, and all visual details
- **Base your prompt on the attached product image** - use it as a reference to describe the product accurately in your enhanced prompt
- **Maintain consistency with the image** - if the image shows specific product details (colors, materials, design elements, branding, etc.), incorporate those exact details into your prompt
- **Reference the image explicitly** - In your enhanced prompt, explicitly mention that the product should match the attached image, including its appearance, colors, materials, and visual characteristics
- **Accurate product description** - Ensure the product description in your prompt accurately reflects what is shown in the attached image
- **MANDATORY: You MUST enhance and expand the action text with detailed product descriptions based on the image. DO NOT simply return the original action text. You MUST create a comprehensive, detailed prompt that incorporates product details from the image.**
- **If you return the original action text unchanged, you have FAILED the task. You MUST enhance it with product details, visual descriptions, and all the technical requirements.**` : '';

    const enhancementPrompt = `Act as a *Senior Prompt Engineer specializing in AI Hyperrealism and User-Generated Content (UGC)*. Your goal is to transform the basic action idea and user parameters into a single, high-density text prompt, ready for copy-pasting.

**CRITICAL REQUIREMENT - YOU MUST ENHANCE THE PROMPT:**
- You MUST enhance, expand, and enrich the [ACTION TEXT TO ENHANCE] - DO NOT return it unchanged
- You MUST incorporate all technical details, visual descriptions, and requirements
- You MUST create a comprehensive, detailed prompt that is significantly more detailed than the original action text
- If you return the original action text unchanged or with minimal changes, you have FAILED the task
- The enhanced prompt must be a complete, professional prompt ready for AI video generation

**Main Task:** Enhance, enrich, and condense the [ACTION TEXT TO ENHANCE] by fluently and professionally incorporating all [CAMERA AND LIGHTING DETAILS] along with the following information:
- Main style: ${mainStyle || 'Hyperrealistic UGC, Mobile Aesthetic'}
- Product Focus: ${productFocus || 'Authenticity and Emotional Connection'}
${consistencyRules}${compositionInstructions}${concisenessInstructions}${durationInstructions}${ugcCloseUpInstructions}${lightingInstructions}${productImageInstructions}

**CRITICAL DEFAULT INSTRUCTION - CAMERA POSITION (PRIORITIZE HYPERREALISM):**
**DEFAULT BEHAVIOR - HANDHELD SELFIE (PRIORITY):**
By default, the video should look as if the person is **holding the phone/camera themselves** (selfie-style). This means:
- The person is holding the camera/phone and recording themselves while doing the actions
- The person is narrating, talking, and showing things directly to the camera as they perform the actions
- Everything happens from the first-person perspective of the person recording themselves
- The camera angle should be as if the person is holding their phone in front of them, showing themselves and the product/actions
- Natural handheld camera movements: slight shake, imperfect zoom, quick pan - all authentic to iPhone recording
- The person is actively engaging with the camera, speaking to it, demonstrating, and showing things directly to the viewer
- The video should feel like authentic selfie-style content where the creator is both the performer and the videographer

**ADAPTIVE BEHAVIOR - FIXED CAMERA POSITION (WHEN SITUATION REQUIRES IT):**
**CRITICAL:** You MUST analyze the action text to determine if the situation requires the person to use BOTH HANDS or be in a position where they CANNOT hold the phone. If the action described requires:
- Using both hands simultaneously (e.g., cooking, exercising, working with tools, applying products with both hands, etc.)
- Being in a position where holding a phone is impractical (e.g., lying down, in certain exercises, hands occupied, etc.)
- Any situation where holding the phone would be unrealistic or interfere with the action

Then you MUST adapt the prompt to reflect a **fixed camera position** while maintaining absolute hyperrealism:
- Describe the camera as if it's placed on a surface (e.g., "as if the phone was left recording on a counter/shelf/table")
- Maintain the same first-person perspective and authentic iPhone recording aesthetic
- Keep all hyperrealistic details (lighting, shadows, textures, movements, gestures)
- The video should still look like authentic UGC content, just with the phone in a fixed position
- Natural camera characteristics: authentic iPhone recording, realistic lighting, genuine mobile phone aesthetic
- The person can still interact with the camera (looking at it, talking to it) but the phone itself is stationary

**PRIORITY: HYPERREALISM FIRST**
- **ALWAYS prioritize maximum hyperrealism** in movements, lighting, textures, gestures, shadows, and all visual elements
- Whether handheld or fixed position, the video must look 100% authentic and hyperrealistic
- Every detail must be photorealistic: natural movements, realistic lighting, authentic textures, genuine gestures
- The camera position (handheld vs fixed) should serve the hyperrealism and authenticity of the scene, not compromise it

**EXPLICIT OVERRIDES:**
If the user EXPLICITLY states camera position preferences (e.g., "third person view", "someone else recording", "external camera", "not selfie", "phone on tripod", "phone on table", etc.), follow their explicit instructions while maintaining absolute hyperrealism.

The final output must be strictly a single, continuous paragraph, without line breaks, interweaving the action, product focus, technical composition, and visual aesthetics to create a cohesive and powerful instruction. The prompt's focus must ensure the video looks **100% authentic and hyperrealistic**, as if it were recorded by a real person on their iPhone, emphasizing:

**HYPERREALISM REQUIREMENTS (MANDATORY):**
- **Ultra-realistic shadows**: Natural, soft shadows with proper falloff, realistic shadow edges, authentic shadow density and color
- **Photorealistic lighting**: Natural light behavior, realistic light diffusion, authentic light temperature and color casts, genuine light reflections and highlights
- **Hyperrealistic textures**: Every surface must show realistic material properties - skin texture with pores and natural imperfections, fabric textures with visible weave, product surfaces with authentic material details, all textures must look completely real and respond authentically to lighting
- **iPhone camera characteristics**: Subtle mobile phone grain, natural iPhone color science, realistic depth of field with natural bokeh, authentic exposure characteristics, slight lens distortion typical of iPhone cameras
- **Real-world imperfections**: Natural motion blur during movement, authentic focus breathing, realistic chromatic aberration in high contrast areas, genuine lens flare when appropriate
- **Environmental authenticity**: Realistic light interaction with surfaces, authentic material response to lighting, genuine atmospheric perspective, natural light scattering

**AUTHENTICITY REQUIREMENTS:**
- **Spontaneity**: Natural, unscripted feel
- **Natural handheld camera movements**: Slight shake, imperfect zoom, quick pan - all authentic to iPhone recording
- **Subtle mobile grain**: Authentic iPhone camera grain and noise characteristics
- **Genuine ambient lighting**: Without professional artifices, exactly as iPhone cameras capture real-world lighting

The goal is to simulate the maximum authenticity and credibility of real-life, non-POV user-generated content with ABSOLUTE HYPERREALISM. The video should be impossible to distinguish from a real iPhone recording. Every shadow, light, texture, and detail must be hyperrealistic and photorealistic. **CRITICAL PROHIBITION - NO TEXT OVERLAY: You MUST NOT include, mention, or suggest ANY text overlay, on-screen text, captions, subtitles, or any text appearing in the video. Text overlays always look bad in generated videos. The prompt must describe ONLY visual elements, actions, camera movements, lighting, and composition - NO TEXT, NO CAPTIONS, NO SUBTITLES, NO ON-SCREEN TEXT OF ANY KIND.**

[ACTION TEXT TO ENHANCE]: ${actionText}

[CAMERA AND LIGHTING DETAILS TO INCORPORATE]:
- Camera composition(s): ${compositionsList}
- Lighting/Ambience: ${lighting}
${duration ? `- Scene Duration: ${duration} seconds` : ''}

Respond ONLY with the enhanced text as a single continuous paragraph, without line breaks, without additional explanations or special formatting.`;

    // Llamar a Gemini 3 Flash Preview
    let result;
    try {
      // Build parts array - include image if provided
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
        text: enhancementPrompt
      });

      result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: parts
          }
        ]
      });
    } catch (geminiError: any) {
      console.error('Error calling Gemini:', geminiError);
      return NextResponse.json(
        { 
          error: 'Error enhancing prompt with Gemini',
          details: geminiError.message || 'Could not process request with AI'
        },
        { status: 500 }
      );
    }

    // Extraer el texto mejorado
    let enhancedText = null;
    try {
      if (result.candidates && result.candidates[0]?.content?.parts) {
        enhancedText = result.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('')
          .trim();
      } else if ((result as any).text) {
        enhancedText = (result as any).text.trim();
      }
      
      // Log para debugging
      console.log('Enhanced text extracted:', {
        hasText: !!enhancedText,
        textLength: enhancedText?.length || 0,
        textPreview: enhancedText?.substring(0, 100) || 'N/A',
        hasProductImage: !!productImageFile
      });
      
      // Si no se obtuvo texto mejorado
      if (!enhancedText || enhancedText === '') {
        console.warn('No enhanced text extracted from Gemini response');
        if (productImageFile) {
          // Si hay imagen de referencia, esto es un error crítico
          console.error('CRITICAL: Product image provided but no enhanced text returned');
          return NextResponse.json(
            { 
              error: 'Failed to enhance prompt with reference image',
              details: 'The AI did not return an enhanced prompt. Please try again.'
            },
            { status: 500 }
          );
        }
        // Solo usar fallback si NO hay imagen de referencia
        enhancedText = actionText;
      } else if (productImageFile && enhancedText === actionText) {
        // Si hay imagen de referencia pero el texto es idéntico al original, es un error
        console.error('CRITICAL: Product image provided but enhanced text is identical to original');
        return NextResponse.json(
          { 
            error: 'Failed to enhance prompt with reference image',
            details: 'The AI returned the original text instead of an enhanced prompt. Please try again.'
          },
          { status: 500 }
        );
      }
    } catch (err) {
      console.error('Error extracting text from response:', err);
      if (productImageFile) {
        // Si hay imagen de referencia, no usar fallback
        return NextResponse.json(
          { 
            error: 'Error processing enhanced prompt with reference image',
            details: (err as Error).message || 'Could not extract enhanced text from AI response'
          },
          { status: 500 }
        );
      }
      enhancedText = actionText; // Fallback to original text only if no image
    }

    // Extraer información de uso y calcular costo
    let usageInfo = null;
    let costInfo = null;
    try {
      // La respuesta de Gemini incluye usageMetadata
      const usageMetadata = (result as any).usageMetadata;
      if (usageMetadata) {
        const promptTokenCount = usageMetadata.promptTokenCount || 0;
        const candidatesTokenCount = usageMetadata.candidatesTokenCount || 0;
        const totalTokenCount = usageMetadata.totalTokenCount || (promptTokenCount + candidatesTokenCount);

        // Precios de Gemini 3 Flash Preview (por millón de tokens)
        // Input: $0.50 por millón de tokens
        // Output: $3 por millón de tokens
        const inputCostPerMillion = 0.5;
        const outputCostPerMillion = 3.0;

        const inputCost = (promptTokenCount / 1_000_000) * inputCostPerMillion;
        const outputCost = (candidatesTokenCount / 1_000_000) * outputCostPerMillion;
        const totalCost = inputCost + outputCost;

        usageInfo = {
          promptTokenCount,
          candidatesTokenCount,
          totalTokenCount
        };

        costInfo = {
          inputCost: inputCost,
          outputCost: outputCost,
          totalCost: totalCost,
          inputCostFormatted: `$${inputCost.toFixed(6)}`,
          outputCostFormatted: `$${outputCost.toFixed(6)}`,
          totalCostFormatted: `$${totalCost.toFixed(6)}`
        };

        // Log para debugging
        console.log('Token Usage:', usageInfo);
        console.log('Cost:', costInfo);
      }
    } catch (err) {
      console.error('Error extracting usage information:', err);
    }

    return NextResponse.json({
      success: true,
      originalText: actionText,
      enhancedText: enhancedText,
      compositions: compositionArray,
      lighting,
      usage: usageInfo
    });

  } catch (error: any) {
    console.error('Error enhancing prompt:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

