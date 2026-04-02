# Video Download and Job Management Features

## Where Videos Are Saved

**Server-side storage**: Videos are currently saved to:
```
f:\AI\Runpod_interface\VideoGen_Gui\runpod-gui\backend\outputs\{job_id}.mp4
```

**Client-side download**: Users can download videos to any location they choose via the download button.

## New Features Added

### 1. Persistent Job Management
- Jobs are no longer lost when switching tabs
- Job history is saved in browser localStorage
- Each tab (Infinitetalk/WanAnimate) maintains its own job list
- Active jobs show progress indicators on tab buttons

### 2. Custom Download Settings
- **Custom filenames**: Set your preferred video name before generation
- **Download path**: Choose where to save videos (client-side)
- **Persistent settings**: Download preferences are saved between sessions

### 3. Enhanced Job History
- View all previous jobs for each service
- Switch between jobs to see details and download
- Jobs show creation time and custom names
- Visual indicators for active/completed/failed jobs

## How to Use

### Setting Custom Download Name
1. Click the "Download Settings" panel (below the tab buttons)
2. Enter a custom filename (without .mp4 extension)
3. Optionally set a download folder path
4. Submit your job - it will use these settings

### Managing Multiple Jobs
1. Submit multiple jobs in sequence
2. Switch between tabs without losing progress
3. View job history in the "Job History" section
4. Click "View Details" on any job to see its status
5. Download completed videos with custom names

### Job Status Tracking
- **Yellow badge** on tab shows number of active jobs
- Real-time progress updates every 5 seconds
- Jobs persist across browser refreshes
- Failed jobs show error messages

## Technical Details

### Frontend Changes
- `App.jsx`: Refactored to use persistent job state
- `DownloadSettings.jsx`: New component for download preferences
- `OutputPanel.jsx`: Updated to support custom filenames
- `client.js`: API calls now support custom name parameters

### Backend Changes
- `infinitetalk.py`: Download endpoint accepts `custom_name` parameter
- `wananimate.py`: Download endpoint accepts `custom_name` parameter
- Filename validation and automatic .mp4 extension addition

### Data Storage
- **Jobs**: Stored in browser `localStorage` as `videoJobs`
- **Settings**: Stored in browser `localStorage` as `downloadSettings`
- **Videos**: Server-side in `backend/outputs/` folder

## File Structure
```
backend/
├── outputs/                    # Server video storage
│   ├── {job_id}.mp4           # Generated videos
│   └── .gitkeep
├── routes/
│   ├── infinitetalk.py         # Infinitetalk API routes
│   └── wananimate.py          # WanAnimate API routes
└── ...

frontend/src/
├── components/
│   ├── DownloadSettings.jsx   # New download settings component
│   ├── JobStatus.jsx          # Job progress tracking
│   └── OutputPanel.jsx       # Download interface
├── api/
│   └── client.js             # API client with custom name support
└── App.jsx                   # Main app with persistent state
```

## Browser Compatibility
All features use standard web APIs and should work in modern browsers:
- localStorage for persistence
- File download via anchor elements
- ES6+ JavaScript features

## Notes
- Server-side video storage location cannot be changed via the GUI (requires backend configuration)
- Download folder selection is simulated - actual folder selection requires additional browser APIs
- Job data is stored locally and will be cleared if browser data is cleared
- Maximum file size for uploads: 200MB per file
