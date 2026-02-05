import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export const maxDuration = 60; // 60 seconds for Vercel Pro plan

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
    console.log('Starting image prompt generation...');
    const ai = await getGoogleGenAI(request);
    console.log('AI client initialized');
    
    const body = await request.json();
    console.log('Request body received:', {
      hasDescription: !!body.description,
      style: body.style,
      hasReferenceImage: !!body.referenceImage,
      hasProductImages: Array.isArray(body.productImages) && body.productImages.length > 0,
      hasCharacterImages: Array.isArray(body.characterImages) && body.characterImages.length > 0,
      hasElementImages: Array.isArray(body.elementImages) && body.elementImages.length > 0,
      copyCameraAngle: body.copyCameraAngle,
      copyLighting: body.copyLighting
    });
    
    const { description, style, referenceImage, referenceImages, copyCameraAngle, copyLighting, productImages, characterImages, elementImages, firstFrameFromVideo } = body;
    
    // Support both old format (referenceImages array) and new format (referenceImage + productImages/characterImages/elementImages)
    let mainReferenceImage: string | null = null;
    let productImagesArray: string[] = [];
    let characterImagesArray: string[] = [];
    let elementImagesArray: string[] = [];
    
    if (referenceImage) {
      // New format: separate reference image, product images, character images, and element images
      mainReferenceImage = referenceImage;
      productImagesArray = productImages && Array.isArray(productImages) ? productImages : [];
      characterImagesArray = characterImages && Array.isArray(characterImages) ? characterImages : [];
      elementImagesArray = elementImages && Array.isArray(elementImages) ? elementImages : [];
    } else if (referenceImages && Array.isArray(referenceImages) && referenceImages.length > 0) {
      // Old format: first image is reference, rest are character/product (default to product)
      mainReferenceImage = referenceImages[0];
      productImagesArray = referenceImages.slice(1);
      characterImagesArray = [];
    }

    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    if (!style || !['hyperrealistic', 'studio-quality', 'design', 'change-elements'].includes(style)) {
      return NextResponse.json(
        { error: 'Valid style is required (hyperrealistic, studio-quality, design, or change-elements)' },
        { status: 400 }
      );
    }

    // Change Elements mode requires at least one reference image
    if (style === 'change-elements' && !mainReferenceImage) {
      return NextResponse.json(
        { error: 'A reference image is required for Change Elements in Image mode' },
        { status: 400 }
      );
    }

    // Handle main reference image upload if provided (for design, studio-quality, hyperrealistic, and change-elements styles)
    let mainReferenceImageFile: any = null;
    if (mainReferenceImage && (style === 'design' || style === 'studio-quality' || style === 'hyperrealistic' || style === 'change-elements')) {
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

    // Helper function to upload images to Gemini Files
    const uploadImageToGemini = async (imageBase64: string, imageNumber: number, imageType: 'product' | 'character' | 'element'): Promise<any> => {
      try {
        console.log(`Uploading ${imageType} image ${imageNumber} to Gemini Files...`);
        const imageBuffer = Buffer.from(imageBase64.split(',')[1], 'base64');
        let imageMime = imageBase64.split(';')[0].split(':')[1] || 'image/png';
          
          // Convert unsupported formats to PNG (Gemini supports: image/png, image/jpeg, image/webp, image/gif)
          const supportedFormats = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
          if (!supportedFormats.includes(imageMime.toLowerCase())) {
            console.log(`Converting unsupported format ${imageMime} to PNG`);
            imageMime = 'image/png';
          }
          
          const imageUint8Array = new Uint8Array(imageBuffer);
          const imageBlob = new Blob([imageUint8Array], { type: imageMime });
        let imageFile = await ai.files.upload({
            file: imageBlob,
            config: { mimeType: imageMime }
          });
        console.log(`${imageType} image ${imageNumber} uploaded:`, imageFile.uri);
          
          // Wait for file to be ACTIVE
          const maxWaitTime = 60000;
          const checkInterval = 2000;
          const startTime = Date.now();
          
          const waitForFile = async (file: any, fileName: string) => {
            if (file.state === 'ACTIVE') return file;
            
            while (file.state !== 'ACTIVE') {
              if (Date.now() - startTime > maxWaitTime) {
              throw new Error(`Timeout waiting for ${imageType} image ${imageNumber} to be ready`);
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
          
        const imageFileName = imageFile.name || imageFile.uri?.split('/').pop() || '';
          if (imageFileName) {
          imageFile = await waitForFile(imageFile, imageFileName);
          if (!imageFile.uri) {
            throw new Error(`${imageType} image ${imageNumber} file is missing required URI property`);
          }
        }
        
        return imageFile;
        } catch (uploadError: any) {
        console.error(`Error uploading ${imageType} image ${imageNumber}:`, {
            message: uploadError.message,
            status: uploadError.status,
            code: uploadError.code,
            response: uploadError.response?.data,
            stack: process.env.NODE_ENV === 'development' ? uploadError.stack : undefined
          });
          
          // Check for API key errors
          if (uploadError.message?.includes('API key') || uploadError.message?.includes('API_KEY') || uploadError.status === 401) {
          throw new Error('Google Gemini API key is not valid');
        }
        
        throw uploadError;
      }
    };

    // Handle product images upload if provided
    const productImageFiles: any[] = [];
    if (productImagesArray.length > 0 && (style === 'design' || style === 'studio-quality' || style === 'hyperrealistic')) {
      const imagesToProcess = productImagesArray.slice(0, 3);
      
      for (let i = 0; i < imagesToProcess.length; i++) {
        try {
          const productImageFile = await uploadImageToGemini(imagesToProcess[i], i + 1, 'product');
          productImageFiles.push(productImageFile);
        } catch (uploadError: any) {
          if (uploadError.message === 'Google Gemini API key is not valid') {
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
              error: `Error uploading product image ${i + 1}`, 
              details: uploadError.message || `Could not upload product image ${i + 1} to Gemini Files`,
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

    // Handle character images upload if provided
    const characterImageFiles: any[] = [];
    if (characterImagesArray.length > 0 && (style === 'design' || style === 'studio-quality' || style === 'hyperrealistic')) {
      const imagesToProcess = characterImagesArray.slice(0, 3);
      
      for (let i = 0; i < imagesToProcess.length; i++) {
        try {
          const characterImageFile = await uploadImageToGemini(imagesToProcess[i], i + 1, 'character');
          characterImageFiles.push(characterImageFile);
        } catch (uploadError: any) {
          if (uploadError.message === 'Google Gemini API key is not valid') {
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
              error: `Error uploading character image ${i + 1}`, 
              details: uploadError.message || `Could not upload character image ${i + 1} to Gemini Files`,
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

    // Handle element images upload if provided (for change-elements style only)
    const elementImageFiles: any[] = [];
    if (elementImagesArray.length > 0 && style === 'change-elements') {
      const imagesToProcess = elementImagesArray.slice(0, 2);
      
      for (let i = 0; i < imagesToProcess.length; i++) {
        try {
          const elementImageFile = await uploadImageToGemini(imagesToProcess[i], i + 1, 'element');
          elementImageFiles.push(elementImageFile);
        } catch (uploadError: any) {
          if (uploadError.message === 'Google Gemini API key is not valid') {
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
              error: `Error uploading element image ${i + 1}`, 
              details: uploadError.message || `Could not upload element image ${i + 1} to Gemini Files`,
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
          const referenceImageAnalysisRequest = `You are an expert AI prompt engineer. Analyze the attached reference image (this is the MAIN REFERENCE IMAGE that will be uploaded to Nano Banana Pro model and placed FIRST) and create an EXTREMELY detailed, comprehensive prompt that would generate this exact image. 

**CRITICAL - THIS IS THE MAIN STYLE REFERENCE:**
This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. However, the FINAL PROMPT will be used with ONLY the product/character images attached - the reference image will NOT be attached to the final generation. Therefore, your description MUST be EXTREMELY detailed and specific so the model can replicate the EXACT style, angle, lighting, composition, and aesthetic without seeing the reference image.

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
Create an EXTREMELY detailed prompt that describes EVERYTHING that is actually visible in the image with maximum precision:

1. **Subject and Scene**: Describe the subject, scene, and content exactly as it appears - be VERY specific about poses, positions, expressions, clothing, objects, background elements

2. **Visual Style and Aesthetic**: Describe the aesthetic quality in extreme detail (hyperrealistic, realistic, cinematic, moody, dramatic, etc.) - be specific about the overall look and feel

3. **Lighting - EXTREME DETAIL REQUIRED**: Describe the lighting with MAXIMUM precision:
   - **Type**: Identify the EXACT type of lighting:
     * Natural daylight (soft window light, harsh direct sunlight, golden hour, blue hour, etc.)
     * Studio lighting (key light, fill light, rim light, hair light, etc.)
     * Flash photography (on-camera flash, off-camera flash, ring flash, bounce flash, etc.) - THIS IS CRITICAL to identify
     * Artificial lighting (LED, fluorescent, tungsten, neon, etc.)
     * Dramatic spotlight (single focused beam, multiple spotlights, etc.)
     * Soft diffused lighting (softbox, umbrella, natural diffusion, etc.)
     * Harsh directional lighting (hard shadows, strong contrast, etc.)
     * Ambient lighting (low light, available light, etc.)
     * Mixed lighting (combination of different types)
   - **Flash Photography Detection**: If flash is present, identify:
     * On-camera flash (direct flash, harsh shadows, characteristic flash look)
     * Off-camera flash (more natural, directional)
     * Ring flash (even lighting, minimal shadows, characteristic ring reflection in eyes)
     * Bounce flash (softer, more diffused)
     * Flash characteristics: harsh shadows, strong highlights, characteristic flash color temperature, flash reflections, catchlights in eyes
   - **Direction**: Where is the light coming from? (top, side, front, back, overhead, from left/right, etc.) - be SPECIFIC
   - **Intensity**: Is it bright, dim, medium? Are there strong highlights or soft illumination?
   - **Color Temperature**: Is it warm (yellowish/orange), cool (bluish), neutral? Describe the exact color cast
   - **Shadows**: Describe shadow placement, depth, softness/hardness, direction, color (warm shadows, cool shadows, etc.)
   - **Highlights**: Describe highlight placement, intensity, shape, reflections, specular highlights
   - **Lighting Quality**: Is it soft and diffused, hard and dramatic, even and flat, etc.?
   - **Multiple Light Sources**: If there are multiple lights, describe each one's position, intensity, color, and type
   - **Light Modifiers**: Identify any light modifiers (softbox, umbrella, reflector, diffuser, etc.)

4. **Camera Angle and Perspective - EXTREME DETAIL REQUIRED**: Describe with MAXIMUM precision:
   - **Exact Angle**: Is it frontal, side view, three-quarter, from above (high angle), from below (low angle), eye-level, etc.? - be VERY specific
   - **Distance**: Is it close-up, medium shot, wide shot, extreme close-up, full body, etc.?
   - **Perspective**: Is it straight-on, slightly angled, tilted, etc.?
   - **Framing**: How is the subject framed? Centered, off-center, rule of thirds, etc.?
   - **Camera Height**: Is the camera at eye level, above, below, etc.?
   - **Lens Type and Characteristics** - THIS IS CRITICAL to identify:
     * **Wide-angle lens**: Distortion at edges, exaggerated perspective, more background visible, characteristic wide-angle look
     * **Telephoto lens**: Compressed perspective, shallow depth of field, background compression, characteristic telephoto look
     * **Normal/Standard lens**: Natural perspective, balanced field of view
     * **Macro lens**: Extreme close-up capability, very shallow depth of field
     * **Fisheye lens**: Extreme distortion, curved lines, very wide field of view
     * **Lens characteristics**: Depth of field (shallow, deep), bokeh quality, distortion, compression, field of view
   - **Focal Length Indicators**: Analyze the image to determine if it looks like it was shot with:
     * Wide-angle (14mm-35mm): More background, exaggerated perspective
     * Standard (35mm-85mm): Natural perspective
     * Telephoto (85mm-200mm+): Compressed background, shallow depth of field
     * Ultra-wide or fisheye: Extreme distortion

5. **Composition**: Describe the framing, perspective, depth of field, focus with extreme detail:
   - What is in focus vs blurred?
   - Depth of field (shallow, deep, etc.)
   - Foreground, midground, background elements
   - Visual hierarchy and where the eye is drawn

6. **Textures**: Describe ALL visible textures in extreme detail:
   - Skin texture (pores, smoothness, roughness, etc.)
   - Fabric textures (smooth, rough, glossy, matte, etc.)
   - Material textures (metal, wood, fabric, etc.)
   - Surface qualities (reflective, matte, glossy, etc.)

7. **Colors**: Describe the color palette with extreme precision:
   - Dominant colors and their exact shades
   - Color temperature (warm, cool, neutral)
   - Saturation levels (vibrant, muted, desaturated, etc.)
   - Contrast levels (high, low, medium)
   - Color harmony and relationships

8. **Technical Details**: Describe image quality, sharpness, grain/noise, post-processing style:
   - Image sharpness and clarity
   - Any visible grain, noise, or texture
   - Post-processing style (color grading, filters, etc.)

9. **Atmosphere/Mood**: Describe the overall feeling and mood in detail:
   - Emotional tone (dramatic, peaceful, intense, etc.)
   - Visual mood (dark, bright, moody, cheerful, etc.)

10. **Background**: Describe the background in extreme detail:
    - What is visible in the background?
    - Is it blurred or in focus?
    - Colors, textures, and elements
    - How it relates to the subject

11. **Hyperrealism Level**: Describe the level of hyperrealism and photorealism:
    - How realistic does it look?
    - Any stylization or is it purely photorealistic?

**Critical Requirements:**
- **ONLY describe what is visible** - do not invent or assume
- **Be EXTREMELY specific and detailed** - the model will NOT see this reference image, so your description must be comprehensive enough to replicate it
- **EMPHASIZE lighting and camera angle** - these are the most critical elements that must be replicated exactly
- **Include ALL visual details** - composition, colors, textures, atmosphere, everything
- **The prompt must be detailed enough** that someone could recreate this image without seeing it

**Output Format:**
Provide ONLY the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete, extremely detailed prompt text that would generate this exact image. Describe it as a photo/image unless you can clearly see it's something else (like a screenshot with visible borders/UI). Make it as detailed and specific as possible.`;

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

    // If product images are provided, generate detailed prompts for each
    const productImagePrompts: string[] = [];
    const characterImagePrompts: string[] = [];
    let elementImagePrompts: string[] = [];
    
    if (productImageFiles.length > 0) {
      console.log(`Processing ${productImageFiles.length} product image(s)...`);
      
      for (let i = 0; i < productImageFiles.length; i++) {
        const productImageFile = productImageFiles[i];
        console.log(`Product image ${i + 1} file available:`, {
          hasUri: !!productImageFile.uri,
          mimeType: productImageFile.mimeType,
          state: productImageFile.state
        });
        
        // Verify the file is ready before using it
        if (productImageFile.uri) {
          console.log(`Generating detailed prompt for product image ${i + 1}...`);
          try {
            const productImageAnalysisRequest = `You are an expert AI prompt engineer. Analyze the attached reference image (Product Image ${i + 1} of ${productImageFiles.length}) and create a detailed, comprehensive prompt that would generate this exact image. 

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

            const productParts: any[] = [
              {
                fileData: {
                  fileUri: productImageFile.uri,
                  mimeType: productImageFile.mimeType || 'image/png'
                }
              },
              {
                text: productImageAnalysisRequest
              }
            ];

            const productResult = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [
                {
                  role: 'user',
                  parts: productParts
                }
              ]
            });

            // Extract the product image prompt
            let imagePrompt = '';
            if (productResult.candidates && productResult.candidates[0]?.content?.parts) {
              imagePrompt = productResult.candidates[0].content.parts
                .map((part: any) => part.text || '')
                .join('')
                .trim();
            } else if ((productResult as any).text) {
              imagePrompt = (productResult as any).text.trim();
            }

            if (imagePrompt && imagePrompt.length > 0) {
              console.log(`Product image ${i + 1} prompt generated, length:`, imagePrompt.length);
              productImagePrompts.push(imagePrompt);
            } else {
              console.warn(`Product image ${i + 1} prompt generation returned empty result`);
              productImagePrompts.push('');
            }
          } catch (refError: any) {
            console.error(`Error generating product image ${i + 1} prompt:`, {
              message: refError.message,
              status: refError.status,
              code: refError.code,
              stack: process.env.NODE_ENV === 'development' ? refError.stack : undefined
            });
            // Continue without reference prompt if it fails - will use image directly as fallback
            productImagePrompts.push('');
          }
        } else {
          console.warn(`Product image ${i + 1} file URI is missing, skipping reference prompt generation`);
          productImagePrompts.push('');
        }
      }
    }

    // If character images are provided, generate detailed prompts for each
    if (characterImageFiles.length > 0) {
      console.log(`Processing ${characterImageFiles.length} character image(s)...`);
      
      for (let i = 0; i < characterImageFiles.length; i++) {
        const characterImageFile = characterImageFiles[i];
        console.log(`Character image ${i + 1} file available:`, {
          hasUri: !!characterImageFile.uri,
          mimeType: characterImageFile.mimeType,
          state: characterImageFile.state
        });
        
        // Verify the file is ready before using it
        if (characterImageFile.uri) {
          console.log(`Generating detailed prompt for character image ${i + 1}...`);
          try {
            const characterImageAnalysisRequest = `You are an expert AI prompt engineer. Analyze the attached reference image (Character Image ${i + 1} of ${characterImageFiles.length}) and create a detailed, comprehensive prompt that would generate this exact image.

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

            const characterParts: any[] = [
              {
                fileData: {
                  fileUri: characterImageFile.uri,
                  mimeType: characterImageFile.mimeType || 'image/png'
                }
              },
              {
                text: characterImageAnalysisRequest
              }
            ];

            const characterResult = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [
                {
                  role: 'user',
                  parts: characterParts
                }
              ]
            });

            // Extract the character image prompt
            let imagePrompt = '';
            if (characterResult.candidates && characterResult.candidates[0]?.content?.parts) {
              imagePrompt = characterResult.candidates[0].content.parts
                .map((part: any) => part.text || '')
                .join('')
                .trim();
            } else if ((characterResult as any).text) {
              imagePrompt = (characterResult as any).text.trim();
            }

            if (imagePrompt && imagePrompt.length > 0) {
              console.log(`Character image ${i + 1} prompt generated, length:`, imagePrompt.length);
              characterImagePrompts.push(imagePrompt);
            } else {
              console.warn(`Character image ${i + 1} prompt generation returned empty result`);
              characterImagePrompts.push('');
            }
          } catch (refError: any) {
            console.error(`Error generating character image ${i + 1} prompt:`, {
              message: refError.message,
              status: refError.status,
              code: refError.code,
              stack: process.env.NODE_ENV === 'development' ? refError.stack : undefined
            });
            // Continue without reference prompt if it fails - will use image directly as fallback
            characterImagePrompts.push('');
          }
        } else {
          console.warn(`Character image ${i + 1} file URI is missing, skipping reference prompt generation`);
          characterImagePrompts.push('');
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

    // Helper function to build product/character instructions (used across all styles)
    const buildProductCharacterInstructions = () => {
      const validProductPrompts = productImagePrompts.filter((p) => p && p.trim().length > 0);
      const validCharacterPrompts = characterImagePrompts.filter((p) => p && p.trim().length > 0);
      
      let productInstructions = '';
      let characterInstructions = '';
      
      if (productImageFiles.length > 0) {
        productInstructions = `

**CRITICAL - PRODUCT IMAGES (MANDATORY REFERENCE - WILL BE ATTACHED):**
${productImageFiles.map((_, idx) => {
          const imgNum = idx + 1;
          const prompt = validProductPrompts[idx] || '';
          return `- **Product Image ${imgNum}**: This is a PRODUCT image that will be attached to the prompt. When referring to "the product" in your prompt, you MUST refer to it as "the product from the attached product image ${imgNum}" or "the attached product image ${imgNum}". ${prompt ? `The product looks like: "${prompt.substring(0, 200)}..."` : 'Analyze the attached product image to see the exact product details.'} You MUST use this EXACT product from the attached image - do NOT invent or create a different product.`;
        }).join('\n')}

**MANDATORY PRODUCT REFERENCE RULES:**
- When the user's description mentions "product", "the product", or any product reference, you MUST refer to it as "the product from the attached product image" or "the attached product image"
- You MUST describe the product based on what you see in the attached product image(s) - use exact details (colors, materials, textures, design, text, branding)
- NEVER invent product details - only use what is visible in the attached product image(s)
- If the user's description mentions product text being clear, ensure you specify that ALL text on the product from the attached image must be perfectly clear, legible, and crisp
- The product in the generated image MUST match the EXACT product from the attached product image(s)
- These product images will be attached to the prompt when used in the AI model`;
      }
      
      if (characterImageFiles.length > 0) {
        characterInstructions = `

**CHARACTER IMAGES (WILL BE ATTACHED):**
${characterImageFiles.map((_, idx) => {
          const imgNum = idx + 1;
          const prompt = validCharacterPrompts[idx] || '';
          return `- **Character Image ${imgNum}**: This character image will be attached to the prompt. ${prompt ? `The character looks like: "${prompt}"` : 'Use as character reference for appearance, pose, or styling.'}`;
        }).join('\n\n')}

These character images are additional references for character appearance, pose, or styling. They will be attached to the prompt when used in the AI model.`;
      }
      
      return { productInstructions, characterInstructions };
    };

    // Build reference image note - MAIN REFERENCE IMAGE is the primary style reference
    let referenceImageNote = '';
    if (style === 'hyperrealistic') {
      if (mainReferenceImageFile && mainReferenceImagePrompt) {
        // Main reference image with prompt - this is the PRIMARY style reference
        const { productInstructions, characterInstructions } = buildProductCharacterInstructions();
        
        // Build copy instructions based on user selection
        let copyInstructions = '';
        if (copyCameraAngle && copyLighting) {
          copyInstructions = `
- **EXACT camera angle and perspective** from the main reference - THIS IS ABSOLUTELY CRITICAL - The reference image prompt describes the EXACT camera angle, perspective, distance, framing, and composition. You MUST replicate these EXACTLY in your prompt. Include ALL details: the exact angle (frontal, side, three-quarter, high angle, low angle, etc.), the exact distance (close-up, medium shot, wide shot, etc.), the exact framing and composition, the exact camera height and perspective. The model will NOT see the reference image, so your description must be EXTREMELY detailed and specific.
- **EXACT lighting style** from the main reference - THIS IS ABSOLUTELY CRITICAL - The reference image prompt describes the EXACT lighting. You MUST replicate ALL lighting details EXACTLY: the type of lighting (natural, studio, dramatic, etc.), the EXACT direction the light comes from, the EXACT intensity and brightness, the EXACT color temperature (warm, cool, neutral), the EXACT shadow placement and characteristics, the EXACT highlight placement and intensity, any multiple light sources and their positions. The model will NOT see the reference image, so your description must be EXTREMELY detailed and specific about every aspect of the lighting.`;
        } else if (copyCameraAngle) {
          copyInstructions = `
- **EXACT camera angle and perspective** from the main reference - THIS IS ABSOLUTELY CRITICAL - The reference image prompt describes the EXACT camera angle, perspective, distance, framing, composition, and LENS TYPE. You MUST replicate these EXACTLY in your prompt. Include ALL details: the exact angle (frontal, side, three-quarter, high angle, low angle, etc.), the exact distance (close-up, medium shot, wide shot, etc.), the exact framing and composition, the exact camera height and perspective, and MOST IMPORTANTLY the EXACT lens type and characteristics (wide-angle, telephoto, normal, macro, fisheye, etc.) with all lens-specific characteristics (depth of field, bokeh, distortion, compression, field of view). The model will NOT see the reference image, so your description must be EXTREMELY detailed and specific about the lens and camera characteristics.`;
        } else if (copyLighting) {
          copyInstructions = `
- **EXACT lighting style** from the main reference - THIS IS ABSOLUTELY CRITICAL - The reference image prompt describes the EXACT lighting. You MUST replicate ALL lighting details EXACTLY: the EXACT type of lighting (natural daylight, studio lighting, FLASH PHOTOGRAPHY - on-camera flash, off-camera flash, ring flash, bounce flash, etc., artificial lighting, dramatic spotlight, soft diffused, harsh directional, ambient, mixed lighting, etc.), the EXACT direction the light comes from, the EXACT intensity and brightness, the EXACT color temperature (warm, cool, neutral), the EXACT shadow placement and characteristics (including flash shadows if present), the EXACT highlight placement and intensity (including flash highlights if present), any multiple light sources and their positions, any light modifiers (softbox, umbrella, reflector, etc.), and MOST IMPORTANTLY if flash is present, describe ALL flash characteristics (harsh shadows, strong highlights, flash color temperature, flash reflections, catchlights in eyes, etc.). The model will NOT see the reference image, so your description must be EXTREMELY detailed and specific about every aspect of the lighting, especially identifying and describing flash photography if present.`;
        }
        
        referenceImageNote = `\n\n**CRITICAL - MAIN REFERENCE IMAGE (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been provided and analyzed. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' Copy the camera angle and perspective.' : ''}${copyLighting ? ' Copy the lighting style.' : ''}` : ` The generated prompt MUST specify that the result must match this EXACT style, angle, lighting, and hyperrealism level.`}

**Main Reference Image Prompt (this defines the PRIMARY style that MUST be replicated exactly):**
"${mainReferenceImagePrompt}"

**CRITICAL - REFERENCE IMAGE WILL NOT BE ATTACHED TO FINAL GENERATION:**
⚠️ **ABSOLUTELY CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed FIRST, but the FINAL PROMPT you generate will be used with ONLY the product/character images attached. The reference image will NOT be attached to the final generation. Therefore, your prompt MUST be EXTREMELY detailed and specific about ALL visual characteristics from the reference image so the model can replicate them EXACTLY without seeing the reference.

**Your Task:**
You MUST use the main reference image prompt above as the PRIMARY style reference. This image defines the EXACT visual style that must be replicated. Your generated prompt must be EXTREMELY detailed and specific because the model will NOT see the reference image.${copyInstructions}
${!copyCameraAngle && !copyLighting ? `
- **EXACT camera angle and perspective** from the main reference - Extract ALL details from the reference prompt: exact angle (frontal, side, three-quarter, high angle, low angle, etc.), exact distance (close-up, medium shot, wide shot, etc.), exact framing and composition, exact camera height and perspective. Include ALL these details in your prompt.
- **EXACT lighting style** from the main reference - Extract ALL details from the reference prompt: type of lighting, EXACT direction, EXACT intensity, EXACT color temperature, EXACT shadow placement and characteristics, EXACT highlight placement and intensity, any multiple light sources. Include ALL these details in your prompt.` : ''}
- **EXACT texture quality and appearance** - Extract and include ALL texture details from the reference prompt
- **EXACT color palette** - Extract and include ALL color details: exact colors, color temperature, saturation, contrast, color harmony
- **EXACT composition and framing** - Extract and include ALL composition details: aspect ratio, layout structure, visual structure, depth of field, focus
- **EXACT overall aesthetic and visual style** - Extract and include ALL aesthetic details: look and feel, mood, atmosphere, visual quality, hyperrealism level
- **EXACT background** - Extract and include ALL background details from the reference prompt${productInstructions}${characterInstructions}

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
        const { productInstructions, characterInstructions } = buildProductCharacterInstructions();
        
        // Build copy instructions based on user selection
        let copyInstructionsNoPrompt = '';
        if (copyCameraAngle && copyLighting) {
          copyInstructionsNoPrompt = `
- **EXACT camera angle and perspective** from the main reference - THIS IS ABSOLUTELY CRITICAL - Analyze the attached reference image and extract ALL camera angle and LENS details: the exact angle (frontal, side, three-quarter, high angle, low angle, etc.), the exact distance (close-up, medium shot, wide shot, etc.), the exact framing and composition, the exact camera height and perspective, and MOST IMPORTANTLY identify the EXACT lens type (wide-angle, telephoto, normal, macro, fisheye, etc.) and describe ALL lens-specific characteristics (depth of field, bokeh quality, distortion, compression, field of view, focal length indicators). You MUST describe these EXACTLY in your prompt with maximum detail. The model will NOT see the reference image, so your description must be EXTREMELY detailed and specific about the lens and camera characteristics.
- **EXACT lighting style** from the main reference - THIS IS ABSOLUTELY CRITICAL - Analyze the attached reference image and extract ALL lighting details: identify the EXACT type of lighting (natural daylight, studio lighting, FLASH PHOTOGRAPHY - identify if it's on-camera flash, off-camera flash, ring flash, bounce flash, etc., artificial lighting, dramatic spotlight, soft diffused, harsh directional, ambient, mixed lighting, etc.), the EXACT direction the light comes from, the EXACT intensity and brightness, the EXACT color temperature (warm, cool, neutral), the EXACT shadow placement and characteristics (including flash shadows if flash is present), the EXACT highlight placement and intensity (including flash highlights if flash is present), any multiple light sources and their positions, any light modifiers (softbox, umbrella, reflector, etc.), and MOST IMPORTANTLY if flash photography is present, identify and describe ALL flash characteristics (harsh shadows, strong highlights, flash color temperature, flash reflections, catchlights in eyes, characteristic flash look, etc.). You MUST describe these EXACTLY in your prompt with maximum detail. The model will NOT see the reference image, so your description must be EXTREMELY detailed and specific about every aspect of the lighting, especially identifying and describing flash photography if present.`;
        } else if (copyCameraAngle) {
          copyInstructionsNoPrompt = `
- **EXACT camera angle and perspective** from the main reference - THIS IS ABSOLUTELY CRITICAL - Analyze the attached reference image and extract ALL camera angle and LENS details: the exact angle (frontal, side, three-quarter, high angle, low angle, etc.), the exact distance (close-up, medium shot, wide shot, etc.), the exact framing and composition, the exact camera height and perspective, and MOST IMPORTANTLY identify the EXACT lens type (wide-angle, telephoto, normal, macro, fisheye, etc.) and describe ALL lens-specific characteristics (depth of field, bokeh quality, distortion, compression, field of view, focal length indicators). You MUST describe these EXACTLY in your prompt with maximum detail. The model will NOT see the reference image, so your description must be EXTREMELY detailed and specific about the lens and camera characteristics.`;
        } else if (copyLighting) {
          copyInstructionsNoPrompt = `
- **EXACT lighting style** from the main reference - THIS IS ABSOLUTELY CRITICAL - Analyze the attached reference image and extract ALL lighting details: identify the EXACT type of lighting (natural daylight, studio lighting, FLASH PHOTOGRAPHY - identify if it's on-camera flash, off-camera flash, ring flash, bounce flash, etc., artificial lighting, dramatic spotlight, soft diffused, harsh directional, ambient, mixed lighting, etc.), the EXACT direction the light comes from, the EXACT intensity and brightness, the EXACT color temperature (warm, cool, neutral), the EXACT shadow placement and characteristics (including flash shadows if flash is present), the EXACT highlight placement and intensity (including flash highlights if flash is present), any multiple light sources and their positions, any light modifiers (softbox, umbrella, reflector, etc.), and MOST IMPORTANTLY if flash photography is present, identify and describe ALL flash characteristics (harsh shadows, strong highlights, flash color temperature, flash reflections, catchlights in eyes, characteristic flash look, etc.). You MUST describe these EXACTLY in your prompt with maximum detail. The model will NOT see the reference image, so your description must be EXTREMELY detailed and specific about every aspect of the lighting, especially identifying and describing flash photography if present.`;
        }
        
        referenceImageNote = `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been attached. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' Copy the camera angle and perspective.' : ''}${copyLighting ? ' Copy the lighting style.' : ''}` : ''}

**CRITICAL - REFERENCE IMAGE WILL NOT BE ATTACHED TO FINAL GENERATION:**
⚠️ **ABSOLUTELY CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed FIRST, but the FINAL PROMPT you generate will be used with ONLY the product/character images attached. The reference image will NOT be attached to the final generation. Therefore, you MUST analyze the reference image EXTREMELY carefully and extract ALL visual characteristics to include in your prompt with MAXIMUM detail so the model can replicate them EXACTLY without seeing the reference.

**Your Task - Analyze the Reference Image with EXTREME Detail:**
You MUST analyze the attached main reference image to understand EXACTLY how it looks. Extract and include ALL of these details in your prompt:

1. **Camera Angle and Perspective** - Analyze and extract ALL details:
   - Exact angle (frontal, side, three-quarter, high angle, low angle, eye-level, etc.)
   - Exact distance (close-up, medium shot, wide shot, extreme close-up, full body, etc.)
   - Exact framing (centered, off-center, rule of thirds, etc.)
   - Exact camera height (eye level, above, below, etc.)
   - Exact perspective (straight-on, slightly angled, tilted, etc.)
   - Lens perspective (wide-angle, telephoto, normal, etc.)

2. **Lighting Style** - Analyze and extract ALL details (THIS IS CRITICAL):
   - **Type of lighting** - Identify the EXACT type:
     * Natural daylight (soft window light, harsh direct sunlight, golden hour, blue hour, etc.)
     * Studio lighting (key light, fill light, rim light, hair light, etc.)
     * **FLASH PHOTOGRAPHY** - THIS IS CRITICAL to identify:
       - On-camera flash (direct flash, harsh shadows, characteristic flash look)
       - Off-camera flash (more natural, directional)
       - Ring flash (even lighting, minimal shadows, characteristic ring reflection in eyes)
       - Bounce flash (softer, more diffused)
       - Flash characteristics: harsh shadows, strong highlights, characteristic flash color temperature, flash reflections, catchlights in eyes
     * Artificial lighting (LED, fluorescent, tungsten, neon, etc.)
     * Dramatic spotlight (single focused beam, multiple spotlights, etc.)
     * Soft diffused lighting (softbox, umbrella, natural diffusion, etc.)
     * Harsh directional lighting (hard shadows, strong contrast, etc.)
     * Ambient lighting (low light, available light, etc.)
     * Mixed lighting (combination of different types)
   - EXACT direction the light comes from (top, side, front, back, overhead, from left/right, etc.) - be VERY specific
   - EXACT intensity (bright, dim, medium, etc.)
   - EXACT color temperature (warm/yellowish, cool/bluish, neutral, etc.)
   - EXACT shadow placement, depth, softness/hardness, direction, color (warm shadows, cool shadows, flash shadows, etc.)
   - EXACT highlight placement, intensity, shape, reflections, specular highlights (flash highlights if flash is present)
   - Lighting quality (soft and diffused, hard and dramatic, even and flat, etc.)
   - Multiple light sources (if present, describe each one's position, intensity, color, and type)
   - Light modifiers (softbox, umbrella, reflector, diffuser, etc.)

3. **Composition and Framing** - Analyze and extract ALL details:
   - What is in focus vs blurred?
   - Depth of field (shallow, deep, etc.)
   - Foreground, midground, background elements
   - Visual hierarchy and where the eye is drawn
   - Aspect ratio and layout structure

4. **Texture Quality and Appearance** - Analyze and extract ALL details:
   - Skin texture (pores, smoothness, roughness, etc.)
   - Fabric textures (smooth, rough, glossy, matte, etc.)
   - Material textures (metal, wood, fabric, etc.)
   - Surface qualities (reflective, matte, glossy, etc.)

5. **Color Palette** - Analyze and extract ALL details:
   - Dominant colors and their exact shades
   - Color temperature (warm, cool, neutral)
   - Saturation levels (vibrant, muted, desaturated, etc.)
   - Contrast levels (high, low, medium)
   - Color harmony and relationships

6. **Background and Environment** - Analyze and extract ALL details:
   - What is visible in the background?
   - Is it blurred or in focus?
   - Colors, textures, and elements
   - How it relates to the subject

7. **Overall Aesthetic and Visual Style** - Analyze and extract ALL details:
   - Look and feel
   - Mood and atmosphere
   - Visual quality
   - Hyperrealism level
   - Post-processing style (color grading, filters, etc.)

8. **If there's a person**: their appearance, facial features, hair, skin tone, body type, clothing style, and all physical characteristics

**Your Generated Prompt Must:**
- **Extract ALL visual details** from the reference image and include them in your prompt with EXTREME detail - be comprehensive
- **Be EXTREMELY specific** about camera angle, lighting, composition, colors, textures, background, and aesthetic - include every detail
- **Include the user's description** ("${description}") while maintaining the EXACT style from the reference
- **Ensure the result looks IDENTICAL** to the reference image in terms of style, angle, lighting, composition, colors, textures, and aesthetic, but with the content/subject from the user's description
- **Remember**: The model will NOT see the reference image, so your description must be detailed enough to recreate it exactly

**CRITICAL REQUIREMENTS:**
${!copyCameraAngle && !copyLighting ? `
  - **EXACT camera angle and perspective** - Extract ALL details from the reference and include them in your prompt with maximum specificity
  - **EXACT composition and framing** - Extract ALL details from the reference and include them in your prompt
  - **EXACT lighting style** - Extract ALL details from the reference and include them in your prompt with maximum specificity - THIS IS CRITICAL` : ''}
  - **EXACT texture quality** - Extract and include ALL texture details from the reference
  - **EXACT color palette** - Extract and include ALL color details from the reference
  - **EXACT overall aesthetic** - Extract and include ALL aesthetic details from the reference
  - **EXACT background** - Extract and include ALL background details from the reference
  - Keep the EXACT same camera angle, composition, lighting, textures, colors, and aesthetic from the main reference${copyCameraAngle ? ' - CRITICAL: The camera angle MUST be copied exactly from the reference image with ALL details' : ''}${copyLighting ? ' - CRITICAL: The lighting MUST be copied exactly from the reference image with ALL details' : ''}
  - Change only the CONTENT/SUBJECT to match the user's description
  - The result should look IDENTICAL to the main reference image in terms of style, angle, lighting, and hyperrealism, but with the content/subject the user requested

- **CRITICAL**: The generated prompt must specify that the result must match the EXACT style, angle, lighting, and hyperrealism from the main reference image. This image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication.${copyInstructionsNoPrompt}${productInstructions}${characterInstructions}`;
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
  - **Reference image priority**: ${mainReferenceImageFile ? (copyCameraAngle ? 'If a main reference image is provided, you MUST copy the EXACT camera angle and perspective from the main reference image. This is CRITICAL - the camera angle MUST be replicated exactly. The main reference image will be uploaded to Nano Banana Pro and placed first, so the camera angle must be matched precisely.' : mainReferenceImagePrompt ? 'If a main reference image is provided, you MUST respect the EXACT camera angle, composition, and visual style from the main reference image. The main reference image prompt describes exactly how the reference looks - match that EXACTLY in terms of angle, composition, lighting, and aesthetic, but adapt the content to the user\'s description. This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly.' : 'If a main reference image is provided, analyze it and match its camera angle and perspective exactly. This image will be uploaded to Nano Banana Pro and placed first.') : 'Choose the most natural camera angle and framing that fits the scene described.'}
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
  - **Reference image priority**: ${mainReferenceImageFile ? (copyCameraAngle ? 'If a main reference image is provided, you MUST copy the EXACT camera angle and perspective from the main reference image. This is CRITICAL - the camera angle MUST be replicated exactly. The main reference image will be uploaded to Nano Banana Pro and placed first, so the camera angle must be matched precisely.' : mainReferenceImagePrompt ? 'If a main reference image is provided, match the EXACT camera angle and perspective from the main reference image. The main reference image prompt describes exactly how the reference looks - respect that EXACTLY. This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly.' : 'If a main reference image is provided, analyze it and match its camera angle and perspective exactly. This image will be uploaded to Nano Banana Pro and placed first.') : 'Choose the most natural camera angle that fits the scene.'}

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
      // Build copy instructions based on user selection
      let copyInstructionsStudio = '';
      if (copyCameraAngle && copyLighting) {
        copyInstructionsStudio = `
- **EXACT camera angle and perspective** from the main reference (frontal, side, three-quarter, from above, from below, etc.) - THIS IS CRITICAL - MUST be copied exactly
- **EXACT composition and framing** (close-up, medium shot, wide shot, etc.) - MUST be copied exactly
- **EXACT lighting style** (same type, direction, intensity, color temperature, shadows, highlights) - THIS IS CRITICAL - MUST be copied exactly`;
      } else if (copyCameraAngle) {
        copyInstructionsStudio = `
- **EXACT camera angle and perspective** from the main reference (frontal, side, three-quarter, from above, from below, etc.) - THIS IS CRITICAL - MUST be copied exactly
- **EXACT composition and framing** (close-up, medium shot, wide shot, etc.) - MUST be copied exactly`;
      } else if (copyLighting) {
        copyInstructionsStudio = `
- **EXACT lighting style** (same type, direction, intensity, color temperature, shadows, highlights) - THIS IS CRITICAL - MUST be copied exactly`;
      }
      
      const referenceImageNote = mainReferenceImageFile && mainReferenceImagePrompt ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE PROMPT (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been provided and analyzed. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' Copy the camera angle and perspective.' : ''}${copyLighting ? ' Copy the lighting style.' : ''}` : ' The generated prompt MUST specify that the result must match this EXACT style, lighting, and professional quality.'}

**Main Reference Image Prompt (use this as PRIMARY style reference):**
"${mainReferenceImagePrompt}"

**Your Task:**
You MUST use the main reference image prompt above as the PRIMARY style guide. This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly. Incorporate the same visual style, lighting, textures, colors, composition, and aesthetic quality:${copyInstructionsStudio}
${!copyCameraAngle && !copyLighting ? `
- **Mimic the lighting style**: Use the EXACT same type of lighting described in the main reference prompt (studio, natural, artificial, etc.), same direction, intensity, color temperature, shadows, and highlights - THIS IS CRITICAL
- **Match the texture quality**: Incorporate the EXACT same texture characteristics and material appearance as described in the main reference
- **Match the color palette**: Use the EXACT same color temperature, saturation, contrast, and color harmony as described in the main reference
- **Match the composition style**: Use the EXACT same camera angles, framing, perspective, depth of field as the main reference` : ''}
- **Match the overall aesthetic**: If the main reference is studio-quality, maintain studio quality; match the overall visual style and professional photography approach
- **Apply to user's description**: While using the main reference as PRIMARY style guide, create a prompt for what the user described: "${description}"
- **Combine both**: The final prompt should describe the user's request but with the EXACT visual style, lighting, textures, and aesthetic of the main reference image${copyCameraAngle ? ' - CRITICAL: The camera angle MUST be copied exactly from the reference image' : ''}${copyLighting ? ' - CRITICAL: The lighting MUST be copied exactly from the reference image' : ''}

**CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication.` : mainReferenceImageFile ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been attached. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' Copy the camera angle and perspective.' : ''}${copyLighting ? ' Copy the lighting style.' : ''}` : ''} You MUST:
- **Analyze the attached main reference image** to understand its composition, colors, style, lighting, and aesthetic - THIS IS CRITICAL
- **Base your prompt on the main reference image** - use it as the PRIMARY guide for composition, colors, lighting style, and overall aesthetic
- **Maintain EXACT consistency with the main reference** - if the main reference shows specific colors, lighting, composition, or style elements, incorporate those EXACTLY into the prompt:${copyInstructionsStudio}
${!copyCameraAngle && !copyLighting ? `
  - **EXACT camera angle and perspective** - match the main reference image's camera angle precisely
  - **EXACT composition and framing** - match the main reference image's framing and composition
  - **EXACT lighting style** - match the main reference image's lighting characteristics - THIS IS CRITICAL` : ''}
- **Enhance while preserving essence** - build upon the main reference image's aesthetic while applying professional studio photography quality
- **Mention the main reference explicitly** - In your generated prompt, explicitly state that the image generation should follow the EXACT aesthetic, composition, colors, lighting, and style of the attached main reference image${copyCameraAngle ? ' - CRITICAL: The camera angle MUST be copied exactly from the reference image' : ''}${copyLighting ? ' - CRITICAL: The lighting MUST be copied exactly from the reference image' : ''}
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
      const { productInstructions, characterInstructions } = buildProductCharacterInstructions();
      
      // Build copy instructions based on user selection
      let copyInstructionsDesign = '';
      if (copyCameraAngle && copyLighting) {
        copyInstructionsDesign = `
- **Match the composition**: Use the EXACT same layout structure, element placement, and composition principles as the main reference - THIS IS CRITICAL
- **Match lighting and textures**: If applicable, use the EXACT same lighting effects, texture treatments, and material appearances as described in the main reference - THIS IS CRITICAL`;
      } else if (copyCameraAngle) {
        copyInstructionsDesign = `
- **Match the composition**: Use the EXACT same layout structure, element placement, and composition principles as the main reference - THIS IS CRITICAL`;
      } else if (copyLighting) {
        copyInstructionsDesign = `
- **Match lighting and textures**: If applicable, use the EXACT same lighting effects, texture treatments, and material appearances as described in the main reference - THIS IS CRITICAL`;
      }
      
      const referenceImageNote = mainReferenceImageFile && mainReferenceImagePrompt ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE PROMPT (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been provided and analyzed. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.` : ` The generated prompt MUST specify that the result must match this EXACT design style, colors, and visual aesthetics.`}

**Main Reference Image Prompt (use this as PRIMARY style reference):**
"${mainReferenceImagePrompt}"

**Your Task:**
You MUST use the main reference image prompt above as the PRIMARY style guide. This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly. Incorporate the same visual style, lighting, textures, colors, composition, and aesthetic quality:${copyInstructionsDesign}
${!copyCameraAngle && !copyLighting ? `
- **Match the composition**: Use the EXACT same layout structure, element placement, and composition principles as the main reference
- **Match lighting and textures**: If applicable, use the EXACT same lighting effects, texture treatments, and material appearances as described in the main reference` : ''}
- **Mimic the design style**: Use the EXACT same design approach, layout style, visual hierarchy, and design language as described in the main reference prompt
- **Match the color palette**: Use the EXACT same color schemes, color harmony, saturation, and contrast as described in the main reference
- **Match the typography style**: If the main reference mentions typography, use the EXACT same typography choices, font styles, and text treatment
- **Match the overall aesthetic**: If the main reference is a design/infographic style, maintain that design aesthetic; match the overall visual style
- **Apply to user's description**: While using the main reference as PRIMARY style guide, create a prompt for what the user described: "${description}"
- **Combine both**: The final prompt should describe the user's request but with the EXACT design style, colors, layout, typography, and aesthetic of the main reference image${productInstructions}${characterInstructions}

**CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication.` : mainReferenceImageFile ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been attached. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' Copy the camera angle and perspective (or composition/viewpoint for design work).' : ''}${copyLighting ? ' Copy the lighting style.' : ''}` : ''} You MUST:
- **Analyze the attached main reference image** to understand its design style, layout, colors, typography, and visual elements - THIS IS CRITICAL
- **Base your prompt on the main reference image** - use it as the PRIMARY guide for design style, composition, color palette, typography choices, and overall aesthetic
- **Maintain EXACT consistency with the main reference** - if the main reference shows specific design patterns, color schemes, layout structures, or style elements, incorporate those EXACTLY into the prompt:${copyInstructionsDesign}
${!copyCameraAngle && !copyLighting ? `
  - **Match the composition**: Use the EXACT same layout structure, element placement, and composition principles as the main reference
  - **Match lighting and textures**: If applicable, use the EXACT same lighting effects, texture treatments, and material appearances as described in the main reference` : ''}
- **Enhance while preserving essence** - build upon the main reference image's design aesthetic while applying professional design principles
- **Mention the main reference explicitly** - In your generated prompt, explicitly state that the image generation should follow the EXACT design style, layout, colors, typography, and aesthetic of the attached main reference image${copyCameraAngle ? ' - CRITICAL: The camera angle/composition/viewpoint MUST be copied exactly from the reference image' : ''}${copyLighting ? ' - CRITICAL: The lighting MUST be copied exactly from the reference image' : ''}
- **Professional design enhancement** - Apply professional design principles (visual hierarchy, balanced composition, color harmony) while respecting the main reference image's design language${productInstructions}${characterInstructions}
- **CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication` : `${productInstructions}${characterInstructions}`;

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
    
    // Process element images if provided (for change-elements style only)
    if (elementImageFiles.length > 0 && style === 'change-elements') {
      console.log(`Processing ${elementImageFiles.length} element image(s)...`);
      
      for (let i = 0; i < elementImageFiles.length; i++) {
        const elementImageFile = elementImageFiles[i];
        console.log(`Element image ${i + 1} file available:`, {
          hasUri: !!elementImageFile.uri,
          mimeType: elementImageFile.mimeType,
          state: elementImageFile.state
        });
        
        // Verify the file is ready before using it
        if (elementImageFile.uri) {
          try {
            const elementImageAnalysisRequest = `You are an expert AI prompt engineer. Analyze the attached element image (this is an ELEMENT that will replace something in the base image) and create a detailed, comprehensive description of this element.

**CRITICAL - THIS IS AN ELEMENT TO REPLACE:**
This element image will be used to replace a corresponding element in the base image. You must describe this element in detail so it can be accurately placed in the base image.

**Your Task:**
Create an extremely detailed description of this element:
1. **What the element is**: Describe exactly what this element is (product, person, object, etc.)
2. **Visual appearance**: Describe the exact visual appearance - colors, textures, materials, design, shape, size
3. **Details**: Describe all visible details, patterns, text, logos, or distinctive features
4. **Style**: Describe the style and aesthetic of this element
5. **Condition**: Describe the condition, wear, or state of the element if relevant

**Output Format:**
Provide ONLY the detailed description as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete description text.`;

            const elementParts: any[] = [
              {
                fileData: {
                  fileUri: elementImageFile.uri,
                  mimeType: elementImageFile.mimeType || 'image/png'
                }
              },
              {
                text: elementImageAnalysisRequest
              }
            ];

            const elementResult = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [
                {
                  role: 'user',
                  parts: elementParts
                }
              ]
            });

            // Extract the element image prompt
            let elementPrompt = '';
            if (elementResult.candidates && elementResult.candidates[0]?.content?.parts) {
              elementPrompt = elementResult.candidates[0].content.parts
                .map((part: any) => part.text || '')
                .join('')
                .trim();
            } else if ((elementResult as any).text) {
              elementPrompt = (elementResult as any).text.trim();
            }

            if (elementPrompt && elementPrompt.length > 0) {
              console.log(`Element image ${i + 1} prompt generated, length:`, elementPrompt.length);
              elementImagePrompts.push(elementPrompt);
            } else {
              console.warn(`Element image ${i + 1} prompt generation returned empty result`);
              elementImagePrompts.push('');
            }
          } catch (refError: any) {
            console.error(`Error generating element image ${i + 1} prompt:`, {
              message: refError.message,
              status: refError.status,
              code: refError.code,
              stack: process.env.NODE_ENV === 'development' ? refError.stack : undefined
            });
            // Continue without reference prompt if it fails - will use image directly as fallback
            elementImagePrompts.push('');
          }
        } else {
          console.warn(`Element image ${i + 1} file URI is missing, skipping reference prompt generation`);
          elementImagePrompts.push('');
        }
      }
    }

    } else if (style === 'change-elements') {
      // Change Elements mode: replace specific elements in the base image with new elements
      // CRITICAL: Must maintain the EXACT format/type of image (screenshot, photo, etc.) unless user explicitly asks to change it
      
      // Build element replacement instructions
      let elementReplacementInstructions = '';
      if (elementImageFiles.length > 0 && elementImagePrompts.length > 0) {
        elementReplacementInstructions = `\n\n**CRITICAL - ELEMENTS TO REPLACE:**
The following element images have been provided and will be attached to the prompt. These elements MUST replace the corresponding elements in the base image:

${elementImagePrompts.map((prompt, index) => {
          if (prompt && prompt.length > 0) {
            return `**Element ${index + 1}** (attached image): ${prompt}`;
          } else {
            return `**Element ${index + 1}** (attached image): This element image will be attached. Analyze it and replace the corresponding element in the base image with this exact element.`;
          }
        }).join('\n\n')}

**CRITICAL REPLACEMENT REQUIREMENTS:**
- The base image will be uploaded to Nano Banana Pro and placed FIRST
- The element images will be attached after the base image
- You MUST create a prompt that describes the base image EXACTLY as it is, but with the attached elements replacing the corresponding original elements
- Maintain the EXACT same camera angle, lighting, composition, background, and all other visual characteristics from the base image
- ONLY replace the elements - everything else must remain identical
- The replaced elements must fit naturally into the base image's style, lighting, and perspective
- If the base image has a product, replace it with Element 1 (if provided)
- If the base image has a person/character, replace them with Element 2 (if provided)
- Match the lighting, shadows, and perspective of the base image for the replaced elements`;
      } else if (elementImageFiles.length > 0) {
        elementReplacementInstructions = `\n\n**CRITICAL - ELEMENTS TO REPLACE:**
The following element images have been provided and will be attached to the prompt. These elements MUST replace the corresponding elements in the base image:

${elementImageFiles.map((_, index) => {
          return `**Element ${index + 1}** (attached image): This element image will be attached. Analyze it and replace the corresponding element in the base image with this exact element.`;
        }).join('\n\n')}

**CRITICAL REPLACEMENT REQUIREMENTS:**
- The base image will be uploaded to Nano Banana Pro and placed FIRST
- The element images will be attached after the base image
- You MUST create a prompt that describes the base image EXACTLY as it is, but with the attached elements replacing the corresponding original elements
- Maintain the EXACT same camera angle, lighting, composition, background, and all other visual characteristics from the base image
- ONLY replace the elements - everything else must remain identical
- The replaced elements must fit naturally into the base image's style, lighting, and perspective`;
      }
      
      const { productInstructions, characterInstructions } = buildProductCharacterInstructions();
      
      // Build copy instructions based on user selection
      let copyInstructionsCopy = '';
      if (copyCameraAngle && copyLighting) {
        copyInstructionsCopy = `
  - **EXACT camera angle and perspective** - THIS IS CRITICAL - MUST be preserved exactly
  - **EXACT lighting style** (same type, direction, intensity, color temperature) - THIS IS CRITICAL - MUST be preserved exactly`;
      } else if (copyCameraAngle) {
        copyInstructionsCopy = `
  - **EXACT camera angle and perspective** - THIS IS CRITICAL - MUST be preserved exactly`;
      } else if (copyLighting) {
        copyInstructionsCopy = `
  - **EXACT lighting style** (same type, direction, intensity, color temperature) - THIS IS CRITICAL - MUST be preserved exactly`;
      }
      
      let referenceImageNote = '';
      if (mainReferenceImageFile && mainReferenceImagePrompt) {
        referenceImageNote = `\n\n**CRITICAL - MAIN REFERENCE IMAGE PROMPT (BASE FOR ITERATION - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been provided and analyzed. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' Copy the camera angle and perspective.' : ''}${copyLighting ? ' Copy the lighting style.' : ''}` : ` The generated prompt MUST specify that the result must match this EXACT style, angle, lighting, and hyperrealism level.`}

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

- **MAINTAIN EXACT VISUAL CHARACTERISTICS**: Keep EVERYTHING from the main reference image prompt EXACTLY as described:${copyInstructionsCopy}
${!copyCameraAngle && !copyLighting ? `
  - **EXACT camera angle and perspective** - THIS IS CRITICAL
  - **EXACT lighting style** (same type, direction, intensity, color temperature) - THIS IS CRITICAL` : ''}
  - **EXACT format/type** (screenshot, photo, mockup, etc.) - DO NOT change unless user explicitly requests format change
  - **EXACT device/medium** (iPhone screen, iPhone camera, computer screen, etc.) - DO NOT change unless user explicitly requests it
  - **EXACT composition and framing** (same aspect ratio, same layout structure, same visual structure)
  - **EXACT texture quality and appearance** (same level of detail, same material appearance)
  - **EXACT color palette** (same color temperature, saturation, contrast)
  - **EXACT overall aesthetic and visual style** (same look and feel)

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

**CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication. The output must describe the main reference image with the requested modifications applied, maintaining the EXACT format/type, angle, lighting, and all other characteristics unless explicitly changed by the user.${elementReplacementInstructions}${productInstructions}${characterInstructions}`;
      } else if (mainReferenceImageFile) {
        // Main reference image provided but no prompt generated - use image directly
        // Build copy instructions for change-elements when no prompt is generated
        let copyInstructionsCopyNoPrompt = '';
        if (copyCameraAngle && copyLighting) {
          copyInstructionsCopyNoPrompt = `
  - **EXACT camera angle and perspective** - THIS IS CRITICAL - MUST be preserved exactly
  - **EXACT lighting style** (same type, direction, intensity, color temperature) - THIS IS CRITICAL - MUST be preserved exactly`;
        } else if (copyCameraAngle) {
          copyInstructionsCopyNoPrompt = `
  - **EXACT camera angle and perspective** - THIS IS CRITICAL - MUST be preserved exactly`;
        } else if (copyLighting) {
          copyInstructionsCopyNoPrompt = `
  - **EXACT lighting style** (same type, direction, intensity, color temperature) - THIS IS CRITICAL - MUST be preserved exactly`;
        }
        
        referenceImageNote = `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (BASE FOR ITERATION - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
A main reference image has been attached. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' Copy the camera angle and perspective.' : ''}${copyLighting ? ' Copy the lighting style.' : ''}` : ''} You MUST:

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

- **MAINTAIN EXACT VISUAL CHARACTERISTICS**: Keep EVERYTHING from the main reference image EXACTLY:${copyInstructionsCopyNoPrompt}
${!copyCameraAngle && !copyLighting ? `
  - **EXACT camera angle and perspective** - THIS IS CRITICAL
  - **EXACT lighting style** (same type, direction, intensity, color temperature) - THIS IS CRITICAL` : ''}
  - **EXACT format/type** (screenshot, photo, mockup, etc.) - DO NOT change unless user explicitly requests format change
  - **EXACT device/medium** (iPhone screen, iPhone camera, computer screen, etc.) - DO NOT change unless user explicitly requests it
  - **EXACT composition and framing** (same aspect ratio, same layout structure, same visual structure)
  - **EXACT texture quality** (same level of detail, same material appearance)
  - **EXACT color palette** (same color temperature, saturation, contrast)
  - **EXACT overall aesthetic** (same look and feel)

- **ONLY CHANGE WHAT USER EXPLICITLY REQUESTS**: 
  - If user says "change background" → Keep the EXACT format but change the background content
  - If user says "change text" → Keep the EXACT format but change the text content
  - If user says "change colors" → Keep the EXACT format but change colors
  - If user says "change to photo" or "change format" → THEN you can change the format/type
  - If user does NOT mention format/type change → KEEP THE EXACT FORMAT/TYPE FROM MAIN REFERENCE${elementReplacementInstructions}${productInstructions}${characterInstructions}

**CRITICAL**: The main reference image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication. The output must describe the main reference image with the requested modifications applied, maintaining the EXACT format/type, angle, lighting, and all other characteristics unless explicitly changed by the user.${elementReplacementInstructions}${productInstructions}${characterInstructions}`;
      } else {
        const { productInstructions: pi, characterInstructions: ci } = buildProductCharacterInstructions();
        referenceImageNote = `${elementReplacementInstructions}${pi}${ci}`;
      }

      styleInstructions = `**CHANGE ELEMENTS IN IMAGE MODE - EXACT FORMAT PRESERVATION:**

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
        : style === 'change-elements'
        ? 'element replacement in image'
        : 'professional design';
    
    const styleApplicationNote = style === 'hyperrealistic' 
      ? 'IF UGC is detected: Use iPhone/hyperrealistic UGC style. IF UGC is NOT detected: Use cinematic, professional, or high-production quality (still hyperrealistic, but NOT iPhone/UGC).'
      : style === 'studio-quality' 
        ? 'Use professional studio photography quality'
        : style === 'change-elements'
        ? 'Replace specific elements in the base image with new elements while maintaining all other characteristics'
        : 'Use professional design quality';
    
    const criticalRequirementsNote = style === 'hyperrealistic' 
      ? '**CRITICAL**: You MUST analyze the description first. If it explicitly mentions UGC, user-generated, casual, amateur, iPhone video, or similar UGC indicators, use iPhone/UGC style. If it mentions cinematic, professional, high-production, or suggests polished content, use cinematic/professional style (NOT iPhone/UGC). If it is ambiguous, choose the style that best fits the description.'
      : '';

    // Build the critical requirements section to avoid template literal nesting issues
    const criticalRequirementsSection = criticalRequirementsNote 
      ? '- ' + criticalRequirementsNote + '\n'
      : '';

    // For change-elements, use a different prompt structure
    const promptGenerationRequest = style === 'change-elements' 
      ? styleInstructions // For change-elements, styleInstructions already contains the full prompt
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
      
      // Include main reference image if provided (always include for change-elements, or if no prompt was generated)
      if (mainReferenceImageFile && (style === 'change-elements' || !mainReferenceImagePrompt)) {
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
      
      // Include element images if provided (for change-elements style only, attach after main reference image)
      if (elementImageFiles.length > 0 && style === 'change-elements') {
        console.log(`Adding ${elementImageFiles.length} element image(s) to prompt:`, {
          hasUris: elementImageFiles.map(f => !!f.uri),
          mimeTypes: elementImageFiles.map(f => f.mimeType)
        });
        
        // Add all element images
        for (const elementImageFile of elementImageFiles) {
          if (!elementImageFile.uri) {
            console.warn('Element image file missing URI, skipping');
            continue;
          }
          
          parts.push({
            fileData: {
              fileUri: elementImageFile.uri,
              mimeType: elementImageFile.mimeType || 'image/png'
            }
          });
        }
      }
      
      // Include product images if provided (attach after main reference image)
      if (productImageFiles.length > 0) {
        console.log(`Adding ${productImageFiles.length} product image(s) to prompt:`, {
          hasUris: productImageFiles.map(f => !!f.uri),
          mimeTypes: productImageFiles.map(f => f.mimeType)
        });
        
        // Add all product images
        for (const imageFile of productImageFiles) {
          if (!imageFile.uri) {
            console.error('Product image file missing URI');
            return NextResponse.json(
              { error: 'Product image file is missing URI property', details: 'The uploaded product image file does not have a valid URI' },
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

      // Include character images if provided (attach after product images)
      if (characterImageFiles.length > 0) {
        console.log(`Adding ${characterImageFiles.length} character image(s) to prompt:`, {
          hasUris: characterImageFiles.map(f => !!f.uri),
          mimeTypes: characterImageFiles.map(f => f.mimeType)
        });
        
        // Add all character images
        for (const imageFile of characterImageFiles) {
          if (!imageFile.uri) {
            console.error('Character image file missing URI');
            return NextResponse.json(
              { error: 'Character image file is missing URI property', details: 'The uploaded character image file does not have a valid URI' },
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
        hasProductImages: productImageFiles.length > 0,
        hasCharacterImages: characterImageFiles.length > 0,
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

