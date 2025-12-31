/**
 * Voice Service for Yeli VTC
 * Wraps expo-speech (TTS) and @react-native-voice/voice (STT)
 * Provides unified interface for text-to-speech and speech-to-text functionality
 */

import * as Speech from 'expo-speech';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
  SpeechStartEvent,
  SpeechEndEvent,
  SpeechVolumeChangeEvent,
} from '@react-native-voice/voice';

/**
 * Configuration options for text-to-speech
 */
export interface SpeakOptions {
  /** Language/locale code (default: 'fr-FR') */
  language?: string;
  /** Speech rate (0.5 to 2.0, default: 1.0) */
  rate?: number;
  /** Voice pitch (0.5 to 2.0, default: 1.0) */
  pitch?: number;
  /** Volume (0.0 to 1.0, default: 1.0) */
  volume?: number;
  /** Callback when speech starts */
  onStart?: () => void;
  /** Callback when speech completes */
  onDone?: () => void;
  /** Callback when speech is stopped/interrupted */
  onStopped?: () => void;
  /** Callback on speech error */
  onError?: (error: Error) => void;
}

/**
 * Configuration options for speech recognition
 */
export interface ListenOptions {
  /** Language/locale code (default: 'fr-FR') */
  language?: string;
}

/**
 * Speech recognition result callback data
 */
export interface VoiceResult {
  /** Array of possible transcriptions (ordered by confidence) */
  transcripts: string[];
  /** The most likely transcription */
  bestTranscript: string;
  /** Whether this is a final result */
  isFinal: boolean;
}

/**
 * Voice error callback data
 */
export interface VoiceError {
  /** Error message */
  message: string;
  /** Error code (platform-specific) */
  code?: string;
}

/**
 * Voice service event callbacks
 */
export interface VoiceEventCallbacks {
  /** Called when speech recognition returns results */
  onResult?: (result: VoiceResult) => void;
  /** Called when speech recognition starts */
  onSpeechStart?: () => void;
  /** Called when speech recognition ends */
  onSpeechEnd?: () => void;
  /** Called on speech recognition error */
  onError?: (error: VoiceError) => void;
  /** Called when voice volume changes (if supported) */
  onVolumeChange?: (volume: number) => void;
  /** Called when partial results are available */
  onPartialResults?: (partials: string[]) => void;
}

/**
 * Voice service state
 */
export interface VoiceServiceState {
  /** Whether TTS is currently speaking */
  isSpeaking: boolean;
  /** Whether STT is currently listening */
  isListening: boolean;
  /** Whether the voice service is available */
  isAvailable: boolean;
  /** Whether STT has been initialized */
  isInitialized: boolean;
}

// Default language for French-speaking African countries
const DEFAULT_LANGUAGE = 'fr-FR';

/**
 * Internal state tracking
 */
let state: VoiceServiceState = {
  isSpeaking: false,
  isListening: false,
  isAvailable: false,
  isInitialized: false,
};

/**
 * Registered callbacks for voice events
 */
let callbacks: VoiceEventCallbacks = {};

/**
 * Initialize the voice service
 * Sets up event listeners for speech recognition
 *
 * @param eventCallbacks - Callbacks for voice events
 * @returns Promise resolving to true if initialization succeeded
 */
export async function initialize(eventCallbacks?: VoiceEventCallbacks): Promise<boolean> {
  if (state.isInitialized) {
    // Update callbacks if provided
    if (eventCallbacks) {
      callbacks = { ...callbacks, ...eventCallbacks };
    }
    return true;
  }

  try {
    // Check if speech recognition is available
    const isRecognitionAvailable = await Voice.isAvailable();
    state.isAvailable = !!isRecognitionAvailable;

    if (!state.isAvailable) {
      console.warn('VoiceService: Speech recognition is not available on this device');
    }

    // Set up event listeners
    Voice.onSpeechStart = handleSpeechStart;
    Voice.onSpeechEnd = handleSpeechEnd;
    Voice.onSpeechResults = handleSpeechResults;
    Voice.onSpeechPartialResults = handlePartialResults;
    Voice.onSpeechError = handleSpeechError;
    Voice.onSpeechVolumeChanged = handleVolumeChange;

    // Store callbacks
    if (eventCallbacks) {
      callbacks = eventCallbacks;
    }

    state.isInitialized = true;
    return true;
  } catch (error) {
    console.error('VoiceService: Failed to initialize', error);
    return false;
  }
}

/**
 * Clean up the voice service
 * Removes event listeners and stops any active speech
 */
export async function destroy(): Promise<void> {
  try {
    await stopSpeaking();
    await stopListening();

    Voice.removeAllListeners();
    await Voice.destroy();

    state = {
      isSpeaking: false,
      isListening: false,
      isAvailable: false,
      isInitialized: false,
    };
    callbacks = {};
  } catch (error) {
    console.error('VoiceService: Error during cleanup', error);
  }
}

// ============================================================================
// Text-to-Speech (TTS) Functions
// ============================================================================

/**
 * Speak text using text-to-speech
 *
 * @param text - The text to speak
 * @param options - Speech options (language, rate, pitch, etc.)
 * @returns Promise that resolves when speech starts
 *
 * @example
 * ```typescript
 * await speak("Bienvenue sur Yeli VTC");
 * await speak("Course réservée", { rate: 0.9, onDone: () => console.log('Done!') });
 * ```
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (!text || typeof text !== 'string') {
    return;
  }

  const {
    language = DEFAULT_LANGUAGE,
    rate = 1.0,
    pitch = 1.0,
    volume = 1.0,
    onStart,
    onDone,
    onStopped,
    onError,
  } = options;

  // Stop any current speech before starting new one
  const isSpeaking = await Speech.isSpeakingAsync();
  if (isSpeaking) {
    await Speech.stop();
  }

  try {
    state.isSpeaking = true;

    await Speech.speak(text, {
      language,
      rate: Math.max(0.5, Math.min(2.0, rate)),
      pitch: Math.max(0.5, Math.min(2.0, pitch)),
      volume: Math.max(0.0, Math.min(1.0, volume)),
      onStart: () => {
        state.isSpeaking = true;
        onStart?.();
      },
      onDone: () => {
        state.isSpeaking = false;
        onDone?.();
      },
      onStopped: () => {
        state.isSpeaking = false;
        onStopped?.();
      },
      onError: (error) => {
        state.isSpeaking = false;
        onError?.(new Error(error.message || 'Speech error'));
      },
    });
  } catch (error) {
    state.isSpeaking = false;
    const speechError = error instanceof Error ? error : new Error('Unknown speech error');
    onError?.(speechError);
    throw speechError;
  }
}

/**
 * Stop any current text-to-speech
 *
 * @returns Promise that resolves when speech is stopped
 */
export async function stopSpeaking(): Promise<void> {
  try {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      await Speech.stop();
    }
    state.isSpeaking = false;
  } catch (error) {
    console.error('VoiceService: Error stopping speech', error);
    state.isSpeaking = false;
  }
}

/**
 * Pause current text-to-speech (iOS only)
 * On Android, this will stop speech instead
 */
export async function pauseSpeaking(): Promise<void> {
  try {
    await Speech.pause();
  } catch (error) {
    // Pause not supported, try stop
    await stopSpeaking();
  }
}

/**
 * Resume paused text-to-speech (iOS only)
 */
export async function resumeSpeaking(): Promise<void> {
  try {
    await Speech.resume();
  } catch (error) {
    console.warn('VoiceService: Resume not supported on this platform');
  }
}

/**
 * Check if text-to-speech is currently speaking
 *
 * @returns Promise resolving to true if speaking
 */
export async function isSpeaking(): Promise<boolean> {
  try {
    return await Speech.isSpeakingAsync();
  } catch {
    return state.isSpeaking;
  }
}

/**
 * Get available TTS voices for a language
 *
 * @param language - Language code (default: 'fr')
 * @returns Promise resolving to array of voice identifiers
 */
export async function getAvailableVoices(language: string = 'fr'): Promise<Speech.Voice[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.filter((voice) => voice.language.startsWith(language));
  } catch {
    return [];
  }
}

// ============================================================================
// Speech-to-Text (STT) Functions
// ============================================================================

/**
 * Start listening for speech input
 *
 * @param options - Listen options (language)
 * @returns Promise that resolves when listening starts
 *
 * @example
 * ```typescript
 * // First register callbacks
 * await initialize({
 *   onResult: (result) => console.log('You said:', result.bestTranscript),
 *   onError: (error) => console.error('Error:', error.message),
 * });
 *
 * // Then start listening
 * await startListening();
 * ```
 */
export async function startListening(options: ListenOptions = {}): Promise<void> {
  if (!state.isInitialized) {
    await initialize();
  }

  if (!state.isAvailable) {
    throw new Error('Speech recognition is not available on this device');
  }

  if (state.isListening) {
    // Already listening, restart
    await stopListening();
  }

  const { language = DEFAULT_LANGUAGE } = options;

  try {
    await Voice.start(language);
    state.isListening = true;
  } catch (error) {
    state.isListening = false;
    const voiceError = error instanceof Error ? error : new Error('Failed to start listening');
    throw voiceError;
  }
}

/**
 * Stop listening for speech input
 *
 * @returns Promise that resolves when listening stops
 */
export async function stopListening(): Promise<void> {
  if (!state.isListening) {
    return;
  }

  try {
    await Voice.stop();
    state.isListening = false;
  } catch (error) {
    console.error('VoiceService: Error stopping listening', error);
    state.isListening = false;
  }
}

/**
 * Cancel current speech recognition
 * Unlike stopListening, this discards any pending results
 *
 * @returns Promise that resolves when cancelled
 */
export async function cancelListening(): Promise<void> {
  try {
    await Voice.cancel();
    state.isListening = false;
  } catch (error) {
    console.error('VoiceService: Error cancelling listening', error);
    state.isListening = false;
  }
}

/**
 * Check if speech recognition is currently active
 *
 * @returns Whether the service is listening
 */
export function isListening(): boolean {
  return state.isListening;
}

/**
 * Check if speech recognition is available on this device
 *
 * @returns Promise resolving to true if available
 */
export async function isRecognitionAvailable(): Promise<boolean> {
  try {
    const available = await Voice.isAvailable();
    state.isAvailable = !!available;
    return state.isAvailable;
  } catch {
    return false;
  }
}

// ============================================================================
// Event Callbacks Management
// ============================================================================

/**
 * Register callbacks for voice events
 * Can be called multiple times to update callbacks
 *
 * @param eventCallbacks - Callbacks to register
 */
export function onResult(callback: VoiceEventCallbacks['onResult']): void {
  callbacks.onResult = callback;
}

/**
 * Register callback for speech start event
 */
export function onSpeechStart(callback: VoiceEventCallbacks['onSpeechStart']): void {
  callbacks.onSpeechStart = callback;
}

/**
 * Register callback for speech end event
 */
export function onSpeechEnd(callback: VoiceEventCallbacks['onSpeechEnd']): void {
  callbacks.onSpeechEnd = callback;
}

/**
 * Register callback for error events
 */
export function onError(callback: VoiceEventCallbacks['onError']): void {
  callbacks.onError = callback;
}

/**
 * Register callback for volume change events
 */
export function onVolumeChange(callback: VoiceEventCallbacks['onVolumeChange']): void {
  callbacks.onVolumeChange = callback;
}

/**
 * Register callback for partial results
 */
export function onPartialResults(callback: VoiceEventCallbacks['onPartialResults']): void {
  callbacks.onPartialResults = callback;
}

/**
 * Update multiple callbacks at once
 */
export function setCallbacks(eventCallbacks: VoiceEventCallbacks): void {
  callbacks = { ...callbacks, ...eventCallbacks };
}

/**
 * Clear all registered callbacks
 */
export function clearCallbacks(): void {
  callbacks = {};
}

// ============================================================================
// State Getters
// ============================================================================

/**
 * Get current voice service state
 *
 * @returns Current state of the voice service
 */
export function getState(): VoiceServiceState {
  return { ...state };
}

// ============================================================================
// Internal Event Handlers
// ============================================================================

function handleSpeechStart(_event: SpeechStartEvent): void {
  state.isListening = true;
  callbacks.onSpeechStart?.();
}

function handleSpeechEnd(_event: SpeechEndEvent): void {
  state.isListening = false;
  callbacks.onSpeechEnd?.();
}

function handleSpeechResults(event: SpeechResultsEvent): void {
  const transcripts = event.value || [];
  const bestTranscript = transcripts[0] || '';

  const result: VoiceResult = {
    transcripts,
    bestTranscript,
    isFinal: true,
  };

  callbacks.onResult?.(result);
}

function handlePartialResults(event: SpeechResultsEvent): void {
  const partials = event.value || [];
  callbacks.onPartialResults?.(partials);

  // Also send as non-final result
  if (partials.length > 0) {
    const result: VoiceResult = {
      transcripts: partials,
      bestTranscript: partials[0] || '',
      isFinal: false,
    };
    callbacks.onResult?.(result);
  }
}

function handleSpeechError(event: SpeechErrorEvent): void {
  state.isListening = false;

  const error: VoiceError = {
    message: event.error?.message || 'Speech recognition error',
    code: event.error?.code,
  };

  callbacks.onError?.(error);
}

function handleVolumeChange(event: SpeechVolumeChangeEvent): void {
  const volume = event.value ?? 0;
  callbacks.onVolumeChange?.(volume);
}

// ============================================================================
// Default Export - Voice Service Object
// ============================================================================

/**
 * Voice service object providing all TTS and STT functionality
 */
export const voiceService = {
  // Initialization
  initialize,
  destroy,

  // TTS functions
  speak,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
  isSpeaking,
  getAvailableVoices,

  // STT functions
  startListening,
  stopListening,
  cancelListening,
  isListening,
  isRecognitionAvailable,

  // Callback registration
  onResult,
  onSpeechStart,
  onSpeechEnd,
  onError,
  onVolumeChange,
  onPartialResults,
  setCallbacks,
  clearCallbacks,

  // State
  getState,
} as const;

export default voiceService;
