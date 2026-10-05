# CricPulse

CricPulse is a real-time cricket scoring app for setting up matches, entering team lineups, and keeping score ball by ball. It includes a responsive browser interface and a Node.js/Express server with Socket.IO updates.

## Features

- Show only currently live matches on the home dashboard, with scores loaded from the backend and refreshed over Socket.IO.
- Create a match with team names, overs, toss details, and player names.
- Select the striker, non-striker, and bowler by name.
- Record runs and wickets and view the live score and recent balls.
- Track player and innings statistics, including overs and run rate.
- Persist match data locally in a JSON file.
- Receive live match events over Socket.IO.
- Optionally connect Supabase for team management.

The home dashboard does not include sample fixtures or placeholder tournament data. Completed matches are kept in local storage but are not shown in the live match list.

## Requirements

- Node.js 18 or later and npm.
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

## Project Structure

```text
backend/
  data/matches.json   Local match storage (created as needed)
  package.json        Backend scripts and dependencies
  server.js           Express API, scoring logic, and Socket.IO server
  supabase.js         Optional Supabase client configuration
docs/
  ui-update.md        UI update notes
frontend/
  index.html          Match setup and app home page
  scorer.html         Live scoring interface
  script.js           Frontend live dashboard and match setup logic
  style.css           Shared responsive styles
```

## Development Notes

- Backend dependencies and scripts are managed from `backend/`; the root `npm start` script is a convenience for starting the backend.
- `backend/.env` and `node_modules/` are excluded from Git.
- Match records are stored in a local JSON file, so they persist across server restarts on the same machine but are not shared across deployments.