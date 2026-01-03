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

    // Initialize AI client at runtime
    const ai = getGoogleGenAI();
    
    const body = await request.json();
    const { description, style, referenceImage } = body;

    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    if (!style || !['hyperrealistic', 'studio-quality', 'design'].includes(style)) {
      return NextResponse.json(
        { error: 'Valid style is required (hyperrealistic, studio-quality, or design)' },
        { status: 400 }
      );
    }

    // Handle reference image upload if provided (for design, studio-quality, and hyperrealistic styles)
    let referenceImageFile = null;
    if (referenceImage && (style === 'design' || style === 'studio-quality' || style === 'hyperrealistic')) {
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
    if (style === 'hyperrealistic') {
      const referenceImageNote = referenceImageFile && referenceImagePrompt ? `\n\n**CRITICAL - REFERENCE IMAGE PROMPT (USE AS STYLE REFERENCE):**
A reference image has been provided and analyzed. Below is a detailed prompt that describes the reference image's visual characteristics:

**Reference Image Prompt (use this as style reference):**
"${referenceImagePrompt}"

**Your Task:**
You MUST use the reference image prompt above as a guide to incorporate the same visual style, lighting, textures, colors, composition, and aesthetic quality into your generated prompt. Specifically:

- **Mimic the lighting style**: Use the same type of lighting described in the reference prompt (natural, studio, flash, etc.), same direction, intensity, color temperature, shadows, and highlights
- **Match the texture quality**: Incorporate the same texture characteristics - if the reference is hyperrealistic with detailed textures, maintain that level of detail
- **Match the color palette**: Use similar color temperature, saturation, contrast, and color harmony as described in the reference
- **Match the composition style**: Use similar camera angles, framing, perspective, depth of field as the reference
- **Match the overall aesthetic**: If the reference is hyperrealistic, maintain hyperrealism; if it's studio-quality, maintain studio quality; match the overall visual style
- **Apply to user's description**: While using the reference as style guide, create a prompt for what the user described: "${description}"
- **Combine both**: The final prompt should describe the user's request but with the visual style, lighting, textures, and aesthetic of the reference image

**Important**: The reference prompt describes the STYLE and VISUAL CHARACTERISTICS of the reference image. Use these characteristics to style the user's description, not to copy the reference image's content.` : referenceImageFile ? `\n\n**CRITICAL - REFERENCE IMAGE ATTACHED (SAME PERSON, NEW ACTION/ENVIRONMENT):**
A reference image has been attached. You MUST:
- **Analyze the attached reference image** to understand the person's appearance, facial features, hair, skin tone, body type, clothing style, and all physical characteristics
- **Base your prompt on the reference image** - use it as a foundation to maintain the SAME PERSON in your generated prompt
- **Maintain the same person**: The person in your generated prompt MUST be the same person from the reference image - same appearance, same facial features, same physical characteristics, same visual identity
- **Adapt to new situation**: While maintaining the same person, adapt them to the NEW action, sequence, or environment described by the user
- **Preserve visual consistency**: Maintain the person's visual identity (appearance, style, characteristics) while placing them in the new context described
- **New action/environment**: The user's description likely involves a different action, sequence, or environment than what's in the reference image - incorporate that new context while keeping the same person
- **Mention the reference explicitly**: In your generated prompt, explicitly state that the person should match the attached reference image in appearance, while performing the new action or being in the new environment described
- **Hyperrealistic adaptation**: Ensure the person looks exactly the same as in the reference, but naturally adapted to the new situation with hyperrealistic details - same person, different moment/action/environment` : '';

      styleInstructions = `**HYPERREALISTIC STYLE REQUIREMENTS (CRITICAL):**
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

- **UGC STYLE (PEOPLE MENTIONED)**: If the description DOES mention people/persons:
  - **DEFAULT BEHAVIOR**: If the user's description does NOT explicitly specify a camera angle (e.g., "side view", "profile", "from behind", "45-degree angle", "three-quarter view", "back view", "lateral view", etc.), you MUST default to UGC (User-Generated Content) style:
    - Person looking directly at the camera (direct eye contact with camera lens)
    - Frontal camera angle (camera positioned directly in front of the person)
    - As if the person is recording themselves or taking a selfie with their iPhone
    - Natural, authentic iPhone selfie/frontal recording aesthetic
    - Direct engagement with the viewer through eye contact
    - iPhone camera quality and characteristics
  - **OVERRIDE BEHAVIOR**: If the user's description DOES explicitly specify a camera angle or view (e.g., "side view", "profile", "from the side", "45-degree angle", "three-quarter view", "from behind", "back view", etc.), then follow the user's specified camera angle instead of the default, but still maintain iPhone photography quality

**iPhone Photography Quality Requirements:**
- Always specify "iPhone photography", "taken with iPhone", or "iPhone camera quality" in the prompt
- Include iPhone's characteristic image processing look
- Maintain iPhone's natural color science and white balance
- If flash is needed, specify "iPhone flash" or "iPhone camera flash"
- **Perspective clarification**:
  - If description mentions people: The image should look like it was taken by someone with an iPhone, either in first-person (selfie/POV when person is recording themselves) or third-person (someone else taking the photo of the person)
  - If description does NOT mention people: The image should look like it was taken by someone with an iPhone in third-person perspective (as if someone is photographing the subject/scene), but NO people visible in the frame

The goal is absolute photorealism with iPhone photography quality - the image should be impossible to distinguish from a real iPhone photograph. Every shadow, light, texture, color, and detail must be hyperrealistic and photorealistic, exactly as an iPhone would capture it.`;
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
    }

    const promptGenerationRequest = `You are an expert AI prompt engineer specializing in ${style === 'hyperrealistic' ? 'hyperrealistic' : style === 'studio-quality' ? 'professional studio photography' : 'professional design'} image generation. Your task is to create a detailed, comprehensive prompt for AI image generation.

**User's Description:**
"${description}"

${styleInstructions}

**Your Task:**
Generate an extremely detailed, comprehensive prompt that:
1. **Faithfully follows** the user's description: "${description}"
2. **Applies the ${style === 'hyperrealistic' ? 'hyperrealistic' : style === 'studio-quality' ? 'studio quality photography' : 'design'} style** with all the requirements above
3. **Enhances and expands** the user's description with professional details, technical specifications, and visual elements
4. **Ensures maximum quality** for the selected style

**Critical Requirements:**
- The prompt must be detailed and comprehensive
- Include all necessary technical details for the selected style
- Be specific about lighting, composition, colors, textures, and all visual elements
- Ensure the prompt will generate exactly what the user described, but with professional enhancement
- Make every detail explicit and clear
- The prompt should be ready to copy and paste directly into AI image generators

**Output Format:**
Provide ONLY the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete prompt text ready to use.`;

    let result;
    try {
      // Build parts array - include image if provided and we don't have a reference prompt
      // If we have a reference prompt, we don't need to include the image again
      const parts: any[] = [];
      
      // Only include the image if we don't have a reference prompt (fallback case)
      if (referenceImageFile && !referenceImagePrompt) {
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

