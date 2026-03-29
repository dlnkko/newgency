import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';
import { recordGeneration } from '@/lib/generation-check';

const PRODUCT_LOCK_PHRASE = 'as seen in the attached image';

/** Ensures the exact product-lock anchor phrase is present (models often drop it). */
function ensureProductLockInVideoPrompt(videoPrompt: string, lock: boolean): string {
  if (!lock) return videoPrompt;
  const t = videoPrompt.trim().replace(/\s+/g, ' ').trim();
  if (!t) return t;
  if (t.toLowerCase().includes(PRODUCT_LOCK_PHRASE.toLowerCase())) return t;
  const glue = /[.!?]$/.test(t) ? ' ' : '. ';
  const suffix = `${glue}Keep the product ${PRODUCT_LOCK_PHRASE}; no morphing or redesign.`;
  const maxBase = Math.max(80, 999 - suffix.length);
  let base = t;
  if (base.length + suffix.length > 999) {
    base = base.substring(0, maxBase).trim();
    const ls = base.lastIndexOf(' ');
    if (ls > maxBase * 0.4) base = base.substring(0, ls).trim();
  }
  return (base + suffix).replace(/\s+/g, ' ').trim();
}

export async function POST(request: NextRequest) {
  try {
    // Check rate limit
    const rateLimitResult = await checkRateLimit('generateProductVideo', request);
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
    const { productImage, actionDescription, animateOnly, nanoBananaOnly, isUGC: isUGCBody, ugcCameraMode: ugcCameraModeBody, lastFrameNanoBananaOnly, firstAndLastFrameAnimation, lastFrameImage, script } = body;
    const isUGC = !!isUGCBody || !!body.ugcMode;
    const ugcCameraMode: 'selfie' | 'gimbal' = ugcCameraModeBody === 'gimbal' ? 'gimbal' : 'selfie';
    const lockProductFromFrame = body.lockProductFromFrame === true;
    const scriptTrimmed = typeof script === 'string' ? script.trim() : '';
    const ugcRawRealismBlock = `

**UGC — REAL PHYSICS & RAW IPHONE CAPTURE (MANDATORY):**
- **Physics:** Motion must follow **believable real-world physics**—weight, gravity, inertia, natural body mechanics, hand and product movement; nothing floaty, weightless, or overly smoothed unless the user explicitly asks.
- **Light follows movement:** If the person **walks, turns, steps, or moves** through the room, describe **how light changes** on face, skin, hair, and product—highlights and shadows **shift**, contrast **breathes**, and the relationship to windows/lamps **updates** as the angle changes (like real life, not a locked studio key).
- **Raw off-the-phone look:** The video must feel like **unedited footage straight from the iPhone camera**—**no** obvious color grade, **no** beauty retouch, **no** glossy “finished ad” polish, **no** fake HDR bloom; allow subtle authentic sensor noise, natural exposure micro-pumping, and compression realism—**as if there was zero post-production—only what the phone recorded in the moment.**`;

    const ugcCameraModeBlock = isUGC
      ? (ugcCameraMode === 'gimbal'
          ? `

**UGC CAMERA MODE: GIMBAL (MANDATORY):**
- Camera must be smooth and stabilized: **no shake, no jitter, no micro-bounce**.
- Movement style: slow tracking walk-and-talk following the creator from behind, then gradual arc/orbit to a front-facing angle.
- Camera glides fluidly at chest height, steady focus on subject.
- Lighting feel: natural and warm.
- Avoid handheld language in prompts unless user explicitly asks for it.`
          : `

**UGC CAMERA MODE: SELFIE (MANDATORY):**
- **ABSOLUTE PRIORITY:** The shot must ALWAYS feel handheld, as if the avatar is physically holding the phone while talking.
- Always include subtle continuous handheld motion: natural micro-shake, tiny jitter, grip corrections, slight breathing/walking wobble.
- The camera must never look locked-off, tripod-like, or gimbal-smooth in Selfie mode.
- If dialogue/speaking is present, reinforce that the avatar records themselves while speaking to camera (selfie-talk style).
- Keep movement hyperrealistic and organic, with authentic iPhone selfie capture feel.`) + ugcRawRealismBlock
      : '';

    const productLockBlock = lockProductFromFrame
      ? `

**PRODUCT LOCK — ABSOLUTE PRIORITY (USER ENABLED "PRODUCT"):**
The attached image is the **first frame** / reference frame that will be fed to the video (or image) model. The visible product (or branded item) must stay **identical in identity** across the video.
- **NO visual drift:** Do NOT morph, transform, rebrand, restyle, relabel, recolor, or redesign the product. Do NOT change logo, typography, packaging shape, proportions, or materials.
- **NO appearance dump in the prompt:** Do **not** list colors, materials, brand text, or product features. Refer to the product only with **"as seen in the attached image"** (verbatim in the video paragraph). The downstream model receives the pixels.
- **NON-NEGOTIABLE — EXACT PHRASE IN VIDEO PROMPT:** The **Video Animation Prompt** (the single paragraph for video) MUST contain the **verbatim substring** \`as seen in the attached image\` (not paraphrased). **Before you finish, verify that substring appears in that paragraph.**
- **Motion vs identity:** The product may move, rotate, or translate with **natural physics**, but it must **not** become a different product or variant. Background, camera, and lighting may change only if the user requested; **never** change the product identity.
- **If two keyframes are provided:** The **first frame** defines the product; the **last frame** must show the **same** product with only the end-state of the motion—no redesign or replacement between frames.`
      : '';

    const attachedImageOnlyReferenceBlock = `

**ATTACHED IMAGE — NO SCENE DESCRIPTION (MANDATORY FOR ALL OUTPUTS BELOW):**
- **Do NOT** describe what appears in the uploaded image(s): no people, clothing, room/location, product colors, branding, skin, hair, or background details.
- **Refer** to the frame(s) only as **"the attached image"**, or **"the first attached image"** / **"the second attached image"** when two images are provided.
- **Prioritize motion:** Describe **what moves**, **how**, **in what order**, direction, speed, weight/physics, interactions between elements, and camera motion (when allowed). Do **not** narrate the still as if the reader cannot see it.
- The video/image model **already receives** the attachment(s); your text must **not** re-paint or summarize its appearance.`;

    if (!productImage || !actionDescription) {
      return NextResponse.json(
        { error: 'Product image and action description are required' },
        { status: 400 }
      );
    }
    if (firstAndLastFrameAnimation && !lastFrameImage) {
      return NextResponse.json(
        { error: 'Last frame image is required for first-and-last-frame animation' },
        { status: 400 }
      );
    }

    console.log('Generating product video animation prompts...');
    console.log('Action description:', actionDescription);

    // Convert base64 to Buffer
    const productBuffer = Buffer.from(productImage.split(',')[1], 'base64');
    const productMime = productImage.split(';')[0].split(':')[1] || 'image/png';

    // Upload product image to Gemini Files
    console.log('Uploading product image to Gemini Files...');
    let productFile;
    try {
      const productUint8Array = new Uint8Array(productBuffer);
      const productBlob = new Blob([productUint8Array], { type: productMime });
      productFile = await ai.files.upload({
        file: productBlob,
        config: { mimeType: productMime }
      });
      console.log('Product image uploaded:', productFile.uri);
    } catch (uploadError: any) {
      console.error('Error uploading image:', uploadError);
      return NextResponse.json(
        { error: 'Error uploading image to Gemini', details: uploadError.message },
        { status: 500 }
      );
    }

    // Wait for file to be ACTIVE
    const maxWaitTime = 60000;
    const checkInterval = 2000;
    const startTime = Date.now();

    const waitForFile = async (file: any, fileName: string) => {
      if (file.state === 'ACTIVE') return file;
      
      while (file.state !== 'ACTIVE') {
        if (Date.now() - startTime > maxWaitTime) {
          throw new Error(`Timeout waiting for ${fileName} to be ready`);
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

    try {
      const productFileName = productFile.name || productFile.uri?.split('/').pop() || '';
      
      if (!productFileName) {
        return NextResponse.json(
          { error: 'Failed to get file identifier' },
          { status: 500 }
        );
      }
      
      productFile = await waitForFile(productFile, productFileName);
      
      if (!productFile.uri) {
        return NextResponse.json(
          { error: 'File is missing required URI property' },
          { status: 500 }
        );
      }
    } catch (waitError: any) {
      return NextResponse.json(
        { error: 'Error waiting for file to be ready', details: waitError.message },
        { status: 500 }
      );
    }

    // If nanoBananaOnly is true, generate only the Nano Banana prompt
    if (nanoBananaOnly) {
      const nanoBananaPromptRequestLines: string[] = [
        'You are an expert AI prompt engineer specializing in professional product video animations. You are creating a prompt for Nano Banana Pro to generate a reference image that will be used as the base for video animation.',
        '',
        '**Context:**',
        '- **Reference:** The user attached an image. **Do NOT** describe its contents (no colors, people, products, or room). Refer only to **"the attached image"** as the fidelity anchor.',
        `- User's Request for Animation: "${actionDescription}"` + (isUGC
          ? `

**UGC MODE:** The output image must match the **look and realism** of **the attached image** (UGC/iPhone-style) — **without** listing what you see. State only that the result must stay consistent with **the attached image** for style.${ugcCameraModeBlock}`
          : ''),
        '',
        attachedImageOnlyReferenceBlock.trim(),
        '',
        '**CRITICAL INSTRUCTION:**',
        'You MUST create a Nano Banana prompt that generates the **starting frame** that best supports the **motion** the user asked for. Describe **framing, staging, and motion-relevant composition goals** only — **not** a verbal description of the attached pixels.',
        '',
        '**Your Task:**',
        'Generate a Nano Banana Pro prompt that:',
        `1. **Optimizes for the animation**: Explain how the frame should be staged so the animation "${actionDescription}" can happen (starting pose, space for movement, camera-friendly layout) — refer to **"the attached image"** for subject/product identity, not a written inventory.`,
        '- If rotation: state that the composition must allow rotation from the attached reference, without describing the object’s colors.',
        '- If movement/fall: state starting positions and clearance needed, without describing surfaces or decor.',
        '- If close-ups: state scale/framing intent only.',
        '',
        '2. **Fidelity:** Say that the generated frame must **match the attached image** in identity and style — **do not** transcribe appearance into words.',
        '',
        '3. **Lighting/camera (functional only):** Only what is needed for the requested motion (e.g. direction of key light for the move) — **no** scenic prose.',
        '',
        '4. **Frame optimization:** The starting frame must enable the movement sequence; focus instructions on **motion affordance**, not appearance.'
      ];

      const nanoBananaPromptRequest = nanoBananaPromptRequestLines.join('\n') + productLockBlock;

      try {
        const result = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    fileUri: productFile.uri,
                    mimeType: productFile.mimeType
                  }
                },
                {
                  text: nanoBananaPromptRequest
                }
              ]
            }
          ]
        });

        let nanoBananaPrompt = '';
        if (result.candidates && result.candidates[0]?.content?.parts) {
          const responseText = result.candidates[0].content.parts
            .map((part: any) => part.text || '')
            .join('')
            .trim();

          // Extract Nano Banana prompt
          const nanoBananaMatch = responseText.match(/\*\*NANO_BANANA_PROMPT:\*\*\s*([\s\S]*?)$/i);
          if (nanoBananaMatch) {
            nanoBananaPrompt = nanoBananaMatch[1].trim();
          } else {
            // Fallback: use the whole response
            nanoBananaPrompt = responseText;
          }
        }

        if (!nanoBananaPrompt) {
          return NextResponse.json(
            { error: 'Failed to generate Nano Banana prompt' },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          nanoBananaPrompt: nanoBananaPrompt
        });
      } catch (error: any) {
        console.error('Error generating Nano Banana prompt:', error);
        return NextResponse.json(
          { error: 'Error generating Nano Banana prompt', details: error.message },
          { status: 500 }
        );
      }
    }

    // Last-frame mode: first frame image is provided; generate Nano Banana prompt for the END/LAST frame of the animation (consistent with first frame)
    if (lastFrameNanoBananaOnly) {
      const lastFramePromptRequest = `You are an expert AI prompt engineer for Nano Banana Pro. The user has provided **the first attached image** (first frame) and this animation description: "${actionDescription}"${isUGC ? `

**UGC MODE:** The last frame must stay consistent with **the first attached image** for UGC/iPhone-style realism — **without** describing what the first image looks like.${ugcCameraModeBlock}` : ''}${productLockBlock}${attachedImageOnlyReferenceBlock}

**Your task:**
Create a Nano Banana Pro prompt for the **LAST/END FRAME** only.
- **Do NOT** describe **the first attached image** (no people, products, colors, or rooms).
- Refer to it only as **"the first attached image"** / **"the attached image"** for consistency.
- Describe the **end state after motion**: final poses, object placements, and spatial relationships that complete "${actionDescription}" — **functional layout only**, not visual appearance adjectives.
- **Do NOT** describe the motion path frame-by-frame; only the **final still** as needed for Nano Banana, in terms of **what settled where** (e.g. product resting on surface, hand lowered), not hair/skin/product color.

The prompt must be one block of text ready for Nano Banana Pro, with **no** scene description of the uploaded pixels.`;

      try {
        const result = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                { fileData: { fileUri: productFile.uri, mimeType: productFile.mimeType } },
                { text: lastFramePromptRequest }
              ]
            }
          ]
        });

        let nanoBananaPrompt = '';
        if (result.candidates && result.candidates[0]?.content?.parts) {
          const responseText = result.candidates[0].content.parts
            .map((part: any) => part.text || '')
            .join('')
            .trim();
          const match = responseText.match(/\*\*NANO_BANANA_PROMPT:\*\*\s*([\s\S]*?)$/i);
          nanoBananaPrompt = match ? match[1].trim() : responseText;
        }
        if (!nanoBananaPrompt) {
          return NextResponse.json(
            { error: 'Failed to generate last frame Nano Banana prompt' },
            { status: 500 }
          );
        }
        return NextResponse.json({
          success: true,
          nanoBananaPrompt: nanoBananaPrompt
        });
      } catch (error: any) {
        console.error('Error generating last frame Nano Banana prompt:', error);
        return NextResponse.json(
          { error: 'Error generating last frame prompt', details: error.message },
          { status: 500 }
        );
      }
    }

    // First + last frame animation: both images provided; generate only the video animation prompt from first to last frame
    if (firstAndLastFrameAnimation && lastFrameImage) {
      const lastFrameBuffer = Buffer.from(lastFrameImage.split(',')[1], 'base64');
      const lastFrameMime = lastFrameImage.split(';')[0].split(':')[1] || 'image/png';
      let lastFrameFile;
      try {
        const lastFrameUint8 = new Uint8Array(lastFrameBuffer);
        const lastFrameBlob = new Blob([lastFrameUint8], { type: lastFrameMime });
        lastFrameFile = await ai.files.upload({
          file: lastFrameBlob,
          config: { mimeType: lastFrameMime }
        });
        console.log('Last frame image uploaded:', lastFrameFile.uri);
      } catch (uploadError: any) {
        console.error('Error uploading last frame image:', uploadError);
        return NextResponse.json(
          { error: 'Error uploading last frame image', details: uploadError.message },
          { status: 500 }
        );
      }
      const lastFrameFileName = lastFrameFile.name || lastFrameFile.uri?.split('/').pop() || '';
      if (lastFrameFileName) {
        try {
          lastFrameFile = await waitForFile(lastFrameFile, lastFrameFileName);
        } catch (waitError: any) {
          return NextResponse.json(
            { error: 'Error waiting for last frame file', details: waitError.message },
            { status: 500 }
          );
        }
      }

      const firstLastUgcBlock = isUGC
        ? ugcCameraMode === 'gimbal'
          ? `

**CRITICAL - UGC (GIMBAL — MOTION ONLY):**
- **Do NOT** describe **the first attached image** or **the second attached image** visually.
- **Gimbal:** Describe **smooth** orbit/tracking/walk-and-talk—**no** handheld shake unless the user asks.
- Subject/product **motion** must be natural; **no** scene or lighting prose.${ugcCameraModeBlock}`
          : `

**CRITICAL - UGC (SELFIE — MOTION ONLY):**
- **Do NOT** describe either attached image visually.
- **Handheld** as **camera motion** only (micro-shake, organic) when relevant—**not** a description of the frame.
- **No cinematic moves** unless the user asked.${ugcCameraModeBlock}`
        : '';

      const firstLastAnimationRequest = `You are an expert AI prompt engineer for video animation. The user attached **two** images: **the first attached image** = START frame; **the second attached image** = END frame.

${attachedImageOnlyReferenceBlock.trim()}

Animation description: "${actionDescription}"${scriptTrimmed ? `

**CRITICAL - SCRIPT (100% INCLUDED, WHERE USER INDICATES):** User script: "${scriptTrimmed.replace(/"/g, '\\"')}". Include this exact text in the prompt at the moment/place the user's description indicates. Do NOT add "a character says" or similar – integrate the script where the user said it goes.` : ''}${firstLastUgcBlock}${productLockBlock}

**Your task:**
Generate **ONE** video animation prompt: **only motion** from **the first attached image** to **the second attached image**.
- **Do NOT** describe what either image looks like; **do NOT** mention colors, faces, clothing, rooms, or products.
- **Do** describe: trajectory, speed, easing, body/hand/product motion, camera motion (if allowed), timing, and how each element transitions until it matches **the second attached image**.
- Match the user's intent: "${actionDescription}"
- **MUST be EXACTLY ONE continuous paragraph**, UNDER 999 characters
- No text overlays, captions, or on-screen text
- Be precise about **movement**, timing, and cinematography${scriptTrimmed ? '\n- Include the script text where the user\'s description indicates; never add "a character says"' : ''}

**Output Format:**
Respond with exactly one section labeled VIDEO_ANIMATION_PROMPT, containing one paragraph under 999 characters.${scriptTrimmed ? ' Include the script where the user indicated; do not add "a character says".' : ''}`;

      try {
        const result = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                { fileData: { fileUri: productFile.uri, mimeType: productFile.mimeType } },
                { fileData: { fileUri: lastFrameFile.uri, mimeType: lastFrameFile.mimeType } },
                { text: firstLastAnimationRequest }
              ]
            }
          ]
        });

        let videoPrompt = '';
        if (result.candidates && result.candidates[0]?.content?.parts) {
          const responseText = result.candidates[0].content.parts
            .map((part: any) => part.text || '')
            .join('')
            .trim();
          const match = responseText.match(/\*\*VIDEO_ANIMATION_PROMPT:\*\*\s*([\s\S]*?)$/i);
          videoPrompt = match ? match[1].trim() : responseText;
        }
        if (!videoPrompt) {
          return NextResponse.json(
            { error: 'Failed to generate first-to-last animation prompt' },
            { status: 500 }
          );
        }
        videoPrompt = videoPrompt.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
        if (videoPrompt.length > 999) {
          videoPrompt = videoPrompt.substring(0, 996).trim();
          const lastSpace = videoPrompt.lastIndexOf(' ');
          if (lastSpace > 0) videoPrompt = videoPrompt.substring(0, lastSpace).trim();
        }
        videoPrompt = ensureProductLockInVideoPrompt(videoPrompt, lockProductFromFrame);
        await recordGeneration(request);
        return NextResponse.json({
          success: true,
          videoPrompt: videoPrompt
        });
      } catch (error: any) {
        console.error('Error generating first-to-last animation prompt:', error);
        return NextResponse.json(
          { error: 'Error generating animation prompt', details: error.message },
          { status: 500 }
        );
      }
    }

    // If animateOnly is true, generate only the video animation prompt based on the uploaded image
    if (animateOnly) {
      const ugcInstructions = isUGC
        ? ugcCameraMode === 'gimbal'
          ? `\n\n**CRITICAL - UGC ANIMATION (GIMBAL MODE — MOTION ONLY):**
- Refer to the frame only as **"the attached image"**. **Do NOT** describe its contents.
- **GIMBAL (MANDATORY):** Follow **UGC CAMERA MODE: GIMBAL**—smooth stabilized orbit/tracking, **no** handheld shake, **no** jitter.
- Describe **camera motion** (orbit, tracking, walk-and-talk) and **subject/product motion** in concrete terms—speed, path, timing.
- **Do NOT** list lighting, skin, hair, colors, or room details.${ugcCameraModeBlock}`
          : `\n\n**CRITICAL - UGC ANIMATION (SELFIE / HANDHELD — MOTION ONLY):**
- Refer to the frame only as **"the attached image"**. **Do NOT** describe its contents.
- **SELFIE:** Handheld micro-shake, organic phone-recording feel **only as motion vocabulary**—not a description of the picture.
- **Camera:** Static unless the user asked for camera moves; if they asked, name the move (zoom, pan) **without** describing the scene.
- **Subject motion:** Face, hands, body, product—what moves, how, in what order.
- **Do NOT** preserve/explain lighting, textures, or colors in words—the model has **the attached image**.${ugcCameraModeBlock}`
        : '';

      const animationPromptRequest = `You are an expert AI prompt engineer specializing in professional product video animations. You are creating a **video animation prompt** for a model that will receive **the attached image**.

${attachedImageOnlyReferenceBlock.trim()}

**Context:**
- **The attached image** will be fed to the video model — **never** describe what it shows.
- User's request (motion intent): "${actionDescription}" — the animation MUST follow this.${ugcInstructions}${productLockBlock}

**CRITICAL INSTRUCTION:**
1. Infer **what must move** from the user's text and **describe only motion** (elements, order, direction, speed, physics, interaction).
2. Add cinematography **as motion** (camera path, stabilization vs handheld) — **not** as scene description.
3. ${isUGC ? (ugcCameraMode === 'gimbal' ? '**GIMBAL:** smooth stabilized camera; **never** handheld shake.' : '**SELFIE:** handheld feel only if user-appropriate; **no** camera moves unless user requested.') : 'Add camera moves only if they serve the user’s request.'}
4. Keep pacing/cuts the user asked for.
5. **Do not** add actions the user did not request.${isUGC ? (ugcCameraMode === 'gimbal' ? '\n6. **GIMBAL:** no jitter/shake wording.' : '\n6. **SELFIE:** no extra camera moves unless user asked.') : ''}

**Your Task — VIDEO ANIMATION PROMPT:**

**CRITICAL - REFERENCE ONLY BY NAME:**
- Say the animation is based on **"the attached image"** (required phrasing). **Do NOT** describe people, products, rooms, or colors.
- Describe **how** each relevant element moves over time (and the camera, if allowed).${lockProductFromFrame ? '\n- **PRODUCT LOCK:** Include the exact phrase **as seen in the attached image** (verbatim). **Do NOT** add a separate product description.' : ''}

**Video Animation Prompt Requirements:**
- **MUST be EXACTLY ONE continuous paragraph** (no line breaks, no bullet points)
- **MUST be UNDER 999 characters**
- **FAITHFULLY FOLLOW** the user's request: "${actionDescription}"
- **MOTION-FIRST:** Trajectory, timing, weight, gestures, product handling, parallax—**not** appearance.
- **RESPECT** pacing/cuts/rotation speed as the user described.
- **CRITICAL PROHIBITION - NO TEXT OVERLAY**: No on-screen text, captions, or subtitles. Spoken script from the user is OK to quote as speech only.${isUGC ? (ugcCameraMode === 'gimbal' ? '\n- **GIMBAL:** describe smooth gimbal paths; never "shaky iPhone" unless user asked.' : '\n- **SELFIE:** camera static unless user asked for camera movement.') : ''}${scriptTrimmed ? `

**CRITICAL - SCRIPT (100% INCLUDED, WHERE USER INDICATES):** Script: "${scriptTrimmed.replace(/"/g, '\\"')}". Place this exact text where the user's description indicates. No "a character says".` : ''}

**Output Format:**
**VIDEO_ANIMATION_PROMPT:**
One paragraph, UNDER 999 characters. Reference **the attached image** by name only; describe **movements**.${scriptTrimmed ? ' Include script placement as above.' : ''}`;

      try {
        const result = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    fileUri: productFile.uri,
                    mimeType: productFile.mimeType
                  }
                },
                {
                  text: animationPromptRequest
                }
              ]
            }
          ]
        });

        let videoPrompt = '';
        if (result.candidates && result.candidates[0]?.content?.parts) {
          const responseText = result.candidates[0].content.parts
            .map((part: any) => part.text || '')
            .join('')
            .trim();

          // Extract video animation prompt
          const videoPromptMatch = responseText.match(/\*\*VIDEO_ANIMATION_PROMPT:\*\*\s*([\s\S]*?)$/i);
          if (videoPromptMatch) {
            videoPrompt = videoPromptMatch[1].trim();
          } else {
            // Fallback: use the whole response
            videoPrompt = responseText;
          }
        }

        if (!videoPrompt) {
          return NextResponse.json(
            { error: 'Failed to generate animation prompt' },
            { status: 500 }
          );
        }
        let normalizedVideo = videoPrompt.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
        if (normalizedVideo.length > 999) {
          normalizedVideo = normalizedVideo.substring(0, 996).trim();
          const ls = normalizedVideo.lastIndexOf(' ');
          if (ls > 0) normalizedVideo = normalizedVideo.substring(0, ls).trim();
        }
        normalizedVideo = ensureProductLockInVideoPrompt(normalizedVideo, lockProductFromFrame);
        // Record generation after successful completion
        await recordGeneration(request);

        return NextResponse.json({
          success: true,
          videoPrompt: normalizedVideo
        });
      } catch (error: any) {
        console.error('Error generating animation prompt:', error);
        return NextResponse.json(
          { error: 'Error generating animation prompt', details: error.message },
          { status: 500 }
        );
      }
    }

    // Generate both prompts in a single call (original behavior)
    const promptGenerationRequest = `You are an expert AI prompt engineer specializing in professional product video animations. You are creating prompts for animating a product video.

${attachedImageOnlyReferenceBlock.trim()}

**Context:**
- **The attached image** is provided — **do not** describe it. User's Request: "${actionDescription}"${isUGC ? `

**UGC MODE (USER ENABLED):** ${ugcCameraMode === 'gimbal' ? '**Video: GIMBAL** — smooth stabilized orbit/tracking, **no** handheld shake unless user asks. ' : '**Video: SELFIE/HANDHELD** — natural handheld micro-shake only as **motion**, not scene description. '}One mode only.${ugcCameraModeBlock}` : ''}${productLockBlock}

**CRITICAL INSTRUCTION:**
1. **Do NOT** describe the uploaded image in either output.
2. Enhance the user's request with **motion** and **executable cinematography** (camera path, timing, physics)${isUGC ? (ugcCameraMode === 'gimbal' ? ' — **GIMBAL** vocabulary only for camera.' : ' — **SELFIE** handheld vocabulary only when relevant.') : ''}
3. Keep core action, pacing, and style.
4. Do not add actions the user did not request.

**Your Task:**
Generate TWO prompts:

1. **Nano Banana Pro Prompt**: A prompt to generate a **starting reference frame** for the requested animation.
   - **Do NOT** transcribe **the attached image** (no colors, people, product names, or room).
   - Refer only to **"the attached image"** as the identity/style anchor.
   - Describe **staging and motion affordance** (space for rotation, starting pose, framing goals) so the still supports "${actionDescription}".
   - ${isUGC ? 'State UGC/iPhone consistency with **the attached image** in one line — **no** visual inventory.' : 'Functional composition only.'}

2. **Video Animation Prompt**: **Motion-only** paragraph (UNDER 999 characters).
${lockProductFromFrame ? `   - **PRODUCT LOCK:** MUST include verbatim \`as seen in the attached image\`. **Do NOT** describe the product beyond that phrase.
` : ''}   - **MUST be EXACTLY ONE continuous paragraph**
   - **FAITHFULLY FOLLOW** "${actionDescription}"
   - Describe **movements**: subject, product, hands, camera (if allowed), order, speed, physics${isUGC ? (ugcCameraMode === 'gimbal' ? ' — **gimbal-smooth** camera, **no** shaky handheld unless user asked' : ' — handheld only as motion, static camera unless user asked') : ''}
   - **NO** scene description, **NO** colors, **NO** lighting prose — the model has **the attached image**
   - **NO TEXT OVERLAY** (spoken user script OK as quoted speech only)${isUGC ? (ugcCameraMode === 'gimbal' ? '\n   - **GIMBAL:** never contradict with selfie shake.' : '\n   - **SELFIE:** handheld feel without describing the frame.') : ''}${scriptTrimmed ? `
   - **SCRIPT:** "${scriptTrimmed.replace(/"/g, '\\"')}" — place exact text where the user’s description indicates.` : ''}

**Critical Requirements:**
- Both outputs: **no** narration of **the attached image** pixels.
- Video prompt: **motion-first**, reference **"the attached image"** by name only.${isUGC ? (ugcCameraMode === 'gimbal' ? ' Gimbal = smooth only.' : ' Selfie = handheld motion words only.') : ''}
- Ready to paste into tools.

${lockProductFromFrame ? `**OUTPUT FORMAT (MANDATORY — PRODUCT LOCK ON):**
You MUST respond with **exactly** these two labeled sections (so the client can parse them):

**NANO_BANANA_PROMPT:**
(Motion/staging only; refer to **the attached image** — **no** visual inventory)

**VIDEO_ANIMATION_PROMPT:**
EXACTLY ONE paragraph, UNDER 999 characters. It MUST include the verbatim phrase **as seen in the attached image** (product identity anchor only — **no** extra product description). If that phrase is missing, your answer is **wrong**—rewrite.

**FAILURE:** Omitting **as seen in the attached image** from the VIDEO paragraph is invalid.` : `**Output Format (implicit):**
The model should internally produce two sections in its text response:
- One describing the Nano Banana reference image prompt.
- One describing the Video Animation prompt (single paragraph, under 999 characters).
You do NOT need to wrap them in any special markers; a plain text response is enough.`}`;

    try {
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  fileUri: productFile.uri,
                  mimeType: productFile.mimeType
                }
              },
              {
                text: promptGenerationRequest
              }
            ]
          }
        ]
      });

      let responseText = '';
      if (result.candidates && result.candidates[0]?.content?.parts) {
        responseText = result.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('');
      }

      console.log('Response received, length:', responseText.length);

      // Parse the response to extract both prompts when markers are present.
      // If markers are missing (model returns plain text), fall back to using the full response
      // so the user still receives a usable prompt instead of a hard failure.
      const nanoBananaMatch = responseText.match(/\*\*NANO_BANANA_PROMPT:\*\*\s*([\s\S]*?)(?=\*\*VIDEO_ANIMATION_PROMPT:\*\*|$)/i);
      const videoPromptMatch = responseText.match(/\*\*VIDEO_ANIMATION_PROMPT:\*\*\s*([\s\S]*?)$/i);

      let nanoBananaPrompt = nanoBananaMatch ? nanoBananaMatch[1].trim() : responseText.trim();
      let videoPrompt = videoPromptMatch ? videoPromptMatch[1].trim() : responseText.trim();
      
      // Ensure video prompt is a single paragraph and under 999 characters
      if (videoPrompt) {
        // Remove any line breaks to make it a single paragraph
        videoPrompt = videoPrompt.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
        
        // If over 999 characters, we need to optimize it
        if (videoPrompt.length > 999) {
          console.log(`Video prompt is ${videoPrompt.length} characters, needs to be under 999. Optimizing...`);
          
          // Try to optimize by removing redundant words while keeping essential details
          // First, try to regenerate with stricter constraints
          try {
            const optimizationPrompt = `Optimize this video animation prompt to be UNDER 999 characters while maintaining ALL essential details and precision. Make it ONE continuous paragraph with maximum information density.

**Current Prompt (${videoPrompt.length} characters):**
${videoPrompt}

**Requirements:**
- Must be EXACTLY ONE paragraph (no line breaks)
- Must be UNDER 999 characters (strictly enforced)
- Maintain ALL essential technical details (camera movements, lighting, physics, cinematography)
- Keep the core action and pacing from the original
- Use dense, efficient language
- Every word must count${lockProductFromFrame ? `
- **PRODUCT LOCK:** The output MUST still contain the exact phrase "as seen in the attached image" (verbatim). Do not remove or paraphrase it. If missing, weave it in **without** adding product appearance details.` : ''}
- **NO SCENE DESCRIPTION:** Do not add colors, faces, rooms, or object appearance—motion and camera behavior only; reference **"the attached image"** by name.

**Output:**
Provide ONLY the optimized prompt as a single continuous paragraph, under 999 characters.`;

            const optimizationResult = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: optimizationPrompt
                    }
                  ]
                }
              ]
            });

            let optimizedText = '';
            if (optimizationResult.candidates && optimizationResult.candidates[0]?.content?.parts) {
              optimizedText = optimizationResult.candidates[0].content.parts
                .map((part: any) => part.text || '')
                .join('');
            }
            
            if (optimizedText) {
              optimizedText = optimizedText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
              
              // If still over 999, truncate intelligently
              if (optimizedText.length <= 999) {
                videoPrompt = optimizedText;
                console.log(`Optimized prompt to ${videoPrompt.length} characters`);
              } else {
                console.warn(`Optimized prompt still ${optimizedText.length} characters, truncating...`);
                // Truncate at word boundary
                videoPrompt = optimizedText.substring(0, 996).trim();
                const lastSpace = videoPrompt.lastIndexOf(' ');
                if (lastSpace > 0) {
                  videoPrompt = videoPrompt.substring(0, lastSpace).trim();
                }
                console.log(`Truncated prompt to ${videoPrompt.length} characters`);
              }
            }
          } catch (optError) {
            console.error('Error optimizing prompt, truncating:', optError);
            // Fallback: truncate at word boundary
            videoPrompt = videoPrompt.substring(0, 996).trim();
            const lastSpace = videoPrompt.lastIndexOf(' ');
            if (lastSpace > 0) {
              videoPrompt = videoPrompt.substring(0, lastSpace).trim();
            }
          }
        }

        videoPrompt = ensureProductLockInVideoPrompt(videoPrompt, lockProductFromFrame);
        
        console.log(`Final video prompt length: ${videoPrompt.length} characters`);
      }

      // Calculate costs (server-side only, not sent to frontend)
      let costInfo = null;
      try {
        const usageMetadata = (result as any).usageMetadata;
        if (usageMetadata) {
          const promptTokenCount = usageMetadata.promptTokenCount || 0;
          const candidatesTokenCount = usageMetadata.candidatesTokenCount || 0;
          const totalTokenCount = usageMetadata.totalTokenCount || (promptTokenCount + candidatesTokenCount);

          // Gemini 3 Flash Preview pricing: Input $0.50/M tokens, Output $3/M tokens
          const inputCostPerMillion = 0.5;
          const outputCostPerMillion = 3.0;

          const inputCost = (promptTokenCount / 1_000_000) * inputCostPerMillion;
          const outputCost = (candidatesTokenCount / 1_000_000) * outputCostPerMillion;
          const totalCost = inputCost + outputCost;

          costInfo = {
            inputCost,
            outputCost,
            totalCost,
            promptTokenCount,
            candidatesTokenCount,
            totalTokenCount
          };

          console.log('\n=== PRODUCT VIDEO PROMPT GENERATION COST ===');
          console.log(`Input tokens: ${promptTokenCount.toLocaleString()}, Cost: $${inputCost.toFixed(6)}`);
          console.log(`Output tokens: ${candidatesTokenCount.toLocaleString()}, Cost: $${outputCost.toFixed(6)}`);
          console.log(`Total tokens: ${totalTokenCount.toLocaleString()}, Total cost: $${totalCost.toFixed(6)}`);
        }
      } catch (costError) {
        console.error('Error calculating costs:', costError);
      }

      console.log('\n=== Prompts generated successfully ===');

      // Credit already consumed in verifyAndConsumeCredit

      return NextResponse.json({
        success: true,
        nanoBananaPrompt: nanoBananaPrompt,
        videoPrompt: videoPrompt
      });

    } catch (generationError: any) {
      console.error('Error generating prompts:', generationError);
      return NextResponse.json(
        {
          error: 'Error generating prompts',
          details: generationError.message || 'Unknown error'
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error in product video generation:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
