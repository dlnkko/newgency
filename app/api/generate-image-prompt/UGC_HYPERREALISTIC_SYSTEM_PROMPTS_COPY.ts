/**
 * COPY of UGC Hyperrealistic Image Prompt Generation - System Prompts
 * Source: app/api/generate-image-prompt/route.ts (style === 'hyperrealistic-ugc')
 * Use this file in another project. Original prompts are unchanged in route.ts.
 *
 * Placeholders for your project:
 * - {{USER_DESCRIPTION}} → user's description
 * - {{REFERENCE_IMAGE_NOTE}} → optional block when reference image is used (can be '')
 * - {{CAMERA_ANGLE_AND_LIGHTING_BLOCK}} → concatenation of camera angle + lighting block below
 */

// ========== 1. CAMERA ANGLE BLOCKS ==========

export const UGC_CAMERA_ANGLE_DEFAULT_FRONTAL = `
**CRITICAL - CAMERA ANGLE: FRONTAL CAMERA (DEFAULT FOR UGC):**
The image MUST look like a casual iPhone photo taken by another person (NOT selfie). This means:
- Frontal view from a natural distance, chest-up or medium shot, as if a friend is holding the iPhone in front of the subject.
- Camera at or slightly above eye level, natural everyday framing (no extreme wide-angle, no dramatic perspective).
- The scene must feel spontaneous and unposed, like a real moment captured in everyday life, with the same hyperrealistic lighting and texture standards described for UGC.`;

export const UGC_CAMERA_ANGLE_SELFIE = `
**CRITICAL - CAMERA ANGLE: SELFIE CAMERA (MANDATORY):**
The image MUST look as if taken by the person holding the phone (selfie-style). This means:
- The framing is as if the character is holding their phone in front of them, showing themselves
- Natural selfie-style composition: intimate, close-up or chest-up, slight low angle typical of selfie hold
- Authentic iPhone selfie aesthetic: natural color science, realistic skin tones, genuine mobile capture
- The image should feel like an authentic selfie photo - hyperrealistic, as if taken with an iPhone in selfie mode.`;

export const UGC_CAMERA_ANGLE_FRONTAL = `
**CRITICAL - CAMERA ANGLE: FRONTAL CAMERA / POV (MANDATORY):**
The image MUST be a frontal view as if recorded with an iPhone by another person (friend-with-iPhone style) OR a POV (Point of View) where only what the person sees is visible. This means:
- **Frontal from a natural distance**: Chest-up or medium shot, camera at or slightly above eye level, framing the subject naturally in the center, like a casual iPhone photo from a friend – NOT selfie.
- **POV option**: The viewer sees what the person sees (hands, product, environment) without showing the photographer; only hands may appear when relevant.
- In both cases the image MUST maintain the SAME lighting quality, natural textures and hyperrealistic look: authentic iPhone color science, soft natural daylight, minimal soft shadows with proper falloff, natural material response to light, and realistic highlight rolloff.
- The result must look grabado de iPhone: clean, natural, hyperrealistic, and indistinguishable from a real iPhone capture (no device frames or UI).`;

export const UGC_CAMERA_ANGLE_STEADY = `
**CRITICAL - CAMERA ANGLE: STEADY (MANDATORY):**
The image MUST look as if the phone was placed in a fixed position (e.g., on a table, shelf, tripod) capturing the scene in third person. This means:
- Stationary camera position; no handheld feel - stable, composed frame
- As if someone set the phone down to capture the scene; characters may look at the camera but the phone is not held
- Authentic UGC aesthetic with minimal shake; clear, sharp, hyperrealistic still photo.`;

// ========== 2. HYPERREALISM BASE (shared by all lighting presets) ==========

export const UGC_HYPERREALISM_BASE = `
**CRITICAL - PHONE CAMERA PHOTOREALISM (PHYSICAL SIMULATION, NOT ARTISTIC FILTER):**
The image MUST look like it was captured with a real smartphone in a real-world setting. Prioritize physical simulation over stylization. **NO** professional studio, **NO** cinematic grading, **NO** beauty filters.

**1. PHYSICALLY BASED LIGHTING AND SURFACE REFLECTION (MANDATORY):**
- **Single-source directional light:** Use complex, single-source, directional lighting (e.g. direct low sun, harsh golden hour, single window light). The light MUST create distinct shadows and bright, sharp specular highlights. Avoid soft/even/all-encompassing studio light or flat diffuse ambient.
- **Micro-texture & surface roughness:** All surfaces (skin, fabric, metal) must have realistic non-uniform micro-textures and physically accurate roughness. Render visible, non-smoothed skin pore structure, micro-imperfections, and fine vello facial (peach fuzz). Skin must show visible natural specular glossiness (oils/sweat) to define volumetric form and prevent a flat matte look.
- **Global illumination (radiosity):** Objects must affect the lighting of their neighbors. The background's ambient light must physically influence the subject; the subject must cast subtle colored light onto nearby surfaces (light bounce).

**2. LENS AND CAMERA MECHANICS (MANDATORY):**
- **Smartphone lens distortion:** Simulate natural wide-angle lens distortion (16mm–20mm) and foreshortening typical of handheld selfies, where the subject's arm/hand is closer to the lens.
- **Optical depth of field:** Do NOT use Gaussian blur. Simulate physically accurate shallow depth of field with a defined focal point. Background blur must be organic and complex, preserving light points (bokeh) and atmospheric texture.
- **Camera noise & artefacts:** Include a subtle, organic layer of digital noise (grain) and minor chromatic aberration toward the edges of the frame to break perfect rendering and simulate a real sensor.
- **Dynamic contrast:** Do NOT compress the dynamic range. Ensure rich, deep shadows and bright, detailed highlights without over-processing.

**NEGATIVE PROMPTS (ABSOLUTE PROHIBITIONS):**
NO over-smoothed or beauty-filtered skin. NO glamour-shot post-processing. NO uniform fabric patterns (must show imperfections and minor pilling). NO perfectly even flat lighting (no filler lights). NO synthetic-looking post-render sharpening. NO device frames or UI elements.`;

// ========== 3. LIGHTING PRESETS ==========

export const UGC_LIGHTING_NIGHT_OUTSIDE = UGC_HYPERREALISM_BASE + `

**LIGHTING: NIGHT OUTSIDE (SMARTPHONE CAPTURE):**
Real nighttime outdoor captured on iPhone — NOT cinematic night. Single directional light sources: streetlights, car headlights, neon signs — each with realistic falloff, creating distinct pools of light and deep unlit areas. Do NOT compress dynamic range: rich deep shadows with bright isolated highlights from each light source. Organic digital noise (grain) and lower exposure typical of a real iPhone at night. Skin and fabric textures physically present under available light (pore structure, fabric weave visible under light sources). Authentic iPhone color science — warm/cool depending on light source temperature. No film-style grading, no filler lights filling the shadows.`;

export const UGC_LIGHTING_DAY_OUTSIDE = UGC_HYPERREALISM_BASE + `

**LIGHTING: DAY OUTSIDE (SMARTPHONE CAPTURE - REFERENCE STANDARD):**
Apply this exact structure to ALL Day Outside prompts. Single-source natural directional light from outdoors (soft overcast diffusion or low sun from front-upper direction). In your prompt include:

- **Light**: Directional natural daylight from a defined angle (e.g. "soft natural daylight from front-upper, slight left"); creates visible illuminated side and subtly shadowed side. Neutral to warm color temperature with authentic iPhone light diffusion.
- **Shadows**: Soft with proper natural falloff from the light direction — subtle but present and physically accurate. Do NOT use flat shadowless lighting.
- **Highlights**: Visible specular highlights on skin (forehead, nose, cheekbones) with authentic iPhone sensor rolloff. Skin shows natural specular glossiness from natural oils.
- **Skin texture**: Visible pore structure, natural imperfections, natural skin tone variation, peach fuzz in backlit zones. NO beauty filter, NO smooth skin.
- **Dynamic range**: Rich, full dynamic range — detailed highlights and deep-enough shadows without over-processing.
- **Framing**: Intimate chest-up or medium shot, slight upward angle for selfie-style; or as the user describes. Spontaneous and unposed.
- **Fabric/material**: Threads, weave imperfections, realistic folds. Clear material differentiation.
- **Depth of field**: Physically accurate shallow DoF with organic complex bokeh (light points, atmospheric texture) — NOT Gaussian blur.
- **Noise/aberration**: Subtle organic digital grain, minor chromatic aberration at frame edges.
- **End**: Clean hyperrealistic photo, no device frames, no UI elements, indistinguishable from a genuine unposed smartphone capture.`;

export const UGC_LIGHTING_ARTIFICIAL_INSIDE = UGC_HYPERREALISM_BASE + `

**LIGHTING: ARTIFICIAL LIGHT INSIDE (SMARTPHONE CAPTURE):**
Indoor artificial lighting as real iPhone capture — NOT cinematic. Single dominant light source (LED ceiling, warm lamp, overhead light) from above and slightly frontal; creates visible directional illumination with soft but present shadows underneath and to the sides. Do NOT use flat even filler lights. Dynamic range: warm or neutral light temperature with bright illuminated areas and genuine shadow depth. Skin textures: visible pore structure, natural imperfections, specular glossiness from skin oils under indoor light. Fabric: threads, weave imperfections, realistic folds. Products: material-accurate reflections (plastic gloss, matte surfaces differentiated). Organic digital noise typical of indoor iPhone capture. Authentic iPhone color science. No cinematic polish.`;

export const UGC_LIGHTING_NATURAL_INSIDE = UGC_HYPERREALISM_BASE + `

**LIGHTING: NATURAL LIGHT INSIDE (SMARTPHONE CAPTURE):**
Indoor natural light from a window — single directional source creating a defined lit side and a softer shadow side. Light falls from the window direction with natural falloff across the scene. Skin: visible pore structure, natural imperfections, natural skin tone variation, peach fuzz in backlit areas, natural specular glossiness from skin oils on illuminated side. Fabric: threads, weave, minor pilling, realistic folds. Dynamic range: bright window-lit areas and genuine shadow depth — do NOT flatten. Organic digital noise from smartphone sensor in indoor light. Authentic iPhone color science and white balance. No cinematic polish, no studio filler lights.`;

// ========== 4. MAIN UGC HYPERREALISTIC STYLE INSTRUCTIONS ==========
// Replace {{USER_DESCRIPTION}}, {{REFERENCE_IMAGE_NOTE}}, {{CAMERA_ANGLE_AND_LIGHTING_BLOCK}} when building the full system prompt.

export const UGC_HYPERREALISTIC_MAIN_STYLE_INSTRUCTIONS = `
**CRITICAL - GRABADO DE IPHONE (ALL UGC IMAGE PROMPTS):**
The image MUST look like a **real casual iPhone photo** - natural, unposed, NOT professional studio. **NO** cinematic lighting, NO cinematic shadows, NO studio look.

**OUTPUT PROMPT RULES (what to write in the final prompt, what NOT to write):**
- **Do NOT include** the words "homemade", "casero", or "spontaneous and homemade casero style" in the generated prompt - they don't make sense for the image model. **Instead DESCRIBE the look**: e.g. "like a casual iPhone photo", "as if taken with an iPhone in a real moment", "natural and unposed, as iPhone captures in everyday life", "grabado de iPhone" (this one is OK - it describes the look).
- **DO request realistic skin texture**: visible pore structure, natural skin imperfections, natural skin tone variation, very fine facial hair (peach fuzz) in backlit areas. Do NOT beauty-filter or over-smooth skin — this creates the "plastic/airbrushed" look. Instead describe "realistic pore structure", "natural skin texture", "subtle imperfections", "peach fuzz in backlit areas".
- **DO request fabric realism**: individual threads, minor pilling, weave imperfections, realistic folds from posture.
- **Do request**: directional natural light (specify type and source), surface-specific specularity, bounce light, shallow depth of field with complex bokeh, subtle chromatic aberration, physical lens simulation, chiaroscuro facial volumetrics.
- **Avoid in the prompt**: "studio lighting", "perfect symmetry", "glamour processing", "over-smoothed skin", "cinematic shadows", device frames.

**HYPERREALISTIC UGC STYLE REQUIREMENTS (iPhone Photography Hyperrealism):**

You MUST generate a prompt that prioritizes ABSOLUTE HYPERREALISM with iPhone photography quality. The image must look like it was taken with an iPhone - indistinguishable from a real iPhone photo. **Use the SAME standards as UGC video prompts for lighting, shadows, tonalities and color** - but always NATURAL and iPhone-like, never cinematic.

**LIGHTING, SHADOWS AND TONALITY (MANDATORY - PHYSICAL SIMULATION):**
- **Single-source directional light (always specify):** Use complex, single-source, directional lighting — e.g. "direct low sun from front-left", "single window light from the left", "warm overhead LED from above-right". The light MUST create distinct shadows and bright sharp specular highlights. **Never** "soft even studio light", "filler lights", "all-encompassing ambient". Specify type, direction, and intensity.
- **Dynamic contrast (MANDATORY):** Do NOT compress the dynamic range. Ensure rich, deep shadows and bright, detailed highlights without over-processing. The image must have genuine tonal range.
- **Surface-specific specularity (MANDATORY):** Skin must show visible natural specular glossiness (oils/sweat) to define volumetric form — prevents matte/airbrushed look. Metal, plastic, and fabric reflect light according to their physical properties. State this explicitly in the prompt.
- **Global illumination / radiosity (MANDATORY):** The background's ambient light must physically influence the subject; the subject must cast subtle colored light onto nearby surfaces (light bounce). e.g. "warm bounce light from nearby warm-toned surface coloring the shadow side softly".
- **Shadows:** Physically accurate shadows from the single light source — present and directional, with proper falloff. Use shadow/highlight contrast (chiaroscuro) to define facial features and 3D volumetric depth. **Never** flat shadowless lighting.
- **Highlights:** Bright, sharp specular highlights on skin (forehead, nose, cheekbones), glass, plastic — authentic iPhone sensor rolloff. Not clamped or over-processed.
- **Tonalities and color:** "iPhone's authentic color science and white balance", "realistic color temperature", natural color cast from light source (e.g. warm golden cast, neutral daylight, cool window light). Authentic dynamic range as iPhone captures.
- **Camera noise & artefacts (MANDATORY):** Include subtle organic digital noise (grain) and minor chromatic aberration toward the frame edges to break perfect rendering and simulate a real sensor.

- **Lighting (CRITICAL - real-world single source, NOT studio):**
  - Single-source natural or artificial light — e.g. window light from one side, overhead warm lamp, outdoor low sun — slightly uneven as in real casual photos.
  - **No filler lights**: Do NOT add secondary lights to fill shadows evenly. Preserve natural shadow depth from the single source.
  - Describe "single directional light source", "directional natural/artificial light as in real life" — **never** "studio lighting", "perfectly balanced", "even illumination", "refined portrait lighting".
  - Always tie shadows, tonalities, and color cast to the specific light source: "warm color cast from [source]", "cool shadow fill from ambient sky", "directional shadows from single overhead light".
- **Angle and composition (CRITICAL):**
  - **Close-up portrait framing**: Chest-up or intimate close-up; subject fills the frame; avoid wide-angle that "captures more of the room"
  - **Slightly low / slight upward angle** when it fits (e.g. selfie-style but refined); clear, focused framing on the subject
  - Do NOT default to "wide-angle lens characteristic of handheld mobile" or "purposefully amateur composition"; prefer "close-up portrait", "intimate framing", "chest-up with sharp focus on subject"
- **Texture (CRITICAL - physical simulation, NOT beauty-filtered):**
  - **Skin**: Render visible, realistic pore structure, subtle natural imperfections, natural skin tone variation, and very fine facial hair (peach fuzz) in backlit areas. Do NOT over-smooth skin — "plastic skin" / "airbrushed skin" is FORBIDDEN. Use: "realistic pore structure", "natural imperfections", "natural skin tone variation", "peach fuzz in backlit areas", "no beauty filter".
  - **Fabric**: Must show individual threads, minor pilling, weave imperfections, and realistic folds determined by posture. No perfectly uniform patterns.
  - **Material differentiation**: Clear visual separation between different surfaces (e.g. plastic gloss vs matte rubber vs soft hair).
  - **Avoid in prompt**: "over-smoothed skin", "plastic skin", "glamour processing", "perfectly uniform patterns", "studio", "cinematic".
- **iPhone photography aesthetic**: The image must look exactly like it was captured with an iPhone - authentic iPhone color science, realistic skin tones, natural image processing
- **First-person or third-person perspective**: The image can be taken by the same person (first-person POV) or by someone else (third-person), but it must always look like an iPhone photo - natural, authentic, and realistic
- **iPhone camera characteristics (PHYSICAL LENS SIMULATION):**
  - **Lens**: Simulate a specific real-world iPhone lens — e.g. "wide-angle iPhone lens with natural perspective distortion for selfies" or "iPhone 26mm equivalent with natural foreshortening".
  - **Depth of field**: Physically accurate shallow depth of field with natural, complex bokeh — NOT a simple Gaussian blur. Focus point is sharp; bokeh has natural texture and variation.
  - **Chromatic aberration & noise**: Include subtle realistic digital camera noise and minor chromatic aberration toward the edges of the frame to break perfect rendering. e.g. "subtle digital sensor noise", "minor chromatic aberration at frame edges".
  - **Color science**: iPhone's authentic color science and white balance — natural, not cinematic grading.
  - **Dynamic range**: iPhone's characteristic dynamic range — as in real phone photos.
- **Flash photography when contextually appropriate**: If the scene requires it (low light, night scenes), include iPhone flash with proper flash shadows and color temperature
- **Shadows (GRABADO DE IPHONE)**: Soft, natural shadows only - proper falloff, no harsh edges. **Never** cinematic or dramatic shadows.
- **Lighting**: Soft diffused light, realistic diffusion, gentle highlights - as iPhone captures. **Never** cinematic or film-style lighting.
- **Textures (PHYSICAL SIMULATION)**: Skin: visible pore structure, micro-imperfections, natural skin tone variation, peach fuzz in backlit areas, specular glossiness from natural oils — NO beauty filter, NO over-smoothed skin. Fabric: individual threads, minor pilling, weave imperfections, realistic folds. Material differentiation: clear visual separation between different surface types.
- **Human facial features (CRITICAL - NO BEAUTY FILTER)**: If the image includes human faces:
  - **Physical volumetrics**: Lighting must define facial features through shadows and highlights (chiaroscuro) to create 3D depth and volume — NOT flat or layered.
  - **Realistic skin texture**: Request "visible pore structure", "natural skin imperfections", "natural skin tone variation", "peach fuzz in backlit areas". Do NOT smooth or beauty-filter skin. Do NOT use "plastic skin", "perfect skin", "smooth complexion".
  - **Specularity**: Skin must show microscopic specularity (natural oils/moisture) — subtle glossiness on nose, forehead, cheekbones. This prevents the matte/airbrushed AI look.
  - **Dynamic posture**: Encourage realistic unposed body postures (e.g. hand extended for selfie) that introduce natural foreshortening and lens interaction.
- **Authentic colors**: iPhone's natural color science, realistic color temperature, genuine color reproduction as seen in real iPhone photos
- **Real-world details**: Natural imperfections, authentic material response to lighting, genuine atmospheric perspective, realistic depth of field (iPhone-style)
- **Maximum realism**: If the description mentions a person, environment, object, or anything - it must look 100% real, as if photographed with an iPhone in real life
- **No artificial elements**: Everything must look natural and authentic, as if it exists in the real world and was captured with an iPhone{{REFERENCE_IMAGE_NOTE}}

**CRITICAL - PERSON DETECTION AND CAMERA PERSPECTIVE:**
- **FIRST: Check if description mentions people/persons**: Analyze the user's description: "{{USER_DESCRIPTION}}"
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
  - **Describe as "like a casual iPhone photo"** - directional natural light (window, room, daylight) with specified source, close-up or chest-up, selfie-style angle. Do NOT write "homemade" or "casero" in the prompt; describe the look (e.g. "as if taken with iPhone", "like a casual iPhone selfie"). Request realistic skin texture: "visible pore structure", "natural imperfections", "peach fuzz in backlit areas", "microscopic skin specularity" — do NOT beauty-filter or over-smooth.
  - **Camera angles**: Natural framing - close-up, chest-up, selfie-style (slightly from below when it fits). As if taken with phone in hand.
  - **Lighting**: Natural - window light, room light, daylight. Soft, no harsh shadows. No studio.
  - **User description priority**: Follow the user's description; output should read like a description of a casual iPhone photo — natural, not studio — and must NOT include "homemade" or "casero" literally (describe the look instead).
  - **Reference image priority**: Choose based on your project: if reference image attached, copy camera angle/lighting or use as reference-only; otherwise "Choose the most natural camera angle and framing that fits the scene described."
  - iPhone camera quality and characteristics - must look like a real iPhone photo taken casually

**iPhone Photography Quality Requirements (Physical Simulation):**
- In the prompt write: "iPhone photography", "taken with iPhone", "grabado de iPhone", or "like a casual iPhone photo" / "as if taken with an iPhone" — **do NOT write "homemade" or "casero"** (describe the look instead).
- **Physical skin realism (MANDATORY)**: "visible pore structure", "natural skin imperfections", "natural skin tone variation", "peach fuzz in backlit areas", "visible natural specular glossiness from skin oils". Do NOT smooth or beauty-filter — "plastic skin" / "airbrushed skin" is FORBIDDEN.
- **Physical lighting (MANDATORY)**: Single-source directional light with type and direction specified; surface-specific specularity; global illumination / radiosity; chiaroscuro facial volumetrics; full dynamic range (rich shadows + bright highlights).
- **Lens mechanics (MANDATORY)**: 16mm–20mm wide-angle lens simulation with natural perspective distortion and foreshortening; physically accurate shallow DoF with organic complex bokeh (NOT Gaussian blur); subtle organic digital grain; minor chromatic aberration at frame edges.
- **ABSOLUTE NEGATIVE PROMPTS** (must appear as prohibitions in or alongside the generated prompt): NO over-smoothed / beauty-filtered skin. NO glamour-shot processing. NO uniform fabric patterns. NO flat even lighting / no filler lights. NO synthetic post-render sharpening. NO cinematic grading. NO device frames or UI elements.
- Include iPhone's characteristic color science — natural color, natural exposure.
- If flash is needed, specify "iPhone flash" or "iPhone camera flash".
- **CRITICAL - NO DEVICE FRAMES OR BORDERS**: 
  - **ABSOLUTE PROHIBITION**: You MUST NOT mention, include, or suggest iPhone frames, iPhone borders, iPhone margins, device frames, screen borders, or any UI elements in the prompt UNLESS the user explicitly requests them
  - **ONLY describe the photo/image itself**: Describe the image as a photo taken with an iPhone, but WITHOUT any device frames, borders, or margins
  - **NO screenshots**: Do NOT describe it as a screenshot unless the user explicitly mentions screenshot or screen capture
  - **NO UI elements**: Do NOT include any UI elements, status bars, navigation bars, or device interface elements
  - **Just the photo**: The prompt should describe a clean photo/image without any device framing or borders
- **Perspective clarification**:
  - If description mentions people: Describe as **like a casual iPhone photo** — directional natural light (single source), close-up or chest-up, selfie-style angle; request visible pore structure, natural imperfections, peach fuzz in backlit areas, skin specularity; soft natural shadows from light direction; iPhone color science; shallow DoF with organic bokeh; organic digital noise. Do NOT write "homemade" or "casero" in the prompt text.
  - If description does NOT mention people: The image should look like it was taken by someone with an iPhone in third-person perspective (as if someone is photographing the subject/scene), but NO people visible in the frame
  - **Reference image priority**: Same as above — choose based on whether reference image is used in your project.

The goal: image like a **real casual iPhone photo** (grabado de iPhone). Natural light, natural skin and texture (as iPhone captures - **not** "visible pores" or ultra-defined), soft shadows, no cinematic. **In the final prompt:** describe the look as "like a casual iPhone photo" / "as if taken with iPhone" - do NOT write "homemade" or "casero". Do NOT ask for "visible pores" or "subtle fine lines". **CRITICAL:** Result must look like real UGC on iPhone - natural, not over-defined, NOT studio, NOT cinematic. Clean photo, no device frames. **CRITICAL: The image should be a clean photo without any device frames, borders, margins, or UI elements - just the photo itself.**{{CAMERA_ANGLE_AND_LIGHTING_BLOCK}}{{REFERENCE_IMAGE_NOTE}}`;
