import { useState, useRef, useCallback } from 'react';

/**
 * Hook for accessing device camera
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isAvailable, setIsAvailable] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  /**
   * Check camera permission and start stream
   */
  const startCamera = useCallback(async (facingMode: 'user' | 'environment' = 'environment') => {
    try {
      setError(null);

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setIsAvailable(false);
        setError('Camera is not supported on this device');
        return false;
      }

      // Request camera permission
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
        };
      }

      setIsActive(true);
      return true;
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Camera permission denied. Please enable camera access in settings.');
        } else if (err.name === 'NotFoundError') {
          setError('No camera device found');
          setIsAvailable(false);
        } else {
          setError(`Camera error: ${err.message}`);
        }
      } else {
        setError('Failed to start camera');
      }
      return false;
    }
  }, []);

  /**
   * Stop camera stream
   */
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  /**
   * Capture photo from video stream
   */
  const capturePhoto = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) {
      setError('Camera or canvas not ready');
      return null;
    }

    try {
      const context = canvasRef.current.getContext('2d');
      if (!context) {
        setError('Canvas context not available');
        return null;
      }

      // Set canvas dimensions to match video
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;

      // Draw video frame to canvas
      context.drawImage(videoRef.current, 0, 0);

      // Convert to data URL
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.9);
      setCapturedImage(imageData);
      return imageData;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to capture photo';
      setError(errorMsg);
      return null;
    }
  }, []);

  /**
   * Take a batch of photos
   */
  const takeMultiplePhotos = useCallback(
    async (count: number = 3, delayMs: number = 500): Promise<string[]> => {
      const photos: string[] = [];

      for (let i = 0; i < count; i++) {
        const photo = capturePhoto();
        if (photo) {
          photos.push(photo);
        }

        // Wait before next photo
        if (i < count - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      return photos;
    },
    [capturePhoto]
  );

  /**
   * Clear captured image
   */
  const clearCapture = useCallback(() => {
    setCapturedImage(null);
  }, []);

  /**
   * Convert captured image to File
   */
  const getCapturedImageAsFile = useCallback(
    (filename: string = 'evidence.jpg'): File | null => {
      if (!capturedImage) return null;

      try {
        // Convert data URL to blob
        const arr = capturedImage.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        const bstr = atob(arr[1]);
        const n = bstr.length;
        const u8arr = new Uint8Array(n);

        for (let i = 0; i < n; i++) {
          u8arr[i] = bstr.charCodeAt(i);
        }

        const blob = new Blob([u8arr], { type: mime });
        return new File([blob], filename, { type: mime });
      } catch (err) {
        setError('Failed to convert image to file');
        return null;
      }
    },
    [capturedImage]
  );

  return {
    videoRef,
    canvasRef,
    isAvailable,
    isActive,
    error,
    capturedImage,
    startCamera,
    stopCamera,
    capturePhoto,
    takeMultiplePhotos,
    clearCapture,
    getCapturedImageAsFile,
  };
}

/**
 * Hook for geolocation
 */
export function useGeolocation() {
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const requestLocation = useCallback(async (): Promise<{ latitude: number; longitude: number } | null> => {
    try {
      setIsLoading(true);
      setError(null);

      if (!navigator.geolocation) {
        setError('Geolocation is not supported on this device');
        setIsLoading(false);
        return null;
      }

      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            setLatitude(latitude);
            setLongitude(longitude);
            setAccuracy(accuracy);
            setIsLoading(false);
            resolve({ latitude, longitude });
          },
          (err) => {
            let errorMsg = 'Failed to get location';
            if (err.code === 1) {
              errorMsg = 'Location permission denied. Please enable location access in settings.';
            } else if (err.code === 2) {
              errorMsg = 'Location service unavailable';
            } else if (err.code === 3) {
              errorMsg = 'Location request timed out';
            }
            setError(errorMsg);
            setIsLoading(false);
            reject(errorMsg);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        );
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get location';
      setError(errorMsg);
      setIsLoading(false);
      return null;
    }
  }, []);

  const clearLocation = useCallback(() => {
    setLatitude(null);
    setLongitude(null);
    setAccuracy(null);
  }, []);

  return {
    latitude,
    longitude,
    accuracy,
    error,
    isLoading,
    requestLocation,
    clearLocation,
    hasLocation: latitude !== null && longitude !== null,
  };
}
