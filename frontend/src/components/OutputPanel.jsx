import { useState } from 'react';
import { Download, RefreshCw, Play, Eye } from 'lucide-react';

export default function OutputPanel({ status, downloadUrl, jobId, customName, onReset }) {
  const [showPreview, setShowPreview] = useState(false);
  
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = downloadUrl;
    // Use custom name if provided, otherwise fallback to job ID
    const filename = customName ? `${customName}.mp4` : `output_${jobId}.mp4`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (status !== 'COMPLETED' && status !== 'FAILED') return null;

  return (
    <div className="mt-6 space-y-4">
      {/* Action Buttons */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between gap-4">
          {status === 'COMPLETED' ? (
            <>
              <div>
                <h3 className="font-medium text-green-700">Video Ready!</h3>
                <p className="text-sm text-gray-600">Your video has been generated successfully.</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  {showPreview ? 'Hide' : 'Preview'}
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
                <button
                  onClick={onReset}
                  className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  New Job
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <h3 className="font-medium text-red-700">Job Failed</h3>
                <p className="text-sm text-gray-600">There was an error processing your request.</p>
              </div>
              <button
                onClick={onReset}
                className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </>
          )}
        </div>
      </div>

      {/* Video Preview */}
      {status === 'COMPLETED' && showPreview && (
        <div className="bg-black rounded-lg overflow-hidden border-2 border-green-500">
          <div className="bg-gradient-to-r from-green-600 to-green-700 px-4 py-2 flex items-center gap-2">
            <Play className="w-4 h-4 text-white" />
            <span className="text-white font-medium">Video Preview</span>
          </div>
          <div className="relative" style={{ maxHeight: '600px' }}>
            <video
              src={downloadUrl}
              controls
              autoPlay
              loop
              className="w-full h-full object-contain"
              style={{ maxHeight: '600px' }}
            >
              Your browser does not support the video tag.
            </video>
          </div>
          <div className="bg-gray-900 px-4 py-2">
            <p className="text-sm text-gray-400">
              Filename: <span className="text-white">{customName || `output_${jobId}`}.mp4</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
