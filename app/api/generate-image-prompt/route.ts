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
        console.error('Error uploading reference image:', uploadError);
        return NextResponse.json(
          { error: 'Error uploading reference image', details: uploadError.message },
          { status: 500 }
        );
      }
    }

    // Build style-specific instructions
    let styleInstructions = '';
    if (style === 'hyperrealistic') {
      const referenceImageNote = referenceImageFile ? `\n\n**CRITICAL - REFERENCE IMAGE ATTACHED (SAME PERSON, NEW ACTION/ENVIRONMENT):**
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
You MUST generate a prompt that prioritizes ABSOLUTE HYPERREALISM. The image must be indistinguishable from reality:

- **Ultra-realistic shadows**: Natural, soft shadows with proper falloff, realistic shadow edges, authentic shadow density and color that matches the light source
- **Hyperrealistic lighting**: Natural light behavior, realistic light diffusion, authentic light temperature and color casts, genuine light reflections and highlights
- **Photorealistic textures**: Every surface must show realistic material properties - skin texture with pores and natural imperfections, fabric textures with visible weave, product surfaces with authentic material details, all textures must look completely real
- **Authentic colors**: Natural color science, realistic color temperature, genuine color reproduction as seen in real life
- **Real-world details**: Natural imperfections, authentic material response to lighting, genuine atmospheric perspective, realistic depth of field
- **Maximum realism**: If the description mentions a person, environment, object, or anything - it must look 100% real, as if photographed in real life
- **No artificial elements**: Everything must look natural and authentic, as if it exists in the real world${referenceImageNote}

**CRITICAL DEFAULT - UGC STYLE (FRONTAL CAMERA ANGLE):**
- **DEFAULT BEHAVIOR**: If the user's description does NOT explicitly specify a camera angle (e.g., "side view", "profile", "from behind", "45-degree angle", "three-quarter view", "back view", "lateral view", etc.), you MUST default to UGC (User-Generated Content) style:
  - Person looking directly at the camera (direct eye contact with camera lens)
  - Frontal camera angle (camera positioned directly in front of the person)
  - As if the person is recording themselves or taking a selfie
  - Natural, authentic selfie/frontal recording aesthetic
  - Direct engagement with the viewer through eye contact
- **OVERRIDE BEHAVIOR**: If the user's description DOES explicitly specify a camera angle or view (e.g., "side view", "profile", "from the side", "45-degree angle", "three-quarter view", "from behind", "back view", etc.), then follow the user's specified camera angle instead of the default
- **PERSON PRESENCE**: This default applies when the description includes a person. If the description doesn't involve a person, apply standard hyperrealistic requirements

The goal is absolute photorealism - the image should be impossible to distinguish from a real photograph. Every shadow, light, texture, color, and detail must be hyperrealistic and photorealistic.`;
    } else if (style === 'studio-quality') {
      const referenceImageNote = referenceImageFile ? `\n\n**CRITICAL - REFERENCE IMAGE ATTACHED:**
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
      const referenceImageNote = referenceImageFile ? `\n\n**CRITICAL - REFERENCE IMAGE ATTACHED:**
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
      // Build parts array - include image if provided
      const parts: any[] = [];
      
      if (referenceImageFile) {
        parts.push({
          fileData: {
            fileUri: referenceImageFile.uri,
            mimeType: referenceImageFile.mimeType
          }
        });
      }
      
      parts.push({
        text: promptGenerationRequest
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
    } catch (error: any) {
      console.error('Error generating prompt:', error);
      return NextResponse.json(
        { error: 'Error generating prompt', details: error.message },
        { status: 500 }
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
    console.error('Error generating image prompt:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

