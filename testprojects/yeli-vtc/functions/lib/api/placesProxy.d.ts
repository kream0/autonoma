import * as functions from "firebase-functions";
/**
 * GET /places/autocomplete
 * Proxy to Google Places Autocomplete API with West Africa bias
 *
 * Query params:
 * - input: The text input specifying which place to search for
 * - sessiontoken: (optional) Session token for billing
 */
export declare const placesAutocomplete: functions.HttpsFunction;
/**
 * GET /places/details
 * Proxy to Google Places Details API
 *
 * Query params:
 * - place_id: The place ID to get details for
 * - sessiontoken: (optional) Session token for billing
 * - fields: (optional) Comma-separated list of fields to return
 */
export declare const placesDetails: functions.HttpsFunction;
//# sourceMappingURL=placesProxy.d.ts.map