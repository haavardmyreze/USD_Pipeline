# USD Pipeline Toolkit - Step 1

This repository contains Step 1 of the USD pipeline toolkit:
- `launch.py` local server + browser launcher
- `launch.bat` Windows double-click wrapper
- `pipeline.example.json` starter metadata file
- `frontend/` standalone TypeScript web app

## Quick start (non-technical)

1. Copy `pipeline.example.json` to `pipeline.json` in the project root.
2. Double-click `launch.bat`.
3. Your browser opens automatically at `http://localhost:47312`.
4. Keep the terminal window open while using the app.

If `pipeline.json` does not exist, the app opens a first-run setup page and creates it for you.

## What the app does

- Reads all metadata from `pipeline.json`
- Lets you edit metadata in a browser UI (no Houdini required)
- Tracks unsaved changes in the header
- Saves the full state back to `pipeline.json`
- Creates `pipeline.json.bak` on each save
- `POST /create` creates shot/asset/set folders and appends to JSON

## Developer setup

```bash
cd frontend
npm install
npm run build
cd ..
python launch.py
```

## API contract

- `GET /` frontend app
- `GET /data` returns full JSON data
- `POST /data` writes full JSON data
- `POST /create` creates folders + appends new asset/shot/set

## Notes

- Backend uses Python standard library only (`http.server`, `json`, etc.)
- Frontend uses TypeScript + Vite + Tanstack Table + Lucide
- Server listens on localhost port `47312`
