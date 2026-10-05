# CricPulse

CricPulse is a real-time cricket scoring app for setting up matches, entering team lineups, and keeping score ball by ball. The existing frontend and Node.js/Express scoring service remain the system of record. A separate FastAPI service provides a versioned REST facade and Python-based match analytics, ready to grow into AI features.

## Features

- Show only currently live matches on the home dashboard, with scores loaded from the backend and refreshed over Socket.IO.
- Create a match with team names, overs, toss details, and player names.
- Select the striker, non-striker, and bowler by name.
- Record runs and wickets and view the live score and recent balls.
- Track player and innings statistics, including overs and run rate.
- Persist match data locally in a JSON file.
- Receive live match events over Socket.IO.
- Optionally connect Supabase for team management.
- Use the optional FastAPI service for versioned match, team, player, score, over, statistics, and insight endpoints.

The home dashboard does not include sample fixtures or placeholder tournament data. Completed matches are kept in local storage but are not shown in the live match list.

## Requirements

- Node.js 18 or later and npm.
- Python 3.10 or later and pip for the optional Python service.
- A modern web browser.

## Run Locally

From the project root, install the backend dependencies:

```bash
npm --prefix backend install
```

Start the server:

```bash
npm --prefix backend start
```

For development with Node's file watcher:

```bash
npm --prefix backend run dev
```

Open [http://localhost:3000](http://localhost:3000). The Express server serves the frontend and API from the same origin. Stop the server with `Ctrl+C`.

To use a different port, set the `PORT` environment variable before starting the server.

### Start the Python API

The Python service is additive. Keep the Node server running because it continues to own scoring, match persistence, Socket.IO, and the existing UI routes. In a second terminal, from the project root:

```bash
cd python-backend
python -m venv .venv
```

Activate the environment and install the Python dependencies:

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

```bash
# macOS / Linux
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Run FastAPI:

```bash
python run.py
```

The Python API is available at [http://127.0.0.1:8000](http://127.0.0.1:8000); interactive OpenAPI documentation is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs). The frontend's optional REST helper defaults to `http://127.0.0.1:8000/api/v1` and can be configured before page scripts load with `window.CRICPULSE_PYTHON_API_BASE`.

## Create and Score a Match

1. Open the app and choose **New match**.
2. Enter the two team names, select the overs and toss details, and provide player names for each team.
3. Start the match. On the scorer page, select the striker, non-striker, and bowler.
4. Record each delivery using the run or wicket controls. The scorecard and recent-ball list update as the match progresses.
5. Use the match controls to reset the current match when needed.

Player lists accept up to 11 names per team; default player names are generated from the team names and can be edited. The available over lengths are 5, 10, 20, and 50 overs.

## Configuration

Core match creation and scoring work locally without Supabase. Match data is stored in `backend/data/matches.json`, which the server creates when it saves the first match. Keep this file if you want to retain local match history; deleting it removes the locally saved matches.

Supabase is optional and is used by the team endpoints. To enable it, create `backend/.env` with:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

`SUPABASE_ANON_KEY` is also accepted in place of `SUPABASE_PUBLISHABLE_KEY`. The Supabase `teams` table should provide the `name`, `short_name`, and `created_at` fields used by the API. Without Supabase configuration, the app can still run and score matches, but team API requests will not be backed by Supabase.

## API

All endpoints use JSON where a request body is required.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check that the server is running. |
| `GET` | `/api/matches` | List locally saved matches. |
| `GET` | `/api/matches/:id` | Get a match by ID. |
| `POST` | `/api/matches` | Create a match. Provide `team1`, `team2`, `overs`, `tossWinner`, `tossDecision`, and optionally `team1Players` and `team2Players`. |
| `POST` | `/api/matches/:id/balls` | Record a delivery. Provide `runs` and `wickets`; active player IDs can be provided or set using the players endpoint. |
| `POST` | `/api/matches/:id/players` | Set `strikerId`, `nonStrikerId`, and `bowlerId` for the live innings. |
| `POST` | `/api/matches/:id/reset` | Reset a match to its initial live state. |
| `GET` | `/api/teams` | List teams from Supabase. |
| `POST` | `/api/teams` | Add a Supabase team using `name` and `short_name`. |

Socket.IO broadcasts `match:created` when a match is created and `match:update` when its score or active players change.

### Python API

FastAPI exposes the following versioned routes under `/api/v1`. Match writes are validated by Python and forwarded to the existing Node API, so Node remains authoritative and its real-time Socket.IO events continue to work.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Check Python API health. |
| `GET` | `/api/v1/health/dependencies` | Check connectivity to the Node scoring API. |
| `GET`, `POST` | `/api/v1/matches` | List/create matches. |
| `GET` | `/api/v1/matches/:id` | Get a match. |
| `POST` | `/api/v1/matches/:id/balls` | Record a ball through the Node scoring logic. |
| `POST` | `/api/v1/matches/:id/players` | Update active striker, non-striker, and bowler. |
| `POST` | `/api/v1/matches/:id/reset` | Reset a match through the existing scoring logic. |
| `GET` | `/api/v1/matches/:id/players` | Get derived player batting and bowling figures. |
| `GET` | `/api/v1/matches/:id/scores` | Get team totals, overs, run rates, and innings state. |
| `GET` | `/api/v1/matches/:id/overs` | Get per-over runs, wickets, and deliveries. |
| `GET` | `/api/v1/matches/:id/statistics` | Get derived player performance statistics. |
| `GET` | `/api/v1/matches/:id/insights` | Get baseline rule-based observations; this is not an ML prediction. |
| `GET`, `POST` | `/api/v1/teams` | List/create teams through the existing Node/Supabase team API. |

The existing frontend now sends match creation, match loading/listing, active-player changes, ball recording, and reset requests through `window.CricPulsePythonAPI` to FastAPI. The Node service remains behind that gateway and continues to own the scoring calculations, JSON persistence, and Socket.IO live broadcasts. The frontend helper also exposes `health`, `teams`, `createTeam`, `players`, `scores`, `overs`, `statistics`, and `insights` for further integration.

Python configuration is read from `python-backend/.env` or the process environment. See `python-backend/.env.example` for `HOST`, `PORT`, `NODE_API_BASE_URL`, and `CORS_ORIGINS`. Do not commit real credentials.

Run the Python analytics tests from `python-backend/` with:

```bash
python -m unittest discover -s tests
```

## Project Structure

```text
backend/
  data/matches.json   Local match storage (created as needed)
  package.json        Backend scripts and dependencies
  server.js           Express API, scoring logic, and Socket.IO server
  supabase.js         Optional Supabase client configuration
python-backend/
  app/api/routes/     Versioned health, match, and team routes
  app/core/           Environment-backed settings
  app/schemas/        Pydantic request validation
  app/services/       Node API gateway and cricket analytics
  tests/              Python analytics tests
  requirements.txt    FastAPI service dependencies
docs/
  ui-update.md        UI update notes
frontend/
  index.html          Match setup and app home page
  scorer.html         Live scoring interface
  script.js           Frontend live dashboard and match setup logic
  python-api.js       Optional REST client for the FastAPI service
  style.css           Shared responsive styles
```

## Development Notes

- Backend dependencies and scripts are managed from `backend/`; the root `npm start` script is a convenience for starting the backend.
- `backend/.env` and `node_modules/` are excluded from Git.
- Match records are stored in a local JSON file, so they persist across server restarts on the same machine but are not shared across deployments.
- Python is a separate service: start it alongside Node only when Python-backed APIs are needed.
- The initial Python insights are deterministic, rule-based summaries. Prediction and recommendation models can be added behind the analytics service without altering the current scoring engine.