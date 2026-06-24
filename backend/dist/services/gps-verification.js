"use strict";
/**
 * GPS Verification Service
 * Validates location data and prevents fraudulent location spoofing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GPSVerificationService = void 0;
class GPSVerificationService {
    /**
     * Calculate distance between two GPS coordinates in meters using Haversine formula
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Earth's radius in meters
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) *
                Math.cos(this.toRad(lat2)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in meters
    }
    /**
     * Convert degrees to radians
     */
    static toRad(deg) {
        return deg * (Math.PI / 180);
    }
    /**
     * Validate GPS coordinates are within realistic bounds
     */
    static validateCoordinates(lat, lon) {
        return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
    }
    /**
     * Check if location is in a restricted/suspicious area
     * Returns false for suspicious areas (antarctica, middle of ocean, etc)
     */
    static isLocationRealistic(lat, lon) {
        // No locations in extreme southern latitudes (suspicious)
        if (lat < -60) {
            return false;
        }
        // Restrict to land masses roughly (simplified)
        // This is a basic check - in production use proper geofencing
        const suspiciousZones = [
            // Center of ocean (mid-Atlantic)
            { lat: 0, lon: -30, radius: 2000 },
            // Arctic
            { lat: 85, lon: 0, radius: 5000 },
        ];
        for (const zone of suspiciousZones) {
            const distance = this.calculateDistance(lat, lon, zone.lat, zone.lon);
            if (distance < zone.radius) {
                return false;
            }
        }
        return true;
    }
    /**
     * Validate GPS accuracy is reasonable
     */
    static isAccuracyReasonable(accuracy) {
        // Accuracy > 100 meters is suspicious for evidence
        // Most phones can achieve 5-20 meter accuracy
        if (!accuracy)
            return true; // If not provided, assume ok
        return accuracy <= 100;
    }
    /**
     * Check if location jump is possible between two evidence submissions
     * Returns true if the jump is too large (indicates spoofing)
     */
    static detectImpossibleLocationJump(loc1, loc2) {
        const distance = this.calculateDistance(loc1.latitude, loc1.longitude, loc2.latitude, loc2.longitude);
        // Calculate time difference in seconds
        const timeDiff = Math.abs(loc2.timestamp - loc1.timestamp) / 1000;
        // Maximum realistic speed: 200 km/h (55.5 m/s)
        const maxSpeed = 55.5; // meters per second
        const maxPossibleDistance = maxSpeed * timeDiff;
        // If distance is impossible given the time difference, flag as suspicious
        return distance > maxPossibleDistance * 1.5; // 50% buffer for route variations
    }
    /**
     * Comprehensive GPS validation
     */
    static validateLocationData(location, previousLocations) {
        const issues = [];
        let score = 100;
        // Check basic coordinate validity
        if (!this.validateCoordinates(location.latitude, location.longitude)) {
            issues.push('Invalid coordinates outside valid range');
            score -= 30;
        }
        // Check if location is realistic
        if (!this.isLocationRealistic(location.latitude, location.longitude)) {
            issues.push('Location in suspicious/restricted area');
            score -= 40;
        }
        // Check accuracy
        if (!this.isAccuracyReasonable(location.accuracy)) {
            issues.push(`Low accuracy (${location.accuracy}m) - possible GPS spoofing`);
            score -= 20;
        }
        // Check for impossible jumps from previous locations
        if (previousLocations && previousLocations.length > 0) {
            const lastLocation = previousLocations[previousLocations.length - 1];
            if (this.detectImpossibleLocationJump(lastLocation, location)) {
                issues.push('Impossible location jump detected');
                score -= 50;
            }
        }
        // Check timestamp is recent
        const now = Date.now();
        const age = now - location.timestamp;
        if (age < 0) {
            issues.push('Timestamp in future');
            score -= 30;
        }
        if (age > 24 * 60 * 60 * 1000) {
            // More than 24 hours old
            issues.push('Location data is stale (> 24 hours)');
            score -= 15;
        }
        score = Math.max(0, Math.min(100, score));
        return {
            isValid: score >= 50, // Threshold of 50% confidence
            score,
            issues,
            confidence: score / 100,
        };
    }
    /**
     * Generate fraud risk score for location data
     * Used in combination with other fraud detection signals
     */
    static generateLocationFraudScore(location, previousLocations) {
        const validation = this.validateLocationData(location, previousLocations);
        const riskScore = 100 - validation.score; // Invert: higher score = higher risk
        let riskLevel = 'LOW';
        if (riskScore > 70)
            riskLevel = 'HIGH';
        else if (riskScore > 40)
            riskLevel = 'MEDIUM';
        return { score: riskScore, riskLevel };
    }
}
exports.GPSVerificationService = GPSVerificationService;
