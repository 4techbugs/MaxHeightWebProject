# MaxHeightWebProject

MaxHeight electricity billing and payment management application, built with React, Vite, Express, and Microsoft SQL Server.

## Local setup

1. Install Node.js and provide access to Microsoft SQL Server.
2. Run `npm ci` in the project directory.
3. Copy `.env.example` to `.env` and configure the database connection and admin credentials.
4. Run `npm run dev` to start the API and frontend.

The API uses port 3001 by default. Vite forwards `/api` requests to the local API.

## Production

Run `npm run build` to create the frontend in `dist`. Start the backend with `npm run server`. The root `web.config` contains IIS rewrite rules for the frontend and the Node API on port 3001.

The `NewUpload/api` directory contains the prepared backend update, including `POST /api/admin/payments/import`. Follow `NewUpload/UPLOAD-INSTRUCTIONS.txt` to upload it to the existing server. Preserve the server's `.env` and restart the backend after replacing files.

## Repository contents

- `src`: frontend source.
- `server`: current API source, database schema, and existing login tests.
- `NewUpload`: prepared API deployment update and upload instructions.

Environment secrets, installed dependencies, build output, local IDE files, old deployment copies, and deployment ZIP archives are excluded from Git.
