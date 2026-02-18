import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getGoogleGenAI } from '@/lib/gemini';
import { verifyAndConsumeCredit } from '@/lib/credit-check';

export const maxDuration = 60; // 60 seconds for Vercel Pro plan

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

    // Check and consume user credit
    const creditError = await verifyAndConsumeCredit(request);
    if (creditError) {
      return creditError;
    }

    // Initialize AI client at runtime (uses user's API key if configured)
    const ai = await getGoogleGenAI(request);
    
    const body = await request.json();
    const { actionText, script, compositions, composition, cameraAngles, lighting, duration, mainStyle, productFocus, allScenes, currentSceneIndex, productImage, referenceImage, copyLighting, copyCameraAngle, noDialogue, lipSync, voiceover, continuousAction, scriptAdaptation, productPhotoWillBeAttached } = body;

    // Support both old format (single composition) and new format (array of compositions)
    const compositionArray = compositions || (composition ? [composition] : []);
    
    // Support camera angles (array)
    const cameraAnglesArray = cameraAngles && Array.isArray(cameraAngles) ? cameraAngles : [];

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

    // Handle reference image upload if provided
    let referenceImageFile = null;
    if (referenceImage) {
      try {
        console.log('Uploading reference image to Gemini Files...');
        const referenceBuffer = Buffer.from(referenceImage.split(',')[1], 'base64');
        let referenceMime = referenceImage.split(';')[0].split(':')[1] || 'image/png';
        
        // Convert unsupported formats to PNG
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

    if (!actionText || !compositionArray || compositionArray.length === 0 || !lighting) {
      return NextResponse.json(
        { error: 'Action text, at least one composition, and lighting are required' },
        { status: 400 }
      );
    }

    // Extract person and location from first scene if available
    // For scenes 4+, use more concise consistency rules to save tokens
    let consistencyRules = '';
    if (allScenes && Array.isArray(allScenes) && allScenes.length > 0 && currentSceneIndex !== undefined) {
      const firstScene = allScenes[0];
      if (firstScene && firstScene.action) {
        const isScene4Plus = currentSceneIndex >= 3; // Scene 4, 5, etc. (0-indexed)
        
        if (isScene4Plus) {
          // Concise version for scenes 4+ to save tokens
          const firstActionPreview = firstScene.action.length > 100 
            ? firstScene.action.substring(0, 100) + '...' 
            : firstScene.action;
          consistencyRules = `\n\n**CONSISTENCY (Scene ${currentSceneIndex + 1}/${allScenes.length}):**
- Same person as Scene 1 (appearance, age, gender, clothing)
- Same location as Scene 1 unless action text specifies different
- First scene context: "${firstActionPreview}"
- Maintain consistency unless action text explicitly overrides`;
        } else {
          // Full version for scenes 1-3
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
    }

    // Crear prompt para Gemini que mejore el texto con los parámetros de cámara e iluminación
    const compositionsList = compositionArray.length === 1 
      ? compositionArray[0]
      : compositionArray.join(', ');
    
    // Define actionTextLower once for use throughout the function
    const actionTextLower = (actionText || '').toLowerCase();
    
    // Detect if action text mentions "product" or similar terms (define early for use in camera angle instructions)
    const mentionsProduct = actionTextLower.includes('product') || 
                           actionTextLower.includes('el producto') || 
                           actionTextLower.includes('producto') ||
                           actionTextLower.includes('the product');
    
    // Detect specifically if there's walking (for continuous movement emphasis)
    const hasWalking = /\b(walking|walk|caminando|caminar|walking around|walking while|walking through|walking in|walking to)\b/i.test(actionText);
    
    // Detect multiple actions/phases in action text
    const hasMultipleActions = actionTextLower.includes(' and then ') || 
                              actionTextLower.includes(' then ') ||
                              actionTextLower.includes(' other scene') ||
                              actionTextLower.includes(' another scene') ||
                              actionTextLower.includes(' first ') && actionTextLower.includes(' second ') ||
                              actionTextLower.includes(' primero ') && actionTextLower.includes(' segundo ');
    
    const compositionInstructions = compositionArray.length > 1
      ? `\n\n**CRITICAL COMPOSITION DISTRIBUTION TASK:**
You have been provided with MULTIPLE camera compositions that should be intelligently distributed throughout the action described. Your task is to analyze the action text and determine WHEN and WHERE each composition should be applied based on the logical flow of the action.

Available compositions:
${compositionArray.map((comp: string, idx: number) => `${idx + 1}. ${comp}`).join('\n')}

**Your job:** Read the action text carefully and identify different moments or phases within the same scene. Then, assign the most appropriate composition to each moment. For example:
- If the action is "person grabs the product and then consumes it", you might use "Everyday Life" for the grabbing moment and "Product in Real Use" for the consumption moment.
- If the action has multiple phases or transitions, distribute the compositions logically across those phases.
${hasMultipleActions ? '\n**CRITICAL - MULTIPLE ACTIONS DETECTED:**\nThe action text contains multiple distinct actions or scenes (e.g., "and then", "other scene"). You MUST use ALL selected compositions and distribute them across ALL actions. Do NOT skip any action. Each action should get at least one composition assigned to it.' : ''}

**Important:** 
- You must seamlessly transition between compositions within the same continuous scene
- The distribution should feel natural and logical based on the action described
- Incorporate the composition details at the appropriate moments in your enhanced prompt
- Make it clear which composition applies to which part of the action through your descriptive language
${hasMultipleActions ? '- **MANDATORY**: Use ALL selected compositions and ensure ALL actions mentioned in the action text are included in your prompt' : ''}`
      : '';

    // Camera Angle instructions
    const cameraAngleInstructions = cameraAnglesArray.length > 0
      ? (() => {
          // Check if action text contains "POV" - if so, MUST use Frontal Camera
          const hasPOV = actionTextLower.includes('pov') || actionTextLower.includes('point of view');
          
          // If POV is mentioned, prioritize Frontal Camera
          let effectiveCameraAngles = cameraAnglesArray;
          if (hasPOV && !cameraAnglesArray.includes('Frontal Camera')) {
            effectiveCameraAngles = ['Frontal Camera', ...cameraAnglesArray];
          } else if (hasPOV && cameraAnglesArray.includes('Frontal Camera')) {
            effectiveCameraAngles = ['Frontal Camera', ...cameraAnglesArray.filter(a => a !== 'Frontal Camera')];
          }
          
          const uniqueAngles = [...new Set(effectiveCameraAngles)];
          
          if (uniqueAngles.length === 1) {
            // Single camera angle selected
            const angle = uniqueAngles[0];
            if (angle === 'Selfie Camera') {
              // Detect if there's movement in the action
              const hasMovement = /\b(running|walking|moving|jumping|dancing|exercising|working out|active|movement|motion|action|gesture|moving around|walking around|running around|moving while|walking while|running while|in motion|on the move|actively|dynamic|energetic)\b/i.test(actionText);
              
              // Detect specifically if there's walking
              const hasWalking = /\b(walking|walk|caminando|caminar|walking around|walking while|walking through|walking in|walking to)\b/i.test(actionText);
              
              return `\n\n**CRITICAL - CAMERA ANGLE: SELFIE CAMERA (MANDATORY):**
The video MUST be recorded as if the character is holding the phone/camera themselves while recording (selfie-style). This means:
- The character is actively holding the phone and recording themselves while performing the actions
- The camera angle should be as if the character is holding their phone in front of them, showing themselves${mentionsProduct ? ' and the product' : ''}/actions
- Natural handheld camera movements: slight shake, imperfect zoom, quick pan - all authentic to iPhone selfie recording
- The character is actively engaging with the camera, speaking to it, demonstrating, and showing things directly to the viewer
- The video should feel like authentic selfie-style content where the creator is both the performer and the videographer
${hasWalking ? `- **CRITICAL - CONTINUOUS WALKING (MANDATORY)**: Since the action text mentions "walking" or "caminando", the character MUST walk CONTINUOUSLY and NOTABLY throughout the scene. The character should NOT stop walking, pause, or become static. The walking must be:
  * **Continuous movement**: The character walks steadily and continuously, not just a few steps then stopping
  * **Notable and visible**: The walking is clearly visible and noticeable - the character's body moves forward, legs move in walking motion, background changes as they move
  * **Natural walking pace**: The character walks at a natural, steady pace while speaking or performing actions
  * **No static moments**: The character does NOT stop walking to speak or perform actions - they continue walking while doing everything
  * **Background movement**: As the character walks, the background/environment should show movement and change, indicating continuous forward motion
  * **MANDATORY**: The prompt must explicitly describe continuous, notable walking throughout the entire scene - the character is walking while speaking, walking while demonstrating, walking while interacting with the camera. The walking is a continuous, prominent action, not a brief moment.` : ''}
${hasMovement ? `- **CRITICAL - ENHANCED SHAKY CAMERA DUE TO MOVEMENT**: Since the action involves character movement, action, or scene motion (e.g., running, walking, active movements, gestures, dynamic actions), the camera shake MUST be MORE PRONOUNCED and REALISTIC. The camera should shake more noticeably as if the person is genuinely holding the phone with their hand while moving - this is CRITICAL for authenticity. The shake should feel like real handheld recording during movement: natural hand tremors, body movement affecting camera stability, slight rotation and tilt as the person moves, all while maintaining the character${mentionsProduct ? ' and product' : ''} in frame. This enhanced shake makes it look 100% real, as if someone is actually holding their phone while walking, running, or moving around. The shake should be authentic and natural - more pronounced than static shots, but not so extreme that it becomes distracting. The content must remain clear and hyperrealistic despite the enhanced shake.` : `- **HYPERREALISM WITH SHAKY CAMERA**: The camera must be hyperrealistic but with natural shaky movements typical of handheld selfie recording. The shake should be subtle but noticeable, authentic to someone holding their phone while recording. The shake should feel authentic and natural, not excessive or distracting.`}
- **NATURAL SELFIE CAMERA MOVEMENTS (AUTHENTICITY)**: The character can naturally adjust the camera position while recording to create more authentic, dynamic selfie footage. This includes:
  * **Natural camera adjustments**: The character may subtly adjust the camera angle, tilt it slightly up or down, move it closer or further away, or change the framing naturally as they speak or demonstrate
  * **Dynamic camera positioning**: The camera position can change organically - for example, raising it slightly higher to show more of the environment, lowering it to focus on something, or adjusting the angle to better frame the action
  * **Authentic selfie behavior**: These camera movements should feel completely natural and unscripted, as if the person is genuinely adjusting their phone while recording themselves
  * **Not excessive**: Camera movements should be subtle and natural, not dramatic or distracting - they should enhance authenticity without being the focus
- **CRITICAL**: Even with shaky camera and natural camera adjustments, all content must be clear, sharp, and hyperrealistic. The movements should enhance authenticity without compromising visual clarity.`;
            } else if (angle === 'Frontal Camera') {
              return `\n\n**CRITICAL - CAMERA ANGLE: FRONTAL CAMERA / POV (MANDATORY):**
The video MUST be recorded as a POV (Point of View) perspective - the character is NOT visible in the frame, only their perspective from behind the camera. This means:
- **ABSOLUTE POV PERSPECTIVE**: The character is holding the phone and recording, but they are NOT visible in the video. The viewer sees ONLY what the character sees, as if looking through their eyes/phone camera
- The camera angle is as if the character is holding their phone in front of them, using the rear camera, but the character themselves is completely out of frame - only their hands, the product, and what they're looking at are visible
- This is a true first-person POV where the character is the "camera operator" but never appears in the shot
- The viewer experiences the scene from the character's perspective, seeing only what the character sees (hands, product, environment, actions)
- Natural handheld camera movements: slight shake, imperfect zoom, quick pan - all authentic to iPhone rear camera recording from a POV perspective
- The character's hands may be visible when holding/showing the product, but the character's face, body, or any part of themselves (except hands/arms when relevant) must NOT be visible
- **HYPERREALISM WITH SHAKY CAMERA**: The camera must be hyperrealistic but with natural shaky movements typical of handheld POV recording. The shake should be more pronounced if there's movement in the action (e.g., running, walking), but the content must remain clear and hyperrealistic. The shake should feel authentic and natural, not excessive or distracting.
- **CRITICAL**: Even with shaky camera, all content must be clear, sharp, and hyperrealistic. The shake should enhance authenticity without compromising visual clarity.
- **POV DETECTION**: ${hasPOV ? 'Since "POV" is mentioned in the action text, this camera angle is MANDATORY and must be used.' : ''}
- **NO CHARACTER VISIBILITY**: The character must NEVER appear in the frame. This is a pure POV perspective where only what the character sees is visible.`;
            } else if (angle === 'Steady') {
              return `\n\n**CRITICAL - CAMERA ANGLE: STEADY (MANDATORY):**
The video MUST be recorded as if the phone was placed in a fixed position (e.g., on a table, shelf, tripod, or surface) where the characters are recording themselves in third person. This means:
- The phone is stationary, placed on a surface or mount, not being held by the character
- The camera angle is as if someone left the phone recording in a position where it captures the characters and actions
- This gives a third-person perspective where the viewer sees the characters from an external, steady camera position
- The camera should be stable with minimal shake, as if the phone is resting on a surface
- The characters can still interact with the camera (looking at it, talking to it), but the phone itself is stationary
- **HYPERREALISM WITH STEADY CAMERA**: The camera must be hyperrealistic and stable, with minimal shake. The video should look like authentic UGC content recorded with a phone placed in a fixed position. All content must be clear, sharp, and hyperrealistic.`;
            }
          } else {
            // Multiple camera angles selected - distribute based on actions
            // hasMultipleActions is already defined above, reuse it

            if (hasMultipleActions) {
              // Multiple actions detected - distribute camera angles
              return `\n\n**CRITICAL - CAMERA ANGLE DISTRIBUTION (MULTIPLE ANGLES - DISTRIBUTE ACROSS ACTIONS):**
Multiple camera angles have been selected AND the action text contains multiple distinct actions or scenes. You MUST distribute ALL selected camera angles across the different actions.

**Available camera angles (USE ALL OF THEM):**
${uniqueAngles.map((angle, idx) => `${idx + 1}. ${angle}`).join('\n')}

**Camera Angle Descriptions:**

1. **Selfie Camera**: The character is holding the phone themselves while recording (selfie-style). Natural shaky camera movements that are MORE PRONOUNCED and REALISTIC when there's character movement, action, or scene motion (e.g., running, walking, active movements, gestures, dynamic actions). The camera should shake noticeably as if the person is genuinely holding the phone with their hand while moving - this creates authentic handheld recording during movement. Best for: actions where the character can hold the phone (e.g., "showing the product to the camera", "talking directly to camera", "records herself").

2. **Frontal Camera**: POV (Point of View) perspective - the character is NOT visible, only their perspective from behind the camera. The viewer sees only what the character sees (hands, product, environment), as if looking through their eyes. Best for: POV perspectives, first-person actions (e.g., "POV showing product", "from her pov", "showing from pov").

3. **Steady**: The phone is placed in a fixed position (on a table, shelf, etc.) recording the characters in third person. Stable camera with minimal shake. Best for: actions where the character needs both hands or is in a position where holding the phone is impractical.

**CRITICAL DISTRIBUTION RULES:**
${hasPOV ? '- **POV DETECTION**: Since "POV" is mentioned in the action text, you MUST use "Frontal Camera" for the POV action - this is MANDATORY.\n' : ''}- **MANDATORY**: The action text contains multiple actions (e.g., "showing the product to the camera" AND "showing the product from her pov"). You MUST use ALL selected camera angles and assign each to its corresponding action.
- **Action analysis**: "${actionText}"
- **Distribution logic**:
  * Identify each distinct action in the action text
  * Assign the most appropriate camera angle to each action from the selected options
  * Use "Selfie Camera" for actions where character shows/talks to camera (e.g., "showing the product to the camera")
  * Use "Frontal Camera" for POV actions (e.g., "from her pov", "showing from pov", "POV")
  * Use "Steady" for actions where character needs both hands
- **MANDATORY**: You MUST include ALL selected camera angles in your prompt, each assigned to its corresponding action. Do NOT skip any camera angle. Do NOT skip any action.

**Your task**: 
1. Identify ALL distinct actions in the action text
2. Assign each selected camera angle to its corresponding action
3. Describe each action with its assigned camera angle
4. Ensure ALL actions are included and ALL camera angles are used`;
            } else {
              // Multiple angles but single action - AI must decide
            return `\n\n**CRITICAL - CAMERA ANGLE SELECTION (MULTIPLE OPTIONS - AI MUST DECIDE):**
Multiple camera angles have been selected. You MUST analyze the action text and intelligently choose which camera angle to use based on the context and action described.

**Available camera angles:**
${uniqueAngles.map((angle, idx) => `${idx + 1}. ${angle}`).join('\n')}

**Camera Angle Descriptions:**

1. **Selfie Camera**: The character is holding the phone themselves while recording (selfie-style). Natural shaky camera movements, more pronounced during movement. Best for: actions where the character can hold the phone (e.g., "she records herself running", "showing outfit while holding phone", "talking directly to camera").

2. **Frontal Camera**: POV (Point of View) perspective - the character is NOT visible, only their perspective from behind the camera. The viewer sees only what the character sees (hands, product, environment), as if looking through their eyes. Natural shaky camera movements, more pronounced during movement. Best for: POV perspectives, first-person actions (e.g., "POV of using product", "POV walking", "POV showing product").

3. **Steady**: The phone is placed in a fixed position (on a table, shelf, etc.) recording the characters in third person. Stable camera with minimal shake. Best for: actions where the character needs both hands or is in a position where holding the phone is impractical (e.g., "she shows outfit" while both hands are busy, "cooking while recording", "exercising").

**CRITICAL DECISION RULES:**
${hasPOV ? '- **POV DETECTION**: Since "POV" is mentioned in the action text, you MUST use "Frontal Camera" - this is MANDATORY.\n' : ''}- **Analyze the action text**: "${actionText}"
- **Context-based selection**: Choose the camera angle that best fits the action described:
  - If the action requires the character to hold the phone (e.g., "records herself", "showing while holding"), use "Selfie Camera"
  - If the action mentions "POV" or requires a first-person perspective where the character is not visible, use "Frontal Camera" (MANDATORY if POV is mentioned)
  - If the action requires both hands or the character cannot hold the phone (e.g., "shows outfit" while hands are busy, "cooking", "exercising"), use "Steady"
  - If multiple angles could work, choose the one that best fits the context and action described
- **Single angle selection**: You must choose ONE camera angle from the available options and use it consistently throughout the scene
- **Justify your choice**: The camera angle you choose must make logical sense based on the action described

**Your task**: Analyze the action text, determine which camera angle is most appropriate, and incorporate that camera angle's characteristics into your prompt. Use only ONE camera angle throughout the scene.`;
            }
          }
          return '';
        })()
      : '';

    // Get total number of scenes to adjust conciseness
    const totalScenes = allScenes && Array.isArray(allScenes) ? allScenes.length : 1;
    const isScene4Plus = currentSceneIndex !== undefined && currentSceneIndex >= 3;
    
    // Conciseness instructions based on total scenes
    // IMPORTANT: For scenes 4+, we still need detailed prompts, just more efficient wording
    const concisenessInstructions = totalScenes > 1
      ? (isScene4Plus 
          ? `\n\n**EFFICIENCY REQUIREMENT (Scene ${currentSceneIndex + 1}/${totalScenes}):**
Use efficient, high-impact language while maintaining FULL detail and power. Combine related details into single phrases. Target: ~80-100 words. CRITICAL: Still include ALL technical details (camera, lighting, hyperrealism, composition) - just express them more efficiently.`
          : `\n\n**CRITICAL CONCISENESS REQUIREMENT:**
This is scene ${currentSceneIndex !== undefined ? currentSceneIndex + 1 : 1} of ${totalScenes} total scenes. You MUST be more concise than usual while maintaining full power and detail:

- **For 2-3 scenes**: Be concise but comprehensive. Use efficient, high-impact language. Combine related details into single phrases. Avoid redundancy. Target: ~100-120 words per scene.

- **For 4-5 scenes**: Be significantly more concise. Use compact, dense descriptions. Merge multiple details into single clauses. Prioritize essential elements. Target: ~70-90 words per scene.

- **For 5+ scenes**: Be extremely concise. Use maximum density. Combine all related information into tight phrases. Focus only on critical visual and narrative elements. Target: ~50-70 words per scene.

**Your task**: Maintain ALL the power, detail, and authenticity requirements, but express them with maximum efficiency. Every word must carry maximum weight. Use compound adjectives, merged clauses, and efficient phrasing. The prompt must be shorter but equally powerful and detailed.`)
      : '';

    // Calculate effective duration
    // IMPORTANT: If duration is not specified (null or 1), the total video is 15 seconds, not per scene
    // We need to calculate the duration per scene based on total scenes
    const totalScenesForDuration = allScenes && Array.isArray(allScenes) ? allScenes.length : 1;
    const totalVideoDuration = 15; // Total video duration in seconds
    const effectiveDuration = duration && duration > 0 
      ? duration 
      : Math.max(1, Math.floor(totalVideoDuration / totalScenesForDuration)); // Distribute total duration across scenes
    
    // Script integration instructions
    // For scenes 4+, use more concise script instructions
    const scriptAdaptationMode = scriptAdaptation === 'keep' ? 'keep' : 'adapt';
    const scriptInstructions = script && script.trim()
      ? (isScene4Plus
          ? `\n\n**SCRIPT INTEGRATION (REQUIRED):**
Script: "${script}". Action: "${actionText}". 
REQUIRED: Identify all actions/B-roll from action text. Pair script portions with corresponding actions. Script word count: ~${script.split(/\s+/).length} words (~${Math.round(script.split(/\s+/).length / 2.5)}-${Math.round(script.split(/\s+/).length / 2.2)}s). Duration: ${effectiveDuration}s.
Integration: "while [action], says [script portion]". ${scriptAdaptationMode === 'keep' ? '**CRITICAL - KEEP ALL SCRIPT**: The ENTIRE script must be included EXACTLY as provided, without any adaptations, cuts, or modifications. Include every word of the script in the prompt, regardless of duration.' : 'If script too long, adapt but maintain coherence. Distribute script throughout scene synchronized with actions.'}`
          : `\n\n**CRITICAL - SCRIPT INTEGRATION WITH ACTIONS (MANDATORY):**
A script/dialogue has been provided for this scene. You MUST integrate it seamlessly and coherently with the actions described.

**Script provided:**
"${script}"

**Action text provided:**
"${actionText}"

**CRITICAL REQUIREMENTS:**

1. **Action Analysis (MANDATORY FIRST STEP)**:
   - **Analyze the action text** to identify ALL actions, scenes, B-roll, or visual elements mentioned
   - **Identify multiple actions/scenes**: If the action text mentions multiple actions, B-roll, different scenes, or visual sequences, you MUST include ALL of them clearly in the prompt
   - **Examples of what to detect**:
     * "shows B-roll of product", "cuts to B-roll", "B-roll sequence"
     * "first shows X, then Y", "starts with A, transitions to B"
     * "shows how hair was before, then shows current hair"
     * Multiple distinct actions or visual moments
   - **MANDATORY**: If B-roll or multiple actions/scenes are mentioned in the action text, they MUST appear explicitly and clearly in your generated prompt

2. **Script-Action Coherence Mapping (CRITICAL)**:
   - **Map script portions to specific actions**: Analyze the script and identify which parts relate to which actions mentioned in the action text
   - **Coherent pairing**: If the script mentions something (e.g., "look how my hair was before") and the action text also mentions showing that thing (e.g., "shows how hair was before"), that specific script portion MUST be spoken DURING that specific action
   - **Dynamic synchronization**: For each action/scene/B-roll mentioned in the action text, identify the corresponding script portion and pair them together
   - **Examples**:
     * Script: "Look how my hair was before" + Action: "shows before photo" → "while showing the before photo, says 'Look how my hair was before'"
     * Script: "Now look at it now" + Action: "shows current hair" → "as the camera focuses on the current hair, says 'Now look at it now'"
     * Script: "This product changed everything" + Action: "holds product up" → "while holding the product up to the camera, says 'This product changed everything'"

3. **Timing Analysis**:
   - Average speaking rate: ~2.5-3 words per second
   - Script word count: approximately ${script.split(/\s+/).length} words
   - Estimated speaking time: ~${Math.round(script.split(/\s+/).length / 2.5)}-${Math.round(script.split(/\s+/).length / 2.2)} seconds
   - Available time: ${effectiveDuration} seconds

4. **Script Adaptation Decision (${scriptAdaptationMode === 'keep' ? 'KEEP ALL SCRIPT MODE' : 'ADAPT SCRIPT MODE'}):**
   ${scriptAdaptationMode === 'keep' 
     ? `- **ABSOLUTE MANDATE - KEEP ALL SCRIPT**: The ENTIRE script must be included EXACTLY as provided, word-for-word, without ANY adaptations, cuts, modifications, or omissions
   - **NO ADAPTATIONS**: Do NOT shorten, condense, or modify the script in any way
   - **INCLUDE EVERY WORD**: Every single word of the script must appear in the generated prompt
   - **DURATION IRRELEVANT**: The script must be kept complete regardless of whether it fits the ${effectiveDuration}-second duration or not
   - **MANDATORY**: The prompt must include the complete, unmodified script as provided`
     : `- **IF script fits comfortably** (estimated time ≤ ${effectiveDuration} seconds): Use the script EXACTLY as provided, but integrate each portion with its corresponding action
   - **IF script is slightly long** (estimated time > ${effectiveDuration} seconds but ≤ ${effectiveDuration + 2} seconds): Adapt it minimally - condense non-essential words while preserving all key content and maintaining script-action coherence
   - **IF script is too long** (estimated time > ${effectiveDuration + 2} seconds): Adapt it significantly - prioritize key messages, remove redundant phrases, but maintain the core content and meaning, AND maintain coherence with actions`}

5. **Integration with Actions (MANDATORY STRUCTURE)**:
   - **Break down actions**: Identify each distinct action, scene, B-roll, or visual moment from the action text
   - **Break down script**: Identify logical portions of the script that correspond to each action
   - **Pair them coherently**: For each action, specify when and how the corresponding script portion is spoken:
     * "while [specific action], says [corresponding script portion]"
     * "as [specific action happens], narrates [corresponding script portion]"
     * "during [specific action/B-roll], speaks [corresponding script portion]"
     * "while performing [specific action], explains [corresponding script portion]"
   - **Maintain coherence**: If script mentions "before" and action shows "before", pair them together. If script mentions "now" and action shows "current", pair them together.
   - **Natural flow**: The script should feel naturally integrated with the actions, with each script portion occurring during its relevant action

6. **B-roll and Multiple Actions Handling**:
   - **If B-roll is mentioned**: Explicitly describe the B-roll sequence and integrate the relevant script portion during the B-roll
   - **If multiple actions/scenes**: Clearly separate each action/scene in your prompt and pair each with its corresponding script portion
   - **Transitions**: Describe transitions between actions/scenes and how the script flows through them
   - **Example structure**: "First, [action 1] while saying [script portion 1]. Then, transitions to [action 2/B-roll] as [script portion 2] is spoken. Finally, [action 3] while narrating [script portion 3]."

7. **Script Distribution**:
   - Distribute the script throughout the scene duration, synchronized with relevant actions
   - Start speaking early if the script is substantial
   - Ensure each script portion is paired with its corresponding action/scene
   - If the script is long, prioritize mentioning it early and distributing it across multiple action moments

8. **Duration Compliance**:
   ${scriptAdaptationMode === 'keep' 
     ? `- **KEEP ALL SCRIPT MODE**: The script must be kept complete regardless of duration. Include the entire script in the prompt even if it exceeds the ${effectiveDuration}-second timeframe.`
     : `- The final prompt must describe a scene where the script can be fully spoken within ${effectiveDuration} seconds
   - Adjust pacing and script length accordingly
   - Ensure actions, B-roll, multiple scenes, and script together fit naturally within the ${effectiveDuration}-second timeframe`}

**CRITICAL EXAMPLES:**

Example 1 - B-roll:
- Action: "shows B-roll of product being used"
- Script: "This is how I use it every day"
- Integration: "The scene cuts to B-roll footage showing the product being used, while the narrator says 'This is how I use it every day'"

Example 2 - Multiple actions with coherent script:
- Action: "shows before photo, then shows current result"
- Script: "Look how my hair was before. Now look at it now."
- Integration: "While showing the before photo, says 'Look how my hair was before'. Then, as the camera transitions to show the current hair, says 'Now look at it now'"

Example 3 - Action-script coherence:
- Action: "holds product up to camera"
- Script: "This product changed everything"
- Integration: "While holding the product up to the camera, says 'This product changed everything'"

**Your task**: 
1. First, analyze the action text to identify ALL actions, B-roll, scenes, or visual elements
2. Then, analyze the script to identify portions that correspond to each action
3. Create a prompt that:
   - Explicitly includes ALL actions/B-roll/scenes mentioned in the action text
   - Pairs each script portion with its corresponding action coherently
   ${scriptAdaptationMode === 'keep' ? '- **MANDATORY**: Includes the ENTIRE script word-for-word without any modifications' : '- Adapts the script if needed to fit the duration while maintaining coherence'}
   - Ensures script portions are spoken DURING the relevant actions
   - Maintains natural flow and coherence between script and actions
   ${scriptAdaptationMode === 'keep' ? '- Includes the complete script regardless of duration' : `- Fits within ${effectiveDuration} seconds`}`)
      : '';

    // Duration-based instructions
    // IMPORTANT: Total video is 15 seconds, not per scene. Duration per scene is calculated above.
    const durationInstructions = duration && duration > 0
      ? `\n\n**CRITICAL DURATION CONSTRAINT:**
This scene has a duration of **${duration} seconds** (Scene ${currentSceneIndex !== undefined ? currentSceneIndex + 1 : 1} of ${totalScenesForDuration}). The TOTAL video duration is **${totalVideoDuration} seconds**, distributed across ${totalScenesForDuration} scene(s). You MUST adjust your prompt accordingly:

- **For short durations (1-3 seconds)**: Focus on a single, impactful moment. Use concise, high-impact descriptions. Prioritize the most essential visual elements. Keep the action description tight and focused on one key action or moment.

- **For medium durations (4-10 seconds)**: Balance detail with pacing. Include 2-3 key moments or actions. Allow for natural transitions between actions. Provide enough detail for visual richness without overwhelming the timeframe.

- **For longer durations (11+ seconds)**: You can include more detailed descriptions, multiple actions, transitions, and richer visual storytelling. Include more nuanced details about movements, expressions, and environmental elements. Allow for a more complete narrative arc within the scene.

**Your task**: Adjust the density and pacing of your prompt description to match the ${duration}-second duration for this scene. Ensure the action described can realistically unfold within this timeframe. If the action is too complex for the duration, simplify it. If the duration allows for more detail, enrich the description appropriately. The prompt should feel neither rushed (too much action for the time) nor stretched (too little action for the time). Remember: This is part of a ${totalVideoDuration}-second total video with ${totalScenesForDuration} scene(s).`
      : `\n\n**CRITICAL DURATION CONSTRAINT:**
This scene is part of a **${totalVideoDuration}-second total video** with **${totalScenesForDuration} scene(s)**. This specific scene has approximately **${effectiveDuration} seconds**. You MUST adjust your prompt accordingly:

- The total video is ${totalVideoDuration} seconds, NOT ${totalVideoDuration} seconds per scene
- This scene (Scene ${currentSceneIndex !== undefined ? currentSceneIndex + 1 : 1} of ${totalScenesForDuration}) has approximately ${effectiveDuration} seconds
- Focus on concise, impactful descriptions that fit within this scene's allocated time
- Balance detail with pacing to fit comfortably within the scene's duration
- Ensure the action can realistically unfold within approximately ${effectiveDuration} seconds

**Your task**: Create a prompt that describes actions and visual elements that can realistically unfold within approximately ${effectiveDuration} seconds for this scene, as part of a ${totalVideoDuration}-second total video.`;

    // Check if "UGC Close-up" is in the compositions
    const hasUgcCloseUp = compositionArray.some((comp: string) => 
      comp.toLowerCase().includes('ugc close') || comp.toLowerCase().includes('close-up')
    );

    // Check if Selfie Camera is selected
    const hasSelfieCamera = cameraAnglesArray.some((angle: string) => 
      angle.toLowerCase().includes('selfie')
    );

    // UGC Close-up specific instructions
    const ugcCloseUpInstructions = hasUgcCloseUp
      ? `\n\n**UGC CLOSE-UP MODE (ACTIVE):**
Since "UGC Close-up" composition is selected, you MUST focus the shot on the ${mentionsProduct ? 'product or ' : ''}person in extreme close-up detail. Sharp focus on textures and details, natural shaky camera movements typical of mobile close-up shots, and emphasize the intimate, detailed view of the ${mentionsProduct ? 'product or ' : ''}person. The close-up should feel authentic and spontaneous, as if someone is naturally zooming in with their iPhone to show details.${hasSelfieCamera ? ` **CRITICAL - CAMERA DISTANCE WITH SELFIE CAMERA**: Since "Selfie Camera" is also selected, the person should be positioned CLOSER to the camera when speaking or interacting, creating an intimate selfie-style close-up. The person's face should be noticeably closer to the lens, as if they're holding the phone close while talking or demonstrating, creating that authentic close-up selfie aesthetic where the person is speaking directly to the camera from a closer distance.` : ''} **CRITICAL - Even in close-up, the background (if visible) must remain sharp and in focus, exactly as iPhone cameras record. No blur on background elements.**`
      : `\n\n**UGC SCENE COMPOSITION (NO CLOSE-UP):**
Since "UGC Close-up" is NOT selected, you MUST show the ${mentionsProduct ? 'product and ' : ''}person together in the scene as a whole, maintaining a natural wide-to-medium shot that captures the complete scene context. DO NOT focus exclusively on the ${mentionsProduct ? 'product or ' : ''}person in close-up. Instead, show them integrated naturally within the environment, maintaining the full scene context. The shot should feel like a natural, casual mobile recording that captures the entire scene organically, as if recorded from the iPhone of the AI avatar. Keep everything visible together in the frame, respecting the natural composition of the scene while maintaining 100% UGC hyperrealism. **CRITICAL - Background must be completely sharp and in focus, no blur whatsoever, exactly as iPhone cameras record in vertical mode.**`;

    // Lighting-specific instructions for hyperrealistic UGC
    // For scenes 4+, use more concise lighting instructions to save tokens
    const lightingInstructions = lighting
      ? (() => {
          const lightingLower = lighting.toLowerCase();
          const hyperrealismBase = isScene4Plus
            ? `\n\n**HYPERREALISM (REQUIRED):**
100% iPhone realism: ultra-realistic shadows with proper falloff, photorealistic lighting with natural diffusion, hyperrealistic textures (skin pores, fabric weave, product details), iPhone camera characteristics (grain, color science, exposure), real-world imperfections (motion blur, focus breathing), environmental authenticity. Background must be sharp and in focus.`
            : `\n\n**CRITICAL HYPERREALISM REQUIREMENTS (APPLIES TO ALL LIGHTING):**
The video MUST maintain 100% hyperrealism in ALL aspects, making it indistinguishable from a real iPhone-recorded video:
- **Ultra-realistic shadows**: Natural, soft shadows with proper falloff, realistic shadow edges, authentic shadow density and color that matches the light source
- **Hyperrealistic lighting**: Natural light behavior, realistic light diffusion, authentic light temperature and color casts, genuine light reflections and highlights
- **Photorealistic textures**: Every surface must show realistic material properties - skin texture with pores and natural imperfections, fabric textures with visible weave, product surfaces with authentic material details, all textures must look completely real
- **iPhone camera characteristics**: Subtle mobile phone grain, natural color science typical of iPhone cameras, realistic depth of field with natural bokeh, authentic exposure characteristics, slight lens distortion typical of phone cameras
- **Real-world imperfections**: Natural motion blur during movement, authentic focus breathing, realistic chromatic aberration in high contrast areas, genuine lens flare when appropriate
- **Environmental authenticity**: Realistic light interaction with surfaces, authentic material response to lighting, genuine atmospheric perspective, natural light scattering
The goal is absolute photorealism - the video should be impossible to distinguish from a real iPhone recording. Every shadow, light, texture, and detail must be hyperrealistic.`;
          
          if (lightingLower.includes('night outside')) {
            return isScene4Plus
              ? `${hyperrealismBase}\n\n**LIGHTING: NIGHT OUTSIDE:**
Authentic iPhone night recording: streetlights/car headlights with realistic falloff, moonlight casting soft hyperrealistic shadows, authentic grain/noise/lower exposure, warm artificial lights with realistic color temperature. Background sharp and in focus.`
              : `${hyperrealismBase}\n\n**LIGHTING: NIGHT OUTSIDE (HYPERREALISTIC UGC):**
The lighting MUST be authentic nighttime outdoor lighting as if someone is genuinely recording outside at night with their iPhone. Include: streetlights and car headlights visible in background with realistic light falloff and authentic shadows, natural moonlight casting soft, hyperrealistic shadows with proper edge softness, realistic iPhone recording at night with authentic grain, natural noise, and lower exposure typical of nighttime smartphone footage, warm artificial lights from buildings or streetlamps with realistic color temperature and light diffusion, authentic night atmosphere with hyperrealistic light interaction. The video should look exactly like real nighttime footage recorded on an iPhone - not professional lighting, but genuine iPhone night recording with all its characteristic qualities (authentic grain, natural noise, realistic exposure, hyperrealistic shadows with proper density and softness, genuine light sources with realistic falloff, etc.). Every shadow must be hyperrealistic with natural softness and proper density. Every light source must have realistic diffusion and color temperature. **CRITICAL - Background must be completely sharp and in focus, no blur whatsoever, exactly as iPhone cameras record in vertical mode.**`;
          } else if (lightingLower.includes('day outside')) {
            return isScene4Plus
              ? `${hyperrealismBase}\n\n**LIGHTING: DAY OUTSIDE:**
Authentic iPhone day recording: bright natural sunlight with hyperrealistic diffusion, ultra-realistic shadows with proper softness/density, natural color science, slight overexposure in highlights. Background sharp and in focus.`
              : `${hyperrealismBase}\n\n**LIGHTING: DAY OUTSIDE (HYPERREALISTIC UGC):**
The lighting MUST be authentic daytime outdoor lighting as if someone is genuinely recording outside during the day with their iPhone. Include: bright and clear natural sunlight with hyperrealistic light diffusion and realistic color temperature, ultra-realistic shadows cast by natural light with proper edge softness, authentic density, and natural shadow color, authentic iPhone recording during daytime with natural color science typical of iPhone cameras, genuine outdoor ambient lighting with realistic light scattering, slight overexposure in bright areas typical of iPhone cameras with authentic highlight rolloff, hyperrealistic light interaction with all surfaces. The video should look exactly like real daytime footage recorded on an iPhone - not professional lighting, but genuine iPhone day recording with all its characteristic qualities (natural shadows with hyperrealistic softness and density, bright sunlight with realistic diffusion, slight overexposure in highlights with authentic rolloff, etc.). Every shadow must be hyperrealistic. Every light interaction must be photorealistic. **CRITICAL - Background must be completely sharp and in focus, no blur whatsoever, exactly as iPhone cameras record in vertical mode.**`;
          } else if (lightingLower.includes('artificial light inside')) {
            return isScene4Plus
              ? `${hyperrealismBase}\n\n**LIGHTING: ARTIFICIAL LIGHT INSIDE:**
Authentic iPhone indoor artificial lighting: warm/cool LED/incandescent with realistic color temperature/diffusion, ultra-realistic shadows matching light source, photorealistic textures (skin pores, fabric weave), iPhone color science, natural exposure/grain. Background sharp and in focus.`
              : `${hyperrealismBase}\n\n**LIGHTING: ARTIFICIAL LIGHT INSIDE (HYPERREALISTIC UGC - CRITICAL):**
The lighting MUST be authentic indoor artificial lighting as if someone is genuinely recording inside with artificial lights using their iPhone, while maintaining ABSOLUTE HYPERREALISM in shadows, lights, and textures. Include: 
- **Hyperrealistic artificial light sources**: Warm or cool LED/incandescent lights with realistic color temperature, authentic light diffusion, genuine light falloff, natural light intensity distribution
- **Ultra-realistic shadows**: Natural shadows from indoor lights with proper edge softness, authentic shadow density that matches the light source, realistic shadow color (warm shadows from warm lights, cool shadows from cool lights), natural shadow falloff and softness
- **Photorealistic textures**: Every surface must show hyperrealistic material properties - skin with natural pores and imperfections under artificial light, fabrics with visible texture and realistic light interaction, product surfaces with authentic material details, all textures must respond realistically to the artificial light
- **Authentic iPhone recording**: Genuine iPhone color science under artificial lighting, realistic color cast from artificial light sources, natural exposure characteristics, subtle mobile phone grain, authentic depth of field
- **Realistic indoor ambient light**: Natural light interaction with indoor surfaces, authentic material response to artificial lighting, genuine atmospheric perspective, realistic light scattering in indoor environment
- **Real-world imperfections**: Natural motion blur, authentic focus characteristics, realistic chromatic aberration, genuine lens characteristics typical of iPhone cameras
The video should look exactly like real indoor footage recorded on an iPhone with artificial lighting - not professional lighting, but genuine iPhone indoor recording with ABSOLUTE HYPERREALISM. Every shadow must be hyperrealistic with natural softness, proper density, and authentic color. Every light must have realistic diffusion, color temperature, and falloff. Every texture must be photorealistic and respond authentically to the artificial light. **CRITICAL - Background must be completely sharp and in focus, no blur whatsoever, exactly as iPhone cameras record in vertical mode.** The goal is to make it impossible to distinguish from a real iPhone recording.`;
          } else if (lightingLower.includes('natural light inside')) {
            return isScene4Plus
              ? `${hyperrealismBase}\n\n**LIGHTING: NATURAL LIGHT INSIDE:**
Authentic iPhone indoor natural window light: hyperrealistic diffusion/color temperature, soft diffused daylight with authentic falloff, ultra-realistic shadows with proper softness/density, bright/airy atmosphere. Background sharp and in focus.`
              : `${hyperrealismBase}\n\n**LIGHTING: NATURAL LIGHT INSIDE (HYPERREALISTIC UGC):**
The lighting MUST be authentic indoor natural lighting as if someone is genuinely recording inside near a window with their iPhone, maintaining absolute hyperrealism. Include: natural window light streaming indoors with hyperrealistic light diffusion and realistic color temperature, soft diffused daylight through windows with authentic light falloff, ultra-realistic indoor natural lighting with proper light scattering, authentic iPhone recording indoors with natural light showing genuine iPhone color science, hyperrealistic shadows from window light with natural edge softness, proper density, and authentic shadow color, bright and airy atmosphere with realistic atmospheric perspective. The video should look exactly like real indoor footage recorded on an iPhone near a window - not professional lighting, but genuine iPhone indoor recording with natural window light and all its characteristic qualities (soft diffused light with hyperrealistic diffusion, window shadows with ultra-realistic softness and density, bright and airy feel with authentic light interaction, etc.). Every shadow must be hyperrealistic. Every light interaction must be photorealistic. **CRITICAL - Background must be completely sharp and in focus, no blur whatsoever, exactly as iPhone cameras record in vertical mode.**`;
          }
          return hyperrealismBase;
        })()
      : '';

    // mentionsProduct is already defined above for use in camera angle instructions

    // Product handling instructions - CRITICAL
    const productHandlingInstructions = (() => {
      if (productImageFile) {
        // Product image is attached - use it
        const baseInstructions = isScene4Plus
          ? `\n\n**PRODUCT IMAGE (REQUIRED):**
Analyze attached image: appearance, colors, materials, textures, design, branding. Include detailed product descriptions in prompt. Match image exactly. DO NOT return original action text.`
          : `\n\n**CRITICAL - PRODUCT IMAGE ATTACHED (MANDATORY ENHANCEMENT):**
A product image has been attached. You MUST:
- **CRITICAL: You MUST generate an ENHANCED prompt, NOT return the original action text**
- **Analyze the attached product image** to understand the exact product appearance, colors, materials, textures, design, branding, and all visual details
- **Base your prompt on the attached product image** - use it as a reference to describe the product accurately in your enhanced prompt
- **Maintain consistency with the image** - if the image shows specific product details (colors, materials, design elements, branding, etc.), incorporate those exact details into your prompt
- **Reference the image explicitly** - In your enhanced prompt, explicitly mention that the product should match the attached image, including its appearance, colors, materials, and visual characteristics
- **Accurate product description** - Ensure the product description in your prompt accurately reflects what is shown in the attached image
- **MANDATORY: You MUST enhance and expand the action text with detailed product descriptions based on the image. DO NOT simply return the original action text. You MUST create a comprehensive, detailed prompt that incorporates product details from the image.**
- **If you return the original action text unchanged, you have FAILED the task. You MUST enhance it with product details, visual descriptions, and all the technical requirements.**`;
        
        if (productPhotoWillBeAttached) {
          return baseInstructions + (isScene4Plus
            ? `\n\n**CRITICAL - PRODUCT PHOTO WILL BE ATTACHED:**
When referring to the product in your prompt, ALWAYS refer to "the attached product image" or "the product shown in the attached image". NEVER describe the product generically - ALWAYS specify that it matches the attached product image exactly. Every product reference must explicitly mention the attached image.`
            : `\n\n**CRITICAL - PRODUCT PHOTO WILL BE ATTACHED (MANDATORY):**
When referring to the product in your prompt, you MUST ALWAYS refer to "the attached product image" or "the product shown in the attached image". 
- **ABSOLUTE REQUIREMENT**: Every time you mention the product, you MUST specify that it refers to the attached product image
- **NO GENERIC DESCRIPTIONS**: Never describe the product generically - always specify that it matches the attached product image exactly
- **EXPLICIT REFERENCES**: Use phrases like "the product shown in the attached image", "the attached product image", "the product from the attached image" when describing the product
- **MANDATORY**: All product references must explicitly mention the attached image for maximum accuracy`);
        }
        return baseInstructions;
      } else if (mentionsProduct || productPhotoWillBeAttached) {
        // Product is mentioned but no image attached - DO NOT INVENT
        return isScene4Plus
          ? `\n\n**CRITICAL - PRODUCT REFERENCE (NO INVENTING):**
The action text mentions "product" or "el producto". ${productPhotoWillBeAttached ? 'A product image WILL BE ATTACHED to the final prompt.' : 'A product image may be attached to the final prompt.'}
- **ABSOLUTE PROHIBITION**: NEVER invent product details (colors, shapes, materials, sizes, types, names, brands)
- **GENERIC REFERENCE ONLY**: Only refer to "the product" or "the product that will be shown" or "the product from the attached image"
- **NO SPECIFIC DETAILS**: Do NOT describe what the product looks like, its color, shape, material, or any visual characteristics
- **WAIT FOR IMAGE**: ${productPhotoWillBeAttached ? 'The product image will be attached to the final prompt - describe it as "the product shown in the attached image" or "the attached product image"' : 'If a product image is attached, describe it based on the image. Otherwise, only say "the product"'}
- **MANDATORY**: When the action text mentions "product", you MUST only use generic references like "the product", "the product shown", or "the product from the attached image" - NEVER invent details`
          : `\n\n**CRITICAL - PRODUCT REFERENCE HANDLING (MANDATORY - NO INVENTING):**
The action text mentions "product", "el producto", "using the product", "showing the product", or similar terms. ${productPhotoWillBeAttached ? 'A product image WILL BE ATTACHED to the final prompt.' : 'A product image may be attached to the final prompt.'}

**ABSOLUTE PROHIBITION - NEVER INVENT PRODUCT DETAILS:**
- **FORBIDDEN**: You MUST NEVER invent, assume, or guess product details such as:
  * Colors (e.g., "red", "blue", "tan", "colorful", "vibrant")
  * Shapes (e.g., "bottle", "gummies", "strip", "round", "rectangular", "bottle-shaped")
  * Materials (e.g., "plastic", "glass", "fabric", "adhesive", "translucent")
  * Sizes (e.g., "small", "large", "tiny", "compact")
  * Types/Names (e.g., "creatine gummies", "mouth tape", "serum", "supplement") - UNLESS explicitly stated in action text
  * Brand names or product names
  * Any visual characteristics not explicitly stated in the action text or visible in attached image

**IDENTIFYING PRODUCT REFERENCES:**
- **Product keywords**: "product", "el producto", "producto", "the product", "using the product", "showing the product", "holding the product", "using the product (mouth tape)"
- **When action text says these**: They refer to THE PRODUCT that will be shown in the video
- **Keep type if mentioned**: If action text says "using the product (mouth tape)", you can keep "mouth tape" as it's explicitly stated, but DON'T add colors/shapes
- **Other items are NOT the product**: Clothing, furniture, environment, background items, accessories (unless explicitly called "product") are NOT the product

**CORRECT PRODUCT REFERENCES:**
- **If productPhotoWillBeAttached is true**: Always use "the product shown in the attached image", "the attached product image", or "the product from the attached image"
- **If no image but product mentioned**: Only use generic terms like "the product", "the product being used", "the product shown", "the product in hand"
- **If action mentions type**: If action says "using the product (mouth tape)", you can say "using the product (mouth tape)" but DON'T add "tan", "small", "adhesive strip", etc.

**MANDATORY EXAMPLES:**
- Action: "showing the product" → CORRECT: "showing the product shown in the attached image" (if image will be attached) or "showing the product" (if no image)
- Action: "using the product" → CORRECT: "using the product from the attached image" (if image will be attached) or "using the product" (if no image)
- Action: "holding the product" → CORRECT: "holding the product shown in the attached image" (if image will be attached) or "holding the product" (if no image)
- Action: "using the product (mouth tape)" → CORRECT: "using the product (mouth tape)" or "using the product (mouth tape) shown in the attached image" - DON'T add "tan", "small", "adhesive strip"
- WRONG: "holding a bottle of creatine gummies" (invented: "bottle", "gummies")
- WRONG: "showing colorful gummies" (invented: "colorful", "gummies")
- WRONG: "using a tan adhesive strip" (invented: "tan", "adhesive strip")
- WRONG: "holding the product, a small tan mouth tape strip" (invented: "small", "tan", "strip")

**MANDATORY**: When you see "product" in the action text, you MUST identify it as THE PRODUCT and refer to it generically or as "the product from the attached image" - NEVER invent what it looks like, its color, shape, material, or any visual characteristics.`;
      }
      return '';
    })();

    const productImageInstructions = productHandlingInstructions;

    // Reference image instructions
    const referenceImageInstructions = referenceImageFile
      ? (() => {
          let instructions = isScene4Plus
            ? `\n\n**REFERENCE IMAGE (ATTACHED):`
            : `\n\n**CRITICAL - REFERENCE IMAGE ATTACHED:`;
          
          if (copyLighting && copyCameraAngle) {
            instructions += isScene4Plus
              ? `\nAnalyze reference image. COPY LIGHTING (shadows, textures, light sources, color temperature, diffusion) AND CAMERA ANGLE (position, framing, character placement, perspective) from reference. Match exactly.`
              : `\nA reference image has been attached. You MUST analyze it and COPY BOTH the lighting AND camera angle from the reference image:
- **COPY LIGHTING (MANDATORY)**: Analyze the lighting in the reference image (light sources, shadows, textures, color temperature, light diffusion, shadow softness, highlight characteristics) and replicate it EXACTLY in your prompt. Match the lighting style, shadows, and all lighting characteristics.
- **COPY CAMERA ANGLE (MANDATORY)**: Analyze the camera angle in the reference image (camera position, framing, character placement, perspective, shot composition) and replicate it EXACTLY in your prompt. Match the camera position, angle, and framing.`;
          } else if (copyLighting) {
            instructions += isScene4Plus
              ? `\nAnalyze reference image. COPY LIGHTING (shadows, textures, light sources, color temperature, diffusion) from reference. Match exactly.`
              : `\nA reference image has been attached. You MUST analyze it and COPY the lighting from the reference image:
- **COPY LIGHTING (MANDATORY)**: Analyze the lighting in the reference image (light sources, shadows, textures, color temperature, light diffusion, shadow softness, highlight characteristics) and replicate it EXACTLY in your prompt. Match the lighting style, shadows, and all lighting characteristics.`;
          } else if (copyCameraAngle) {
            instructions += isScene4Plus
              ? `\nAnalyze reference image. COPY CAMERA ANGLE (position, framing, character placement, perspective) from reference. Match exactly.`
              : `\nA reference image has been attached. You MUST analyze it and COPY the camera angle from the reference image:
- **COPY CAMERA ANGLE (MANDATORY)**: Analyze the camera angle in the reference image (camera position, framing, character placement, perspective, shot composition) and replicate it EXACTLY in your prompt. Match the camera position, angle, and framing.`;
          } else {
            instructions += isScene4Plus
              ? `\nReference image attached for visual reference. Use as general visual guide.`
              : `\nA reference image has been attached. Use it as a visual reference for the scene, but you are not required to copy specific lighting or camera angle unless explicitly requested.`;
          }
          
          return instructions;
        })()
      : '';

    // No dialogue instructions
    const noDialogueInstructions = noDialogue
      ? (isScene4Plus
          ? `\n\n**NO DIALOGUE (MANDATORY):**
ABSOLUTE PROHIBITION: No words, speech, dialogue, narration, or any spoken content. Complete silence. Only visual elements and actions.`
          : `\n\n**CRITICAL - NO DIALOGUE (ABSOLUTE PROHIBITION):**
This scene MUST have ABSOLUTELY NO DIALOGUE, SPEECH, NARRATION, OR ANY SPOKEN CONTENT:
- **ABSOLUTE PROHIBITION**: No words, speech, dialogue, narration, voice-over, or any spoken content whatsoever
- **Complete silence**: The scene must be completely silent in terms of dialogue
- **Visual only**: Only visual elements, actions, and movements should be described
- **No script integration**: Do NOT integrate any script or dialogue, even if provided
- **MANDATORY**: The prompt must explicitly state that there is no dialogue, no speech, and complete silence`)
      : '';

    // Lip Sync instructions
    const lipSyncInstructions = lipSync && !noDialogue
      ? (isScene4Plus
          ? `\n\n**LIP SYNC MODE (MANDATORY):**
Character MUST visibly speak the words. Mouth movements must match dialogue exactly. Character's lips, jaw, and facial expressions must synchronize with spoken words. Show character speaking clearly. **ENHANCED NATURAL GESTURES**: When speaking, the character must use natural, organic hand gestures and body language that feel spontaneous and authentic - pointing, gesturing, hand movements that naturally accompany speech, subtle head movements, natural eye contact with camera, all feeling completely unscripted and human.`
          : `\n\n**CRITICAL - LIP SYNC MODE (MANDATORY):**
This scene uses LIP SYNC mode. The character MUST visibly speak the words from the script:
- **VISIBLE SPEECH**: The character's mouth movements MUST match the dialogue exactly
- **Synchronization**: The character's lips, jaw, and facial expressions must synchronize perfectly with the spoken words
- **Clear visibility**: The character's face and mouth must be clearly visible while speaking
- **Natural movements**: Mouth movements should be natural and match the pronunciation of each word
- **Facial expressions**: Facial expressions should match the tone and emotion of the dialogue
- **ENHANCED NATURAL GESTURES WHEN SPEAKING (CRITICAL)**: When the character is speaking, they MUST use natural, organic hand gestures and body language that feel completely spontaneous and authentic:
  * **Natural hand gestures**: Pointing, gesturing, hand movements that naturally accompany speech (e.g., showing, demonstrating, emphasizing points). Gestures should be SPECIFICALLY ACORDED TO THE SCRIPT CONTENT - if the script mentions something specific, the gestures should naturally relate to that content (e.g., if script mentions "this product", character naturally points to or shows it; if script mentions "look at this", character naturally gestures to draw attention)
  * **Organic body language**: Subtle head movements, natural posture shifts, authentic body positioning that feels unscripted. Body language should match the tone and content of the script - if script is enthusiastic, body language should reflect that; if script is explanatory, body language should be more demonstrative
  * **Spontaneous movements**: Gestures should feel like they're happening naturally as the person speaks, not rehearsed or robotic. Movements should be TIMED WITH THE SCRIPT - gestures should naturally occur at moments that make sense with what's being said
  * **Eye contact**: Natural eye contact with the camera while speaking, with occasional natural breaks. Eye contact should vary naturally - more direct when emphasizing points, occasional breaks when thinking or demonstrating
  * **Varied expressions**: Facial expressions should change naturally throughout the dialogue, matching the emotional tone and content of the script. Expressions should be SPECIFICALLY ACORDED TO WHAT'S BEING SAID - if script is excited, show excitement; if script is serious, show seriousness
  * **Authentic reactions**: Natural reactions and responses that feel genuine and unscripted. Reactions should be ACORDED TO THE SCRIPT - if script mentions something surprising, show surprise; if script mentions something positive, show positive reaction
  * **Script-synchronized gestures**: All gestures, expressions, and movements should feel like they're naturally responding to and accompanying the specific words and content of the script, not generic or disconnected
- **MANDATORY**: The prompt must explicitly describe that the character is visibly speaking with natural, organic gestures and body language that accompany the speech, making it feel completely authentic and human`)
      : '';

    // Voiceover instructions
    const voiceoverInstructions = voiceover && !noDialogue
      ? (isScene4Plus
          ? `\n\n**VOICEOVER MODE (MANDATORY):**
Voice plays while actions happen. Character does NOT visibly speak. Voice narrates over the scene. Character performs actions without mouth movements matching dialogue. **ENHANCED NATURAL GESTURES**: While the voiceover plays, the character must use natural, organic gestures and body language that feel spontaneous and authentic - pointing, demonstrating, natural hand movements, subtle head movements, all feeling completely unscripted and human.`
          : `\n\n**CRITICAL - VOICEOVER MODE (MANDATORY):**
This scene uses VOICEOVER mode. The voice plays while actions happen, but the character does NOT visibly speak:
- **NO VISIBLE SPEECH**: The character does NOT move their mouth to match the dialogue
- **Voice narration**: The voice plays as narration over the scene while actions occur
- **Character actions**: The character performs actions, movements, and expressions WITHOUT speaking
- **No lip sync**: The character's mouth should be closed or in a neutral position, NOT matching the words
- **Voice over scene**: The dialogue is heard as a voiceover while the character performs visual actions
- **ENHANCED NATURAL GESTURES DURING VOICEOVER (CRITICAL)**: While the voiceover plays, the character MUST use natural, organic gestures and body language that feel completely spontaneous and authentic:
  * **Natural hand gestures**: Pointing, demonstrating, showing, gesturing naturally as they perform actions (e.g., showing the product, demonstrating use, emphasizing points). Gestures should be SPECIFICALLY ACORDED TO THE VOICEOVER CONTENT - if voiceover mentions something specific, the gestures should naturally relate to that content (e.g., if voiceover mentions "this product", character naturally points to or shows it; if voiceover mentions "look at this", character naturally gestures to draw attention)
  * **Organic body language**: Subtle head movements, natural posture shifts, authentic body positioning that feels unscripted. Body language should match the tone and content of the voiceover - if voiceover is enthusiastic, body language should reflect that; if voiceover is explanatory, body language should be more demonstrative
  * **Spontaneous movements**: Gestures should feel like they're happening naturally as the person acts, not rehearsed or robotic. Movements should be TIMED WITH THE VOICEOVER - gestures should naturally occur at moments that make sense with what's being said in the voiceover
  * **Natural reactions**: Authentic reactions and responses to what they're doing, feeling genuine and unscripted. Reactions should be ACORDED TO THE VOICEOVER - if voiceover mentions something surprising, show surprise; if voiceover mentions something positive, show positive reaction
  * **Varied expressions**: Facial expressions should change naturally throughout the scene, matching the actions and tone. Expressions should be SPECIFICALLY ACORDED TO THE VOICEOVER CONTENT - if voiceover is excited, show excitement; if voiceover is serious, show seriousness
  * **Voiceover-synchronized gestures**: All gestures, expressions, and movements should feel like they're naturally responding to and accompanying the specific words and content of the voiceover, not generic or disconnected
- **MANDATORY**: The prompt must explicitly state that the voice plays as narration/voiceover, the character does NOT visibly speak the words, but the character uses natural, organic gestures and body language while performing actions`)
      : '';
    const criticalEnhancementSection = isScene4Plus
      ? `**CRITICAL - YOU MUST ENHANCE (Scene ${currentSceneIndex + 1}):**
- FORBIDDEN: Returning original action text unchanged
- REQUIRED: Transform into detailed prompt with camera, lighting, composition, hyperrealism details
- REQUIRED: Include all technical specifications (movements, textures, shadows, iPhone characteristics)
- REQUIRED: ${productImageFile ? 'Analyze product image and include detailed product descriptions' : 'Include product details if mentioned'}
- MINIMUM: Enhanced prompt must be 2-3x longer than original with full technical details
- FAILURE: If response is similar to original, you have FAILED`
      : `**CRITICAL REQUIREMENT - YOU MUST ENHANCE THE PROMPT (MANDATORY):**
- **ABSOLUTE PROHIBITION**: You are FORBIDDEN from returning the original action text unchanged or with minimal modifications
- **MANDATORY ENHANCEMENT**: You MUST transform the basic action text into a comprehensive, detailed, professional prompt
- **EXPANSION REQUIRED**: The enhanced prompt MUST be significantly longer and more detailed than the original action text
- **TECHNICAL DETAILS REQUIRED**: You MUST incorporate all camera movements, lighting details, composition details, hyperrealism requirements, and visual descriptions
- **PRODUCT DETAILS REQUIRED**: ${productImageFile ? 'You MUST analyze the attached product image and include detailed product descriptions (colors, materials, textures, design, appearance) in your enhanced prompt. The product details from the image are MANDATORY.' : 'If product details are mentioned, include them in detail.'}
- **FAILURE CONDITION**: If your response is similar to or identical to the original action text, you have COMPLETELY FAILED the task
- **SUCCESS CONDITION**: Your response must be a complete, professional, detailed prompt that is ready for AI video generation - it should be 3-5x longer than the original action text and include all technical and visual details`;

    // Continuous Action instruction
    const continuousActionInstruction = continuousAction
      ? `\n\n**CRITICAL - CONTINUOUS ACTION - NO CUTS (MANDATORY):**
This scene MUST be filmed as ONE CONTINUOUS SHOT with ABSOLUTELY NO CUTS, NO TRANSITIONS, and NO EDITING. All actions described must happen seamlessly in a single, uninterrupted take:
- **NO CUTS**: The entire scene must be one continuous shot from start to finish
- **NO TRANSITIONS**: No jump cuts, fade transitions, or scene breaks
- **SEAMLESS FLOW**: All actions must flow naturally and continuously without any interruptions
- **SINGLE TAKE**: The camera must record everything in one continuous take
- **NO EDITING**: The video must appear as if it was recorded in one go without any post-production cuts
- **MANDATORY**: The prompt must explicitly state "one continuous shot", "no cuts", "single take", "no transitions", "continuous action", or similar language to ensure no cuts are made`
      : '';

    const enhancementPrompt = `Act as a *Senior Prompt Engineer specializing in AI Hyperrealism and User-Generated Content (UGC)*. Your goal is to transform the basic action idea and user parameters into a single, high-density text prompt, ready for copy-pasting.

${criticalEnhancementSection}

**EXAMPLE OF WHAT NOT TO DO:**
- Original: "mujer muestra sus gomitas de creatina"
- WRONG: "mujer muestra sus gomitas de creatina y dice que las ha estado esperando" (too similar to original)
- CORRECT: A detailed, comprehensive prompt with camera movements, lighting, composition, product details, hyperrealism requirements, etc.

**Main Task:** Enhance, enrich, and condense the [ACTION TEXT TO ENHANCE] by fluently and professionally incorporating all [CAMERA AND LIGHTING DETAILS] along with the following information:
- Main style: ${mainStyle || 'Hyperrealistic UGC, Mobile Aesthetic'}
- Product Focus: ${productFocus || 'Authenticity and Emotional Connection'}
${consistencyRules}${compositionInstructions}${cameraAngleInstructions}${concisenessInstructions}${durationInstructions}${scriptInstructions}${ugcCloseUpInstructions}${lightingInstructions}${productImageInstructions}${referenceImageInstructions}${noDialogueInstructions}${lipSyncInstructions}${voiceoverInstructions}${continuousActionInstruction}

**CRITICAL - PRODUCT REFERENCE IDENTIFICATION AND HANDLING (MANDATORY - NO INVENTING):**
You MUST carefully identify when the action text refers to "the product" vs other items, and NEVER invent product details.

**IDENTIFYING PRODUCT REFERENCES:**
- **Product keywords**: "product", "el producto", "producto", "the product", "using the product", "showing the product", "holding the product", "using the product (mouth tape)", etc.
- **When you see these terms**: They refer to THE PRODUCT that will be shown in the video
- **Other items are NOT the product**: Clothing, furniture, environment, background items, accessories (unless explicitly called "product") are NOT the product
- **MANDATORY**: You MUST identify when "product" is mentioned and distinguish it from other items in the scene

**HANDLING PRODUCT REFERENCES (ABSOLUTE PROHIBITION - NEVER INVENT):**
${productImageFile 
  ? `- **Product image IS attached**: Describe the product based on what you see in the attached product image. Use exact details from the image (colors, materials, textures, design). If the image shows specific characteristics, include them.`
  : productPhotoWillBeAttached
  ? `- **Product image WILL BE ATTACHED to final prompt**: ALWAYS refer to "the product shown in the attached image" or "the attached product image". NEVER invent product details (colors, shapes, materials, types, names). The product image will be attached separately - describe it as "the product from the attached image".`
  : mentionsProduct
  ? `- **Product mentioned in action text but no image attached**: Only use generic references like "the product" or "the product being used". NEVER invent what the product looks like (no colors, shapes, materials, types, names, brands).`
  : `- **CRITICAL - NO PRODUCT MENTIONED**: If the action text does NOT mention "product", "el producto", "producto", or "the product", you MUST NOT add any product references whatsoever. Do NOT mention showing a product, using a product, holding a product, or any product-related actions. Focus ONLY on what is actually described in the action text.`}

**ABSOLUTE PROHIBITION - NEVER INVENT PRODUCT DETAILS:**
- **FORBIDDEN**: Never assume, guess, or invent product characteristics
- **FORBIDDEN**: Never add product names, types, colors, shapes, or materials unless:
  * The action text explicitly states them (e.g., "mouth tape" if action says "using mouth tape"), OR
  * They are visible in an attached product image
- **FORBIDDEN EXAMPLES**: Never say "creatine gummies", "colorful gummies", "bottle", "tan adhesive strip", "small strip", etc. unless explicitly stated in action text or shown in attached image
- **CORRECT APPROACH**: 
  * If action says "showing the product" → Say "showing the product" or "showing the product from the attached image" (if image will be attached)
  * If action says "using the product (mouth tape)" → Say "using the product (mouth tape)" - keep the type mentioned in action, but don't add colors/shapes
  * If action says "holding the product" → Say "holding the product" or "holding the product shown in the attached image" (if image will be attached)
- **MANDATORY**: When action text mentions "product", identify it as THE PRODUCT and refer to it generically or as "the product from the attached image" - NEVER invent visual characteristics

**CRITICAL - CONTENT MODERATION COMPLIANCE (MANDATORY):**
You MUST ensure the generated prompt complies with content moderation policies and will NOT trigger moderation filters:
- **NO harmful content**: Avoid any descriptions that could be interpreted as harmful, violent, dangerous, or inappropriate
- **NO sensitive topics**: Avoid controversial, political, or sensitive subject matter
- **NO explicit content**: Avoid any sexual, adult, or explicit content or references
- **NO illegal activities**: Avoid descriptions of illegal activities, drugs, or harmful substances
- **Safe and appropriate**: All content must be safe, appropriate, and suitable for general audiences
- **Professional tone**: Maintain a professional, clean, and appropriate tone throughout
- **Product-focused**: Keep the focus on the product and its legitimate use cases in a positive, appropriate manner
- **MANDATORY**: If the action text contains any potentially problematic content, adapt it to be safe and appropriate while maintaining the core intent

**CRITICAL DEFAULT INSTRUCTION - CAMERA POSITION (PRIORITIZE HYPERREALISM):**
**DEFAULT BEHAVIOR - HANDHELD SELFIE (PRIORITY):**
By default, the video should look as if the person is **holding the phone/camera themselves** (selfie-style). This means:
- The person is holding the camera/phone and recording themselves while doing the actions
- The person is narrating, talking, and showing things directly to the camera as they perform the actions
- Everything happens from the first-person perspective of the person recording themselves
- The camera angle should be as if the person is holding their phone in front of them, showing themselves${mentionsProduct ? ' and the product' : ''}/actions
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
- **iPhone camera characteristics**: Subtle mobile phone grain, natural iPhone color science, realistic depth of field, authentic exposure characteristics, slight lens distortion typical of iPhone cameras
- **CRITICAL - NO BACKGROUND BLUR (MANDATORY)**: The background MUST be completely sharp and in focus, exactly as iPhone cameras record in vertical/portrait mode. NEVER apply blur, bokeh, shallow depth of field, or any depth-of-field effects to the background. The entire scene (foreground, subject, and background) must be equally sharp and focused, as if recorded with an iPhone in standard camera mode. This is essential for authentic UGC realism - real iPhone recordings in vertical mode keep everything in focus.
- **Real-world imperfections**: Natural motion blur during movement, authentic focus breathing, realistic chromatic aberration in high contrast areas, genuine lens flare when appropriate
- **Environmental authenticity**: Realistic light interaction with surfaces, authentic material response to lighting, genuine atmospheric perspective, natural light scattering
- **CRITICAL - NATURAL CHARACTER EXPRESSIONS AND GESTURES (MANDATORY)**: Characters MUST have natural, organic expressions and gestures that feel completely authentic and human. They must NOT look like robots or static statues:
  - **Natural facial expressions**: Characters must show genuine, varied facial expressions - subtle micro-expressions, natural eye movements, authentic smiles, genuine reactions, natural eyebrow movements, realistic mouth movements when speaking. Expressions should change naturally throughout the scene, not remain frozen or static.
  - **Organic gestures**: Characters must use natural hand gestures, body language, and movements that feel spontaneous and authentic - not robotic or overly rehearsed. Gestures should be varied, natural, and match what real people do when talking, demonstrating, or interacting.
  - **Natural body movement**: Characters should have subtle, natural body movements - slight shifts in weight, natural posture changes, organic head movements, realistic breathing, natural blinking. They must NOT appear frozen, static, or robotic.
  - **Authentic reactions**: Characters must react naturally to what's happening in the scene - genuine surprise, authentic interest, natural engagement, real emotions. Reactions should feel spontaneous and unscripted.
  - **Avoid robotic appearance**: Characters must NEVER look like robots, statues, or static mannequins. They must have the natural fluidity, expressiveness, and organic movement of real human beings. Every expression, gesture, and movement must feel authentic and natural.

**AUTHENTICITY REQUIREMENTS:**
- **Spontaneity**: Natural, unscripted feel
- **Natural handheld camera movements**: Slight shake, imperfect zoom, quick pan - all authentic to iPhone recording
- **Subtle mobile grain**: Authentic iPhone camera grain and noise characteristics
- **Genuine ambient lighting**: Without professional artifices, exactly as iPhone cameras capture real-world lighting
- **Natural character behavior**: Characters must behave like real people - with natural expressions, authentic gestures, organic movements, and genuine reactions. They must NOT appear robotic, static, or artificial.
${hasWalking ? `- **CRITICAL - CONTINUOUS WALKING (MANDATORY)**: Since the action text mentions "walking" or "caminando", the character MUST walk CONTINUOUSLY and NOTABLY throughout the entire scene. The character should NOT stop walking, pause, or become static at any point. The walking must be:
  * **Continuous and steady**: The character walks steadily and continuously from start to finish, not just a few steps then stopping
  * **Clearly visible**: The walking is prominently visible - the character's body moves forward continuously, legs move in natural walking motion, background/environment changes as they move forward
  * **Natural walking pace**: The character walks at a natural, steady pace while speaking, demonstrating, or performing any actions
  * **No static moments**: The character does NOT stop walking to speak or perform actions - they continue walking while doing everything (speaking, demonstrating, interacting with camera)
  * **Background movement**: As the character walks, the background/environment should show continuous movement and change, clearly indicating forward motion throughout the scene
  * **MANDATORY**: The prompt must explicitly describe continuous, notable walking throughout the ENTIRE scene duration - the character is walking while speaking, walking while demonstrating, walking while interacting with the camera. The walking is a continuous, prominent, and visible action from beginning to end, not a brief moment or occasional movement.` : ''}

The goal is to simulate the maximum authenticity and credibility of real-life, non-POV user-generated content with ABSOLUTE HYPERREALISM. The video should be impossible to distinguish from a real iPhone recording. Every shadow, light, texture, and detail must be hyperrealistic and photorealistic. The background must be completely sharp and in focus, just like real iPhone footage in vertical mode. **CRITICAL PROHIBITION - NO TEXT OVERLAY: You MUST NOT include, mention, or suggest ANY text overlay, on-screen text, captions, subtitles, or any text appearing in the video. Text overlays always look bad in generated videos. The prompt must describe ONLY visual elements, actions, camera movements, lighting, and composition - NO TEXT, NO CAPTIONS, NO SUBTITLES, NO ON-SCREEN TEXT OF ANY KIND.**

[ACTION TEXT TO ENHANCE]: ${actionText}${script && script.trim() ? `\n\n[SCRIPT TO INTEGRATE]: ${script}` : ''}

[CAMERA AND LIGHTING DETAILS TO INCORPORATE]:
- Camera composition(s): ${compositionsList}
${cameraAnglesArray.length > 0 ? `- Camera angle(s): ${cameraAnglesArray.join(', ')}` : '- Camera angle: Not specified (use default handheld selfie style)'}
- Lighting/Ambience: ${lighting}
${duration ? `- Scene Duration: ${duration} seconds` : ''}

**FINAL OUTPUT REQUIREMENTS:**
- Respond ONLY with the enhanced text as a single continuous paragraph
- NO line breaks, NO additional explanations, NO special formatting
- The enhanced text MUST be significantly different from and more detailed than: "${actionText}"
- If your response is too similar to the original action text above, you have FAILED
- The enhanced prompt must include: camera movements, lighting details, composition details, product descriptions (if image provided), hyperrealism requirements, visual aesthetics, and all technical specifications
- Minimum length: The enhanced prompt should be at least ${isScene4Plus ? '2-3x' : '3-5x'} longer than the original action text
- ${isScene4Plus ? '**CRITICAL FOR SCENE 4+**: Even though you need to be efficient, you MUST still include ALL technical details. Just express them more compactly. Do NOT skip any details.' : ''}`;

    // Llamar a Gemini 3 Flash Preview
    let result;
    try {
      // Build parts array - include images if provided
      const parts: any[] = [];
      
      if (productImageFile) {
        parts.push({
          fileData: {
            fileUri: productImageFile.uri,
            mimeType: productImageFile.mimeType
          }
        });
      }
      
      if (referenceImageFile) {
        parts.push({
          fileData: {
            fileUri: referenceImageFile.uri,
            mimeType: referenceImageFile.mimeType
          }
        });
      }
      
      parts.push({
        text: enhancementPrompt
      });

      console.log('Sending request to Gemini for prompt enhancement...', {
        model: 'gemini-3-flash-preview',
        partsCount: parts.length,
        hasProductImage: !!productImageFile,
        hasReferenceImage: !!referenceImageFile,
        environment: process.env.NODE_ENV || 'unknown'
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
      
      console.log('Gemini response received:', {
        hasCandidates: !!result.candidates,
        candidatesLength: result.candidates?.length || 0,
        firstCandidateExists: !!result.candidates?.[0],
        resultKeys: Object.keys(result || {}),
        environment: process.env.NODE_ENV || 'unknown'
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

    // Extraer el texto mejorado con múltiples métodos
    let enhancedText = null;
    try {
      // Método 1: Estructura estándar con candidates
      if (result.candidates && result.candidates[0]) {
        const candidate = result.candidates[0];
        
        // Verificar si hay content
        if (candidate.content) {
          // Método 1a: content.parts
          if (candidate.content.parts && Array.isArray(candidate.content.parts)) {
            enhancedText = candidate.content.parts
              .map((part: any) => {
                if (typeof part === 'string') return part;
                if (part.text) return part.text;
                if (part.inlineData) return ''; // Skip inline data
                return '';
              })
              .filter((text: string) => text && text.trim().length > 0)
          .join('')
          .trim();
          }
          
          // Método 1b: content.text (fallback)
          if ((!enhancedText || enhancedText === '') && (candidate.content as any).text) {
            enhancedText = (candidate.content as any).text.trim();
          }
        }
        
        // Método 1c: candidate.text directamente (fallback)
        if ((!enhancedText || enhancedText === '') && (candidate as any).text) {
          enhancedText = (candidate as any).text.trim();
        }
      }
      
      // Método 2: result.text directamente
      if ((!enhancedText || enhancedText === '') && (result as any).text) {
        enhancedText = (result as any).text.trim();
      }
      
      // Método 3: result.response (algunas versiones de la API)
      if ((!enhancedText || enhancedText === '') && (result as any).response) {
        const response = (result as any).response;
        if (response.text) {
          enhancedText = response.text.trim();
        } else if (response.candidates && response.candidates[0]?.content?.parts) {
          enhancedText = response.candidates[0].content.parts
            .map((part: any) => part.text || '')
            .join('')
            .trim();
        }
      }
      
      // Log detallado para debugging
      console.log('Enhanced text extraction result:', {
        hasText: !!enhancedText,
        textLength: enhancedText?.length || 0,
        originalLength: actionText.length,
        textPreview: enhancedText?.substring(0, 200) || 'N/A',
        hasProductImage: !!productImageFile,
        resultStructure: {
          hasCandidates: !!result.candidates,
          candidatesLength: result.candidates?.length || 0,
          firstCandidateStructure: result.candidates?.[0] ? Object.keys(result.candidates[0]) : []
        }
      });
      
      // Verificar si hay bloqueos de seguridad o errores en la respuesta
      if (result.candidates && result.candidates[0]) {
        const candidate = result.candidates[0];
        
        // Verificar finishReason para ver si hay problemas
        if (candidate.finishReason) {
          if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
            console.error('Gemini blocked response due to safety/recitation:', candidate.finishReason);
            return NextResponse.json(
              { 
                error: 'Content was blocked by safety filters',
                details: 'The AI blocked the response. Please try with different content.'
              },
              { status: 500 }
            );
          }
          
          if (candidate.finishReason === 'MAX_TOKENS' || candidate.finishReason === 'OTHER') {
            console.warn('Gemini response finished with reason:', candidate.finishReason);
          }
        }
        
        // Verificar si hay safety ratings que bloqueen
        if (candidate.safetyRatings && Array.isArray(candidate.safetyRatings)) {
          const blockedRatings = candidate.safetyRatings.filter((rating: any) => 
            rating.category && rating.probability === 'HIGH'
          );
          if (blockedRatings.length > 0) {
            console.error('Gemini blocked due to safety ratings:', blockedRatings);
            return NextResponse.json(
              { 
                error: 'Content was blocked by safety filters',
                details: 'The AI blocked the response due to safety concerns. Please try with different content.'
              },
              { status: 500 }
            );
          }
        }
      }
      
      // Si no se obtuvo texto mejorado, loggear la estructura completa para debugging
      if (!enhancedText || enhancedText === '') {
        console.error('CRITICAL: No enhanced text extracted from Gemini response');
        console.error('Environment:', process.env.NODE_ENV || 'unknown');
        console.error('Full result structure:', JSON.stringify(result, null, 2));
        console.error('First candidate structure:', result.candidates?.[0] ? JSON.stringify(result.candidates[0], null, 2) : 'No candidates');
        console.error('Result type:', typeof result);
        console.error('Result constructor:', result?.constructor?.name);
        
        // Intentar extraer cualquier texto disponible para debugging
        const debugInfo: any = {
          hasResult: !!result,
          resultType: typeof result,
          resultKeys: result ? Object.keys(result) : [],
          hasCandidates: !!result?.candidates,
          candidatesLength: result?.candidates?.length || 0,
          environment: process.env.NODE_ENV || 'unknown'
        };
        
        if (result?.candidates?.[0]) {
          const candidate = result.candidates[0];
          debugInfo.candidateKeys = Object.keys(candidate);
          debugInfo.hasContent = !!candidate.content;
          debugInfo.finishReason = candidate.finishReason;
          if (candidate.content) {
            debugInfo.contentKeys = Object.keys(candidate.content);
            debugInfo.hasParts = !!candidate.content.parts;
            debugInfo.partsLength = candidate.content.parts?.length || 0;
            if (candidate.content.parts?.[0]) {
              debugInfo.firstPartType = typeof candidate.content.parts[0];
              debugInfo.firstPartKeys = Object.keys(candidate.content.parts[0] || {});
            }
          }
        }
        
        console.error('Debug info:', JSON.stringify(debugInfo, null, 2));
        
        return NextResponse.json(
          { 
            error: 'Failed to enhance prompt',
            details: 'The AI did not return an enhanced prompt. Please try again.',
            debug: process.env.NODE_ENV === 'development' ? debugInfo : undefined
          },
          { status: 500 }
        );
      } else {
        // Validar que el texto mejorado sea significativamente diferente y más largo
        const originalLength = actionText.length;
        const enhancedLength = enhancedText.length;
        const similarityThreshold = 0.7; // Si más del 70% del texto original está en el mejorado, es demasiado similar
        
        // Calcular similitud simple (cuánto del texto original está contenido en el mejorado)
        const originalWords = actionText.toLowerCase().split(/\s+/);
        const enhancedWords = enhancedText.toLowerCase().split(/\s+/);
        const matchingWords = originalWords.filter((word: string) => enhancedWords.includes(word));
        const similarity = matchingWords.length / originalWords.length;
        
        console.log('Text validation:', {
          originalLength,
          enhancedLength,
          similarity,
          isTooSimilar: similarity > similarityThreshold,
          isTooShort: enhancedLength < originalLength * 1.5
        });
        
        // Validaciones estrictas - siempre validar que el texto mejorado sea diferente y más detallado
        if (enhancedText === actionText || enhancedText.trim() === actionText.trim()) {
          console.error('CRITICAL: Enhanced text is identical to original');
          return NextResponse.json(
            { 
              error: 'Failed to enhance prompt',
              details: 'The AI returned the original text instead of an enhanced prompt. Please try again.'
            },
            { status: 500 }
          );
        }
        
        // Validar que el texto mejorado sea significativamente más largo y detallado
        // For scenes 4+, use a slightly lower threshold (1.2x) since they're more concise
        const minLengthMultiplier = isScene4Plus ? 1.2 : 1.3;
        
        if (enhancedLength < originalLength * minLengthMultiplier) {
          console.error('CRITICAL: Enhanced text is too short');
          return NextResponse.json(
            { 
              error: 'Failed to enhance prompt',
              details: 'The enhanced prompt is too short. It must be significantly longer and more detailed than the original. Please try again.'
            },
            { status: 500 }
          );
        }
        
        // Validaciones adicionales cuando hay imagen de referencia
        if (productImageFile) {
          if (similarity > similarityThreshold && enhancedLength < originalLength * 2) {
            console.error('CRITICAL: Product image provided but enhanced text is too similar to original');
            return NextResponse.json(
              { 
                error: 'Failed to enhance prompt with reference image',
                details: 'The AI returned text that is too similar to the original. The enhanced prompt must be significantly more detailed. Please try again.'
              },
              { status: 500 }
            );
          }
        }
      }
    } catch (err) {
      console.error('Error extracting text from response:', err);
      // Always return error - never use fallback to original text
      return NextResponse.json(
        { 
          error: 'Error processing enhanced prompt',
          details: (err as Error).message || 'Could not extract enhanced text from AI response'
        },
        { status: 500 }
      );
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

    // Credit already consumed in verifyAndConsumeCredit

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

