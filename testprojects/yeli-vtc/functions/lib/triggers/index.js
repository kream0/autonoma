"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTripUpdated = exports.onDriverStatusChange = exports.onJobCreated = void 0;
// Firestore trigger functions
var onJobCreated_1 = require("./onJobCreated");
Object.defineProperty(exports, "onJobCreated", { enumerable: true, get: function () { return onJobCreated_1.onJobCreated; } });
var onDriverStatusChange_1 = require("./onDriverStatusChange");
Object.defineProperty(exports, "onDriverStatusChange", { enumerable: true, get: function () { return onDriverStatusChange_1.onDriverStatusChange; } });
var onTripUpdated_1 = require("./onTripUpdated");
Object.defineProperty(exports, "onTripUpdated", { enumerable: true, get: function () { return onTripUpdated_1.onTripUpdated; } });
//# sourceMappingURL=index.js.map