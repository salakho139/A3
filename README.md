# CSC316 Assignment 3 Submission

This project is my submission for Assignment 3 in CSC316. It is an interactive D3-based visualization of football player transfer journeys across European clubs and leagues.

## Project Files
- `index.html` - main page structure
- `styles.css` - page styling and layout
- `script.js` - data loading, filtering, playback, and map rendering logic
- `preprocess.py` - optional preprocessing script for rebuilding the map-ready CSV
- `data/player_journeys_map_ready.csv` - dataset used by the visualization
- `data/featured_players.json` - featured player list used for quick selection

## How to Run
The project should be run through a local server because the page loads external CSV and JSON files.

## Visualization Summary
The visualization supports two main views:

- `League pulse` mode for exploring transfers by season
- `Player spotlight` mode for following an individual player's career journey over time

Users can filter by season, league, position, transfer window, and move type. In player mode, the playback feature animates transfers on the map and shows a career timeline alongside the animation.

## Notes
- Opening `index.html` directly with `file://` will not work correctly because browser security blocks local data requests.
- The preprocessing script is optional and is only needed if the dataset is rebuilt from a larger source file.
