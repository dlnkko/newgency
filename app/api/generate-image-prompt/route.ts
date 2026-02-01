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
    const { description, style, referenceImage, referenceImages, characterProductImages, firstFrameFromVideo } = body;
    
    // Support both old format (referenceImages array) and new format (referenceImage + characterProductImages)
    let mainReferenceImage: string | null = null;
    let characterProductImagesArray: string[] = [];
    
    if (referenceImage) {
      // New format: separate reference image and character/product images
      mainReferenceImage = referenceImage;
      characterProductImagesArray = characterProductImages && Array.isArray(characterProductImages) ? characterProductImages : [];
    } else if (referenceImages && Array.isArray(referenceImages) && referenceImages.length > 0) {
      // Old format: first image is reference, rest are character/product
      mainReferenceImage = referenceImages[0];
      characterProductImagesArray = referenceImages.slice(1);
    }

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

    // Copy Image mode requires at least one reference image
    if (style === 'copy-image' && !mainReferenceImage) {
      return NextResponse.json(
        { error: 'A reference image is required for Copy Image mode' },
        { status: 400 }
      );
    }

    // Handle main reference image upload if provided (for design, studio-quality, hyperrealistic, and copy-image styles)
    let mainReferenceImageFile: any = null;
    if (mainReferenceImage && (style === 'design' || style === 'studio-quality' || style === 'hyperrealistic' || style === 'copy-image')) {
      try {
        console.log('Uploading main reference image to Gemini Files...');
        const referenceBuffer = Buffer.from(mainReferenceImage.split(',')[1], 'base64');
        let referenceMime = mainReferenceImage.split(';')[0].split(':')[1] || 'image/png';
        
        // Convert unsupported formats to PNG (Gemini supports: image/png, image/jpeg, image/webp, image/gif)
        const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
        if (!supportedFormats.includes(referenceMime.toLowerCase())) {
          console.log(`Converting unsupported format ${referenceMime} to PNG`);
          referenceMime = 'image/png';
        }
        
        const referenceUint8Array = new Uint8Array(referenceBuffer);
        const referenceBlob = new Blob([referenceUint8Array], { type: referenceMime });
        mainReferenceImageFile = await ai.files.upload({
          file: referenceBlob,
          config: { mimeType: referenceMime }
        });
        console.log('Main reference image uploaded:', mainReferenceImageFile.uri);
        
        // Wait for file to be ACTIVE
        const maxWaitTime = 60000;
        const checkInterval = 2000;
        const startTime = Date.now();
        
        const waitForFile = async (file: any, fileName: string) => {
          if (file.state === 'ACTIVE') return file;
          
          while (file.state !== 'ACTIVE') {
            if (Date.now() - startTime > maxWaitTime) {
              throw new Error('Timeout waiting for main reference image to be ready');
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
        
        const referenceFileName = mainReferenceImageFile.name || mainReferenceImageFile.uri?.split('/').pop() || '';
        if (referenceFileName) {
          mainReferenceImageFile = await waitForFile(mainReferenceImageFile, referenceFileName);
          if (!mainReferenceImageFile.uri) {
            return NextResponse.json(
              { error: 'Main reference image file is missing required URI property' },
              { status: 500 }
            );
          }
        }
      } catch (uploadError: any) {
        console.error('Error uploading main reference image:', {
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
            error: 'Error uploading main reference image', 
            details: uploadError.message || 'Could not upload main reference image to Gemini Files',
            ...(process.env.NODE_ENV === 'development' && {
              fullError: uploadError.toString(),
              stack: uploadError.stack
            })
          },
          { status: 500 }
        );
      }
    }

    // Handle character/product images upload if provided
    const characterProductImageFiles: any[] = [];
    if (characterProductImagesArray.length > 0 && (style === 'design' || style === 'studio-quality' || style === 'hyperrealistic' || style === 'copy-image')) {
      // Limit to 3 images
      const imagesToProcess = characterProductImagesArray.slice(0, 3);
      
      for (let i = 0; i < imagesToProcess.length; i++) {
        const characterProductImage = imagesToProcess[i];
        try {
          console.log(`Uploading character/product image ${i + 1} of ${imagesToProcess.length} to Gemini Files...`);
          const imageBuffer = Buffer.from(characterProductImage.split(',')[1], 'base64');
          let imageMime = characterProductImage.split(';')[0].split(':')[1] || 'image/png';
          
          // Convert unsupported formats to PNG (Gemini supports: image/png, image/jpeg, image/webp, image/gif)
          const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
          if (!supportedFormats.includes(imageMime.toLowerCase())) {
            console.log(`Converting unsupported format ${imageMime} to PNG`);
            imageMime = 'image/png';
          }
          
          const imageUint8Array = new Uint8Array(imageBuffer);
          const imageBlob = new Blob([imageUint8Array], { type: imageMime });
          let characterProductImageFile = await ai.files.upload({
            file: imageBlob,
            config: { mimeType: imageMime }
          });
          console.log(`Character/product image ${i + 1} uploaded:`, characterProductImageFile.uri);
          
          // Wait for file to be ACTIVE
          const maxWaitTime = 60000;
          const checkInterval = 2000;
          const startTime = Date.now();
          
          const waitForFile = async (file: any, fileName: string) => {
            if (file.state === 'ACTIVE') return file;
            
            while (file.state !== 'ACTIVE') {
              if (Date.now() - startTime > maxWaitTime) {
                throw new Error(`Timeout waiting for character/product image ${i + 1} to be ready`);
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
          
          const imageFileName = characterProductImageFile.name || characterProductImageFile.uri?.split('/').pop() || '';
          if (imageFileName) {
            characterProductImageFile = await waitForFile(characterProductImageFile, imageFileName);
            if (!characterProductImageFile.uri) {
              return NextResponse.json(
                { error: `Character/product image ${i + 1} file is missing required URI property` },
                { status: 500 }
              );
            }
          }
          
          characterProductImageFiles.push(characterProductImageFile);
        } catch (uploadError: any) {
          console.error(`Error uploading character/product image ${i + 1}:`, {
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
              error: `Error uploading character/product image ${i + 1}`, 
              details: uploadError.message || `Could not upload character/product image ${i + 1} to Gemini Files`,
              ...(process.env.NODE_ENV === 'development' && {
                fullError: uploadError.toString(),
                stack: uploadError.stack
              })
            },
            { status: 500 }
          );
        }
      }
    }

    // If main reference image is provided, generate detailed prompt for it
    let mainReferenceImagePrompt: string = '';
    if (mainReferenceImageFile) {
      console.log('Processing main reference image...');
      
      if (mainReferenceImageFile.uri) {
        console.log('Generating detailed prompt for main reference image...');
        try {
          const referenceImageAnalysisRequest = `You are an expert AI prompt engineer. Analyze the attached reference image (this is the MAIN REFERENCE IMAGE that will be uploaded to Nano Banana Pro model and placed FIRST) and create a detailed, comprehensive prompt that would generate this exact image. 

**CRITICAL - THIS IS THE MAIN STYLE REFERENCE:**
This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. The generated prompt MUST specify that the result must match this EXACT style, angle, lighting, and hyperrealism level. This image defines the PRIMARY visual style that must be replicated.

**CRITICAL RULE - ONLY DESCRIBE WHAT YOU ACTUALLY SEE:**
- **DO NOT invent or assume characteristics** that are not explicitly visible in the image
- **DO NOT add device frames, borders, or UI elements** unless they are actually visible in the image
- **DO NOT assume it's a screenshot** unless you can clearly see screen borders, UI elements, or device frames
- **DO NOT assume it's taken with a specific device** (iPhone, camera, etc.) unless there are visible indicators
- **ONLY describe what is actually present** in the image - the subject, lighting, composition, colors, textures, and visual quality as they appear
- **If it looks like a regular photo**, describe it as a photo without adding device-specific characteristics unless visible
- **If it looks like a selfie**, describe it as a selfie photo without inventing device frames or borders
- **Be honest about what you see** - if you cannot determine the format/type from what's visible, describe it as a photo/image without assumptions

**Your Task:**
Create an extremely detailed prompt that describes ONLY what is actually visible in the image:
1. **What you actually see**: Describe the subject, scene, and content exactly as it appears
2. **Visual Style**: Describe the aesthetic quality (hyperrealistic, realistic, etc.) based on what you see
3. **Lighting**: Describe the lighting you can actually observe (type, direction, intensity, color temperature, shadows, highlights) - THIS IS CRITICAL as it must be replicated exactly
4. **Camera Angle and Perspective**: Describe the EXACT camera angle, perspective, and composition - THIS IS CRITICAL as it must be replicated exactly
5. **Textures**: Describe textures that are visible (skin, fabric, materials, surfaces) - only what you can see
6. **Colors**: Describe the color palette, color temperature, saturation, contrast that are actually present
7. **Composition**: Describe the framing, perspective, depth of field, focus that you can observe
8. **Technical Details**: Describe the image quality, sharpness, grain/noise, post-processing style that are visible
9. **Atmosphere/Mood**: Describe the overall feeling and mood based on what you see
10. **Hyperrealism Level**: Describe the level of hyperrealism and photorealism present

**Critical Requirements:**
- **ONLY describe what is visible** - do not invent or assume
- **If you cannot determine if it's a screenshot or photo**, describe it simply as a photo/image
- **Do not add device-specific characteristics** (iPhone frames, borders, UI elements) unless they are actually visible
- **Do not assume the camera/device** used unless there are clear visual indicators
- The prompt must be extremely detailed about what IS visible, but must NOT include assumptions about what is NOT visible
- **EMPHASIZE**: This image defines the EXACT style, angle, lighting, and hyperrealism that must be replicated in the final result

**Output Format:**
Provide ONLY the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete prompt text that would generate this exact image. Describe it as a photo/image unless you can clearly see it's something else (like a screenshot with visible borders/UI).`;

          const referenceParts: any[] = [
            {
              fileData: {
                fileUri: mainReferenceImageFile.uri,
                mimeType: mainReferenceImageFile.mimeType || 'image/png'
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
          let imagePrompt = '';
          if (referenceResult.candidates && referenceResult.candidates[0]?.content?.parts) {
            imagePrompt = referenceResult.candidates[0].content.parts
              .map((part: any) => part.text || '')
              .join('')
              .trim();
          } else if ((referenceResult as any).text) {
            imagePrompt = (referenceResult as any).text.trim();
          }

          if (imagePrompt && imagePrompt.length > 0) {
            console.log('Main reference image prompt generated, length:', imagePrompt.length);
            mainReferenceImagePrompt = imagePrompt;
          } else {
            console.warn('Main reference image prompt generation returned empty result');
            mainReferenceImagePrompt = '';
          }
        } catch (refError: any) {
          console.error('Error generating main reference image prompt:', {
            message: refError.message,
            status: refError.status,
            code: refError.code,
            stack: process.env.NODE_ENV === 'development' ? refError.stack : undefined
          });
          // Continue without reference prompt if it fails - will use image directly as fallback
          mainReferenceImagePrompt = '';
        }
      } else {
        console.warn('Main reference image file URI is missing, skipping reference prompt generation');
        mainReferenceImagePrompt = '';
      }
    }

    // If character/product images are provided, generate detailed prompts for each
    const characterProductImagePrompts: string[] = [];
    if (characterProductImageFiles.length > 0) {
      console.log(`Processing ${characterProductImageFiles.length} character/product image(s)...`);
      
      for (let i = 0; i < characterProductImageFiles.length; i++) {
        const characterProductImageFile = characterProductImageFiles[i];
        console.log(`Character/product image ${i + 1} file available:`, {
          hasUri: !!characterProductImageFile.uri,
          mimeType: characterProductImageFile.mimeType,
          state: characterProductImageFile.state
        });
        
        // Verify the file is ready before using it
        if (characterProductImageFile.uri) {
          console.log(`Generating detailed prompt for character/product image ${i + 1}...`);
          try {
            const characterProductImageAnalysisRequest = `You are an expert AI prompt engineer. Analyze the attached reference image (Character/Product Image ${i + 1} of ${characterProductImageFiles.length}) and create a detailed, comprehensive prompt that would generate this exact image. 

**CRITICAL RULE - ONLY DESCRIBE WHAT YOU ACTUALLY SEE:**
- **DO NOT invent or assume characteristics** that are not explicitly visible in the image
- **DO NOT add device frames, borders, or UI elements** unless they are actually visible in the image
- **DO NOT assume it's a screenshot** unless you can clearly see screen borders, UI elements, or device frames
- **DO NOT assume it's taken with a specific device** (iPhone, camera, etc.) unless there are visible indicators
- **ONLY describe what is actually present** in the image - the subject, lighting, composition, colors, textures, and visual quality as they appear
- **If it looks like a regular photo**, describe it as a photo without adding device-specific characteristics unless visible
- **If it looks like a selfie**, describe it as a selfie photo without inventing device frames or borders
- **Be honest about what you see** - if you cannot determine the format/type from what's visible, describe it as a photo/image without assumptions

**Your Task:**
Create an extremely detailed prompt that describes ONLY what is actually visible in the image:
1. **What you actually see**: Describe the subject, scene, and content exactly as it appears
2. **Visual Style**: Describe the aesthetic quality (hyperrealistic, realistic, etc.) based on what you see
3. **Lighting**: Describe the lighting you can actually observe (type, direction, intensity, color temperature, shadows, highlights)
4. **Textures**: Describe textures that are visible (skin, fabric, materials, surfaces) - only what you can see
5. **Colors**: Describe the color palette, color temperature, saturation, contrast that are actually present
6. **Composition**: Describe the camera angle, framing, perspective, depth of field, focus that you can observe
7. **Technical Details**: Describe the image quality, sharpness, grain/noise, post-processing style that are visible
8. **Atmosphere/Mood**: Describe the overall feeling and mood based on what you see

**Critical Requirements:**
- **ONLY describe what is visible** - do not invent or assume
- **If you cannot determine if it's a screenshot or photo**, describe it simply as a photo/image
- **Do not add device-specific characteristics** (iPhone frames, borders, UI elements) unless they are actually visible
- **Do not assume the camera/device** used unless there are clear visual indicators
- The prompt must be extremely detailed about what IS visible, but must NOT include assumptions about what is NOT visible
- Describe the image as if you were going to generate this exact same image, but only based on what you can actually see

**Output Format:**
Provide ONLY the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete prompt text that would generate this exact image. Describe it as a photo/image unless you can clearly see it's something else (like a screenshot with visible borders/UI).`;

            const characterProductParts: any[] = [
              {
                fileData: {
                  fileUri: characterProductImageFile.uri,
                  mimeType: characterProductImageFile.mimeType || 'image/png'
                }
              },
              {
                text: characterProductImageAnalysisRequest
              }
            ];

            const characterProductResult = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [
                {
                  role: 'user',
                  parts: characterProductParts
                }
              ]
            });

            // Extract the character/product image prompt
            let imagePrompt = '';
            if (characterProductResult.candidates && characterProductResult.candidates[0]?.content?.parts) {
              imagePrompt = characterProductResult.candidates[0].content.parts
                .map((part: any) => part.text || '')
                .join('')
                .trim();
            } else if ((characterProductResult as any).text) {
              imagePrompt = (characterProductResult as any).text.trim();
            }

            if (imagePrompt && imagePrompt.length > 0) {
              console.log(`Character/product image ${i + 1} prompt generated, length:`, imagePrompt.length);
              characterProductImagePrompts.push(imagePrompt);
            } else {
              console.warn(`Character/product image ${i + 1} prompt generation returned empty result`);
              characterProductImagePrompts.push('');
            }
          } catch (refError: any) {
            console.error(`Error generating character/product image ${i + 1} prompt:`, {
              message: refError.message,
              status: refError.status,
              code: refError.code,
              stack: process.env.NODE_ENV === 'development' ? refError.stack : undefined
            });
            // Continue without reference prompt if it fails - will use image directly as fallback
            characterProductImagePrompts.push('');
          }
        } else {
          console.warn(`Character/product image ${i + 1} file URI is missing, skipping reference prompt generation`);
          characterProductImagePrompts.push('');
        }
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

    // Build reference image note - MAIN REFERENCE IMAGE is the primary style reference
    let referenceImageNote = '';
    if (style === 'hyperrealistic') {
      if (mainReferenceImageFile && mainReferenceImagePrompt) {
        // Main reference image with prompt - this is the PRIMARY style reference
        const validCharacterPrompts = characterProductImagePrompts.filter((p) => p && p.trim().length > 0);
        
        referenceImageNote = `\n\n**CRITICAL - MAIN REFERENCE IMAGE (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been provided and analyzed. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. The generated prompt MUST specify that the result must match this EXACT style, angle, lighting, and hyperrealism level.

**Main Reference Image Prompt (this defines the PRIMARY style that MUST be replicated exactly):**
"${mainReferenceImagePrompt}"

**Your Task:**
You MUST use the main reference image prompt above as the PRIMARY style reference. This image defines the EXACT visual style that must be replicated:
- **EXACT camera angle and perspective** from the main reference (frontal, side, three-quarter, from above, from below, etc.) - ONLY if described
- **EXACT composition and framing** (close-up, medium shot, wide shot, etc.) - ONLY if described
- **EXACT lighting style** (same type, direction, intensity, color temperature, shadows, highlights) - ONLY what is actually visible - THIS IS CRITICAL
- **EXACT texture quality and appearance** (same level of detail, same material appearance) - ONLY what is visible
- **EXACT color palette** (same color temperature, saturation, contrast, color harmony) - ONLY what is present
- **EXACT depth of field and focus** (same blur/sharpness characteristics) - ONLY what is visible
- **EXACT overall aesthetic and visual style** (same look and feel) - ONLY what is actually present
- **EXACT hyperrealism level** - match the exact level of hyperrealism and photorealism from the main reference

${validCharacterPrompts.length > 0 ? `**Additional Character/Product Reference Images:**
${validCharacterPrompts.map((prompt, idx) => `**Character/Product Image ${idx + 1} Prompt:**
"${prompt}"`).join('\n\n')}

These character/product images are additional references for content/subject matter. Use them to inform the content/subject, but the PRIMARY style (angle, lighting, hyperrealism) must come from the main reference image above.` : ''}

- **DO NOT ADD CHARACTERISTICS NOT IN THE REFERENCE**: 
  - **DO NOT add device frames, borders, or UI elements** unless the main reference image prompt explicitly mentions them
  - **DO NOT add "iPhone screenshot" or "iPhone frame"** unless the main reference explicitly describes these elements
  - **DO NOT assume device-specific characteristics** unless they are explicitly described in the main reference prompt
  - **ONLY use what is actually described** in the main reference image prompt
  
- **Apply to user's description**: While respecting the EXACT visual characteristics from the main reference image (angle, lighting, hyperrealism), adapt the CONTENT to match what the user described: "${description}"
  - Keep the EXACT same camera angle, composition, lighting, textures, colors, and aesthetic from the main reference (as described)
  - Change only the CONTENT/SUBJECT to match the user's description
  - The result should look like the main reference image in terms of style, angle, lighting, and hyperrealism, but with the content/subject the user requested
  - **DO NOT add any characteristics** (device frames, borders, etc.) that were not in the main reference image prompt

- **CRITICAL**: The generated prompt must specify that the result must match the EXACT style, angle, lighting, and hyperrealism from the main reference image. This image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication.`;
      } else if (mainReferenceImageFile) {
        // Main reference image provided but no prompt generated - use image directly
        referenceImageNote = `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been attached. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. You MUST:
- **Analyze the attached main reference image** to understand EXACTLY how it looks:
  - Camera angle and perspective (frontal, side, three-quarter, from above, from below, etc.)
  - Composition and framing (close-up, medium shot, wide shot, etc.)
  - Lighting style (type, direction, intensity, color temperature, shadows, highlights) - THIS IS CRITICAL
  - Texture quality and appearance
  - Color palette (color temperature, saturation, contrast, color harmony)
  - Depth of field and focus characteristics
  - Overall aesthetic and visual style
  - Hyperrealism level and photorealism quality
  - If there's a person: their appearance, facial features, hair, skin tone, body type, clothing style, and all physical characteristics

- **RESPECT THE MAIN REFERENCE IMAGE EXACTLY**: Your generated prompt must specify that the result must match this EXACT style, angle, lighting, and hyperrealism. This image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication:
  - **EXACT camera angle and perspective** - match the main reference image's camera angle precisely
  - **EXACT composition and framing** - match the main reference image's framing and composition
  - **EXACT lighting style** - match the main reference image's lighting characteristics - THIS IS CRITICAL
  - **EXACT texture quality** - match the main reference image's texture appearance
  - **EXACT color palette** - match the main reference image's colors
  - **EXACT depth of field** - match the main reference image's focus/blur characteristics
  - **EXACT overall aesthetic** - match the main reference image's visual style and look
  - **EXACT hyperrealism level** - match the exact level of hyperrealism and photorealism

- **Apply to user's description**: While respecting the EXACT visual characteristics of the main reference image, adapt the CONTENT to match what the user described: "${description}"
  - Keep the EXACT same camera angle, composition, lighting, textures, colors, and aesthetic from the main reference
  - Change only the CONTENT/SUBJECT to match the user's description
  - If the main reference has a person and the user's description also involves a person: maintain the same person's appearance from the reference, but adapt them to the new action/environment described
  - The result should look like the main reference image in terms of style, angle, lighting, and hyperrealism, but with the content/subject the user requested

- **CRITICAL**: The generated prompt must specify that the result must match the EXACT style, angle, lighting, and hyperrealism from the main reference image. This image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication.`;
      }
    } else {
      // No main reference image
      referenceImageNote = '';
    }

    // Build style instructions based on UGC detection
    if (style === 'hyperrealistic') {
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
  - **Reference image priority**: ${mainReferenceImageFile && mainReferenceImagePrompt ? 'If a main reference image is provided, you MUST respect the EXACT camera angle, composition, and visual style from the main reference image. The main reference image prompt describes exactly how the reference looks - match that EXACTLY in terms of angle, composition, lighting, and aesthetic, but adapt the content to the user\'s description. This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly.' : 'Choose the most natural camera angle and framing that fits the scene described.'}
  - iPhone camera quality and characteristics - must look like a real iPhone photo taken casually

**iPhone Photography Quality Requirements:**
- Always specify "iPhone photography", "taken with iPhone", or "iPhone camera quality" in the prompt
- Include iPhone's characteristic image processing look
- Maintain iPhone's natural color science and white balance
- If flash is needed, specify "iPhone flash" or "iPhone camera flash"
- **CRITICAL - NO DEVICE FRAMES OR BORDERS**: 
  - **ABSOLUTE PROHIBITION**: You MUST NOT mention, include, or suggest iPhone frames, iPhone borders, iPhone margins, device frames, screen borders, or any UI elements in the prompt UNLESS the user explicitly requests them
  - **ONLY describe the photo/image itself**: Describe the image as a photo taken with an iPhone, but WITHOUT any device frames, borders, or margins
  - **NO screenshots**: Do NOT describe it as a screenshot unless the user explicitly mentions screenshot or screen capture
  - **NO UI elements**: Do NOT include any UI elements, status bars, navigation bars, or device interface elements
  - **Just the photo**: The prompt should describe a clean photo/image without any device framing or borders
- **Perspective clarification**:
  - If description mentions people: The image should look like a casual, amateur photo taken with an iPhone - can be ANY angle (frontal, side, three-quarter, from above, from below, etc.) that feels natural and casual. NOT always frontal/selfie style. Should feel like someone casually taking a photo with their iPhone.
  - If description does NOT mention people: The image should look like it was taken by someone with an iPhone in third-person perspective (as if someone is photographing the subject/scene), but NO people visible in the frame
  - **Reference image priority**: ${mainReferenceImageFile && mainReferenceImagePrompt ? 'If a main reference image is provided, match the EXACT camera angle and perspective from the main reference image. The main reference image prompt describes exactly how the reference looks - respect that EXACTLY. This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly.' : 'Choose the most natural camera angle that fits the scene.'}

The goal is absolute photorealism with iPhone photography quality - the image should be impossible to distinguish from a real iPhone photograph. Every shadow, light, texture, color, and detail must be hyperrealistic and photorealistic, exactly as an iPhone would capture it. **CRITICAL: The image should be a clean photo without any device frames, borders, margins, or UI elements - just the photo itself.**

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
      const referenceImageNote = mainReferenceImageFile && mainReferenceImagePrompt ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE PROMPT (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been provided and analyzed. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. The generated prompt MUST specify that the result must match this EXACT style, lighting, and professional quality.

**Main Reference Image Prompt (use this as PRIMARY style reference):**
"${mainReferenceImagePrompt}"

**Your Task:**
You MUST use the main reference image prompt above as the PRIMARY style guide. This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly. Incorporate the same visual style, lighting, textures, colors, composition, and aesthetic quality:

- **Mimic the lighting style**: Use the EXACT same type of lighting described in the main reference prompt (studio, natural, artificial, etc.), same direction, intensity, color temperature, shadows, and highlights - THIS IS CRITICAL
- **Match the texture quality**: Incorporate the EXACT same texture characteristics and material appearance as described in the main reference
- **Match the color palette**: Use the EXACT same color temperature, saturation, contrast, and color harmony as described in the main reference
- **Match the composition style**: Use the EXACT same camera angles, framing, perspective, depth of field as the main reference
- **Match the overall aesthetic**: If the main reference is studio-quality, maintain studio quality; match the overall visual style and professional photography approach
- **Apply to user's description**: While using the main reference as PRIMARY style guide, create a prompt for what the user described: "${description}"
- **Combine both**: The final prompt should describe the user's request but with the EXACT visual style, lighting, textures, and aesthetic of the main reference image

**CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication.` : mainReferenceImageFile ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been attached. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. You MUST:
- **Analyze the attached main reference image** to understand its composition, colors, style, lighting, and aesthetic - THIS IS CRITICAL
- **Base your prompt on the main reference image** - use it as the PRIMARY guide for composition, colors, lighting style, and overall aesthetic
- **Maintain EXACT consistency with the main reference** - if the main reference shows specific colors, lighting, composition, or style elements, incorporate those EXACTLY into the prompt
- **Enhance while preserving essence** - build upon the main reference image's aesthetic while applying professional studio photography quality
- **Mention the main reference explicitly** - In your generated prompt, explicitly state that the image generation should follow the EXACT aesthetic, composition, colors, lighting, and style of the attached main reference image
- **Professional studio enhancement** - Apply professional studio photography principles (studio lighting, professional composition, controlled environment) while respecting the main reference image's visual language
- **CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication` : '';

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
      const referenceImageNote = mainReferenceImageFile && mainReferenceImagePrompt ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE PROMPT (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been provided and analyzed. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. The generated prompt MUST specify that the result must match this EXACT design style, colors, and visual aesthetics.

**Main Reference Image Prompt (use this as PRIMARY style reference):**
"${mainReferenceImagePrompt}"

**Your Task:**
You MUST use the main reference image prompt above as the PRIMARY style guide. This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly. Incorporate the same visual style, lighting, textures, colors, composition, and aesthetic quality:

- **Mimic the design style**: Use the EXACT same design approach, layout style, visual hierarchy, and design language as described in the main reference prompt
- **Match the color palette**: Use the EXACT same color schemes, color harmony, saturation, and contrast as described in the main reference
- **Match the typography style**: If the main reference mentions typography, use the EXACT same typography choices, font styles, and text treatment
- **Match the composition**: Use the EXACT same layout structure, element placement, and composition principles as the main reference
- **Match the overall aesthetic**: If the main reference is a design/infographic style, maintain that design aesthetic; match the overall visual style
- **Match lighting and textures**: If applicable, use the EXACT same lighting effects, texture treatments, and material appearances as described in the main reference
- **Apply to user's description**: While using the main reference as PRIMARY style guide, create a prompt for what the user described: "${description}"
- **Combine both**: The final prompt should describe the user's request but with the EXACT design style, colors, layout, typography, and aesthetic of the main reference image

**CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication.` : mainReferenceImageFile ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been attached. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. You MUST:
- **Analyze the attached main reference image** to understand its design style, layout, colors, typography, and visual elements - THIS IS CRITICAL
- **Base your prompt on the main reference image** - use it as the PRIMARY guide for design style, composition, color palette, typography choices, and overall aesthetic
- **Maintain EXACT consistency with the main reference** - if the main reference shows specific design patterns, color schemes, layout structures, or style elements, incorporate those EXACTLY into the prompt
- **Enhance while preserving essence** - build upon the main reference image's design aesthetic while applying professional design principles
- **Mention the main reference explicitly** - In your generated prompt, explicitly state that the image generation should follow the EXACT design style, layout, colors, typography, and aesthetic of the attached main reference image
- **Professional design enhancement** - Apply professional design principles (visual hierarchy, balanced composition, color harmony) while respecting the main reference image's design language
- **CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication` : '';

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
      // CRITICAL: Must maintain the EXACT format/type of image (screenshot, photo, etc.) unless user explicitly asks to change it
      const referenceImageNote = mainReferenceImageFile && mainReferenceImagePrompt ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE PROMPT (BASE FOR ITERATION - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been provided and analyzed. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. The generated prompt MUST specify that the result must match this EXACT style, angle, lighting, and hyperrealism level.

**Main Reference Image Prompt (this is the base image):**
"${mainReferenceImagePrompt}"

**Your Task:**
You MUST create a prompt that iterates on the main reference image based on what the user wants to change: "${description}". This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly.

**ABSOLUTELY CRITICAL REQUIREMENTS - FORMAT PRESERVATION:**
- **MAINTAIN EXACT IMAGE FORMAT/TYPE**: The main reference image prompt describes the EXACT type and format of the image. You MUST preserve this EXACTLY unless the user explicitly asks to change the format/type. Examples:
  - If the main reference is a "screenshot of iPhone screen" → The output MUST be "screenshot of iPhone screen" (unless user says "change to photo" or similar)
  - If the main reference is a "photo taken with iPhone" → The output MUST be "photo taken with iPhone" (unless user says "change to screenshot" or similar)
  - If the main reference is a "design mockup" → The output MUST be "design mockup" (unless user says "change to photo" or similar)
  - If the main reference is a "product photo" → The output MUST be "product photo" (unless user explicitly changes it)

- **MAINTAIN EXACT VISUAL CHARACTERISTICS**: Keep EVERYTHING from the main reference image prompt EXACTLY as described:
  - **EXACT format/type** (screenshot, photo, mockup, etc.) - DO NOT change unless user explicitly requests format change
  - **EXACT device/medium** (iPhone screen, iPhone camera, computer screen, etc.) - DO NOT change unless user explicitly requests it
  - **EXACT composition and framing** (same aspect ratio, same layout structure, same visual structure)
  - **EXACT lighting style** (same type, direction, intensity, color temperature) - THIS IS CRITICAL
  - **EXACT texture quality and appearance** (same level of detail, same material appearance)
  - **EXACT color palette** (same color temperature, saturation, contrast)
  - **EXACT overall aesthetic and visual style** (same look and feel)
  - **EXACT camera angle and perspective** - THIS IS CRITICAL

- **ONLY CHANGE WHAT USER EXPLICITLY REQUESTS**: 
  - If user says "change background to beach" → Keep the EXACT format (e.g., "screenshot of iPhone screen") but change the background content
  - If user says "change text to X" → Keep the EXACT format but change the text content
  - If user says "change colors" → Keep the EXACT format but change colors
  - If user says "change to photo" or "change format" → THEN you can change the format/type
  - If user does NOT mention format/type change → KEEP THE EXACT FORMAT/TYPE FROM MAIN REFERENCE

- **FORMAT DETECTION**: Analyze the main reference image prompt carefully to identify:
  - Is it a screenshot? (iPhone screen, computer screen, app interface, etc.)
  - Is it a photo? (taken with camera, iPhone camera, etc.)
  - Is it a design/mockup? (digital design, UI mockup, etc.)
  - What device/medium is shown? (iPhone, computer, tablet, etc.)
  - Then MAINTAIN that exact format/type in your output unless user explicitly changes it

**Examples:**
- Main Reference: "screenshot of iPhone screen showing app interface" + User: "change background color to blue" → Output: "screenshot of iPhone screen showing app interface with blue background" (KEEPS screenshot format)
- Main Reference: "screenshot of iPhone screen" + User: "change to photo" → Output: "photo taken with iPhone showing..." (CHANGES format because user requested it)
- Main Reference: "screenshot of iPhone screen" + User: "change text to 'Hello'" → Output: "screenshot of iPhone screen with text 'Hello'" (KEEPS screenshot format, only changes text)
- Main Reference: "photo of product" + User: "change background" → Output: "photo of product with different background" (KEEPS photo format)

**CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication. The output must describe the main reference image with the requested modifications applied, maintaining the EXACT format/type, angle, lighting, and all other characteristics unless explicitly changed by the user.` : mainReferenceImageFile ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (BASE FOR ITERATION - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been attached. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. You MUST:

**Your Task:**
Create a prompt that iterates on the main reference image based on what the user wants to change: "${description}". This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly.

**ABSOLUTELY CRITICAL REQUIREMENTS - FORMAT PRESERVATION:**
- **ANALYZE THE EXACT IMAGE FORMAT/TYPE**: First, carefully analyze the main reference image to determine its EXACT format and type:
  - Is it a screenshot? (iPhone screen, computer screen, app interface, mobile app screenshot, etc.)
  - Is it a photo? (taken with camera, iPhone camera, professional photo, etc.)
  - Is it a design/mockup? (digital design, UI mockup, graphic design, etc.)
  - What device/medium is shown or used? (iPhone, computer, tablet, etc.)
  - What is the exact visual structure? (screen layout, photo composition, design layout, etc.)

- **MAINTAIN EXACT IMAGE FORMAT/TYPE**: You MUST preserve the EXACT format/type of the main reference image UNLESS the user explicitly asks to change the format/type. Examples:
  - If main reference is a screenshot of iPhone screen → Output MUST be "screenshot of iPhone screen" (unless user says "change to photo" or "change format")
  - If main reference is a photo taken with iPhone → Output MUST be "photo taken with iPhone" (unless user explicitly changes it)
  - If main reference is a design mockup → Output MUST be "design mockup" (unless user explicitly changes it)

- **MAINTAIN EXACT VISUAL CHARACTERISTICS**: Keep EVERYTHING from the main reference image EXACTLY:
  - **EXACT format/type** (screenshot, photo, mockup, etc.) - DO NOT change unless user explicitly requests format change
  - **EXACT device/medium** (iPhone screen, iPhone camera, computer screen, etc.) - DO NOT change unless user explicitly requests it
  - **EXACT composition and framing** (same aspect ratio, same layout structure, same visual structure)
  - **EXACT lighting style** (same type, direction, intensity, color temperature) - THIS IS CRITICAL
  - **EXACT texture quality** (same level of detail, same material appearance)
  - **EXACT color palette** (same color temperature, saturation, contrast)
  - **EXACT overall aesthetic** (same look and feel)
  - **EXACT camera angle and perspective** - THIS IS CRITICAL

- **ONLY CHANGE WHAT USER EXPLICITLY REQUESTS**: 
  - If user says "change background" → Keep the EXACT format but change the background content
  - If user says "change text" → Keep the EXACT format but change the text content
  - If user says "change colors" → Keep the EXACT format but change colors
  - If user says "change to photo" or "change format" → THEN you can change the format/type
  - If user does NOT mention format/type change → KEEP THE EXACT FORMAT/TYPE FROM MAIN REFERENCE

**CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication. The output must describe the main reference image with the requested modifications applied, maintaining the EXACT format/type, angle, lighting, and all other characteristics unless explicitly changed by the user.` : '';

      styleInstructions = `**COPY IMAGE MODE - EXACT FORMAT PRESERVATION:**

You are creating a prompt that will iterate/vary a reference image based on specific changes requested by the user. CRITICAL: You must maintain the EXACT format/type of the reference image unless the user explicitly asks to change it.

**User's Requested Changes:**
"${description}"

**Your Task:**
Generate a detailed prompt that:
1. **Identifies the EXACT format/type** of the reference image (screenshot, photo, mockup, etc.)
2. **Maintains that EXACT format/type** unless user explicitly requests format change
3. **Applies ONLY the requested changes** from the user's description
4. **Preserves EVERYTHING else** that wasn't mentioned for change

**ABSOLUTELY CRITICAL REQUIREMENTS:**
- **FORMAT PRESERVATION IS MANDATORY**: If the reference image is a "screenshot of iPhone screen", your output MUST describe a "screenshot of iPhone screen" (unless user says "change to photo" or similar)
- **ONLY CHANGE FORMAT IF EXPLICITLY REQUESTED**: If user does NOT mention changing the format/type, you MUST keep the exact same format/type as the reference
- **MAINTAIN ALL VISUAL CHARACTERISTICS**: Keep the exact composition, lighting, colors, textures, and aesthetic from the reference (unless specifically asked to change)
- **CHANGE ONLY REQUESTED ELEMENTS**: Modify only what the user explicitly wants to change (content, colors, text, etc.) while keeping the format intact
- **BE SPECIFIC ABOUT FORMAT**: Explicitly state the format/type in your prompt (e.g., "screenshot of iPhone screen", "photo taken with iPhone", etc.)${referenceImageNote}

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
- **CRITICAL - NO DEVICE FRAMES**: Do NOT mention, include, or suggest iPhone frames, device borders, margins, screen borders, or UI elements UNLESS the user explicitly requests them. Describe only the photo/image itself without any device framing.

**Output Format:**
Provide ONLY the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete prompt text ready to use. **CRITICAL: The prompt must describe a clean photo/image without any device frames, borders, margins, or UI elements unless explicitly requested by the user.**`;

    let result;
    try {
      // Build parts array - include images if provided
      // MAIN REFERENCE IMAGE goes FIRST (will be uploaded to Nano Banana Pro and placed first)
      // Then character/product images if provided
      const parts: any[] = [];
      
      // Include main reference image if provided (always include for copy-image, or if no prompt was generated)
      if (mainReferenceImageFile && (style === 'copy-image' || !mainReferenceImagePrompt)) {
        console.log('Adding main reference image to prompt (will be placed FIRST in Nano Banana Pro):', {
          hasUri: !!mainReferenceImageFile.uri,
          mimeType: mainReferenceImageFile.mimeType
        });
        
        if (!mainReferenceImageFile.uri) {
          console.error('Main reference image file missing URI');
          return NextResponse.json(
            { error: 'Main reference image file is missing URI property', details: 'The uploaded main reference image file does not have a valid URI' },
            { status: 500 }
          );
        }
        
        // Add main reference image FIRST
        parts.push({
          fileData: {
            fileUri: mainReferenceImageFile.uri,
            mimeType: mainReferenceImageFile.mimeType || 'image/png'
          }
        });
      } else if (mainReferenceImagePrompt) {
        console.log('Using main reference image prompt instead of image (length:', mainReferenceImagePrompt.length, ')');
      }
      
      // Include character/product images if provided
      if (characterProductImageFiles.length > 0) {
        console.log(`Adding ${characterProductImageFiles.length} character/product image(s) to prompt:`, {
          hasUris: characterProductImageFiles.map(f => !!f.uri),
          mimeTypes: characterProductImageFiles.map(f => f.mimeType)
        });
        
        // Add all character/product images
        for (const imageFile of characterProductImageFiles) {
          if (!imageFile.uri) {
            console.error('Character/product image file missing URI');
            return NextResponse.json(
              { error: 'Character/product image file is missing URI property', details: 'The uploaded character/product image file does not have a valid URI' },
              { status: 500 }
            );
          }
          
          parts.push({
            fileData: {
              fileUri: imageFile.uri,
              mimeType: imageFile.mimeType || 'image/png'
            }
          });
        }
      }
      
      parts.push({
        text: promptGenerationRequest
      });

      console.log('Calling Gemini API with:', {
        model: 'gemini-3-flash-preview',
        hasMainReferenceImage: !!mainReferenceImageFile,
        hasCharacterProductImages: characterProductImageFiles.length > 0,
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

