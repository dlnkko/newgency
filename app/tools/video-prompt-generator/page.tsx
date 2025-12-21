'use client';

import { useState } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import CopyButton from '@/app/components/CopyButton';

type ProductFocus = 'conceptual' | 'ugc' | null;
type MainStyle = 'hyperrealistic';
type Composition = string;
type Lighting = string;

interface Scene {
  id: number;
  action: string;
  composition: Composition[];
  lighting: Lighting | null;
  duration: number | null; // Duration in seconds
  isEnhancing?: boolean;
}

const COMPOSITION_OPTIONS = {
  hyperrealistic: [
    'UGC Close-up',
    'Product in Real Use',
    'Everyday Life',
    'Authentic Unboxing'
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
  
  const [sceneCount, setSceneCount] = useState<number>(1);
  const [scenes, setScenes] = useState<Scene[]>([{ id: 1, action: '', composition: [], lighting: null, duration: 1 }]);
  const [generatedPrompt, setGeneratedPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<Step>('sceneCount');

  const handleSceneCountChange = (count: number) => {
    setSceneCount(count);
    const newScenes: Scene[] = [];
    for (let i = 1; i <= count; i++) {
      newScenes.push(
        scenes[i - 1] || { id: i, action: '', composition: [], lighting: null, duration: 1 }
      );
    }
    setScenes(newScenes);
    // Si hay escenas, ir a la primera escena
    if (count > 0) {
      setCurrentStep('scene1' as Step);
    }
  };

  const enhanceActionWithAI = async (actionText: string, compositions: string[], lighting: string | null, duration: number | null, updateState: boolean = false, sceneId?: number, allScenes?: Scene[], currentSceneIndex?: number) => {
    if (!compositions || compositions.length === 0 || !lighting || !actionText) {
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
      const response = await fetch('/api/enhance-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actionText,
          compositions,
          lighting,
          duration: effectiveDuration,
          mainStyle,
          productFocus,
          allScenes: allScenes || scenes,
          currentSceneIndex: currentSceneIndex !== undefined ? currentSceneIndex : (sceneId ? sceneId - 1 : 0)
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error enhancing prompt');
      }

      const enhancedText = data.enhancedText || actionText;
      
      // If updateState is true, update with enhanced text
      if (updateState && sceneId !== undefined) {
        setScenes(prevScenes => prevScenes.map(scene => 
          scene.id === sceneId ? { ...scene, action: enhancedText, isEnhancing: false } : scene
        ));
      }

      return enhancedText;
    } catch (error) {
      console.error('Error enhancing prompt:', error);
      // Remove enhancing state on error
      if (updateState && sceneId !== undefined) {
        setScenes(prevScenes => prevScenes.map(scene => 
          scene.id === sceneId ? { ...scene, isEnhancing: false } : scene
        ));
      }
      return actionText; // Return original text on error
    }
  };

  const updateScene = (id: number, field: keyof Scene, value: string | null | string[] | number | null) => {
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

  const generatePrompt = async () => {
    setIsGenerating(true);
    setGeneratedPrompt('');

    try {
      // Enhance each scene with AI before generating the prompt
      const enhancedScenes = await Promise.all(
        scenes.map(async (scene, index) => {
          let finalAction = scene.action;

          // If composition and lighting exist, enhance text with AI
          if (scene.composition && scene.composition.length > 0 && scene.lighting) {
            // If no action text, use default from first composition or lighting
            if (!finalAction) {
              finalAction = DEFAULT_COMPOSITION_TEXTS[scene.composition[0]] || 
                           DEFAULT_LIGHTING_TEXTS[scene.lighting] || 
                           'A scene showing the product';
            }
            
            // Enhance with AI (without updating state, just get enhanced text)
            // Pass all scenes and current index for consistency
            // If duration is 1 (default), pass null to not include it in prompt
            const effectiveDuration = scene.duration === 1 ? null : scene.duration;
            finalAction = await enhanceActionWithAI(
              finalAction, 
              scene.composition, 
              scene.lighting,
              effectiveDuration,
              false,
              scene.id,
              scenes,
              index
            );
          } else if (!finalAction) {
            // If not both parameters but one exists, use default text
            if (scene.composition && scene.composition.length > 0) {
              finalAction = DEFAULT_COMPOSITION_TEXTS[scene.composition[0]] || 'A scene showing the product';
            } else if (scene.lighting) {
              finalAction = DEFAULT_LIGHTING_TEXTS[scene.lighting] || 'A scene with special lighting';
            }
          }

          return {
            ...scene,
            action: finalAction
          };
        })
      );

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
    } catch (error) {
      console.error('Error generating prompt:', error);
      setGeneratedPrompt('Error generating prompt. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const compositionOptions = mainStyle ? COMPOSITION_OPTIONS[mainStyle] : [];
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

  return (
    <DashboardLayout>
      <div className="mb-8 text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/70">
          Video Prompt Generator
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          AI UGC Video Prompt Generator
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-400">
          Create hyperrealistic UGC video prompts for AI video generation with scene-by-scene control.
        </p>
      </div>

      <div className="space-y-8">
        {/* Step 1: Number of Scenes */}
        {currentStep === 'sceneCount' && (
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
                    scene.composition && scene.composition.length > 0 && scene.lighting 
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                      : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50'
                  }`}>
                    {scene.composition && scene.composition.length > 0 && scene.lighting ? '✓ Complete' : 'Pending'}
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

        {/* Step 3: Generate */}
        {currentStep === 'generate' && sceneCount > 0 && (
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
            
            <button
            onClick={generatePrompt}
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

        {/* Generated Prompt - Mostrar en el paso de generate */}
        {currentStep === 'generate' && generatedPrompt && (
          <div className="rounded-2xl border-2 border-amber-500/50 bg-gradient-to-br from-zinc-900/90 to-zinc-950/80 p-8 shadow-[0_0_50px_rgba(250,204,21,0.2)]">
            <div className="mb-6 flex items-center justify-between border-b border-zinc-800/50 pb-4">
              <div>
                <h3 className="text-xl font-bold text-amber-300">Generated Prompt</h3>
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
      </div>
    </DashboardLayout>
  );
}

