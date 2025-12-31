/**
 * Voice Feedback Messages for Yeli VTC
 * Predefined French TTS messages for customer and driver interactions
 */

// Customer Voice Messages
export const customerMessages = {
  /** Confirm destination address with user */
  destinationConfirm: (address: string): string =>
    `Destination: ${address}. Dites oui pour confirmer.`,

  /** Ride has been booked successfully */
  rideBooked: 'Course réservée. Un chauffeur arrive bientôt.',

  /** Driver is on the way with ETA */
  driverArriving: (driverName: string, etaMinutes: number): string =>
    `${driverName} arrive dans ${etaMinutes} minutes.`,

  /** Ride has started */
  rideStarted: 'La course a démarré.',

  /** Ride completed with final fare */
  rideCompleted: (fare: number): string =>
    `Course terminée. ${fare} francs CFA.`,

  /** Confirm ride cancellation */
  confirmCancel: 'Voulez-vous vraiment annuler? Dites oui pour confirmer.',

  /** Ride cancelled confirmation */
  rideCancelled: 'Course annulée.',

  /** Driver has arrived at pickup */
  driverArrived: 'Votre chauffeur est arrivé.',

  /** No drivers available */
  noDriversAvailable: 'Aucun chauffeur disponible pour le moment. Veuillez réessayer.',

  /** Connection lost */
  connectionLost: 'Connexion perdue. Reconnexion en cours.',

  /** Connection restored */
  connectionRestored: 'Connexion rétablie.',
} as const;

// Driver Voice Messages
export const driverMessages = {
  /** New ride offer announcement */
  newRide: (clientName: string, destination: string, fare: number): string =>
    `Nouvelle course! ${clientName} veut aller à ${destination}. ${fare} francs. Accepter ou refuser?`,

  /** Ride accepted confirmation */
  rideAccepted: 'Course acceptée. Dirigez-vous vers le client.',

  /** Arrived at pickup location */
  arrivedPickup: 'Vous êtes arrivé. Attendez le client.',

  /** Ride started */
  rideStartedDriver: 'Course démarrée. Bonne route!',

  /** Ride completed with fare */
  rideCompletedDriver: (fare: number): string =>
    `Course terminée! ${fare} francs.`,

  /** Confirm ride completion */
  confirmComplete: 'Voulez-vous terminer la course? Dites oui pour confirmer.',

  /** Confirm ride cancellation (driver side) */
  confirmCancel: 'Voulez-vous vraiment annuler? Dites oui pour confirmer.',

  /** Ride offer expired */
  rideOfferExpired: 'Offre expirée.',

  /** Ride declined */
  rideDeclined: 'Course refusée.',

  /** Now online and available */
  nowOnline: 'Vous êtes maintenant en ligne. En attente de courses.',

  /** Now offline */
  nowOffline: 'Vous êtes hors ligne.',

  /** Client is calling */
  clientCalling: 'Le client vous appelle.',
} as const;

// System Voice Messages
export const systemMessages = {
  /** Voice recognition started */
  listeningStarted: 'Je vous écoute.',

  /** Voice not understood */
  notUnderstood: 'Je n\'ai pas compris. Pouvez-vous répéter?',

  /** Please wait */
  pleaseWait: 'Veuillez patienter.',

  /** Error occurred */
  errorOccurred: 'Une erreur est survenue. Veuillez réessayer.',

  /** Welcome message */
  welcome: 'Bienvenue sur Yeli VTC.',

  /** Goodbye message */
  goodbye: 'Au revoir et à bientôt!',
} as const;

// All messages combined for easy access
export const voiceFeedbackMessages = {
  customer: customerMessages,
  driver: driverMessages,
  system: systemMessages,
} as const;

// Type exports for TypeScript consumers
export type CustomerMessage = keyof typeof customerMessages;
export type DriverMessage = keyof typeof driverMessages;
export type SystemMessage = keyof typeof systemMessages;

export default voiceFeedbackMessages;
