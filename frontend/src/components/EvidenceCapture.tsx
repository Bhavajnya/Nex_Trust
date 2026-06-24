import React, { useState, useEffect } from 'react';
import { useCamera, useGeolocation } from '../hooks/useCamera';
import { useUploadEvidence } from '../hooks/useApi';

interface EvidenceCaptureProps {
  jobId: string;
  onUploadSuccess?: () => void;
  onCancel?: () => void;
}

type CaptureMode = 'initial' | 'camera' | 'preview' | 'uploading' | 'success';

/**
 * Complete evidence capture flow with camera and GPS
 */
export function EvidenceCapture({ jobId, onUploadSuccess, onCancel }: EvidenceCaptureProps) {
  const [mode, setMode] = useState<CaptureMode>('initial');
  const [photoCount, setPhotoCount] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  const camera = useCamera();
  const location = useGeolocation();
  const { uploadEvidence, isLoading: isUploading, error: uploadError } = useUploadEvidence();

  /**
   * Initialize camera on mount
   */
  useEffect(() => {
    return () => {
      camera.stopCamera();
    };
  }, []);

  /**
   * Start camera capture
   */
  const handleStartCamera = async () => {
    const success = await camera.startCamera(facingMode);
    if (success) {
      setMode('camera');
    }
  };

  /**
   * Capture photo and request location
   */
  const handleCapture = async () => {
    const photo = camera.capturePhoto();
    if (!photo) {
      return;
    }

    // Request location if not already available
    if (!location.hasLocation) {
      try {
        await location.requestLocation();
      } catch (err) {
        console.error('Failed to get location:', err);
        // Continue even if location fails
      }
    }

    setPhotoCount((prev) => prev + 1);
    setMode('preview');
  };

  /**
   * Retake photo
   */
  const handleRetake = () => {
    camera.clearCapture();
    setMode('camera');
  };

  /**
   * Upload evidence
   */
  const handleUpload = async () => {
    if (!camera.capturedImage) {
      return;
    }

    try {
      setMode('uploading');
      const file = camera.getCapturedImageAsFile(`evidence-${Date.now()}.jpg`);

      if (!file) {
        throw new Error('Failed to create image file');
      }

      await uploadEvidence(jobId, file, location.latitude || undefined, location.longitude || undefined);

      setMode('success');
      setPhotoCount((prev) => prev + 1);

      // Callback after brief delay
      setTimeout(() => {
        onUploadSuccess?.();
      }, 2000);
    } catch (err) {
      console.error('Upload failed:', err);
      setMode('preview');
    }
  };

  /**
   * Toggle camera facing mode
   */
  const handleToggleFacing = async () => {
    camera.stopCamera();
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    await camera.startCamera(newMode);
  };

  return (
    <div className="w-full max-w-md mx-auto p-4">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Capture Evidence</h2>
        <p className="text-sm text-gray-600 mt-1">Take photos of completed work with GPS location</p>
        <p className="text-xs text-gray-500 mt-2">Photos captured: {photoCount}</p>
      </div>

      {/* Initial Screen */}
      {mode === 'initial' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              This app will capture photos of your work with GPS location and timestamp data. Make sure your device location is enabled.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleStartCamera}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              disabled={!camera.isAvailable}
            >
              Start Camera
            </button>

            <button
              onClick={() => location.requestLocation()}
              className={`w-full px-4 py-3 border rounded-lg font-medium ${
                location.hasLocation ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {location.isLoading ? 'Getting Location...' : location.hasLocation ? `Location: ${location.latitude?.toFixed(4)}, ${location.longitude?.toFixed(4)}` : 'Get Location'}
            </button>

            {onCancel && (
              <button onClick={onCancel} className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50">
                Cancel
              </button>
            )}
          </div>

          {camera.error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">{camera.error}</div>}

          {location.error && <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm p-3 rounded-lg">{location.error}</div>}

          {!camera.isAvailable && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">
              Camera is not available on this device. Please use a different device or browser.
            </div>
          )}
        </div>
      )}

      {/* Camera View */}
      {mode === 'camera' && (
        <div className="space-y-4">
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video
              ref={camera.videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />

            {/* Camera controls overlay */}
            <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none">
              {/* Top controls */}
              <div className="flex justify-between items-start pointer-events-auto">
                <button
                  onClick={handleToggleFacing}
                  className="bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition"
                  title="Switch camera"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16l4-4m0 0l4 4m-4-4v8m0-12a9 9 0 110 18 9 9 0 010-18z" />
                  </svg>
                </button>

                <div className="bg-black/50 text-white text-xs px-3 py-1 rounded-full">
                  {facingMode === 'environment' ? 'Back Camera' : 'Front Camera'}
                </div>
              </div>

              {/* Bottom controls */}
              <div className="flex justify-center gap-4 pointer-events-auto">
                <button
                  onClick={() => {
                    camera.stopCamera();
                    setMode('initial');
                  }}
                  className="bg-red-500 hover:bg-red-600 text-white rounded-full p-4 transition"
                  title="Cancel"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <button onClick={handleCapture} className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 transition ring-4 ring-blue-300">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                </button>

                <button
                  onClick={() => {
                    camera.stopCamera();
                  }}
                  className="bg-gray-600 hover:bg-gray-700 text-white rounded-full p-4 transition opacity-0 pointer-events-none"
                >
                  {' '}
                </button>
              </div>
            </div>
          </div>

          {/* Hidden canvas for photo capture */}
          <canvas ref={camera.canvasRef} className="hidden" />

          {/* Location status */}
          <div className={`text-sm p-3 rounded-lg ${location.hasLocation ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-yellow-50 text-yellow-700 border border-yellow-200'}`}>
            {location.hasLocation
              ? `Location: ${location.latitude?.toFixed(4)}°, ${location.longitude?.toFixed(4)}° (±${location.accuracy?.toFixed(0)}m)`
              : 'Location: Not captured yet'}
          </div>
        </div>
      )}

      {/* Preview Mode */}
      {mode === 'preview' && camera.capturedImage && (
        <div className="space-y-4">
          <div className="bg-gray-100 rounded-lg overflow-hidden aspect-video">
            <img src={camera.capturedImage} alt="Captured evidence" className="w-full h-full object-cover" />
          </div>

          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>Photo:</span>
              <span>{photoCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Location:</span>
              <span>{location.hasLocation ? `${location.latitude?.toFixed(4)}°, ${location.longitude?.toFixed(4)}°` : 'Not captured'}</span>
            </div>
            <div className="flex justify-between">
              <span>Time:</span>
              <span>{new Date().toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {isUploading ? 'Uploading...' : 'Upload Evidence'}
            </button>

            <button
              onClick={handleRetake}
              disabled={isUploading}
              className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Retake Photo
            </button>
          </div>

          {uploadError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-lg">{uploadError.message}</div>}
        </div>
      )}

      {/* Uploading Mode */}
      {mode === 'uploading' && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin mb-4">
            <svg className="w-12 h-12 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <p className="text-gray-600 font-medium">Uploading evidence...</p>
          <p className="text-sm text-gray-500 mt-2">Photo {photoCount}</p>
        </div>
      )}

      {/* Success Mode */}
      {mode === 'success' && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-4xl mb-4">✓</div>
          <p className="text-lg font-medium text-green-600 mb-2">Evidence Uploaded</p>
          <p className="text-sm text-gray-600">Photo {photoCount} has been successfully uploaded</p>
          <div className="mt-6 w-full">
            <button
              onClick={onUploadSuccess}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EvidenceCapture;
