'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import CopyButton from '@/app/components/CopyButton';
import InsufficientCreditsError from '@/components/InsufficientCreditsError';

type ProductFocus = 'conceptual' | 'ugc' | null;
type MainStyle = 'hyperrealistic';
type Composition = string;
type Lighting = string;

interface Scene {
  id: number;
  action: string;
  script: string | null; // Script text for the scene
  scriptAdaptation: 'adapt' | 'keep'; // Adapt script to time or keep all script
  composition: Composition[];
  cameraAngle: string[]; // Camera angle options (multiple selection)
  lighting: Lighting | null;
  duration: number | null; // Duration in seconds
  isEnhancing?: boolean;
  referenceImage: File | null; // Reference image for this scene
  referenceImagePreview: string | null; // Preview URL for reference image
  copyLighting: boolean; // Copy lighting from reference image
  copyCameraAngle: boolean; // Copy camera angle from reference image
  noDialogue: boolean; // No dialogue in this scene
  lipSync: boolean; // Lip sync mode - character visibly speaks the words
  voiceover: boolean; // Voiceover mode - voice plays while actions happen, character doesn't visibly speak
  continuousAction: boolean; // No cuts - all actions happen continuously without cuts
}

const COMPOSITION_OPTIONS = {
  hyperrealistic: [
    'UGC Close-up',
    'Product in Real Use',
    'Everyday Life',
    'Authentic Unboxing'
  ]
};

const CAMERA_ANGLE_OPTIONS = {
  hyperrealistic: [
    'Selfie Camera',
    'Frontal Camera',
    'Steady'
  ]
};

const LIGHTING_OPTIONS = {
  hyperrealistic: [
    'Night Outside',
    'Day Outside',
    'Artificial Light Inside',
    'Natural Light Inside'
  ]
};

// Cinematic Camera Angle Options with descriptions
const CINEMATIC_CAMERA_ANGLES = [
  {
    value: 'low angle',
    label: 'Low Angle',
    description: 'Cinematic shot from a lower perspective looking upward, creating a powerful and dominant visual presence.'
  },
  {
    value: 'high angle',
    label: 'High Angle',
    description: 'Cinematic shot from an elevated perspective looking downward, adding vulnerability, scale, or dramatic context.'
  },
  {
    value: 'over-the-shoulder',
    label: 'Over-the-Shoulder',
    description: 'Shot framed from behind a character\'s shoulder, adding depth and immersive storytelling perspective.'
  },
  {
    value: 'wide establishing',
    label: 'Wide Establishing',
    description: 'Wide cinematic frame that reveals environment and spatial context, setting the scene before action.'
  },
  {
    value: 'dutch angle',
    label: 'Dutch Angle',
    description: 'Slightly tilted frame creating tension, unease, or dynamic cinematic energy.'
  },
  {
    value: 'extreme close-up',
    label: 'Extreme Close-up',
    description: 'Very tight framing on details like eyes, hands, or product textures to emphasize emotion or realism.'
  }
];

// Cinematic Camera Movement Options with descriptions
const CINEMATIC_CAMERA_MOVEMENTS = [
  {
    value: 'slow push-in',
    label: 'Slow Push-in',
    description: 'Smooth forward camera movement slowly approaching the subject to build intensity and focus.'
  },
  {
    value: 'tracking shot',
    label: 'Tracking Shot',
    description: 'Camera moves laterally or follows the subject smoothly, maintaining motion while keeping cinematic flow.'
  },
  {
    value: 'orbit shot',
    label: 'Orbit Shot',
    description: 'Camera moves in a circular path around the subject, creating dramatic cinematic emphasis.'
  },
  {
    value: 'tilt up/down',
    label: 'Tilt Up/Down',
    description: 'Vertical camera movement revealing the subject from bottom to top or top to bottom.'
  },
  {
    value: 'crane / jib motion',
    label: 'Crane / Jib Motion',
    description: 'Elevated sweeping camera movement moving vertically or diagonally for a grand cinematic reveal.'
  },
  {
    value: 'handheld cinematic',
    label: 'Handheld Cinematic',
    description: 'Subtle controlled handheld motion adding realism and organic cinematic texture without looking amateur.'
  }
];

// Default texts for each composition - Optimized for hyperrealistic UGC
const DEFAULT_COMPOSITION_TEXTS: Record<string, string> = {
  'UGC Close-up': 'Extreme close-up mobile-style shot of [product], natural shaky camera, sharp focus on textures and details, shallow depth of field, authentic smartphone aesthetic',
  'Product in Real Use': 'Natural handheld shot of real hands using [product] in action, organic camera movement with slight shake, realistic and everyday environment, genuine and spontaneous interaction',
  'Everyday Life': '[Product] integrated into authentic daily life scenario, natural and relaxed composition, familiar and recognizable environment, recorded with casual mobile aesthetic',
  'Authentic Unboxing': 'First-person POV-style unboxing, hands revealing [product] from packaging, mobile camera with natural movement, authentic ambient lighting, genuine reaction'
};

// Default texts for each lighting - Optimized for hyperrealistic UGC
const DEFAULT_LIGHTING_TEXTS: Record<string, string> = {
  'Night Outside': 'Authentic nighttime outdoor lighting, streetlights and car headlights visible in background, natural moonlight casting soft shadows, realistic mobile phone recording at night, slight grain and lower exposure typical of nighttime smartphone footage, warm artificial lights from buildings or streetlamps, authentic night atmosphere as if someone is genuinely recording outside at night with their phone',
  'Day Outside': 'Natural daylight outdoor lighting, bright and clear sunlight, realistic shadows cast by natural light, authentic mobile phone recording during daytime, natural color temperature, genuine outdoor ambient lighting, slight overexposure in bright areas typical of phone cameras, authentic day atmosphere as if someone is genuinely recording outside during the day with their phone',
  'Artificial Light Inside': 'Indoor artificial lighting, warm or cool LED/incandescent lights, realistic indoor ambient light, authentic mobile phone recording indoors with artificial light sources, natural shadows from indoor lights, slight color cast from artificial light sources, genuine indoor lighting atmosphere as if someone is genuinely recording inside with artificial lights using their phone',
  'Natural Light Inside': 'Natural window light streaming indoors, soft diffused daylight through windows, realistic indoor natural lighting, authentic mobile phone recording indoors with natural light, natural shadows from window light, bright and airy atmosphere, genuine indoor natural lighting as if someone is genuinely recording inside near a window with their phone'
};

type Step = 'sceneCount' | `scene${number}` | 'generate';

export default function VideoPromptGenerator() {
  // Estilo fijo para UGC videos
  const mainStyle: MainStyle = 'hyperrealistic';
  const productFocus: ProductFocus = 'ugc';
  
  // Generator type: 'ugc' or 'cinematic'
  const [generatorType, setGeneratorType] = useState<'ugc' | 'cinematic' | null>(null);
  
  // Mode: 'manual', 'automatic', or 'copy-video'
  const [mode, setMode] = useState<'manual' | 'automatic' | 'copy-video'>('manual');
  
  // Manual mode state
  const [sceneCount, setSceneCount] = useState<number>(1);
  const [scenes, setScenes] = useState<Scene[]>([{ 
    id: 1, 
    action: '', 
    script: null, 
    scriptAdaptation: 'adapt', // Default: adapt script to time
    composition: [], 
    cameraAngle: [], 
    lighting: null, 
    duration: 1,
    referenceImage: null,
    referenceImagePreview: null,
    copyLighting: false,
    copyCameraAngle: false,
    noDialogue: false,
    lipSync: false,
    voiceover: false,
    continuousAction: false
  }]);
  const [currentStep, setCurrentStep] = useState<Step>('sceneCount');
  
  // Automatic mode state
  const [autoMode, setAutoMode] = useState<'describe' | 'script'>('describe');
  const [autoDescription, setAutoDescription] = useState<string>('');
  const [autoScript, setAutoScript] = useState<string>('');
  const [bRollAnimation, setBRollAnimation] = useState<boolean>(false); // B-roll: action only, no script, hyperrealistic
  const [isUGC, setIsUGC] = useState<boolean>(true); // UGC mode ON by default
  
  // Copy Video mode state
  const [referenceVideo, setReferenceVideo] = useState<File | null>(null);
  const [referenceVideoPreview, setReferenceVideoPreview] = useState<string | null>(null);
  const [copyVideoDuration, setCopyVideoDuration] = useState<number>(10); // Default 10 seconds
  const [copyVideoImage, setCopyVideoImage] = useState<File | null>(null);
  const [copyVideoImagePreview, setCopyVideoImagePreview] = useState<string | null>(null);
  const [copyVideoChanges, setCopyVideoChanges] = useState<string>('');
  const [copyVideoScript, setCopyVideoScript] = useState<string>('');
  
  // Cinematic mode state
  const [cinematicMode, setCinematicMode] = useState<'manual' | 'automatic'>('manual');
  const [cinematicAutoMode, setCinematicAutoMode] = useState<'describe' | 'script'>('describe');
  const [cinematicDescription, setCinematicDescription] = useState<string>('');
  const [cinematicScript, setCinematicScript] = useState<string>('');
  const [cinematicDuration, setCinematicDuration] = useState<number>(10);
  const [cinematicCameraAngles, setCinematicCameraAngles] = useState<string[]>([]);
  const [cinematicCameraMovements, setCinematicCameraMovements] = useState<string[]>([]);
  
  // Shared state
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [firstFramePrompt, setFirstFramePrompt] = useState<string>('');
  const [isGeneratingFirstFrame, setIsGeneratingFirstFrame] = useState<boolean>(false);
  const [extendPrompt, setExtendPrompt] = useState<string>('');
  const [isGeneratingExtend, setIsGeneratingExtend] = useState<boolean>(false);
  const [showExtendModal, setShowExtendModal] = useState<boolean>(false);
  const [extendScript, setExtendScript] = useState<string>('');
  const [extendActions, setExtendActions] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [productPhotoWillBeAttached, setProductPhotoWillBeAttached] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isInsufficientCredits, setIsInsufficientCredits] = useState<boolean>(false);

  const handleSceneCountChange = (count: number) => {
    setSceneCount(count);
    const newScenes: Scene[] = [];
    for (let i = 1; i <= count; i++) {
      newScenes.push(
        scenes[i - 1] || { 
          id: i, 
          action: '', 
          script: null, 
          scriptAdaptation: 'adapt',
          composition: [], 
          cameraAngle: [], 
          lighting: null, 
          duration: 1,
          referenceImage: null,
          referenceImagePreview: null,
          copyLighting: false,
          copyCameraAngle: false,
          noDialogue: false,
          lipSync: false,
          voiceover: false,
          continuousAction: false
        }
      );
    }
    setScenes(newScenes);
    // Si hay escenas, ir a la primera escena
    if (count > 0) {
      setCurrentStep('scene1' as Step);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProductImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProductPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReferenceVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file type
      if (!file.type.startsWith('video/')) {
        setError('Please upload a video file');
        return;
      }
      setReferenceVideo(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReferenceVideoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCopyVideoImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCopyVideoImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setCopyVideoImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeCopyVideoImage = () => {
    setCopyVideoImage(null);
    setCopyVideoImagePreview(null);
  };

  const compressAndConvertToBase64 = async (file: File): Promise<string> => {
    // Simple compression for images
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const compressVideo = async (file: File): Promise<File> => {
    // For now, just return the file as-is
    // In production, you might want to compress large videos
    // Video compression is complex and might require a library like ffmpeg
    return file;
  };

  const generatePromptFromVideo = async () => {
    if (!referenceVideo) {
      setError('Please upload a reference video');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setIsInsufficientCredits(false);
    setGeneratedPrompt('');

    try {
      // Validate video file
      const maxVideoSizeOriginal = 100 * 1024 * 1024; // 100MB original file limit
      
      // Check original file size
      if (referenceVideo.size > maxVideoSizeOriginal) {
        setError(`Video file is too large (${(referenceVideo.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 100MB. Please use a smaller video file or compress it.`);
        setIsGenerating(false);
        return;
      }

      // Validate video format
      const validVideoTypes = ['video/mp4', 'video/mov', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/avi'];
      if (!validVideoTypes.includes(referenceVideo.type) && !referenceVideo.name.match(/\.(mp4|mov|webm|avi)$/i)) {
        console.warn('Video type not recognized, but proceeding:', referenceVideo.type);
      }

      // Send video directly as FormData to the main endpoint (avoids 413 error)
      // The endpoint will handle the upload to Gemini Files internally
      console.log('Sending video to generate prompt...');
      const formData = new FormData();
      formData.append('video', referenceVideo);
      if (copyVideoImage) {
        formData.append('image', copyVideoImage);
      }
      formData.append('duration', copyVideoDuration.toString());
      if (copyVideoChanges.trim()) {
        formData.append('changes', copyVideoChanges.trim());
      }
      if (copyVideoScript.trim()) {
        formData.append('script', copyVideoScript.trim());
      }

      let response: Response;
      try {
        response = await fetch('/api/generate-video-prompt-from-video', {
          method: 'POST',
          body: formData,
          // Don't set Content-Type header - browser will set it automatically with boundary for FormData
        });
      } catch (fetchError: any) {
        console.error('Error making request:', fetchError);
        setError('Network error. Please check your internet connection and try again.');
        setIsGenerating(false);
        return;
      }

      // Check if response is ok before parsing JSON
      let data: any;
      try {
        data = await response.json();
      } catch (jsonError) {
        // If response is not JSON, use status text
        const statusText = response.statusText || 'Unknown error';
        setError(`Error ${response.status}: ${statusText}`);
        setIsGenerating(false);
        return;
      }

      if (!response.ok) {
        if (response.status === 402) {
          setIsInsufficientCredits(true);
          setError(null);
        } else if (response.status === 413 || response.statusText === 'Payload Too Large') {
          setError(`Video file is too large. The request size exceeds the server limit. Please use a smaller video file (max 100MB original file size).`);
          setIsInsufficientCredits(false);
        } else if (response.status === 429) {
          setError(`Rate limit exceeded. ${data.details || 'Please try again later.'}`);
          setIsInsufficientCredits(false);
        } else if (response.status === 400) {
          setError(data.error || 'Invalid request. Please check your video file and try again.');
          setIsInsufficientCredits(false);
        } else if (response.status === 500) {
          const errorMessage = data.error || 'Server error while processing video';
          const errorDetails = data.details ? `\n\nDetails: ${data.details}` : '';
          setError(`${errorMessage}${errorDetails}`);
          setIsInsufficientCredits(false);
        } else {
          const errorMessage = data.error || 'Failed to generate prompt from video';
          const errorDetails = data.details ? `\n\nDetails: ${data.details}` : '';
          setError(`${errorMessage}${errorDetails}`);
          setIsInsufficientCredits(false);
        }
        return;
      }

      if (!data.prompt) {
        setError('No prompt was generated. Please try again.');
        return;
      }

      setGeneratedPrompt(data.prompt || '');
    } catch (err: any) {
      console.error('Error generating prompt from video:', err);
      
      // Provide more descriptive error messages
      let errorMessage = 'An error occurred while generating the prompt from video';
      
      if (err?.message) {
        errorMessage = err.message;
      } else if (err?.name === 'NetworkError' || err?.message?.includes('network') || err?.message?.includes('fetch')) {
        errorMessage = 'Network error. Please check your internet connection and try again.';
      } else if (err?.message?.includes('video') || err?.message?.includes('Video')) {
        errorMessage = `Video error: ${err.message}`;
      } else if (err?.message?.includes('size') || err?.message?.includes('too large')) {
        errorMessage = 'Video file is too large. Please use a smaller video file (max 100MB).';
      } else if (err?.message?.includes('format') || err?.message?.includes('Format')) {
        errorMessage = 'Unsupported video format. Please use MP4, MOV, or WebM format.';
      }
      
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const enhanceActionWithAI = async (
    actionText: string, 
    script: string | null, 
    compositions: string[], 
    cameraAngles: string[], 
    lighting: string | null, 
    duration: number | null, 
    updateState: boolean = false, 
    sceneId?: number, 
    allScenes?: Scene[], 
    currentSceneIndex?: number,
    referenceImage?: File | null,
    copyLighting?: boolean,
    copyCameraAngle?: boolean,
    noDialogue?: boolean,
    lipSync?: boolean,
    voiceover?: boolean,
    continuousAction?: boolean,
    scriptAdaptation?: 'adapt' | 'keep'
  ) => {
    // Validate inputs with detailed logging
    if (!actionText || !actionText.trim()) {
      console.warn(`enhanceActionWithAI: Scene ${currentSceneIndex !== undefined ? currentSceneIndex + 1 : sceneId || 'unknown'} - No action text provided`);
      return actionText;
    }
    if (!compositions || compositions.length === 0) {
      console.warn(`enhanceActionWithAI: Scene ${currentSceneIndex !== undefined ? currentSceneIndex + 1 : sceneId || 'unknown'} - No compositions provided`);
      return actionText;
    }
    if (!lighting) {
      console.warn(`enhanceActionWithAI: Scene ${currentSceneIndex !== undefined ? currentSceneIndex + 1 : sceneId || 'unknown'} - No lighting provided`);
      return actionText;
    }

    // If duration is 1 (default), treat it as null (don't include in prompt)
    const effectiveDuration = duration === 1 ? null : duration;

    // If updateState is true, mark scene as enhancing
    if (updateState && sceneId !== undefined) {
      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === sceneId ? { ...scene, isEnhancing: true } : scene
      ));
    }

    try {
      // Convert product image to base64 if provided
      let productImageBase64 = null;
      if (productImage) {
        productImageBase64 = await fileToBase64(productImage);
      }

      // Convert reference image to base64 if provided
      let referenceImageBase64 = null;
      if (referenceImage) {
        referenceImageBase64 = await fileToBase64(referenceImage);
      }

      const response = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actionText,
          script: noDialogue ? null : script, // If noDialogue is true, don't send script
          compositions,
          cameraAngles,
          lighting,
          duration: effectiveDuration,
          mainStyle,
          productFocus,
          allScenes: allScenes || scenes,
          currentSceneIndex: currentSceneIndex !== undefined ? currentSceneIndex : (sceneId ? sceneId - 1 : 0),
          productImage: productImageBase64,
          referenceImage: referenceImageBase64,
          copyLighting: copyLighting || false,
          copyCameraAngle: copyCameraAngle || false,
          noDialogue: noDialogue || false,
          lipSync: lipSync || false,
          voiceover: voiceover || false,
          continuousAction: continuousAction || false,
          scriptAdaptation: scriptAdaptation || 'adapt',
          productPhotoWillBeAttached: productPhotoWillBeAttached
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          // Insufficient credits - throw a special error that can be caught
          throw new Error('Insufficient credits');
        }
        const errorMessage = data.error || data.details || 'Error enhancing prompt';
        const sceneNum = currentSceneIndex !== undefined ? currentSceneIndex + 1 : sceneId || 'unknown';
        console.error(`API error for scene ${sceneNum}:`, errorMessage, data);
        throw new Error(`Scene ${sceneNum}: ${errorMessage}`);
      }

      const enhancedText = data.enhancedText || actionText;
      
      // Validate that we got an enhanced text
      if (!enhancedText || !enhancedText.trim()) {
        const errorMsg = `API returned empty enhanced text for scene ${currentSceneIndex !== undefined ? currentSceneIndex + 1 : sceneId || 'unknown'}`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Validate that the enhanced text is actually different (not just the same)
      if (enhancedText.trim() === actionText.trim()) {
        console.warn(`API returned same text as input for scene ${currentSceneIndex !== undefined ? currentSceneIndex + 1 : sceneId || 'unknown'}. This might indicate an issue.`);
        // Don't throw - return it anyway, but log the warning
      }
      
      // If updateState is true, update with enhanced text
      if (updateState && sceneId !== undefined) {
        setScenes(prevScenes => prevScenes.map(scene => 
          scene.id === sceneId ? { ...scene, action: enhancedText, isEnhancing: false } : scene
        ));
      }

      return enhancedText;
    } catch (error: any) {
      console.error('Error enhancing prompt:', error);
      // Remove enhancing state on error
      if (updateState && sceneId !== undefined) {
        setScenes(prevScenes => prevScenes.map(scene => 
          scene.id === sceneId ? { ...scene, isEnhancing: false } : scene
        ));
      }
      // If it's a credit error, propagate it
      if (error.message && error.message.includes('Insufficient credits')) {
        throw error;
      }
      return actionText; // Return original text on other errors
    }
  };

  const updateScene = (id: number, field: keyof Scene, value: string | null | string[] | number | null | boolean | File) => {
    setScenes(prevScenes => {
      const scene = prevScenes.find(s => s.id === id);
      if (!scene) return prevScenes;

      // Actualizar el campo seleccionado
      const updatedScenes = prevScenes.map(s => 
        s.id === id ? { ...s, [field]: value } : s
      );

      const updatedScene = updatedScenes.find(s => s.id === id);
      if (!updatedScene) return updatedScenes;

      // If composition or lighting selected and no text, use default
      if (field === 'composition' && Array.isArray(value) && value.length > 0 && !updatedScene.action) {
        // Use first composition's default text
        const firstComposition = value[0];
        const defaultText = typeof firstComposition === 'string' ? (DEFAULT_COMPOSITION_TEXTS[firstComposition] || 'A scene showing the product') : 'A scene showing the product';
        return updatedScenes.map(s => 
          s.id === id ? { ...s, action: defaultText } : s
        );
      } else if (field === 'lighting' && value && typeof value === 'string' && !updatedScene.action) {
        const defaultText = DEFAULT_LIGHTING_TEXTS[value] || 'A scene with special lighting';
        return updatedScenes.map(s => 
          s.id === id ? { ...s, action: defaultText } : s
        );
      }

      return updatedScenes;
    });
  };

  const handleReferenceImageChange = async (id: number, file: File | null) => {
    if (!file) {
      updateScene(id, 'referenceImage', null);
      updateScene(id, 'referenceImagePreview', null);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      updateScene(id, 'referenceImagePreview', reader.result as string);
    };
    reader.readAsDataURL(file);
    updateScene(id, 'referenceImage', file);
  };

  const toggleComposition = (id: number, composition: string) => {
    setScenes(prevScenes => {
      const scene = prevScenes.find(s => s.id === id);
      if (!scene) return prevScenes;
      
      const currentCompositions = scene.composition || [];
      const isSelected = currentCompositions.includes(composition);
      
      const newCompositions = isSelected
        ? currentCompositions.filter(c => c !== composition)
        : [...currentCompositions, composition];

      return prevScenes.map(s => 
        s.id === id ? { ...s, composition: newCompositions } : s
      );
    });
  };

  const toggleCameraAngle = (id: number, cameraAngle: string) => {
    setScenes(prevScenes => {
      const scene = prevScenes.find(s => s.id === id);
      if (!scene) return prevScenes;
      
      const currentCameraAngles = scene.cameraAngle || [];
      const isSelected = currentCameraAngles.includes(cameraAngle);
      
      const newCameraAngles = isSelected
        ? currentCameraAngles.filter(c => c !== cameraAngle)
        : [...currentCameraAngles, cameraAngle];

      return prevScenes.map(s => 
        s.id === id ? { ...s, cameraAngle: newCameraAngles } : s
      );
    });
  };

  const generatePromptManual = async () => {
    setIsGenerating(true);
    setGeneratedPrompt('');
    setError(null);
    setIsInsufficientCredits(false);

    try {
      // Enhance each scene with AI before generating the prompt
      // Process scenes sequentially to ensure all are enhanced and catch errors properly
      const enhancedScenes = [];
      for (let index = 0; index < scenes.length; index++) {
        const scene = scenes[index];
        let finalAction = scene.action;

        // If composition and lighting exist, enhance text with AI
        // Camera angle is optional but recommended
        if (scene.composition && scene.composition.length > 0 && scene.lighting) {
          // If no action text, use default from first composition or lighting
          if (!finalAction || !finalAction.trim()) {
            finalAction = DEFAULT_COMPOSITION_TEXTS[scene.composition[0]] || 
                         DEFAULT_LIGHTING_TEXTS[scene.lighting] || 
                         'A scene showing the product';
          }
          
          // Ensure we have action text before enhancing
          if (finalAction && finalAction.trim()) {
            // Enhance with AI (without updating state, just get enhanced text)
            // Pass all scenes and current index for consistency
            // If duration is 1 (default), pass null to not include it in prompt
            const effectiveDuration = scene.duration === 1 ? null : scene.duration;
            try {
              console.log(`Enhancing scene ${index + 1} with action: "${finalAction.substring(0, 50)}..."`);
              const enhanced = await enhanceActionWithAI(
                finalAction,
                scene.script,
                scene.composition,
                scene.cameraAngle || [],
                scene.lighting,
                effectiveDuration,
                false,
                scene.id,
                scenes,
                index,
                scene.referenceImage,
                scene.copyLighting,
                scene.copyCameraAngle,
                scene.noDialogue,
                scene.lipSync,
                scene.voiceover,
                scene.continuousAction,
                scene.scriptAdaptation
              );
              
              // Verify that the enhanced text is actually different from the original
              if (enhanced && enhanced.trim() && enhanced !== finalAction) {
                finalAction = enhanced;
                console.log(`Scene ${index + 1} successfully enhanced`);
              } else {
                console.warn(`Scene ${index + 1} enhancement returned same or empty text, retrying...`);
                // Retry once if enhancement failed
                try {
                  const retryEnhanced = await enhanceActionWithAI(
                    finalAction,
                    scene.script,
                    scene.composition,
                    scene.cameraAngle || [],
                    scene.lighting,
                    effectiveDuration,
                    false,
                    scene.id,
                    scenes,
                    index,
                    scene.referenceImage,
                    scene.copyLighting,
                    scene.copyCameraAngle,
                    scene.noDialogue,
                    scene.lipSync,
                    scene.voiceover,
                    scene.continuousAction,
                    scene.scriptAdaptation
                  );
                  if (retryEnhanced && retryEnhanced.trim() && retryEnhanced !== finalAction) {
                    finalAction = retryEnhanced;
                    console.log(`Scene ${index + 1} successfully enhanced on retry`);
                  } else {
                    console.error(`Scene ${index + 1} enhancement failed after retry, using original text`);
                  }
                } catch (retryError: any) {
                  console.error(`Scene ${index + 1} retry failed:`, retryError);
                }
              }
            } catch (enhanceError: any) {
              // If error is about insufficient credits, throw it to stop the process
              if (enhanceError.message && enhanceError.message.includes('Insufficient credits')) {
                throw enhanceError;
              }
              // For other errors, log and use original text but show warning
              console.error(`Error enhancing scene ${index + 1}:`, enhanceError);
              console.warn(`Scene ${index + 1} will use original action text due to enhancement error:`, enhanceError.message || enhanceError);
              // Don't throw - continue with other scenes
            }
          } else {
            console.warn(`Scene ${index + 1} has no action text to enhance`);
          }
        } else if (!finalAction || !finalAction.trim()) {
          // If not both parameters but one exists, use default text
          if (scene.composition && scene.composition.length > 0) {
            finalAction = DEFAULT_COMPOSITION_TEXTS[scene.composition[0]] || 'A scene showing the product';
          } else if (scene.lighting) {
            finalAction = DEFAULT_LIGHTING_TEXTS[scene.lighting] || 'A scene with special lighting';
          }
        }

        enhancedScenes.push({
          ...scene,
          action: finalAction || scene.action
        });
      }

      // Generate final prompt with enhanced scenes
      let prompt = '';

      // Only generate scene number and enhanced action
      enhancedScenes.forEach((scene, index) => {
        prompt += `Scene ${index + 1}:\n`;
        if (scene.action) {
          prompt += `- Action: ${scene.action}\n`;
        }
      });

      setGeneratedPrompt(prompt);
      // Stay on generate step to show result
    } catch (error: any) {
      console.error('Error generating prompt:', error);
      if (error.message && error.message.includes('Insufficient credits')) {
        setIsInsufficientCredits(true);
        setError(null);
        setGeneratedPrompt('');
      } else {
        setError('Error generating prompt. Please try again.');
        setIsInsufficientCredits(false);
        setGeneratedPrompt('');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const generatePromptAutomatic = async () => {
    if (!autoDescription.trim()) {
      alert('Please enter a description');
      return;
    }

    setIsGenerating(true);
    setGeneratedPrompt('');
    setError(null);
    setIsInsufficientCredits(false);

    try {
      // Convert product image to base64 if provided
      let productImageBase64 = null;
      if (productImage) {
        productImageBase64 = await fileToBase64(productImage);
      }

      const response = await fetch('/api/generate-video-prompt-auto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: autoDescription.trim(),
          productImage: productImageBase64,
          isUGC: isUGC,
          bRollAnimation: bRollAnimation
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          // Insufficient credits
          setIsInsufficientCredits(true);
          setError(null);
          setGeneratedPrompt('');
          setIsGenerating(false);
          return;
        }
        throw new Error(data.error || 'Error generating prompt');
      }

      // If scenes are returned, populate the scenes automatically
      if (data.scenes && Array.isArray(data.scenes) && data.scenes.length > 0) {
        // Update scene count if needed
        if (data.scenes.length !== scenes.length) {
          setSceneCount(data.scenes.length);
        }

        // Create updated scenes with auto-generated data
        const updatedScenes = data.scenes.map((autoScene: any, index: number) => {
          const existingScene = scenes[index] || {
            id: `scene-${index}`,
            action: '',
            script: null,
            scriptAdaptation: 'adapt',
            composition: [],
            cameraAngle: [],
            lighting: null,
            duration: 1,
            referenceImage: null,
            referenceImagePreview: null,
            copyLighting: false,
            copyCameraAngle: false,
            noDialogue: false,
            lipSync: false,
            voiceover: false,
            continuousAction: false
          };

          return {
            ...existingScene,
            action: autoScene.action || existingScene.action,
            script: autoScene.script || existingScene.script,
            composition: Array.isArray(autoScene.composition) ? autoScene.composition : existingScene.composition,
            cameraAngle: Array.isArray(autoScene.cameraAngle) ? autoScene.cameraAngle : existingScene.cameraAngle,
            lighting: autoScene.lighting || existingScene.lighting,
            duration: autoScene.duration || existingScene.duration,
            lipSync: autoScene.lipSync !== undefined ? autoScene.lipSync : existingScene.lipSync,
            voiceover: autoScene.voiceover !== undefined ? autoScene.voiceover : existingScene.voiceover,
            noDialogue: autoScene.noDialogue !== undefined ? autoScene.noDialogue : existingScene.noDialogue
          };
        });

        // Update scenes state
        setScenes(updatedScenes);

        // Output as single paragraph: join all scene actions into one continuous paragraph
        const paragraphPrompt = updatedScenes
          .map((s: { action?: string }) => s.action?.trim() || '')
          .filter(Boolean)
          .join(' ');
        setGeneratedPrompt(paragraphPrompt || data.prompt || '');

        // Show success message
        setError(null);
        setIsInsufficientCredits(false);
        
        // Optionally show a message that scenes were auto-filled
        alert(`¡Éxito! Se generaron ${data.scenes.length} escena(s). El prompt está en un solo párrafo listo para copiar.`);
      } else {
        // Fallback to old format if prompt is returned
        setGeneratedPrompt(data.prompt || '');
      }
    } catch (error: any) {
      console.error('Error generating automatic prompt:', error);
      // Check if it's a credit error from the response
      if (error.message && error.message.includes('Insufficient credits')) {
        setIsInsufficientCredits(true);
        setError(null);
      } else {
        setError(`Error generating prompt: ${error.message || 'Please try again.'}`);
        setIsInsufficientCredits(false);
      }
      setGeneratedPrompt('');
    } finally {
      setIsGenerating(false);
    }
  };

  const generatePromptFromScript = async () => {
    if (!autoScript.trim()) {
      alert('Please enter a script');
      return;
    }

    setIsGenerating(true);
    setGeneratedPrompt('');
    setError(null);
    setIsInsufficientCredits(false);

    try {
      // Convert product image to base64 if provided
      let productImageBase64 = null;
      if (productImage) {
        productImageBase64 = await fileToBase64(productImage);
      }

      const response = await fetch('/api/generate-video-prompt-from-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script: autoScript.trim(),
          productImage: productImageBase64,
          isUGC: isUGC,
          productPhotoWillBeAttached: productPhotoWillBeAttached
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          // Insufficient credits
          setIsInsufficientCredits(true);
          setError(null);
          setGeneratedPrompt('');
          setIsGenerating(false);
          return;
        }
        throw new Error(data.error || 'Error generating prompt from script');
      }

      // Set the generated prompt directly (formatted as scenes)
      if (data.prompt) {
        setGeneratedPrompt(data.prompt);
        setError(null);
        setIsInsufficientCredits(false);
      } else {
        throw new Error('No prompt generated');
      }
    } catch (error: any) {
      console.error('Error generating prompt from script:', error);
      // Check if it's a credit error from the response
      if (error.message && error.message.includes('Insufficient credits')) {
        setIsInsufficientCredits(true);
        setError(null);
      } else {
        setError(`Error generating prompt: ${error.message || 'Please try again.'}`);
        setIsInsufficientCredits(false);
      }
      setGeneratedPrompt('');
    } finally {
      setIsGenerating(false);
    }
  };

  const compositionOptions = mainStyle ? COMPOSITION_OPTIONS[mainStyle] : [];
  const cameraAngleOptions = mainStyle ? CAMERA_ANGLE_OPTIONS[mainStyle] : [];
  const lightingOptions = mainStyle ? LIGHTING_OPTIONS[mainStyle] : [];

  // Funciones de navegación
  const goToStep = (step: Step) => {
    // Validar que se puede ir a ese paso
    if (step === 'generate' && sceneCount === 0) return;
    
    setCurrentStep(step);
  };

  const nextStep = () => {
    if (currentStep === 'sceneCount' && sceneCount > 0) {
      goToStep('scene1' as Step);
    } else if (currentStep.startsWith('scene')) {
      const sceneNum = parseInt(currentStep.replace('scene', ''));
      if (sceneNum < sceneCount) {
        goToStep(`scene${sceneNum + 1}` as Step);
      } else {
        goToStep('generate');
      }
    }
  };

  const prevStep = () => {
    if (currentStep === 'sceneCount') {
      // No hay paso anterior al primero
      return;
    } else if (currentStep.startsWith('scene')) {
      const sceneNum = parseInt(currentStep.replace('scene', ''));
      if (sceneNum > 1) {
        goToStep(`scene${sceneNum - 1}` as Step);
      } else {
        goToStep('sceneCount');
      }
    } else if (currentStep === 'generate') {
      goToStep(`scene${sceneCount}` as Step);
    }
  };

  const getCurrentSceneNumber = (): number => {
    if (currentStep.startsWith('scene')) {
      return parseInt(currentStep.replace('scene', ''));
    }
    return 0;
  };

  const canGoNext = () => {
    if (currentStep.startsWith('scene')) {
      return true; // Siempre se puede avanzar desde las escenas
    }
    switch (currentStep) {
      case 'sceneCount':
        return sceneCount > 0;
      case 'generate':
        return false;
      default:
        return false;
    }
  };

  const canGoPrev = () => {
    return currentStep !== 'sceneCount';
  };

  // Helper to check mode without type narrowing issues
  const isManualMode = mode === 'manual';
  const isAutomaticMode = mode === 'automatic';
  const showModeSelection = !mode || (isManualMode && currentStep === 'sceneCount' && !generatedPrompt) || (mode === 'copy-video' && !generatedPrompt);

  // Function to generate cinematic prompt
  const generateCinematicPrompt = async () => {
    // Validate based on mode
    if (cinematicMode === 'automatic') {
      if (cinematicAutoMode === 'describe') {
        if (!cinematicDescription.trim()) {
          setError('Please describe what you want in your cinematic video');
          return;
        }
      } else if (cinematicAutoMode === 'script') {
        if (!cinematicScript.trim()) {
          setError('Please enter a script');
          return;
        }
      }
    } else {
      // Manual mode
      if (!cinematicDescription.trim()) {
        setError('Please describe what you want in your cinematic video');
        return;
      }

      if (cinematicCameraAngles.length === 0) {
        setError('Please select at least one camera angle');
        return;
      }

      if (cinematicCameraMovements.length === 0) {
        setError('Please select at least one camera movement');
        return;
      }
    }

    setIsGenerating(true);
    setError(null);
    setIsInsufficientCredits(false);
    setGeneratedPrompt('');

    try {
      // Convert product image to base64 if provided
      let productImageBase64 = null;
      if (productImage) {
        productImageBase64 = await fileToBase64(productImage);
      }

      const response = await fetch('/api/generate-cinematic-video-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: cinematicMode === 'automatic' && cinematicAutoMode === 'script' ? null : cinematicDescription.trim(),
          script: cinematicMode === 'automatic' && cinematicAutoMode === 'script' ? cinematicScript.trim() : null,
          duration: cinematicDuration,
          mode: cinematicMode,
          autoMode: cinematicMode === 'automatic' ? cinematicAutoMode : null,
          cameraAngles: cinematicMode === 'manual' ? cinematicCameraAngles : null,
          cameraMovements: cinematicMode === 'manual' ? cinematicCameraMovements : null,
          productImage: productImageBase64,
          productPhotoWillBeAttached: productPhotoWillBeAttached
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          setIsInsufficientCredits(true);
          setError(null);
          setGeneratedPrompt('');
          setIsGenerating(false);
          return;
        }
        throw new Error(data.error || 'Error generating cinematic prompt');
      }

      if (data.prompt) {
        setGeneratedPrompt(data.prompt);
        setError(null);
        setIsInsufficientCredits(false);
      } else {
        throw new Error('No prompt generated');
      }
    } catch (error: any) {
      console.error('Error generating cinematic prompt:', error);
      if (error.message && error.message.includes('Insufficient credits')) {
        setIsInsufficientCredits(true);
        setError(null);
      } else {
        setError(`Error generating prompt: ${error.message || 'Please try again.'}`);
        setIsInsufficientCredits(false);
      }
      setGeneratedPrompt('');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleCinematicCameraAngle = (angle: string) => {
    setCinematicCameraAngles(prev => 
      prev.includes(angle) 
        ? prev.filter(a => a !== angle)
        : [...prev, angle]
    );
  };

  const generateFirstFramePrompt = async () => {
    if (!generatedPrompt || !generatedPrompt.trim()) {
      setError('No video prompt available to generate first frame');
      return;
    }

    setIsGeneratingFirstFrame(true);
    setFirstFramePrompt('');
    setError(null);
    setIsInsufficientCredits(false);

    try {
      const response = await fetch('/api/generate-first-frame-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoPrompt: generatedPrompt
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          setIsInsufficientCredits(true);
          setError(null);
          setFirstFramePrompt('');
          setIsGeneratingFirstFrame(false);
          return;
        }
        throw new Error(data.error || 'Error generating first frame prompt');
      }

      if (data.prompt) {
        setFirstFramePrompt(data.prompt);
        setError(null);
        setIsInsufficientCredits(false);
      } else {
        throw new Error('No first frame prompt generated');
      }
    } catch (error: any) {
      console.error('Error generating first frame prompt:', error);
      if (error.message && error.message.includes('Insufficient credits')) {
        setIsInsufficientCredits(true);
        setError(null);
      } else {
        setError(`Error generating first frame prompt: ${error.message || 'Please try again.'}`);
        setIsInsufficientCredits(false);
      }
      setFirstFramePrompt('');
    } finally {
      setIsGeneratingFirstFrame(false);
    }
  };

  const generateExtendPrompt = async () => {
    if (!generatedPrompt || !generatedPrompt.trim()) {
      setError('No video prompt available to extend');
      return;
    }

    if (!extendScript.trim() && !extendActions.trim()) {
      setError('Please provide either a new script or new actions');
      return;
    }

    setIsGeneratingExtend(true);
    setExtendPrompt('');
    setError(null);
    setIsInsufficientCredits(false);

    try {
      const response = await fetch('/api/generate-extend-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          originalPrompt: generatedPrompt,
          newScript: extendScript.trim() || null,
          newActions: extendActions.trim() || null
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          setIsInsufficientCredits(true);
          setError(null);
          setExtendPrompt('');
          setIsGeneratingExtend(false);
          setShowExtendModal(false);
          return;
        }
        throw new Error(data.error || 'Error generating extend prompt');
      }

      if (data.prompt) {
        setExtendPrompt(data.prompt);
        setError(null);
        setIsInsufficientCredits(false);
        setShowExtendModal(false);
      } else {
        throw new Error('No extend prompt generated');
      }
    } catch (error: any) {
      console.error('Error generating extend prompt:', error);
      if (error.message && error.message.includes('Insufficient credits')) {
        setIsInsufficientCredits(true);
        setError(null);
      } else {
        setError(`Error generating extend prompt: ${error.message || 'Please try again.'}`);
        setIsInsufficientCredits(false);
      }
      setExtendPrompt('');
    } finally {
      setIsGeneratingExtend(false);
    }
  };

  const toggleCinematicCameraMovement = (movement: string) => {
    setCinematicCameraMovements(prev => 
      prev.includes(movement) 
        ? prev.filter(m => m !== movement)
        : [...prev, movement]
    );
  };

  return (
    <DashboardLayout>
      <div className="mb-8 text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/70">
          Video Prompt Generator
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          AI Video Prompt Generator
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">
          Create professional video prompts for AI video generation with full control over cinematic elements.
        </p>
      </div>

      <div className="space-y-8">
        {/* Generator Type Selection - Show when no type selected */}
        {generatorType === null && (
          <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="mb-6">
              <label className="block text-lg font-bold uppercase tracking-widest text-amber-400/90 mb-2">
                Select Generator Type
              </label>
              <p className="text-sm text-zinc-500 mb-6">
                Choose between UGC (User-Generated Content) style or Cinematic professional style
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setGeneratorType('ugc');
                    setMode('manual');
                    setCurrentStep('sceneCount');
                    setGeneratedPrompt('');
                  }}
                  className="group relative rounded-xl border-2 px-6 py-6 text-left transition-all duration-200 border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_25px_rgba(250,204,21,0.3)] ring-2 ring-amber-500/30 hover:shadow-[0_0_30px_rgba(250,204,21,0.4)]"
                >
                  <div className="font-bold text-lg mb-2">UGC AI Prompt Generator</div>
                  <div className="text-sm opacity-90">Create hyperrealistic UGC video prompts with authentic mobile aesthetics</div>
                  <span className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs text-zinc-900 font-bold">
                    →
                  </span>
                </button>
                <button
                  onClick={() => {
                    setGeneratorType('cinematic');
                    setGeneratedPrompt('');
                  }}
                  className="group relative rounded-xl border-2 px-6 py-6 text-left transition-all duration-200 border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 text-purple-200 shadow-[0_0_25px_rgba(168,85,247,0.3)] ring-2 ring-purple-500/30 hover:shadow-[0_0_30px_rgba(168,85,247,0.4)]"
                >
                  <div className="font-bold text-lg mb-2">Cinematic Video Prompt Generator</div>
                  <div className="text-sm opacity-90">Create professional cinematic video prompts with advanced camera angles and movements</div>
                  <span className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-xs text-zinc-900 font-bold">
                    →
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* UGC Mode - Show existing UGC interface */}
        {generatorType === 'ugc' && (
          <>
            {/* Mode Selection - Show when no mode selected or when manually navigating back */}
            {showModeSelection && (
          <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="mb-6">
              <label className="block text-lg font-bold uppercase tracking-widest text-amber-400/90 mb-2">
                Select Mode
              </label>
              <p className="text-sm text-zinc-500 mb-6">
                Choose between manual scene-by-scene control or automatic AI generation
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setMode('manual');
                    setCurrentStep('sceneCount');
                    setGeneratedPrompt(''); // Reset prompt when switching modes
                  }}
                  className={`group relative rounded-xl border-2 px-6 py-6 text-left transition-all duration-200 ${
                    isManualMode
                      ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_25px_rgba(250,204,21,0.3)] ring-2 ring-amber-500/30'
                      : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90'
                  }`}
                >
                  <div className="font-bold text-lg mb-2">Manual</div>
                  <div className="text-sm opacity-90">Full control: choose scenes, compositions, lighting, and durations</div>
                  {isManualMode && (
                    <span className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs text-zinc-900 font-bold">
                      ✓
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setMode('automatic');
                    setGeneratedPrompt(''); // Reset prompt when switching modes
                  }}
                  className={`group relative rounded-xl border-2 px-6 py-6 text-left transition-all duration-200 ${
                    isAutomaticMode
                      ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_25px_rgba(250,204,21,0.3)] ring-2 ring-amber-500/30'
                      : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90'
                  }`}
                >
                  <div className="font-bold text-lg mb-2">Automatic</div>
                  <div className="text-sm opacity-90">AI generates complete prompt from simple description</div>
                  {isAutomaticMode && (
                    <span className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs text-zinc-900 font-bold">
                      ✓
                    </span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setMode('copy-video');
                    setGeneratedPrompt(''); // Reset prompt when switching modes
                  }}
                  className={`group relative rounded-xl border-2 px-6 py-6 text-left transition-all duration-200 ${
                    mode === 'copy-video'
                      ? 'border-green-500/80 bg-gradient-to-br from-green-500/20 to-green-500/10 text-green-200 shadow-[0_0_25px_rgba(34,197,94,0.3)] ring-2 ring-green-500/30'
                      : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-green-500/50 hover:bg-zinc-800/50 hover:text-green-300/90'
                  }`}
                >
                  <div className="font-bold text-lg mb-2">Copy Video</div>
                  <div className="text-sm opacity-90">Upload a video and get a prompt to recreate it</div>
                  {mode === 'copy-video' && (
                    <span className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs text-zinc-900 font-bold">
                      ✓
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual Mode: Step 1: Number of Scenes */}
        {mode === 'manual' && currentStep === 'sceneCount' && (
          <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
            <div className="mb-2">
              <label className="block text-lg font-bold uppercase tracking-widest text-amber-400/90">
                How many scenes do you want to create?
              </label>
              <p className="mt-2 text-sm text-zinc-500">
                Select the number of scenes for your hyperrealistic UGC video
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  onClick={() => handleSceneCountChange(num)}
                  className={`group relative rounded-xl border-2 px-6 py-8 text-center transition-all duration-200 text-2xl font-bold ${
                    sceneCount === num
                      ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_25px_rgba(250,204,21,0.3)] ring-2 ring-amber-500/30 scale-105'
                      : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90 hover:shadow-[0_0_15px_rgba(250,204,21,0.15)]'
                  }`}
                >
                  {num}
                  {sceneCount === num && (
                    <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs text-zinc-900 font-bold">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Scene Details - Cada escena es un paso individual */}
        {currentStep.startsWith('scene') && sceneCount > 0 && (() => {
          const currentSceneNum = getCurrentSceneNumber();
          const scene = scenes.find(s => s.id === currentSceneNum);
          if (!scene) return null;
          
          return (
            <div className="space-y-6">
              <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                <div className="mb-8 flex items-center justify-between border-b border-zinc-800/50 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-amber-300">
                      Scene {scene.id} of {sceneCount}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500">
                      Configure details to generate a hyperrealistic UGC prompt
                    </p>
                  </div>
                  <div className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                    scene.composition && scene.composition.length > 0 && scene.lighting && scene.cameraAngle && scene.cameraAngle.length > 0
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                      : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50'
                  }`}>
                    {scene.composition && scene.composition.length > 0 && scene.lighting && scene.cameraAngle && scene.cameraAngle.length > 0 ? '✓ Complete' : 'Pending'}
                  </div>
                </div>

                {/* Duration Selection */}
                <div className="mb-8">
                  <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
                    Scene Duration (seconds) <span className="text-xs font-normal text-zinc-500">(Default = no duration constraint)</span>
                  </label>
                  <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((seconds) => {
                      const isSelected = scene.duration === seconds;
                      const isDefault = seconds === 1;
                      return (
                        <button
                          key={seconds}
                          onClick={() => updateScene(scene.id, 'duration', seconds)}
                          disabled={scene.isEnhancing}
                          className={`group relative rounded-lg border-2 transition-all duration-200 ${
                            isDefault
                              ? `col-span-2 sm:col-span-1 px-4 sm:px-4 py-3 sm:py-3 text-xs sm:text-sm font-bold ${isSelected ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_15px_rgba(250,204,21,0.2)] ring-1 ring-amber-500/30' : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90 hover:shadow-[0_0_8px_rgba(250,204,21,0.1)]'}`
                              : `px-3 py-2 text-xs font-semibold ${isSelected ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_15px_rgba(250,204,21,0.2)] ring-1 ring-amber-500/30' : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90 hover:shadow-[0_0_8px_rgba(250,204,21,0.1)]'}`
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          <span className="relative z-10">{isDefault ? 'Default' : `${seconds}s`}</span>
                          {isSelected && !isDefault && (
                            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-amber-400 text-[10px]">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {scene.duration === 1 
                      ? 'Default selected - AI will not apply duration constraints to the prompt.'
                      : 'Custom duration selected - AI will adjust the prompt density and pacing accordingly.'}
                  </p>
                </div>

                {/* Action Text Box */}
                <div className="mb-8">
                  <div className="mb-3 flex items-center justify-between">
                    <label className="block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
                      Action Description
                    </label>
                    {scene.isEnhancing && (
                      <span className="flex items-center gap-2 text-xs font-medium text-amber-400 animate-pulse">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
                        Enhancing with AI...
                      </span>
                    )}
                  </div>
                  <textarea
                    value={scene.action}
                    onChange={(e) => updateScene(scene.id, 'action', e.target.value)}
                    placeholder="Describe the action happening in this scene..."
                    rows={4}
                    disabled={scene.isEnhancing}
                    className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                  />
                </div>

                {/* Script Text Box */}
                <div className="mb-8">
                  <div className="mb-3 flex items-center justify-between">
                    <label className="block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
                      Script (Optional)
                    </label>
                  </div>
                  <textarea
                    value={scene.script || ''}
                    onChange={(e) => updateScene(scene.id, 'script', e.target.value || null)}
                    placeholder="Enter the script/dialogue that should be spoken in this scene. The AI will integrate it with the actions and adjust it to fit the scene duration..."
                    rows={5}
                    disabled={scene.isEnhancing}
                    className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                  />
                  
                  {/* Script Adaptation Buttons */}
                  {scene.script && scene.script.trim() && (
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        onClick={() => updateScene(scene.id, 'scriptAdaptation', 'adapt')}
                        disabled={scene.isEnhancing}
                        className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                          scene.scriptAdaptation === 'adapt'
                            ? 'border-amber-500 bg-amber-500/20 text-amber-300 shadow-lg shadow-amber-500/20'
                            : 'border-zinc-700/50 bg-zinc-800/50 text-zinc-400 hover:border-amber-500/50 hover:bg-zinc-800/70 hover:text-amber-400/90'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        Adapt My Script to the Time
                      </button>
                      <button
                        type="button"
                        onClick={() => updateScene(scene.id, 'scriptAdaptation', 'keep')}
                        disabled={scene.isEnhancing}
                        className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                          scene.scriptAdaptation === 'keep'
                            ? 'border-amber-500 bg-amber-500/20 text-amber-300 shadow-lg shadow-amber-500/20'
                            : 'border-zinc-700/50 bg-zinc-800/50 text-zinc-400 hover:border-amber-500/50 hover:bg-zinc-800/70 hover:text-amber-400/90'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        Keep All My Script
                      </button>
                    </div>
                  )}
                  
                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
                    <p className="text-xs text-amber-300">
                      <strong>Note:</strong> The script will be integrated with the actions (e.g., "while lifting the head, says..."). {scene.scriptAdaptation === 'adapt' ? `The script duration target is ${scene.duration === 1 ? '15 seconds (default)' : `${scene.duration} seconds`}. If the script is too long, it will be adapted to fit the duration without sacrificing too much content.` : 'The entire script will be kept in the prompt without any adaptations, regardless of the duration.'}
                    </p>
                  </div>
                </div>

                {/* Composition Buttons - Multiple Selection */}
                <div className="mb-8">
                  <label className="mb-5 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
                    Camera Composition <span className="text-xs font-normal text-zinc-500">(Select multiple - AI will decide when to use each)</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {compositionOptions.map((option) => {
                      const isSelected = scene.composition?.includes(option) || false;
                      return (
                        <button
                          key={option}
                          onClick={() => toggleComposition(scene.id, option)}
                          className={`group relative rounded-xl border-2 px-5 py-4 text-sm font-semibold transition-all duration-200 ${
                            isSelected
                              ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_20px_rgba(250,204,21,0.25)] ring-2 ring-amber-500/30'
                              : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90 hover:shadow-[0_0_10px_rgba(250,204,21,0.1)]'
                          }`}
                        >
                          <span className="relative z-10">{option}</span>
                          {isSelected && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {scene.composition && scene.composition.length > 0 && (
                    <p className="mt-3 text-xs text-zinc-400 italic">
                      Selected: {scene.composition.join(', ')}. The AI will intelligently distribute these compositions throughout your scene based on the action description.
                    </p>
                  )}
                </div>

                {/* Camera Angle Buttons - Multiple Selection */}
                <div className="mb-8">
                  <label className="mb-5 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
                    Camera Angle <span className="text-xs font-normal text-zinc-500">(Select multiple - AI will decide which to use based on action)</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {cameraAngleOptions.map((option) => {
                      const isSelected = scene.cameraAngle?.includes(option) || false;
                      return (
                        <button
                          key={option}
                          onClick={() => toggleCameraAngle(scene.id, option)}
                          className={`group relative rounded-xl border-2 px-5 py-4 text-sm font-semibold transition-all duration-200 ${
                            isSelected
                              ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_20px_rgba(250,204,21,0.25)] ring-2 ring-amber-500/30'
                              : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90 hover:shadow-[0_0_10px_rgba(250,204,21,0.1)]'
                          }`}
                        >
                          <span className="relative z-10">{option}</span>
                          {isSelected && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {scene.cameraAngle && scene.cameraAngle.length > 0 && (
                    <p className="mt-3 text-xs text-zinc-400 italic">
                      Selected: {scene.cameraAngle.join(', ')}. The AI will intelligently choose which camera angle to use based on the action description. If "POV" is mentioned in the action, "Frontal Camera" will be used automatically.
                    </p>
                  )}
                </div>

                {/* Lighting/Ambience Buttons */}
                <div className="mb-6">
                  <label className="mb-5 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
                    Lighting / Ambience
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {lightingOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => updateScene(scene.id, 'lighting', scene.lighting === option ? null : option)}
                        className={`group relative rounded-xl border-2 px-5 py-4 text-sm font-semibold transition-all duration-200 ${
                          scene.lighting === option
                            ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_20px_rgba(250,204,21,0.25)] ring-2 ring-amber-500/30'
                            : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90 hover:shadow-[0_0_10px_rgba(250,204,21,0.1)]'
                        }`}
                      >
                        <span className="relative z-10">{option}</span>
                        {scene.lighting === option && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reference Image Upload */}
                <div className="mb-6">
                  <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
                    Reference Image (Optional)
                  </label>
                  <div className="space-y-4">
                    {scene.referenceImagePreview ? (
                      <div className="relative">
                        <img 
                          src={scene.referenceImagePreview} 
                          alt="Reference" 
                          className="w-full max-w-md rounded-xl border-2 border-zinc-700/50"
                        />
                        <button
                          onClick={() => handleReferenceImageChange(scene.id, null)}
                          className="absolute top-2 right-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white p-2 transition-colors"
                          title="Remove image"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 p-8 transition-all hover:border-amber-500/50 hover:bg-zinc-800/50">
                        <svg className="mb-2 h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm text-zinc-400">Click to upload reference image</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            if (file) handleReferenceImageChange(scene.id, file);
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                    
                    {scene.referenceImagePreview && (
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={scene.copyLighting}
                            onChange={(e) => updateScene(scene.id, 'copyLighting', e.target.checked)}
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/50"
                          />
                          <span className="text-sm text-zinc-300">Copy Lighting</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={scene.copyCameraAngle}
                            onChange={(e) => updateScene(scene.id, 'copyCameraAngle', e.target.checked)}
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/50"
                          />
                          <span className="text-sm text-zinc-300">Copy Camera Angle</span>
                        </label>
                      </div>
                    )}
                  </div>
                  {scene.referenceImagePreview && (
                    <p className="mt-2 text-xs text-zinc-400 italic">
                      {scene.copyLighting && scene.copyCameraAngle 
                        ? 'Will copy lighting and camera angle from reference image'
                        : scene.copyLighting 
                        ? 'Will copy lighting (textures, shadows, light sources) from reference image'
                        : scene.copyCameraAngle
                        ? 'Will copy camera angle (position, framing, character placement) from reference image'
                        : 'Reference image uploaded but no copy options selected'}
                    </p>
                  )}
                </div>

                {/* Dialogue Options */}
                <div className="mb-6">
                  <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
                    Dialogue Options
                  </label>
                  <div className="space-y-3">
                    {/* No Dialogue Button */}
                    <button
                      onClick={() => {
                        if (!scene.noDialogue) {
                          updateScene(scene.id, 'noDialogue', true);
                          updateScene(scene.id, 'lipSync', false);
                          updateScene(scene.id, 'voiceover', false);
                        } else {
                          updateScene(scene.id, 'noDialogue', false);
                        }
                      }}
                      className={`w-full rounded-xl border-2 px-5 py-4 text-sm font-semibold transition-all duration-200 ${
                        scene.noDialogue
                          ? 'border-red-500/80 bg-gradient-to-br from-red-500/20 to-red-500/10 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.25)] ring-2 ring-red-500/30'
                          : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-red-500/50 hover:bg-zinc-800/50 hover:text-red-300/90 hover:shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                      }`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        {scene.noDialogue ? '✓' : ''}
                        <span>No Dialogue</span>
                      </span>
                    </button>

                    {/* Lip Sync Button */}
                    <button
                      onClick={() => {
                        if (!scene.lipSync) {
                          updateScene(scene.id, 'lipSync', true);
                          updateScene(scene.id, 'voiceover', false);
                          updateScene(scene.id, 'noDialogue', false);
                        } else {
                          updateScene(scene.id, 'lipSync', false);
                        }
                      }}
                      disabled={scene.noDialogue}
                      className={`w-full rounded-xl border-2 px-5 py-4 text-sm font-semibold transition-all duration-200 ${
                        scene.lipSync
                          ? 'border-blue-500/80 bg-gradient-to-br from-blue-500/20 to-blue-500/10 text-blue-200 shadow-[0_0_20px_rgba(59,130,246,0.25)] ring-2 ring-blue-500/30'
                          : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-blue-500/50 hover:bg-zinc-800/50 hover:text-blue-300/90 hover:shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        {scene.lipSync ? '✓' : ''}
                        <span>Lip Sync</span>
                      </span>
                    </button>
                    {scene.lipSync && (
                      <p className="text-xs text-blue-300 italic">
                        The character will visibly speak the words. Their mouth movements must match the dialogue.
                      </p>
                    )}

                    {/* Voiceover Button */}
                    <button
                      onClick={() => {
                        if (!scene.voiceover) {
                          updateScene(scene.id, 'voiceover', true);
                          updateScene(scene.id, 'lipSync', false);
                          updateScene(scene.id, 'noDialogue', false);
                        } else {
                          updateScene(scene.id, 'voiceover', false);
                        }
                      }}
                      disabled={scene.noDialogue}
                      className={`w-full rounded-xl border-2 px-5 py-4 text-sm font-semibold transition-all duration-200 ${
                        scene.voiceover
                          ? 'border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.25)] ring-2 ring-purple-500/30'
                          : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-purple-500/50 hover:bg-zinc-800/50 hover:text-purple-300/90 hover:shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        {scene.voiceover ? '✓' : ''}
                        <span>Voiceover</span>
                      </span>
                    </button>
                    {scene.voiceover && (
                      <p className="text-xs text-purple-300 italic">
                        The voice will play while actions happen. The character does not need to visibly speak - voice plays over the scene.
                      </p>
                    )}
                  </div>
                  {scene.noDialogue && (
                    <p className="mt-2 text-xs text-red-300 italic">
                      No dialogue will be included in this scene. The prompt will explicitly specify that no words should be spoken.
                    </p>
                  )}
                </div>

                {/* Continuous Action - No Cuts */}
                <div className="mb-6">
                  <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
                    Action Continuity
                  </label>
                  <button
                    onClick={() => {
                      updateScene(scene.id, 'continuousAction', !scene.continuousAction);
                    }}
                    className={`w-full rounded-xl border-2 px-5 py-4 text-sm font-semibold transition-all duration-200 ${
                      scene.continuousAction
                        ? 'border-green-500/80 bg-gradient-to-br from-green-500/20 to-green-500/10 text-green-200 shadow-[0_0_20px_rgba(34,197,94,0.25)] ring-2 ring-green-500/30'
                        : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-green-500/50 hover:bg-zinc-800/50 hover:text-green-300/90 hover:shadow-[0_0_10px_rgba(34,197,94,0.1)]'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-2">
                      {scene.continuousAction ? '✓' : ''}
                      <span>Continuous Action - No Cuts</span>
                    </span>
                  </button>
                  {scene.continuousAction && (
                    <p className="mt-2 text-xs text-green-300 italic">
                      All actions will happen continuously without any cuts or transitions. The entire scene will be one continuous shot with all actions flowing seamlessly from start to finish.
                    </p>
                  )}
                </div>
              </div>
              
              {/* Navigation Buttons */}
              <div className="flex justify-between gap-4 mt-8">
                <button
                  onClick={prevStep}
                  className="flex items-center gap-2 rounded-xl border-2 border-zinc-700/50 bg-zinc-800/40 px-6 py-3.5 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-600/50 hover:bg-zinc-800/60 hover:text-zinc-200"
                >
                  <span>←</span>
                  <span>Previous</span>
                </button>
                <button
                  onClick={() => {
                    if (currentSceneNum === sceneCount) {
                      goToStep('generate');
                    } else {
                      nextStep();
                    }
                  }}
                  className="flex items-center gap-2 rounded-xl border-2 border-amber-500/70 bg-gradient-to-r from-amber-500/20 to-amber-500/10 px-8 py-3.5 text-sm font-semibold text-amber-200 shadow-[0_0_20px_rgba(250,204,21,0.2)] transition-all hover:from-amber-500/30 hover:to-amber-500/20 hover:shadow-[0_0_25px_rgba(250,204,21,0.3)]"
                >
                  <span>{currentSceneNum === sceneCount ? 'Generate Prompt' : 'Next Scene'}</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Automatic Mode */}
        {mode === 'automatic' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-amber-300">Automatic Mode</h3>
              <button
                onClick={() => {
                  setMode('manual');
                  setCurrentStep('sceneCount');
                  setGeneratedPrompt('');
                  setAutoDescription('');
                  setAutoScript('');
                }}
                className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                Switch to Manual →
              </button>
            </div>

            {/* Mode Selection: Describe Video vs Create From Script */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-amber-400/90">
                Select Input Method
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setAutoMode('describe');
                    setAutoScript('');
                  }}
                  disabled={isGenerating}
                  className={`rounded-xl border-2 px-6 py-4 text-left transition-all ${
                    autoMode === 'describe'
                      ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_20px_rgba(250,204,21,0.25)] ring-2 ring-amber-500/30'
                      : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="font-bold text-base mb-1">Describe Video</div>
                  <div className="text-xs opacity-90">Describe what you want and AI will create scenes automatically</div>
                  {autoMode === 'describe' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400">✓</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setAutoMode('script');
                    setAutoDescription('');
                    setBRollAnimation(false);
                  }}
                  disabled={isGenerating}
                  className={`rounded-xl border-2 px-6 py-4 text-left transition-all relative ${
                    autoMode === 'script'
                      ? 'border-amber-500/80 bg-gradient-to-br from-amber-500/20 to-amber-500/10 text-amber-200 shadow-[0_0_20px_rgba(250,204,21,0.25)] ring-2 ring-amber-500/30'
                      : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="font-bold text-base mb-1">Create Video From Script</div>
                  <div className="text-xs opacity-90">Paste your script and AI will generate scenes with all parameters</div>
                  {autoMode === 'script' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400">✓</span>
                  )}
                </button>
              </div>
            </div>

            {/* Describe Video Input */}
            {autoMode === 'describe' && (
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="mb-2 text-lg font-bold text-amber-300">
                    Describe Your Video
                  </h3>
                  <p className="text-sm text-zinc-400">
                    Describe what you want in your video. The AI will automatically decide the number of scenes, compositions, lighting, characters, and create a complete prompt.
                  </p>
                </div>
                {/* UGC Toggle */}
                <div className="ml-6 flex flex-col items-end gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    UGC Mode
                  </label>
                  <button
                    onClick={() => setIsUGC(!isUGC)}
                    disabled={isGenerating}
                    className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isUGC
                        ? 'bg-amber-500/80'
                        : 'bg-zinc-700/50'
                    }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                        isUGC ? 'translate-x-9' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-medium ${isUGC ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {isUGC ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
              {/* B-roll animation button - only for Describe Video */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBRollAnimation(!bRollAnimation)}
                  disabled={isGenerating}
                  className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed ${
                    bRollAnimation
                      ? 'border-amber-500/80 bg-amber-500/20 text-amber-300 shadow-[0_0_16px_rgba(250,204,21,0.2)]'
                      : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-400 hover:border-amber-500/50 hover:bg-zinc-800/50 hover:text-amber-300/90'
                  }`}
                >
                  <span className="text-base" aria-hidden>🎬</span>
                  B-roll animation
                </button>
                {bRollAnimation && (
                  <span className="text-xs text-zinc-500">
                    Action-only, no dialogue. Hyperrealistic visuals focused on the action.
                  </span>
                )}
              </div>
              {isUGC && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
                  <p className="text-xs text-amber-300">
                    <strong>UGC Mode ON:</strong> The video will be generated as hyperrealistic UGC content, as if recorded by a real person on their iPhone with authentic mobile aesthetics, natural handheld movements, and photorealistic textures.
                  </p>
                </div>
              )}
              <textarea
                value={autoDescription}
                onChange={(e) => setAutoDescription(e.target.value)}
                placeholder={bRollAnimation ? "Example: 'Close-up of hands opening product box, pulling out the item. Cut to product on table with soft light. Hands applying or using the product in real use. Smooth transitions, no voiceover.'" : "Example: 'Hook: Do you know what's living inside your old pillow? Concept: Focus on the Freshness Built-In story. Explain that while most pillows only have a treated cover, this one protects the foam core too, preventing old pillow smells and moisture buildup. Key Benefit: A cleaner, fresher sleep surface for the whole family'"}
                rows={8}
                disabled={isGenerating}
                className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              />
            </div>
            )}

            {/* Create From Script Input */}
            {autoMode === 'script' && (
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="mb-2 text-lg font-bold text-amber-300">
                    Paste Your Script
                  </h3>
                  <p className="text-sm text-zinc-400">
                    Paste your complete script. The AI will analyze it, distribute it into scenes, and automatically choose all parameters (compositions, camera angles, lighting, duration, lip sync, voiceover, etc.) to create a complete video prompt.
                  </p>
                </div>
                {/* UGC Toggle */}
                <div className="ml-6 flex flex-col items-end gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    UGC Mode
                  </label>
                  <button
                    onClick={() => setIsUGC(!isUGC)}
                    disabled={isGenerating}
                    className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isUGC
                        ? 'bg-amber-500/80'
                        : 'bg-zinc-700/50'
                    }`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                        isUGC ? 'translate-x-9' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-medium ${isUGC ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {isUGC ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
              {isUGC && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
                  <p className="text-xs text-amber-300">
                    <strong>UGC Mode ON:</strong> The video will be generated as hyperrealistic UGC content, as if recorded by a real person on their iPhone with authentic mobile aesthetics, natural handheld movements, and photorealistic textures.
                  </p>
                </div>
              )}
              <textarea
                value={autoScript}
                onChange={(e) => setAutoScript(e.target.value)}
                placeholder="Example: 'right now im going to the gym, i want to show you guys something. this is my new creatine and it saved my life completely. I'm feeling stronger and my performance has improved. you're missing out if you don't buy this.'"
                rows={10}
                disabled={isGenerating}
                className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-amber-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              />
            </div>
            )}

            {/* Product Image Upload */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <h3 className="mb-4 text-lg font-bold text-amber-300">
                Product Image (Optional)
              </h3>
              <p className="mb-4 text-sm text-zinc-400">
                Upload a product image to make the prompt more accurate.
              </p>
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productPhotoWillBeAttached}
                    onChange={(e) => setProductPhotoWillBeAttached(e.target.checked)}
                    disabled={isGenerating}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-zinc-300">Product photo will be attached</span>
                </label>
                {productPhotoWillBeAttached && (
                  <p className="mt-2 text-xs text-amber-300 italic">
                    When checked, all product references in prompts will refer to the attached product image for maximum accuracy.
                  </p>
                )}
              </div>
              <div className="space-y-4">
                {!productPreview ? (
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 px-6 py-8 text-center transition-all hover:border-amber-500/50 hover:bg-zinc-800/50">
                    <svg
                      className="mb-3 h-10 w-10 text-zinc-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-zinc-400">
                      Click to upload or drag and drop
                    </span>
                    <span className="mt-1 text-xs text-zinc-500">
                      PNG, JPG, WEBP up to 10MB
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleProductImageUpload}
                      className="hidden"
                      disabled={isGenerating}
                    />
                  </label>
                ) : (
                  <div className="relative rounded-xl border-2 border-zinc-700/50 bg-zinc-800/30 p-4">
                    <div className="relative inline-block">
                      <img
                        src={productPreview}
                        alt="Product preview"
                        className="max-h-64 rounded-lg object-contain"
                      />
                      <button
                        onClick={() => {
                          setProductImage(null);
                          setProductPreview(null);
                        }}
                        disabled={isGenerating}
                        className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove image"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={autoMode === 'describe' ? generatePromptAutomatic : generatePromptFromScript}
              disabled={isGenerating || (autoMode === 'describe' ? !autoDescription.trim() : !autoScript.trim())}
              className="w-full rounded-xl border-2 border-amber-500/70 bg-gradient-to-r from-amber-500/20 via-amber-500/15 to-amber-500/20 px-8 py-4 font-bold text-amber-200 shadow-[0_0_30px_rgba(250,204,21,0.25)] transition-all hover:from-amber-500/30 hover:via-amber-500/25 hover:to-amber-500/30 hover:shadow-[0_0_40px_rgba(250,204,21,0.35)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500/20 disabled:hover:via-amber-500/15 disabled:hover:to-amber-500/20 disabled:hover:scale-100"
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"></span>
                  <span>Generating prompt with AI...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>✨</span>
                  <span>Generate Complete Prompt</span>
                </span>
              )}
            </button>
          </div>
        )}

        {/* Copy Video Mode */}
        {mode === 'copy-video' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-green-300">Copy Video Mode</h3>
              <button
                onClick={() => {
                  setMode('manual');
                  setCurrentStep('sceneCount');
                  setGeneratedPrompt('');
                  setReferenceVideo(null);
                  setReferenceVideoPreview(null);
                  setCopyVideoImage(null);
                  setCopyVideoImagePreview(null);
                  setCopyVideoChanges('');
                  setCopyVideoScript('');
                }}
                className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                Switch to Manual →
              </button>
            </div>

            {/* Reference Video Upload */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <h3 className="mb-4 text-lg font-bold text-green-300">
                Upload Reference Video
              </h3>
              <p className="mb-4 text-sm text-zinc-400">
                Upload a video and the AI will analyze it to generate a detailed prompt that describes how to recreate it exactly, including actions, camera cuts, angles, hyperrealism, and all visual characteristics.
              </p>
              <div className="space-y-4">
                {!referenceVideoPreview ? (
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 px-6 py-8 text-center transition-all hover:border-green-500/50 hover:bg-zinc-800/50">
                    <svg
                      className="mb-3 h-10 w-10 text-zinc-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-zinc-400">
                      Click to upload or drag and drop
                    </span>
                    <span className="mt-1 text-xs text-zinc-500">
                      MP4, MOV, WEBM up to 50MB
                    </span>
                    <input
                      type="file"
                      accept="video/mp4,video/mov,video/webm,video/quicktime"
                      onChange={handleReferenceVideoUpload}
                      className="hidden"
                      disabled={isGenerating}
                    />
                  </label>
                ) : (
                  <div className="relative rounded-xl border-2 border-zinc-700/50 bg-zinc-800/30 p-4">
                    <div className="relative inline-block">
                      <video
                        src={referenceVideoPreview}
                        controls
                        className="max-h-96 rounded-lg"
                      />
                      <button
                        onClick={() => {
                          setReferenceVideo(null);
                          setReferenceVideoPreview(null);
                        }}
                        disabled={isGenerating}
                        className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove video"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Duration Selection */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <h3 className="mb-4 text-lg font-bold text-green-300">
                Video Duration
              </h3>
              <p className="mb-4 text-sm text-zinc-400">
                Select the duration for the generated video prompt (between 8 and 15 seconds). The prompt will be adjusted to fit perfectly within this timeframe.
              </p>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="8"
                    max="15"
                    value={copyVideoDuration}
                    onChange={(e) => setCopyVideoDuration(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-green-500"
                    disabled={isGenerating}
                  />
                  <div className="flex items-center gap-2 min-w-[80px]">
                    <span className="text-2xl font-bold text-green-400">{copyVideoDuration}</span>
                    <span className="text-sm text-zinc-500">sec</span>
                  </div>
                </div>
                <div className="grid grid-cols-8 gap-2">
                  {[8, 9, 10, 11, 12, 13, 14, 15].map((duration) => (
                    <button
                      key={duration}
                      onClick={() => setCopyVideoDuration(duration)}
                      disabled={isGenerating}
                      className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold transition-all ${
                        copyVideoDuration === duration
                          ? 'border-green-500/80 bg-gradient-to-br from-green-500/20 to-green-500/10 text-green-200 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                          : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-green-500/50 hover:bg-zinc-800/50'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {duration}s
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Script Input (Optional) */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <h3 className="mb-4 text-lg font-bold text-green-300">
                Script (Optional)
              </h3>
              <p className="mb-4 text-sm text-zinc-400">
                Enter the script/dialogue that should be spoken in the video. The AI will integrate it with the actions and adjust it to fit the selected duration ({copyVideoDuration} seconds).
              </p>
              <textarea
                value={copyVideoScript}
                onChange={(e) => setCopyVideoScript(e.target.value)}
                placeholder="Enter the script/dialogue that should be spoken in the video. The AI will integrate it with the actions and adjust it to fit the selected duration..."
                rows={5}
                disabled={isGenerating}
                className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-green-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
              />
              {copyVideoScript.trim() && (
                <div className="mt-3 rounded-lg border border-green-500/30 bg-green-950/20 p-3">
                  <p className="text-xs text-green-300">
                    <strong>Note:</strong> The script will be integrated with the actions from the video. The script duration target is {copyVideoDuration} seconds. If the script is too long, it will be adapted to fit the duration without sacrificing too much content.
                  </p>
                </div>
              )}
            </div>

            {/* Image Upload (Optional) */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <h3 className="mb-4 text-lg font-bold text-green-300">
                Reference Image (Optional)
              </h3>
              <p className="mb-4 text-sm text-zinc-400">
                Upload an image to provide visual context for the changes you want to make. This helps the AI understand what modifications you're requesting.
              </p>
              <div className="space-y-4">
                {!copyVideoImagePreview ? (
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 px-6 py-8 text-center transition-all hover:border-green-500/50 hover:bg-zinc-800/50">
                    <svg
                      className="mb-3 h-10 w-10 text-zinc-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-zinc-400">
                      Click to upload or drag and drop
                    </span>
                    <span className="mt-1 text-xs text-zinc-500">
                      PNG, JPG, WEBP up to 10MB
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCopyVideoImageUpload}
                      className="hidden"
                      disabled={isGenerating}
                    />
                  </label>
                ) : (
                  <div className="relative rounded-xl border-2 border-zinc-700/50 bg-zinc-800/30 p-4">
                    <div className="relative inline-block">
                      <img
                        src={copyVideoImagePreview}
                        alt="Reference image preview"
                        className="max-h-96 rounded-lg"
                      />
                      <button
                        onClick={removeCopyVideoImage}
                        disabled={isGenerating}
                        className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove image"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Changes Description (Optional) */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <h3 className="mb-4 text-lg font-bold text-green-300">
                Desired Changes (Optional)
              </h3>
              <p className="mb-4 text-sm text-zinc-400">
                Describe what changes you want to make to the video. You can mention changes related to the image you uploaded, or any other modifications you'd like (e.g., "Change the product to the one in the image", "Use a different background", "Change the lighting to be more dramatic").
              </p>
              <textarea
                value={copyVideoChanges}
                onChange={(e) => setCopyVideoChanges(e.target.value)}
                placeholder="Example: Change the product to match the one in the uploaded image, Use a beach background instead of the studio, Make the lighting more dramatic with stronger shadows..."
                className="w-full rounded-xl border border-zinc-700/70 bg-zinc-950/50 px-4 py-3 text-zinc-50 placeholder-zinc-500 focus:border-green-500/60 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all"
                rows={4}
                disabled={isGenerating}
              />
            </div>

            <button
              onClick={generatePromptFromVideo}
              disabled={isGenerating || !referenceVideo}
              className="w-full rounded-xl border-2 border-green-500/70 bg-gradient-to-r from-green-500/20 via-green-500/15 to-green-500/20 px-8 py-4 font-bold text-green-200 shadow-[0_0_30px_rgba(34,197,94,0.25)] transition-all hover:from-green-500/30 hover:via-green-500/25 hover:to-green-500/30 hover:shadow-[0_0_40px_rgba(34,197,94,0.35)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-green-500/20 disabled:hover:via-green-500/15 disabled:hover:to-green-500/20 disabled:hover:scale-100"
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-green-400 border-t-transparent"></span>
                  <span>Analyzing video and generating prompt...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>🎬</span>
                  <span>Generate Prompt from Video</span>
                </span>
              )}
            </button>

            {/* Insufficient Credits Error */}
            {isInsufficientCredits && mode === 'copy-video' && (
              <div className="mb-6">
                <InsufficientCreditsError />
              </div>
            )}

            {/* Error Message */}
            {error && !isInsufficientCredits && mode === 'copy-video' && (
              <div className="mb-6 rounded-xl border-2 border-red-500/50 bg-red-500/10 px-5 py-4 text-sm text-red-200">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Manual Mode: Step 3: Generate */}
        {mode === 'manual' && currentStep === 'generate' && sceneCount > 0 && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <h3 className="mb-6 text-lg font-bold text-amber-300">
                Configuration Summary
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-800/30 px-4 py-3">
                  <span className="text-sm font-medium text-zinc-400">Style:</span>
                  <span className="text-sm font-semibold text-amber-300">Hyperrealistic UGC</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-zinc-800/50 bg-zinc-800/30 px-4 py-3">
                  <span className="text-sm font-medium text-zinc-400">Number of Scenes:</span>
                  <span className="text-sm font-semibold text-amber-300">{sceneCount}</span>
                </div>
              </div>
            </div>

            {/* Product Image Upload */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <h3 className="mb-4 text-lg font-bold text-amber-300">
                Product Image (Optional)
              </h3>
              <p className="mb-4 text-sm text-zinc-400">
                Upload a product image to make the prompt more accurate. The generated prompt will reference this image for better results.
              </p>
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={productPhotoWillBeAttached}
                    onChange={(e) => setProductPhotoWillBeAttached(e.target.checked)}
                    disabled={isGenerating}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-amber-500 focus:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-zinc-300">Product photo will be attached</span>
                </label>
                {productPhotoWillBeAttached && (
                  <p className="mt-2 text-xs text-amber-300 italic">
                    When checked, all product references in prompts will refer to the attached product image for maximum accuracy.
                  </p>
                )}
              </div>
              <div className="space-y-4">
                {!productPreview ? (
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 px-6 py-8 text-center transition-all hover:border-amber-500/50 hover:bg-zinc-800/50">
                    <svg
                      className="mb-3 h-10 w-10 text-zinc-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-zinc-400">
                      Click to upload or drag and drop
                    </span>
                    <span className="mt-1 text-xs text-zinc-500">
                      PNG, JPG, WEBP up to 10MB
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={handleProductImageUpload}
                      className="hidden"
                      disabled={isGenerating}
                    />
                  </label>
                ) : (
                  <div className="relative rounded-xl border-2 border-zinc-700/50 bg-zinc-800/30 p-4">
                    <div className="relative inline-block">
                      <img
                        src={productPreview}
                        alt="Product preview"
                        className="max-h-64 rounded-lg object-contain"
                      />
                      <button
                        onClick={() => {
                          setProductImage(null);
                          setProductPreview(null);
                        }}
                        disabled={isGenerating}
                        className="absolute right-2 top-2 rounded-full bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove image"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <button
            onClick={generatePromptManual}
            disabled={isGenerating}
            className="w-full rounded-xl border-2 border-amber-500/70 bg-gradient-to-r from-amber-500/20 via-amber-500/15 to-amber-500/20 px-8 py-4 font-bold text-amber-200 shadow-[0_0_30px_rgba(250,204,21,0.25)] transition-all hover:from-amber-500/30 hover:via-amber-500/25 hover:to-amber-500/30 hover:shadow-[0_0_40px_rgba(250,204,21,0.35)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500/20 disabled:hover:via-amber-500/15 disabled:hover:to-amber-500/20 disabled:hover:scale-100"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-3">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"></span>
                <span>Enhancing scenes with AI...</span>
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span>✨</span>
                <span>Generate UGC Prompt</span>
              </span>
            )}
          </button>
          
          <div className="flex justify-start">
            <button
              onClick={prevStep}
              className="flex items-center gap-2 rounded-xl border-2 border-zinc-700/50 bg-zinc-800/40 px-6 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-600/50 hover:bg-zinc-800/60 hover:text-zinc-200"
            >
              <span>←</span>
              <span>Previous</span>
            </button>
          </div>
          </div>
          )}
          </>
        )}

        {/* Error Message */}
        {(generatorType === 'ugc' || generatorType === 'cinematic') && error && !isInsufficientCredits && (
          <div className="mb-6 rounded-xl border-2 border-red-500/50 bg-red-500/10 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Insufficient Credits Error */}
        {(generatorType === 'ugc' || generatorType === 'cinematic') && isInsufficientCredits && <InsufficientCreditsError />}

        {/* Generated Prompt - Show when prompt is generated (UGC Mode) */}
        {generatorType === 'ugc' && ((mode === 'manual' && currentStep === 'generate') || mode === 'automatic' || mode === 'copy-video') && generatedPrompt && !isInsufficientCredits && (
          <div className={`rounded-2xl border-2 bg-gradient-to-br from-zinc-900/90 to-zinc-950/80 p-8 shadow-[0_0_50px_rgba(250,204,21,0.2)] ${
            mode === 'copy-video' 
              ? 'border-green-500/50 shadow-[0_0_50px_rgba(34,197,94,0.2)]' 
              : 'border-amber-500/50'
          }`}>
            <div className="mb-6 flex items-center justify-between border-b border-zinc-800/50 pb-4">
              <div>
                <h3 className={`text-xl font-bold ${mode === 'copy-video' ? 'text-green-300' : 'text-amber-300'}`}>
                  Generated Prompt
                </h3>
                <p className="mt-1 text-xs text-zinc-500">Ready to use in your AI video generator</p>
              </div>
              <CopyButton 
                text={generatedPrompt} 
                label="Copy"
                copiedLabel="Copied!"
              />
            </div>
            <pre className="whitespace-pre-wrap rounded-xl border-2 border-zinc-800/50 bg-zinc-950/70 p-6 text-sm leading-relaxed text-zinc-200 font-mono">
              {generatedPrompt}
            </pre>
            
            {/* Prompt for First Frame and Extend Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={generateFirstFramePrompt}
                disabled={isGeneratingFirstFrame}
                className="flex-1 rounded-lg border-2 border-amber-500/50 bg-amber-500/10 px-6 py-3 text-sm font-semibold text-amber-300 transition-all hover:border-amber-500/70 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingFirstFrame ? 'Generating...' : 'Prompt for First Frame'}
              </button>
              <button
                onClick={() => setShowExtendModal(true)}
                disabled={isGeneratingExtend}
                className="flex-1 rounded-lg border-2 border-green-500/50 bg-green-500/10 px-6 py-3 text-sm font-semibold text-green-300 transition-all hover:border-green-500/70 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Extend
              </button>
            </div>
            
            {/* First Frame Prompt Display */}
            {firstFramePrompt && (
              <div className="mt-6 rounded-xl border-2 border-blue-500/50 bg-gradient-to-br from-zinc-900/90 to-zinc-950/80 p-6 shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                <div className="mb-4 flex items-center justify-between border-b border-zinc-800/50 pb-3">
                  <div>
                    <h4 className="text-lg font-bold text-blue-300">
                      First Frame Prompt
                    </h4>
                    <p className="mt-1 text-xs text-zinc-500">Ready to use in your AI image generator</p>
                  </div>
                  <CopyButton 
                    text={firstFramePrompt} 
                    label="Copy"
                    copiedLabel="Copied!"
                  />
                </div>
                <pre className="whitespace-pre-wrap rounded-xl border-2 border-zinc-800/50 bg-zinc-950/70 p-4 text-sm leading-relaxed text-zinc-200 font-mono">
                  {firstFramePrompt}
                </pre>
              </div>
            )}
            
            {/* Extend Prompt Display */}
            {extendPrompt && (
              <div className="mt-6 rounded-xl border-2 border-green-500/50 bg-gradient-to-br from-zinc-900/90 to-zinc-950/80 p-6 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
                <div className="mb-4 flex items-center justify-between border-b border-zinc-800/50 pb-3">
                  <div>
                    <h4 className="text-lg font-bold text-green-300">
                      Extended Prompt (10 seconds)
                    </h4>
                    <p className="mt-1 text-xs text-zinc-500">Continuation of the original video</p>
                  </div>
                  <CopyButton 
                    text={extendPrompt} 
                    label="Copy"
                    copiedLabel="Copied!"
                  />
                </div>
                <pre className="whitespace-pre-wrap rounded-xl border-2 border-zinc-800/50 bg-zinc-950/70 p-4 text-sm leading-relaxed text-zinc-200 font-mono">
                  {extendPrompt}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Extend Modal */}
        {showExtendModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-2xl rounded-2xl border-2 border-green-500/50 bg-gradient-to-br from-zinc-900/95 to-zinc-950/95 p-8 shadow-[0_0_50px_rgba(34,197,94,0.3)]">
              <button
                onClick={() => {
                  setShowExtendModal(false);
                  setExtendScript('');
                  setExtendActions('');
                }}
                className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-200"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              
              <h3 className="mb-6 text-2xl font-bold text-green-300">
                Extend Video Prompt
              </h3>
              
              <p className="mb-4 text-sm text-zinc-400">
                Modify the script and/or actions to create a continuation of the original video. The extended prompt will be 10 seconds and maintain continuity with the original.
              </p>
              
              <div className="mb-6">
                <label className="mb-2 block text-sm font-semibold text-green-400">
                  New Script (Optional)
                </label>
                <textarea
                  value={extendScript}
                  onChange={(e) => setExtendScript(e.target.value)}
                  placeholder="Enter the new script/dialogue for the extended video..."
                  rows={4}
                  className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-50 placeholder-zinc-500/70 focus:border-green-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none"
                />
              </div>
              
              <div className="mb-6">
                <label className="mb-2 block text-sm font-semibold text-green-400">
                  New Actions (Optional)
                </label>
                <textarea
                  value={extendActions}
                  onChange={(e) => setExtendActions(e.target.value)}
                  placeholder="Enter the new actions for the extended video..."
                  rows={4}
                  className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-4 py-3 text-sm text-zinc-50 placeholder-zinc-500/70 focus:border-green-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-green-500/20 resize-none"
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={generateExtendPrompt}
                  disabled={isGeneratingExtend || (!extendScript.trim() && !extendActions.trim())}
                  className="flex-1 rounded-lg border-2 border-green-500/70 bg-green-500/20 px-6 py-3 text-sm font-semibold text-green-300 transition-all hover:border-green-500/90 hover:bg-green-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingExtend ? 'Generating...' : 'Generate Extended Prompt'}
                </button>
                <button
                  onClick={() => {
                    setShowExtendModal(false);
                    setExtendScript('');
                    setExtendActions('');
                  }}
                  className="rounded-lg border-2 border-zinc-700/50 bg-zinc-800/50 px-6 py-3 text-sm font-semibold text-zinc-300 transition-all hover:border-zinc-600/50 hover:bg-zinc-800/70"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Generated Prompt - Show when prompt is generated (Cinematic Mode) */}
        {generatorType === 'cinematic' && generatedPrompt && !isInsufficientCredits && (
          <div className="rounded-2xl border-2 border-purple-500/50 bg-gradient-to-br from-zinc-900/90 to-zinc-950/80 p-8 shadow-[0_0_50px_rgba(168,85,247,0.2)]">
            <div className="mb-6 flex items-center justify-between border-b border-zinc-800/50 pb-4">
              <div>
                <h3 className="text-xl font-bold text-purple-300">
                  Generated Cinematic Prompt
                </h3>
                <p className="mt-1 text-xs text-zinc-500">Ready to use in your AI video generator</p>
              </div>
              <CopyButton 
                text={generatedPrompt} 
                label="Copy"
                copiedLabel="Copied!"
              />
            </div>
            <pre className="whitespace-pre-wrap rounded-xl border-2 border-zinc-800/50 bg-zinc-950/70 p-6 text-sm leading-relaxed text-zinc-200 font-mono">
              {generatedPrompt}
            </pre>
          </div>
        )}

        {/* Cinematic Mode */}
        {generatorType === 'cinematic' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-purple-300">Cinematic Video Prompt Generator</h3>
              <button
                onClick={() => {
                  setGeneratorType(null);
                  setCinematicMode('manual');
                  setCinematicAutoMode('describe');
                  setCinematicDescription('');
                  setCinematicScript('');
                  setCinematicCameraAngles([]);
                  setCinematicCameraMovements([]);
                  setGeneratedPrompt('');
                }}
                className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
              >
                ← Back to Generator Selection
              </button>
            </div>

            {/* Mode Selection: Manual vs Automatic */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-purple-400/90">
                Select Mode
              </label>
              <p className="mb-4 text-xs text-zinc-500">
                Choose between manual control (select camera angles and movements) or automatic (AI decides based on your description)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setCinematicMode('manual');
                    setGeneratedPrompt('');
                  }}
                  disabled={isGenerating}
                  className={`relative rounded-xl border-2 px-6 py-4 text-left transition-all duration-200 ${
                    cinematicMode === 'manual'
                      ? 'border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.25)] ring-2 ring-purple-500/30'
                      : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-purple-500/50 hover:bg-zinc-800/50 hover:text-purple-300/90'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="font-bold text-base mb-1">Manual</div>
                  <div className="text-xs opacity-90">Select camera angles and movements yourself</div>
                  {cinematicMode === 'manual' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400">✓</span>
                  )}
                </button>
                <button
                  onClick={() => {
                    setCinematicMode('automatic');
                    setCinematicCameraAngles([]);
                    setCinematicCameraMovements([]);
                    setGeneratedPrompt('');
                  }}
                  disabled={isGenerating}
                  className={`relative rounded-xl border-2 px-6 py-4 text-left transition-all duration-200 ${
                    cinematicMode === 'automatic'
                      ? 'border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.25)] ring-2 ring-purple-500/30'
                      : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-purple-500/50 hover:bg-zinc-800/50 hover:text-purple-300/90'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="font-bold text-base mb-1">Automatic</div>
                  <div className="text-xs opacity-90">AI decides camera angles and movements based on your description</div>
                  {cinematicMode === 'automatic' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400">✓</span>
                  )}
                </button>
              </div>
            </div>

            {/* Automatic Mode: Describe vs Script Selection */}
            {cinematicMode === 'automatic' && (
              <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-6 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-purple-400/90">
                  Select Input Method
                </label>
                <p className="mb-4 text-xs text-zinc-500">
                  Choose between describing the video or providing a script to generate B-roll cinematic scenes
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      setCinematicAutoMode('describe');
                      setCinematicScript('');
                      setGeneratedPrompt('');
                    }}
                    disabled={isGenerating}
                    className={`relative rounded-xl border-2 px-6 py-4 text-left transition-all duration-200 ${
                      cinematicAutoMode === 'describe'
                        ? 'border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.25)] ring-2 ring-purple-500/30'
                        : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-purple-500/50 hover:bg-zinc-800/50 hover:text-purple-300/90'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="font-bold text-base mb-1">Describe Video</div>
                    <div className="text-xs opacity-90">Describe what you want and AI will create cinematic scenes</div>
                    {cinematicAutoMode === 'describe' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400">✓</span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setCinematicAutoMode('script');
                      setCinematicDescription('');
                      setGeneratedPrompt('');
                    }}
                    disabled={isGenerating}
                    className={`relative rounded-xl border-2 px-6 py-4 text-left transition-all duration-200 ${
                      cinematicAutoMode === 'script'
                        ? 'border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.25)] ring-2 ring-purple-500/30'
                        : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-purple-500/50 hover:bg-zinc-800/50 hover:text-purple-300/90'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="font-bold text-base mb-1">From Script</div>
                    <div className="text-xs opacity-90">Paste your script and AI will generate B-roll cinematic scenes</div>
                    {cinematicAutoMode === 'script' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400">✓</span>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Description Input - Show in Manual mode or Automatic Describe mode */}
            {(cinematicMode === 'manual' || (cinematicMode === 'automatic' && cinematicAutoMode === 'describe')) && (
              <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-purple-400/90">
                  Describe What You Want
                </label>
                <p className="mb-4 text-xs text-zinc-500">
                  Describe the cinematic video you want to create. Be as detailed as possible about the scene, action, mood, and visual style.
                </p>
                <textarea
                  value={cinematicDescription}
                  onChange={(e) => setCinematicDescription(e.target.value)}
                  placeholder="Example: A dramatic product reveal in a modern minimalist studio. The product slowly rotates on a pedestal while dramatic shadows play across its surface. The mood should be sophisticated and premium..."
                  rows={6}
                  disabled={isGenerating}
                  className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-purple-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                />
              </div>
            )}

            {/* Script Input - Show in Automatic Script mode */}
            {cinematicMode === 'automatic' && cinematicAutoMode === 'script' && (
              <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-purple-400/90">
                  Script
                </label>
                <p className="mb-4 text-xs text-zinc-500">
                  Paste your script here. The AI will analyze it and automatically generate cinematic B-roll scenes that complement and enhance the script's narrative, mood, and pacing.
                </p>
                <textarea
                  value={cinematicScript}
                  onChange={(e) => setCinematicScript(e.target.value)}
                  placeholder="Example: 'Welcome to our premium skincare line. Each product is crafted with precision and care. Experience the luxury of nature meeting science...'"
                  rows={8}
                  disabled={isGenerating}
                  className="w-full rounded-xl border-2 border-zinc-700/50 bg-zinc-800/50 px-5 py-4 text-sm leading-relaxed text-zinc-50 placeholder-zinc-500/70 focus:border-purple-500/70 focus:bg-zinc-800/70 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                />
                <div className="mt-3 rounded-lg border border-purple-500/30 bg-purple-950/20 p-3">
                  <p className="text-xs text-purple-300">
                    <strong>Note:</strong> The AI will create cinematic B-roll scenes that visually support your script. These scenes will enhance the narrative, show product details, create atmosphere, and maintain professional cinematic quality throughout.
                  </p>
                </div>
              </div>
            )}

            {/* Duration Selection */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-purple-400/90">
                Duration (seconds)
              </label>
              <p className="mb-4 text-xs text-zinc-500">
                Select the duration for your cinematic video
              </p>
              <div className="grid grid-cols-4 gap-3">
                {[5, 8, 10, 15].map((seconds) => (
                  <button
                    key={seconds}
                    onClick={() => setCinematicDuration(seconds)}
                    disabled={isGenerating}
                    className={`relative rounded-xl border-2 px-6 py-4 text-center font-bold transition-all duration-200 ${
                      cinematicDuration === seconds
                        ? 'border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.25)] ring-2 ring-purple-500/30'
                        : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-purple-500/50 hover:bg-zinc-800/50 hover:text-purple-300/90 hover:shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {seconds}s
                    {cinematicDuration === seconds && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Camera Angle Selection - Only show in Manual mode */}
            {cinematicMode === 'manual' && (
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-purple-400/90">
                Camera Angle <span className="text-xs font-normal text-zinc-500">(Select multiple - AI will decide when to use each)</span>
              </label>
              <p className="mb-4 text-xs text-zinc-500">
                Select one or more camera angles. The AI will intelligently distribute them throughout your video based on the action description.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CINEMATIC_CAMERA_ANGLES.map((angle) => {
                  const isSelected = cinematicCameraAngles.includes(angle.value);
                  return (
                    <button
                      key={angle.value}
                      onClick={() => toggleCinematicCameraAngle(angle.value)}
                      disabled={isGenerating}
                      className={`group relative rounded-xl border-2 px-5 py-4 text-left transition-all duration-200 ${
                        isSelected
                          ? 'border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.25)] ring-2 ring-purple-500/30'
                          : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-purple-500/50 hover:bg-zinc-800/50 hover:text-purple-300/90 hover:shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className="font-semibold text-sm mb-1">{angle.label}</div>
                      <div className="text-xs opacity-80 leading-relaxed">{angle.description}</div>
                      {isSelected && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {cinematicCameraAngles.length > 0 && (
                <p className="mt-3 text-xs text-zinc-400 italic">
                  Selected: {cinematicCameraAngles.map(a => CINEMATIC_CAMERA_ANGLES.find(opt => opt.value === a)?.label).join(', ')}. The AI will intelligently distribute these angles throughout your video.
                </p>
              )}
            </div>
            )}

            {/* Camera Movement Selection - Only show in Manual mode */}
            {cinematicMode === 'manual' && (
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-purple-400/90">
                Camera Movement <span className="text-xs font-normal text-zinc-500">(Select multiple - AI will decide when to use each)</span>
              </label>
              <p className="mb-4 text-xs text-zinc-500">
                Select one or more camera movements. The AI will intelligently distribute them throughout your video based on the action description.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CINEMATIC_CAMERA_MOVEMENTS.map((movement) => {
                  const isSelected = cinematicCameraMovements.includes(movement.value);
                  return (
                    <button
                      key={movement.value}
                      onClick={() => toggleCinematicCameraMovement(movement.value)}
                      disabled={isGenerating}
                      className={`group relative rounded-xl border-2 px-5 py-4 text-left transition-all duration-200 ${
                        isSelected
                          ? 'border-purple-500/80 bg-gradient-to-br from-purple-500/20 to-purple-500/10 text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.25)] ring-2 ring-purple-500/30'
                          : 'border-zinc-700/50 bg-zinc-800/30 text-zinc-300 hover:border-purple-500/50 hover:bg-zinc-800/50 hover:text-purple-300/90 hover:shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className="font-semibold text-sm mb-1">{movement.label}</div>
                      <div className="text-xs opacity-80 leading-relaxed">{movement.description}</div>
                      {isSelected && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {cinematicCameraMovements.length > 0 && (
                <p className="mt-3 text-xs text-zinc-400 italic">
                  Selected: {cinematicCameraMovements.map(m => CINEMATIC_CAMERA_MOVEMENTS.find(opt => opt.value === m)?.label).join(', ')}. The AI will intelligently distribute these movements throughout your video.
                </p>
              )}
            </div>
            )}

            {/* Automatic Mode Info */}
            {cinematicMode === 'automatic' && (
              <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4">
                <p className="text-xs text-purple-300">
                  <strong>Automatic Mode:</strong> The AI will analyze your description and automatically decide which camera angles and movements best fit your video. You don't need to select them manually.
                </p>
              </div>
            )}

            {/* Product Image Upload (Optional) */}
            <div className="rounded-2xl border border-zinc-800/50 bg-gradient-to-br from-zinc-900/80 to-zinc-900/60 p-8 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
              <label className="mb-3 block text-sm font-semibold uppercase tracking-wide text-purple-400/90">
                Product Image (Optional)
              </label>
              <p className="mb-4 text-xs text-zinc-500">
                Upload a product image to incorporate its visual details into the prompt
              </p>
              {productPreview ? (
                <div className="relative">
                  <img 
                    src={productPreview} 
                    alt="Product preview" 
                    className="w-full max-w-md rounded-xl border-2 border-zinc-700/50"
                  />
                  <button
                    onClick={() => {
                      setProductImage(null);
                      setProductPreview(null);
                    }}
                    className="absolute top-2 right-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white p-2 transition-colors"
                    title="Remove image"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700/50 bg-zinc-800/30 p-8 transition-all hover:border-purple-500/50 hover:bg-zinc-800/50">
                  <svg className="mb-2 h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-sm text-zinc-400">Click to upload product image</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProductImageUpload}
                    className="hidden"
                  />
                </label>
              )}
              {productImage && (
                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={productPhotoWillBeAttached}
                    onChange={(e) => setProductPhotoWillBeAttached(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500/50"
                  />
                  <span className="text-sm text-zinc-300">Include product image in the final prompt</span>
                </div>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={generateCinematicPrompt}
              disabled={
                isGenerating || 
                (cinematicMode === 'manual' && (!cinematicDescription.trim() || cinematicCameraAngles.length === 0 || cinematicCameraMovements.length === 0)) ||
                (cinematicMode === 'automatic' && cinematicAutoMode === 'describe' && !cinematicDescription.trim()) ||
                (cinematicMode === 'automatic' && cinematicAutoMode === 'script' && !cinematicScript.trim())
              }
              className="w-full rounded-xl border-2 border-purple-500/70 bg-gradient-to-r from-purple-500/20 via-purple-500/15 to-purple-500/20 px-8 py-4 font-bold text-purple-200 shadow-[0_0_30px_rgba(168,85,247,0.25)] transition-all hover:from-purple-500/30 hover:via-purple-500/25 hover:to-purple-500/30 hover:shadow-[0_0_40px_rgba(168,85,247,0.35)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-purple-500/20 disabled:hover:via-purple-500/15 disabled:hover:to-purple-500/20 disabled:hover:scale-100"
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-3">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-purple-400 border-t-transparent"></span>
                  <span>{cinematicMode === 'automatic' && cinematicAutoMode === 'script' ? 'Generating B-roll cinematic scenes from script...' : 'Generating cinematic prompt...'}</span>
                </span>
              ) : (
                cinematicMode === 'automatic' && cinematicAutoMode === 'script' ? 'Generate B-roll Cinematic Scenes' : 'Generate Cinematic Prompt'
              )}
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

