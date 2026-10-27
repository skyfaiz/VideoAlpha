import { useState } from 'react';
import { Upload, Image, Video } from 'lucide-react';

export default function WanAnimateForm({ onSubmit, isLoading }) {
  const [image, setImage] = useState(null);
  const [video, setVideo] = useState(null);
  const [prompt, setPrompt] = useState('A person walking in a natural way');
  const [negativePrompt, setNegativePrompt] = useState('blurry, low quality, distorted');
  const [seed, setSeed] = useState(12345);
  const [width, setWidth] = useState(832);
  const [height, setHeight] = useState(480);
  const [fps, setFps] = useState(16);
  const [cfg, setCfg] = useState(1.0);
  const [steps, setSteps] = useState(6);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!image) {
      alert('Please select an image file');
      return;
    }

    const formData = new FormData();
    formData.append('image', image);
    if (video) {
      formData.append('video', video);
    }
    formData.append('prompt', prompt);
    formData.append('negative_prompt', negativePrompt);
    formData.append('seed', seed);
    formData.append('width', width);
    formData.append('height', height);
    formData.append('fps', fps);
    formData.append('cfg', cfg);
    formData.append('steps', steps);

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Image className="inline w-4 h-4 mr-1" /> Image File *
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-purple-500 transition-colors">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files[0])}
              className="hidden"
              id="wananimate-image"
              disabled={isLoading}
            />
            <label htmlFor="wananimate-image" className="cursor-pointer">
              <Upload className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                {image ? image.name : 'Click to upload image'}
              </p>
            </label>
          </div>
        </div>

        {/* Video Upload (Optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Video className="inline w-4 h-4 mr-1" /> Reference Video (Optional)
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-purple-500 transition-colors">
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setVideo(e.target.files[0])}
              className="hidden"
              id="wananimate-video"
              disabled={isLoading}
            />
            <label htmlFor="wananimate-video" className="cursor-pointer">
              <Upload className="mx-auto h-8 w-8 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                {video ? video.name : 'Click to upload video'}
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          placeholder="Describe the animation..."
          disabled={isLoading}
        />
      </div>

      {/* Negative Prompt */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Negative Prompt
        </label>
        <input
          type="text"
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          placeholder="What to avoid..."
          disabled={isLoading}
        />
      </div>

      {/* Parameters Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Seed
          </label>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            disabled={isLoading}
          />
        </div>
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            FPS
          </label>
          <input
            type="number"
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value))}
            min={8}
            max={60}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            CFG
          </label>
          <input
            type="number"
            value={cfg}
            onChange={(e) => setCfg(parseFloat(e.target.value))}
            min={0.1}
            max={10}
            step={0.1}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Steps
          </label>
          <input
            type="number"
            value={steps}
            onChange={(e) => setSteps(parseInt(e.target.value))}
            min={1}
            max={50}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || !image}
        className="w-full bg-purple-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Processing...
          </>
        ) : (
          'Generate Animation'
        )}
      </button>
    </form>
  );
}
