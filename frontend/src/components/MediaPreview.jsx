import { useState, useEffect } from 'react';
import { X, Image as ImageIcon, Video as VideoIcon, Play, Pause } from 'lucide-react';

export default function MediaPreview({ file, type, onRemove, label }) {
  const [preview, setPreview] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }

    // Create preview URL from file
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    // Cleanup
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const handleVideoToggle = (e) => {
    const video = e.target;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  if (!file || !preview) return null;

  return (
    <div className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50">
      {/* Label */}
      {label && (
        <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-medium z-10 flex items-center gap-1">
          {type === 'video' ? <VideoIcon className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
          {label}
        </div>
      )}

      {/* Remove button */}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full hover:bg-red-600 transition-colors z-10"
          title="Remove"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Preview content */}
      <div className="relative w-full" style={{ maxHeight: '300px' }}>
        {type === 'image' ? (
          <img
            src={preview}
            alt="Preview"
            className="w-full h-full object-contain"
            style={{ maxHeight: '300px' }}
          />
        ) : (
          <div className="relative">
            <video
              src={preview}
              className="w-full h-full object-contain"
              style={{ maxHeight: '300px' }}
              controls
              onClick={handleVideoToggle}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/50 rounded-full p-4">
                  <Play className="w-8 h-8 text-white" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* File info */}
      <div className="p-2 bg-gray-100 border-t border-gray-300">
        <p className="text-xs text-gray-600 truncate" title={file.name}>
          {file.name}
        </p>
        <p className="text-xs text-gray-500">
          {(file.size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>
    </div>
  );
}
