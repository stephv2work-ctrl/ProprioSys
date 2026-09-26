import { useCallback, useEffect, useRef, useState } from 'react';

function describeError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access in your browser settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No usable camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is in use by another app. Close it and try again.';
    default:
      return err?.message || 'Could not start the camera.';
  }
}

export function useCamera(videoRef) {
  const [status, setStatus] = useState('idle'); // idle | starting | ready | error
  const [error, setError] = useState(null);
  const streamRef = useRef(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
  }, [videoRef]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        window.isSecureContext
          ? 'This browser does not support camera access.'
          : 'Camera access requires HTTPS. Open this app over a secure connection.',
      );
      setStatus('error');
      return false;
    }
    setStatus('starting');
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          // The model downsamples to 300×300 anyway; 640×480 keeps decode + upload cheap.
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      streamRef.current = stream;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setError('The camera stopped. Tap Start to reconnect.');
        setStatus('error');
      });
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setStatus('ready');
      return true;
    } catch (err) {
      setError(describeError(err));
      setStatus('error');
      return false;
    }
  }, [videoRef]);

  /** Disabling the track lets the browser turn the camera (and its light) off without losing permission. */
  const setEnabled = useCallback((on) => {
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = on));
  }, []);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { status, error, start, stop, setEnabled };
}
