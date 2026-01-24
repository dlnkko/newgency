import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateImagePrompt', request);
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
    const { description, style, referenceImage, firstFrameFromVideo } = body;

    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    if (!style || !['hyperrealistic', 'studio-quality', 'design', 'copy-image'].includes(style)) {
      return NextResponse.json(
        { error: 'Valid style is required (hyperrealistic, studio-quality, design, or copy-image)' },
        { status: 400 }
      );
    }

    // Copy Image mode requires a reference image
    if (style === 'copy-image' && !referenceImage) {
      return NextResponse.json(
        { error: 'Reference image is required for Copy Image mode' },
        { status: 400 }
      );
    }

    // Handle reference image upload if provided (for design, studio-quality, hyperrealistic, and copy-image styles)
    let referenceImageFile = null;
    if (referenceImage && (style === 'design' || style === 'studio-quality' || style === 'hyperrealistic' || style === 'copy-image')) {
      try {
        console.log('Uploading reference image to Gemini Files...');
        const referenceBuffer = Buffer.from(referenceImage.split(',')[1], 'base64');
        let referenceMime = referenceImage.split(';')[0].split(':')[1] || 'image/png';
        
        // Convert unsupported formats to PNG (Gemini supports: image/png, image/jpeg, image/webp, image/gif)
        const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        if (!supportedFormats.includes(referenceMime.toLowerCase())) {
          console.log(`Converting unsupported format ${referenceMime} to PNG`);
          referenceMime = 'image/png';
        }
        
        const referenceUint8Array = new Uint8Array(referenceBuffer);
        const referenceBlob = new Blob([referenceUint8Array], { type: referenceMime });
        referenceImageFile = await ai.files.upload({
          file: referenceBlob,
          config: { mimeType: referenceMime }
        });
        console.log('Reference image uploaded:', referenceImageFile.uri);
        
        // Wait for file to be ACTIVE
        const maxWaitTime = 60000;
        const checkInterval = 2000;
        const startTime = Date.now();
        
        const waitForFile = async (file: any, fileName: string) => {
          if (file.state === 'ACTIVE') return file;
          
          while (file.state !== 'ACTIVE') {
            if (Date.now() - startTime > maxWaitTime) {
              throw new Error(`Timeout waiting for reference image to be ready`);
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
        
        const referenceFileName = referenceImageFile.name || referenceImageFile.uri?.split('/').pop() || '';
        if (referenceFileName) {
          referenceImageFile = await waitForFile(referenceImageFile, referenceFileName);
          if (!referenceImageFile.uri) {
            return NextResponse.json(
              { error: 'Reference image file is missing required URI property' },
              { status: 500 }
            );
          }
        }
      } catch (uploadError: any) {
        console.error('Error uploading reference image:', {
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
            error: 'Error uploading reference image', 
            details: uploadError.message || 'Could not upload the reference image to Gemini Files',
            ...(process.env.NODE_ENV === 'development' && {
              fullError: uploadError.toString(),
              stack: uploadError.stack
            })
          },
          { status: 500 }
        );
      }
    }

    // If reference image is provided, first generate a detailed prompt of the reference image
    let referenceImagePrompt = '';
    if (referenceImageFile) {
      console.log('Reference image file available:', {
        hasUri: !!referenceImageFile.uri,
        mimeType: referenceImageFile.mimeType,
        state: referenceImageFile.state
      });
      
      // Verify the file is ready before using it
      if (referenceImageFile.uri) {
        console.log('Generating detailed prompt for reference image...');
        try {
          const referenceImageAnalysisRequest = `You are an expert AI prompt engineer. Analyze the attached reference image and create a detailed, comprehensive prompt that would generate this exact image. 

**Your Task:**
Create an extremely detailed prompt that describes:
1. **Visual Style**: Is it hyperrealistic, studio-quality, design, illustration, etc.? Describe the exact aesthetic
2. **Lighting**: Type of lighting (natural, studio, artificial, flash, etc.), direction, intensity, color temperature, shadows, highlights
3. **Textures**: All surface textures visible (skin, fabric, materials, surfaces) - describe their appearance, quality, and characteristics
4. **Colors**: Color palette, color temperature, saturation, contrast, color harmony
5. **Composition**: Camera angle, framing, perspective, depth of field, focus
6. **Technical Details**: Image quality, resolution appearance, sharpness, grain/noise, post-processing style
7. **Atmosphere/Mood**: Overall feeling, mood, aesthetic quality
8. **All Visual Elements**: Every detail that makes this image unique - style, technique, visual characteristics

**Critical Requirements:**
- The prompt must be extremely detailed and comprehensive
- Describe the image as if you were going to generate this exact same image
- Include all technical and aesthetic details
- Be specific about lighting, textures, colors, composition, and style
- The prompt should capture everything that makes this image visually distinctive

**Output Format:**
Provide ONLY the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete prompt text that would generate this exact image.`;

          const referenceParts: any[] = [
            {
              fileData: {
                fileUri: referenceImageFile.uri,
                mimeType: referenceImageFile.mimeType || 'image/png'
              }
            },
            {
              text: referenceImageAnalysisRequest
            }
          ];

          const referenceResult = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
              {
                role: 'user',
                parts: referenceParts
              }
            ]
          });

          // Extract the reference image prompt
          if (referenceResult.candidates && referenceResult.candidates[0]?.content?.parts) {
            referenceImagePrompt = referenceResult.candidates[0].content.parts
              .map((part: any) => part.text || '')
              .join('')
              .trim();
          } else if ((referenceResult as any).text) {
            referenceImagePrompt = (referenceResult as any).text.trim();
          }

          if (referenceImagePrompt && referenceImagePrompt.length > 0) {
            console.log('Reference image prompt generated, length:', referenceImagePrompt.length);
          } else {
            console.warn('Reference image prompt generation returned empty result');
            referenceImagePrompt = '';
          }
        } catch (refError: any) {
          console.error('Error generating reference image prompt:', {
            message: refError.message,
            status: refError.status,
            code: refError.code,
            stack: process.env.NODE_ENV === 'development' ? refError.stack : undefined
          });
          // Continue without reference prompt if it fails - will use image directly as fallback
          referenceImagePrompt = '';
        }
      } else {
        console.warn('Reference image file URI is missing, skipping reference prompt generation');
      }
    }

    // Build style-specific instructions
    let styleInstructions = '';
    // Special mode: generate an image prompt that represents the first frame of a video prompt
    // This keeps the selected style, but reframes the task to "first frame still"
    if (firstFrameFromVideo === true) {
      styleInstructions += `

**FIRST FRAME FROM VIDEO PROMPT (VEO 3 MODE):**
You are given a description that is written like a video prompt (may include hook, concept, benefit, scenes). Your task is to convert this into a single IMAGE prompt that captures the very first frame/still of that video. The still image must:
- Communicate the exact opening hook or the strongest visual of the first scene
- Include all immediate visual elements present at the start (characters, product, setting, camera angle, lighting)
- Freeze a single, impactful moment (no motion words) while preserving the same style and narrative intent
- Keep only what would be visible in the very first frame – no time‑based actions or sequences

CRITICAL:
- Convert dynamic verbs into static visual states (e.g., "holding", "showing", "looking at", "close-up of", "on a table")
- Keep the same style you are asked to use (${style}), including lighting, composition, textures, color, and aesthetics
- If the description mentions a strong hook, the still must be the most attention‑grabbing visual moment of that hook
- If a product is central, the product must be clearly visible and well-lit in the frame
- No bullet points, no sections – deliver ONE single, continuous paragraph that describes the still image precisely`;
    }

    // CRITICAL: Analyze the prompt first to determine if it's UGC or not
    // If UGC is mentioned explicitly or implied, use iPhone/hyperrealistic UGC style
    // If NOT UGC, use the selected style but can be cinematographic, professional, etc.
    const ugcDetectionInstructions = `**CRITICAL - STYLE ANALYSIS (MUST DO FIRST):**
Before applying any style, you MUST analyze the user's description to determine if it is UGC (User-Generated Content) style or not:

**Analyze the description:**
"${description}"

**UGC Indicators (if ANY of these are present, it's UGC):**
- Explicitly mentions "UGC", "user-generated", "amateur", "home video", "casual", "iPhone video", "phone recording", "selfie style", "authentic user content"
- Mentions casual, homemade, authentic, real people, everyday life, natural settings
- Implies informal, unpolished, spontaneous content
- Mentions social media style, TikTok, Instagram story style
- Describes content that looks like someone casually recording with their phone

**NON-UGC Indicators (if description suggests professional, cinematic, or polished content):**
- Mentions "cinematic", "professional", "high production", "film", "cinematography", "cinema quality"
- Describes polished, staged, professional-looking content
- Mentions professional lighting, studio quality, commercial quality
- Implies high-budget, professional video production

**Your Decision:**
- IF UGC is detected (explicitly or implied): Use iPhone/hyperrealistic UGC style (see UGC section below)
- IF UGC is NOT detected: Use the selected style (${style}) but adapt it appropriately - can be cinematographic, professional, cinematic, or whatever best fits the description. DO NOT force iPhone/UGC characteristics if they're not appropriate.`;

    if (style === 'hyperrealistic') {
      const referenceImageNote = referenceImageFile && referenceImagePrompt ? `\n\n**CRITICAL - REFERENCE IMAGE PROMPT (USE AS STYLE REFERENCE):**
A reference image has been provided and analyzed. Below is a detailed prompt that describes the reference image's visual characteristics:

**Reference Image Prompt (use this as style reference):**
"${referenceImagePrompt}"

**Your Task:**
You MUST use the reference image prompt above to create a prompt that generates an image as CLOSE AS POSSIBLE to how the reference image looks. The reference image prompt describes EXACTLY how the reference image appears. Your job is to:

- **RESPECT THE REFERENCE IMAGE EXACTLY**: The reference image prompt describes the exact visual appearance of the reference image. You MUST respect and match:
  - **EXACT camera angle and perspective** from the reference (frontal, side, three-quarter, from above, from below, etc.)
  - **EXACT composition and framing** (close-up, medium shot, wide shot, etc.)
  - **EXACT lighting style** (same type, direction, intensity, color temperature, shadows, highlights)
  - **EXACT texture quality and appearance** (same level of detail, same material appearance)
  - **EXACT color palette** (same color temperature, saturation, contrast, color harmony)
  - **EXACT depth of field and focus** (same blur/sharpness characteristics)
  - **EXACT overall aesthetic and visual style** (same look and feel)
  
- **Apply to user's description**: While respecting the EXACT visual characteristics of the reference image, adapt the CONTENT to match what the user described: "${description}"
  - Keep the EXACT same camera angle, composition, lighting, textures, colors, and aesthetic from the reference
  - Change only the CONTENT/SUBJECT to match the user's description
  - The result should look like the reference image but with the content/subject the user requested

- **CRITICAL**: The generated prompt must describe an image that looks EXACTLY like the reference image in terms of:
  - Camera angle and perspective
  - Composition and framing
  - Lighting style and characteristics
  - Texture quality and appearance
  - Color palette and color characteristics
  - Overall aesthetic and visual style
  - But with the content/subject from the user's description

**Example**: If the reference image is a side view of a person with natural lighting, and the user describes "person exercising", the prompt should describe a side view of a person exercising with the EXACT same natural lighting, camera angle, composition, and aesthetic as the reference image.

**Important**: Match the reference image's visual characteristics EXACTLY - camera angle, composition, lighting, textures, colors, and aesthetic. Only adapt the content/subject to the user's description.` : referenceImageFile ? `\n\n**CRITICAL - REFERENCE IMAGE ATTACHED:**
A reference image has been attached. You MUST:
- **Analyze the attached reference image** to understand EXACTLY how it looks:
  - Camera angle and perspective (frontal, side, three-quarter, from above, from below, etc.)
  - Composition and framing (close-up, medium shot, wide shot, etc.)
  - Lighting style (type, direction, intensity, color temperature, shadows, highlights)
  - Texture quality and appearance
  - Color palette (color temperature, saturation, contrast, color harmony)
  - Depth of field and focus characteristics
  - Overall aesthetic and visual style
  - If there's a person: their appearance, facial features, hair, skin tone, body type, clothing style, and all physical characteristics

- **RESPECT THE REFERENCE IMAGE EXACTLY**: Your generated prompt must describe an image that looks EXACTLY like the reference image in terms of:
  - **EXACT camera angle and perspective** - match the reference image's camera angle precisely
  - **EXACT composition and framing** - match the reference image's framing and composition
  - **EXACT lighting style** - match the reference image's lighting characteristics
  - **EXACT texture quality** - match the reference image's texture appearance
  - **EXACT color palette** - match the reference image's colors
  - **EXACT depth of field** - match the reference image's focus/blur characteristics
  - **EXACT overall aesthetic** - match the reference image's visual style and look

- **Apply to user's description**: While respecting the EXACT visual characteristics of the reference image, adapt the CONTENT to match what the user described: "${description}"
  - Keep the EXACT same camera angle, composition, lighting, textures, colors, and aesthetic from the reference
  - Change only the CONTENT/SUBJECT to match the user's description
  - If the reference has a person and the user's description also involves a person: maintain the same person's appearance from the reference, but adapt them to the new action/environment described
  - The result should look like the reference image but with the content/subject the user requested

- **CRITICAL**: The generated prompt must create an image that looks EXACTLY like the reference image visually (angle, composition, lighting, textures, colors, aesthetic), but with the content/subject from the user's description.` : '';

      // Build style instructions based on UGC detection
      styleInstructions = `${ugcDetectionInstructions}

**HYPERREALISTIC STYLE REQUIREMENTS (APPLY BASED ON UGC DETECTION):**

**IF UGC IS DETECTED:**
You MUST generate a prompt that prioritizes ABSOLUTE HYPERREALISM with iPhone photography quality. The image must look like it was taken with an iPhone - indistinguishable from a real iPhone photo:

- **iPhone photography aesthetic**: The image must look exactly like it was captured with an iPhone camera - authentic iPhone color science, iPhone's characteristic depth of field, iPhone's natural image processing, iPhone's realistic skin tones and color reproduction
- **First-person or third-person perspective**: The image can be taken by the same person (first-person POV) or by someone else (third-person), but it must always look like an iPhone photo - natural, authentic, and realistic
- **iPhone camera characteristics**: 
  - Natural iPhone depth of field (slight background blur when appropriate)
  - iPhone's authentic color science and white balance
  - iPhone's realistic skin tone rendering
  - iPhone's natural sharpness and detail capture
  - iPhone's characteristic dynamic range
- **Flash photography when contextually appropriate**: If the scene requires it (low light, night scenes, indoor dark environments), include iPhone flash photography - the characteristic iPhone flash look with proper flash shadows, flash highlights, and flash color temperature
- **Ultra-realistic shadows**: Natural, soft shadows with proper falloff, realistic shadow edges, authentic shadow density and color that matches the light source (natural light or iPhone flash)
- **Hyperrealistic lighting**: Natural light behavior or iPhone flash lighting, realistic light diffusion, authentic light temperature and color casts, genuine light reflections and highlights
- **Photorealistic textures**: Every surface must show realistic material properties - skin texture with pores and natural imperfections (as captured by iPhone), fabric textures with visible weave, product surfaces with authentic material details, all textures must look completely real
- **Human facial features (CRITICAL)**: If the image includes human faces, facial features MUST be:
  - **Soft and realistic**: Facial features must look soft and natural, exactly as real human faces appear - not harsh, not overly sharp, not artificial
  - **Natural skin texture**: Skin must have soft, natural texture - smooth but not uniform, with subtle variations, natural pores, and realistic skin quality as seen in real people
  - **Realistic facial structure**: Facial features (eyes, nose, mouth, cheeks, jawline) must have the natural softness and subtlety of real human faces - not overly defined, not plastic-looking, not uniform
  - **Natural variations**: Skin texture must be non-uniform with natural variations in tone, texture, and detail - exactly as real human skin appears
  - **Hyperrealistic but natural**: Maximum realism while maintaining the natural softness and organic quality of real human faces
  - **Avoid artificial sharpness**: Facial features should NOT be overly sharp or uniform - they must look like real human faces with natural softness and realistic texture variations
- **Authentic colors**: iPhone's natural color science, realistic color temperature, genuine color reproduction as seen in real iPhone photos
- **Real-world details**: Natural imperfections, authentic material response to lighting, genuine atmospheric perspective, realistic depth of field (iPhone-style)
- **Maximum realism**: If the description mentions a person, environment, object, or anything - it must look 100% real, as if photographed with an iPhone in real life
- **No artificial elements**: Everything must look natural and authentic, as if it exists in the real world and was captured with an iPhone${referenceImageNote}

**CRITICAL - PERSON DETECTION AND CAMERA PERSPECTIVE:**
- **FIRST: Check if description mentions people/persons**: Analyze the user's description: "${description}"
  - If the description explicitly mentions people, persons, humans, individuals, or any human subjects (e.g., "person", "people", "man", "woman", "someone", "individual", etc.), then proceed with UGC style (see below)
  - If the description does NOT mention people/persons at all, then use THIRD-PERSON PERSPECTIVE WITHOUT PEOPLE (see below)

- **THIRD-PERSON PERSPECTIVE (NO PEOPLE MENTIONED)**: If the description does NOT mention people/persons:
  - The image must be taken from a third-person perspective (as if someone is photographing the scene/subject)
  - NO people should be visible in the image - only the subject/scene described
  - Natural iPhone photography angle - as if someone is taking a photo of the subject/scene
  - Example: "meal prep in kitchen" → Photo of meal prep in kitchen, taken by someone (third-person), but no people visible in the frame
  - Example: "product on table" → Photo of product on table, taken by someone (third-person), but no people visible
  - The perspective should feel natural, as if someone is documenting or photographing the subject
  - **CRITICAL - MUST MAINTAIN ALL HYPERREALISTIC REQUIREMENTS**:
    - **Ultra-realistic shadows**: Natural, soft shadows with proper falloff, realistic shadow edges, authentic shadow density and color that matches the light source (natural light or iPhone flash)
    - **Hyperrealistic lighting**: Natural light behavior or iPhone flash lighting, realistic light diffusion, authentic light temperature and color casts, genuine light reflections and highlights - exactly as an iPhone would capture it
    - **Photorealistic textures**: Every surface must show realistic material properties - fabric textures with visible weave, product surfaces with authentic material details, all textures must look completely real and hyperrealistic
    - **iPhone camera characteristics**: 
      - Natural iPhone depth of field (slight background blur when appropriate)
      - iPhone's authentic color science and white balance
      - iPhone's natural sharpness and detail capture
      - iPhone's characteristic dynamic range
    - **Authentic colors**: iPhone's natural color science, realistic color temperature, genuine color reproduction as seen in real iPhone photos
    - **Real-world details**: Natural imperfections, authentic material response to lighting, genuine atmospheric perspective, realistic depth of field (iPhone-style)
    - **Maximum realism**: Everything must look 100% real, as if photographed with an iPhone in real life - indistinguishable from a real iPhone photo
    - **No artificial elements**: Everything must look natural and authentic, as if it exists in the real world and was captured with an iPhone
  - iPhone camera quality and characteristics - the image must look exactly like it was taken with an iPhone, with all the hyperrealistic qualities of iPhone photography

- **CASUAL/AMATEUR STYLE (PEOPLE MENTIONED)**: If the description DOES mention people/persons:
  - **IMPORTANT**: The image should look like a casual, amateur, homemade photo taken with an iPhone - NOT always frontal/selfie style
  - **Camera angles**: Can be ANY angle or perspective that feels natural and casual:
    - Can be frontal (selfie style) if it fits naturally
    - Can be side view, profile, three-quarter view, from behind, from above, from below, or any other natural angle
    - Can be close-up, medium shot, wide shot, or any framing that feels natural
    - The angle should feel spontaneous and casual, like someone casually taking a photo with their iPhone
  - **Natural, casual aesthetic**: 
    - Should look like a real, casual photo taken by someone with their iPhone
    - Not overly posed or professional-looking
    - Natural, authentic, amateur/homemade quality
    - As if someone is casually documenting or capturing a moment
  - **User description priority**: Follow the user's description for the specific scene/action, and choose the most natural camera angle and framing that fits that scene
  - **No forced frontal**: Do NOT default to frontal/selfie style unless it naturally fits the description or the user explicitly requests it
  - **Reference image priority**: ${referenceImageFile && referenceImagePrompt ? 'If a reference image is provided, you MUST respect the EXACT camera angle, composition, and visual style from the reference image. The reference image prompt describes exactly how the reference looks - match that EXACTLY in terms of angle, composition, lighting, and aesthetic, but adapt the content to the user\'s description.' : 'Choose the most natural camera angle and framing that fits the scene described.'}
  - iPhone camera quality and characteristics - must look like a real iPhone photo taken casually

**iPhone Photography Quality Requirements:**
- Always specify "iPhone photography", "taken with iPhone", or "iPhone camera quality" in the prompt
- Include iPhone's characteristic image processing look
- Maintain iPhone's natural color science and white balance
- If flash is needed, specify "iPhone flash" or "iPhone camera flash"
- **Perspective clarification**:
  - If description mentions people: The image should look like a casual, amateur photo taken with an iPhone - can be ANY angle (frontal, side, three-quarter, from above, from below, etc.) that feels natural and casual. NOT always frontal/selfie style. Should feel like someone casually taking a photo with their iPhone.
  - If description does NOT mention people: The image should look like it was taken by someone with an iPhone in third-person perspective (as if someone is photographing the subject/scene), but NO people visible in the frame
  - **Reference image priority**: ${referenceImageFile && referenceImagePrompt ? 'If a reference image is provided, match the EXACT camera angle and perspective from the reference image. The reference image prompt describes exactly how the reference looks - respect that EXACTLY.' : 'Choose the most natural camera angle that fits the scene.'}

The goal is absolute photorealism with iPhone photography quality - the image should be impossible to distinguish from a real iPhone photograph. Every shadow, light, texture, color, and detail must be hyperrealistic and photorealistic, exactly as an iPhone would capture it.

**IF UGC IS NOT DETECTED:**
You MUST generate a prompt that prioritizes ABSOLUTE HYPERREALISM but with cinematic, professional, or high-production quality - NOT iPhone/UGC style. The image should look like it was captured with professional camera equipment (DSLR, cinema camera, etc.) - high-quality, polished, and professional:
- **Professional camera aesthetic**: The image must look like it was captured with professional camera equipment - cinematic color grading, professional depth of field, high-end image processing, professional color science
- **Cinematic or professional quality**: Based on the description, choose the most appropriate style:
  - **Cinematic**: If the description suggests cinematic, film-like, or movie-quality content, use cinematic lighting, color grading, and composition (anamorphic lens look, film grain, cinematic color palette)
  - **Professional photography**: If the description suggests professional photography, use professional camera characteristics (DSLR, mirrorless, or professional camera systems)
  - **High-production commercial**: If the description suggests commercial or advertisement quality, use high-production, polished, professional aesthetic
- **Professional camera characteristics**: 
  - Professional depth of field and bokeh (cinematic blur)
  - Professional color grading and color science
  - High-resolution, sharp details
  - Professional dynamic range
  - Professional white balance and color temperature
- **Professional lighting**: Based on the description, use appropriate professional lighting:
  - Cinematic lighting for cinematic content (dramatic, moody, color-graded)
  - Professional studio lighting for professional photography
  - Natural but enhanced lighting for high-production content
- **Ultra-realistic shadows**: Professional-quality shadows with proper falloff, realistic shadow edges, authentic shadow density and color
- **Hyperrealistic lighting**: Professional lighting behavior, realistic light diffusion, authentic light temperature and color casts, genuine light reflections and highlights
- **Photorealistic textures**: Every surface must show realistic material properties - hyperrealistic textures with professional detail capture, all textures must look completely real and professional-quality
- **Human facial features (CRITICAL)**: If the image includes human faces, facial features MUST be:
  - **Soft and realistic**: Facial features must look soft and natural, exactly as real human faces appear - not harsh, not overly sharp, not artificial
  - **Natural skin texture**: Skin must have soft, natural texture - smooth but not uniform, with subtle variations, natural pores, and realistic skin quality
  - **Realistic facial structure**: Facial features must have the natural softness and subtlety of real human faces
  - **Natural variations**: Skin texture must be non-uniform with natural variations in tone, texture, and detail
  - **Hyperrealistic but natural**: Maximum realism while maintaining the natural softness and organic quality of real human faces
  - **Professional-quality capture**: Should look like it was captured with professional camera equipment, not a phone
- **Authentic colors**: Professional color grading, cinematic color palette, or professional color science based on the description
- **Real-world details**: Natural imperfections, authentic material response to lighting, genuine atmospheric perspective, professional depth of field
- **Maximum realism**: Everything must look 100% real, as if photographed with professional camera equipment in real life
- **No iPhone characteristics**: DO NOT mention iPhone, phone camera, mobile phone, or any phone-related characteristics. Use professional camera terminology instead (DSLR, cinema camera, professional camera, etc.)
- **Style adaptation**: Analyze the description carefully and choose the most appropriate professional style (cinematic, professional photography, high-production commercial) that best fits the content

The goal is absolute photorealism with professional/cinematic quality - the image should look like it was captured with professional camera equipment. Every shadow, light, texture, color, and detail must be hyperrealistic and photorealistic, but with professional, polished, high-production aesthetic - NOT iPhone/UGC style.${referenceImageNote}`;
    } else if (style === 'studio-quality') {
      const referenceImageNote = referenceImageFile && referenceImagePrompt ? `\n\n**CRITICAL - REFERENCE IMAGE PROMPT (USE AS STYLE REFERENCE):**
A reference image has been provided and analyzed. Below is a detailed prompt that describes the reference image's visual characteristics:

**Reference Image Prompt (use this as style reference):**
"${referenceImagePrompt}"

**Your Task:**
You MUST use the reference image prompt above as a guide to incorporate the same visual style, lighting, textures, colors, composition, and aesthetic quality into your generated prompt. Specifically:

- **Mimic the lighting style**: Use the same type of lighting described in the reference prompt (studio, natural, artificial, etc.), same direction, intensity, color temperature, shadows, and highlights
- **Match the texture quality**: Incorporate the same texture characteristics and material appearance as described in the reference
- **Match the color palette**: Use similar color temperature, saturation, contrast, and color harmony as described in the reference
- **Match the composition style**: Use similar camera angles, framing, perspective, depth of field as the reference
- **Match the overall aesthetic**: If the reference is studio-quality, maintain studio quality; match the overall visual style and professional photography approach
- **Apply to user's description**: While using the reference as style guide, create a prompt for what the user described: "${description}"
- **Combine both**: The final prompt should describe the user's request but with the visual style, lighting, textures, and aesthetic of the reference image

**Important**: The reference prompt describes the STYLE and VISUAL CHARACTERISTICS of the reference image. Use these characteristics to style the user's description, not to copy the reference image's content.` : referenceImageFile ? `\n\n**CRITICAL - REFERENCE IMAGE ATTACHED:**
A reference image has been attached. You MUST:
- **Analyze the attached reference image** to understand its composition, colors, style, lighting, and aesthetic
- **Base your prompt on the reference image** - use it as a guide for composition, colors, lighting style, and overall aesthetic
- **Maintain consistency with the reference** - if the reference shows specific colors, lighting, composition, or style elements, incorporate those into the prompt
- **Enhance while preserving essence** - build upon the reference image's aesthetic while applying professional studio photography quality
- **Mention the reference explicitly** - In your generated prompt, explicitly state that the image generation should follow the aesthetic, composition, colors, lighting, and style of the attached reference image
- **Professional studio enhancement** - Apply professional studio photography principles (studio lighting, professional composition, controlled environment) while respecting the reference image's visual language` : '';

      styleInstructions = `**STUDIO QUALITY PHOTOGRAPHY STYLE REQUIREMENTS (CRITICAL):**
You MUST generate a prompt that creates professional studio photography quality:

- **Professional studio lighting**: Artificial lighting setup typical of professional photography studios (key lights, fill lights, rim lights, background lights)
- **Studio photography aesthetic**: Clean, controlled environment, professional backdrop, perfect lighting control
- **Hyperrealistic detail**: Maximum detail and clarity as in professional photography, sharp focus, high resolution
- **Professional composition**: Perfect framing, rule of thirds, professional camera angles, studio-quality composition
- **Controlled environment**: Clean backgrounds, controlled lighting, professional setup
- **Photographer quality**: As if taken by a professional photographer in a studio with professional equipment
- **Clarity and sharpness**: Crystal clear details, perfect focus, professional depth of field
- **Color accuracy**: Professional color grading, accurate color reproduction, studio lighting color temperature${referenceImageNote}

The image should look like a professional studio photograph - hyperrealistic but with the controlled, polished aesthetic of professional photography. Everything should be perfectly lit, composed, and detailed as if shot in a professional photography studio.`;
    } else if (style === 'design') {
      const referenceImageNote = referenceImageFile && referenceImagePrompt ? `\n\n**CRITICAL - REFERENCE IMAGE PROMPT (USE AS STYLE REFERENCE):**
A reference image has been provided and analyzed. Below is a detailed prompt that describes the reference image's visual characteristics:

**Reference Image Prompt (use this as style reference):**
"${referenceImagePrompt}"

**Your Task:**
You MUST use the reference image prompt above as a guide to incorporate the same visual style, lighting, textures, colors, composition, and aesthetic quality into your generated prompt. Specifically:

- **Mimic the design style**: Use the same design approach, layout style, visual hierarchy, and design language as described in the reference prompt
- **Match the color palette**: Use similar color schemes, color harmony, saturation, and contrast as described in the reference
- **Match the typography style**: If the reference mentions typography, use similar typography choices, font styles, and text treatment
- **Match the composition**: Use similar layout structure, element placement, and composition principles as the reference
- **Match the overall aesthetic**: If the reference is a design/infographic style, maintain that design aesthetic; match the overall visual style
- **Match lighting and textures**: If applicable, use similar lighting effects, texture treatments, and material appearances as described in the reference
- **Apply to user's description**: While using the reference as style guide, create a prompt for what the user described: "${description}"
- **Combine both**: The final prompt should describe the user's request but with the design style, colors, layout, typography, and aesthetic of the reference image

**Important**: The reference prompt describes the STYLE and VISUAL CHARACTERISTICS of the reference image. Use these characteristics to style the user's description, not to copy the reference image's content.` : referenceImageFile ? `\n\n**CRITICAL - REFERENCE IMAGE ATTACHED:**
A reference image has been attached. You MUST:
- **Analyze the attached reference image** to understand its design style, layout, colors, typography, and visual elements
- **Base your prompt on the reference image** - use it as a guide for design style, composition, color palette, typography choices, and overall aesthetic
- **Maintain consistency with the reference** - if the reference shows specific design patterns, color schemes, layout structures, or style elements, incorporate those into the prompt
- **Enhance while preserving essence** - build upon the reference image's design aesthetic while applying professional design principles
- **Mention the reference explicitly** - In your generated prompt, explicitly state that the image generation should follow the design style, layout, colors, typography, and aesthetic of the attached reference image
- **Professional design enhancement** - Apply professional design principles (visual hierarchy, balanced composition, color harmony) while respecting the reference image's design language` : '';

      styleInstructions = `**DESIGN STYLE REQUIREMENTS (CRITICAL):**
You MUST generate a prompt that creates professional design work (infographics, static ads, creative designs):

- **Human-made design quality**: As if created by a professional designer, with attention to every detail
- **Creative composition**: Thoughtful layout, balanced elements, professional design principles
- **Color harmony**: Carefully selected color palettes, complementary colors, professional color schemes
- **Typography considerations**: If text is involved, professional typography, readable fonts, proper hierarchy
- **Design elements**: Icons, graphics, illustrations, infographic elements - all professionally designed
- **Visual hierarchy**: Clear information hierarchy, balanced composition, professional design structure
- **Detail-oriented**: Every element carefully placed, no random elements, everything serves a purpose
- **Professional polish**: Clean, polished design, as if created by an experienced designer
- **Creative but functional**: Creative and visually appealing while maintaining clarity and functionality${referenceImageNote}

The image should look like professional design work - infographics, static ads, or creative designs that a human designer would create, with careful attention to every detail, color, composition, and element.`;
    } else if (style === 'copy-image') {
      // Copy Image mode: iterate/vary the reference image based on user's description
      const referenceImageNote = referenceImageFile && referenceImagePrompt ? `\n\n**CRITICAL - REFERENCE IMAGE PROMPT (BASE FOR ITERATION):**
A reference image has been provided and analyzed. Below is a detailed prompt that describes the reference image's visual characteristics:

**Reference Image Prompt (this is the base image):**
"${referenceImagePrompt}"

**Your Task:**
You MUST create a prompt that iterates on the reference image based on what the user wants to change: "${description}"

**CRITICAL REQUIREMENTS:**
- **Maintain core characteristics**: Keep the fundamental visual style, quality, and aesthetic of the reference image (lighting style, texture quality, color palette, composition approach, overall aesthetic)
- **Apply requested changes**: Modify ONLY what the user specifically wants to change or make different
- **Preserve what's not mentioned**: Keep everything else from the reference image that the user didn't mention changing
- **Natural variation**: The changes should feel natural and integrated, not forced or artificial
- **Same quality level**: Maintain the same level of detail, quality, and visual sophistication as the reference

**Examples:**
- If user says "change background to beach": Keep the subject, lighting, colors, and style, but change the background to a beach scene
- If user says "make it more vibrant": Keep everything the same but increase color saturation and vibrancy
- If user says "change person to different person": Keep the pose, lighting, composition, and style, but change the person
- If user says "change lighting to sunset": Keep everything else but change the lighting to sunset lighting

**Output**: Create a prompt that describes the reference image with the requested modifications applied, maintaining all other characteristics.` : referenceImageFile ? `\n\n**CRITICAL - REFERENCE IMAGE ATTACHED (BASE FOR ITERATION):**
A reference image has been attached. You MUST:

**Your Task:**
Create a prompt that iterates on the reference image based on what the user wants to change: "${description}"

**CRITICAL REQUIREMENTS:**
- **Analyze the reference image** to understand its visual characteristics (lighting, composition, colors, textures, style, aesthetic)
- **Maintain core characteristics**: Keep the fundamental visual style, quality, and aesthetic of the reference image
- **Apply requested changes**: Modify ONLY what the user specifically wants to change or make different
- **Preserve what's not mentioned**: Keep everything else from the reference image that the user didn't mention changing
- **Natural variation**: The changes should feel natural and integrated, not forced or artificial
- **Same quality level**: Maintain the same level of detail, quality, and visual sophistication as the reference

**Output**: Create a prompt that describes the reference image with the requested modifications applied, maintaining all other characteristics.` : '';

      styleInstructions = `**COPY IMAGE MODE - ITERATE ON REFERENCE IMAGE:**

You are creating a prompt that will iterate/vary a reference image based on specific changes requested by the user.

**User's Requested Changes:**
"${description}"

**Your Task:**
Generate a detailed prompt that:
1. **Starts with the reference image** as the base (maintain its core visual characteristics)
2. **Applies the requested changes** from the user's description
3. **Preserves everything else** that wasn't mentioned for change
4. **Maintains the same quality and style** as the reference image

**Critical Requirements:**
- The prompt must describe an image that looks like the reference image but with the requested modifications
- Maintain the reference image's lighting style, texture quality, color palette, composition approach, and overall aesthetic (unless specifically asked to change them)
- Only modify what the user explicitly wants to change
- The result should feel like a natural variation of the reference image, not a completely different image
- Include all technical details needed to generate the image with the same quality as the reference${referenceImageNote}

**Output Format:**
Provide ONLY the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete prompt text ready to use.`;
    }

    // Build conditional parts before template literal to avoid parsing issues
    const styleSpecialization = style === 'hyperrealistic' 
      ? 'hyperrealistic' 
      : style === 'studio-quality' 
        ? 'professional studio photography' 
        : style === 'copy-image'
        ? 'image iteration and variation'
        : 'professional design';
    
    const styleApplicationNote = style === 'hyperrealistic' 
      ? 'IF UGC is detected: Use iPhone/hyperrealistic UGC style. IF UGC is NOT detected: Use cinematic, professional, or high-production quality (still hyperrealistic, but NOT iPhone/UGC).'
      : style === 'studio-quality' 
        ? 'Use professional studio photography quality'
        : style === 'copy-image'
        ? 'Iterate on the reference image with the requested changes while maintaining core characteristics'
        : 'Use professional design quality';
    
    const criticalRequirementsNote = style === 'hyperrealistic' 
      ? '**CRITICAL**: You MUST analyze the description first. If it explicitly mentions UGC, user-generated, casual, amateur, iPhone video, or similar UGC indicators, use iPhone/UGC style. If it mentions cinematic, professional, high-production, or suggests polished content, use cinematic/professional style (NOT iPhone/UGC). If it is ambiguous, choose the style that best fits the description.'
      : '';

    // Build the critical requirements section to avoid template literal nesting issues
    const criticalRequirementsSection = criticalRequirementsNote 
      ? '- ' + criticalRequirementsNote + '\n'
      : '';

    // For copy-image, use a different prompt structure
    const promptGenerationRequest = style === 'copy-image' 
      ? styleInstructions // For copy-image, styleInstructions already contains the full prompt
      : `You are an expert AI prompt engineer specializing in ${styleSpecialization} image generation. Your task is to create a detailed, comprehensive prompt for AI image generation.

**User's Description:**
"${description}"

${styleInstructions}

**Your Task:**
Generate an extremely detailed, comprehensive prompt that:
1. **First analyzes** the user's description to determine if it's UGC or not (if style is hyperrealistic)
2. **Faithfully follows** the user's description: "${description}"
3. **Applies the appropriate style** based on your analysis:
   - ${styleApplicationNote}
4. **Enhances and expands** the user's description with professional details, technical specifications, and visual elements
5. **Ensures maximum quality** for the selected style

**Critical Requirements:**
${criticalRequirementsSection}- The prompt must be detailed and comprehensive
- Include all necessary technical details for the selected style
- Be specific about lighting, composition, colors, textures, and all visual elements
- Ensure the prompt will generate exactly what the user described, but with professional enhancement
- Make every detail explicit and clear
- The prompt should be ready to copy and paste directly into AI image generators

**Output Format:**
Provide ONLY the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete prompt text ready to use.`;

    let result;
    try {
      // Build parts array - include image if provided
      // For copy-image mode, always include the image even if we have a reference prompt
      // For other modes, only include image if we don't have a reference prompt (fallback case)
      const parts: any[] = [];
      
      // Include the image if:
      // 1. We're in copy-image mode (always include the image)
      // 2. We don't have a reference prompt (fallback case for other modes)
      if (referenceImageFile && (style === 'copy-image' || !referenceImagePrompt)) {
        console.log('Adding reference image to prompt (no reference prompt available):', {
          uri: referenceImageFile.uri?.substring(0, 50) + '...',
          mimeType: referenceImageFile.mimeType,
          state: referenceImageFile.state
        });
        
        if (!referenceImageFile.uri) {
          console.error('Reference image file missing URI');
          return NextResponse.json(
            { error: 'Reference image file is missing URI property', details: 'The uploaded image file does not have a valid URI' },
            { status: 500 }
          );
        }
        
        parts.push({
          fileData: {
            fileUri: referenceImageFile.uri,
            mimeType: referenceImageFile.mimeType
          }
        });
      } else if (referenceImagePrompt) {
        console.log('Using reference image prompt instead of image (length:', referenceImagePrompt.length, ')');
      }
      
      parts.push({
        text: promptGenerationRequest
      });

      console.log('Calling Gemini API with:', {
        model: 'gemini-3-flash-preview',
        hasImage: !!referenceImageFile,
        promptLength: promptGenerationRequest.length
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
      
      console.log('Gemini API call successful');
    } catch (error: any) {
      console.error('Error generating prompt:', {
        message: error.message,
        status: error.status,
        code: error.code,
        response: error.response?.data,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
      
      // Handle specific error types
      let errorMessage = 'Error generating prompt';
      let errorDetails = error.message || 'Unknown error';
      let statusCode = 500;
      
      // Check for API key errors
      if (error.message?.includes('API key') || error.message?.includes('API_KEY') || error.status === 401) {
        errorMessage = 'Google Gemini API key is not valid or missing';
        errorDetails = 'Please verify your GOOGLE_GENAI_API_KEY environment variable is set correctly in production';
        statusCode = 401;
      }
      // Check for rate limit errors
      else if (error.status === 429 || error.message?.includes('rate limit')) {
        errorMessage = 'Rate limit exceeded';
        errorDetails = 'Too many requests to Google Gemini API. Please try again later.';
        statusCode = 429;
      }
      // Check for file errors
      else if (error.message?.includes('file') || error.message?.includes('File')) {
        errorMessage = 'Error processing reference image';
        errorDetails = error.message;
        statusCode = 500;
      }
      
      return NextResponse.json(
        { 
          error: errorMessage, 
          details: errorDetails,
          ...(process.env.NODE_ENV === 'development' && {
            fullError: error.toString(),
            stack: error.stack
          })
        },
        { status: statusCode }
      );
    }

    // Extract the generated prompt
    let generatedPrompt = '';
    try {
      if (result.candidates && result.candidates[0]?.content?.parts) {
        generatedPrompt = result.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('')
          .trim();
      } else if ((result as any).text) {
        generatedPrompt = (result as any).text.trim();
      }
      
      if (!generatedPrompt || generatedPrompt === '') {
        return NextResponse.json(
          { error: 'Failed to generate prompt' },
          { status: 500 }
        );
      }
    } catch (err) {
      console.error('Error extracting prompt:', err);
      return NextResponse.json(
        { error: 'Error extracting prompt', details: (err as Error).message },
        { status: 500 }
      );
    }

    // Extract usage information
    let usageInfo = null;
    try {
      const usageMetadata = (result as any).usageMetadata;
      if (usageMetadata) {
        const promptTokenCount = usageMetadata.promptTokenCount || 0;
        const candidatesTokenCount = usageMetadata.candidatesTokenCount || 0;
        const totalTokenCount = usageMetadata.totalTokenCount || (promptTokenCount + candidatesTokenCount);

        const inputCostPerMillion = 0.5;
        const outputCostPerMillion = 3.0;

        const inputCost = (promptTokenCount / 1_000_000) * inputCostPerMillion;
        const outputCost = (candidatesTokenCount / 1_000_000) * outputCostPerMillion;
        const totalCost = inputCost + outputCost;

        usageInfo = {
          promptTokenCount,
          candidatesTokenCount,
          totalTokenCount,
          inputCost,
          outputCost,
          totalCost,
          inputCostFormatted: `$${inputCost.toFixed(6)}`,
          outputCostFormatted: `$${outputCost.toFixed(6)}`,
          totalCostFormatted: `$${totalCost.toFixed(6)}`
        };

        console.log('Token Usage:', usageInfo);
      }
    } catch (err) {
      console.error('Error extracting usage information:', err);
    }

    // Credit already consumed in verifyAndConsumeCredit

    return NextResponse.json({
      success: true,
      prompt: generatedPrompt,
      style: style,
      usage: usageInfo
    });

  } catch (error: any) {
    console.error('Error generating image prompt (outer catch):', {
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
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || 'Unknown error',
        ...(process.env.NODE_ENV === 'development' && {
          fullError: error.toString(),
          stack: error.stack
        })
      },
      { status: 500 }
    );
  }
}

