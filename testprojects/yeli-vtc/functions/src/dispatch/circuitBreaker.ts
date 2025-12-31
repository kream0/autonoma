import * as admin from "firebase-admin";

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerConfig {
  /** Maximum number of errors before circuit opens (default: 5) */
  maxErrors: number;
  /** Time window in milliseconds for error counting (default: 60000 = 1 minute) */
  windowMs: number;
  /** Time in milliseconds before circuit resets after opening (default: 30000 = 30 seconds) */
  resetTimeoutMs: number;
  /** Optional: specific circuit name for granular control */
  circuitName: string;
}

/**
 * Circuit breaker state stored in Firestore
 */
export interface CircuitState {
  /** Current error count within the window */
  errorCount: number;
  /** Total dispatch attempts in the current window */
  dispatchCount: number;
  /** Timestamp of the last error */
  lastErrorAt: FirebaseFirestore.Timestamp | null;
  /** Timestamp when the circuit was opened */
  openedAt: FirebaseFirestore.Timestamp | null;
  /** Whether the circuit is currently open (blocking requests) */
  isOpen: boolean;
  /** Timestamp of the window start */
  windowStartAt: FirebaseFirestore.Timestamp;
  /** Last update timestamp */
  updatedAt: FirebaseFirestore.Timestamp;
}

/**
 * Result of circuit breaker check
 */
export interface CircuitCheckResult {
  /** Whether requests are allowed (circuit closed or half-open) */
  allowed: boolean;
  /** Current circuit state */
  state: CircuitState;
  /** Reason if not allowed */
  reason?: string;
  /** Time remaining until circuit resets (ms) */
  resetInMs?: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxErrors: 5,
  windowMs: 60000, // 1 minute
  resetTimeoutMs: 30000, // 30 seconds
  circuitName: "dispatch",
};

/**
 * Firestore collection name for system safety data
 */
const SYSTEM_SAFETY_COLLECTION = "system_safety";

/**
 * Gets the Firestore document reference for a circuit
 */
function getCircuitRef(
  circuitName: string
): FirebaseFirestore.DocumentReference {
  const db = admin.firestore();
  return db.collection(SYSTEM_SAFETY_COLLECTION).doc(`circuit_${circuitName}`);
}

/**
 * Creates a default circuit state
 */
function createDefaultState(): CircuitState {
  const now = admin.firestore.Timestamp.now();
  return {
    errorCount: 0,
    dispatchCount: 0,
    lastErrorAt: null,
    openedAt: null,
    isOpen: false,
    windowStartAt: now,
    updatedAt: now,
  };
}

/**
 * Checks if the time window has expired and state needs reset
 */
function isWindowExpired(state: CircuitState, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = state.windowStartAt.toMillis();
  return now - windowStart > windowMs;
}

/**
 * Checks if the circuit reset timeout has passed
 */
function isResetTimeoutPassed(
  state: CircuitState,
  resetTimeoutMs: number
): boolean {
  if (!state.openedAt) return false;
  const now = Date.now();
  const openedTime = state.openedAt.toMillis();
  return now - openedTime > resetTimeoutMs;
}

/**
 * Checks the circuit breaker state and determines if requests should be allowed.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns CircuitCheckResult indicating if requests are allowed
 */
export async function checkCircuitBreaker(
  config: Partial<CircuitBreakerConfig> = {}
): Promise<CircuitCheckResult> {
  const fullConfig: CircuitBreakerConfig = { ...DEFAULT_CONFIG, ...config };
  const circuitRef = getCircuitRef(fullConfig.circuitName);

  const doc = await circuitRef.get();
  let state: CircuitState;

  if (!doc.exists) {
    // No state exists yet, circuit is closed by default
    state = createDefaultState();
    return { allowed: true, state };
  }

  state = doc.data() as CircuitState;

  // Check if the time window has expired - reset counters
  if (isWindowExpired(state, fullConfig.windowMs)) {
    // Window expired, check if circuit was open
    if (state.isOpen) {
      // Check if reset timeout has also passed
      if (isResetTimeoutPassed(state, fullConfig.resetTimeoutMs)) {
        // Allow a "half-open" state - let one request through
        return {
          allowed: true,
          state,
          reason: "Circuit half-open, testing recovery",
        };
      }
      // Circuit still open, calculate remaining time
      const openedTime = state.openedAt!.toMillis();
      const resetInMs = fullConfig.resetTimeoutMs - (Date.now() - openedTime);
      return {
        allowed: false,
        state,
        reason: "Circuit open - too many errors",
        resetInMs: Math.max(0, resetInMs),
      };
    }
    // Window expired and circuit was closed - allow requests
    return { allowed: true, state };
  }

  // Window not expired, check current state
  if (state.isOpen) {
    // Circuit is open, check if reset timeout has passed
    if (isResetTimeoutPassed(state, fullConfig.resetTimeoutMs)) {
      return {
        allowed: true,
        state,
        reason: "Circuit half-open, testing recovery",
      };
    }
    const openedTime = state.openedAt!.toMillis();
    const resetInMs = fullConfig.resetTimeoutMs - (Date.now() - openedTime);
    return {
      allowed: false,
      state,
      reason: "Circuit open - too many errors",
      resetInMs: Math.max(0, resetInMs),
    };
  }

  // Circuit is closed and window is active
  return { allowed: true, state };
}

/**
 * Increments the dispatch counter for the circuit.
 * Call this when a dispatch attempt is made.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns Updated circuit state
 */
export async function incrementCounter(
  config: Partial<CircuitBreakerConfig> = {}
): Promise<CircuitState> {
  const fullConfig: CircuitBreakerConfig = { ...DEFAULT_CONFIG, ...config };
  const circuitRef = getCircuitRef(fullConfig.circuitName);
  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(circuitRef);
    const now = admin.firestore.Timestamp.now();

    let state: CircuitState;

    if (!doc.exists) {
      state = createDefaultState();
      state.dispatchCount = 1;
      transaction.set(circuitRef, state);
      return state;
    }

    state = doc.data() as CircuitState;

    // Reset counters if window has expired
    if (isWindowExpired(state, fullConfig.windowMs)) {
      state = {
        ...createDefaultState(),
        dispatchCount: 1,
      };
      transaction.set(circuitRef, state);
      return state;
    }

    // Increment counter
    state.dispatchCount += 1;
    state.updatedAt = now;
    transaction.update(circuitRef, {
      dispatchCount: state.dispatchCount,
      updatedAt: now,
    });

    return state;
  });
}

/**
 * Records an error and potentially opens the circuit.
 * Call this when a dispatch operation fails.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns Updated circuit state
 */
export async function recordError(
  config: Partial<CircuitBreakerConfig> = {}
): Promise<CircuitState> {
  const fullConfig: CircuitBreakerConfig = { ...DEFAULT_CONFIG, ...config };
  const circuitRef = getCircuitRef(fullConfig.circuitName);
  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    const doc = await transaction.get(circuitRef);
    const now = admin.firestore.Timestamp.now();

    let state: CircuitState;

    if (!doc.exists) {
      state = createDefaultState();
      state.errorCount = 1;
      state.lastErrorAt = now;

      // Check if this single error exceeds threshold
      if (state.errorCount >= fullConfig.maxErrors) {
        state.isOpen = true;
        state.openedAt = now;
      }

      transaction.set(circuitRef, state);
      return state;
    }

    state = doc.data() as CircuitState;

    // Reset if window has expired
    if (isWindowExpired(state, fullConfig.windowMs)) {
      state = {
        ...createDefaultState(),
        errorCount: 1,
        lastErrorAt: now,
      };

      if (state.errorCount >= fullConfig.maxErrors) {
        state.isOpen = true;
        state.openedAt = now;
      }

      transaction.set(circuitRef, state);
      return state;
    }

    // Increment error count
    state.errorCount += 1;
    state.lastErrorAt = now;
    state.updatedAt = now;

    // Check if we should open the circuit
    if (state.errorCount >= fullConfig.maxErrors && !state.isOpen) {
      state.isOpen = true;
      state.openedAt = now;
    }

    transaction.update(circuitRef, {
      errorCount: state.errorCount,
      lastErrorAt: now,
      updatedAt: now,
      isOpen: state.isOpen,
      openedAt: state.openedAt,
    });

    return state;
  });
}

/**
 * Resets the circuit to its initial closed state.
 * Call this after successful recovery or for manual intervention.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns New reset circuit state
 */
export async function resetCircuit(
  config: Partial<CircuitBreakerConfig> = {}
): Promise<CircuitState> {
  const fullConfig: CircuitBreakerConfig = { ...DEFAULT_CONFIG, ...config };
  const circuitRef = getCircuitRef(fullConfig.circuitName);

  const state = createDefaultState();
  await circuitRef.set(state);

  return state;
}

/**
 * Gets the current circuit state without modifying it.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns Current circuit state or default if none exists
 */
export async function getCircuitState(
  config: Partial<CircuitBreakerConfig> = {}
): Promise<CircuitState> {
  const fullConfig: CircuitBreakerConfig = { ...DEFAULT_CONFIG, ...config };
  const circuitRef = getCircuitRef(fullConfig.circuitName);

  const doc = await circuitRef.get();

  if (!doc.exists) {
    return createDefaultState();
  }

  return doc.data() as CircuitState;
}
