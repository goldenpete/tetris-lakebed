import { Router, Routes, Route, SignInWithGoogle, signOut, useAuth, useMutation, useQuery } from "lakebed/client";
import { useState, useEffect, useCallback, useRef } from "preact/hooks";
import type { Piece, PieceType } from "../shared/tetris";
import { BOARD_WIDTH, BOARD_HEIGHT, GAME_DURATION_MS, createEmptyBoard, createPiece, getRandomPieceType, isValidMove, lockPiece, clearLines, calculateScore, getDropY, getPieceShape, PIECES } from "../shared/tetris";

interface Opponent {
  id: string;
  name: string;
  score: number;
  board: (PieceType | null)[][];
  currentPiece: Piece | null;
  nextPiece: PieceType;
  gameOver: boolean;
  disqualified: boolean;
}

interface GameView {
  id: string;
  gameMode: '1v1' | 'battleRoyale';
  myPlayerNum: number;
  myScore: number;
  myBoard: (PieceType | null)[][];
  myCurrentPiece: Piece | null;
  myNextPiece: PieceType;
  myGameOver: boolean;
  myDisqualified: boolean;
  opponents: Opponent[];
  startedAt: number;
  endedAt: number | null;
  winnerId: string;
  status: 'active' | 'finished';
  won: boolean;
  isDraw: boolean;
}

function friendlyName(name: string | undefined): string {
  if (!name || name === 'Local') return 'Guest';
  return name;
}

const PIECE_COLORS: Record<PieceType | 'ghost', string> = {
  I: '#00f0f0', O: '#f0f000', T: '#a000f0', S: '#00f000',
  Z: '#f00000', J: '#0000f0', L: '#f0a000', ghost: 'rgba(255,255,255,0.12)',
};

function AuthAvatar({ label, picture }: { label: string; picture?: string }) {
  const initial = label.trim().slice(0, 1).toUpperCase() || "?";
  if (picture) return <img alt="" className="h-7 w-7 rounded-full bg-neutral-800 object-cover" referrerPolicy="no-referrer" src={picture} />;
  return <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-xs font-medium text-neutral-400">{initial}</span>;
}

function Cell({ type, isGhost }: { type: PieceType | null; isGhost?: boolean }) {
  const color = isGhost ? PIECE_COLORS.ghost : (type ? PIECE_COLORS[type] : 'transparent');
  return <div className="w-full aspect-square" style={{ backgroundColor: color, opacity: isGhost ? 0.6 : 1 }} />;
}

function NextPiece({ piece }: { piece: PieceType }) {
  if (!piece) {
    return <div><p className="text-xs text-neutral-500 mb-1 uppercase tracking-wide">Next</p><div className="text-xs text-neutral-500">Loading...</div></div>;
  }
  const shapes: Record<PieceType, number[][]> = {
    I: [[1,1,1,1]], O: [[1,1],[1,1]], T: [[0,1,0],[1,1,1]],
    S: [[0,1,1],[1,1,0]], Z: [[1,1,0],[0,1,1]], J: [[1,0,0],[1,1,1]], L: [[0,0,1],[1,1,1]],
  };
  const shape = shapes[piece];
  const color = PIECE_COLORS[piece];
  return (
    <div>
      <p className="text-xs text-neutral-500 mb-1 uppercase tracking-wide">Next</p>
      <div className="grid gap-px bg-neutral-900 p-2" style={{ gridTemplateColumns: `repeat(${shape[0].length}, 1fr)`, width: 'fit-content' }}>
        {shape.flat().map((cell, i) => (
          <div key={i} className="w-4 h-4" style={{ backgroundColor: cell ? color : 'transparent' }} />
        ))}
      </div>
    </div>
  );
}

function PlayerBoard({ board, currentPiece, ghostY, isOpponent = false, playerName, score, disqualified, eliminated, width = 240 }: {
  board: (PieceType | null)[][]; currentPiece?: Piece | null; ghostY?: number; isOpponent?: boolean;
  playerName: string; score: number; disqualified?: boolean; eliminated?: boolean; width?: number;
}) {
  if (!board) {
    return <div className="text-xs text-neutral-500">Loading board...</div>;
  }
  if (eliminated) {
    const emptyBoard = createEmptyBoard();
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className={`font-medium ${isOpponent ? 'text-sm text-neutral-500' : 'text-sm text-neutral-300'}`}>{playerName}</span>
          <span className="font-mono text-lg text-neutral-500">{(score ?? 0).toLocaleString()}</span>
        </div>
        <div className="relative">
          <div className="grid gap-px bg-neutral-800 opacity-30" style={{ gridTemplateColumns: `repeat(${BOARD_WIDTH}, 1fr)`, width: `${width}px` }}>
            {emptyBoard.flat().map((cell, i) => <Cell key={i} type={cell} />)}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-red-400 font-bold text-sm tracking-widest uppercase bg-neutral-900/80 px-2 py-1">Eliminated</span>
          </div>
        </div>
      </div>
    );
  }
  const displayBoard = board.map(row => [...row]);
  if (currentPiece && ghostY !== undefined && !isOpponent) {
    for (let r = 0; r < currentPiece.shape.length; r++) {
      for (let c = 0; c < currentPiece.shape[r].length; c++) {
        if (currentPiece.shape[r][c]) {
          const y = ghostY + r, x = currentPiece.x + c;
          if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH && !displayBoard[y][x]) {
            // ghost cell
          }
        }
      }
    }
  }
  if (currentPiece) {
    for (let r = 0; r < currentPiece.shape.length; r++) {
      for (let c = 0; c < currentPiece.shape[r].length; c++) {
        if (currentPiece.shape[r][c]) {
          const y = currentPiece.y + r, x = currentPiece.x + c;
          if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) displayBoard[y][x] = currentPiece.type;
        }
      }
    }
  }
  return (
    <div className={isOpponent ? 'opacity-70' : ''}>
      <div className="flex items-center justify-between mb-1">
        <span className={`font-medium ${isOpponent ? 'text-sm text-neutral-500' : 'text-sm text-neutral-300'}`}>
          {playerName}{disqualified ? ' (DQ)' : ''}
        </span>
        <span className={`font-mono ${isOpponent ? 'text-lg text-neutral-500' : 'text-lg text-white'}`}>{(score ?? 0).toLocaleString()}</span>
      </div>
      <div className="grid gap-px bg-neutral-800" style={{ gridTemplateColumns: `repeat(${BOARD_WIDTH}, 1fr)`, width: `${width}px` }}>
        {displayBoard.flat().map((cell, i) => {
          const r = Math.floor(i / BOARD_WIDTH), c = i % BOARD_WIDTH;
          let isGhost = false;
          if (currentPiece && ghostY !== undefined && !isOpponent) {
            for (let pr = 0; pr < currentPiece.shape.length; pr++) {
              for (let pc = 0; pc < currentPiece.shape[pr].length; pc++) {
                if (currentPiece.shape[pr][pc]) {
                  const py = ghostY + pr, px = currentPiece.x + pc;
                  if (py === r && px === c && !cell) isGhost = true;
                }
              }
            }
          }
          return <Cell key={i} type={cell} isGhost={isGhost} />;
        })}
      </div>
    </div>
  );
}

function Timer({ startedAt, onExpire }: { startedAt: number; onExpire?: () => void }) {
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION_MS);
  const expiredCalled = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  useEffect(() => {
    expiredCalled.current = false;
    const interval = setInterval(() => {
      if (!startedAt || isNaN(startedAt)) return;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0 && onExpireRef.current && !expiredCalled.current) {
        expiredCalled.current = true;
        onExpireRef.current();
      }
    }, 200);
    return () => clearInterval(interval);
  }, [startedAt]);
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  const isLow = timeLeft < 30000;
  return (
    <div className={`font-mono text-2xl ${isLow ? 'text-red-400' : 'text-neutral-300'}`}>
      {minutes}:{seconds.toString().padStart(2, '0')}
    </div>
  );
}

const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

function MenuBlocks() {
  const blocks = useRef<Array<{ id: number; left: number; piece: PieceType; cellSize: number; delay: number; duration: number }>>([]);
  if (blocks.current.length === 0) {
    for (let i = 0; i < 48; i++) {
      blocks.current.push({
        id: i,
        left: Math.random() * 96 + 2,
        piece: PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)],
        cellSize: Math.random() * 0.6 + 0.4,
        delay: Math.random() * 4 - 2,
        duration: Math.random() * 6 + 6,
      });
    }
  }
  return (
    <div className="fixed left-0 right-0 bottom-0 overflow-hidden pointer-events-none" style={{ top: '56px', zIndex: 0 }}>
      {blocks.current.map(b => {
        const shape = PIECES[b.piece];
        const color = PIECE_COLORS[b.piece];
        return (
          <div
            key={b.id}
            className="absolute"
            style={{
              left: `${b.left}%`,
              top: '-80px',
              opacity: 0.12,
              animation: `fall ${b.duration}s linear ${b.delay}s infinite`,
            }}
          >
            <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${shape[0].length}, 1fr)` }}>
              {shape.flat().map((cell, i) => (
                <div
                  key={i}
                  style={{
                    width: `${b.cellSize}vw`,
                    height: `${b.cellSize}vw`,
                    backgroundColor: cell ? color : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SPINNER_PIECES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const SPINNER_SHAPES: Record<PieceType, number[][]> = {
  I: [[1,1,1,1]], O: [[1,1],[1,1]], T: [[0,1,0],[1,1,1]],
  S: [[0,1,1],[1,1,0]], Z: [[1,1,0],[0,1,1]], J: [[1,0,0],[1,1,1]], L: [[0,0,1],[1,1,1]],
};

function RotatingBlock() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setIndex(i => (i + 1) % SPINNER_PIECES.length), 1000);
    return () => clearInterval(interval);
  }, []);
  const type = SPINNER_PIECES[index];
  const shape = SPINNER_SHAPES[type];
  const color = PIECE_COLORS[type];
  return (
    <div className="w-10 h-10 flex items-center justify-center" style={{ animation: 'spin 1s linear infinite' }}>
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${shape[0].length}, 1fr)` }}>
        {shape.flat().map((cell, i) => (
          <div key={i} className="w-2.5 h-2.5" style={{ backgroundColor: cell ? color : 'transparent' }} />
        ))}
      </div>
    </div>
  );
}

function GoogleSignInButton({ onClick }: { onClick?: () => void }) {
  return (
    <SignInWithGoogle className="inline-flex items-center gap-3 bg-white text-gray-700 text-sm font-medium px-6 py-2.5 rounded hover:bg-gray-100 transition-colors shadow-sm cursor-pointer">
      <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    </SignInWithGoogle>
  );
}

function MenuPage() {
  const auth = useAuth();
  const profile = useQuery<{ wins: number; gamesPlayed: number; winRate: number; displayName: string; leaderboardVisible: boolean } | null>("myProfile");
  const toggleVisibility = useMutation<[{ visible: boolean }], void>("toggleLeaderboardVisibility");
  const leaderboard = useQuery<{ rank: number; name: string; wins: number }[]>("leaderboard");
  const myStatus = useQuery<{ status: 'idle' | 'searching' | 'in_game'; gameId: string | null }>("myStatus");
  const queuePlayers = useQuery<string[]>("queuePlayers");
  const brQueuePlayers = useQuery<string[]>("battleRoyaleQueuePlayers");
  const joinQueue = useMutation<[], void>("joinQueue");
  const joinBRQueue = useMutation<[], void>("joinBattleRoyaleQueue");
  const leaveQueue = useMutation<[], void>("leaveQueue");
  const isSearching = myStatus?.status === 'searching';
  const [queueType, setQueueType] = useState<'1v1' | 'br'>('1v1');
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const isGuest = auth.isGuest;

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[70vh] overflow-hidden">
      <MenuBlocks />
      <h1 className="text-5xl font-bold tracking-tight text-white mb-2 relative z-10" style={{ fontFamily: "'Merriweather', serif" }}>Tetris</h1>
      <p className="text-sm text-neutral-500 mb-10 tracking-widest uppercase relative z-10">Multiplayer</p>

      {isSearching ? (
        <div className="flex flex-col items-center gap-5 relative z-10">
          <RotatingBlock />
          <div className="text-center">
            <p className="text-lg text-white font-medium mb-1">
              {queueType === 'br' ? 'Looking for 3 opponents...' : 'Looking for opponent...'}
            </p>
            <p className="text-sm text-neutral-500 mb-1">
              {queueType === 'br'
                ? `${(brQueuePlayers || []).length} player(s) in queue`
                : `${(queuePlayers || []).length} player(s) in queue`}
            </p>
            <div className="flex flex-wrap gap-1 justify-center">
              {(queueType === 'br' ? brQueuePlayers || [] : queuePlayers || []).map((name, i) => (
                <span key={i} className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded">{friendlyName(name)}</span>
              ))}
            </div>
          </div>
          <button onClick={async () => { try { await leaveQueue(); } catch (e) { console.error('leaveQueue failed:', e); } }} className="px-12 py-2 border border-neutral-700 text-neutral-400 text-sm hover:text-white hover:border-neutral-500 transition-all active:scale-95 active:translate-y-px">Cancel</button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 relative z-10">
          <button onClick={async () => {
            if (isGuest) { setShowLoginPrompt(true); return; }
            try { setQueueType('1v1'); await joinQueue(); } catch (e) { console.error('joinQueue failed:', e); }
          }} className="px-12 py-3 bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-all active:scale-95 active:translate-y-px active:shadow-inner">
            1v1 Match
          </button>
          <button onClick={async () => {
            if (isGuest) { setShowLoginPrompt(true); return; }
            try { setQueueType('br'); await joinBRQueue(); } catch (e) { console.error('joinBRQueue failed:', e); }
          }} className="px-12 py-2 border border-neutral-700 text-neutral-400 text-sm hover:text-white hover:border-neutral-500 transition-all active:scale-95 active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed">
            Battle Royale (4 Players)
          </button>
          <button onClick={() => setShowStats(true)} className="px-12 py-2 border border-neutral-700 text-neutral-400 text-sm hover:text-white hover:border-neutral-500 transition-all active:scale-95 active:translate-y-px relative z-10">
            Stats
          </button>
        </div>
      )}

      {showLoginPrompt && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-black border border-white/20 rounded p-8 flex flex-col items-center gap-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="text-center space-y-1">
              <p className="text-white font-medium text-lg">Sign in to play</p>
              <p className="text-sm text-white/50">You need to be signed in to join multiplayer matches.</p>
            </div>
            <GoogleSignInButton />
            <button onClick={() => setShowLoginPrompt(false)} className="px-8 py-2 border border-white/20 text-white/60 text-sm hover:text-white hover:border-white/40 transition-all active:scale-95 active:translate-y-px">Cancel</button>
          </div>
        </div>
      )}

      {showStats && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowStats(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-72 bg-black border-l border-white/10 shadow-2xl z-50 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold tracking-widest uppercase text-white/70">Stats</h3>
                <button onClick={() => setShowStats(false)} className="text-white/40 hover:text-white transition-colors text-xs">Close</button>
              </div>

              {isGuest ? (
                <p className="text-xs text-white/40">Sign in to track your stats.</p>
              ) : profile ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-white/10 rounded p-3 text-center">
                      <p className="text-2xl font-mono text-white">{profile.wins}</p>
                      <p className="text-xs text-white/40 mt-1">Wins</p>
                    </div>
                    <div className="border border-white/10 rounded p-3 text-center">
                      <p className="text-2xl font-mono text-white">{profile.gamesPlayed}</p>
                      <p className="text-xs text-white/40 mt-1">Games</p>
                    </div>
                    <div className="border border-white/10 rounded p-3 text-center">
                      <p className="text-2xl font-mono text-white">{profile.winRate}%</p>
                      <p className="text-xs text-white/40 mt-1">Win Rate</p>
                    </div>
                    <div className="border border-white/10 rounded p-3 text-center">
                      <p className="text-2xl font-mono text-white">{(() => { const idx = (leaderboard || []).findIndex(l => l.name === profile.displayName); return idx >= 0 ? idx + 1 : '—'; })()}</p>
                      <p className="text-xs text-white/40 mt-1">Rank</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold tracking-widest uppercase text-white/40">Leaderboard</h4>
                    <button onClick={async () => {
                      if (!profile) return;
                      try { await toggleVisibility({ visible: !profile.leaderboardVisible }); } catch (e) { console.error('toggle failed:', e); }
                    }} className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors">
                      <span className="text-white/30">{profile.leaderboardVisible ? 'Visible' : 'Hidden'}</span>
                      <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${profile.leaderboardVisible ? 'bg-white/30' : 'bg-white/10'}`}>
                        <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white transform transition-transform ${profile.leaderboardVisible ? 'translate-x-3.5' : 'translate-x-1'}`} />
                      </span>
                    </button>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold tracking-widest uppercase text-white/40 mb-3">Leaderboard</h4>
                    <div className="space-y-2">
                      {(leaderboard || []).map((entry) => (
                        <div key={entry.rank} className={`flex items-center justify-between text-xs py-1.5 px-2 rounded ${entry.name === profile.displayName ? 'border border-white/20 text-white' : 'text-white/50'}`}>
                          <span className="flex items-center gap-2">
                            <span className="text-white/30 w-4">{entry.rank}</span>
                            <span>{friendlyName(entry.name)}</span>
                          </span>
                          <span className="font-mono">{entry.wins}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-white/40">Loading stats...</p>
              )}
            </div>
          </div>
        </>
      )}

      <div className="mt-12 text-xs text-neutral-600 text-center leading-relaxed relative z-10">
        <p>Arrow keys to move &middot; Up to rotate &middot; Space to drop</p>
        <p>2 min matches &middot; Last alive wins &middot; Overflow = DQ</p>
      </div>
      <a href="https://github.com/goldenpete/tetris-lakebed" target="_blank" rel="noopener noreferrer" className="mt-4 text-neutral-600 hover:text-neutral-400 transition-colors relative z-10">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.135-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.28-1.56 3.3-1.23 3.3-1.23.66 1.65.255 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
      </a>
    </div>
  );
}

function GamePage({ onLeave }: { onLeave: () => void }) {
  const serverGame = useQuery<GameView | null>("myGame");
  const myStatus = useQuery<{ status: 'idle' | 'searching' | 'in_game'; gameId: string | null }>("myStatus");
  const syncGame = useMutation<[{ gameId: string; boardJson: string; currentPieceJson: string; nextPiece: string; score: string; gameOver: boolean; disqualified: boolean }], void>("syncGameState");
  const endGame = useMutation<[string], void>("endGame");
  const returnToMenu = useMutation<[], void>("returnToMenu");

  // Keep mutations in refs so callbacks don't change on every render
  const syncGameRef = useRef(syncGame);
  syncGameRef.current = syncGame;
  const endGameRef = useRef(endGame);
  endGameRef.current = endGame;
  const returnToMenuRef = useRef(returnToMenu);
  returnToMenuRef.current = returnToMenu;
  // Local game state in ref (mutable, no closure staleness)
  const gs = useRef({
    board: null as (PieceType | null)[][] | null,
    piece: null as Piece | null,
    next: 'I' as PieceType,
    score: 0,
    gameOver: false,
    disqualified: false,
    initialized: false,
  });

  // Point gain popups
  const [popups, setPopups] = useState<{ id: number; text: string }[]>([]);
  const setPopupsRef = useRef(setPopups);
  setPopupsRef.current = setPopups;
  const popupId = useRef(0);
  const addPopup = (text: string) => {
    const id = popupId.current++;
    setPopupsRef.current(prev => [...prev, { id, text }]);
    setTimeout(() => {
      setPopupsRef.current(prev => prev.filter(p => p.id !== id));
    }, 1200);
  };

  // Render trigger
  const [, setTick] = useState(0);
  const render = () => setTick(t => t + 1);

  // Initialize from server when game starts
  const prevGameIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (serverGame?.id && serverGame.id !== prevGameIdRef.current) {
      gs.current.initialized = false;
      prevGameIdRef.current = serverGame.id;
    }
    if (serverGame?.id && !gs.current.initialized) {
      gs.current = {
        board: serverGame.myBoard,
        piece: serverGame.myCurrentPiece,
        next: serverGame.myNextPiece,
        score: serverGame.myScore,
        gameOver: serverGame.myGameOver,
        disqualified: serverGame.myDisqualified,
        initialized: true,
      };
      render();
    }
  }, [serverGame?.id]);

  // Sync helper
  const syncToServer = useCallback(() => {
    if (!serverGame?.id || serverGame?.status === 'finished') return;
    const g = gs.current;
    syncGameRef.current({
      gameId: serverGame.id,
      boardJson: JSON.stringify(g.board),
      currentPieceJson: g.piece ? JSON.stringify(g.piece) : '',
      nextPiece: g.next,
      score: String(g.score),
      gameOver: g.gameOver,
      disqualified: g.disqualified,
    }).catch(() => {});
  }, [serverGame?.id, serverGame?.status]);

  // Lock piece and spawn next
  const lockAndSpawn = useCallback(() => {
    const g = gs.current;
    if (!g.piece || !g.board) return;

    const newBoard = lockPiece(g.board, g.piece);
    const { board: clearedBoard, linesCleared } = clearLines(newBoard);
    const lineScore = calculateScore(linesCleared, 1);
    g.score += lineScore;
    if (linesCleared > 0) {
      const labels = ['', 'Single', 'Double', 'Triple', 'Tetris'];
      addPopup(`${labels[linesCleared]} +${lineScore}`);
    }
    g.board = clearedBoard;

    const disq = g.piece.y < 0;
    const newPiece = createPiece(g.next);
    const canSpawn = isValidMove(g.board, newPiece, 0, 0);

    if (!canSpawn || disq) {
      g.gameOver = true;
      g.disqualified = disq || !canSpawn;
      g.piece = null;
      render();
      syncToServer();
      return;
    }

    g.piece = newPiece;
    g.next = getRandomPieceType();
    render();
    syncToServer();
  }, [syncToServer]);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const g = gs.current;
      if (g.gameOver || !g.piece || !g.board) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (isValidMove(g.board, g.piece, -1, 0)) {
          g.piece = { ...g.piece, x: g.piece.x - 1 };
          render();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (isValidMove(g.board, g.piece, 1, 0)) {
          g.piece = { ...g.piece, x: g.piece.x + 1 };
          render();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newRot = (g.piece.rotation + 1) % 4;
        if (isValidMove(g.board, g.piece, 0, 0, newRot)) {
          g.piece = { ...g.piece, rotation: newRot, shape: getPieceShape(g.piece.type, newRot) };
          render();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (isValidMove(g.board, g.piece, 0, 1)) {
          g.piece = { ...g.piece, y: g.piece.y + 1 };
          render();
        } else {
          lockAndSpawn();
        }
      } else if (e.key === ' ') {
        e.preventDefault();
        const dropY = getDropY(g.board, g.piece);
        const bonus = (dropY - g.piece.y) * 2;
        g.score += bonus;
        if (bonus > 0) addPopup(`Hard Drop +${bonus}`);
        g.piece = { ...g.piece, y: dropY };
        render();
        lockAndSpawn();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lockAndSpawn]);

  // Auto-drop
  useEffect(() => {
    if (!serverGame?.id) return;
    const interval = setInterval(() => {
      const g = gs.current;
      if (g.gameOver || !g.piece || !g.board) return;

      if (isValidMove(g.board, g.piece, 0, 1)) {
        g.piece = { ...g.piece, y: g.piece.y + 1 };
        render();
      } else {
        lockAndSpawn();
      }
    }, 800);
    return () => clearInterval(interval);
  }, [serverGame?.id]);

  const lastServerGame = useRef<GameView | null>(null);
  if (serverGame) lastServerGame.current = serverGame;
  const sg = serverGame || lastServerGame.current;

  if (!sg) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-neutral-500 text-sm">Loading...</p></div>;

  const g = gs.current;
  const ghostY = g.piece && g.board ? getDropY(g.board, g.piece) : undefined;

  const serverFinishedGame = myStatus?.status === 'idle' && !!sg.id;
  if (serverFinishedGame) {
    g.gameOver = true;
  }

  if (sg.status === 'finished' || g.gameOver || serverFinishedGame) {
    const iWon = sg.status === 'finished' ? sg.won : !g.disqualified;
    const isDraw = sg.status === 'finished' ? sg.isDraw : false;
    const myScore = sg.status === 'finished' ? sg.myScore : g.score;

    if (sg.gameMode === 'battleRoyale') {
      const allPlayers = [
        { name: 'You', score: myScore, isMe: true },
        ...(sg.opponents || []).map(o => ({ name: o.name, score: o.score, isMe: false })),
      ];
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <h2 className={`text-3xl font-bold mb-6 ${iWon ? 'text-white' : 'text-red-400'}`}>
            {iWon ? 'You Win!' : 'Eliminated'}
          </h2>
          <div className="grid grid-cols-2 gap-6 mb-8">
            {allPlayers.map((p, i) => (
              <div key={i} className={`text-center ${p.isMe ? '' : 'text-neutral-400'}`}>
                <p className="text-xs text-neutral-500 mb-1">{friendlyName(p.name)}{p.isMe ? ' (You)' : ''}</p>
                <p className={`text-2xl font-mono ${p.isMe ? 'text-white' : 'text-neutral-400'}`}>{(p.score ?? 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
          <button onClick={() => { returnToMenuRef.current().catch(() => {}); onLeave(); }} className="px-6 py-2 bg-white text-black text-sm font-medium hover:bg-neutral-200 transition-all active:scale-95 active:translate-y-px active:shadow-inner">
            Back to Menu
          </button>
        </div>
      );
    }

    // 1v1 game over
    const opp = (sg.opponents || [])[0];
    const opponentScore = sg.status === 'finished' ? (opp?.score ?? 0) : 0;
    const opponentName = opp?.name ?? 'Opponent';

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <h2 className={`text-3xl font-bold mb-6 ${isDraw ? 'text-neutral-300' : iWon ? 'text-white' : 'text-neutral-500'}`}>
          {isDraw ? 'Draw' : iWon ? 'You Win' : 'You Lose'}
        </h2>
        <div className="flex gap-12 mb-8">
          <div className="text-center">
            <p className="text-xs text-neutral-500 mb-1">You</p>
            <p className="text-2xl font-mono">{(myScore ?? 0).toLocaleString()}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-neutral-500 mb-1">{friendlyName(opponentName)}</p>
            <p className="text-2xl font-mono text-neutral-400">{(opponentScore ?? 0).toLocaleString()}</p>
          </div>
        </div>
        <button onClick={() => { returnToMenuRef.current().catch(() => {}); onLeave(); }} className="px-6 py-2 bg-white text-black text-sm font-medium hover:bg-neutral-200 transition-all active:scale-95 active:translate-y-px active:shadow-inner">
          Back to Menu
        </button>
      </div>
    );
  }

  const opponents = sg.opponents || [];
  const isBattleRoyale = sg.gameMode === 'battleRoyale';
  const aliveOpponents = opponents.filter(o => !o.gameOver && !o.disqualified).length;

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center justify-between w-full max-w-3xl mb-4">
        <div className="text-sm text-neutral-400">
          {isBattleRoyale ? (
            <span><span className="text-neutral-200">Battle Royale</span> <span className="text-neutral-500">({aliveOpponents} alive)</span></span>
          ) : (
            <span>vs <span className="text-neutral-200">{friendlyName(opponents[0]?.name)}</span>{opponents[0]?.disqualified && <span className="text-red-400 ml-1">(DQ)</span>}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Timer startedAt={sg.startedAt} onExpire={() => {
            if (!g.gameOver && sg.id) {
              gs.current.gameOver = true;
              render();
              endGameRef.current(sg.id).catch(() => {});
            }
          }} />
          <button onClick={() => { gs.current.gameOver = true; gs.current.disqualified = true; render(); syncToServer(); returnToMenuRef.current().catch(() => {}); }} className="text-xs text-neutral-500 hover:text-red-400 transition-all active:scale-95 active:translate-y-px">
            Quit
          </button>
        </div>
      </div>

      {isBattleRoyale ? (
        <div className="flex gap-2 items-start justify-center">
          <div className="flex gap-2 shrink-0">
            <PlayerBoard board={g.board} currentPiece={g.piece} ghostY={ghostY} playerName="You" score={g.score} disqualified={g.disqualified} width={210} />
            <div className="flex flex-col gap-3">
              <NextPiece piece={g.next} />
              <div className="text-xs text-neutral-500 leading-relaxed">
                <p className="text-neutral-400 mb-1">Controls</p>
                <p>&larr; &rarr; Move</p>
                <p>&uarr; Rotate</p>
                <p>&darr; Soft Drop</p>
                <p>Space Hard Drop</p>
              </div>
            </div>
          </div>
          {opponents.map((opp, i) => (
            <div key={i} className="shrink-0">
              <PlayerBoard board={opp.board} playerName={friendlyName(opp.name)} score={opp.score} isOpponent disqualified={opp.disqualified} eliminated={opp.gameOver || opp.disqualified} width={210} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6 items-start">
          <div className="flex gap-4">
            <PlayerBoard board={g.board} currentPiece={g.piece} ghostY={ghostY} playerName="You" score={g.score} disqualified={g.disqualified} />
            <div className="flex flex-col gap-3">
              <NextPiece piece={g.next} />
              <div className="text-xs text-neutral-500 leading-relaxed">
                <p className="text-neutral-400 mb-1">Controls</p>
                <p>&larr; &rarr; Move</p>
                <p>&uarr; Rotate</p>
                <p>&darr; Soft Drop</p>
                <p>Space Hard Drop</p>
              </div>
            </div>
          </div>
          <div className="hidden md:block">
            {opponents[0] && (
              <PlayerBoard board={opponents[0].board} playerName={friendlyName(opponents[0].name)} score={opponents[0].score} isOpponent disqualified={opponents[0].disqualified} />
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mt-4 justify-center min-h-[28px]">
        {popups.map(p => (
          <span key={p.id} className="text-sm text-white font-semibold font-mono animate-pulse">{p.text}</span>
        ))}
      </div>
    </div>
  );
}

export function App() {
  const auth = useAuth();
  const myStatus = useQuery<{ status: 'idle' | 'searching' | 'in_game'; gameId: string | null }>("myStatus");

  const lastGameIdRef = useRef<string | null>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const currentId = myStatus?.gameId || null;
    if (currentId) {
      lastGameIdRef.current = currentId;
      setDismissed(false);
    }
  }, [myStatus?.gameId]);

  useEffect(() => {
    if (!showProfileMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showProfileMenu]);

  const inGame = myStatus?.status === 'in_game' && myStatus?.gameId;
  const showGamePage = inGame || (!dismissed && !!lastGameIdRef.current);

  const pageElement = showGamePage
    ? <GamePage onLeave={() => { setDismissed(true); lastGameIdRef.current = null; }} />
    : <MenuPage />;

  return (
    <Router>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@700&display=swap'); @keyframes fall { from { transform: translateY(0); opacity: 0.12; } to { transform: translateY(200vh); opacity: 0; } }`}</style>
      <div className="min-h-screen bg-black text-white">
        <header className="border-b border-neutral-800">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center">
            <div className="flex-1">
              <span className="font-bold text-sm tracking-tight" style={{ fontFamily: "'Merriweather', serif" }}>Tetris</span>
            </div>
            <div className="flex-1 text-center">
              <a href="https://lakebed.dev/" target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-500">
                Powered by <span className="text-neutral-400 hover:text-white transition-colors">Lakebed</span>
              </a>
            </div>
            <div className="flex-1 flex justify-end items-center gap-3">
              {!auth.isLoading && auth.isGuest ? (
                <SignInWithGoogle className="flex items-center gap-1.5 pl-1.5 pr-3 h-7 rounded-full border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 hover:border-neutral-700 transition-colors cursor-pointer">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </span>
                  <span className="text-xs text-neutral-400 hidden sm:inline">Sign in with Google</span>
                </SignInWithGoogle>
              ) : !auth.isLoading ? (
                <div ref={profileMenuRef} className="relative">
                  <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="flex items-center gap-1.5 pl-1.5 pr-1 h-7 rounded-full border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 transition-colors">
                    <img alt="" className="h-5 w-5 rounded-full bg-neutral-800 object-cover" referrerPolicy="no-referrer" src={auth.picture || ''} />
                    <span className="text-xs text-neutral-400 hidden sm:inline pr-0.5">{friendlyName(auth.displayName)}</span>
                  </button>
                  {showProfileMenu && (
                    <div className="absolute right-0 top-full mt-2 w-36 bg-black border border-white/10 rounded shadow-lg overflow-hidden z-50">
                      <button onClick={() => { setShowSettings(true); setShowProfileMenu(false); }} className="flex items-center gap-2 w-full text-left px-4 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        Settings
                      </button>
                      <button onClick={() => { signOut(); setShowProfileMenu(false); }} className="flex items-center gap-2 w-full text-left px-4 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={pageElement} />
            <Route path="*" element={<MenuPage />} />
          </Routes>
        </main>

        {showSettings && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-black border border-white/20 rounded p-4 flex flex-col items-center gap-4 max-w-lg w-full mx-4 shadow-2xl">
              <div className="flex items-center justify-between w-full">
                <p className="text-white font-medium text-sm">Settings</p>
                <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white transition-colors text-xs">Close</button>
              </div>
              <div className="w-full aspect-video">
                <iframe
                  className="w-full h-full rounded"
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1"
                  title="Settings"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Router>
  );
}
