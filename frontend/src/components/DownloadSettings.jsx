import { useState } from 'react';
import { Download, FolderOpen, Settings } from 'lucide-react';

export default function DownloadSettings({ settings, onChange }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSettingChange = (key, value) => {
    onChange(prev => ({ ...prev, [key]: value }));
  };

  const selectDownloadFolder = async () => {
    try {
      // In a real app, you'd use the File System Access API
      // For now, we'll simulate folder selection
      const folderPath = prompt('Enter download folder path (optional):', settings.downloadPath);
      if (folderPath !== null) {
        handleSettingChange('downloadPath', folderPath);
      }
    } catch (error) {
      console.error('Folder selection failed:', error);
    }
  };

  return (
    <div className="bg-white/50 rounded-lg border border-white/20 backdrop-blur-sm">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/70 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="font-medium text-gray-800">Download Settings</h3>
            <p className="text-sm text-gray-600">
              {settings.customName ? `Custom name: ${settings.customName}` : 'Using default filename'}
              {settings.downloadPath ? ` | Custom path` : ''}
            </p>
          </div>
        </div>
        <div className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          <Download className="w-5 h-5 text-gray-400" />
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Custom Filename (without extension)
            </label>
            <input
              type="text"
              value={settings.customName}
              onChange={(e) => handleSettingChange('customName', e.target.value)}
              placeholder="e.g., my_talking_head_video"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to use auto-generated name
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Download Folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={settings.downloadPath}
                onChange={(e) => handleSettingChange('downloadPath', e.target.value)}
                placeholder="e.g., C:/Users/YourUser/Downloads/MyVideos"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={selectDownloadFolder}
                className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                Browse
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to use default downloads folder
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Videos are currently saved to the server's <code className="bg-blue-100 px-1 rounded">outputs</code> folder. 
              The download link will allow you to save them to your chosen location.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
