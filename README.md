# Tiles & Tea

A two-player word game with tiles, a 15×15 board and bonus squares. Each player uses their own phone or computer. Moves sync live through Supabase, and the site runs on GitHub Pages.

## Setup

1. In your Supabase project, open **SQL Editor**, paste in `supabase/setup.sql` and click **Run**.
2. In **Project Settings → API**, copy the **Project URL** and the **anon / publishable** key into `js/config.js`. Never use the `service_role` / secret key.
3. Push the project to GitHub and turn on **Settings → Pages → Deploy from branch → main / root**.

## Playing

- Open the site, enter both names, and tap **Start the game**.
- Send the other player their link from **Game links**, and bookmark your own.
- To make a move, drag a tile from your rack onto the board, or tap a tile and then tap a square. Drag or tap a placed tile to take it back, and drag rack tiles to rearrange them.
- Words that aren't in the word list need a second tap on **Play anyway**, so you can agree on names and slang between yourselves.

## Testing locally

```
python -m http.server 8765
```

If `js/config.js` is empty, the game runs in test mode. Games are saved in that browser only, and two tabs can play each other.

Anyone who has a game link can play that game, so only share links with each other.
