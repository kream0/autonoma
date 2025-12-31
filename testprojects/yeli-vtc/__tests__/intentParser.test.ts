/**
 * Unit tests for the Voice Intent Parser
 * Tests parseIntent for all command types in French:
 * - Destinations
 * - Confirmations
 * - Cancellations
 * - Driver commands
 */

import { describe, expect, test } from 'bun:test';

/**
 * Voice Intent types for Yeli VTC
 */
type VoiceIntentType =
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

interface VoiceIntent {
  type: VoiceIntentType;
  confidence: number;
  rawTranscript: string;
  parameters?: Record<string, string>;
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

// =============================================================================
// CONFIRMATION TESTS (French: "oui", "d'accord", "confirmer", etc.)
// =============================================================================

describe('parseIntent - Confirmations (French)', () => {
  test('should parse "oui" as confirm', () => {
    const result = parseIntent('oui');
    expect(result.type).toBe('confirm');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.rawTranscript).toBe('oui');
  });

  test('should parse "Oui" (capitalized) as confirm', () => {
    const result = parseIntent('Oui');
    expect(result.type).toBe('confirm');
  });

  test('should parse "OUI" (uppercase) as confirm', () => {
    const result = parseIntent('OUI');
    expect(result.type).toBe('confirm');
  });

  test('should parse "d\'accord" as confirm', () => {
    const result = parseIntent("d'accord");
    expect(result.type).toBe('confirm');
  });

  test('should parse "confirmer" as confirm', () => {
    const result = parseIntent('confirmer');
    expect(result.type).toBe('confirm');
  });

  test('should parse "confirme" as confirm', () => {
    const result = parseIntent('confirme');
    expect(result.type).toBe('confirm');
  });

  test('should parse "confirmez" as confirm', () => {
    const result = parseIntent('confirmez');
    expect(result.type).toBe('confirm');
  });

  test('should parse "correct" as confirm', () => {
    const result = parseIntent('correct');
    expect(result.type).toBe('confirm');
  });

  test('should parse "c\'est ça" as confirm', () => {
    const result = parseIntent("c'est ça");
    expect(result.type).toBe('confirm');
  });

  test('should parse "oui, c\'est bon" (with context) as confirm', () => {
    const result = parseIntent("oui, c'est bon");
    expect(result.type).toBe('confirm');
  });
});

// =============================================================================
// CANCELLATION TESTS (French: "non", "annuler", "stop", etc.)
// =============================================================================

describe('parseIntent - Cancellations (French)', () => {
  test('should parse "non" as cancel', () => {
    const result = parseIntent('non');
    expect(result.type).toBe('cancel');
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('should parse "Non" (capitalized) as cancel', () => {
    const result = parseIntent('Non');
    expect(result.type).toBe('cancel');
  });

  test('should parse "annuler" as cancel', () => {
    const result = parseIntent('annuler');
    expect(result.type).toBe('cancel');
  });

  test('should parse "annule" as cancel', () => {
    const result = parseIntent('annule');
    expect(result.type).toBe('cancel');
  });

  test('should parse "annulez" as cancel', () => {
    const result = parseIntent('annulez');
    expect(result.type).toBe('cancel');
  });

  test('should parse "arrête" as cancel', () => {
    const result = parseIntent('arrête');
    expect(result.type).toBe('cancel');
  });

  test('should parse "arrêter" as cancel', () => {
    const result = parseIntent('arrêter');
    expect(result.type).toBe('cancel');
  });

  test('should parse "arrêtez" as cancel', () => {
    const result = parseIntent('arrêtez');
    expect(result.type).toBe('cancel');
  });

  test('should parse "stop" as cancel', () => {
    const result = parseIntent('stop');
    expect(result.type).toBe('cancel');
  });

  test('should parse "non merci" (with context) as cancel', () => {
    const result = parseIntent('non merci');
    expect(result.type).toBe('cancel');
  });
});

// =============================================================================
// DESTINATION/BOOKING TESTS (French: "aller à", "réserver", etc.)
// =============================================================================

describe('parseIntent - Destinations/Booking (French)', () => {
  test('should parse "réserver" as book_ride', () => {
    const result = parseIntent('réserver');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "réserve" as book_ride', () => {
    const result = parseIntent('réserve');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "réservez" as book_ride', () => {
    const result = parseIntent('réservez');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "commander" as book_ride', () => {
    const result = parseIntent('commander');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "commande" as book_ride', () => {
    const result = parseIntent('commande');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "commandez" as book_ride', () => {
    const result = parseIntent('commandez');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "je veux aller à Dakar" as book_ride', () => {
    const result = parseIntent('je veux aller à Dakar');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "aller à l\'aéroport" as book_ride', () => {
    const result = parseIntent("je veux aller à l'aéroport");
    expect(result.type).toBe('book_ride');
  });

  test('should parse "emmène-moi" as book_ride', () => {
    const result = parseIntent('emmène-moi');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "emmène moi" (without hyphen) as book_ride', () => {
    const result = parseIntent('emmène moi');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "emmènez-moi" as book_ride', () => {
    const result = parseIntent('emmènez-moi');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "emmène-moi à la gare" as book_ride', () => {
    const result = parseIntent('emmène-moi à la gare');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "je veux une course" as book_ride', () => {
    const result = parseIntent('je veux une course');
    expect(result.type).toBe('book_ride');
  });

  test('should parse "réserve une course pour Abidjan" as book_ride', () => {
    const result = parseIntent('réserve une course pour Abidjan');
    expect(result.type).toBe('book_ride');
  });
});

// =============================================================================
// DRIVER COMMANDS - ACCEPT RIDE (French: "accepter", "prendre", etc.)
// =============================================================================

describe('parseIntent - Driver Accept Ride (French)', () => {
  test('should parse "accepter" as accept_ride', () => {
    const result = parseIntent('accepter');
    expect(result.type).toBe('accept_ride');
  });

  test('should parse "accepte" as accept_ride', () => {
    const result = parseIntent('accepte');
    expect(result.type).toBe('accept_ride');
  });

  test('should parse "acceptez" as accept_ride', () => {
    const result = parseIntent('acceptez');
    expect(result.type).toBe('accept_ride');
  });

  test('should parse "prendre" as accept_ride', () => {
    const result = parseIntent('prendre');
    expect(result.type).toBe('accept_ride');
  });

  test('should parse "prends" as accept_ride', () => {
    const result = parseIntent('prends');
    expect(result.type).toBe('accept_ride');
  });

  test('should parse "prenez" as accept_ride', () => {
    const result = parseIntent('prenez');
    expect(result.type).toBe('accept_ride');
  });

  test('should parse "je prends" as accept_ride', () => {
    const result = parseIntent('je prends');
    expect(result.type).toBe('accept_ride');
  });

  test('should parse "je prends cette course" as accept_ride', () => {
    const result = parseIntent('je prends cette course');
    expect(result.type).toBe('accept_ride');
  });
});

// =============================================================================
// DRIVER COMMANDS - DECLINE RIDE (French: "refuser", "décliner", etc.)
// =============================================================================

describe('parseIntent - Driver Decline Ride (French)', () => {
  test('should parse "refuser" as decline_ride', () => {
    const result = parseIntent('refuser');
    expect(result.type).toBe('decline_ride');
  });

  test('should parse "refuse" as decline_ride', () => {
    const result = parseIntent('refuse');
    expect(result.type).toBe('decline_ride');
  });

  test('should parse "refusez" as decline_ride', () => {
    const result = parseIntent('refusez');
    expect(result.type).toBe('decline_ride');
  });

  test('should parse "décliner" as decline_ride', () => {
    const result = parseIntent('décliner');
    expect(result.type).toBe('decline_ride');
  });

  test('should parse "décline" as decline_ride', () => {
    const result = parseIntent('décline');
    expect(result.type).toBe('decline_ride');
  });

  test('should parse "déclinez" as decline_ride', () => {
    const result = parseIntent('déclinez');
    expect(result.type).toBe('decline_ride');
  });

  test('should parse "pas cette fois" as decline_ride', () => {
    const result = parseIntent('pas cette fois');
    expect(result.type).toBe('decline_ride');
  });

  test('should parse "pas cette fois-ci" as decline_ride', () => {
    const result = parseIntent('pas cette fois-ci');
    expect(result.type).toBe('decline_ride');
  });
});

// =============================================================================
// DRIVER COMMANDS - COMPLETE RIDE (French: "terminer", "fini", "arrivé", etc.)
// =============================================================================

describe('parseIntent - Driver Complete Ride (French)', () => {
  test('should parse "terminer" as complete_ride', () => {
    const result = parseIntent('terminer');
    expect(result.type).toBe('complete_ride');
  });

  test('should parse "termine" as complete_ride', () => {
    const result = parseIntent('termine');
    expect(result.type).toBe('complete_ride');
  });

  test('should parse "terminez" as complete_ride', () => {
    const result = parseIntent('terminez');
    expect(result.type).toBe('complete_ride');
  });

  test('should parse "fini" as complete_ride', () => {
    const result = parseIntent('fini');
    expect(result.type).toBe('complete_ride');
  });

  test('should parse "arrivé" as complete_ride', () => {
    const result = parseIntent('arrivé');
    expect(result.type).toBe('complete_ride');
  });

  test('should parse "on est arrivé" as complete_ride', () => {
    const result = parseIntent('on est arrivé');
    expect(result.type).toBe('complete_ride');
  });

  test('should parse "course terminée" as complete_ride', () => {
    const result = parseIntent('course terminée');
    expect(result.type).toBe('complete_ride');
  });

  test('should parse "la course est terminée" as complete_ride', () => {
    const result = parseIntent('la course est terminée');
    expect(result.type).toBe('complete_ride');
  });
});

// =============================================================================
// DRIVER COMMANDS - GO ONLINE (French: "en ligne", "disponible", "prêt", etc.)
// =============================================================================

describe('parseIntent - Driver Go Online (French)', () => {
  test('should parse "en ligne" as go_online', () => {
    const result = parseIntent('en ligne');
    expect(result.type).toBe('go_online');
  });

  test('should parse "je suis en ligne" as go_online', () => {
    const result = parseIntent('je suis en ligne');
    expect(result.type).toBe('go_online');
  });

  test('should parse "commencer" as go_online', () => {
    const result = parseIntent('commencer');
    expect(result.type).toBe('go_online');
  });

  test('should parse "commence" as go_online', () => {
    const result = parseIntent('commence');
    expect(result.type).toBe('go_online');
  });

  test('should parse "commencez" as go_online', () => {
    const result = parseIntent('commencez');
    expect(result.type).toBe('go_online');
  });

  test('should parse "disponible" as go_online', () => {
    const result = parseIntent('disponible');
    expect(result.type).toBe('go_online');
  });

  test('should parse "je suis disponible" as go_online', () => {
    const result = parseIntent('je suis disponible');
    expect(result.type).toBe('go_online');
  });

  test('should parse "prêt" as go_online', () => {
    const result = parseIntent('prêt');
    expect(result.type).toBe('go_online');
  });

  test('should parse "je suis prêt" as go_online', () => {
    const result = parseIntent('je suis prêt');
    expect(result.type).toBe('go_online');
  });
});

// =============================================================================
// DRIVER COMMANDS - GO OFFLINE (French: "hors ligne", "pause", etc.)
// =============================================================================

describe('parseIntent - Driver Go Offline (French)', () => {
  test('should parse "hors ligne" as go_offline', () => {
    const result = parseIntent('hors ligne');
    expect(result.type).toBe('go_offline');
  });

  test('should parse "je suis hors ligne" as go_offline', () => {
    const result = parseIntent('je suis hors ligne');
    expect(result.type).toBe('go_offline');
  });

  test('should parse "pause" as go_offline', () => {
    const result = parseIntent('pause');
    expect(result.type).toBe('go_offline');
  });

  test('should parse "je prends une pause" as go_offline', () => {
    const result = parseIntent('je prends une pause');
    expect(result.type).toBe('go_offline');
  });

  test('should parse "fini pour aujourd\'hui" as go_offline', () => {
    const result = parseIntent("fini pour aujourd'hui");
    expect(result.type).toBe('go_offline');
  });

  test('should parse "j\'ai fini pour aujourd\'hui" as go_offline', () => {
    const result = parseIntent("j'ai fini pour aujourd'hui");
    expect(result.type).toBe('go_offline');
  });
});

// =============================================================================
// DRIVER COMMANDS - CALL DRIVER (French: "appeler le chauffeur", etc.)
// =============================================================================

describe('parseIntent - Call Driver (French)', () => {
  test('should parse "appelle le chauffeur" as call_driver', () => {
    const result = parseIntent('appelle le chauffeur');
    expect(result.type).toBe('call_driver');
  });

  test('should parse "appelle chauffeur" as call_driver', () => {
    const result = parseIntent('appelle chauffeur');
    expect(result.type).toBe('call_driver');
  });

  test('should parse "appeler le chauffeur" as call_driver', () => {
    const result = parseIntent('appeler le chauffeur');
    expect(result.type).toBe('call_driver');
  });

  test('should parse "appelez le chauffeur" as call_driver', () => {
    const result = parseIntent('appelez le chauffeur');
    expect(result.type).toBe('call_driver');
  });

  test('should parse "contacte le chauffeur" as call_driver', () => {
    const result = parseIntent('contacte le chauffeur');
    expect(result.type).toBe('call_driver');
  });

  test('should parse "contacter le chauffeur" as call_driver', () => {
    const result = parseIntent('contacter le chauffeur');
    expect(result.type).toBe('call_driver');
  });

  test('should parse "contactez le chauffeur" as call_driver', () => {
    const result = parseIntent('contactez le chauffeur');
    expect(result.type).toBe('call_driver');
  });
});

// =============================================================================
// DRIVER COMMANDS - CALL CUSTOMER (French: "appeler le client", etc.)
// =============================================================================

describe('parseIntent - Call Customer (French)', () => {
  test('should parse "appelle le client" as call_customer', () => {
    const result = parseIntent('appelle le client');
    expect(result.type).toBe('call_customer');
  });

  test('should parse "appelle client" as call_customer', () => {
    const result = parseIntent('appelle client');
    expect(result.type).toBe('call_customer');
  });

  test('should parse "appeler le client" as call_customer', () => {
    const result = parseIntent('appeler le client');
    expect(result.type).toBe('call_customer');
  });

  test('should parse "appelez le client" as call_customer', () => {
    const result = parseIntent('appelez le client');
    expect(result.type).toBe('call_customer');
  });

  test('should parse "contacte le client" as call_customer', () => {
    const result = parseIntent('contacte le client');
    expect(result.type).toBe('call_customer');
  });

  test('should parse "contacter le client" as call_customer', () => {
    const result = parseIntent('contacter le client');
    expect(result.type).toBe('call_customer');
  });

  test('should parse "contactez le client" as call_customer', () => {
    const result = parseIntent('contactez le client');
    expect(result.type).toBe('call_customer');
  });
});

// =============================================================================
// NAVIGATION COMMANDS (French: "naviguer", "itinéraire", "direction", etc.)
// =============================================================================

describe('parseIntent - Navigation (French)', () => {
  test('should parse "naviguer" as navigate', () => {
    const result = parseIntent('naviguer');
    expect(result.type).toBe('navigate');
  });

  test('should parse "navigue" as navigate', () => {
    const result = parseIntent('navigue');
    expect(result.type).toBe('navigate');
  });

  test('should parse "naviguez" as navigate', () => {
    const result = parseIntent('naviguez');
    expect(result.type).toBe('navigate');
  });

  test('should parse "itinéraire" as navigate', () => {
    const result = parseIntent('itinéraire');
    expect(result.type).toBe('navigate');
  });

  test('should parse "montre l\'itinéraire" as navigate', () => {
    const result = parseIntent("montre l'itinéraire");
    expect(result.type).toBe('navigate');
  });

  test('should parse "direction" as navigate', () => {
    const result = parseIntent('direction');
    expect(result.type).toBe('navigate');
  });

  test('should parse "quelle direction" as navigate', () => {
    const result = parseIntent('quelle direction');
    expect(result.type).toBe('navigate');
  });

  test('should parse "route" as navigate', () => {
    const result = parseIntent('route');
    expect(result.type).toBe('navigate');
  });

  test('should parse "montre la route" as navigate', () => {
    const result = parseIntent('montre la route');
    expect(result.type).toBe('navigate');
  });
});

// =============================================================================
// UNKNOWN INTENT TESTS
// =============================================================================

describe('parseIntent - Unknown Intents', () => {
  test('should return unknown for empty string', () => {
    const result = parseIntent('');
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  test('should return unknown for whitespace only', () => {
    const result = parseIntent('   ');
    expect(result.type).toBe('unknown');
  });

  test('should return unknown for random text', () => {
    const result = parseIntent('bonjour comment ça va');
    expect(result.type).toBe('unknown');
  });

  test('should return unknown for unrelated phrases', () => {
    const result = parseIntent('quel temps fait-il');
    expect(result.type).toBe('unknown');
  });

  test('should return unknown for similar but non-matching words', () => {
    const result = parseIntent('ouille');
    expect(result.type).toBe('unknown');
  });

  test('should preserve rawTranscript in unknown result', () => {
    const transcript = 'something random';
    const result = parseIntent(transcript);
    expect(result.type).toBe('unknown');
    expect(result.rawTranscript).toBe(transcript);
  });
});

// =============================================================================
// EDGE CASES AND ROBUSTNESS TESTS
// =============================================================================

describe('parseIntent - Edge Cases', () => {
  test('should handle leading whitespace', () => {
    const result = parseIntent('   oui');
    expect(result.type).toBe('confirm');
  });

  test('should handle trailing whitespace', () => {
    const result = parseIntent('oui   ');
    expect(result.type).toBe('confirm');
  });

  test('should handle mixed case', () => {
    const result = parseIntent('OuI');
    expect(result.type).toBe('confirm');
  });

  test('should handle accented characters correctly', () => {
    const result = parseIntent('réserver');
    expect(result.type).toBe('book_ride');
  });

  test('should handle special characters in context', () => {
    const result = parseIntent("oui, d'accord!");
    expect(result.type).toBe('confirm');
  });

  test('should return confidence of 0.8 for matched intents', () => {
    const result = parseIntent('oui');
    expect(result.confidence).toBe(0.8);
  });

  test('should return confidence of 0 for unknown intents', () => {
    const result = parseIntent('xyz123');
    expect(result.confidence).toBe(0);
  });

  test('should preserve original transcript in rawTranscript', () => {
    const originalTranscript = '  Oui, Je Confirme  ';
    const result = parseIntent(originalTranscript);
    expect(result.rawTranscript).toBe(originalTranscript);
  });
});

// =============================================================================
// PRIORITY/CONFLICT TESTS
// =============================================================================

describe('parseIntent - Priority and Conflict Resolution', () => {
  test('should prioritize confirm over cancel when both could match (oui wins)', () => {
    // "oui" should be confirm, even in a longer sentence
    const result = parseIntent('oui');
    expect(result.type).toBe('confirm');
  });

  test('should handle sentence with both oui and destination context', () => {
    // "oui aller à Dakar" - confirm should match first
    const result = parseIntent('oui aller à Dakar');
    expect(result.type).toBe('confirm');
  });

  test('should match first applicable pattern (confirm before book_ride)', () => {
    // The order in INTENT_PATTERNS matters - confirm is checked before book_ride
    const result = parseIntent("d'accord, réserve la course");
    expect(result.type).toBe('confirm');
  });

  test('should match cancel when arrête is in go_offline context', () => {
    // "arrête" appears in both cancel and go_offline patterns
    // cancel is checked first in the pattern list
    const result = parseIntent('arrête');
    expect(result.type).toBe('cancel');
  });
});

// =============================================================================
// SENTENCE CONTEXT TESTS
// =============================================================================

describe('parseIntent - Full Sentence Context', () => {
  test('should handle polite confirmation', () => {
    const result = parseIntent('oui s\'il vous plaît');
    expect(result.type).toBe('confirm');
  });

  test('should handle polite cancellation', () => {
    const result = parseIntent('non merci, pas maintenant');
    expect(result.type).toBe('cancel');
  });

  test('should handle destination with address', () => {
    const result = parseIntent('aller à Place de l\'Indépendance');
    expect(result.type).toBe('book_ride');
  });

  test('should handle driver accepting ride enthusiastically', () => {
    const result = parseIntent('oui je prends cette course');
    expect(result.type).toBe('confirm');
  });

  test('should handle driver declining politely', () => {
    const result = parseIntent('désolé, je refuse');
    expect(result.type).toBe('decline_ride');
  });

  test('should handle complex navigation request', () => {
    const result = parseIntent('montre-moi la route vers le centre-ville');
    expect(result.type).toBe('navigate');
  });
});
