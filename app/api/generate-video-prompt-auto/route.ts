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
    const { description, productImage, isUGC = true } = body;

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

    const generationPrompt = `You are an expert AI prompt engineer specializing in ${isUGC ? 'hyperrealistic UGC (User-Generated Content)' : 'professional'} video prompts. Your task is to create a complete, ready-to-use video prompt based on the user's description.

**User's Request:**
${description}

${productImageFile ? '**Product Image:** You have access to a product image. Analyze it carefully and incorporate its visual details (colors, materials, textures, design, branding) into the prompt.' : ''}

${ugcInstructions}

**Your Task:**
Generate a complete, professional video prompt that:
1. **Decides the optimal number of scenes** (typically 1-5 scenes) based on the description and narrative flow
2. **Decides characters/people**: Based on the description, determine who should appear, their characteristics, and how they relate to the story
3. **Creates each scene with full details** including:
   - Action description ${isUGC ? 'with hyperrealistic UGC details' : 'with professional quality'}
   ${isUGC ? '- Camera composition (intelligently choose from: UGC Close-up, Product in Real Use, Everyday Life, or Authentic Unboxing - select the best fit for each scene based on the narrative)' : ''}
   ${isUGC ? '- Lighting/Ambience (intelligently choose from: Night Outside, Day Outside, Artificial Light Inside, or Natural Light Inside - select the best fit for each scene based on the narrative)' : ''}
   - Duration considerations (if applicable)
4. **Maintains narrative flow**: Ensure scenes connect logically and tell a cohesive story
${isUGC ? '5. **Integrates UGC elements seamlessly**: All UGC characteristics (handheld movements, mobile grain, realistic shadows, photorealistic textures) must be naturally woven into the prompt' : ''}

**Output Format:**
Provide the complete prompt as a single, continuous paragraph ready to copy-paste into an AI video generator. The prompt should flow naturally and include all scenes seamlessly integrated. Do NOT use line breaks, bullet points, or special formatting - just one flowing paragraph.

**Important:**
- If a hook is mentioned in the description, make the opening scene extremely attention-grabbing
- If product showcase is requested, ensure the product is clearly visible and well-lit
- Maintain narrative flow between scenes
- Keep the prompt concise but comprehensive
- All content must be in English
${isUGC ? '- The prompt should feel like a natural, authentic iPhone recording - not staged or professional' : ''}`;

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

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: parts
        }
      ]
    });

    // Extract the generated prompt
    let generatedPrompt = '';
    if (result.candidates && result.candidates[0]?.content?.parts) {
      generatedPrompt = result.candidates[0].content.parts
        .map((part: any) => part.text || '')
        .join('')
        .trim();
    } else if ((result as any).text) {
      generatedPrompt = (result as any).text.trim();
    }

    if (!generatedPrompt) {
      return NextResponse.json(
        { error: 'Failed to generate prompt' },
        { status: 500 }
      );
    }

    // Credit already consumed in verifyAndConsumeCredit

    return NextResponse.json({
      success: true,
      prompt: generatedPrompt
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


