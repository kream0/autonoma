import { useState, useEffect, useCallback, useRef } from 'react';
import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
  SpeechStartEvent,
  SpeechEndEvent,
} from '@react-native-voice/voice';
import * as Speech from 'expo-speech';

/**
 * Voice Intent types for Yeli VTC
 */
export type VoiceIntentType =
  | 'confirm'
  | 'cancel'
  | 'book_ride'
  | 'accept_ride'
  | 'decline_ride'
  | 'complete_ride'
  | 'go_online'
  | 'go_offline'
  | 'call_driver'
  | 'call_customer'
  | 'navigate'
  | 'unknown';

export interface VoiceIntent {
  type: VoiceIntentType;
  confidence: number;
  rawTranscript: string;
  parameters?: Record<string, string>;
}

export interface UseVoiceOptions {
  /** Language for voice recognition (default: 'fr-FR') */
  language?: string;
  /** Automatically parse intents from transcript (default: true) */
  autoParseIntent?: boolean;
  /** Callback when transcript is received */
  onTranscript?: (transcript: string) => void;
  /** Callback when intent is parsed */
  onIntent?: (intent: VoiceIntent) => void;
  /** Callback on voice error */
  onError?: (error: string) => void;
}

export interface UseVoiceReturn {
  /** Start listening for voice input */
  startListening: () => Promise<void>;
  /** Stop listening for voice input */
  stopListening: () => Promise<void>;
  /** Speak text using TTS */
  speak: (text: string, options?: SpeakOptions) => Promise<void>;
  /** Stop current speech */
  stopSpeaking: () => Promise<void>;
  /** Current transcript from voice recognition */
  currentTranscript: string;
  /** Whether voice recognition is currently active */
  isListening: boolean;
  /** Whether TTS is currently speaking */
  isSpeaking: boolean;
  /** Last parsed voice intent */
  lastIntent: VoiceIntent | null;
  /** Last error message */
  error: string | null;
  /** Clear the current transcript */
  clearTranscript: () => void;
  /** Clear the last error */
  clearError: () => void;
}

export interface SpeakOptions {
  /** Language for TTS (default: 'fr-FR') */
  language?: string;
  /** Speech pitch (0.5 - 2.0, default: 1.0) */
  pitch?: number;
  /** Speech rate (0.1 - 2.0, default: 1.0) */
  rate?: number;
  /** Callback when speech starts */
  onStart?: () => void;
  /** Callback when speech completes */
  onDone?: () => void;
  /** Callback on speech error */
  onError?: (error: Error) => void;
}

/**
 * Intent patterns for French voice commands
 */
const INTENT_PATTERNS: Array<{ type: VoiceIntentType; patterns: RegExp[] }> = [
  {
    type: 'confirm',
    patterns: [/\boui\b/i, /\bd'accord\b/i, /\bconfirme[rz]?\b/i, /\bcorrect\b/i, /\bc'est ça\b/i],
  },
  {
    type: 'cancel',
    patterns: [/\bnon\b/i, /\bannule[rz]?\b/i, /\barrête[rz]?\b/i, /\bstop\b/i],
  },
  {
    type: 'book_ride',
    patterns: [
      /\bréserve[rz]?\b/i,
      /\bcommande[rz]?\b/i,
      /\baller à\b/i,
      /\bemmène[rz]?[- ]moi\b/i,
      /\bcourse\b/i,
    ],
  },
  {
    type: 'accept_ride',
    patterns: [/\baccepte[rz]?\b/i, /\bprend[sz]?\b/i, /\bje prends\b/i],
  },
  {
    type: 'decline_ride',
    patterns: [/\brefuse[rz]?\b/i, /\bdécline[rz]?\b/i, /\bpas cette fois\b/i],
  },
  {
    type: 'complete_ride',
    patterns: [/\btermine[rz]?\b/i, /\bfini\b/i, /\barrivé\b/i, /\bcourse terminée\b/i],
  },
  {
    type: 'go_online',
    patterns: [/\ben ligne\b/i, /\bcommence[rz]?\b/i, /\bdisponible\b/i, /\bprêt\b/i],
  },
  {
    type: 'go_offline',
    patterns: [/\bhors ligne\b/i, /\bpause\b/i, /\barrête[rz]?\b/i, /\bfini pour aujourd'hui\b/i],
  },
  {
    type: 'call_driver',
    patterns: [/\bappelle[rz]? (le )?chauffeur\b/i, /\bcontacte[rz]? (le )?chauffeur\b/i],
  },
  {
    type: 'call_customer',
    patterns: [/\bappelle[rz]? (le )?client\b/i, /\bcontacte[rz]? (le )?client\b/i],
  },
  {
    type: 'navigate',
    patterns: [/\bnavigue[rz]?\b/i, /\bitinéraire\b/i, /\bdirection\b/i, /\broute\b/i],
  },
];

/**
 * Parse transcript to extract intent
 */
function parseIntent(transcript: string): VoiceIntent {
  const normalizedTranscript = transcript.toLowerCase().trim();

  for (const { type, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedTranscript)) {
        return {
          type,
          confidence: 0.8,
          rawTranscript: transcript,
        };
      }
    }
  }

  return {
    type: 'unknown',
    confidence: 0,
    rawTranscript: transcript,
  };
}

/**
 * Custom hook for voice commands in Yeli VTC
 * Provides easy access to voice recognition and text-to-speech
 */
export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const {
    language = 'fr-FR',
    autoParseIntent = true,
    onTranscript,
    onIntent,
    onError,
  } = options;

  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [lastIntent, setLastIntent] = useState<VoiceIntent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isListeningRef = useRef<boolean>(false);

  // Voice recognition event handlers
  useEffect(() => {
    const onSpeechStart = (_event: SpeechStartEvent): void => {
      setIsListening(true);
      isListeningRef.current = true;
    };

    const onSpeechEnd = (_event: SpeechEndEvent): void => {
      setIsListening(false);
      isListeningRef.current = false;
    };

    const onSpeechResults = (event: SpeechResultsEvent): void => {
      const results = event.value;
      if (results && results.length > 0) {
        const transcript = results[0];
        setCurrentTranscript(transcript);
        onTranscript?.(transcript);

        if (autoParseIntent) {
          const intent = parseIntent(transcript);
          setLastIntent(intent);
          onIntent?.(intent);
        }
      }
    };

    const onSpeechError = (event: SpeechErrorEvent): void => {
      const errorMessage = event.error?.message || 'Voice recognition error';
      setError(errorMessage);
      onError?.(errorMessage);
      setIsListening(false);
      isListeningRef.current = false;
    };

    // Register event handlers
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;

    // Cleanup on unmount
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, [autoParseIntent, onTranscript, onIntent, onError]);

  const startListening = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      setCurrentTranscript('');

      // Stop any ongoing speech before listening
      if (isSpeaking) {
        await Speech.stop();
        setIsSpeaking(false);
      }

      await Voice.start(language);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start voice recognition';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [language, isSpeaking, onError]);

  const stopListening = useCallback(async (): Promise<void> => {
    try {
      await Voice.stop();
      setIsListening(false);
      isListeningRef.current = false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop voice recognition';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [onError]);

  const speak = useCallback(
    async (text: string, speakOptions: SpeakOptions = {}): Promise<void> => {
      try {
        setError(null);

        // Stop listening while speaking
        if (isListeningRef.current) {
          await Voice.stop();
          setIsListening(false);
          isListeningRef.current = false;
        }

        setIsSpeaking(true);

        await Speech.speak(text, {
          language: speakOptions.language || 'fr-FR',
          pitch: speakOptions.pitch || 1.0,
          rate: speakOptions.rate || 1.0,
          onStart: () => {
            speakOptions.onStart?.();
          },
          onDone: () => {
            setIsSpeaking(false);
            speakOptions.onDone?.();
          },
          onError: (speechError) => {
            setIsSpeaking(false);
            speakOptions.onError?.(speechError);
          },
        });
      } catch (err) {
        setIsSpeaking(false);
        const errorMessage = err instanceof Error ? err.message : 'Failed to speak';
        setError(errorMessage);
        onError?.(errorMessage);
      }
    },
    [onError]
  );

  const stopSpeaking = useCallback(async (): Promise<void> => {
    try {
      await Speech.stop();
      setIsSpeaking(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stop speaking';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [onError]);

  const clearTranscript = useCallback((): void => {
    setCurrentTranscript('');
    setLastIntent(null);
  }, []);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  return {
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    currentTranscript,
    isListening,
    isSpeaking,
    lastIntent,
    error,
    clearTranscript,
    clearError,
  };
}

export default useVoice;
