/**
 * Voice Intent Parser for Yeli VTC
 * Parses voice transcripts into structured intents for ride-hailing commands
 */

/**
 * Supported voice intent types
 */
export type VoiceIntentType =
  | 'destination'
  | 'confirm'
  | 'cancel'
  | 'accept_ride'
  | 'reject_ride'
  | 'start_ride'
  | 'complete_ride'
  | 'book_ride'
  | 'go_online'
  | 'go_offline'
  | 'call_driver'
  | 'call_customer'
  | 'navigate'
  | 'unknown';

/**
 * Voice intent result with parsed data
 */
export interface VoiceIntent {
  /** The type of intent detected */
  type: VoiceIntentType;
  /** Confidence score from 0 to 1 */
  confidence: number;
  /** The original transcript text */
  rawTranscript: string;
  /** Extracted parameters from the transcript */
  parameters?: {
    /** Destination address for destination intents */
    destination?: string;
    /** Location name or landmark */
    locationName?: string;
    /** Any additional context */
    context?: string;
  };
}

/**
 * Pattern definition for intent matching
 */
interface IntentPattern {
  type: VoiceIntentType;
  patterns: RegExp[];
  /** Higher priority patterns are checked first */
  priority: number;
  /** Extract parameters from the match */
  extractParams?: (transcript: string, match: RegExpMatchArray) => VoiceIntent['parameters'];
}

/**
 * Destination extraction patterns for French
 */
const DESTINATION_EXTRACTORS: RegExp[] = [
  /(?:aller|emmène[rz]?[- ]moi|direction|vers|jusqu'?à|destination)\s+(?:à|au|aux|vers|chez)?\s*(.+)/i,
  /(?:je veux aller|je voudrais aller)\s+(?:à|au|aux|vers|chez)?\s*(.+)/i,
  /(?:conduis[- ]moi|amène[- ]moi)\s+(?:à|au|aux|vers|chez)?\s*(.+)/i,
  /(?:à|au)\s+(.+)/i,
];

/**
 * Extract destination from transcript
 */
function extractDestination(transcript: string): string | undefined {
  const normalized = transcript.trim();

  for (const pattern of DESTINATION_EXTRACTORS) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      // Clean up the destination
      let destination = match[1].trim();
      // Remove trailing punctuation
      destination = destination.replace(/[.,!?]+$/, '');
      // Remove common filler words at the end
      destination = destination.replace(/\s+(?:s'il vous plaît|s'il te plaît|svp)$/i, '');
      return destination;
    }
  }

  return undefined;
}

/**
 * Intent patterns ordered by priority (higher numbers = higher priority)
 */
const INTENT_PATTERNS: IntentPattern[] = [
  // Confirmation intents (high priority)
  {
    type: 'confirm',
    patterns: [
      /^oui$/i,
      /\boui\b/i,
      /\bd'accord\b/i,
      /\bconfirme[rz]?\b/i,
      /\bcorrect\b/i,
      /\bc'est ça\b/i,
      /\bc'est bon\b/i,
      /\bok\b/i,
      /\bparfait\b/i,
      /\bbien sûr\b/i,
      /\bexactement\b/i,
      /\btout à fait\b/i,
      /\bvalide[rz]?\b/i,
    ],
    priority: 100,
  },

  // Cancellation intents (high priority)
  {
    type: 'cancel',
    patterns: [
      /^non$/i,
      /\bnon\b/i,
      /\bannule[rz]?\b/i,
      /\barrête[rz]?\b/i,
      /\bstop\b/i,
      /\bpas (?:maintenant|aujourd'hui|cette fois)\b/i,
      /\blaisse tomber\b/i,
      /\btant pis\b/i,
      /\bc'est pas ça\b/i,
      /\bje ne veux pas\b/i,
      /\bje ne veux plus\b/i,
    ],
    priority: 100,
  },

  // Accept ride (driver)
  {
    type: 'accept_ride',
    patterns: [
      /\baccepte[rz]?\b/i,
      /\bje (?:l')?accepte\b/i,
      /\bje prends\b/i,
      /\bprends la course\b/i,
      /\bj'accepte la course\b/i,
      /\bcourse acceptée\b/i,
    ],
    priority: 90,
  },

  // Reject ride (driver)
  {
    type: 'reject_ride',
    patterns: [
      /\brefuse[rz]?\b/i,
      /\bje refuse\b/i,
      /\bdécline[rz]?\b/i,
      /\bpas cette (?:course|fois)\b/i,
      /\bje passe\b/i,
      /\bje décline\b/i,
      /\bcourse refusée\b/i,
      /\bpas intéressé\b/i,
    ],
    priority: 90,
  },

  // Start ride (driver)
  {
    type: 'start_ride',
    patterns: [
      /\bdémarre[rz]?\b/i,
      /\bcommence[rz]? la course\b/i,
      /\bdébute[rz]? la course\b/i,
      /\bcourse démarrée\b/i,
      /\bon y va\b/i,
      /\bc'est parti\b/i,
      /\bstart\b/i,
      /\ble client est monté\b/i,
      /\bclient à bord\b/i,
    ],
    priority: 85,
  },

  // Complete ride (driver)
  {
    type: 'complete_ride',
    patterns: [
      /\btermine[rz]?\b/i,
      /\btermine[rz]? la course\b/i,
      /\bcourse terminée\b/i,
      /\bfini\b/i,
      /\barrivé(?:e)?(?:s)?\b/i,
      /\bon est arrivé\b/i,
      /\bdestination atteinte\b/i,
      /\bfin de course\b/i,
      /\bcomplète[rz]?\b/i,
    ],
    priority: 85,
  },

  // Destination / Book ride (customer)
  {
    type: 'destination',
    patterns: [
      /\baller\s+(?:à|au|aux|vers|chez)\b/i,
      /\bemmène[rz]?[- ]moi\b/i,
      /\bconduis[- ]moi\b/i,
      /\bamène[- ]moi\b/i,
      /\bdirection\b/i,
      /\bdestination\b/i,
      /\bje veux aller\b/i,
      /\bje voudrais aller\b/i,
    ],
    priority: 80,
    extractParams: (transcript: string): VoiceIntent['parameters'] => {
      const destination = extractDestination(transcript);
      return destination ? { destination } : undefined;
    },
  },

  // Book ride
  {
    type: 'book_ride',
    patterns: [
      /\bréserve[rz]?\b/i,
      /\bréserve[rz]? (?:une|la) course\b/i,
      /\bcommande[rz]? (?:une|la) course\b/i,
      /\bcommande[rz]? un (?:taxi|vtc|chauffeur)\b/i,
      /\bje veux (?:une|la) course\b/i,
      /\bappelle[rz]? un chauffeur\b/i,
      /\btrouver un chauffeur\b/i,
    ],
    priority: 75,
  },

  // Go online (driver)
  {
    type: 'go_online',
    patterns: [
      /\ben ligne\b/i,
      /\bpasser en ligne\b/i,
      /\bdisponible\b/i,
      /\bje suis disponible\b/i,
      /\bcommence[rz]? (?:le travail|à travailler)\b/i,
      /\bprêt\b/i,
      /\bje suis prêt\b/i,
      /\bactive[rz]?\b/i,
    ],
    priority: 70,
  },

  // Go offline (driver)
  {
    type: 'go_offline',
    patterns: [
      /\bhors ligne\b/i,
      /\bpasser hors ligne\b/i,
      /\bpause\b/i,
      /\bje fais une pause\b/i,
      /\barrête[rz]? (?:le travail|de travailler)\b/i,
      /\bfini pour (?:aujourd'hui|ce soir|maintenant)\b/i,
      /\bje m'arrête\b/i,
      /\bdésactive[rz]?\b/i,
      /\bindisponible\b/i,
    ],
    priority: 70,
  },

  // Call driver (customer)
  {
    type: 'call_driver',
    patterns: [
      /\bappelle[rz]? (?:le|mon) chauffeur\b/i,
      /\bcontacte[rz]? (?:le|mon) chauffeur\b/i,
      /\btéléphone[rz]? (?:au|le) chauffeur\b/i,
    ],
    priority: 65,
  },

  // Call customer (driver)
  {
    type: 'call_customer',
    patterns: [
      /\bappelle[rz]? (?:le|mon) client\b/i,
      /\bcontacte[rz]? (?:le|mon) client\b/i,
      /\btéléphone[rz]? (?:au|le) client\b/i,
      /\bappelle[rz]? (?:le|la) passager\b/i,
    ],
    priority: 65,
  },

  // Navigate
  {
    type: 'navigate',
    patterns: [
      /\bnavigue[rz]?\b/i,
      /\bitinéraire\b/i,
      /\bmontre[rz]? (?:la|le) (?:route|chemin)\b/i,
      /\bgps\b/i,
      /\bouvre[rz]? (?:la|le) navigation\b/i,
      /\blance[rz]? (?:la|le) navigation\b/i,
    ],
    priority: 60,
  },
];

// Sort patterns by priority (descending)
const SORTED_PATTERNS = [...INTENT_PATTERNS].sort((a, b) => b.priority - a.priority);

/**
 * Calculate confidence based on match quality
 */
function calculateConfidence(transcript: string, pattern: RegExp): number {
  const match = transcript.match(pattern);
  if (!match) return 0;

  // Base confidence
  let confidence = 0.7;

  // Exact matches get higher confidence
  const matchedText = match[0];
  const matchRatio = matchedText.length / transcript.length;

  // If the match covers most of the transcript, higher confidence
  if (matchRatio > 0.8) {
    confidence = 0.95;
  } else if (matchRatio > 0.5) {
    confidence = 0.85;
  } else if (matchRatio > 0.3) {
    confidence = 0.75;
  }

  return confidence;
}

/**
 * Parse a voice transcript into a structured VoiceIntent
 *
 * @param transcript - The raw voice transcript text
 * @returns VoiceIntent with type, confidence, and extracted parameters
 *
 * @example
 * ```typescript
 * const intent = parseIntent("Emmène-moi à l'aéroport");
 * // Returns: { type: 'destination', confidence: 0.85, rawTranscript: "...", parameters: { destination: "l'aéroport" } }
 *
 * const confirmIntent = parseIntent("Oui, c'est bon");
 * // Returns: { type: 'confirm', confidence: 0.95, rawTranscript: "..." }
 * ```
 */
export function parseIntent(transcript: string): VoiceIntent {
  if (!transcript || typeof transcript !== 'string') {
    return {
      type: 'unknown',
      confidence: 0,
      rawTranscript: transcript || '',
    };
  }

  const normalizedTranscript = transcript.toLowerCase().trim();

  if (!normalizedTranscript) {
    return {
      type: 'unknown',
      confidence: 0,
      rawTranscript: transcript,
    };
  }

  // Find the best matching intent
  let bestMatch: VoiceIntent | null = null;
  let highestConfidence = 0;

  for (const intentPattern of SORTED_PATTERNS) {
    for (const pattern of intentPattern.patterns) {
      const match = normalizedTranscript.match(pattern);
      if (match) {
        const confidence = calculateConfidence(normalizedTranscript, pattern);

        if (confidence > highestConfidence) {
          highestConfidence = confidence;

          // Extract parameters if available
          const parameters = intentPattern.extractParams
            ? intentPattern.extractParams(transcript, match)
            : undefined;

          bestMatch = {
            type: intentPattern.type,
            confidence,
            rawTranscript: transcript,
            parameters,
          };
        }
      }
    }
  }

  // Return best match or unknown intent
  return (
    bestMatch || {
      type: 'unknown',
      confidence: 0,
      rawTranscript: transcript,
    }
  );
}

/**
 * Check if the intent is a confirmation (yes/ok/confirm)
 */
export function isConfirmIntent(intent: VoiceIntent): boolean {
  return intent.type === 'confirm' && intent.confidence >= 0.7;
}

/**
 * Check if the intent is a cancellation (no/cancel/stop)
 */
export function isCancelIntent(intent: VoiceIntent): boolean {
  return intent.type === 'cancel' && intent.confidence >= 0.7;
}

/**
 * Check if the intent has a destination parameter
 */
export function hasDestination(intent: VoiceIntent): boolean {
  return intent.type === 'destination' && !!intent.parameters?.destination;
}

/**
 * Get destination from intent if available
 */
export function getDestination(intent: VoiceIntent): string | undefined {
  return intent.parameters?.destination;
}

/**
 * Check if intent is a driver action (accept, reject, start, complete)
 */
export function isDriverAction(intent: VoiceIntent): boolean {
  return ['accept_ride', 'reject_ride', 'start_ride', 'complete_ride'].includes(intent.type);
}

/**
 * Check if intent is a customer action (destination, book, call driver)
 */
export function isCustomerAction(intent: VoiceIntent): boolean {
  return ['destination', 'book_ride', 'call_driver'].includes(intent.type);
}

export default parseIntent;
