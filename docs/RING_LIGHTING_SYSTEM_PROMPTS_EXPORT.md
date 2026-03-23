# Ring lighting — system prompts (export)

Copia de los textos de sistema relacionados con **Ring lighting** del proyecto `newgencyapp` (Image Prompt Generator / `generate-image-prompt`).  
**No sustituyen** los archivos del proyecto; sirven para pegar en otro proyecto.

**Placeholders sugeridos en otro proyecto:**

- `{{USER_DESCRIPTION}}` — descripción del usuario  
- `{{CAMERA_ANGLE_AND_LIGHTING_BLOCK}}` — bloque concatenado de ángulo de cámara + iluminación (incluye el preset Ring abajo)

---

## 1) Base hiperrealismo iPhone 13 + preset Ring (como en `route.ts`)

Este es el bloque que se concatena cuando `lighting` incluye `"ring"`: primero la base común, luego las reglas Ring.

### 1a) Base (hyperrealismBase)

```
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
NO beauty-filtered or airbrushed skin. NO visible “CGI pores” or microscope-level detail. NO glamour-shot post-processing. NO uniform plastic fabrics. NO perfectly even flat lighting (no heavy filler lights). Avoid CGI oversharpening/large halo rings; **JPEG ringing and compression imperfections are allowed**. **NO cinematic background blur or heavy bokeh – the background must remain naturally readable like a real iPhone 13 photo.** NO device frames or UI elements. **NO overlays of any kind:** no status bar (carrier, time, battery, signal), no notch/Dynamic Island chrome, no screenshot look, no black letterboxing, no fake phone preview frame, no camera-app HUD, no watermarks or on-image UI.
```

### 1b) Preset Ring (anexo a la base)

```
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
- **Overall:** Same stunning frontal white UGC look — **lighting spot-on, hardware invisible.**
```

---

## 2) Variante en `UGC_HYPERREALISTIC_SYSTEM_PROMPTS_COPY.ts` (`UGC_LIGHTING_RING`)

En el repo también existe una copia con una **base hiperrealista ligeramente distinta** (`UGC_HYPERREALISM_BASE`). El anexo Ring es equivalente al §1b de arriba.  
Ver: `app/api/generate-image-prompt/UGC_HYPERREALISTIC_SYSTEM_PROMPTS_COPY.ts` → `export const UGC_LIGHTING_RING`.

---

## 3) Prioridad absoluta Ring (wrapper antes de “Your Task” — `route.ts`)

Úsalo si en tu otro proyecto mezclas instrucciones genéricas UGC que mencionan ventana/luz natural; este bloque va **después** de esas instrucciones y **antes** de la tarea final. Sustituye `{{CAMERA_ANGLE_AND_LIGHTING_BLOCK}}` por el mismo texto que en §1 (base + Ring) + bloque de ángulo de cámara si aplica.

```
---

**RING LIGHTING — ABSOLUTE PRIORITY (USER SELECTED IN THE APP — APPLIES TO EVERY GENERATION, INCLUDING REPEATS):**
The user selected **Ring** in the Lighting selector. **Ignore** any other paragraph in this system message that suggests: window light, natural light from a window, daylight from the side, skylight, golden hour sun, or outdoor lighting as the **primary** key — **even if that text appears earlier in this message.**
**FORBIDDEN in your generated output:** "light from a large window", "window to the left", "natural daylight from a window", "sunlight through the window", "single-source directional natural light coming from a window".
**REQUIRED in your generated output:** enclosed indoor room; **single** invisible frontal white LED key (off-camera); **visible white catchlights** in both eyes; **no** second warm practical light.
Repeat — Camera angle & lighting (follow this exactly):
{{CAMERA_ANGLE_AND_LIGHTING_BLOCK}}

---
```

---

## 4) Requisito crítico de iluminación (solo Ring) — “Critical Requirements”

```
**Ring is selected:** Describe ONLY the **frontal white LED key** and **eye catchlights** as in the Ring block above — **never** invent a window as the light source. Shadows and WB must match that single frontal key. For UGC: iPhone color science; **zero** window-daylight wording.
```

---

## 5) Ángulo Frontal Camera + Ring (línea condicional en `route.ts`)

Cuando Ring está activo, en el bloque “Frontal Camera / POV” se sustituye la frase de daylight:

```
- In both cases the image MUST maintain the SAME lighting quality, natural textures and hyperrealistic look: authentic iPhone color science, **Ring:** frontal white LED key and catchlights as in the Lighting block — **not** window daylight, natural material response to light, and realistic highlight rolloff.
```

---

## 6) Referencia + “Copy lighting” + Ring (snippets)

Si el usuario tiene imagen de referencia y “copy lighting”, con Ring **no** se copia la luz del reference:

```
**CRITICAL: User selected **Ring** lighting — do **NOT** copy lighting from the reference; use **only** the Ring rules in the CAMERA ANGLE & LIGHTING block below.**
```

```
- **MANDATORY - Lighting (Ring):** Do **NOT** copy lighting from the reference. Follow **only** the Ring lighting block in the main instructions (frontal white LED, indoor, catchlights).
```

```
- **CRITICAL:** User selected **Ring** — do **not** copy reference lighting; use Ring rules from the CAMERA ANGLE & LIGHTING block only.
```

---

## 7) Notas

- Origen principal: `app/api/generate-image-prompt/route.ts` (bloque `imageLightingBlock` cuando `lighting` contiene `ring`, más wrappers `isRingLighting`).
- Copia paralela: `app/api/generate-image-prompt/UGC_HYPERREALISTIC_SYSTEM_PROMPTS_COPY.ts` (`UGC_LIGHTING_RING`).
