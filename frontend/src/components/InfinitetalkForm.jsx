import { useState } from 'react';
import { Upload, Image, Music } from 'lucide-react';

export default function InfinitetalkForm({ onSubmit, isLoading }) {
  const [image, setImage] = useState(null);
  const [audio, setAudio] = useState(null);
  const [prompt, setPrompt] = useState('A person talking naturally');
  const [width, setWidth] = useState(544);
  const [height, setHeight] = useState(960);
  const [personCount, setPersonCount] = useState('single');
  const [inputType, setInputType] = useState('image');
  const [useNetworkVolume, setUseNetworkVolume] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!image || !audio) {
      alert('Please select both image and audio files');
      return;
    }

    const formData = new FormData();
    formData.append('image', image);
    formData.append('audio', audio);
    formData.append('prompt', prompt);
    formData.append('width', width);
    formData.append('height', height);
    formData.append('person_count', personCount);
    formData.append('input_type', inputType);
    formData.append('use_network_volume', useNetworkVolume);

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Image className="inline w-4 h-4 mr-1" /> Image File
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-indigo-500 transition-colors">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files[0])}
              className="hidden"
              id="infinitetalk-image"
              disabled={isLoading}
            />
            <label htmlFor="infinitetalk-image" className="cursor-pointer">
              <Upload className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                {image ? image.name : 'Click to upload image'}
              </p>
            </label>
          </div>
        </div>

        {/* Audio Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Music className="inline w-4 h-4 mr-1" /> Audio File
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-indigo-500 transition-colors">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudio(e.target.files[0])}
              className="hidden"
              id="infinitetalk-audio"
              disabled={isLoading}
            />
            <label htmlFor="infinitetalk-audio" className="cursor-pointer">
              <Upload className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                {audio ? audio.name : 'Click to upload audio'}
              </p>
            </label>
          </div>
        </div>
      </div>

      {/* Prompt */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder="Describe the talking animation..."
          disabled={isLoading}
        />
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Width
          </label>
          <input
            type="number"
            value={width}
            onChange={(e) => setWidth(parseInt(e.target.value))}
            min={256}
            max={1920}
            step={32}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Height
          </label>
          <input
            type="number"
            value={height}
            onChange={(e) => setHeight(parseInt(e.target.value))}
            min={256}
            max={1920}
            step={32}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Person Count
          </label>
          <select
            value={personCount}
            onChange={(e) => setPersonCount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            disabled={isLoading}
          >
            <option value="single">Single</option>
            <option value="multiple">Multiple</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Input Type
          </label>
          <select
            value={inputType}
            onChange={(e) => setInputType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            disabled={isLoading}
          >
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
        </div>
      </div>

      {/* Network Volume */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id="network-volume"
          checked={useNetworkVolume}
          onChange={(e) => setUseNetworkVolume(e.target.checked)}
          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
          disabled={isLoading}
        />
        <label htmlFor="network-volume" className="ml-2 text-sm text-gray-700">
          Use Network Volume (saves to S3)
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !image || !audio}
        className="w-full bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Processing...
          </>
        ) : (
          'Generate Video'
        )}
      </button>
    </form>
  );
}
