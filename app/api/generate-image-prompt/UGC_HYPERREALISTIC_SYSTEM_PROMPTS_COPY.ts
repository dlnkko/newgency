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
**CRITICAL - IPHONE 13 PHOTO REALISM (NO CGI, NO BEAUTY FILTER):**
The image MUST look like a **real photo just taken with an iPhone 13**, not a 3D render. Natural iPhone sharpness: clean, appealing, realistic, but **without** clinical macro detail. **NO** professional studio, **NO** cinematic grading, **NO** beauty filters.

**1. LIGHTING AND SURFACE RESPONSE (MANDATORY):**
- **Single-source directional light:** One believable light source (sun, window, room light) creating soft realistic highlights and gentle shadows. Avoid perfectly even studio schemes or flat ambient.
- **Skin surface realism (SOFT):** Skin should look like a good iPhone 13 photo: clean, smooth but real. Use language like "natural, clean skin with gentle texture", never "visible pores" or "microscopic detail". Mention only subtle natural sheen from skin oils.
- **Fabric & materials:** Clothes respond naturally to light with realistic folds and soft texture, without thread-by-thread hyper-sharp detail.
- **Global illumination:** Environment light tints the subject softly and the subject can bounce a little color back – always subtle and natural.

**2. LENS AND CAMERA MECHANICS (MANDATORY):**
- **Smartphone lens behavior:** Typical iPhone wide lens (~24–26mm), mild perspective distortion, natural field of view.
- **Depth of field (NO background blur):** Deep iPhone 13 DoF so the **background stays sharp and fully legible** like a normal iPhone photo. The subject may show tiny real-phone imperfection (slight moment softness from micro-motion / imperfect focus), but **never cinematic blur** and **never background blur**. **NO Portrait Mode, NO bokeh, NO background blur**.
- **Camera noise & artefacts:** Include a **more noticeable iPhone-like sensor noise/grain** plus mild chromatic aberration near frame edges only if it helps break unrealistic perfection. Keep it messy but still plausible (not CGI-clean).
- **Dynamic contrast:** Balanced iPhone 13 dynamic range, allowing small natural clipping in bright conditions (as in real snapshots). Avoid HDR-overprocessed / crunchy tone‑mapping.

**3. RAW UGC IMPERFECTIONS (MANDATORY - SHITTY UGLY RAW LOOK):**
- Unpolished iPhone snapshot look: **clearly visible JPEG compression artifacts**, higher sensor noise/grain, more noticeable white-balance drift, and more obvious exposure “mistakes” (slight over/under, mild clipping), plus awkward/unremarkable framing as a real phone photo.
- Allow slightly stronger lens/oil smudge vibe, mild flare, or minor ringing only if it appears naturally in real scenes.
- Keep it casual: not beauty-graded, not studio-polished, not CGI-clean.

**NEGATIVE PROMPTS (ABSOLUTE PROHIBITIONS):**
NO beauty-filtered / airbrushed skin. NO hyper-detailed pores or microscope-level texture. NO glamour-shot post-processing. NO plastic, uniform fabrics. NO perfectly even flat lighting with many fillers. Avoid CGI oversharpening/large halo rings; **JPEG ringing and compression imperfections are allowed**. **NO cinematic background blur or heavy bokeh – keep background naturally readable like a real iPhone 13 photo.** NO device frames or UI elements. **NO overlays of any kind:** no status bar (carrier, time, battery, signal), no notch/Dynamic Island chrome, no screenshot look, no black letterboxing, no fake phone preview frame, no camera-app HUD, no watermarks or on-image UI.`;

// ========== 3. LIGHTING PRESETS ==========

export const UGC_LIGHTING_NIGHT_OUTSIDE = UGC_HYPERREALISM_BASE + `

**LIGHTING: NIGHT OUTSIDE (SMARTPHONE CAPTURE):**
Match a real iPhone 13 night photo (Night Mode / low-light smartphone capture) — **NOT** cinematic. The scene should look like a casual phone photo taken at night (street OR outdoor venue/resort patio with warm practical lights and greenery).

- **Light sources**: Practical real lights only (street lamps, shop signs, car headlights, window light) OR warm venue/resort practicals (garden uplights, pathway lights, warm sconces, pool/patio lighting). Natural falloff, no staged film lighting.
- **Exposure**: iPhone-like night exposure: slightly lifted shadows compared to real darkness, but still natural. Avoid dramatic underexposure or film-noir contrast.
- **Shadows**: Soft and natural; do not create sharp dramatic shadows. No “cinematic” shadow shaping.
- **Color**: Mixed night lighting is OK (warm street lamps + cooler ambient). Keep white balance and color science realistic, like iPhone 13.
- **Skin & detail**: Natural iPhone 13 skin — clean, soft, real, no beauty filter and no hyper-detailed pores. Textures should read naturally under available light without looking like CGI.
- **Noise / motion**: Subtle smartphone noise and slight low-light softness are OK (authentic), but do NOT make it gritty. Add a **tiny handheld feel**: slight micro-shake / subtle motion blur like a real iPhone snapshot at night (very light, not smeary).
- **BACKGROUND (CRITICAL - NO BLUR AT ALL):** The background must remain **sharp and fully legible** like a normal iPhone 13 photo. **NO Portrait Mode. NO bokeh. NO blur.** Distant lights may bloom slightly, but the environment must remain present and readable.
- **Overall**: Indistinguishable from a real iPhone 13 night street photo — casual, unfiltered, not polished, a bit RAW/unpolished (slightly imperfect exposure/noise), no film grading, no device frames or UI.`;

export const UGC_LIGHTING_DAY_OUTSIDE = UGC_HYPERREALISM_BASE + `

**LIGHTING: DAY OUTSIDE — OUTSIDE NATURAL LIGHTING (REFERENCE VISUAL — APPLY TO EVERY DAY OUTSIDE PROMPT):**
Match this outdoor UGC look: bright but **soft** natural sunlight (late morning / early afternoon or light overcast — **NOT** harsh midday sun). Think park or urban green space, candid chest-up portrait.

- **Light direction & quality**: Primary sun from **front-right of the subject, slightly elevated** (or front-upper-right). Illuminates the face evenly with a healthy natural glow. Light is **soft and flattering** — diffused enough that highlights are **not blown out**; detail remains on forehead, nose bridge, cheekbones, shoulder, hair.
- **Shadows**: **Soft and subtle** — under chin, along the **opposite side** of the face and neck from the key light, gentle under nose and lower lip. Enough chiaroscuro for 3D form **without** dark or dramatic contrast. Never harsh studio or cinematic shadows.
- **Color**: Natural balanced palette — **warm sunlight** on skin and clothes plus **slightly cooler ambient** from sky/green foliage in shadow areas. Authentic iPhone color science and white balance.
- **Skin (soft hyperrealism)**: Realistic skin with **soft, appealing** detail — natural pore structure and peach fuzz **where light grazes** the cheeks and forehead; **subtle** specular gloss from natural oils on forehead and cheekbones (volumetric, not plastic). NO beauty filter, NO over-smoothed skin, NO harsh HDR skin.
- **Hair & fabric**: Soft natural hair with visible strands near face and hairline; clothing shows **natural soft folds** and believable fabric texture (trench, scarf, knits) without crunchy oversharpening.
- **Background (ABSOLUTE - NO BLUR):** Outdoor context — green foliage, trees, optional light building; background must stay **sharp and readable** like a normal iPhone 13 photo. **NO Portrait Mode, NO bokeh, NO blur.**
- **Composition & gaze**: Medium **chest-up**; slight **upward angle** as casual phone hold. Subject should **look toward the camera** (talking-to-camera / friendly UGC) unless the user explicitly asks otherwise.
- **Overall**: Hyperrealistic, **soft**, candid outdoor iPhone capture — unposed, slightly RAW/unpolished (slightly imperfect exposure/noise), no device frames, no UI, indistinguishable from a real phone photo.`;

export const UGC_LIGHTING_ARTIFICIAL_INSIDE = UGC_HYPERREALISM_BASE + `

**LIGHTING: ARTIFICIAL LIGHT INSIDE (SMARTPHONE CAPTURE):**
Indoor artificial lighting as real iPhone capture — NOT cinematic. Single dominant light source (LED ceiling, warm lamp, overhead light) from above and slightly frontal; creates visible directional illumination with soft but present shadows underneath and to the sides. Do NOT use flat even filler lights. Dynamic range: warm or neutral light temperature with bright illuminated areas and genuine shadow depth. Skin textures: visible pore structure, natural imperfections, specular glossiness from skin oils under indoor light. Fabric: threads, weave imperfections, realistic folds. Products: material-accurate reflections (plastic gloss, matte surfaces differentiated). Organic digital noise typical of indoor iPhone capture. Authentic iPhone color science. No cinematic polish.`;

export const UGC_LIGHTING_NATURAL_INSIDE = UGC_HYPERREALISM_BASE + `

**LIGHTING: NATURAL LIGHT INSIDE (SMARTPHONE CAPTURE):**
Indoor natural light from a window — single directional source creating a defined lit side and a softer shadow side. Light falls from the window direction with natural falloff across the scene. Skin: visible pore structure, natural imperfections, natural skin tone variation, peach fuzz in backlit areas, natural specular glossiness from skin oils on illuminated side. Fabric: threads, weave, minor pilling, realistic folds. Dynamic range: bright window-lit areas and genuine shadow depth — do NOT flatten. Organic digital noise from smartphone sensor in indoor light. Authentic iPhone color science and white balance. No cinematic polish, no studio filler lights.`;

export const UGC_LIGHTING_RING = UGC_HYPERREALISM_BASE + `

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

// ========== 4. MAIN UGC HYPERREALISTIC STYLE INSTRUCTIONS ==========
// Replace {{USER_DESCRIPTION}}, {{REFERENCE_IMAGE_NOTE}}, {{CAMERA_ANGLE_AND_LIGHTING_BLOCK}} when building the full system prompt.

export const UGC_HYPERREALISTIC_MAIN_STYLE_INSTRUCTIONS = `
**CRITICAL - GRABADO DE IPHONE (ALL UGC IMAGE PROMPTS):**
The image MUST look like a **real casual iPhone photo** - natural, unposed, NOT professional studio. **NO** cinematic lighting, NO cinematic shadows, NO studio look.

**OUTPUT PROMPT RULES (what to write in the final prompt, what NOT to write):**
- **Do NOT include** the words "homemade", "casero", or "spontaneous and homemade casero style" in the generated prompt - they don't make sense for the image model. **Instead DESCRIBE the look**: e.g. "like a casual iPhone 13 photo", "as if taken with an iPhone in a real moment", "natural and unposed, as iPhone captures in everyday life", "grabado de iPhone".
- **Request natural iPhone 13 skin**: describe skin as "clean, natural, real iPhone 13 skin" – smooth but not plastic, with gentle natural texture. Do NOT request "visible pores", "microscopic detail", or "peach fuzz"; instead say "subtle natural texture" or "soft natural detail" and forbid beauty filters.
- **Request fabric realism (soft)**: realistic folds and natural texture in clothes (hoodies, denim, knits) but **not** thread-by-thread microscopic sharpness.
- **Do request**: directional natural light (specify type and source), gentle specular response on skin (soft natural sheen), slight smartphone noise, and natural depth of field similar to iPhone 13 Portrait / Photo mode.
- **Avoid in the prompt**: "studio lighting", "perfect symmetry", "glamour processing", "over-smoothed skin", "cinematic shadows", "ultra-detailed pores", device frames.
- **NO OVERLAY (MANDATORY in every generated prompt):** The final prompt MUST state the image is a **clean full-bleed photograph only** — **zero** on-image overlays: no status bar, carrier, clock, battery %, Wi‑Fi/signal icons, notch UI, Dynamic Island, recording indicators, camera-app interface, screenshot-style black bars, fake iPhone chrome, watermarks, or any UI on the image. Output = exported photo file, not a screen capture.

**HYPERREALISTIC UGC STYLE REQUIREMENTS (iPhone Photography Hyperrealism):**

You MUST generate a prompt that targets a REAL iPhone capture including RAW imperfections (JPEG artifacts, sensor noise, exposure mistakes). The image must look like it was taken with an iPhone - indistinguishable from a real iPhone photo (but unpolished/raw, not studio-perfect). **Use the SAME standards as UGC video prompts for lighting, shadows, tonalities and color** - but always NATURAL and iPhone-like, never cinematic.

**LIGHTING, SHADOWS AND TONALITY (MANDATORY - PHYSICAL SIMULATION):**
- **Single-source directional light (always specify):** Use a single, natural-looking light source — e.g. "soft afternoon sun from front-right", "single window light from the left", "warm overhead LED from above-right". The light should create gentle, realistic highlights and soft shadows – never harsh studio beams or completely flat fill. Specify type, direction, and intensity.
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
- **Texture (CRITICAL - natural iPhone 13, NOT beauty-filtered):**
  - **Skin**: Ask for "natural iPhone 13 skin" – clean, soft, realistic, with gentle natural texture, but **without** microscope-level pores or fuzz. Forbid phrases like "visible pores", "microscopic detail", "peach fuzz"; instead say "soft natural texture", "clean but real skin", "no beauty filter".
  - **Fabric**: Realistic folds and believable cloth texture, but do NOT push for ultra-sharp weave; avoid language that implies thread-by-thread inspection.
  - **Material differentiation**: Clear separation between different surfaces (e.g. plastic vs fabric vs hair) using natural light response, not exaggerated texture.
  - **Avoid in prompt**: "over-smoothed skin", "plastic skin", "glamour processing", "perfectly uniform patterns", "ultra-detailed pores", "studio", "cinematic".
- **iPhone photography aesthetic**: The image must look exactly like it was captured with an iPhone - authentic iPhone color science, realistic skin tones, natural image processing
- **First-person or third-person perspective**: The image can be taken by the same person (first-person POV) or by someone else (third-person), but it must always look like an iPhone photo - natural, authentic, and realistic
- **iPhone camera characteristics (PHYSICAL LENS SIMULATION):**
  - **Lens**: Simulate a specific real-world iPhone lens — e.g. "wide-angle iPhone lens with natural perspective distortion for selfies" or "iPhone 26mm equivalent with natural foreshortening".
  - **Depth of field (ABSOLUTE - NO BLUR):** Deep iPhone 13 DoF – subject AND background sharp/legible. **NO Portrait Mode, NO bokeh, NO blur.**
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
- **Lens mechanics (MANDATORY)**: iPhone wide lens look (~24–26mm), natural perspective distortion; **deep DoF (no blur)**; subtle organic digital grain; minor chromatic aberration at frame edges.
- **ABSOLUTE NEGATIVE PROMPTS** (must appear as prohibitions in or alongside the generated prompt): NO over-smoothed / beauty-filtered skin. NO glamour-shot processing. NO uniform fabric patterns. NO flat even lighting / no filler lights. NO synthetic post-render sharpening. NO cinematic grading. NO device frames or UI elements. **NO overlays** (status bar, carrier, time, battery, signal, notch, screenshot bars, letterboxing, phone mockup chrome, watermarks).
- Include iPhone's characteristic color science — natural color, natural exposure.
- If flash is needed, specify "iPhone flash" or "iPhone camera flash".
- **CRITICAL - NO DEVICE FRAMES OR BORDERS**: 
  - **ABSOLUTE PROHIBITION**: You MUST NOT mention, include, or suggest iPhone frames, iPhone borders, iPhone margins, device frames, screen borders, or any UI elements in the prompt UNLESS the user explicitly requests them
  - **ONLY describe the photo/image itself**: Describe the image as a photo taken with an iPhone, but WITHOUT any device frames, borders, or margins
  - **NO screenshots**: Do NOT describe it as a screenshot unless the user explicitly mentions screenshot or screen capture
  - **NO UI elements**: Do NOT include any UI elements, status bars, navigation bars, or device interface elements
  - **Just the photo**: The prompt should describe a clean photo/image without any device framing or borders
- **Perspective clarification**:
  - If description mentions people: Describe as **like a casual iPhone 13 photo** — directional natural light (single source), close-up or chest-up, selfie-style angle; natural iPhone 13 skin; soft natural shadows; iPhone color science; **deep DoF (NO blur)**; subtle smartphone noise; do NOT write "homemade" or "casero" in the prompt text.
  - If description does NOT mention people: The image should look like it was taken by someone with an iPhone in third-person perspective (as if someone is photographing the subject/scene), but NO people visible in the frame
  - **Reference image priority**: Same as above — choose based on whether reference image is used in your project.

The goal: image like a **real casual iPhone photo** (grabado de iPhone). Natural light, natural skin and texture (as iPhone captures - **not** "visible pores" or ultra-defined), soft shadows, no cinematic. **In the final prompt:** describe the look as "like a casual iPhone photo" / "as if taken with iPhone" - do NOT write "homemade" or "casero". Do NOT ask for "visible pores" or "subtle fine lines". **CRITICAL:** Result must look like real UGC on iPhone - natural, not over-defined, NOT studio, NOT cinematic. Clean photo, no device frames. **CRITICAL: The image should be a clean full-bleed photo without any device frames, borders, margins, overlays, status bars, or UI elements — just the photograph itself (not a screenshot, not a phone mockup).**{{CAMERA_ANGLE_AND_LIGHTING_BLOCK}}{{REFERENCE_IMAGE_NOTE}}`;
