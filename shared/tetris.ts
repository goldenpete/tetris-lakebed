// Tetris types and shared game logic

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export const PIECES: Record<PieceType, number[][]> = {
  I: [[1, 1, 1, 1]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  Z: [[1, 1, 0], [0, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
};

export const COLORS: Record<PieceType | 'ghost', string> = {
  I: 'cyan',
  O: 'yellow',
  T: 'purple',
  S: 'green',
  Z: 'red',
  J: 'blue',
  L: 'orange',
  ghost: 'rgba(255,255,255,0.2)',
};

export interface Piece {
  type: PieceType;
  x: number;
  y: number;
  rotation: number;
  shape: number[][];
}

export interface GameState {
  board: (PieceType | null)[][];
  currentPiece: Piece | null;
  nextPiece: PieceType;
  score: number;
  lines: number;
  level: number;
  gameOver: boolean;
  disqualified: boolean;
}

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;
export const GAME_DURATION_MS = 2 * 60 * 1000; // 2 minutes

export function createEmptyBoard(): (PieceType | null)[][] {
  return Array(BOARD_HEIGHT).fill(null).map(() => Array(BOARD_WIDTH).fill(null));
}

export function getPieceShape(type: PieceType, rotation: number): number[][] {
  const baseShape = PIECES[type];
  let shape = baseShape;
  for (let i = 0; i < rotation % 4; i++) {
    shape = rotateMatrix(shape);
  }
  return shape;
}

function rotateMatrix(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated: number[][] = Array(cols).fill(null).map(() => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[c][rows - 1 - r] = matrix[r][c];
    }
  }
  return rotated;
}

export function getRandomPieceType(): PieceType {
  const types: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  return types[Math.floor(Math.random() * types.length)];
}

export function createPiece(type: PieceType): Piece {
  const shape = getPieceShape(type, 0);
  const spawnX = Math.floor((BOARD_WIDTH - shape[0].length) / 2);
  return {
    type,
    x: spawnX,
    y: 0,
    rotation: 0,
    shape,
  };
}

export function isValidMove(board: (PieceType | null)[][], piece: Piece, dx: number, dy: number, newRotation?: number): boolean {
  const shape = newRotation !== undefined ? getPieceShape(piece.type, newRotation) : piece.shape;
  const newX = piece.x + dx;
  const newY = piece.y + dy;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const boardX = newX + c;
        const boardY = newY + r;
        if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
          return false;
        }
        if (boardY >= 0 && board[boardY][boardX] !== null) {
          return false;
        }
      }
    }
  }
  return true;
}

export function lockPiece(board: (PieceType | null)[][], piece: Piece): (PieceType | null)[][] {
  const newBoard = board.map(row => [...row]);
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (piece.shape[r][c]) {
        const boardY = piece.y + r;
        const boardX = piece.x + c;
        if (boardY >= 0) {
          newBoard[boardY][boardX] = piece.type;
        }
      }
    }
  }
  return newBoard;
}

export function clearLines(board: (PieceType | null)[][]): { board: (PieceType | null)[][]; linesCleared: number } {
  const newBoard: (PieceType | null)[][] = [];
  let linesCleared = 0;

  for (let r = 0; r < board.length; r++) {
    if (board[r].every(cell => cell !== null)) {
      linesCleared++;
    } else {
      newBoard.push(board[r]);
    }
  }

  for (let i = newBoard.length; i < BOARD_HEIGHT; i++) {
    newBoard.unshift(Array(BOARD_WIDTH).fill(null));
  }

  return { board: newBoard, linesCleared };
}

export function calculateScore(linesCleared: number, level: number): number {
  const points = [0, 100, 300, 500, 800];
  return (points[linesCleared] || 0) * level;
}

export function getDropY(board: (PieceType | null)[][], piece: Piece): number {
  let dropY = piece.y;
  for (let testY = piece.y; testY < BOARD_HEIGHT; testY++) {
    if (isValidMove(board, piece, 0, testY - piece.y + 1)) {
      dropY = testY + 1;
    } else {
      break;
    }
  }
  return dropY;
}

// Matchmaking types
export type PlayerStatus = 'idle' | 'searching' | 'in_game';

export interface QueuePlayer {
  userId: string;
  displayName: string;
  isGuest: boolean;
  joinedAt: number;
}

export interface GameSession {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  player1Score: number;
  player2Score: number;
  player1Board: (PieceType | null)[][];
  player2Board: (PieceType | null)[][];
  player1GameOver: boolean;
  player2GameOver: boolean;
  player1Disqualified: boolean;
  player2Disqualified: boolean;
  startedAt: number;
  endedAt: number | null;
  winnerId: string | null;
}

// Database types (mirrors server schema)
export interface PlayerRecord {
  id: string;
  userId: string;
  displayName: string;
  isGuest: boolean;
  status: PlayerStatus;
  currentGameId: string | null;
  wins: number;
  updatedAt: string;
}

export interface GameRecord {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  player1Score: number;
  player2Score: number;
  player1GameOver: boolean;
  player2GameOver: boolean;
  player1Disqualified: boolean;
  player2Disqualified: boolean;
  startedAt: string;
  endedAt: string | null;
  winnerId: string | null;
  status: 'active' | 'finished';
}

export interface QueueRecord {
  id: string;
  userId: string;
  displayName: string;
  isGuest: boolean;
  joinedAt: string;
}
