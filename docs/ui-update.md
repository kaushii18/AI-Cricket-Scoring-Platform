# CricPulse UI Update

- Replaced sample score previews and placeholder tournament cards with a live-match dashboard backed by `/api/matches`.
- Added Socket.IO status and live-match updates; completed matches and static fixtures are omitted from the live list.
- Added an empty state for when no matches are in progress and an error state with a retry action if the server cannot be reached.
- Applied a premium dark-green visual system across the dashboard and match setup dialog.
- Kept the match setup roster editable while generating default player names from the entered team names.
- Checked the responsive dashboard at mobile width and verified that it does not overflow horizontally.
