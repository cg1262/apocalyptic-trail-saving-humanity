# Apocalyptic Trail: Saving Humanity

Standalone retro survival road game about the last convoy heading west to shut down the machine intelligence in California.

## What This Repo Is

- Plain HTML, CSS, and JavaScript
- No build step
- No framework dependency
- Playable locally in a browser

## Run It

Option 1:

```bash
python -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000
```

Option 2:

- Open `index.html` directly in a browser

Using a tiny local server is recommended so browser behavior matches what your friends will see when they clone it.

## Files

- `index.html`: game shell
- `styles.css`: retro CRT styling and layout
- `game.js`: full game logic, events, endings, and UI rendering

## Share It

1. Push this folder to its own GitHub repo.
2. Friends can clone it and run `python -m http.server 8000`.
3. If you want an even easier share path, you can drop it onto GitHub Pages, Netlify, or Vercel as a static site.
