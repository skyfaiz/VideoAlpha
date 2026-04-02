# RunPod Video Studio

A full-stack web application with React frontend and FastAPI backend for video generation using RunPod-powered services:

- **Infinitetalk** — Generates talking-head videos from image + audio
- **WanAnimate** — Generates animated videos from image + reference video

## Prerequisites

- Python 3.10+
- Node.js 18+
- RunPod API key and endpoint IDs
- S3 credentials for RunPod Network Volume

## Setup

### Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   venv\Scripts\activate  # Windows
   source venv/bin/activate  # Linux/Mac
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure `.env` file with your credentials (copy from `.env.example`):
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

5. Start the backend server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open http://localhost:5173 in your browser

## API Endpoints

### Infinitetalk
- `POST /api/infinitetalk/submit` - Submit a new job
- `GET /api/infinitetalk/status/{job_id}` - Check job status
- `GET /api/infinitetalk/download/{job_id}` - Download completed video

### WanAnimate
- `POST /api/wananimate/submit` - Submit a new job
- `GET /api/wananimate/status/{job_id}` - Check job status
- `GET /api/wananimate/download/{job_id}` - Download completed video

## Security

- All credentials are stored in `backend/.env` and never exposed to the browser
- `.env` is gitignored
- CORS is restricted to localhost in development
