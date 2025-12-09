import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

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
    // Initialize AI client at runtime
    const ai = getGoogleGenAI();
    
    const body = await request.json();
    const { staticAdImage, productImage, copywriting, isUrlScraped } = body;

    // Log input data for debugging
    console.log('=== GENERATE STATIC AD PROMPT REQUEST ===');
    console.log('Input received:');
    console.log('- Has static ad image:', !!staticAdImage);
    console.log('- Has product image:', !!productImage);
    console.log('- Has copywriting:', !!copywriting);
    console.log('- Is URL scraped:', isUrlScraped);
    
    // Parse scraped data if it's a JSON string
    let scrapedSummary = null;
    let scrapedBranding = null;
    if (isUrlScraped && copywriting) {
      try {
        const scrapedData = JSON.parse(copywriting);
        scrapedSummary = scrapedData.summary || null;
        scrapedBranding = scrapedData.branding || null;
        console.log('- Scraped summary length:', scrapedSummary?.length || 0);
        console.log('- Has branding data:', !!scrapedBranding);
        if (scrapedBranding) {
          console.log('- Branding colors:', scrapedBranding.colors ? Object.keys(scrapedBranding.colors) : 'none');
          console.log('- Branding typography:', scrapedBranding.typography ? 'yes' : 'no');
        }
      } catch (e) {
        // If not JSON, treat as plain summary
        scrapedSummary = copywriting;
        console.log('- Copywriting length:', copywriting.length);
        console.log('- Copywriting preview:', copywriting.substring(0, 200) + '...');
      }
    } else if (copywriting) {
      console.log('- Copywriting length:', copywriting.length);
      console.log('- Copywriting preview:', copywriting.substring(0, 200) + '...');
    }

    if (!staticAdImage || !productImage) {
      return NextResponse.json(
        { error: 'Both static ad image and product image are required' },
        { status: 400 }
      );
    }

    // Convert base64 to Buffer
    const staticAdBuffer = Buffer.from(staticAdImage.split(',')[1], 'base64');
    const productBuffer = Buffer.from(productImage.split(',')[1], 'base64');

    // Determine MIME types
    const staticAdMime = staticAdImage.split(';')[0].split(':')[1] || 'image/png';
    const productMime = productImage.split(';')[0].split(':')[1] || 'image/png';

    // Upload images to Gemini Files
    console.log('Uploading images to Gemini Files...');
    let staticAdFile, productFile;

    try {
      // Upload static ad image
      const staticAdUint8Array = new Uint8Array(staticAdBuffer);
      const staticAdBlob = new Blob([staticAdUint8Array], { type: staticAdMime });
      staticAdFile = await ai.files.upload({
        file: staticAdBlob,
        config: { mimeType: staticAdMime }
      });
      console.log('Static ad uploaded:', staticAdFile.uri);

      // Upload product image
      const productUint8Array = new Uint8Array(productBuffer);
      const productBlob = new Blob([productUint8Array], { type: productMime });
      productFile = await ai.files.upload({
        file: productBlob,
        config: { mimeType: productMime }
      });
      console.log('Product image uploaded:', productFile.uri);
    } catch (uploadError: any) {
      console.error('Error uploading images:', uploadError);
      return NextResponse.json(
        { error: 'Error uploading images to Gemini', details: uploadError.message },
        { status: 500 }
      );
    }

    // Wait for files to be ACTIVE
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
      const staticAdFileName = staticAdFile.name || staticAdFile.uri?.split('/').pop() || '';
      const productFileName = productFile.name || productFile.uri?.split('/').pop() || '';
      
      if (!staticAdFileName || !productFileName) {
        return NextResponse.json(
          { error: 'Failed to get file identifiers' },
          { status: 500 }
        );
      }
      
      staticAdFile = await waitForFile(staticAdFile, staticAdFileName);
      productFile = await waitForFile(productFile, productFileName);
      
      // Verify files have required properties
      if (!staticAdFile.uri || !productFile.uri) {
        return NextResponse.json(
          { error: 'Files are missing required URI properties' },
          { status: 500 }
        );
      }
    } catch (waitError: any) {
      return NextResponse.json(
        { error: 'Error waiting for files to be ready', details: waitError.message },
        { status: 500 }
      );
    }

    // Step 1: Generate the detailed prompt that would recreate the static ad image
    console.log('Step 1: Generating detailed prompt for reference static ad...');
    const staticAdAnalysisPrompt = `You are an expert prompt engineer for AI image generation. Analyze the provided static ad image and generate a COMPREHENSIVE, DETAILED prompt that would recreate this EXACT image.

Your task:

1. **Identify Copywriting Characteristics** (for later adaptation):
    - Count the EXACT number of words in the main headline/copywriting text
    - Identify the rhetorical figure used (metaphor, personification, hyperbole, analogy, slogan, motivational, aspirational, etc.)
    - Note the tone (friendly, professional, playful, serious, etc.)
    - Note the style category (corto y persuasivo, humor, irónico, directo, emocional, etc.)

2. **Generate a DETAILED Prompt** that recreates EVERY visual element:
    - EXACT composition and layout (where every element is positioned: person, product, text, buttons, etc.)
    - EXACT colors (background, foreground, text, accents - specific shades, gradients, hex codes if visible)
    - EXACT typography (font styles, sizes, weights, exact text placement, alignment, effects like shadows/outlines)
    - EXACT background (style, colors, gradients, visual elements like silhouettes, blur effects, particles)
    - EXACT product/subject presentation (positioning, angles, lighting, shadows, number of products)
    - EXACT person/character (if present: pose, expression, clothing, placement, interaction with product)
    - EXACT visual effects (lighting style, shadows, highlights, reflections, gradients, filters)
    - EXACT buttons/CTAs (if present: style, colors, typography, placement)
    - EXACT overall aesthetic and mood

The prompt must be so detailed that it would generate an IDENTICAL image to the reference ad.

Format your response EXACTLY as:
**COPYWRITING ANALYSIS:**
- Word Count: [exact number]
- Rhetorical Figure: [primary figure: metaphor/personification/hyperbole/analogy/slogan/motivational/aspirational/other]
- Tone: [tone]
- Style: [style category]

**REFERENCE AD PROMPT:**
[Generate a COMPREHENSIVE, EXTREMELY DETAILED prompt that would recreate this exact static ad. Include ALL visual elements: composition, colors, typography with exact text placement, background, product presentation, person/character (if present), lighting, shadows, effects, buttons (if present). The prompt should be ready to use in an AI image generator and would produce an identical image.]`;

    let staticAdAnalysis;
    try {
      staticAdAnalysis = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
          {
            role: 'user',
            parts: [
              {
                fileData: {
                  fileUri: staticAdFile.uri,
                  mimeType: staticAdFile.mimeType
                }
              },
              {
                text: staticAdAnalysisPrompt
              }
            ]
          }
        ]
      });
    } catch (analysisError: any) {
      console.error('Error analyzing static ad:', analysisError);
      return NextResponse.json(
        { error: 'Error analyzing static ad', details: analysisError.message },
        { status: 500 }
      );
    }

        // Extract reference prompt and copywriting analysis
    let analysisText = '';
    let referencePrompt = '';
    let copywritingProfile = null;
    let rhetoricalFigures = null;
    let step1Usage = null;
    let step1Cost = null;
    try {
      if (staticAdAnalysis.candidates && staticAdAnalysis.candidates[0]?.content?.parts) {
        analysisText = staticAdAnalysis.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('');

        console.log('\n=== STEP 1 OUTPUT: REFERENCE AD PROMPT GENERATED ===');
        console.log('Full analysis:', analysisText);

        // Extract copywriting analysis
        const copywritingAnalysisMatch = analysisText.match(/\*\*COPYWRITING ANALYSIS:\*\*\s*([\s\S]*?)(?=\*\*REFERENCE AD PROMPT:\*\*|$)/i);
        if (copywritingAnalysisMatch) {
          const analysisText2 = copywritingAnalysisMatch[1];
          const wordCountMatch = analysisText2.match(/Word Count:\s*(\d+)/i);
          const rhetoricalMatch = analysisText2.match(/Rhetorical Figure:\s*(.+)/i);
          const toneMatch = analysisText2.match(/Tone:\s*(.+)/i);
          const styleMatch = analysisText2.match(/Style:\s*(.+)/i);

          copywritingProfile = {
            wordCount: wordCountMatch ? parseInt(wordCountMatch[1]) : null,
            tone: toneMatch ? toneMatch[1].trim() : null,
            styleCategory: styleMatch ? styleMatch[1].trim() : null,
          };

          rhetoricalFigures = {
            primary: rhetoricalMatch ? rhetoricalMatch[1].trim() : null,
          };

          console.log('\n=== COPYWRITING ANALYSIS EXTRACTED ===');
          console.log('Word Count:', copywritingProfile.wordCount);
          console.log('Rhetorical Figure:', rhetoricalFigures.primary);
          console.log('Tone:', copywritingProfile.tone);
          console.log('Style:', copywritingProfile.styleCategory);
        }

        // Extract the reference ad prompt
        const referencePromptMatch = analysisText.match(/\*\*REFERENCE AD PROMPT:\*\*\s*([\s\S]*?)$/i);
        if (referencePromptMatch) {
          referencePrompt = referencePromptMatch[1].trim();
          console.log('\n=== REFERENCE AD PROMPT EXTRACTED ===');
          console.log('Prompt length:', referencePrompt.length);
          console.log('Prompt preview:', referencePrompt.substring(0, 500) + '...');
        } else {
          console.warn('⚠️  REFERENCE AD PROMPT NOT FOUND');
          // Fallback: use the full analysis text if format is different
          referencePrompt = analysisText;
        }

        // Extract usage info for Step 1
        const step1UsageMetadata = (staticAdAnalysis as any).usageMetadata;
        if (step1UsageMetadata) {
          const promptTokens = step1UsageMetadata.promptTokenCount || 0;
          const candidatesTokens = step1UsageMetadata.candidatesTokenCount || 0;
          const totalTokens = step1UsageMetadata.totalTokenCount || (promptTokens + candidatesTokens);
          
          const inputCostPerMillion = 2.0;
          const outputCostPerMillion = 12.0;
          const inputCost = (promptTokens / 1_000_000) * inputCostPerMillion;
          const outputCost = (candidatesTokens / 1_000_000) * outputCostPerMillion;
          const totalStep1Cost = inputCost + outputCost;

          step1Usage = {
            promptTokenCount: promptTokens,
            candidatesTokenCount: candidatesTokens,
            totalTokenCount: totalTokens
          };

          step1Cost = {
            inputCost,
            outputCost,
            totalCost: totalStep1Cost,
            inputCostFormatted: `$${inputCost.toFixed(6)}`,
            outputCostFormatted: `$${outputCost.toFixed(6)}`,
            totalCostFormatted: `$${totalStep1Cost.toFixed(6)}`
          };

          console.log('\n=== STEP 1 COST ===');
          console.log('Tokens:', step1Usage);
          console.log('Cost:', step1Cost);
        }
      }
    } catch (err) {
      console.error('Error extracting analysis:', err);
    }

    // Step 2: Adapt the reference prompt for the new product
    console.log('\n=== STEP 2: ADAPTING REFERENCE PROMPT FOR NEW PRODUCT ===');
    console.log('Input data:');
    console.log('- Reference prompt length:', referencePrompt.length);
    console.log('- Has scraped summary:', !!scrapedSummary);
    console.log('- Has scraped branding:', !!scrapedBranding);
    console.log('- Word count:', copywritingProfile?.wordCount);
    console.log('- Rhetorical figure:', rhetoricalFigures?.primary);
    console.log('- Tone:', copywritingProfile?.tone);
    console.log('- Style:', copywritingProfile?.styleCategory);
    
    if (scrapedBranding) {
      console.log('- Branding colors available:', scrapedBranding.colors ? Object.keys(scrapedBranding.colors).join(', ') : 'none');
      console.log('- Branding typography available:', scrapedBranding.typography ? 'yes' : 'no');
      console.log('- Branding fonts:', scrapedBranding.fonts ? scrapedBranding.fonts.map((f: any) => f.family || f.name).join(', ') : 'none');
    }
    
    if (isUrlScraped && copywriting) {
      console.log('- Scraped data length:', copywriting.length);
      console.log('- Scraped data preview:', copywriting.substring(0, 300) + '...');
    }

    // Build branding integration instructions
    let brandingIntegration = '';
    if (scrapedBranding) {
      const brandColors = scrapedBranding.colors || {};
      const colorList = Object.entries(brandColors)
        .map(([key, value]: [string, any]) => {
          if (typeof value === 'string') {
            return `${key}: ${value}`;
          } else if (value && typeof value === 'object' && value.value) {
            return `${key}: ${value.value}`;
          }
          return `${key}: ${JSON.stringify(value)}`;
        })
        .filter(Boolean)
        .join(', ');
      
      const typographyInfo = scrapedBranding.typography || {};
      const fontsInfo = scrapedBranding.fonts || [];
      const fontList = fontsInfo
        .map((f: any) => f.family || f.name || f)
        .filter(Boolean)
        .join(', ');

      brandingIntegration = `**Brand Integration:**
Use the following branding elements from the product page:
${colorList ? `- Product Brand Colors: ${colorList} (integrate these colors into the design where appropriate, especially for product elements and accents)` : ''}
${typographyInfo.fontFamilies || fontList ? `- Product Brand Typography: ${typographyInfo.fontFamilies || fontList} (consider using these fonts for product text or headlines if they fit the design aesthetic)` : ''}
${typographyInfo.fontSizes ? `- Brand Font Sizes: ${JSON.stringify(typographyInfo.fontSizes)}` : ''}
Integrate these brand elements while maintaining the reference ad's overall design structure and composition.`;
      
      console.log('\n🎨 Branding integration instructions created');
    }

    // Build copywriting creation instructions
    let copywritingInstructions = '';
    if (isUrlScraped && scrapedSummary && copywritingProfile && rhetoricalFigures) {
      // Use scraped data to create copywriting with same rhetorical figure
      copywritingInstructions = `**Copywriting Creation (CRITICAL):**
Using the EXACT scraped product page information below, create copywriting that:
- Uses the same rhetorical figure: "${rhetoricalFigures.primary || 'match style'}"
- Maintains the same tone: "${copywritingProfile.tone || 'professional'}"
- Matches the same style: "${copywritingProfile.styleCategory || 'persuasive'}"
- EXACT word count: ${copywritingProfile.wordCount || 10} words (target: ${copywritingProfile.wordCount ? copywritingProfile.wordCount - 2 : 8} to ${copywritingProfile.wordCount ? copywritingProfile.wordCount + 2 : 12} words)

**Scraped Product Page Data (use this EXACT information - do not summarize):**
${scrapedSummary}

Reformulate this product information into copywriting using the SAME rhetorical approach as the reference ad. Apply the same literary/rhetorical device (${rhetoricalFigures.primary || 'style'}) to create compelling copywriting about the product.`;
      
      console.log('\n📝 Creating copywriting from scraped data with rhetorical figure');
    } else if (copywriting && !isUrlScraped) {
      // Manual copywriting provided
      copywritingInstructions = `**Copywriting:**
Use this exact copywriting in the prompt: "${copywriting}"`;
      console.log('\n📝 Using manual copywriting');
    } else {
      copywritingInstructions = `**Copywriting:**
Create copywriting matching the reference style:
- Rhetorical figure: ${rhetoricalFigures?.primary || 'match reference'}
- Tone: ${copywritingProfile?.tone || 'professional'}
- Style: ${copywritingProfile?.styleCategory || 'persuasive'}
- Word count: ${copywritingProfile?.wordCount || 10} words`;
      console.log('\n📝 Creating copywriting from profile only');
    }

    const finalPromptGeneration = `You are an expert prompt engineer. You have been given:

1. A DETAILED prompt that recreates the reference static ad design
2. An image of a NEW product that needs to replace the product in the reference ad
${isUrlScraped && scrapedSummary ? '3. Scraped product page information (summary and branding)' : ''}

**Reference Ad Prompt (use this as the base structure - maintain ALL design elements):**
${referencePrompt}

**Your Task:**
Adapt the reference prompt above to create a NEW prompt for the product in the provided image. The new prompt must:

1. **Analyze Product Context (CRITICAL):**
   - Analyze the product image to understand: product type, category, purpose, target audience, industry
   - Determine if visual elements from reference need contextual adaptation
   - **Contextual Adaptation Examples:**
     * If reference ad is fitness/gym themed but new product is cosmetics/beauty (e.g., lipstick): adapt background to beauty/skincare context (elegant, soft, beauty-focused), adapt person styling to beauty-focused look (makeup, elegant pose), adapt setting to beauty/photography studio
     * If reference ad is tech/electronics but product is food/beverage: adapt background to food/kitchen context, adapt person to food lifestyle
     * If reference ad is sports but product is fashion: adapt background to fashion/photography context, adapt person styling to fashion-forward
   - Always maintain the EXACT same design structure, composition, and layout from reference
   - Only adapt the contextual elements (background setting, person styling, visual theme) to match the product category appropriately
   - Keep all visual design principles, effects, and aesthetics consistent

2. **Maintain ALL design elements** from the reference prompt:
   - Keep the EXACT same composition structure
   - Keep the EXACT same layout and positioning of all elements
   - Keep the EXACT same visual effects (lighting style, shadows, effects)
   - Keep the EXACT same person/character presentation style (if applicable - but adapt contextually as needed)
   - Keep the EXACT same buttons/CTAs design and placement (if applicable)
   - Keep the EXACT same typography placement and text positioning

3. **Adapt Colors and Typography:**
${scrapedBranding ? brandingIntegration : '- Use reference colors and typography, but adapt product-specific elements'}
${scrapedBranding ? '- Integrate product brand colors from branding data where appropriate (product elements, accents, highlights)' : ''}
${scrapedBranding ? '- Consider using product brand typography if it fits the design aesthetic (for product text or headlines)' : ''}
- Maintain reference color palette for background and overall design
- Use brand colors strategically for product elements and accents

4. **Replace/Adapt product references:**
   - Analyze the product image: type, category, colors, branding, shape, characteristics
   - Replace product descriptions with the NEW product from the provided image
   - If reference shows person holding product: show person holding NEW product the SAME way
   - If reference shows multiple products: show multiple instances of NEW product in SAME arrangement
   - Maintain same angles, lighting, shadows as reference but for NEW product
   - Adapt visual context (background, setting, person styling) to match the NEW product's category if needed

5. **Create Copywriting:**
${copywritingInstructions}

**Output:**
Provide ONLY the final, complete, EXTREMELY DETAILED prompt ready for AI image generation. The prompt should:
- Maintain ALL visual design elements from the reference prompt (composition, layout, typography placement, background style, effects)
- Adapt contextual elements (background setting, person styling) to match the NEW product's category appropriately
- Feature the NEW product from the provided image
${scrapedBranding ? '- Integrate product brand colors and typography where appropriate' : ''}
- Include the new copywriting (${copywritingProfile?.wordCount || 10} words)
- Be ready to copy and paste into Nano Banana Pro or similar AI image generators
- Do NOT include explanations, analysis, or additional text - ONLY the final detailed prompt`;

    let finalPrompt;
    let productAdaptation;
    try {
      productAdaptation = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
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
                text: finalPromptGeneration
              }
            ]
          }
        ]
      });

      // Extract final prompt
      if (productAdaptation.candidates && productAdaptation.candidates[0]?.content?.parts) {
        finalPrompt = productAdaptation.candidates[0].content.parts
          .map((part: any) => part.text || '')
          .join('')
          .trim();

        console.log('\n=== STEP 2 OUTPUT: FINAL PROMPT ===');
        console.log('Final prompt length:', finalPrompt.length);
        console.log('Final prompt preview:', finalPrompt.substring(0, 500) + '...');
      }
    } catch (adaptationError: any) {
      console.error('Error adapting prompt:', adaptationError);
      return NextResponse.json(
        { error: 'Error adapting prompt for product', details: adaptationError.message },
        { status: 500 }
      );
    }

    if (!finalPrompt) {
      return NextResponse.json(
        { error: 'Failed to generate prompt' },
        { status: 500 }
      );
    }

    // Extract usage information for Step 2
    let step2Usage = null;
    let step2Cost = null;
    try {
      const usageMetadata = (productAdaptation as any).usageMetadata;
      if (usageMetadata) {
        const promptTokenCount = usageMetadata.promptTokenCount || 0;
        const candidatesTokenCount = usageMetadata.candidatesTokenCount || 0;
        const totalTokenCount = usageMetadata.totalTokenCount || (promptTokenCount + candidatesTokenCount);

        const inputCostPerMillion = 2.0;
        const outputCostPerMillion = 12.0;

        const inputCost = (promptTokenCount / 1_000_000) * inputCostPerMillion;
        const outputCost = (candidatesTokenCount / 1_000_000) * outputCostPerMillion;
        const totalCost = inputCost + outputCost;

        step2Usage = {
          promptTokenCount,
          candidatesTokenCount,
          totalTokenCount
        };

        step2Cost = {
          inputCost,
          outputCost,
          totalCost,
          inputCostFormatted: `$${inputCost.toFixed(6)}`,
          outputCostFormatted: `$${outputCost.toFixed(6)}`,
          totalCostFormatted: `$${totalCost.toFixed(6)}`
        };

        console.log('\n=== STEP 2 COST ===');
        console.log('Tokens:', step2Usage);
        console.log('Cost:', step2Cost);
      }
    } catch (err) {
      console.error('Error extracting usage information:', err);
    }

    // Calculate total costs
    const totalUsage = {
      step1: step1Usage,
      step2: step2Usage,
      total: {
        promptTokenCount: (step1Usage?.promptTokenCount || 0) + (step2Usage?.promptTokenCount || 0),
        candidatesTokenCount: (step1Usage?.candidatesTokenCount || 0) + (step2Usage?.candidatesTokenCount || 0),
        totalTokenCount: (step1Usage?.totalTokenCount || 0) + (step2Usage?.totalTokenCount || 0),
      }
    };

    const totalCost = {
      step1: step1Cost,
      step2: step2Cost,
      total: {
        inputCost: (step1Cost?.inputCost || 0) + (step2Cost?.inputCost || 0),
        outputCost: (step1Cost?.outputCost || 0) + (step2Cost?.outputCost || 0),
        totalCost: (step1Cost?.totalCost || 0) + (step2Cost?.totalCost || 0),
        inputCostFormatted: `$${((step1Cost?.inputCost || 0) + (step2Cost?.inputCost || 0)).toFixed(6)}`,
        outputCostFormatted: `$${((step1Cost?.outputCost || 0) + (step2Cost?.outputCost || 0)).toFixed(6)}`,
        totalCostFormatted: `$${((step1Cost?.totalCost || 0) + (step2Cost?.totalCost || 0)).toFixed(6)}`
      }
    };

    console.log('\n=== TOTAL COST SUMMARY ===');
    console.log(JSON.stringify(totalCost, null, 2));
    console.log('\n=== REQUEST COMPLETE ===\n');

    return NextResponse.json({
      success: true,
      prompt: finalPrompt,
      // Include intermediate outputs for debugging
      debug: {
        copywritingProfile: copywritingProfile,
        rhetoricalFigures: rhetoricalFigures,
        referencePrompt: referencePrompt.substring(0, 1000) + '...',
        scrapedSummary: scrapedSummary ? scrapedSummary.substring(0, 500) + '...' : null,
        scrapedBranding: scrapedBranding ? {
          colors: scrapedBranding.colors || null,
          typography: scrapedBranding.typography ? {
            fontFamilies: scrapedBranding.typography.fontFamilies || null,
            fontSizes: scrapedBranding.typography.fontSizes || null,
          } : null,
          fonts: scrapedBranding.fonts || null,
        } : null,
      },
      usage: {
        step1: step1Usage,
        step2: step2Usage,
        total: totalUsage.total
      },
      cost: {
        step1: step1Cost,
        step2: step2Cost,
        total: totalCost.total
      }
    });

  } catch (error: any) {
    console.error('Error generating static ad prompt:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}

