# MediQueue - Real-Time Clinic Queue System

MediQueue is a full-stack clinic token management app built for live receptionist and patient-display workflows. A receptionist can add patients, call the next token, and adjust consultation timing; every connected patient display updates instantly through Socket.IO without manual refresh.

## What It Solves

Small clinics often manage queues verbally or on paper, which makes waiting time unclear for patients and repetitive for reception staff. MediQueue keeps one shared queue state and broadcasts each change in real time so staff and patients always see the same token status.

## Key Features

- Receptionist dashboard for adding patients, calling the next token, and setting average consultation time.
- Waiting-room patient display showing the token being served, next token, queue length, and estimated wait.
- Real-time synchronization using Socket.IO events and acknowledgement callbacks.
- REST API for initial page load, health checks, and fallback integrations.
- MongoDB persistence with automatic in-memory fallback for quick demos when MongoDB is unavailable.
- Production mode where the Express backend serves the built React frontend.
- Backend tests for core queue behavior.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React + Vite |
| UI Icons | Lucide React |
| Realtime | Socket.IO |
| Backend | Node.js + Express |
| Database | MongoDB + Mongoose |
| Tests | Jest |

## Project Structure

```text
ClinicQueue/
  backend/
    src/
      models/          Mongoose Token and QueueState schemas
      services/        Queue mutation and status logic
      server.js        Express, Socket.IO, REST routes, static frontend serving
    tests/             Backend queue tests
    .env               Backend environment variables
    package.json
  frontend/
    src/
      main.jsx         React app, socket client, receptionist/display views
      styles.css       Responsive UI styling
    package.json
  ARCHITECTURE.md      System diagram and data flow
  THOUGHT_PROCESS.md   Design reasoning and tradeoffs
  README.md
```

## Prerequisites

Install these before running the project:

- Node.js 18 or newer
- npm
- MongoDB local instance or MongoDB Atlas connection string

MongoDB is optional for demos. If the backend cannot connect to MongoDB, it automatically uses in-memory state so the app still runs.

## Environment Variables

Create or update `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/mediqueue
CORS_ORIGIN=http://localhost:5173,http://localhost:5000
```

Create `frontend/.env` when running the frontend dev server separately:

```env
VITE_API_URL=http://localhost:5000
```

## Run Locally - Development Mode

Start the backend:

```bash
cd backend
npm install
npm run dev
```

Start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open these URLs:

- Receptionist UI: http://localhost:5173/reception
- Patient display: http://localhost:5173/display
- Backend health: http://localhost:5000/api/health

## Run Locally - Single Server Mode

Use this when you want the backend to serve the compiled frontend from one port.

```bash
cd frontend
npm install
npm run build

cd ../backend
npm install
npm start
```

Open:

- Receptionist UI: http://localhost:5000/reception
- Patient display: http://localhost:5000/display

## Demo Flow

1. Open `/reception` in one browser tab.
2. Open `/display` in another tab or window.
3. Add a patient from the receptionist screen.
4. Watch the patient display update without refreshing.
5. Click `Call Next` from the receptionist screen.
6. Confirm the current token, waiting count, and estimated time update on both screens.
7. Change the average consultation time and confirm the estimate changes live.

## API Reference

### `GET /api/health`

Returns backend and database status.

Example response:

```json
{
  "status": "UP",
  "database": "CONNECTED",
  "timestamp": "2026-06-24T10:00:00.000Z"
}
```

### `GET /api/queue`

Returns the complete queue snapshot used by both UIs.

```json
{
  "currentToken": 1,
  "lastTokenId": 3,
  "avgConsultMin": 5,
  "totalServed": 0,
  "waitingTokens": [],
  "servingToken": null,
  "queueLength": 0
}
```

### `POST /api/queue/add`

Adds a patient to the waiting queue.

Request body:

```json
{ "patientName": "Asha Rao" }
```

### `POST /api/queue/call-next`

Marks the current serving token as served and promotes the next waiting token.

### `POST /api/queue/avg-time`

Updates the average consultation time in minutes.

Request body:

```json
{ "avgConsultMin": 7.5 }
```

## Socket.IO Event Contract

### Client to Server

| Event | Payload | Purpose |
| --- | --- | --- |
| `addPatient` | `{ patientName }` | Add a patient to the queue |
| `callNext` | `{}` | Serve the current token and call the next waiting token |
| `setAvgTime` | `{ avgConsultMin }` | Update estimated consultation time |

Each client event supports an acknowledgement callback with this shape:

```json
{
  "success": true,
  "status": {
    "currentToken": 1,
    "waitingTokens": []
  }
}
```

### Server to Clients

| Event | Payload | Purpose |
| --- | --- | --- |
| `queue:updated` | Full queue snapshot | Broadcast after every successful mutation |

`queue:updated` is emitted to every connected client, so receptionist and patient screens render from the same source of truth.

## Data Model

### Token

```js
{
  tokenId: Number,
  patientName: String,
  status: 'waiting' | 'serving' | 'served',
  addedAt: Date,
  calledAt: Date,
  servedAt: Date
}
```

### QueueState

```js
{
  currentToken: Number,
  lastTokenId: Number,
  avgConsultMin: Number,
  totalServed: Number
}
```

`QueueState` is treated as a singleton document. `lastTokenId` is incremented server-side so token generation stays consistent.

## Testing

Run backend tests:

```bash
cd backend
npm test
```

Current test coverage checks:

- Initial queue defaults
- Patient token creation
- Token promotion through `callNext`
- Manual average consultation time update
- Served-token count update

## Deployment Notes

Frontend static hosting and backend hosting can be deployed separately:

- Frontend: Vercel, Netlify, or any static host
- Backend: Render, Railway, Fly.io, or any Node host with WebSocket support
- Database: MongoDB Atlas

For separate frontend/backend deployment:

1. Set frontend `VITE_API_URL` to the deployed backend URL.
2. Set backend `CORS_ORIGIN` to the deployed frontend URL.
3. Set backend `MONGODB_URI` to the Atlas connection string.

For single-server deployment:

1. Run `npm run build` inside `frontend`.
2. Deploy the `backend` folder together with `frontend/dist` available at `../frontend/dist`.
3. Start the backend with `npm start`.

## Design Decisions

- Socket.IO is used instead of polling so all displays update immediately after receptionist actions.
- REST remains available for initial state loading and simple fallback integrations.
- Queue mutation logic is centralized in `queueService` so REST routes and socket handlers share behavior.
- The app supports in-memory fallback to make demos resilient even without database setup.
- The UI uses two focused views instead of one crowded screen: staff controls in `/reception`, large waiting-room status in `/display`.

## Known Limitations

- The in-memory fallback resets when the backend restarts.
- Authentication and multi-clinic tenancy are not implemented.
- Queue history is stored in MongoDB but no admin analytics screen is currently included.

## Useful Links

- Architecture notes: `ARCHITECTURE.md`
- Thought process: `THOUGHT_PROCESS.md`