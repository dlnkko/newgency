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
    
    let body: any;
    try {
      body = await request.json();
    } catch (jsonError: any) {
      console.error('Error parsing request body:', jsonError);
      return NextResponse.json(
        {
          error: 'Invalid request format',
          details: 'The request body is not valid JSON. Please try again.'
        },
        { status: 400 }
      );
    }
    
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
    
    const { description, style, referenceImage, referenceImages, copyCameraAngle, copyLighting, attachReferenceAsReferenceOnly, cameraAngle, lighting, productImages, characterImages, elementImages, firstFrameFromVideo, forceSameCharacterReference } = body;

    const hasUserCameraAngleSelection =
      Array.isArray(cameraAngle) && cameraAngle.length > 0;

    const lightingLowerForRing =
      typeof lighting === 'string' ? lighting.toLowerCase() : '';
    const isRingLighting = lightingLowerForRing.includes('ring');
    
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

    if (!style || !['hyperrealistic-ugc', 'hyperrealistic-cinematic', 'studio-quality', 'design', 'change-elements'].includes(style)) {
      return NextResponse.json(
        { error: 'Valid style is required (hyperrealistic-ugc, hyperrealistic-cinematic, studio-quality, design, or change-elements)' },
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

    // Handle main reference image upload if provided (for design, studio-quality, hyperrealistic variants, and change-elements styles)
    let mainReferenceImageFile: any = null;
    if (mainReferenceImage && (style === 'design' || style === 'studio-quality' || style === 'hyperrealistic-ugc' || style === 'hyperrealistic-cinematic' || style === 'change-elements')) {
      try {
        console.log('Uploading main reference image to Gemini Files...');
        
        // Validate base64 image format
        if (!mainReferenceImage.includes(',')) {
          return NextResponse.json(
            { 
              error: 'Invalid image format', 
              details: 'The reference image is not in a valid base64 format. Please try uploading the image again.'
            },
            { status: 400 }
          );
        }
        
        let referenceBuffer: Buffer;
        try {
          const base64Data = mainReferenceImage.split(',')[1];
          if (!base64Data || base64Data.trim() === '') {
            throw new Error('Empty base64 data');
          }
          referenceBuffer = Buffer.from(base64Data, 'base64');
          if (referenceBuffer.length === 0) {
            throw new Error('Invalid base64 data');
          }
        } catch (base64Error: any) {
          console.error('Error parsing base64 image:', base64Error);
          return NextResponse.json(
            { 
              error: 'Invalid image data', 
              details: 'The reference image data is corrupted or invalid. Please try uploading the image again.'
            },
            { status: 400 }
          );
        }
        
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
        
        // If Gemini is temporarily unavailable (503), gracefully continue WITHOUT reference image
        if (uploadError.status === 503 || uploadError.message?.includes('Service Unavailable')) {
          console.warn('Gemini Files service unavailable (503). Continuing without main reference image.');
          mainReferenceImageFile = null;
        } else if (uploadError.message?.includes('API key') || uploadError.message?.includes('API_KEY') || uploadError.status === 401) {
          // API key / auth problems should still surface clearly
          return NextResponse.json(
            { 
              error: 'Google Gemini API key is not valid', 
              details: 'The GOOGLE_GENAI_API_KEY environment variable is not valid or has expired. Please verify it in your production environment settings (Vercel dashboard → Settings → Environment Variables).'
            },
            { status: 401 }
          );
        } else {
          // Other unexpected errors: log and continue without reference image instead of failing the whole request
          console.warn('Non-fatal error uploading main reference image. Continuing without reference image.');
          mainReferenceImageFile = null;
        }
      }
    }

    // Helper function to upload images to Gemini Files
    const uploadImageToGemini = async (imageBase64: string, imageNumber: number, imageType: 'product' | 'character' | 'element'): Promise<any> => {
      try {
        console.log(`Uploading ${imageType} image ${imageNumber} to Gemini Files...`);
        
        // Validate base64 image format
        if (!imageBase64.includes(',')) {
          throw new Error(`Invalid ${imageType} image format: not in valid base64 format`);
        }
        
        let imageBuffer: Buffer;
        try {
          const base64Data = imageBase64.split(',')[1];
          if (!base64Data || base64Data.trim() === '') {
            throw new Error('Empty base64 data');
          }
          imageBuffer = Buffer.from(base64Data, 'base64');
          if (imageBuffer.length === 0) {
            throw new Error('Invalid base64 data');
          }
        } catch (base64Error: any) {
          console.error(`Error parsing base64 ${imageType} image ${imageNumber}:`, base64Error);
          throw new Error(`Invalid ${imageType} image data: corrupted or invalid base64 format`);
        }
        
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
    if (characterImagesArray.length > 0 && (style === 'design' || style === 'studio-quality' || style === 'hyperrealistic-ugc' || style === 'hyperrealistic-cinematic')) {
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
This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. **IMPORTANT**: This reference image will ALSO be attached to the final image generation model, so the model will have access to it. However, your description MUST still be EXTREMELY detailed and specific, and you MUST explicitly reference "the attached reference image" in your prompt so the model knows to match it exactly.

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
- **Be EXTREMELY specific and detailed** - The reference image WILL be attached to the final generation, but your description must still be comprehensive and explicitly reference "the attached reference image"
- **EMPHASIZE lighting and camera angle** - these are the most critical elements that must be replicated exactly, explicitly referencing "the attached reference image"
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
    const characterShortDescriptors: string[] = []; // short descriptor per character for "as in attached image" references
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

    // If character images are provided, generate detailed prompts and short descriptors for each
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
1. First, provide the detailed prompt as a single, continuous paragraph. No headers, no sections, no bullet points - just the complete prompt text that would generate this exact image. Describe it as a photo/image unless you can clearly see it's something else (like a screenshot with visible borders/UI).
2. Then on a NEW LINE, add exactly ONE short distinguishing descriptor in English that identifies this person for when there are multiple character images. Use visible clothing or a key visual trait (e.g. "man wearing blue jacket", "woman in black shirt", "person in red polo"). Format exactly: DISTINGUISHING: [your short phrase]`;

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

            // Extract the character image prompt and short distinguishing descriptor
            let fullText = '';
            if (characterResult.candidates && characterResult.candidates[0]?.content?.parts) {
              fullText = characterResult.candidates[0].content.parts
                .map((part: any) => part.text || '')
                .join('')
                .trim();
            } else if ((characterResult as any).text) {
              fullText = (characterResult as any).text.trim();
            }

            let imagePrompt = '';
            let shortDescriptor = '';
            const distinguishingMatch = fullText.match(/\n?\s*DISTINGUISHING:\s*(.+?)(?:\n|$)/i);
            if (distinguishingMatch) {
              shortDescriptor = distinguishingMatch[1].trim();
              imagePrompt = fullText.replace(/\n?\s*DISTINGUISHING:\s*.+$/i, '').trim();
            } else {
              imagePrompt = fullText;
              // Fallback: use first visible trait from prompt or generic
              const firstPart = (imagePrompt.split(/[.;]/)[0] || '').trim();
              shortDescriptor = firstPart.length > 60 ? firstPart.substring(0, 57) + '...' : (firstPart || `character from image ${i + 1}`);
            }

            if (imagePrompt && imagePrompt.length > 0) {
              console.log(`Character image ${i + 1} prompt generated, length:`, imagePrompt.length, 'descriptor:', shortDescriptor || 'none');
              characterImagePrompts.push(imagePrompt);
            } else {
              console.warn(`Character image ${i + 1} prompt generation returned empty result`);
              characterImagePrompts.push('');
            }
            characterShortDescriptors.push(shortDescriptor || `character from image ${i + 1}`);
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
          characterShortDescriptors.push(`character from image ${i + 1}`);
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
        const useDescriptionBasedRef = mainReferenceImageFile || mainReferenceImagePrompt;
        productInstructions = `

**CRITICAL - PRODUCT IMAGES (MANDATORY REFERENCE - WILL BE ATTACHED):**
${productImageFiles.map((_, idx) => {
          const imgNum = idx + 1;
          const prompt = validProductPrompts[idx] || '';
          return `- **Product Image ${imgNum}**: This image will be attached. ${prompt ? `It shows: "${prompt.substring(0, 300)}..."` : 'Describe what this product image shows.'} When referring to this product in your prompt, identify it BY DESCRIPTION so the model knows which attachment it is: e.g. "the product shown in the attached image that depicts [product name and key visual: e.g. the HONEST Hydrogel Cream jar on a white background]" or "the attached image showing [specific product details]". Do NOT use "second attached image" or "product image" as a label.`;
        }).join('\n')}

**MANDATORY PRODUCT REFERENCE RULES:**
- **THE PRODUCT MUST BE SHOWN EXACTLY AS IN THE ATTACHED PRODUCT IMAGE(S)** — same packaging type (pouch, bottle, jar, sachet, box, tube, etc.), same shape, same design, same colors and branding. Do NOT adapt or substitute the product form from the reference image. If the reference image shows a bottle but the product image shows a pouch, the result MUST show the POUCH. The reference image is ONLY for style, lighting, and camera angle; the product appearance comes ONLY from the product image(s).
- Refer to the product by describing what its attached image shows (e.g. "the attached image that shows the [product name] [exact packaging: pouch/jar/bottle] on a white background with [visible details]"). The image model will match by content, not by order.
- You MUST describe the product in full detail (packaging type, shape, colors, materials, textures, design, text, branding) so the prompt is extensive and the model can identify the product image and replicate it exactly.
- NEVER invent product details - only use what is visible in the PRODUCT image(s). NEVER copy the product's packaging or form from the reference image.`;
      }
      
      if (characterImageFiles.length > 0) {
        const descriptors = characterShortDescriptors.length >= characterImageFiles.length
          ? characterShortDescriptors
          : characterImageFiles.map((_, idx) => `character from image ${idx + 1}`);
        characterInstructions = `

**CHARACTER IMAGES (WILL BE ATTACHED) - MANDATORY REFERENCE:**
${characterImageFiles.map((_, idx) => {
          const imgNum = idx + 1;
          const prompt = validCharacterPrompts[idx] || '';
          const descriptor = descriptors[idx] || `character from image ${imgNum}`;
          return `- **Character Image ${imgNum}** (distinguishing: "${descriptor}"): This character image will be attached. ${prompt ? `The character looks like: "${prompt}"` : 'Use as character reference.'} You MUST refer to this person in the prompt using an explicit "attached" reference (see rules below).`;
        }).join('\n\n')}

**CRITICAL - YOU MUST ALWAYS REFERENCE THE ATTACHED CHARACTER IMAGE(S):**
When character images are provided, your generated prompt MUST include an explicit reference to "the attached character image" or "the attached image" for every character. This is NON-NEGOTIABLE so the image model uses the attached reference(s).

- **NEVER describe the character's face, body, or appearance from scratch** when character images exist. Always use a phrase that points to the attached image.
- **With ONE character**: The prompt must say something like "the same person as in the attached character image", "the person from the attached character image", or "the man/woman as shown in the attached image", then add the new scenario. Example: user says "el mismo hombre pero ahora sentado en un jet privado relajado vistiendo una bata blanca" → output must include: "The same person as in the attached character image, now seated in a private jet, relaxed, wearing a white robe" (or "The man from the attached character image, now in a private jet, relaxed, wearing a white robe").
- **With MULTIPLE characters**: Refer to each as "the person as in the attached character image ([descriptor])" or "the same person as in the attached image ([descriptor])". Example: "el chico de polera azul en un estadio y el de camisa negra sentado" → "The man as in the attached character image (wearing the blue jacket) is now in a stadium; the other man as in the attached character image (wearing the black shirt) is seated."
- **Valid phrases** (use at least one for each character): "the same person as in the attached character image", "the person from the attached character image", "as in the attached character image", "the man/woman from the attached image", "matching the attached character image".
- The prompt will be sent to an image model that receives these images in order; the model must know to use them, so the words "attached" and "character image" (or "attached image") must appear in your generated prompt for each character.

These character images will be attached in order. Your output prompt MUST contain an explicit "attached character image" (or "attached image") reference for every character—never skip this.`;
      }
      
      return { productInstructions, characterInstructions };
    };

    // Build reference image note - MAIN REFERENCE IMAGE is the primary style reference
    let referenceImageNote = '';
    if (style === 'hyperrealistic-ugc' || style === 'hyperrealistic-cinematic') {
      if (mainReferenceImageFile && mainReferenceImagePrompt && attachReferenceAsReferenceOnly) {
        // User selected "Se adjuntará reference image" → use as reference only, do NOT replicate identity
        referenceImageNote = `

**REFERENCE IMAGE - USO SOLO COMO BASE DE SETTING (NO COPIAR IDENTIDAD):**
The user will attach a reference image to the final image generation. This image is for **REFERENCE ONLY** and must be treated as the **base setting and camera setup**: same lighting, same camera angle/perspective, same general composition and background mood.

**YOUR GENERATED PROMPT MUST:**
1. **State clearly**: "The attached image is for reference only. Use it ONLY as the base for lighting, camera angle, composition, background mood, texture, and hyperrealism level. Do not copy the exact face or identity from the reference – the subject/avatar must be different, but with the same lighting, camera angle, and overall setting as the reference."
2. **Start from that reference image**: Describe a new image that clearly **starts from the same scene/setting** (same type of background, same light direction and intensity, same framing and lens feel) but with a different avatar/person and the user's requested changes.
3. The result MUST feel like a **variation of that reference photo**: similar environment, angle, and light, but NOT a 1:1 copy of the person. Do NOT replicate the identity; only keep lighting, camera angle, composition and setting as the base.`;
      } else if (mainReferenceImageFile && mainReferenceImagePrompt && copyCameraAngle && !copyLighting && !attachReferenceAsReferenceOnly) {
        // Copy Camera Angle ONLY (without attach-reference mode): extract angle from reference analysis,
        // but DO NOT mention attached image in the generated prompt.
        const cameraAngleMatch = mainReferenceImagePrompt.match(/(?:camera angle|perspective|angle|view|shot|framing|composition|lens|focal|distance|close-up|medium|wide|frontal|side|three-quarter|high angle|low angle|eye-level|overhead|from above|from below)[^.]*(?:\.|$)/gi);
        const cameraAngleDescription = cameraAngleMatch && cameraAngleMatch.length > 0
          ? cameraAngleMatch.slice(0, 3).join(' ').trim()
          : '';

        referenceImageNote = `\n\n**CRITICAL - CAMERA ANGLE EXTRACTION FROM REFERENCE ANALYSIS (NO ATTACHED REFERENCE MENTION):**
A main reference image was analyzed only to extract camera angle and perspective. For this mode, the final generation prompt must NOT say "attached image", "attached reference image", or similar.

**YOUR TASK:**
- Extract and describe the camera angle in detail from the analyzed reference context (angle, distance, framing, perspective, lens feel).
- Write the final prompt as a standalone description of that camera setup (natural language), without telling the model to copy from an attached image.
- Keep all other styling based on user settings and selected UGC rules.
${cameraAngleDescription ? `- Extracted camera-angle cues from analysis: "${cameraAngleDescription}". Use these cues explicitly in the final prompt description.` : '- If camera-angle cues are limited, infer the most faithful detailed angle description from the analyzed reference context and user request.'}

**ABSOLUTE RULE:**
Do NOT include phrases like "matching the attached reference image", "as shown in the attached image", or any instruction implying an attached reference exists.`;
      } else if (mainReferenceImageFile && mainReferenceImagePrompt) {
        // Main reference image with prompt - this is the PRIMARY style reference (replicate)
        const { productInstructions, characterInstructions } = buildProductCharacterInstructions();
        
        // Extract camera angle and lighting descriptions from the reference image prompt
        let cameraAngleDescription = '';
        let lightingDescription = '';
        
        // Try to extract camera angle description from the reference prompt
        if (copyCameraAngle && mainReferenceImagePrompt) {
          // Look for camera angle descriptions in the prompt
          const cameraAngleMatch = mainReferenceImagePrompt.match(/(?:camera angle|perspective|angle|view|shot|framing|composition|lens|focal|distance|close-up|medium|wide|frontal|side|three-quarter|high angle|low angle|eye-level|overhead|from above|from below)[^.]*(?:\.|$)/gi);
          if (cameraAngleMatch && cameraAngleMatch.length > 0) {
            cameraAngleDescription = cameraAngleMatch.slice(0, 3).join(' ').trim();
          }
        }
        
        // Try to extract lighting description from the reference prompt
        if (copyLighting && mainReferenceImagePrompt) {
          // Look for lighting descriptions in the prompt
          const lightingMatch = mainReferenceImagePrompt.match(/(?:lighting|light|illumination|flash|shadow|highlight|bright|dim|warm|cool|color temperature|directional|diffused|soft|harsh|studio|natural|artificial)[^.]*(?:\.|$)/gi);
          if (lightingMatch && lightingMatch.length > 0) {
            lightingDescription = lightingMatch.slice(0, 3).join(' ').trim();
          }
        }
        
        // Build copy instructions based on user selection
        let copyInstructions = '';
        if (copyCameraAngle && copyLighting) {
          copyInstructions = `
- **EXACT camera angle and perspective** from the main reference - THIS IS ABSOLUTELY CRITICAL - The reference image prompt describes the EXACT camera angle, perspective, distance, framing, and composition. You MUST replicate these EXACTLY in your prompt. ${cameraAngleDescription ? `Based on the reference image analysis, the camera angle is: "${cameraAngleDescription}". ` : ''}Include ALL details: the exact angle (frontal, side, three-quarter, high angle, low angle, etc.), the exact distance (close-up, medium shot, wide shot, etc.), the exact framing and composition, the exact camera height and perspective. **CRITICAL**: In your generated prompt, you MUST describe the camera angle in detail (e.g., "high-angle overhead perspective", "frontal close-up", "three-quarter view from above", etc.) AND explicitly state "matching the attached reference image" or "as shown in the attached reference image". The reference image WILL be attached to the final generation, so make explicit references to it.
- **EXACT lighting style** from the main reference - THIS IS ABSOLUTELY CRITICAL - The reference image prompt describes the EXACT lighting. You MUST replicate ALL lighting details EXACTLY: the type of lighting (natural, studio, dramatic, etc.), the EXACT direction the light comes from, the EXACT intensity and brightness, the EXACT color temperature (warm, cool, neutral), the EXACT shadow placement and characteristics, the EXACT highlight placement and intensity, any multiple light sources and their positions. ${lightingDescription ? `Based on the reference image analysis, the lighting is: "${lightingDescription}". ` : ''}**CRITICAL**: In your generated prompt, you MUST describe the lighting in detail (e.g., "soft natural daylight from the left", "harsh on-camera flash", "dramatic side lighting with warm color temperature", etc.) AND explicitly state "matching the attached reference image" or "as shown in the attached reference image". The reference image WILL be attached to the final generation, so make explicit references to it.`;
        } else if (copyCameraAngle) {
          copyInstructions = `
- **EXACT camera angle and perspective** from the main reference - THIS IS ABSOLUTELY CRITICAL - The reference image prompt describes the EXACT camera angle, perspective, distance, framing, composition, and LENS TYPE. You MUST replicate these EXACTLY in your prompt. ${cameraAngleDescription ? `Based on the reference image analysis, the camera angle is: "${cameraAngleDescription}". ` : ''}Include ALL details: the exact angle (frontal, side, three-quarter, high angle, low angle, etc.), the exact distance (close-up, medium shot, wide shot, etc.), the exact framing and composition, the exact camera height and perspective, and MOST IMPORTANTLY the EXACT lens type and characteristics (wide-angle, telephoto, normal, macro, fisheye, etc.) with all lens-specific characteristics (depth of field, bokeh, distortion, compression, field of view). **CRITICAL**: In your generated prompt, you MUST describe the camera angle in detail (e.g., "high-angle overhead perspective", "frontal close-up", "three-quarter view from above", etc.) AND explicitly state "matching the attached reference image" or "as shown in the attached reference image". The reference image WILL be attached to the final generation, so make explicit references to it.`;
        } else if (copyLighting) {
          copyInstructions = `
- **EXACT lighting style** from the main reference - THIS IS ABSOLUTELY CRITICAL - The reference image prompt describes the EXACT lighting. You MUST replicate ALL lighting details EXACTLY: the EXACT type of lighting (natural daylight, studio lighting, FLASH PHOTOGRAPHY - on-camera flash, off-camera flash, ring flash, bounce flash, etc., artificial lighting, dramatic spotlight, soft diffused, harsh directional, ambient, mixed lighting, etc.), the EXACT direction the light comes from, the EXACT intensity and brightness, the EXACT color temperature (warm, cool, neutral), the EXACT shadow placement and characteristics (including flash shadows if present), the EXACT highlight placement and intensity (including flash highlights if present), any multiple light sources and their positions, any light modifiers (softbox, umbrella, reflector, etc.), and MOST IMPORTANTLY if flash is present, describe ALL flash characteristics (harsh shadows, strong highlights, flash color temperature, flash reflections, catchlights in eyes, etc.). ${lightingDescription ? `Based on the reference image analysis, the lighting is: "${lightingDescription}". ` : ''}**CRITICAL**: In your generated prompt, you MUST describe the lighting in detail (e.g., "soft natural daylight from the left", "harsh on-camera flash", "dramatic side lighting with warm color temperature", etc.) AND explicitly state "matching the attached reference image" or "as shown in the attached reference image". The reference image WILL be attached to the final generation, so make explicit references to it.`;
        }
        
        referenceImageNote = `\n\n**CRITICAL - MAIN REFERENCE IMAGE (PRIMARY STYLE REFERENCE - FOR LIGHTING, CAMERA ANGLE, REALISM ONLY - NOT FOR THE PRODUCT):**
A main reference image has been provided and analyzed. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. **Use it ONLY for**: style, realism, lighting, camera angle, composition. **DO NOT use the reference image for the product's appearance.** If the reference shows a product (e.g. a bottle), IGNORE that—the product to show is defined ONLY by the attached PRODUCT image(s) (e.g. if the product image shows a pouch, the result MUST show a pouch).${productImageFiles.length > 0 ? ' **The product in the final image MUST look exactly as in the attached product image(s)—same packaging type, shape, and design.**' : ''}

**IMPORTANT**: This reference image will ALSO be attached to the final image generation model. The model will have access to it.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' **CRITICAL: You MUST copy the EXACT camera angle and perspective from the attached reference image.**' : ''}${copyLighting && !isRingLighting ? ' **CRITICAL: You MUST copy the EXACT lighting style from the attached reference image.**' : ''}${copyLighting && isRingLighting ? ' **CRITICAL: User selected **Ring** lighting — do **NOT** copy lighting from the reference; use **only** the Ring rules in the CAMERA ANGLE & LIGHTING block below.**' : ''}` : ` The generated prompt MUST specify that the result must match this EXACT style, angle, lighting, and hyperrealism level, explicitly referencing the attached reference image.`}

**Main Reference Image Prompt (this defines the PRIMARY style that MUST be replicated exactly):**
"${mainReferenceImagePrompt}"

**CRITICAL - REFERENCE IMAGE WILL BE ATTACHED TO FINAL GENERATION:**
✅ **IMPORTANT**: The main reference image will be uploaded to Nano Banana Pro and placed FIRST, AND it will ALSO be attached to the final image generation model. The model WILL see the reference image during generation. Therefore, you MUST:
1. **Explicitly reference the attached image** in your prompt - mention "the attached reference image", "the reference image shown", or "as shown in the attached reference image"
2. **Specify what to copy** from the reference image based on user selection:${copyCameraAngle ? `\n   - **MANDATORY - Copy Camera Angle**: You MUST describe the camera angle in DETAIL (e.g., "high-angle overhead perspective", "frontal close-up", "three-quarter view from above", etc.) based on what you see in the reference image prompt above, AND explicitly state that it matches the attached reference image. Do NOT just say "copy the camera angle" - you MUST describe the specific angle, perspective, framing, and composition.` : ''}${copyLighting && !isRingLighting ? `\n   - **MANDATORY - Copy Lighting**: You MUST describe the lighting in DETAIL (e.g., "soft natural daylight from the left", "harsh on-camera flash", "dramatic side lighting with warm color temperature", etc.) based on what you see in the reference image prompt above, AND explicitly state that it matches the attached reference image. Do NOT just say "copy the lighting" - you MUST describe the specific type, direction, intensity, color temperature, shadows, and highlights.` : ''}${copyLighting && isRingLighting ? `\n   - **MANDATORY - Lighting (Ring):** Do **NOT** copy lighting from the reference. Follow **only** the Ring lighting block in the main instructions (frontal white LED, indoor, catchlights).` : ''}
3. **Analyze the reference image** to understand its visual characteristics and include detailed descriptions in your prompt
4. **Make explicit references** to the attached reference image throughout your prompt when describing style, angle, lighting, or other visual elements
${productImageFiles.length > 0 ? `
**CRITICAL - IDENTIFY IMAGES BY DESCRIPTION (NOT BY ORDER):**
The user will attach TWO types of images; the image model has no idea which file is "first" or "reference" or "product". So you MUST identify each image BY DESCRIBING what it shows visually. Do NOT use "first attached image", "second attached image", "reference image", or "product image" as labels.

- **For the image that defines setting, camera angle and lighting**: From the Main Reference Image Prompt above, build a DETAILED visual description (shot type, background, lighting, shadows, composition). In your output prompt write something like: "The setting, camera angle and lighting must match the attached image that shows [FULL description]: a [wide/medium/close-up] shot, [angle and framing], [background type and color], [lighting type, direction, and effect—e.g. soft diffused studio lighting from the upper right casting gentle shadows, high-key minimalist aesthetic]." Example: "…must match the attached image that shows a wide shot of products on a reflective surface with a seamless light grey background, soft diffused studio lighting from the upper right casting gentle shadows, frontal eye-level composition and high-key minimalist aesthetic." Be extensive so the image model can identify which attachment is the style reference.
- **For the product to depict**: The product must be shown EXACTLY as in the attached PRODUCT image(s)—same packaging (e.g. pouch, bottle, jar), same shape and design. Do NOT copy the product form from the reference image. Refer to it by describing what the product image shows: e.g. "the product shown in the attached image that depicts the [product name] [exact packaging type and key visual: e.g. flexible pouch with pink and white design on a white background]" so the model can identify which attachment is the product and replicate it exactly.
- **Prompt must be detailed and extensive**: Write a long, rich prompt. Include full descriptions of camera angle, lighting, background and setting in the text. Use only "the attached image that shows [description]" so the model matches attachments by content, not by order.` : ''}

**Your Task:**
You MUST use the main reference image prompt above as the PRIMARY style reference. This image defines the EXACT visual style that must be replicated. Your generated prompt must explicitly reference the attached reference image and be EXTREMELY detailed.${copyInstructions}
${!copyCameraAngle && !copyLighting ? `
- **EXACT camera angle and perspective** from the main reference - Extract ALL details from the reference prompt: exact angle (frontal, side, three-quarter, high angle, low angle, etc.), exact distance (close-up, medium shot, wide shot, etc.), exact framing and composition, exact camera height and perspective. Include ALL these details in your prompt.
- **EXACT lighting style** from the main reference - Extract ALL details from the reference prompt: type of lighting, EXACT direction, EXACT intensity, EXACT color temperature, EXACT shadow placement and characteristics, EXACT highlight placement and intensity, any multiple light sources. Include ALL these details in your prompt.` : ''}
${copyCameraAngle ? `
- **CRITICAL - DESCRIBE THE CAMERA ANGLE IN DETAIL**: You MUST extract the camera angle description from the reference image prompt above and include it in your generated prompt. For example, if the reference shows "high-angle overhead perspective", you MUST write something like "taken from a high-angle overhead perspective, matching the attached reference image" - NOT just "copy the camera angle from the attached reference image". You MUST describe the specific angle, perspective, framing, distance, and composition based on what you see in the reference image prompt above.` : ''}
${copyLighting ? `
- **CRITICAL - DESCRIBE THE LIGHTING IN DETAIL**: You MUST extract the lighting description from the reference image prompt above and include it in your generated prompt. For example, if the reference shows "soft natural daylight from the left", you MUST write something like "soft natural daylight from the left, matching the attached reference image" - NOT just "copy the lighting from the attached reference image". You MUST describe the specific type of lighting, direction, intensity, color temperature, shadows, and highlights based on what you see in the reference image prompt above.` : ''}
${copyCameraAngle ? `
- **CRITICAL - DESCRIBE THE CAMERA ANGLE IN DETAIL**: You MUST extract the camera angle description from the reference image prompt above and include it in your generated prompt. For example, if the reference shows "high-angle overhead perspective", you MUST write something like "taken from a high-angle overhead perspective, matching the attached reference image" - NOT just "copy the camera angle from the attached reference image". You MUST describe the specific angle, perspective, framing, distance, and composition based on what you see in the reference image prompt above.` : ''}
${copyLighting ? `
- **CRITICAL - DESCRIBE THE LIGHTING IN DETAIL**: You MUST extract the lighting description from the reference image prompt above and include it in your generated prompt. For example, if the reference shows "soft natural daylight from the left", you MUST write something like "soft natural daylight from the left, matching the attached reference image" - NOT just "copy the lighting from the attached reference image". You MUST describe the specific type of lighting, direction, intensity, color temperature, shadows, and highlights based on what you see in the reference image prompt above.` : ''}
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
  - Keep the EXACT same camera angle, composition, lighting, textures, and aesthetic from the main reference (as described). The reference image is for STYLE ONLY (realism, lighting, camera angle)—NOT for the product's appearance.
  - **PRODUCT = ONLY from the attached PRODUCT image(s)**. The product must be shown exactly as in the product image(s): same packaging type (pouch, bottle, jar, etc.), same shape, same design. If the reference shows a bottle and the product image shows a pouch, the result MUST show the pouch. Never copy the product form or packaging from the reference image.
  - Change only the CONTENT/SUBJECT to match the user's description (e.g. person holding the product), but the product itself must always match the attached product image(s).
  - The result should look like the main reference image in terms of style, angle, lighting, and hyperrealism, but the PRODUCT must look exactly as in the attached product image(s).
  - **DO NOT add any characteristics** (device frames, borders, etc.) that were not in the main reference image prompt

- **CRITICAL**: The generated prompt must specify that the result must match the EXACT style, angle, lighting, and hyperrealism from the main reference image. This image will be uploaded to Nano Banana Pro and placed first, so the prompt must ensure 100% style replication.`;
      } else if (mainReferenceImageFile && attachReferenceAsReferenceOnly) {
        // Reference image will be attached but user wants "reference only" (no prompt was generated or same mode)
        referenceImageNote = `

**REFERENCE IMAGE - USO SOLO COMO REFERENCIA (NO REPLICAR):**
The user will attach a reference image. It is for **REFERENCE ONLY** - use it ONLY as the base for **lighting, texture, and hyperrealism**. The face/person can be different (any other avatar).

**YOUR GENERATED PROMPT MUST:**
1. **State clearly**: "The attached image is for reference only. Use it ONLY for lighting, texture, and hyperrealism level. Do not copy the face or person - the subject can be a different avatar, with the same lighting, texture, and hyperrealistic look as the reference."
2. **Then** describe the scene from the user's description (can be a different person/avatar). Use the reference ONLY for lighting, texture, hyperrealism - NOT for the face/identity.
3. Do NOT replicate the person/face from the reference. Only: lighting, texture, hyperrealistic quality as base.`;
      } else if (mainReferenceImageFile && copyCameraAngle && !copyLighting && !attachReferenceAsReferenceOnly) {
        // Copy Camera Angle ONLY (image available, no prompt): analyze internally, no attached-image wording.
        referenceImageNote = `\n\n**CRITICAL - CAMERA ANGLE EXTRACTION FROM REFERENCE ANALYSIS (NO ATTACHED REFERENCE MENTION):**
A main reference image was analyzed only to infer camera angle and perspective. The final generation prompt must be standalone and MUST NOT mention any attached reference image.

**YOUR TASK:**
- Analyze and describe camera angle/perspective in detail (shot type, distance, framing, camera height, lens feel).
- Apply that camera-angle description directly in the final prompt text.
- Do NOT include "attached image"/"attached reference" wording in any form.`;
      } else if (mainReferenceImageFile) {
        // Main reference image provided but no prompt generated - use image directly
        const { productInstructions, characterInstructions } = buildProductCharacterInstructions();
        
        // Build copy instructions based on user selection
        let copyInstructionsNoPrompt = '';
        if (copyCameraAngle && copyLighting) {
          copyInstructionsNoPrompt = `
- **EXACT camera angle and perspective** from the main reference - THIS IS ABSOLUTELY CRITICAL - Analyze the attached reference image and extract ALL camera angle and LENS details: the exact angle (frontal, side, three-quarter, high angle, low angle, etc.), the exact distance (close-up, medium shot, wide shot, etc.), the exact framing and composition, the exact camera height and perspective, and MOST IMPORTANTLY identify the EXACT lens type (wide-angle, telephoto, normal, macro, fisheye, etc.) and describe ALL lens-specific characteristics (depth of field, bokeh quality, distortion, compression, field of view, focal length indicators). You MUST describe these EXACTLY in your prompt with maximum detail. **CRITICAL**: Explicitly state "copy the EXACT camera angle and perspective from the attached reference image" in your prompt. The reference image WILL be attached to the final generation, so make explicit references to it.
- **EXACT lighting style** from the main reference - THIS IS ABSOLUTELY CRITICAL - Analyze the attached reference image and extract ALL lighting details: identify the EXACT type of lighting (natural daylight, studio lighting, FLASH PHOTOGRAPHY - identify if it's on-camera flash, off-camera flash, ring flash, bounce flash, etc., artificial lighting, dramatic spotlight, soft diffused, harsh directional, ambient, mixed lighting, etc.), the EXACT direction the light comes from, the EXACT intensity and brightness, the EXACT color temperature (warm, cool, neutral), the EXACT shadow placement and characteristics (including flash shadows if flash is present), the EXACT highlight placement and intensity (including flash highlights if flash is present), any multiple light sources and their positions, any light modifiers (softbox, umbrella, reflector, etc.), and MOST IMPORTANTLY if flash photography is present, identify and describe ALL flash characteristics (harsh shadows, strong highlights, flash color temperature, flash reflections, catchlights in eyes, characteristic flash look, etc.). You MUST describe these EXACTLY in your prompt with maximum detail. **CRITICAL**: Explicitly state "copy the EXACT lighting style from the attached reference image" in your prompt. The reference image WILL be attached to the final generation, so make explicit references to it.`;
        } else if (copyCameraAngle) {
          copyInstructionsNoPrompt = `
- **EXACT camera angle and perspective** from the main reference - THIS IS ABSOLUTELY CRITICAL - Analyze the attached reference image and extract ALL camera angle and LENS details: the exact angle (frontal, side, three-quarter, high angle, low angle, etc.), the exact distance (close-up, medium shot, wide shot, etc.), the exact framing and composition, the exact camera height and perspective, and MOST IMPORTANTLY identify the EXACT lens type (wide-angle, telephoto, normal, macro, fisheye, etc.) and describe ALL lens-specific characteristics (depth of field, bokeh quality, distortion, compression, field of view, focal length indicators). You MUST describe these EXACTLY in your prompt with maximum detail. **CRITICAL**: Explicitly state "copy the EXACT camera angle and perspective from the attached reference image" in your prompt. The reference image WILL be attached to the final generation, so make explicit references to it.`;
        } else if (copyLighting) {
          copyInstructionsNoPrompt = `
- **EXACT lighting style** from the main reference - THIS IS ABSOLUTELY CRITICAL - Analyze the attached reference image and extract ALL lighting details: identify the EXACT type of lighting (natural daylight, studio lighting, FLASH PHOTOGRAPHY - identify if it's on-camera flash, off-camera flash, ring flash, bounce flash, etc., artificial lighting, dramatic spotlight, soft diffused, harsh directional, ambient, mixed lighting, etc.), the EXACT direction the light comes from, the EXACT intensity and brightness, the EXACT color temperature (warm, cool, neutral), the EXACT shadow placement and characteristics (including flash shadows if flash is present), the EXACT highlight placement and intensity (including flash highlights if flash is present), any multiple light sources and their positions, any light modifiers (softbox, umbrella, reflector, etc.), and MOST IMPORTANTLY if flash photography is present, identify and describe ALL flash characteristics (harsh shadows, strong highlights, flash color temperature, flash reflections, catchlights in eyes, characteristic flash look, etc.). You MUST describe these EXACTLY in your prompt with maximum detail. **CRITICAL**: Explicitly state "copy the EXACT lighting style from the attached reference image" in your prompt. The reference image WILL be attached to the final generation, so make explicit references to it.`;
        }
        
        referenceImageNote = `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST, AND WILL ALSO BE ATTACHED TO FINAL IMAGE GENERATION):**
A main reference image has been attached. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. **IMPORTANT**: This reference image will ALSO be attached to the final image generation model, so the model will have access to it.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' **CRITICAL: You MUST copy the EXACT camera angle and perspective from the attached reference image.**' : ''}${copyLighting ? ' **CRITICAL: You MUST copy the EXACT lighting style from the attached reference image.**' : ''}` : ''}

**CRITICAL - REFERENCE IMAGE WILL BE ATTACHED TO FINAL GENERATION:**
✅ **IMPORTANT**: The main reference image will be uploaded to Nano Banana Pro and placed FIRST, AND it will ALSO be attached to the final image generation model. The model WILL see the reference image during generation. Therefore, you MUST:
1. **Explicitly reference the attached image** in your prompt - mention "the attached reference image", "the reference image shown", or "as shown in the attached reference image"
2. **Specify what to copy** from the reference image based on user selection:${copyCameraAngle ? `\n   - **MANDATORY - Copy Camera Angle**: You MUST describe the camera angle in DETAIL (e.g., "high-angle overhead perspective", "frontal close-up", "three-quarter view from above", etc.) based on what you see in the attached reference image, AND explicitly state that it matches the attached reference image. Do NOT just say "copy the camera angle" - you MUST describe the specific angle, perspective, framing, and composition.` : ''}${copyLighting ? `\n   - **MANDATORY - Copy Lighting**: You MUST describe the lighting in DETAIL (e.g., "soft natural daylight from the left", "harsh on-camera flash", "dramatic side lighting with warm color temperature", etc.) based on what you see in the attached reference image, AND explicitly state that it matches the attached reference image. Do NOT just say "copy the lighting" - you MUST describe the specific type, direction, intensity, color temperature, shadows, and highlights.` : ''}
3. **Analyze the reference image** to understand its visual characteristics and include detailed descriptions in your prompt
4. **Make explicit references** to the attached reference image throughout your prompt when describing style, angle, lighting, or other visual elements

**Your Task - Analyze the Reference Image with EXTREME Detail:**
You MUST analyze the attached main reference image to understand EXACTLY how it looks. Extract and include ALL of these details in your prompt.${copyCameraAngle ? ` **CRITICAL**: When describing the camera angle, you MUST provide a detailed description (e.g., "high-angle overhead perspective", "frontal close-up", "three-quarter view from above") AND mention "matching the attached reference image" - do NOT just say "copy the camera angle".` : ''}${copyLighting ? ` **CRITICAL**: When describing the lighting, you MUST provide a detailed description (e.g., "soft natural daylight from the left", "harsh on-camera flash", "dramatic side lighting with warm color temperature") AND mention "matching the attached reference image" - do NOT just say "copy the lighting".` : ''}

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
- **Explicitly reference the attached reference image** - Use phrases like "matching the attached reference image", "as shown in the attached reference image", "replicating the style from the attached reference image", "copying the [lighting/angle] from the attached reference image"
- **Extract ALL visual details** from the reference image and include them in your prompt with EXTREME detail - be comprehensive
- **Be EXTREMELY specific** about camera angle, lighting, composition, colors, textures, background, and aesthetic - include every detail
- **Include the user's description** ("${description}") while maintaining the EXACT style from the reference
- **Ensure the result looks IDENTICAL** to the reference image in terms of style, lighting, composition, colors, textures, and aesthetic, but with the content/subject from the user's description.${!copyCameraAngle && hasUserCameraAngleSelection ? ' For CAMERA ANGLE, you must FOLLOW the user-selected camera angle (Selfie Camera / Frontal Camera / Steady) instead of copying the camera angle from the reference image.' : ' For CAMERA ANGLE, you may copy the camera angle from the reference image as appropriate.'}
- **Make explicit references to the attached image**: When describing style elements, explicitly mention "as shown in the attached reference image" or "matching the attached reference image"${copyCameraAngle ? ' - **CRITICAL**: Explicitly state "copy the EXACT camera angle and perspective from the attached reference image"' : ''}${copyLighting && !isRingLighting ? ' - **CRITICAL**: Explicitly state "copy the EXACT lighting style from the attached reference image"' : ''}${copyLighting && isRingLighting ? ' - **CRITICAL**: User selected **Ring** lighting in the app — **do NOT** copy lighting from the reference; use **only** the Ring lighting rules from the CAMERA ANGLE & LIGHTING block below.' : ''}
- **Remember**: The reference image WILL be attached to the final generation, so make explicit references to it in your prompt

**CRITICAL REQUIREMENTS:**
${!copyCameraAngle && !copyLighting && !hasUserCameraAngleSelection ? `
  - **EXACT camera angle and perspective** - Extract ALL details from the reference and include them in your prompt with maximum specificity, explicitly referencing "the attached reference image"` : ''}
${!copyLighting ? `
  - **EXACT composition and framing** - Extract ALL details from the reference and include them in your prompt, explicitly referencing "the attached reference image"
  - **EXACT lighting style** - Extract ALL details from the reference and include them in your prompt with maximum specificity - THIS IS CRITICAL, explicitly referencing "the attached reference image"` : ''}
  - **EXACT texture quality** - Extract and include ALL texture details from the reference, explicitly referencing "the attached reference image"
  - **EXACT color palette** - Extract and include ALL color details from the reference, explicitly referencing "the attached reference image"
  - **EXACT overall aesthetic** - Extract and include ALL aesthetic details from the reference, explicitly referencing "the attached reference image"
  - **EXACT background** - Extract and include ALL background details from the reference, explicitly referencing "the attached reference image"
  - **Explicitly reference the attached reference image** throughout your prompt when describing style elements
  - Keep the EXACT same composition, lighting, textures, and aesthetic from the main reference (reference = STYLE ONLY, not for product appearance).${copyCameraAngle || !hasUserCameraAngleSelection ? ' The camera angle may be copied from the attached reference image when appropriate.' : ' For camera angle, follow the user-selected camera angle (Selfie Camera / Frontal Camera / Steady) as primary and treat the reference only as style/setting guidance.'}${copyCameraAngle ? ' - **CRITICAL: The camera angle MUST be copied exactly from the attached reference image with ALL details. Explicitly state "copy the EXACT camera angle and perspective from the attached reference image"' : ''}${copyLighting && !isRingLighting ? ' - **CRITICAL: The lighting MUST be copied exactly from the attached reference image with ALL details. Explicitly state "copy the EXACT lighting style from the attached reference image"' : ''}${copyLighting && isRingLighting ? ' - **CRITICAL:** User selected **Ring** — do **not** copy reference lighting; use Ring rules from the CAMERA ANGLE & LIGHTING block only.' : ''}
  - **PRODUCT = ONLY from the attached PRODUCT image(s)**. The product must look exactly as in the product image(s)—same packaging (pouch, bottle, jar, etc.), same shape and design. Do NOT copy the product form from the reference image (e.g. if reference shows a bottle and product image shows a pouch, result MUST show the pouch).
  - Change only the CONTENT/SUBJECT to match the user's description (e.g. person holding the product); the product itself must always match the attached product image(s).
  - The result should look IDENTICAL to the main reference image in terms of style, angle, lighting, and hyperrealism, but the PRODUCT must look exactly as in the attached product image(s).

- **CRITICAL**: The generated prompt must:
  1. **Explicitly mention the attached reference image** - Use phrases like "matching the attached reference image", "as shown in the attached reference image", "replicating the style from the attached reference image"
  2. **Specify that the result must match the EXACT style, angle, lighting, and hyperrealism from the attached reference image**
  3. **This image will be uploaded to Nano Banana Pro and placed first, AND will also be attached to the final image generation, so the prompt must ensure 100% style replication with explicit references to the attached image**${copyInstructionsNoPrompt}${productInstructions}${characterInstructions}`;
      }
    } else {
      // No main reference image
      referenceImageNote = '';
    }

    // Camera Angle + Lighting (same system prompts as video UGC, adapted for image)
    const cameraAngleArray = cameraAngle && Array.isArray(cameraAngle) ? cameraAngle : [];
    const descriptionLower = (description || '').toLowerCase();
    const mentionsProduct = /\b(product|producto|produto)\b/i.test(description || '');

    // Camera angle block: same logic as enhance-prompt, adapted for single still image
    const imageCameraAngleBlock = (() => {
      // Default: if no cameraAngle selected and style is hyperrealistic-ugc, assume Frontal Camera from a natural distance
      if (cameraAngleArray.length === 0 && style === 'hyperrealistic-ugc') {
        const angle = 'Frontal Camera';
        if (angle === 'Frontal Camera') {
          return `

**CRITICAL - CAMERA ANGLE: FRONTAL CAMERA (DEFAULT FOR UGC):**
The image MUST look like a casual iPhone photo taken by another person (NOT selfie). This means:
- Frontal view from a natural distance, chest-up or medium shot, as if a friend is holding the iPhone in front of the subject.
- Camera at or slightly above eye level, natural everyday framing (no extreme wide-angle, no dramatic perspective).
- The scene must feel spontaneous and unposed, like a real moment captured in everyday life, with the same hyperrealistic lighting and texture standards described for UGC.`;
        }
        return '';
      }
      if (cameraAngleArray.length === 0) return '';
      const hasPOV = descriptionLower.includes('pov') || descriptionLower.includes('point of view');
      let effectiveAngles = cameraAngleArray;
      if (hasPOV && !cameraAngleArray.includes('Frontal Camera')) {
        effectiveAngles = ['Frontal Camera', ...cameraAngleArray];
      } else if (hasPOV && cameraAngleArray.includes('Frontal Camera')) {
        effectiveAngles = ['Frontal Camera', ...cameraAngleArray.filter((a: string) => a !== 'Frontal Camera')];
      }
      const uniqueAngles = [...new Set(effectiveAngles)];
      const angle = uniqueAngles.length === 1 ? uniqueAngles[0] : uniqueAngles[0]; // For image use first if multiple
      if (angle === 'Selfie Camera') {
        return `

**CRITICAL - CAMERA ANGLE: SELFIE CAMERA (MANDATORY):**
The image MUST look as if taken by the person holding the phone (selfie-style). This means:
- The framing is as if the character is holding their phone in front of them, showing themselves${mentionsProduct ? ' and the product' : ''}
- Natural selfie-style composition: intimate, close-up or chest-up, slight low angle typical of selfie hold
- Authentic iPhone selfie aesthetic: natural color science, realistic skin tones, genuine mobile capture
- The image should feel like an authentic selfie photo - hyperrealistic, as if taken with an iPhone in selfie mode.`;
      }
      if (angle === 'Frontal Camera') {
        return `

**CRITICAL - CAMERA ANGLE: FRONTAL CAMERA / POV (MANDATORY):**
The image MUST be a frontal view as if recorded with an iPhone by another person (friend-with-iPhone style) OR a POV (Point of View) where only what the person sees is visible. This means:
- **Frontal from a natural distance**: Chest-up or medium shot, camera at or slightly above eye level, framing the subject naturally in the center, like a casual iPhone photo from a friend – NOT selfie.
- **POV option**: The viewer sees what the person sees (hands, product, environment) without showing the photographer; only hands may appear when relevant.
- In both cases the image MUST maintain the SAME lighting quality, natural textures and hyperrealistic look: authentic iPhone color science, ${isRingLighting ? '**Ring:** frontal white LED key and catchlights as in the Lighting block — **not** window daylight' : 'soft natural daylight, minimal soft shadows with proper falloff'}, natural material response to light, and realistic highlight rolloff.
- The result must look grabado de iPhone: clean, natural, hyperrealistic, and indistinguishable from a real iPhone capture (no device frames or UI).`;
      }
      if (angle === 'Steady') {
        return `

**CRITICAL - CAMERA ANGLE: STEADY (MANDATORY):**
The image MUST look as if the phone was placed in a fixed position (e.g., on a table, shelf, tripod) capturing the scene in third person. This means:
- Stationary camera position; no handheld feel - stable, composed frame
- As if someone set the phone down to capture the scene; characters may look at the camera but the phone is not held
- Authentic UGC aesthetic with minimal shake; clear, sharp, hyperrealistic still photo.`;
      }
      return '';
    })();

    // Lighting block: same full hyperrealistic UGC text as enhance-prompt, adapted for image (video → image/photo)
    const imageLightingBlock = (() => {
      if (!lighting || typeof lighting !== 'string') return '';
      const lightingLower = String(lighting).toLowerCase();
      const hyperrealismBase = `

**CRITICAL - IPHONE 13 PHOTO REALISM (NO CGI, NO BEAUTY FILTER):**
The image MUST look like a **real photo just taken with an iPhone 13**, not a 3D render or CGI. Natural iPhone sharpness: clean, appealing, realistic, but **without** clinical macro detail. **NO** professional studio, **NO** cinematic grading, **NO** beauty filters.

**1. LIGHTING AND SURFACE RESPONSE (MANDATORY):**
- **Single-source directional light:** Use a single natural-looking light source (sun, window, room light). Light should create **soft realistic highlights and gentle shadows**, not harsh studio beams. Avoid perfectly even studio light or completely flat ambient.
- **Skin surface realism (SOFT):** Skin should look like a good iPhone 13 photo: clean, smooth but real. Describe it as **“natural, clean skin with gentle real-world texture”**, not “visible pores” or “microscopic detail”. Mention **“subtle natural sheen from skin oils”** rather than strong specular gloss. Absolutely NO pore-by-pore or micro‑hair fetish; NO CGI plastic.
- **Fabric & materials:** Clothes and materials should have natural texture and folds as seen in iPhone photos (soft weave, light wrinkles), without exaggerated thread-by-thread hyper-sharp detail.
- **Global illumination (radiosity):** The environment’s ambient light should gently tint the subject (warm grass/trees, cool sky), and the subject can bounce a bit of color onto nearby surfaces in a natural, **soft** way.

**2. LENS AND CAMERA MECHANICS (MANDATORY):**
- **Smartphone lens behavior:** Simulate a typical iPhone wide lens (~24–26mm equivalent) with mild perspective distortion; natural field of view, NOT extreme wide or telephoto unless the user asks.
- **Depth of field (NO background blur):** Use **deep iPhone depth of field** so the **background stays sharp and fully legible** like a normal iPhone 13 photo. The subject may show tiny real-phone imperfection (slight moment softness from micro-motion / imperfect focus), but **never cinematic blur** and **never background blur**. **NO Portrait Mode**, **NO bokeh**, **NO background blur**.
- **Camera noise & artefacts:** Include a **more noticeable iPhone-like sensor noise/grain** plus mild chromatic aberration near frame edges only if it helps break unrealistic perfection. Keep it messy but still plausible (not CGI-clean).
- **Dynamic range:** Preserve a **balanced** iPhone 13 dynamic range, allowing small natural clipping in bright conditions (as in real snapshots). Avoid HDR-overprocessed / crunchy tone‑mapping.

**3. RAW UGC IMPERFECTIONS (MANDATORY - SHITTY UGLY RAW LOOK):**
- Unpolished iPhone snapshot look: **clearly visible JPEG compression artifacts**, higher sensor noise/grain, more noticeable white-balance drift, and more obvious exposure “mistakes” (slight over/under, mild clipping), plus awkward/unremarkable framing like a real phone photo.
- Allow slightly stronger lens/oil smudge vibe, mild flare, or minor ringing only if it appears naturally in real scenes.
- Keep it casual: not beauty-graded, not studio-polished, not CGI-clean.

**NEGATIVE PROMPTS (ABSOLUTE PROHIBITIONS):**
NO beauty-filtered or airbrushed skin. NO visible “CGI pores” or microscope-level detail. NO glamour-shot post-processing. NO uniform plastic fabrics. NO perfectly even flat lighting (no heavy filler lights). Avoid CGI oversharpening/large halo rings; **JPEG ringing and compression imperfections are allowed**. **NO cinematic background blur or heavy bokeh – the background must remain naturally readable like a real iPhone 13 photo.** NO device frames or UI elements. **NO overlays of any kind:** no status bar (carrier, time, battery, signal), no notch/Dynamic Island chrome, no screenshot look, no black letterboxing, no fake phone preview frame, no camera-app HUD, no watermarks or on-image UI.`;

      if (lightingLower.includes('night outside')) {
        return `${hyperrealismBase}

**LIGHTING: NIGHT OUTSIDE (SMARTPHONE CAPTURE):**
Match a real iPhone 13 night photo (Night Mode / low-light smartphone capture) — **NOT** cinematic. The scene should look like a casual phone photo taken at night (street OR outdoor venue/resort patio with warm practical lights and greenery).

- **Light sources**: Practical real lights only (street lamps, shop signs, car headlights, window light) OR warm venue/resort practicals (garden uplights, pathway lights, warm sconces, pool/patio lighting). Natural falloff, no staged film lighting.
- **Exposure**: iPhone-like night exposure: slightly lifted shadows compared to real darkness, but still natural. Avoid dramatic underexposure or film-noir contrast.
- **Shadows**: Soft and natural; do not create sharp dramatic shadows. No “cinematic” shadow shaping.
- **Color**: Mixed night lighting is OK (warm street lamps + cooler ambient). Keep white balance and color science realistic, like iPhone 13.
- **Skin & detail**: Natural iPhone 13 skin — clean, soft, real, no beauty filter and no hyper-detailed pores. Textures should read naturally under available light without looking like CGI.
- **Noise / motion**: Subtle smartphone noise and slight low-light softness are OK (authentic), but do NOT make it gritty. Add a **tiny handheld feel**: slight micro-shake / subtle motion blur like a real iPhone snapshot at night (very light, not smeary).
- **BACKGROUND (CRITICAL - NO BLUR AT ALL):** The background must remain **sharp and fully legible** like a normal iPhone 13 photo. **NO Portrait Mode. NO bokeh. NO background blur.** Distant lights may bloom slightly in night mode, but the scene must stay in focus and readable.
- **Overall**: Indistinguishable from a real iPhone 13 night street photo — casual, unfiltered, not polished, a bit RAW/unpolished (slightly imperfect exposure/noise), no film grading, no device frames or UI.`;
      }
      if (lightingLower.includes('day outside')) {
        return `${hyperrealismBase}

**LIGHTING: DAY OUTSIDE — OUTSIDE NATURAL LIGHTING (REFERENCE VISUAL — APPLY TO EVERY DAY OUTSIDE PROMPT):**
Match this outdoor UGC look: bright but **soft** natural sunlight (late morning / early afternoon or light overcast — **NOT** harsh midday sun). Think park or urban green space, candid chest-up portrait from an iPhone 13.

- **Light direction & quality**: Primary sun from **front-right of the subject, slightly elevated** (or front-upper-right). Illuminates the face evenly with a healthy natural glow. Light is **soft and flattering** — diffused enough that highlights are **not blown out**; detail remains on forehead, nose bridge, cheekbones, shoulder, hair.
- **Shadows**: **Soft and subtle** — under chin, along the **opposite side** of the face and neck from the key light, gentle under nose and lower lip. Enough chiaroscuro for 3D form **without** dark or dramatic contrast. Never harsh studio or cinematic shadows.
- **Color**: Natural balanced palette — **warm sunlight** on skin and clothes plus **slightly cooler ambient** from sky/green foliage in shadow areas. Authentic iPhone color science and white balance.
- **Skin (soft hyperrealism)**: Realistic skin with **soft, appealing** detail — natural pore structure and peach fuzz **where light grazes** the cheeks and forehead; **subtle** specular gloss from natural oils on forehead and cheekbones (volumetric, not plastic). NO beauty filter, NO over-smoothed skin, NO harsh HDR skin.
- **Hair & fabric**: Soft natural hair with visible strands near face and hairline; clothing shows **natural soft folds** and believable fabric texture (trench, scarf, knits) without crunchy oversharpening.
- **Background (ABSOLUTE - NO BLUR):** Outdoor context — green foliage, trees, optional light building; background must stay **sharp and clearly readable** like a normal iPhone 13 photo. **NO Portrait Mode, NO bokeh, NO blur**. Keep environment details visible and in focus.
- **Composition & gaze**: Medium **chest-up**; slight **upward angle** as casual phone hold. Subject should **look toward the camera** (talking-to-camera / friendly UGC) unless the user explicitly asks otherwise.
- **Overall**: Hyperrealistic, **soft**, candid outdoor iPhone capture — unposed, slightly RAW/unpolished (slightly imperfect exposure/noise), no device frames, no UI, indistinguishable from a real phone photo.`;
      }
      if (lightingLower.includes('artificial light inside')) {
        return `${hyperrealismBase}

**LIGHTING: ARTIFICIAL LIGHT INSIDE (SMARTPHONE CAPTURE):**
Indoor artificial lighting as real iPhone capture — NOT cinematic. Single dominant light source (LED ceiling, warm lamp, overhead light) from above and slightly frontal; creates visible directional illumination with soft but present shadows underneath and to the sides. Do NOT use flat even filler lights. Dynamic range: warm or neutral light temperature with bright illuminated areas and genuine shadow depth. Skin textures: visible pore structure, natural imperfections, specular glossiness from skin oils under indoor light. Fabric: threads, weave imperfections, realistic folds. Products: material-accurate reflections (plastic gloss, matte surfaces differentiated). Organic digital noise typical of indoor iPhone capture. Authentic iPhone color science. No cinematic polish.`;
      }
      if (lightingLower.includes('natural light inside')) {
        return `${hyperrealismBase}

**LIGHTING: NATURAL LIGHT INSIDE (SMARTPHONE CAPTURE):**
Indoor natural light from a window — single directional source creating a defined lit side and a softer shadow side. Light falls from the window direction with natural falloff across the scene. Skin: visible pore structure, natural imperfections, natural skin tone variation, peach fuzz in backlit areas, natural specular glossiness from skin oils on illuminated side. Fabric: threads, weave, minor pilling, realistic folds. Dynamic range: bright window-lit areas and genuine shadow depth — do NOT flatten. Organic digital noise from smartphone sensor in indoor light. Authentic iPhone color science and white balance. No cinematic polish, no studio filler lights.`;
      }
      if (lightingLower.includes('ring')) {
        return `${hyperrealismBase}

**LIGHTING: RING (INDOOR FRONTAL WHITE LED — SAME LOOK AS MAKEUP/VANITY LIGHT, ZERO LIGHT HARDWARE IN FRAME):**
Real indoor smartphone capture with **the same flattering frontal white light quality** people get from a makeup/vanity setup — **but the final image must show ONLY the person and the room**, never the light fixture or mirror product.

**ENCLOSED INDOOR ONLY — MANDATORY WHEN RING IS SELECTED:**
- The scene **must** be a **closed indoor space** (living room, bedroom, bathroom, hallway, dressing area, home office, etc.) — **never** outdoor, **never** open sky, balcony-as-exterior, street, park, or daylight-from-outdoors as the main environment.
- If **USER_DESCRIPTION** mentions outdoor or open-air, **rewrite the scene as indoors** (same subject, same vibe, but **inside** a room with walls/ceiling) — Ring mode **does not** support exterior locations.

**CRITICAL — TWO THINGS THAT TRIGGER THE GLOWING RING / MIRROR EDGE:**
1) Words like **"ring light"** → model draws a literal circular border.
2) Phrases like **"light from the vanity mirror"**, **"vanity mirror"**, **"lighted mirror"**, **"Hollywood mirror"** → model draws the **mirror frame, LED arc, or touch buttons** at the bottom of the frame.

Your **final output prompt MUST NOT** include: "ring light", "LED ring", "vanity mirror", "light from the mirror", "mirror positioned", "illuminated mirror", "lighted makeup mirror", "glowing arc", "mirror edge", "touch buttons", or any wording that places a **mirror or lamp** in the scene as a visible object.

**EXCEPTION — EYES ONLY:** A **visible frontal-LED catchlight** in the eyes is **required** (small circular or semicircular **white specular reflection** on the corneas from the invisible frontal key). That is **not** the same as drawing the physical ring — describe as **"catchlights"**, **"specular highlights in the eyes from the frontal white key"**, **"readable white reflection in both eyes"**. Do **not** omit eye catchlights for Ring.

**SAFE LIGHT DESCRIPTION (copy this pattern):**
- "Enclosed indoor room; soft frontal white LED key near the camera axis (off-camera — not visible in frame), **only** this source lights the scene; even face illumination, neutral-to-cool white balance, minimal soft shadows under jaw and nose; **clear visible circular/semicircular white catchlights in both eyes** from that frontal key."
- Optionally: "sitting at a simple desk or dressing table in the bedroom" — **do NOT** describe a mirror on the desk; **do NOT** mention where the LED is mounted.

**SINGLE LIGHT SOURCE ONLY — NO WARM / AMBER FILL (MANDATORY FOR RING):**
- The **only** light that shapes the scene is the **invisible-in-frame white frontal key** — you see its **effect** on the face (even white illumination, cool-neutral WB on skin), nothing else competing.
- **FORBIDDEN in the final prompt and in the image:** warm bedside lamp glow, amber/orange practicals, "warm lamp in the background", tungsten room lights, golden hour spill, sunset tone behind the subject, second key light, rim light, or any **visible warm/yellow light source** in the background.
- Background may read as **dim, neutral, or slightly cool shadow** (typical bedroom at night with only the face lit) — **not** lit by a separate warm lamp. If the room is visible, keep it **low-luminance and desaturated** so the eye reads **one** lighting story: white frontal beauty light on the face only.
- **Override vs generic UGC lighting text:** For Ring, **do not** describe warm bounce from walls, warm ambient fill, golden spill, or "natural color cast from a warm source" in the background — those conflict with single white-key-only.

**SET / FRAMING (MANDATORY):**
- Chest-up or medium shot focused on the face; **crop so no mirror, no lamp stand, and no glowing product edge** appears at the bottom or edges of the frame.
- The room may show behind the subject — **sharp background, no blur** — but **zero** mirror-with-LEDs product shots; **no glowing warm lamp** visible in frame.

- **Light source (concept):** **Exactly one** dominant **front-facing soft white LED** close to camera axis — same *look* as vanity lighting, **not** a multi-light cinematic setup. Treat the light as **invisible in-frame** (implied only by how the face is lit). **No additive warm lights.**
- **Face illumination:** Even frontal wrap; soft shadows under jawline/neck; natural, not flat CGI.
- **Eyes (MANDATORY FOR RING):** **Visible** frontal-key catchlights — small **circular or semicircular white reflections** on both eyes (the telltale sign of frontal beauty/LED lighting). **Must be present and legible**, not absent or crushed by shadow. Do **not** describe the physical ring device — only the **reflection in the eyes**. **Multiple subjects:** every visible face / avatar in frame must show matching frontal catchlights in the eyes where eyes are visible.
- **Framing (ABSOLUTE):** No physical lamp, no mirror surface, no mirror frame, no LED strip around a mirror, no glowing white arc at the bottom, no UI/icons on a mirror — **only the person and normal bedroom/desk environment**.
- **Color temperature:** Neutral-to-cool white, authentic iPhone WB.
- **Skin:** Clean natural iPhone skin, no beauty filter.
- **Environment:** **Indoor enclosed space only** — bedroom, living room, bathroom, etc.; readable context; **BACKGROUND (ABSOLUTE - NO BLUR)** like a normal iPhone 13 photo. No outdoor/exterior setting.
- **Reflections (avoid literal ring in glass):** If the scene includes a window, **do not** show a bright circular reflection of the key light in the glass — prefer wall/drapes/corner behind the subject, or a window area that reads as dark/neutral without a mirrored specular ring.
- **Overall:** Same stunning frontal white UGC look — **lighting spot-on, hardware invisible.**`;
      }
      return '';
    })();

    const imageCameraAngleAndLightingBlock = (imageCameraAngleBlock + imageLightingBlock).trim() ? (imageCameraAngleBlock + imageLightingBlock) : '';

    // Build style instructions based on style type
    if (style === 'hyperrealistic-ugc') {
      // UGC style - iPhone photography hyperrealism
      styleInstructions = `
**CRITICAL - GRABADO DE IPHONE (ALL UGC IMAGE PROMPTS):**
The image MUST look like a **real casual iPhone photo** - natural, unposed, NOT professional studio. **NO** cinematic lighting, NO cinematic shadows, NO studio look.

**OUTPUT PROMPT RULES (what to write in the final prompt, what NOT to write):**
- **Do NOT include** the words "homemade", "casero", or "spontaneous and homemade casero style" in the generated prompt - they don't make sense for the image model. **Instead DESCRIBE the look**: e.g. "like a casual iPhone 13 photo", "as if taken with an iPhone in a real moment", "natural and unposed, as iPhone captures in everyday life", "grabado de iPhone".
- **Request natural iPhone 13 skin**: describe skin as "clean, natural, real iPhone 13 skin" – smooth but not plastic, with gentle real-world texture. Do NOT request "visible pores", "microscopic detail", or "peach fuzz"; instead say "subtle natural texture" or "soft natural detail" and forbid beauty filters.
- **Request fabric realism (soft)**: realistic folds and natural texture in clothes (hoodies, denim, knits) but **not** thread-by-thread microscopic sharpness.
- **Do request**: ${isRingLighting ? '**ONLY** the lighting in the **CAMERA ANGLE & LIGHTING** block at the end of these instructions (Ring: single frontal white LED, indoor enclosed) — **never** substitute "window light" or "natural light from a window". Gentle specular' : 'directional natural light (specify type and source), gentle specular'} response on skin (soft natural sheen), slight smartphone noise, and natural depth of field similar to iPhone 13 Portrait / Photo mode.
- **Avoid in the prompt**: "studio lighting", "perfect symmetry", "glamour processing", "over-smoothed skin", "cinematic shadows", "ultra-detailed pores", device frames.
- **NO OVERLAY (MANDATORY in every generated prompt):** The final prompt MUST explicitly state that the output is a **clean full-bleed photograph only** — **zero** on-image overlays: no status bar, carrier name, clock, battery %, Wi‑Fi/signal icons, notch UI, Dynamic Island, recording indicators, camera-app interface, screenshot-style black bars, fake iPhone chrome, watermarks, or any UI pasted on the image. Describe only the scene as a real exported photo file, not a screen capture.

**HYPERREALISTIC UGC STYLE REQUIREMENTS (iPhone Photography Hyperrealism):**

You MUST generate a prompt that targets a REAL iPhone capture including RAW imperfections (JPEG artifacts, sensor noise, exposure mistakes). The image must look like it was taken with an iPhone - indistinguishable from a real iPhone photo (but unpolished/raw, not studio-perfect). **Use the SAME standards as UGC video prompts for lighting, shadows, tonalities and color** - but always NATURAL and iPhone-like, never cinematic.

**LIGHTING, SHADOWS AND TONALITY (MANDATORY - PHYSICAL SIMULATION):**
- **Single-source directional light (always specify):** ${isRingLighting ? '**USER SELECTED RING — use ONLY the frontal white LED key described in the CAMERA ANGLE & LIGHTING block below.** Do **not** use "window", "sun", "skylight", or "natural daylight from the side" as the key. The light MUST create distinct shadows and bright sharp specular highlights on the face from that frontal key + **visible catchlights in the eyes**.' : 'Use complex, single-source, directional lighting — e.g. "direct low sun from front-left", "single window light from the left", "warm overhead LED from above-right". The light MUST create distinct shadows and bright sharp specular highlights. **Never** "soft even studio light", "filler lights", "all-encompassing ambient". Specify type, direction, and intensity.'}
- **Dynamic contrast (MANDATORY):** Do NOT compress the dynamic range. Ensure rich, deep shadows and bright, detailed highlights without over-processing. The image must have genuine tonal range.
- **Surface-specific specularity (MANDATORY):** Skin must show visible natural specular glossiness (oils/sweat) to define volumetric form — prevents matte/airbrushed look. Metal, plastic, and fabric reflect light according to their physical properties. State this explicitly in the prompt.
- **Global illumination / radiosity (MANDATORY):** ${isRingLighting ? '**Ring mode:** Keep bounce **minimal and neutral/cool** — **no** warm golden wall bounce as the main story; background stays dim. **Do not** invent a second warm light source.' : "The background's ambient light must physically influence the subject; the subject must cast subtle colored light onto nearby surfaces (light bounce). e.g. \"warm bounce light from nearby warm-toned surface coloring the shadow side softly\"."}
- **Shadows:** Physically accurate shadows from the single light source — present and directional, with proper falloff. Use shadow/highlight contrast (chiaroscuro) to define facial features and 3D volumetric depth. **Never** flat shadowless lighting.
- **Highlights:** Bright, sharp specular highlights on skin (forehead, nose, cheekbones), glass, plastic — authentic iPhone sensor rolloff. Not clamped or over-processed.
- **Tonalities and color:** "iPhone's authentic color science and white balance", "realistic color temperature", ${isRingLighting ? '**Ring:** neutral-to-cool white balance from the frontal key — **not** "cool window light" as a phrase implying a window key source' : 'natural color cast from light source (e.g. warm golden cast, neutral daylight, cool window light)'}. Authentic dynamic range as iPhone captures.
- **Camera noise & artefacts (MANDATORY):** Include subtle organic digital noise (grain) and minor chromatic aberration toward the frame edges to break perfect rendering and simulate a real sensor.

- **Lighting (CRITICAL - real-world single source, NOT studio):**
  - ${isRingLighting ? '**Ring:** single invisible frontal white LED key only (see block at end). **Forbidden:** window as key, sunlight, skylight, outdoor natural light as main source.' : 'Single-source natural or artificial light — e.g. window light from one side, overhead warm lamp, outdoor low sun — slightly uneven as in real casual photos.'}
  - **No filler lights**: Do NOT add secondary lights to fill shadows evenly. Preserve natural shadow depth from the single source.
  - Describe "single directional light source"${isRingLighting ? ' — for Ring that source is **only** the frontal white LED' : ''}, "directional natural/artificial light as in real life" — **never** "studio lighting", "perfectly balanced", "even illumination", "refined portrait lighting".
  - ${isRingLighting ? 'Tie shadows and WB to the **frontal white LED key** and **visible eye catchlights** — not to a window.' : 'Always tie shadows, tonalities, and color cast to the specific light source: "warm color cast from [source]", "cool shadow fill from ambient sky", "directional shadows from single overhead light".'}
- **Angle and composition (CRITICAL):**
  - **Close-up portrait framing**: Chest-up or intimate close-up; subject fills the frame; avoid wide-angle that "captures more of the room"
  - **Slightly low / slight upward angle** when it fits (e.g. selfie-style but refined); clear, focused framing on the subject
  - Do NOT default to "wide-angle lens characteristic of handheld mobile" or "purposefully amateur composition"; prefer "close-up portrait", "intimate framing", "chest-up with sharp focus on subject"
- **Texture (CRITICAL - natural iPhone 13, NOT beauty-filtered):**
  - **Skin**: Describe as "natural iPhone 13 skin" – clean, soft, realistic, with gentle natural texture. Do NOT request "visible pores", "microscopic detail", "peach fuzz" or similar; instead use "soft natural texture", "clean but real skin", and explicitly forbid beauty filters or airbrushing.
  - **Fabric**: Realistic folds and believable cloth texture (hoodies, denim, knits) without over-sharpened weave detail. No need to emphasize every thread.
  - **Material differentiation**: Maintain clear separation between plastic, fabric, hair, etc., using their light response rather than extreme texture exaggeration.
  - **Avoid in prompt**: "over-smoothed skin", "plastic skin", "glamour processing", "perfectly uniform patterns", "ultra-detailed pores", "studio", "cinematic".
- **iPhone photography aesthetic**: The image must look exactly like it was captured with an iPhone - authentic iPhone color science, realistic skin tones, natural image processing
- **First-person or third-person perspective**: The image can be taken by the same person (first-person POV) or by someone else (third-person), but it must always look like an iPhone photo - natural, authentic, and realistic
- **iPhone camera characteristics (NATURAL IPHONE 13 BEHAVIOR):**
  - **Lens**: Simulate an iPhone wide lens (~24–26mm) with mild perspective distortion and natural field of view.
- **Depth of field (ABSOLUTE - NO BLUR):** Deep iPhone 13 depth of field – subject AND background sharp/legible. **NO Portrait Mode, NO bokeh, NO blur**.
  - **Chromatic aberration & noise**: Very subtle smartphone noise and light chromatic aberration only where it helps break CGI perfection – never heavy grain.
  - **Color science**: iPhone's authentic color science and white balance — clean, natural, not cinematic.
  - **Dynamic range**: iPhone 13 dynamic range — balanced highlights/shadows, small natural clipping in bright areas acceptable.
- **Flash photography when contextually appropriate**: If the scene requires it (low light, night scenes), include iPhone flash with proper flash shadows and color temperature
- **Shadows (GRABADO DE IPHONE)**: Soft, natural shadows only - proper falloff, no harsh edges. **Never** cinematic or dramatic shadows.
- **Lighting**: Soft diffused light, realistic diffusion, gentle highlights - as iPhone captures. **Never** cinematic or film-style lighting.
- **Textures (NATURAL IPHONE 13)**: Skin should read as **soft, clean, natural** iPhone 13 skin – gentle texture, no visible filters, but never hyper‑macro. Avoid calling out "visible pores" or "peach fuzz"; instead say "soft natural skin texture" and explicitly forbid beauty filters. Fabrics show believable folds and softness without extreme weave detail. Materials remain visually distinct without exaggerated micro‑detail.
- **Human facial features (CRITICAL - NO BEAUTY FILTER)**: If the image includes human faces:
  - **Volumetrics**: Lighting should give natural depth to the face (light and soft shadow), but avoid harsh 3D/CGI language – it must feel like a casual iPhone 13 portrait.
  - **Skin look**: Request "clean, natural iPhone 13 skin" or "soft, realistic facial features" – DO NOT request "visible pores", "microscopic detail", or "peach fuzz". Forbid plastic/airbrushed looks.
  - **Specularity**: Mention only "subtle natural sheen" on forehead/cheekbones from skin oils – not strong specular spikes.
  - **Dynamic posture**: Encourage relaxed, unposed body language (talking to camera, casual conversation) that feels like a real phone photo.
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
  - **CRITICAL - MUST MAINTAIN ALL HYPERREALISTIC REQUIREMENTS (same as UGC video prompts):**
    - **Lighting (explicit in prompt):** Specify light type and direction (e.g. natural window light from left, warm LED from above), "realistic color temperature", "authentic light diffusion", "genuine light falloff". Same standards as UGC video.
    - **Ultra-realistic shadows:** "Natural shadows with proper falloff", "realistic shadow edges", "authentic shadow density and color that matches the light source". Warm/cool shadow tone matching the light. Same language as UGC video prompts.
    - **Tonalities and color:** "iPhone's authentic color science and white balance", "realistic color temperature", "genuine color reproduction", "characteristic dynamic range". Describe color cast from the light (e.g. warm/cool) and how it affects surfaces.
    - **Hyperrealistic lighting:** Natural or artificial light behavior, realistic diffusion, authentic temperature and color casts, genuine light reflections and highlights - exactly as an iPhone would capture it
    - **Photorealistic textures:** Every surface with realistic material properties - natural fabric texture with threads/weave/pilling, product with authentic details. For people: visible pore structure, natural imperfections, peach fuzz in backlit areas, natural specular glossiness from skin oils. No beauty filter.
    - **iPhone camera characteristics:** Natural depth of field, authentic color science, natural sharpness, characteristic dynamic range
    - **Authentic colors:** Natural color science, realistic color temperature, genuine color reproduction
    - **Real-world details:** Natural imperfections, authentic material response to lighting, genuine atmospheric perspective
    - **Maximum realism:** Everything 100% real, as if photographed with an iPhone - indistinguishable from a real iPhone photo
    - **No artificial elements:** Everything natural and authentic, as if captured with an iPhone in the real world
  - iPhone camera quality and characteristics - the image must look exactly like it was taken with an iPhone, with all the hyperrealistic qualities of iPhone photography (lights, shadows, tonalities as in UGC video prompts)

- **PORTRAIT / PEOPLE (PEOPLE MENTIONED)**: If the description DOES mention people/persons:
  - **Describe as "like a casual iPhone photo"** - ${isRingLighting ? '**Ring lighting only** — frontal white LED key, enclosed indoor, catchlights in eyes. **Do NOT** default to window or daylight as the key.' : 'directional natural light (window, room, daylight) with specified source,'} close-up or chest-up, selfie-style angle. Do NOT write "homemade" or "casero" in the prompt; describe the look (e.g. "as if taken with iPhone", "like a casual iPhone selfie"). Request realistic skin texture: "visible pore structure", "natural imperfections", "peach fuzz in backlit areas", "microscopic skin specularity" — do NOT beauty-filter or over-smooth.
  - **Camera angles**: Natural framing - close-up, chest-up, selfie-style (slightly from below when it fits). As if taken with phone in hand.
  - **Talking-to-camera behavior (MANDATORY for all UGC people images)**: Unless the user explicitly says otherwise, assume the person is naturally interacting with the camera — looking toward the lens or slightly off-axis, with facial expression and body language that feel like they are talking to camera or recording a message, whether the shot is selfie, frontal or steady (phone on table/tripod).
  - **Eye contact rule (ABSOLUTE):** In UGC, if there are people in frame, ALL people MUST be facing the camera / looking toward the lens as if speaking to camera. Do NOT have subjects looking away at each other unless the user explicitly requests it.
  - **People count (CRITICAL - NO EXTRA PEOPLE):** The number of human subjects in the generated image MUST match exactly what the user described (and any attached character images). Do NOT add extra friends/people beyond what the description implies. For example: "the avatar in a park with friend" → exactly two people; "with two friends" → exactly three people total. Never invent additional background people unless the user explicitly asks for them.
  - **Lighting**: ${isRingLighting ? '**Only** the Ring frontal white LED setup (see CAMERA ANGLE & LIGHTING block). **Not** window/daylight as key.' : 'Natural - window light, room light, daylight. Soft, no harsh shadows. No studio.'}
  - **User description priority**: Follow the user's description; output should read like a description of a casual iPhone photo — natural, not studio — and must NOT include "homemade" or "casero" literally (describe the look instead).
  - **Reference image priority**: ${mainReferenceImageFile ? (attachReferenceAsReferenceOnly ? 'A reference image will be attached for REFERENCE ONLY. Use it as the base for lighting, camera angle/perspective, composition, background mood, texture, and hyperrealism level. The face/person MUST change (different avatar), and the new image must clearly feel like a variation of that same scene and setting, not a 1:1 copy.' : (copyCameraAngle ? 'If a main reference image is provided, you MUST copy the EXACT camera angle and perspective from the main reference image. This is CRITICAL - the camera angle MUST be replicated exactly. The main reference image will be uploaded to Nano Banana Pro and placed first, so the camera angle must be matched precisely.' : mainReferenceImagePrompt ? 'If a main reference image is provided, you MUST respect the EXACT camera angle, composition, and visual style from the main reference image. The main reference image prompt describes exactly how the reference looks - match that EXACTLY in terms of angle, composition, lighting, and aesthetic, but adapt the content to the user\'s description. This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly.' : 'If a main reference image is provided, analyze it and match its camera angle and perspective exactly. This image will be uploaded to Nano Banana Pro and placed first.')) : 'Choose the most natural camera angle and framing that fits the scene described.'}
  - iPhone camera quality and characteristics - must look like a real iPhone photo taken casually

**iPhone 13 Photography Quality Requirements (Natural Look, No CGI):**
- In the prompt write: "iPhone photography", "taken with iPhone", "grabado de iPhone", or "like a casual iPhone 13 photo" / "as if taken with an iPhone" — **do NOT write "homemade" or "casero"** (describe the look instead).
- **Skin look (MANDATORY)**: Ask for "clean, natural iPhone 13 skin" or "soft natural facial features" – explicitly forbid beauty filters and over-smoothed plastic skin, but DO NOT request "visible pores", "peach fuzz" or microscope-level detail.
- **Lighting (MANDATORY)**: ${isRingLighting ? '**Ring:** follow ONLY the CAMERA ANGLE & LIGHTING block — frontal white LED, indoor, catchlights. **Never** describe window as the key light.' : 'Single-source directional light with realistic softness; natural highlight and shadow behavior; no studio setups; dynamic range similar to good iPhone 13 exposure (balanced, not HDR crunchy).'}
- **Lens & DOF (MANDATORY)**: iPhone wide lens look (~24–26mm), natural smartphone depth of field (subject clearly in focus, background moderately softer), organic bokeh when present, no fake Gaussian blur.
- **ABSOLUTE NEGATIVE PROMPTS**: NO beauty-filtered / airbrushed skin, NO hyper-detailed pores, NO glamour-shot post-processing, NO uniform plastic fabrics, NO perfectly flat lighting with many fillers, NO synthetic oversharpening, NO cinematic grading, NO device frames or UI elements, **NO overlays** (status bar, carrier, time, battery, signal, notch, screenshot bars, letterboxing, phone mockup chrome, watermarks).
- Include iPhone's characteristic color science — natural color, natural exposure.
- If flash is needed, specify "iPhone flash" or "iPhone camera flash".
- **CRITICAL - NO DEVICE FRAMES OR BORDERS**: 
  - **ABSOLUTE PROHIBITION**: You MUST NOT mention, include, or suggest iPhone frames, iPhone borders, iPhone margins, device frames, screen borders, or any UI elements in the prompt UNLESS the user explicitly requests them
  - **ONLY describe the photo/image itself**: Describe the image as a photo taken with an iPhone, but WITHOUT any device frames, borders, or margins
  - **NO screenshots**: Do NOT describe it as a screenshot unless the user explicitly mentions screenshot or screen capture
  - **NO UI elements**: Do NOT include any UI elements, status bars, navigation bars, or device interface elements
  - **NO OVERLAY (expanded — same as production UGC):** The image must be **only** the photograph pixels. Forbidden: status bar strip (Verizon/carrier, time, battery), signal/Wi‑Fi icons, Dynamic Island/notch UI, home indicator bar, letterboxed “phone preview”, rounded-corner mockup window, fake camera roll frame, recording dot/HUD, volume UI, any text/icons on top of the image. If needed, add to the generated prompt: “full-frame photo export, no UI, no screenshot, no phone chrome.”
  - **Just the photo**: The prompt should describe a clean photo/image without any device framing or borders
- **Perspective clarification**:
  - If description mentions people: Describe as **like a casual iPhone 13 photo** — ${isRingLighting ? '**Ring lighting** (single frontal white LED key, enclosed room, catchlights in eyes) — **not** window or outdoor natural light' : 'directional natural light (single source)'}, close-up or chest-up, selfie-style angle; **natural iPhone 13 skin** (clean, soft, real, no beauty filter, no hyper-detail); soft natural shadows; iPhone color science; **NO cinematic blur / NO portrait-mode bokeh** (background readable); subtle smartphone noise; slight handheld feel is OK. Do NOT write "homemade" or "casero" in the prompt text.
  - If description does NOT mention people: The image should look like it was taken by someone with an iPhone in third-person perspective (as if someone is photographing the subject/scene), but NO people visible in the frame
  - **Reference image priority**: ${mainReferenceImageFile ? (attachReferenceAsReferenceOnly ? 'A reference image will be attached for REFERENCE ONLY. Use it ONLY for lighting, texture, and hyperrealism. The face/person can be a different avatar. Do NOT copy the person; same lighting, texture, hyperrealistic look.' : (copyCameraAngle && !copyLighting ? 'If Copy Camera Angle is selected without attaching reference image, extract and describe the camera angle from reference analysis only. Do NOT mention any attached reference image in the final prompt.' : (copyCameraAngle ? 'If a main reference image is provided, you MUST copy the EXACT camera angle and perspective from the main reference image. This is CRITICAL - the camera angle MUST be replicated exactly. The main reference image will be uploaded to Nano Banana Pro and placed first, so the camera angle must be matched precisely.' : mainReferenceImagePrompt ? 'If a main reference image is provided, match the EXACT camera angle and perspective from the main reference image. The main reference image prompt describes exactly how the reference looks - respect that EXACTLY. This image will be uploaded to Nano Banana Pro and placed first, so the style must be replicated exactly.' : 'If a main reference image is provided, analyze it and match its camera angle and perspective exactly. This image will be uploaded to Nano Banana Pro and placed first.'))) : 'Choose the most natural camera angle that fits the scene.'}

The goal: image like a **real casual iPhone photo** (grabado de iPhone). ${isRingLighting ? '**Lighting is ONLY as in the Ring block above** — do not substitute "natural light from a window".' : 'Natural light,'} natural skin and texture (as iPhone captures - **not** "visible pores" or ultra-defined), soft shadows, no cinematic. **In the final prompt:** describe the look as "like a casual iPhone photo" / "as if taken with iPhone" - do NOT write "homemade" or "casero". Do NOT ask for "visible pores" or "subtle fine lines". **CRITICAL:** Result must look like real UGC on iPhone - natural, not over-defined, NOT studio, NOT cinematic. Clean photo, no device frames. **CRITICAL: The image should be a clean full-bleed photo without any device frames, borders, margins, overlays, status bars, or UI elements — just the photograph itself (not a screenshot, not a phone mockup).**${imageCameraAngleAndLightingBlock}${referenceImageNote}`;
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
      
      const referenceImageNote = (attachReferenceAsReferenceOnly && mainReferenceImageFile) ? `

**REFERENCE IMAGE - USO SOLO COMO BASE DE SETTING (NO COPIAR IDENTIDAD):**
The user will attach a reference image. Treat it as the **base setting and camera setup**: same lighting, camera angle/perspective, composition and overall background mood. The face/person/avatar MUST change. Your generated prompt MUST state clearly: "The attached image is for reference only. Use it ONLY as the base for lighting, camera angle, composition, background mood, texture, and hyperrealism level. Do not copy the exact face or identity – generate a different avatar/person starting from that same setting." Then describe the new scene from the user's description as a variation of that base image.` : mainReferenceImageFile && mainReferenceImagePrompt ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE PROMPT (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST, AND WILL ALSO BE ATTACHED TO FINAL IMAGE GENERATION):**
A main reference image has been provided and analyzed. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. **IMPORTANT**: This reference image will ALSO be attached to the final image generation model, so the model will have access to it.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' **CRITICAL: You MUST copy the EXACT camera angle and perspective from the attached reference image.**' : ''}${copyLighting ? ' **CRITICAL: You MUST copy the EXACT lighting style from the attached reference image.**' : ''}` : ' The generated prompt MUST specify that the result must match this EXACT style, lighting, and professional quality, explicitly referencing the attached reference image.'}

**Main Reference Image Prompt (use this as PRIMARY style reference):**
"${mainReferenceImagePrompt}"

**Your Task:**
You MUST use the main reference image prompt above as the PRIMARY style guide. This image will be uploaded to Nano Banana Pro and placed first, AND will also be attached to the final image generation. You MUST:
1. **Explicitly reference the attached reference image** in your prompt - use phrases like "matching the attached reference image", "as shown in the attached reference image", "replicating the style from the attached reference image"
2. **Incorporate the same visual style, lighting, textures, colors, composition, and aesthetic quality**:${copyInstructionsStudio}
${!copyCameraAngle && !copyLighting ? `
- **Mimic the lighting style**: Use the EXACT same type of lighting described in the main reference prompt (studio, natural, artificial, etc.), same direction, intensity, color temperature, shadows, and highlights - THIS IS CRITICAL, explicitly referencing "the attached reference image"
- **Match the texture quality**: Incorporate the EXACT same texture characteristics and material appearance as described in the main reference, explicitly referencing "the attached reference image"
- **Match the color palette**: Use the EXACT same color temperature, saturation, contrast, and color harmony as described in the main reference, explicitly referencing "the attached reference image"
- **Match the composition style**: Use the EXACT same camera angles, framing, perspective, depth of field as the main reference, explicitly referencing "the attached reference image"` : ''}
- **Match the overall aesthetic**: If the main reference is studio-quality, maintain studio quality; match the overall visual style and professional photography approach, explicitly referencing "the attached reference image"
- **Apply to user's description**: While using the main reference as PRIMARY style guide, create a prompt for what the user described: "${description}"
- **Combine both**: The final prompt should describe the user's request but with the EXACT visual style, lighting, textures, and aesthetic of the main reference image${copyCameraAngle ? ' - **CRITICAL: Explicitly state "copy the EXACT camera angle and perspective from the attached reference image"' : ''}${copyLighting ? ' - **CRITICAL: Explicitly state "copy the EXACT lighting style from the attached reference image"' : ''}
- **Make explicit references**: Throughout your prompt, identify the reference by what it shows; do NOT use "first/second" or "reference/product" as labels.
${productImageFiles.length > 0 ? `
**CRITICAL - IDENTIFY IMAGES BY DESCRIPTION:** The model will receive multiple attached images and cannot know which is "first" or "reference". Describe the reference image's content in detail (e.g. "the attached image that shows a wide shot of products on a reflective surface with soft shadows and artificial studio lighting, light grey background, high-key soft diffused light from the upper right"). Refer to the product as "the attached image that shows [product name and key visual details]". Your prompt must be detailed and extensive so the model can match each attachment by its description.` : ''}

**CRITICAL**: The prompt must be detailed and extensive, with full description of camera angle, lighting and setting, and identify the reference image by its visual content.` : mainReferenceImageFile ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST, AND WILL ALSO BE ATTACHED TO FINAL IMAGE GENERATION):**
A main reference image has been attached. This image will be uploaded to the Nano Banana Pro model and will be placed FIRST. **IMPORTANT**: This reference image will ALSO be attached to the final image generation model, so the model will have access to it.${copyCameraAngle || copyLighting ? ` The user has selected specific elements to copy from this reference image.${copyCameraAngle ? ' **CRITICAL: You MUST copy the EXACT camera angle and perspective from the attached reference image.**' : ''}${copyLighting ? ' **CRITICAL: You MUST copy the EXACT lighting style from the attached reference image.**' : ''}` : ''} You MUST:
- **Analyze the attached main reference image** to understand its composition, colors, style, lighting, and aesthetic - THIS IS CRITICAL
- **Base your prompt on the main reference image** - use it as the PRIMARY guide for composition, colors, lighting style, and overall aesthetic
- **Explicitly reference the attached reference image** throughout your prompt - use phrases like "matching the attached reference image", "as shown in the attached reference image", "replicating the style from the attached reference image"
- **Maintain EXACT consistency with the main reference** - if the main reference shows specific colors, lighting, composition, or style elements, incorporate those EXACTLY into the prompt:${copyInstructionsStudio}
${!copyCameraAngle && !copyLighting ? `
  - **EXACT camera angle and perspective** - match the main reference image's camera angle precisely, explicitly referencing "the attached reference image"
  - **EXACT composition and framing** - match the main reference image's framing and composition, explicitly referencing "the attached reference image"
  - **EXACT lighting style** - match the main reference image's lighting characteristics - THIS IS CRITICAL, explicitly referencing "the attached reference image"` : ''}
- **Enhance while preserving essence** - build upon the main reference image's aesthetic while applying professional studio photography quality
- **Mention the main reference explicitly** - In your generated prompt, explicitly state that the image generation should follow the EXACT aesthetic, composition, colors, lighting, and style of the attached main reference image${copyCameraAngle ? ' - **CRITICAL: Explicitly state "copy the EXACT camera angle and perspective from the attached reference image"' : ''}${copyLighting ? ' - **CRITICAL: Explicitly state "copy the EXACT lighting style from the attached reference image"' : ''}
- **Professional studio enhancement** - Apply professional studio photography principles (studio lighting, professional composition, controlled environment) while respecting the main reference image's visual language
${productImageFiles.length > 0 ? '- **When product is also attached**: Identify the reference by describing what that image shows (e.g. "the attached image that shows [wide shot, lighting, background description]"); identify the product by "the attached image that shows [product details]". Do not use first/second. Be detailed and extensive.' : ''}
- **CRITICAL**: The prompt must be detailed and extensive; identify images by their visual content so the model can tell which attachment is which.` : '';

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
      
      const referenceImageNote = (attachReferenceAsReferenceOnly && mainReferenceImageFile) ? `

**REFERENCE IMAGE - USO SOLO COMO REFERENCIA (NO REPLICAR):**
The user will attach a reference image. Use it ONLY for **lighting, texture, and hyperrealism** (and design style if applicable). The face/person can be different. Your generated prompt MUST state: "The attached image is for reference only. Use it ONLY for lighting, texture, and hyperrealism. Do not copy the face or person." Then describe the design/scene from the user's description.` : mainReferenceImageFile && mainReferenceImagePrompt ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE PROMPT (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
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
${productImageFiles.length > 0 ? `
**CRITICAL - IDENTIFY IMAGES BY DESCRIPTION:** Do not use "first/second" or "reference/product". Describe the reference by what it shows (e.g. "the attached image that shows [design style, layout, colors described in detail]"); describe the product by "the attached image that shows [product details]". Be detailed and extensive.` : ''}

**CRITICAL**: The prompt must be detailed and extensive; identify each image by its visual content.` : mainReferenceImageFile ? `\n\n**CRITICAL - MAIN REFERENCE IMAGE ATTACHED (PRIMARY STYLE REFERENCE - WILL BE UPLOADED TO NANO BANANA PRO AND PLACED FIRST):**
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
    const styleSpecialization = style === 'hyperrealistic-ugc' 
      ? 'hyperrealistic UGC (iPhone photography)' 
      : style === 'hyperrealistic-cinematic'
      ? 'hyperrealistic cinematic (professional/cinematic)'
      : style === 'studio-quality' 
        ? 'professional studio photography' 
        : style === 'change-elements'
        ? 'element replacement in image'
        : 'professional design';
    
    const styleApplicationNote = style === 'hyperrealistic-ugc' 
      ? 'Use iPhone/hyperrealistic UGC style - the image must look like it was taken with an iPhone with authentic iPhone photography characteristics.'
      : style === 'hyperrealistic-cinematic'
      ? 'Use cinematic, professional, or high-production quality - the image must look like it was captured with professional camera equipment (DSLR, cinema camera) with cinematic lighting, color grading, and composition.'
      : style === 'studio-quality' 
        ? 'Use professional studio photography quality'
        : style === 'change-elements'
        ? 'Replace specific elements in the base image with new elements while maintaining all other characteristics'
        : 'Use professional design quality';
    
    const criticalRequirementsNote = '';

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

${styleInstructions}${style === 'hyperrealistic-cinematic' && imageCameraAngleAndLightingBlock ? imageCameraAngleAndLightingBlock : ''}${style === 'hyperrealistic-ugc' && isRingLighting ? `

---

**RING LIGHTING — ABSOLUTE PRIORITY (USER SELECTED IN THE APP — APPLIES TO EVERY GENERATION, INCLUDING REPEATS):**
The user selected **Ring** in the Lighting selector. **Ignore** any other paragraph in this system message that suggests: window light, natural light from a window, daylight from the side, skylight, golden hour sun, or outdoor lighting as the **primary** key — **even if that text appears earlier in this message.**
**FORBIDDEN in your generated output:** "light from a large window", "window to the left", "natural daylight from a window", "sunlight through the window", "single-source directional natural light coming from a window".
**REQUIRED in your generated output:** enclosed indoor room; **single** invisible frontal white LED key (off-camera); **visible white catchlights** in both eyes; **no** second warm practical light.
Repeat — Camera angle & lighting (follow this exactly):
${imageCameraAngleAndLightingBlock}

---
` : ''}

**Your Task:**
Generate an extremely detailed, comprehensive prompt that:
1. **Faithfully follows** the user's description: "${description}"
2. **Applies the appropriate style**:
   - ${styleApplicationNote}
4. **Enhances and expands** the user's description with professional details, technical specifications, and visual elements
5. **Ensures maximum quality** for the selected style

**Critical Requirements:**
${criticalRequirementsSection}- The prompt must be detailed and comprehensive
- Include all necessary technical details for the selected style
- **Lighting, shadows and tonalities (mandatory for hyperrealistic-ugc and hyperrealistic-cinematic):** ${isRingLighting ? `**Ring is selected:** Describe ONLY the **frontal white LED key** and **eye catchlights** as in the Ring block above — **never** invent a window as the light source. Shadows and WB must match that single frontal key. For UGC: iPhone color science; **zero** window-daylight wording.` : `Describe explicitly: light source type and direction, color temperature and diffusion, shadows with proper falloff and density matching the light source, highlights and reflections, and how each surface responds to light. Use the same level of detail as UGC video prompts (e.g. "ultra-realistic shadows with proper falloff", "authentic color temperature", "genuine light diffusion"). For UGC: iPhone color science and white balance; for cinematic: professional color grading and tonal range.`}
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

      // When character images were provided, ensure the prompt explicitly references the attached image.
      // If forceSameCharacterReference is true (user pressed "SAME CHARACTER"), always prepend the reference.
      if (characterImageFiles.length > 0) {
        const hasAttachedReference = /\bthe attached image\b|\battached\s+(character\s+)?image\b|the same person as in the attached|the person from the attached|as (shown )?in the attached image|exact same person as in the attached/i.test(generatedPrompt);
        const mustInject = forceSameCharacterReference === true || !hasAttachedReference;
        if (mustInject) {
          if (characterImageFiles.length === 1) {
            const firstChar = generatedPrompt.charAt(0);
            const rest = generatedPrompt.slice(1);
            generatedPrompt = 'The exact same avatar/person as in the attached image (match identity 1:1: face, features, hair), ' + firstChar.toLowerCase() + rest;
          } else {
            const refs = characterShortDescriptors.length >= characterImageFiles.length
              ? characterImageFiles.map((_, i) => `person from the attached image ${i + 1} (${characterShortDescriptors[i]})`).join(', ')
              : `persons from the ${characterImageFiles.length} attached character images`;
            generatedPrompt = `The ${refs}. ` + generatedPrompt;
          }
          console.log(forceSameCharacterReference ? 'Forced attached character image reference (SAME CHARACTER on)' : 'Injected attached character image reference into prompt (was missing)');
        }
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
    
    // Check for image-related errors
    if (error.message?.includes('image') || error.message?.includes('Image') || error.message?.includes('base64') || error.message?.includes('corrupted') || error.message?.includes('Invalid')) {
      return NextResponse.json(
        {
          error: 'Error processing image',
          details: error.message || 'There was an error processing one of the uploaded images. Please ensure all images are valid image files (PNG, JPEG, WebP, or GIF) and try again.'
        },
        { status: 400 }
      );
    }
    
    // Check for file upload errors
    if (error.message?.includes('file') || error.message?.includes('File') || error.message?.includes('upload') || error.message?.includes('Upload')) {
      return NextResponse.json(
        {
          error: 'Error uploading image',
          details: error.message || 'There was an error uploading the image to the server. Please try uploading a smaller image or check your internet connection.'
        },
        { status: 500 }
      );
    }
    
    // Check for timeout errors
    if (error.message?.includes('timeout') || error.message?.includes('Timeout') || error.message?.includes('TIMEOUT')) {
      return NextResponse.json(
        {
          error: 'Request timeout',
          details: 'The request took too long to process. Please try again with a smaller image or simpler description.'
        },
        { status: 504 }
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

