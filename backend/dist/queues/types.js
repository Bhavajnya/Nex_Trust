"use strict";
/**
 * BullMQ Job Types for async processing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUE_CONFIG = exports.QueueName = void 0;
var QueueName;
(function (QueueName) {
    QueueName["AI_VERIFICATION"] = "ai-verification";
    QueueName["FRAUD_ANALYSIS"] = "fraud-analysis";
    QueueName["DISPUTE_RESOLUTION"] = "dispute-resolution";
})(QueueName || (exports.QueueName = QueueName = {}));
exports.QUEUE_CONFIG = {
    [QueueName.AI_VERIFICATION]: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        timeout: 60000, // 60 seconds for GPT-4 Vision
        removeOnComplete: false, // Keep for audit trail
        removeOnFail: false, // Keep for debugging
    },
    [QueueName.FRAUD_ANALYSIS]: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 500 },
        timeout: 30000,
        removeOnComplete: true,
        removeOnFail: false,
    },
    [QueueName.DISPUTE_RESOLUTION]: {
        attempts: 1,
        backoff: { type: 'fixed', delay: 1000 },
        timeout: 120000, // Disputes need more time for review
        removeOnComplete: false,
        removeOnFail: false,
    },
};
