# Tetris Multiplayer

A real-time multiplayer Tetris game built with Lakebed. Play 1v1 matches or compete in 4-player Battle Royale. Sign in with Google to track your wins!

## How to Play

1. Click **1v1 Match** or **Battle Royale (4 Players)** to enter the queue
2. See who's in the queue — names appear live as players join
3. When matched, the 2-minute game begins automatically
4. Use arrow keys to move pieces, Up to rotate, Space to hard drop
5. **1v1**: Highest score wins when time runs out
6. **Battle Royale**: Last player alive wins — eliminated players' boards show "Eliminated"

## Controls

- `← →` Move piece
- `↑` Rotate
- `↓` Soft drop
- `Space` Hard drop

## Features

- **1v1 Match**: Face off against a single opponent in real time
- **Battle Royale (4 Players)**: Compete with 3 other players — survive until you're the last one standing
- **Live Queue**: See who's waiting in the matchmaking queue
- **Google Sign-In**: Log in to track wins across sessions
- **Real-time Opponent Boards**: Watch all opponents' boards update live
- **2-Minute Matches**: Fast, intense games
- **Overflow = DQ**: Pieces overflow the board and you're eliminated

## Tech Stack

- [Lakebed](https://lakebed.dev/) — full-stack TypeScript framework
- Preact + Tailwind CSS
- Shared Tetris engine (client + server)

## Run Locally

```sh
npx lakebed dev
```

Then open http://localhost:3000
