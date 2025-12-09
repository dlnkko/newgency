import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Get API key from environment variables
const googleApiKey = process.env.GOOGLE_GENAI_API_KEY;

if (!googleApiKey) {
  throw new Error('GOOGLE_GENAI_API_KEY is not set in environment variables. Please add it to your .env file.');
}

const ai = new GoogleGenAI({ 
  apiKey: googleApiKey 
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { actionText, compositions, composition, lighting, duration, mainStyle, productFocus, allScenes, currentSceneIndex } = body;

    // Support both old format (single composition) and new format (array of compositions)
    const compositionArray = compositions || (composition ? [composition] : []);

    if (!actionText || !compositionArray || compositionArray.length === 0 || !lighting) {
      return NextResponse.json(
        { error: 'Action text, at least one composition, and lighting are required' },
        { status: 400 }
      );
    }

    // Extract person and location from first scene if available
    let consistencyRules = '';
    if (allScenes && Array.isArray(allScenes) && allScenes.length > 0 && currentSceneIndex !== undefined) {
      const firstScene = allScenes[0];
      if (firstScene && firstScene.action) {
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

    // Crear prompt para Gemini que mejore el texto con los parámetros de cámara e iluminación
    const compositionsList = compositionArray.length === 1 
      ? compositionArray[0]
      : compositionArray.join(', ');
    
    const compositionInstructions = compositionArray.length > 1
      ? `\n\n**CRITICAL COMPOSITION DISTRIBUTION TASK:**
You have been provided with MULTIPLE camera compositions that should be intelligently distributed throughout the action described. Your task is to analyze the action text and determine WHEN and WHERE each composition should be applied based on the logical flow of the action.

Available compositions:
${compositionArray.map((comp: string, idx: number) => `${idx + 1}. ${comp}`).join('\n')}

**Your job:** Read the action text carefully and identify different moments or phases within the same scene. Then, assign the most appropriate composition to each moment. For example:
- If the action is "person grabs the product and then consumes it", you might use "Everyday Life" for the grabbing moment and "Product in Real Use" for the consumption moment.
- If the action has multiple phases or transitions, distribute the compositions logically across those phases.

**Important:** 
- You must seamlessly transition between compositions within the same continuous scene
- The distribution should feel natural and logical based on the action described
- Incorporate the composition details at the appropriate moments in your enhanced prompt
- Make it clear which composition applies to which part of the action through your descriptive language`
      : '';

    // Get total number of scenes to adjust conciseness
    const totalScenes = allScenes && Array.isArray(allScenes) ? allScenes.length : 1;
    
    // Conciseness instructions based on total scenes
    const concisenessInstructions = totalScenes > 1
      ? `\n\n**CRITICAL CONCISENESS REQUIREMENT:**
This is scene ${currentSceneIndex !== undefined ? currentSceneIndex + 1 : 1} of ${totalScenes} total scenes. You MUST be more concise than usual while maintaining full power and detail:

- **For 2-3 scenes**: Be concise but comprehensive. Use efficient, high-impact language. Combine related details into single phrases. Avoid redundancy. Target: ~100-120 words per scene.

- **For 4-5 scenes**: Be significantly more concise. Use compact, dense descriptions. Merge multiple details into single clauses. Prioritize essential elements. Target: ~70-90 words per scene.

- **For 5+ scenes**: Be extremely concise. Use maximum density. Combine all related information into tight phrases. Focus only on critical visual and narrative elements. Target: ~50-70 words per scene.

**Your task**: Maintain ALL the power, detail, and authenticity requirements, but express them with maximum efficiency. Every word must carry maximum weight. Use compound adjectives, merged clauses, and efficient phrasing. The prompt must be shorter but equally powerful and detailed.`
      : '';

    // Duration-based instructions
    const durationInstructions = duration && duration > 0
      ? `\n\n**CRITICAL DURATION CONSTRAINT:**
This scene has a duration of **${duration} seconds**. You MUST adjust your prompt accordingly:

- **For short durations (1-3 seconds)**: Focus on a single, impactful moment. Use concise, high-impact descriptions. Prioritize the most essential visual elements. Keep the action description tight and focused on one key action or moment.

- **For medium durations (4-10 seconds)**: Balance detail with pacing. Include 2-3 key moments or actions. Allow for natural transitions between actions. Provide enough detail for visual richness without overwhelming the timeframe.

- **For longer durations (11+ seconds)**: You can include more detailed descriptions, multiple actions, transitions, and richer visual storytelling. Include more nuanced details about movements, expressions, and environmental elements. Allow for a more complete narrative arc within the scene.

**Your task**: Adjust the density and pacing of your prompt description to match the ${duration}-second duration. Ensure the action described can realistically unfold within this timeframe. If the action is too complex for the duration, simplify it. If the duration allows for more detail, enrich the description appropriately. The prompt should feel neither rushed (too much action for the time) nor stretched (too little action for the time).`
      : '';

    // Check if "UGC Close-up" is in the compositions
    const hasUgcCloseUp = compositionArray.some((comp: string) => 
      comp.toLowerCase().includes('ugc close') || comp.toLowerCase().includes('close-up')
    );

    // UGC Close-up specific instructions
    const ugcCloseUpInstructions = hasUgcCloseUp
      ? `\n\n**UGC CLOSE-UP MODE (ACTIVE):**
Since "UGC Close-up" composition is selected, you MUST focus the shot on the product or person in extreme close-up detail. Use shallow depth of field, sharp focus on textures and details, natural shaky camera movements typical of mobile close-up shots, and emphasize the intimate, detailed view of the product or person. The close-up should feel authentic and spontaneous, as if someone is naturally zooming in with their iPhone to show details.`
      : `\n\n**UGC SCENE COMPOSITION (NO CLOSE-UP):**
Since "UGC Close-up" is NOT selected, you MUST show the product and person together in the scene as a whole, maintaining a natural wide-to-medium shot that captures the complete scene context. DO NOT focus exclusively on the product or person in close-up. Instead, show them integrated naturally within the environment, maintaining the full scene context. The shot should feel like a natural, casual mobile recording that captures the entire scene organically, as if recorded from the iPhone of the AI avatar. Keep everything visible together in the frame, respecting the natural composition of the scene while maintaining 100% UGC hyperrealism.`;

    const enhancementPrompt = `Act as a *Senior Prompt Engineer specializing in AI Hyperrealism and User-Generated Content (UGC)*. Your goal is to transform the basic action idea and user parameters into a single, high-density text prompt, ready for copy-pasting.

**Main Task:** Enhance, enrich, and condense the [ACTION TEXT TO ENHANCE] by fluently and professionally incorporating all [CAMERA AND LIGHTING DETAILS] along with the following information:
- Main style: ${mainStyle || 'Hyperrealistic UGC, Mobile Aesthetic'}
- Product Focus: ${productFocus || 'Authenticity and Emotional Connection'}
${consistencyRules}${compositionInstructions}${concisenessInstructions}${durationInstructions}${ugcCloseUpInstructions}

The final output must be strictly a single, continuous paragraph, without line breaks, interweaving the action, product focus, technical composition, and visual aesthetics to create a cohesive and powerful instruction. The prompt's focus must ensure the video looks **100% authentic**, as if it were recorded by a real person on their phone (iPhone/Android), emphasizing the **spontaneity, natural handheld camera movements (slight shake, imperfect zoom, quick pan), subtle mobile grain, and genuine ambient lighting without professional artifices**. The goal is to simulate the maximum authenticity and credibility of real-life, non-POV user-generated content.

[ACTION TEXT TO ENHANCE]: ${actionText}

[CAMERA AND LIGHTING DETAILS TO INCORPORATE]:
- Camera composition(s): ${compositionsList}
- Lighting/Ambience: ${lighting}
${duration ? `- Scene Duration: ${duration} seconds` : ''}

Respond ONLY with the enhanced text as a single continuous paragraph, without line breaks, without additional explanations or special formatting.`;

    // Llamar a Gemini 3 Pro Preview
    let result;
    try {
      result = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: enhancementPrompt
              }
            ]
          }
        ]
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

    // Extraer el texto mejorado
    let enhancedText = actionText; // Fallback al texto original
    try {
      if (result.candidates && result.candidates[0]?.content?.parts) {
        enhancedText = result.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('')
          .trim();
      } else if ((result as any).text) {
        enhancedText = (result as any).text.trim();
      }
      
      // Si no se obtuvo texto, usar el original
      if (!enhancedText || enhancedText === '') {
        enhancedText = actionText;
      }
    } catch (err) {
      console.error('Error extracting text from response:', err);
      enhancedText = actionText; // Fallback to original text
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

        // Precios de Gemini 3 Pro Preview (por millón de tokens)
        // Input: $2 por millón (hasta 200k tokens)
        // Output: $12 por millón (hasta 200k tokens)
        const inputCostPerMillion = 2.0;
        const outputCostPerMillion = 12.0;

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

    return NextResponse.json({
      success: true,
      originalText: actionText,
      enhancedText: enhancedText,
      compositions: compositionArray,
      lighting,
      usage: usageInfo,
      cost: costInfo
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

