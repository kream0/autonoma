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
 * Checks the circuit breaker state and determines if requests should be allowed.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns CircuitCheckResult indicating if requests are allowed
 */
export declare function checkCircuitBreaker(config?: Partial<CircuitBreakerConfig>): Promise<CircuitCheckResult>;
/**
 * Increments the dispatch counter for the circuit.
 * Call this when a dispatch attempt is made.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns Updated circuit state
 */
export declare function incrementCounter(config?: Partial<CircuitBreakerConfig>): Promise<CircuitState>;
/**
 * Records an error and potentially opens the circuit.
 * Call this when a dispatch operation fails.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns Updated circuit state
 */
export declare function recordError(config?: Partial<CircuitBreakerConfig>): Promise<CircuitState>;
/**
 * Resets the circuit to its initial closed state.
 * Call this after successful recovery or for manual intervention.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns New reset circuit state
 */
export declare function resetCircuit(config?: Partial<CircuitBreakerConfig>): Promise<CircuitState>;
/**
 * Gets the current circuit state without modifying it.
 *
 * @param config - Partial configuration (uses defaults for missing values)
 * @returns Current circuit state or default if none exists
 */
export declare function getCircuitState(config?: Partial<CircuitBreakerConfig>): Promise<CircuitState>;
//# sourceMappingURL=circuitBreaker.d.ts.map