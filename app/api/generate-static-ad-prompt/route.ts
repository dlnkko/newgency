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
    const rateLimitResult = await checkRateLimit('generateStaticAd', request);
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
    const { staticAdImage, productImage, copywriting, isUrlScraped, guidelines } = body;
    const guidelinesTrimmed = typeof guidelines === 'string' ? guidelines.trim() : '';

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

1. **Identify Copywriting Characteristics and BREVITY** (for later adaptation):
    - **Text structure**: How many lines of text? (e.g. one tagline + one main line). Count words PER LINE: tagline/headline = X words, main copy/slogan = Y words. The reference ad uses SHORT, punchy text — capture this exactly.
    - Count the EXACT number of words in the main headline/tagline (first line) and in the main copy/slogan (second line or main block) separately.
    - Identify the rhetorical figure used (metaphor, personification, hyperbole, analogy, slogan, motivational, aspirational, etc.)
    - Note the tone (friendly, professional, playful, serious, etc.)
    - Note the style category (corto y persuasivo, humor, irónico, directo, emocional, etc.)

2. **Extract Typography from Reference Ad (CRITICAL for replication):**
    - Describe the typography in a dedicated section: font style/type (e.g. sans-serif bold, serif, display, script), approximate sizes (headline vs body), weights (light, regular, bold, black), text placement (top, center, overlay), alignment (left, center, right), and any effects (shadows, outlines, gradients on text, letter-spacing). This will be used to COPY the same typography in the final ad.

3. **Identify VISUAL STYLE / DESIGN TYPE** (CRITICAL — do not add people or gym if reference has none):
    - Does the reference ad show ANY person, athlete, or human? (yes/no)
    - Does the reference ad show ANY environment like gym, sport setting, or location? (yes/no)
    - If NO person and NO gym/environment: the ad is "graphic/product-only" (product + background/graphics only). The adaptation must STAY graphic — do not insert people or gym.
    - If it HAS a person or environment: we may adapt that to the new product context (e.g. creatine → gym) or per user guidelines.

4. **Generate a DETAILED Prompt** that recreates EVERY visual element:
    - EXACT composition and layout (where every element is positioned: person, product, text, buttons, etc.)
    - EXACT colors (background, foreground, text, accents - specific shades, gradients, hex codes if visible)
    - EXACT typography (font styles, sizes, weights, exact text placement, alignment, effects like shadows/outlines) — describe so the same look can be replicated
    - EXACT background (style, colors, gradients, visual elements like silhouettes, blur effects, particles)
    - EXACT product/subject presentation (positioning, angles, lighting, shadows, number of products)
    - EXACT person/character (if present: pose, expression, clothing, placement, interaction with product)
    - EXACT visual effects (lighting style, shadows, highlights, reflections, gradients, filters)
    - EXACT buttons/CTAs (if present: style, colors, typography, placement)
    - EXACT overall aesthetic and mood

The prompt must be so detailed that it would generate an IDENTICAL image to the reference ad.

Format your response EXACTLY as:
**TYPOGRAPHY (REFERENCE AD):**
- Font style/type: [e.g. bold sans-serif, display, serif]
- Sizes and hierarchy: [headline size, body/copy size, any small text]
- Weights: [e.g. bold headline, regular body]
- Placement and alignment: [where text sits, alignment]
- Effects: [shadows, outlines, gradients on text, letter-spacing if visible]
(Describe everything needed to replicate the exact same typography in another ad.)

**VISUAL STYLE (REFERENCE AD):**
- Has person/character: [yes/no]
- Has gym, sport setting, or location environment: [yes/no]
- Design type: [graphic-product-only OR has-person OR has-environment]
If "graphic-product-only": the ad is purely product + background/graphics (no people, no gym). The generated prompt must NOT add people or gym/sport imagery — only adapt product and keep the same graphic style. Only add person/gym if the user explicitly requests it in Guidelines.

**COPYWRITING ANALYSIS:**
- Text Structure: [e.g. "Two lines: tagline (X words) + main slogan (Y words)" — describe how many lines and word count per line]
- Headline/Tagline Word Count: [exact number of words in the first/short line, e.g. 3]
- Main Copy Word Count: [exact number of words in the main slogan/second line, e.g. 5]
- Word Count: [total or main line word count]
- Rhetorical Figure: [primary figure: metaphor/personification/hyperbole/analogy/slogan/motivational/aspirational/other]
- Tone: [tone]
- Style: [style category]

**REFERENCE AD PROMPT:**
[Generate a COMPREHENSIVE, EXTREMELY DETAILED prompt that would recreate this exact static ad. Include ALL visual elements: composition, colors, typography with exact text placement, background, product presentation, person/character (if present), lighting, shadows, effects, buttons (if present). The prompt should be ready to use in an AI image generator and would produce an identical image.]`;

    let staticAdAnalysis;
    try {
      staticAdAnalysis = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
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

        // Extract reference prompt, typography, visual style, and copywriting analysis
    let analysisText = '';
    let referencePrompt = '';
    let referenceTypography = '';
    let referenceVisualStyle: { hasPerson: boolean; hasEnvironment: boolean; designType: string } | null = null;
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

        // Extract typography from reference ad
        const typographyMatch = analysisText.match(/\*\*TYPOGRAPHY \(REFERENCE AD\):\*\*\s*([\s\S]*?)(?=\*\*COPYWRITING ANALYSIS:\*\*|\*\*VISUAL STYLE|\*\*REFERENCE AD PROMPT:\*\*|$)/i);
        if (typographyMatch) {
          referenceTypography = typographyMatch[1].trim();
          console.log('\n=== REFERENCE AD TYPOGRAPHY EXTRACTED ===');
          console.log('Typography:', referenceTypography.substring(0, 300) + (referenceTypography.length > 300 ? '...' : ''));
        }

        // Extract visual style (graphic vs person/environment) — do not add gym/person if reference is graphic-only
        const visualStyleMatch = analysisText.match(/\*\*VISUAL STYLE \(REFERENCE AD\):\*\*\s*([\s\S]*?)(?=\*\*COPYWRITING ANALYSIS:\*\*|\*\*REFERENCE AD PROMPT:\*\*|$)/i);
        if (visualStyleMatch) {
          const vsText = visualStyleMatch[1];
          const hasPerson = /Has person\/character:\s*yes/i.test(vsText);
          const hasEnv = /Has gym, sport setting, or location environment:\s*yes/i.test(vsText);
          const designMatch = vsText.match(/Design type:\s*(graphic-product-only|has-person|has-environment)/i);
          referenceVisualStyle = {
            hasPerson,
            hasEnvironment: hasEnv,
            designType: designMatch ? designMatch[1].toLowerCase() : (hasPerson || hasEnv ? 'has-person-or-environment' : 'graphic-product-only'),
          };
          console.log('\n=== REFERENCE VISUAL STYLE EXTRACTED ===', referenceVisualStyle);
        }

        // Extract copywriting analysis
        const copywritingAnalysisMatch = analysisText.match(/\*\*COPYWRITING ANALYSIS:\*\*\s*([\s\S]*?)(?=\*\*REFERENCE AD PROMPT:\*\*|$)/i);
        if (copywritingAnalysisMatch) {
          const analysisText2 = copywritingAnalysisMatch[1];
          const wordCountMatch = analysisText2.match(/Word Count:\s*(\d+)/i);
          const headlineWordsMatch = analysisText2.match(/Headline\/Tagline Word Count:\s*(\d+)/i);
          const mainCopyWordsMatch = analysisText2.match(/Main Copy Word Count:\s*(\d+)/i);
          const textStructureMatch = analysisText2.match(/Text Structure:\s*([\s\S]+?)(?=\n-|\n\*\*|$)/i);
          const rhetoricalMatch = analysisText2.match(/Rhetorical Figure:\s*(.+)/i);
          const toneMatch = analysisText2.match(/Tone:\s*(.+)/i);
          const styleMatch = analysisText2.match(/Style:\s*(.+)/i);

          copywritingProfile = {
            wordCount: wordCountMatch ? parseInt(wordCountMatch[1]) : null,
            headlineWordCount: headlineWordsMatch ? parseInt(headlineWordsMatch[1]) : null,
            mainCopyWordCount: mainCopyWordsMatch ? parseInt(mainCopyWordsMatch[1]) : null,
            textStructure: textStructureMatch ? textStructureMatch[1].trim() : null,
            tone: toneMatch ? toneMatch[1].trim() : null,
            styleCategory: styleMatch ? styleMatch[1].trim() : null,
          };

          rhetoricalFigures = {
            primary: rhetoricalMatch ? rhetoricalMatch[1].trim() : null,
          };

          console.log('\n=== COPYWRITING ANALYSIS EXTRACTED ===');
          console.log('Word Count:', copywritingProfile.wordCount);
          console.log('Headline Word Count:', copywritingProfile.headlineWordCount);
          console.log('Main Copy Word Count:', copywritingProfile.mainCopyWordCount);
          console.log('Text Structure:', copywritingProfile.textStructure);
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
          
          const inputCostPerMillion = 0.5;
          const outputCostPerMillion = 3.0;
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
    console.log('- Reference typography extracted:', !!referenceTypography);
    const isGraphicOnly = referenceVisualStyle?.designType === 'graphic-product-only';
    console.log('- Reference is graphic/product-only (no person, no gym):', isGraphicOnly);

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

    // Build copywriting creation instructions — enforce same brevity as reference (short tagline + short main line)
    const headlineWords = copywritingProfile?.headlineWordCount ?? (copywritingProfile?.wordCount != null ? Math.min(5, Math.max(2, Math.floor((copywritingProfile.wordCount || 8) / 2))) : 4);
    const mainCopyWords = copywritingProfile?.mainCopyWordCount ?? (copywritingProfile?.wordCount != null ? Math.min(8, Math.max(3, copywritingProfile.wordCount || 8)) : 6);

    let copywritingInstructions = '';
    if (isUrlScraped && scrapedSummary && copywritingProfile && rhetoricalFigures) {
      // Use scraped data to create copywriting with same rhetorical figure AND same brevity as reference
      copywritingInstructions = `**Copywriting Creation (CRITICAL — SAME BREVITY AS REFERENCE AD):**
The reference ad uses SHORT, punchy text — your prompt MUST describe copy with the SAME brevity:
- **Line 1 (tagline/headline):** MAX ${headlineWords} words. Short phrase like "VALENTINE'S DAY EXCLUSIVE" (3 words). Do NOT use a long sentence.
- **Line 2 (main copy/slogan):** MAX ${mainCopyWords} words. Short offer/slogan like "39% OFF BUNDLES FOR TWO" (5 words). Do NOT use a long sentence like "UNLOCK YOUR PEAK PERFORMANCE WITH THESE STRONGER TOGETHER GUMMY BUNDLES".
Using the scraped product page information below, DISTILL the key concepts (offer, product benefit, occasion) into these two SHORT lines. Same rhetorical figure: "${rhetoricalFigures.primary || 'match style'}", tone: "${copywritingProfile.tone || 'professional'}", style: "${copywritingProfile.styleCategory || 'persuasive'}".

**Scraped Product Page Data (distill into brief copy — do not paste long text):**
${scrapedSummary}

Create two short phrases: (1) a brief tagline (${headlineWords} words or fewer), (2) a brief main line (${mainCopyWords} words or fewer). In your final prompt, specify the exact short text to appear, e.g. centered text: "[TAGLINE]" and below "[MAIN COPY]".`;
      
      console.log('\n📝 Creating copywriting from scraped data with brevity:', { headlineWords, mainCopyWords });
    } else if (copywriting && !isUrlScraped) {
      // Manual copywriting provided
      copywritingInstructions = `**Copywriting:**
Use this exact copywriting in the prompt: "${copywriting}"`;
      console.log('\n📝 Using manual copywriting');
    } else {
      copywritingInstructions = `**Copywriting:**
Create copywriting matching the reference style and BREVITY:
- Line 1 (tagline): max ${headlineWords} words. Line 2 (main copy): max ${mainCopyWords} words. Do NOT use one long headline.
- Rhetorical figure: ${rhetoricalFigures?.primary || 'match reference'}
- Tone: ${copywritingProfile?.tone || 'professional'}
- Style: ${copywritingProfile?.styleCategory || 'persuasive'}`;
      console.log('\n📝 Creating copywriting from profile only');
    }

    const finalPromptGeneration = `You are an expert prompt engineer. You have been given:

1. A DETAILED prompt that recreates the reference static ad design
2. An image of a NEW product that needs to replace the product in the reference ad
${isUrlScraped && scrapedSummary ? '3. Scraped product page information (summary and branding)' : ''}

**Reference Ad Prompt (use this as the base structure - maintain ALL design elements):**
${referencePrompt}
${referenceTypography ? `
**Typography from Reference Ad (COPY this typography into the final prompt):**
${referenceTypography}
You MUST replicate the same typography style, font appearance, sizes, weights, placement and text effects from the reference ad in your output.` : ''}

**Your Task:**
Adapt the reference prompt above to create a NEW prompt for the product in the provided image. The new prompt must:

${isGraphicOnly ? `**CRITICAL — REFERENCE AD IS GRAPHIC/PRODUCT-ONLY (no people, no gym):**
The reference ad has NO person and NO gym/sport environment — it is purely product + background/graphics (e.g. product, liquid splashes, fruits, gradients). You MUST keep the same style: do NOT add any person, athlete, gym, or sport environment. Do NOT insert "gym in background", "athletic couple", "person training", etc. Only product, background, and graphic elements. The ONLY exception: if the user explicitly asks for it in the Guidelines section below, then follow their request. Otherwise keep it graphic/product-only.` : `**Person/Environment (reference has person or setting):** You may adapt the person/action or environment to match the new product context (e.g. creatine → gym) or follow user Guidelines.`}

1. **Analyze Product Context (CRITICAL):**
   - Analyze the product image to understand: product type, category, purpose, target audience, industry
   ${isGraphicOnly ? '- Keep the ad GRAPHIC: product + background/graphics only. Do NOT add people or gym/sport imagery unless the user requested it in Guidelines.' : `- **Person and Action Adaptation (reference had person/environment):**
     * The person in the image MUST be performing actions or in poses that are coherent with how the NEW product is actually used
     * Example: If product is creatine: person could be in gym/sport setting. If reference showed another sport: you may adapt to gym for creatine, or follow Guidelines
     * **Do NOT copy the person's pose/action from reference if it doesn't match the NEW product's actual use case**`}
   - Always maintain the EXACT same design structure, composition, and layout from reference
   ${isGraphicOnly ? '- Keep background and effects graphic only (e.g. liquid splashes, fruits, gradients) — no gym, no people.' : '- Adapt contextual elements (background setting, person styling, actions/pose) to match the product category and use case, or per Guidelines.'}
   - Keep all visual design principles, effects, and aesthetics consistent

2. **Maintain ALL design elements** from the reference prompt:
   - Keep the EXACT same composition structure
   - Keep the EXACT same layout and positioning of all elements
   - Keep the EXACT same visual effects (lighting style, shadows, effects)
   ${isGraphicOnly ? '- Do NOT add any person/character or gym — reference ad is product + graphics only.' : '- **Person/Character**: Maintain the same visual style and presentation approach, BUT adapt the person\'s pose, expression, clothing, and actions to be coherent with the NEW product\'s actual use case (see section 4 for details).'}
   - Keep the EXACT same buttons/CTAs design and placement (if applicable)
   - **Typography: COPY the typography from the reference ad** — same font style/type, sizes, weights, text placement, alignment and text effects (shadows, outlines). The headline and copy must look like the reference ad's typography.

3. **Adapt Colors and Typography:**
${scrapedBranding ? brandingIntegration : '- Use reference colors and typography, but adapt product-specific elements'}
${scrapedBranding ? '- Integrate product brand colors from branding data where appropriate (product elements, accents, highlights)' : ''}
${scrapedBranding ? '- Prefer REFERENCE AD typography for headline and main copy; use product brand typography only for small product labels if needed' : ''}
- **Always preserve the reference ad typography** (font style, sizes, weights, placement, effects) so the new ad looks like the reference.
- Maintain reference color palette for background and overall design
- Use brand colors strategically for product elements and accents

4. **Replace/Adapt product references**${isGraphicOnly ? '' : ' AND adapt people/actions to match product context (CRITICAL):'}
   - Analyze the product image: type, category, purpose, colors, branding, shape, characteristics
   - Replace product descriptions with the NEW product from the provided image
   ${isGraphicOnly ? '- Keep the ad graphic: only product(s), background, and graphic elements (splashes, fruits, etc.). No people, no gym, no sport environment.' : `- **ADAPT PEOPLE AND ACTIONS TO MATCH PRODUCT CONTEXT:**
     * If product is fitness/sports (e.g., creatine, protein): show person in gym/sports setting, working out, athletic clothing and active pose
     * If product is beauty/cosmetics: show person in beauty context, applying product or beauty-focused pose
     * If product is tech/gadgets: show person using product in tech context
     * **CRITICAL**: Adapt the person's pose, expression, clothing, setting, and action to the NEW product's actual use case.
   - If reference shows person holding product: adapt to show person using NEW product in contextually appropriate way
   - Adapt ALL visual context (background, setting, person styling, person actions/pose) to match the NEW product's actual use case and category`}
   - If reference shows multiple products: show multiple instances of NEW product in SAME arrangement
   - Maintain same angles, lighting, shadows as reference but for NEW product

5. **Create Copywriting (SAME BREVITY AS REFERENCE — CRITICAL):**
${copywritingInstructions}
**The reference ad has SHORT text.** In your prompt you MUST specify copy with the same brevity: a short tagline (${headlineWords} words or fewer) and a short main line (${mainCopyWords} words or fewer). Do NOT describe one long headline like "UNLOCK YOUR PEAK PERFORMANCE WITH THESE STRONGER TOGETHER GUMMY BUNDLES". Instead describe two short phrases, e.g. first line: "[occasion/tagline]" (${headlineWords} words), second line: "[offer/slogan]" (${mainCopyWords} words). Use the scraped product info to derive the concepts but condense into these short lines.
${guidelinesTrimmed ? `
6. **Guidelines from the user (apply these changes):**
${guidelinesTrimmed}
You MUST take these instructions into account when generating the final prompt.` : ''}

**Output:**
Provide ONLY the final, complete, EXTREMELY DETAILED prompt ready for AI image generation. The prompt should:
- Maintain ALL visual design elements from the reference prompt (composition, layout, typography placement, background style, effects)
- **Copy length:** Describe the exact SHORT phrases to appear (tagline + main line, each ${headlineWords} and ${mainCopyWords} words or fewer). Never one long sentence as the headline.
${isGraphicOnly ? '- Keep the ad GRAPHIC: product + background/graphics only. No person, no gym, no sport environment (unless user requested it in Guidelines).' : "- Adapt contextual elements (person styling, actions/pose, setting) to match the NEW product's use case. Ensure the person is in coherent pose/action (e.g. exercising for fitness products)."}
- Feature the NEW product from the provided image in contextually appropriate use
${scrapedBranding ? '- Integrate product brand colors and typography where appropriate' : ''}
- Be ready to copy and paste into Nano Banana Pro or similar AI image generators
- Do NOT include explanations, analysis, or additional text - ONLY the final detailed prompt`;

    let finalPrompt;
    let productAdaptation;
    try {
      productAdaptation = await ai.models.generateContent({
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

        const inputCostPerMillion = 0.5;
        const outputCostPerMillion = 3.0;

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
        referenceVisualStyle: referenceVisualStyle,
        referenceTypography: referenceTypography ? referenceTypography.substring(0, 500) + '...' : null,
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

