import { useState, useEffect } from 'react';
import { Video, Clapperboard, Download, FolderOpen, Clock } from 'lucide-react';
import InfinitetalkForm from './components/InfinitetalkForm';
import WanAnimateForm from './components/WanAnimateForm';
import JobStatus from './components/JobStatus';
import OutputPanel from './components/OutputPanel';
import DownloadSettings from './components/DownloadSettings';
import {
  submitInfinitetalk,
  getInfinitetalkStatus,
  getInfinitetalkDownloadUrl,
  submitWanAnimate,
  getWanAnimateStatus,
  getWanAnimateDownloadUrl,
} from './api/client';

function App() {
  const [activeTab, setActiveTab] = useState('infinitetalk');
  const [jobs, setJobs] = useState({});
  const [currentJobId, setCurrentJobId] = useState(null);
  const [downloadSettings, setDownloadSettings] = useState({
    customName: '',
    downloadPath: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  // Load saved jobs from localStorage on mount
  useEffect(() => {
    const savedJobs = localStorage.getItem('videoJobs');
    if (savedJobs) {
      setJobs(JSON.parse(savedJobs));
    }
    
    const savedSettings = localStorage.getItem('downloadSettings');
    if (savedSettings) {
      setDownloadSettings(JSON.parse(savedSettings));
    }
  }, []);

  // Save jobs to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('videoJobs', JSON.stringify(jobs));
  }, [jobs]);

  // Save download settings
  useEffect(() => {
    localStorage.setItem('downloadSettings', JSON.stringify(downloadSettings));
  }, [downloadSettings]);

  const getCurrentJob = () => {
    return currentJobId ? jobs[currentJobId] : null;
  };

  const currentJob = getCurrentJob();

  const handleSubmitInfinitetalk = async (formData) => {
    setIsLoading(true);
    try {
      const res = await submitInfinitetalk(formData);
      const jobId = res.data.job_id;
      
      const newJob = {
        id: jobId,
        type: 'infinitetalk',
        status: 'IN_QUEUE',
        error: null,
        createdAt: new Date().toISOString(),
        formData: { ...formData, files: undefined }, // Don't store file data
        customName: downloadSettings.customName || `infinitetalk_${jobId.slice(0, 8)}`,
        downloadPath: downloadSettings.downloadPath
      };
      
      setJobs(prev => ({ ...prev, [jobId]: newJob }));
      setCurrentJobId(jobId);
    } catch (err) {
      const error = err.response?.data?.detail || err.message;
      const jobId = 'error-' + Date.now();
      const newJob = {
        id: jobId,
        type: 'infinitetalk',
        status: 'FAILED',
        error,
        createdAt: new Date().toISOString()
      };
      setJobs(prev => ({ ...prev, [jobId]: newJob }));
      setCurrentJobId(jobId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitWanAnimate = async (formData) => {
    setIsLoading(true);
    try {
      const res = await submitWanAnimate(formData);
      const jobId = res.data.job_id;
      
      const newJob = {
        id: jobId,
        type: 'wananimate',
        status: 'IN_QUEUE',
        error: null,
        createdAt: new Date().toISOString(),
        formData: { ...formData, files: undefined },
        customName: downloadSettings.customName || `wananimate_${jobId.slice(0, 8)}`,
        downloadPath: downloadSettings.downloadPath
      };
      
      setJobs(prev => ({ ...prev, [jobId]: newJob }));
      setCurrentJobId(jobId);
    } catch (err) {
      const error = err.response?.data?.detail || err.message;
      const jobId = 'error-' + Date.now();
      const newJob = {
        id: jobId,
        type: 'wananimate',
        status: 'FAILED',
        error,
        createdAt: new Date().toISOString()
      };
      setJobs(prev => ({ ...prev, [jobId]: newJob }));
      setCurrentJobId(jobId);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = (jobId, newStatus, newError) => {
    setJobs(prev => ({
      ...prev,
      [jobId]: {
        ...prev[jobId],
        status: newStatus,
        error: newError
      }
    }));
  };

  const handleReset = () => {
    setCurrentJobId(null);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Don't reset job state when switching tabs
  };

  const getStatusFn = (jobId) => {
    const job = jobs[jobId];
    if (!job) return null;
    return job.type === 'infinitetalk' ? getInfinitetalkStatus : getWanAnimateStatus;
  };

  const getDownloadUrl = (jobId) => {
    const job = jobs[jobId];
    if (!job) return null;
    const customName = job.customName;
    return job.type === 'infinitetalk'
      ? getInfinitetalkDownloadUrl(jobId, customName)
      : getWanAnimateDownloadUrl(jobId, customName);
  };

  // Get jobs for current tab
  const tabJobs = Object.values(jobs).filter(job => job.type === activeTab);
  const activeTabJob = tabJobs.find(job => job.id === currentJobId) || tabJobs[0];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="bg-black/30 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Video className="w-8 h-8 text-indigo-400" />
            RunPod Video Studio
          </h1>
          <p className="text-gray-400 mt-1">Generate AI-powered videos with Infinitetalk and WanAnimate</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Tab Buttons */}
        <div className="flex gap-4 mb-8">
          <button
            onClick={() => handleTabChange('infinitetalk')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'infinitetalk'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            <Video className="w-5 h-5" />
            Infinitetalk
            {tabJobs.filter(j => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS').length > 0 && (
              <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">
                {tabJobs.filter(j => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS').length}
              </span>
            )}
          </button>
          <button
            onClick={() => handleTabChange('wananimate')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'wananimate'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            <Clapperboard className="w-5 h-5" />
            WanAnimate
            {tabJobs.filter(j => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS').length > 0 && (
              <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">
                {tabJobs.filter(j => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS').length}
              </span>
            )}
          </button>
        </div>

        {/* Download Settings */}
        <div className="mb-6">
          <DownloadSettings 
            settings={downloadSettings}
            onChange={setDownloadSettings}
          />
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {activeTab === 'infinitetalk' ? (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Infinitetalk</h2>
                <p className="text-gray-600">Generate talking-head videos from image + audio</p>
              </div>
              <InfinitetalkForm
                onSubmit={handleSubmitInfinitetalk}
                isLoading={isLoading || tabJobs.some(j => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS')}
              />
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">WanAnimate</h2>
                <p className="text-gray-600">Generate animated videos from image + reference video</p>
              </div>
              <WanAnimateForm
                onSubmit={handleSubmitWanAnimate}
                isLoading={isLoading || tabJobs.some(j => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS')}
              />
            </div>
          )}

          {/* Job Status & History */}
          {tabJobs.length > 0 && (
            <div className="mt-8 space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Job History
              </h3>
              {tabJobs.map(job => (
                <div key={job.id} className={`border rounded-lg p-4 ${
                  activeTabJob?.id === job.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                }`}>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium text-gray-800">{job.customName}</p>
                      <p className="text-sm text-gray-500">Created: {new Date(job.createdAt).toLocaleString()}</p>
                    </div>
                    {job.id !== activeTabJob?.id && (
                      <button
                        onClick={() => setCurrentJobId(job.id)}
                        className="text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        View Details
                      </button>
                    )}
                  </div>
                  
                  {job.id === activeTabJob?.id && (
                    <>
                      <JobStatus
                        jobId={job.id}
                        status={job.status}
                        error={job.error}
                        getStatusFn={getStatusFn(job.id)}
                        onStatusChange={(status, error) => handleStatusChange(job.id, status, error)}
                      />
                      <OutputPanel
                        status={job.status}
                        downloadUrl={getDownloadUrl(job.id)}
                        jobId={job.id}
                        customName={job.customName}
                        onReset={handleReset}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>Powered by RunPod GPU Cloud</p>
        </div>
      </main>
    </div>
  );
}

export default App;
