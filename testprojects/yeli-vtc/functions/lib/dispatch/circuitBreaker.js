"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCircuitBreaker = checkCircuitBreaker;
exports.incrementCounter = incrementCounter;
exports.recordError = recordError;
exports.resetCircuit = resetCircuit;
exports.getCircuitState = getCircuitState;
const admin = __importStar(require("firebase-admin"));
/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
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
function getCircuitRef(circuitName) {
    const db = admin.firestore();
    return db.collection(SYSTEM_SAFETY_COLLECTION).doc(`circuit_${circuitName}`);
}
/**
 * Creates a default circuit state
 */
function createDefaultState() {
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
function isWindowExpired(state, windowMs) {
    const now = Date.now();
    const windowStart = state.windowStartAt.toMillis();
    return now - windowStart > windowMs;
}
/**
 * Checks if the circuit reset timeout has passed
 */
function isResetTimeoutPassed(state, resetTimeoutMs) {
    if (!state.openedAt)
        return false;
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
async function checkCircuitBreaker(config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const circuitRef = getCircuitRef(fullConfig.circuitName);
    const doc = await circuitRef.get();
    let state;
    if (!doc.exists) {
        // No state exists yet, circuit is closed by default
        state = createDefaultState();
        return { allowed: true, state };
    }
    state = doc.data();
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
            const openedTime = state.openedAt.toMillis();
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
        const openedTime = state.openedAt.toMillis();
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
async function incrementCounter(config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const circuitRef = getCircuitRef(fullConfig.circuitName);
    const db = admin.firestore();
    return db.runTransaction(async (transaction) => {
        const doc = await transaction.get(circuitRef);
        const now = admin.firestore.Timestamp.now();
        let state;
        if (!doc.exists) {
            state = createDefaultState();
            state.dispatchCount = 1;
            transaction.set(circuitRef, state);
            return state;
        }
        state = doc.data();
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
async function recordError(config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const circuitRef = getCircuitRef(fullConfig.circuitName);
    const db = admin.firestore();
    return db.runTransaction(async (transaction) => {
        const doc = await transaction.get(circuitRef);
        const now = admin.firestore.Timestamp.now();
        let state;
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
        state = doc.data();
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
async function resetCircuit(config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
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
async function getCircuitState(config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const circuitRef = getCircuitRef(fullConfig.circuitName);
    const doc = await circuitRef.get();
    if (!doc.exists) {
        return createDefaultState();
    }
    return doc.data();
}
//# sourceMappingURL=circuitBreaker.js.map