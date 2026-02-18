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
    const { description, script, duration, mode, autoMode, cameraAngles, cameraMovements, productImage, productPhotoWillBeAttached } = body;

    const isScriptMode = mode === 'automatic' && autoMode === 'script';

    // Validate input based on mode
    if (isScriptMode) {
      if (!script || !script.trim()) {
        return NextResponse.json(
          { error: 'Script is required' },
          { status: 400 }
        );
      }
    } else {
      if (!description || !description.trim()) {
        return NextResponse.json(
          { error: 'Description is required' },
          { status: 400 }
        );
      }
    }

    if (!duration || ![5, 8, 10, 15].includes(duration)) {
      return NextResponse.json(
        { error: 'Duration must be 5, 8, 10, or 15 seconds' },
        { status: 400 }
      );
    }

    const isAutomaticMode = mode === 'automatic';

    // In manual mode, require camera angles and movements
    if (!isAutomaticMode) {
      if (!cameraAngles || cameraAngles.length === 0) {
        return NextResponse.json(
          { error: 'At least one camera angle is required' },
          { status: 400 }
        );
      }

      if (!cameraMovements || cameraMovements.length === 0) {
        return NextResponse.json(
          { error: 'At least one camera movement is required' },
          { status: 400 }
        );
      }
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

    // Build camera angle descriptions
    const cameraAngleDescriptions: Record<string, string> = {
      'low angle': 'Cinematic shot from a lower perspective looking upward, creating a powerful and dominant visual presence.',
      'high angle': 'Cinematic shot from an elevated perspective looking downward, adding vulnerability, scale, or dramatic context.',
      'over-the-shoulder': 'Shot framed from behind a character\'s shoulder, adding depth and immersive storytelling perspective.',
      'wide establishing': 'Wide cinematic frame that reveals environment and spatial context, setting the scene before action.',
      'dutch angle': 'Slightly tilted frame creating tension, unease, or dynamic cinematic energy.',
      'extreme close-up': 'Very tight framing on details like eyes, hands, or product textures to emphasize emotion or realism.'
    };

    // Build camera movement descriptions
    const cameraMovementDescriptions: Record<string, string> = {
      'slow push-in': 'Smooth forward camera movement slowly approaching the subject to build intensity and focus.',
      'tracking shot': 'Camera moves laterally or follows the subject smoothly, maintaining motion while keeping cinematic flow.',
      'orbit shot': 'Camera moves in a circular path around the subject, creating dramatic cinematic emphasis.',
      'tilt up/down': 'Vertical camera movement revealing the subject from bottom to top or top to bottom.',
      'crane / jib motion': 'Elevated sweeping camera movement moving vertically or diagonally for a grand cinematic reveal.',
      'handheld cinematic': 'Subtle controlled handheld motion adding realism and organic cinematic texture without looking amateur.'
    };

    // Available options for automatic mode (including script mode)
    const allCameraAngles = Object.keys(cameraAngleDescriptions);
    const allCameraMovements = Object.keys(cameraMovementDescriptions);

    let selectedAngles = '';
    let selectedMovements = '';

    if (isAutomaticMode || isScriptMode) {
      // In automatic mode (describe or script), list all available options for the AI to choose from
      selectedAngles = allCameraAngles.map((angle: string) => {
        const desc = cameraAngleDescriptions[angle];
        return `- **${angle}**: ${desc}`;
      }).join('\n');

      selectedMovements = allCameraMovements.map((movement: string) => {
        const desc = cameraMovementDescriptions[movement];
        return `- **${movement}**: ${desc}`;
      }).join('\n');
    } else {
      // In manual mode, use the selected options
      selectedAngles = cameraAngles.map((angle: string) => {
        const desc = cameraAngleDescriptions[angle] || angle;
        return `- **${angle}**: ${desc}`;
      }).join('\n');

      selectedMovements = cameraMovements.map((movement: string) => {
        const desc = cameraMovementDescriptions[movement] || movement;
        return `- **${movement}**: ${desc}`;
      }).join('\n');
    }

    const generationPrompt = isScriptMode ? `You are an expert AI prompt engineer specializing in hyperrealistic cinematic video prompts. Analyze the script and generate a SINGLE PARAGRAPH prompt with multiple B-roll scene cuts that complement the script.

**User's Script:**
${script}

**Video Duration:** ${duration} seconds

**Available Camera Angles (choose 2-4 that best fit the script's narrative):**
${selectedAngles}

**Available Camera Movements (choose 2-4 that best fit the script's narrative):**
${selectedMovements}

**CRITICAL REQUIREMENTS:**
1. Generate a SINGLE CONTINUOUS PARAGRAPH (no line breaks, no bullet points, no sections)
2. Include MANDATORY scene cuts/transitions for different B-roll moments (e.g., "Scene 1: [description]... Scene 2: [description]... Scene 3: [description]")
3. Each scene cut must specify: visual description, camera angle, camera movement, lighting, and timing
4. Everything must be HYPERREALISTIC CINEMATIC quality - photorealistic textures, professional lighting, cinematic color grading, 8K resolution aesthetic
5. Use 2-4 camera angles and 2-4 camera movements strategically distributed across scenes
6. Each B-roll scene should visually support the script's narrative without repeating dialogue
7. Flow naturally with the script's pacing - scenes should align with script moments
8. NO introductory phrases like "This is a prompt" or "Here is the prompt" - start directly with the first scene description
9. Write in a flowing, cinematic language that reads as one continuous narrative paragraph

**OUTPUT FORMAT:**
Respond with ONLY the prompt text in a single paragraph. Start immediately with "Scene 1:" or the first visual description. No explanations, no meta-commentary, just the prompt.` : `You are an expert AI prompt engineer specializing in hyperrealistic cinematic video prompts. Generate a SINGLE PARAGRAPH prompt based on the user's description.

**User's Request:**
${description}

**Video Duration:** ${duration} seconds

${isAutomaticMode ? `**Available Camera Angles (choose 2-4 that best fit the description):**
${selectedAngles}

**Available Camera Movements (choose 2-4 that best fit the description):**
${selectedMovements}

**IMPORTANT - Automatic Mode:** Intelligently select 2-4 camera angles and 2-4 camera movements that best enhance the storytelling.` : `**Selected Camera Angles (use intelligently throughout the video):**
${selectedAngles}

**Selected Camera Movements (use intelligently throughout the video):**
${selectedMovements}

**IMPORTANT - Manual Mode:** Use the selected camera angles and movements strategically throughout the video.`}

${productImageFile ? '**Product Image:** You have access to a product image. Analyze it carefully and incorporate its visual details (colors, materials, textures, design, branding) into the prompt.' : ''}

**CRITICAL REQUIREMENTS:**

1. **Professional Cinematic Quality**: High production value with professional lighting, cinematic color grading, smooth camera work, professional depth of field, and cinematic composition.

2. **Intelligent Camera Angle Distribution**: ${isScriptMode ? 'Select and use 2-4 camera angles strategically throughout the ${duration}-second video based on what best fits the script\'s narrative and enhances the B-roll scenes.' : isAutomaticMode ? 'Select and use 2-4 camera angles strategically throughout the ${duration}-second video based on what best fits the description.' : 'Use the selected camera angles strategically throughout the ${duration}-second video.'} Each angle should serve a narrative purpose. Transition between angles smoothly and logically. Match angles to the action and mood of each moment.

3. **Intelligent Camera Movement Distribution**: ${isScriptMode ? 'Select and use 2-4 camera movements strategically throughout the ${duration}-second video based on what best fits the script\'s narrative and enhances the B-roll scenes.' : isAutomaticMode ? 'Select and use 2-4 camera movements strategically throughout the ${duration}-second video based on what best fits the description.' : 'Use the selected camera movements strategically throughout the ${duration}-second video.'} Each movement should enhance the storytelling. Movements should feel natural and purposeful. Combine movements with angles for maximum cinematic impact.

4. **Duration Management**: The video must be exactly ${duration} seconds. Pace the action and camera work to fit the duration. Ensure smooth transitions between different angles and movements. Create a cohesive narrative arc within the time constraint.

5. **Cinematic Lighting**: Use dramatic, professional lighting. Create depth with shadows and highlights. Consider mood and atmosphere. Professional color temperature and color grading.

6. **Professional Composition**: Use rule of thirds and other cinematic composition principles. Create visual interest and depth. Frame subjects professionally. Consider foreground, midground, and background elements.

**OUTPUT FORMAT - CRITICAL:**
- Respond ONLY with the video prompt itself
- DO NOT include any introductory text like "This is a prompt..." or "Here is the prompt..."
- DO NOT include explanations or meta-commentary
- Start directly with the scene description
- The prompt should be detailed, specific, and ready to use directly in AI video generation tools
- Include: scene description with cinematic details, camera angles and when/how to use them, camera movements and when/how to use them, lighting specifications, composition details, timing and pacing for the ${duration}-second duration
- Make it comprehensive, professional, and optimized for cinematic video generation
- Write in English`;

    // Build parts array
    const parts: any[] = [];
    
    if (productImageFile && productPhotoWillBeAttached) {
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

    console.log('Sending request to Gemini for cinematic prompt generation...');
    const result = await ai.models.generateContent({
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
      candidatesLength: result.candidates?.length,
      firstCandidate: result.candidates?.[0] ? 'exists' : 'missing'
    });

    // Extract the generated prompt
    let generatedText = '';
    if (result.candidates && result.candidates[0]?.content?.parts) {
      generatedText = result.candidates[0].content.parts
        .map((part: any) => part.text || '')
        .join('')
        .trim();
    } else if ((result as any).text) {
      generatedText = (result as any).text.trim();
    }

    console.log('Extracted prompt length:', generatedText.length);
    console.log('First 200 chars of generated prompt:', generatedText.substring(0, 200));

    if (!generatedText) {
      console.error('No prompt generated - result structure:', JSON.stringify(result, null, 2));
      return NextResponse.json(
        { error: 'Failed to generate prompt - no content returned from AI' },
        { status: 500 }
      );
    }

    // Clean up the prompt - remove any introductory text and format as single paragraph
    // Remove common introductory phrases
    const introPhrases = [
      /^this is a (professional )?cinematic (video )?prompt[:\s]*/i,
      /^here is (the|a) (professional )?cinematic (video )?prompt[:\s]*/i,
      /^here's (the|a) (professional )?cinematic (video )?prompt[:\s]*/i,
      /^below is (the|a) (professional )?cinematic (video )?prompt[:\s]*/i,
      /^the following is (a )?(professional )?cinematic (video )?prompt[:\s]*/i,
      /^to complement (your|the)[^\n]{0,100}:\s*/i,
      /^este es (un )?prompt (cinematográfico|profesional)[:\s]*/i,
      /^aquí está (el|un) prompt (cinematográfico|profesional)[:\s]*/i,
      /^este prompt (es|está diseñado)[:\s]*/i,
      /^prompt (cinematográfico|profesional)[:\s]*/i,
      /^cinematic (video )?prompt[:\s]*/i,
      /^video prompt[:\s]*/i,
      /^prompt[:\s]*/i,
      /^---+\s*/,
      /^===+\s*/,
      /^#+\s*(Cinematic|Video|Prompt|B-roll)[:\s]*/i,
      /^###\s*/,
      /^\*\*\*[^\*]+\*\*\*/,
    ];

    // Remove introductory phrases
    for (const phrase of introPhrases) {
      generatedText = generatedText.replace(phrase, '').trim();
    }

    // Remove section headers and formatting
    generatedText = generatedText.replace(/^###\s+[^\n]+\n/gi, '');
    generatedText = generatedText.replace(/^\*\*\*[^\*]+\*\*\*\s*\n/gi, '');
    generatedText = generatedText.replace(/^##\s+[^\n]+\n/gi, '');
    generatedText = generatedText.replace(/^#\s+[^\n]+\n/gi, '');

    // Convert to single paragraph - remove line breaks and extra spaces
    generatedText = generatedText.replace(/\n\s*\n/g, ' '); // Replace double line breaks with space
    generatedText = generatedText.replace(/\n/g, ' '); // Replace single line breaks with space
    generatedText = generatedText.replace(/\s+/g, ' '); // Replace multiple spaces with single space
    generatedText = generatedText.trim();

    // Remove any text before the first meaningful content (scene description, etc.)
    // Look for common starting patterns
    const meaningfulStarters = [
      /^(scene|shot|video|cinematic|professional|a |an |the )/i,
      /^(high-end|high quality|professional|cinematic)/i,
    ];

    // If the text doesn't start with a meaningful pattern, try to find where the actual prompt begins
    let foundMeaningfulStart = false;
    for (const starter of meaningfulStarters) {
      if (starter.test(generatedText)) {
        foundMeaningfulStart = true;
        break;
      }
    }

    // If we didn't find a meaningful start, try to find the first sentence that looks like a prompt
    if (!foundMeaningfulStart) {
      // Look for patterns like "A [adjective] [noun]" or "Scene:" or "Shot:"
      const promptPattern = /(?:^|\n)((?:Scene|Shot|Video|A |An |The |High-end|Professional|Cinematic)[^\n]{20,})/i;
      const match = generatedText.match(promptPattern);
      if (match && match.index !== undefined) {
        generatedText = generatedText.substring(match.index).trim();
      }
    }

    // Final cleanup - remove any remaining meta-commentary at the start
    generatedText = generatedText.replace(/^(?:This|Here|Below|The following|Este|Aquí)[^\n]{0,100}:\s*/i, '');
    generatedText = generatedText.trim();

    // Validate that the generated prompt is not just the input description/script
    if (!isScriptMode && description) {
      const descriptionLower = description.toLowerCase().trim();
      const promptLower = generatedText.toLowerCase().trim();
      
      // Check if the generated prompt is too similar to the input (likely means AI just echoed the input)
      if (promptLower.includes(descriptionLower) && promptLower.length < descriptionLower.length * 2) {
        console.error('Generated prompt appears to be just the input description. Prompt:', generatedText.substring(0, 200));
        return NextResponse.json(
          { error: 'AI returned input instead of generating prompt. Please try again.' },
          { status: 500 }
        );
      }
    } else if (isScriptMode && script) {
      const scriptLower = script.toLowerCase().trim();
      const promptLower = generatedText.toLowerCase().trim();
      
      // Check if the generated prompt is too similar to the input script
      if (promptLower.includes(scriptLower) && promptLower.length < scriptLower.length * 2) {
        console.error('Generated prompt appears to be just the input script. Prompt:', generatedText.substring(0, 200));
        return NextResponse.json(
          { error: 'AI returned input instead of generating prompt. Please try again.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      prompt: generatedText
    });
  } catch (error: any) {
    console.error('Error generating cinematic video prompt:', error);
    
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'API configuration error. Please check your environment variables.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate cinematic video prompt' },
      { status: 500 }
    );
  }
}

