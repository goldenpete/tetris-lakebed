import { boolean, capsule, mutation, query, string, table } from "lakebed/server";
import { createEmptyBoard, getRandomPieceType, createPiece } from "../shared/tetris";

function normalizeName(name: string): string {
  if (!name || name === 'Local') return 'Guest';
  return name;
}

export default capsule({
  name: "tetris-v2",

  schema: {
    // Player profiles and status
    players: table({
      userId: string(),
      displayName: string(),
      isGuest: boolean().default(true),
      status: string(), // 'idle', 'searching', 'in_game'
      currentGameId: string().default(''),
      wins: string(),
    }),

    // Matchmaking queues
    queue: table({
      userId: string(),
      displayName: string(),
      isGuest: boolean().default(true),
    }),

    battleRoyaleQueue: table({
      userId: string(),
      displayName: string(),
      isGuest: boolean().default(true),
    }),

    // Active and completed games
    games: table({
      gameMode: string().default('1v1'),
      player1Id: string(),
      player2Id: string(),
      player1Name: string(),
      player2Name: string(),
      player1Score: string(),
      player2Score: string(),
      player1Board: string(), // JSON
      player2Board: string(), // JSON
      player1CurrentPiece: string().default(''), // JSON
      player2CurrentPiece: string().default(''), // JSON
      player1NextPiece: string(),
      player2NextPiece: string(),
      player1GameOver: boolean().default(false),
      player2GameOver: boolean().default(false),
      player1Disqualified: boolean().default(false),
      player2Disqualified: boolean().default(false),
      player3Id: string().default(''),
      player3Name: string().default(''),
      player3Score: string().default('0'),
      player3Board: string().default(''),
      player3CurrentPiece: string().default(''),
      player3NextPiece: string().default(''),
      player3GameOver: boolean().default(false),
      player3Disqualified: boolean().default(false),
      player4Id: string().default(''),
      player4Name: string().default(''),
      player4Score: string().default('0'),
      player4Board: string().default(''),
      player4CurrentPiece: string().default(''),
      player4NextPiece: string().default(''),
      player4GameOver: boolean().default(false),
      player4Disqualified: boolean().default(false),
      startedAt: string(),
      endedAt: string().default(''),
      winnerId: string().default(''),
      status: string(), // 'active', 'finished'
    }),
  },

  queries: {
    // Get current player's profile and wins
    myProfile: query((ctx) => {
      const players = ctx.db.players.where("userId", ctx.auth.userId).all();
      const player = players[0];
      return player ? { wins: parseInt(player.wins || '0'), displayName: player.displayName } : null;
    }),

    // Get current player's status and active game
    myStatus: query((ctx) => {
      const players = ctx.db.players.where("userId", ctx.auth.userId).all();
      const player = players[0];
      if (!player) return { status: 'idle', gameId: '' };
      return { status: player.status, gameId: player.currentGameId };
    }),

    // Get players in queue
    queuePlayers: query((ctx) => {
      return ctx.db.queue.all().map(q => q.displayName);
    }),

    // Get players in battle royale queue
    battleRoyaleQueuePlayers: query((ctx) => {
      return ctx.db.battleRoyaleQueue.all().map(q => q.displayName);
    }),

    // Get active game for current player
    myGame: query((ctx) => {
      const players = ctx.db.players.where("userId", ctx.auth.userId).all();
      const player = players[0];
      if (!player?.currentGameId) return null;

      const games = ctx.db.games.where("id", player.currentGameId).all();
      const game = games[0];
      if (!game) return null;

      let myNum = 0;
      if (game.player1Id === ctx.auth.userId) myNum = 1;
      else if (game.player2Id === ctx.auth.userId) myNum = 2;
      else if (game.player3Id === ctx.auth.userId) myNum = 3;
      else if (game.player4Id === ctx.auth.userId) myNum = 4;

      if (myNum === 0) return null;

      const playerFields = [
        { id: game.player1Id, name: game.player1Name, score: game.player1Score, board: game.player1Board, currentPiece: game.player1CurrentPiece, nextPiece: game.player1NextPiece, gameOver: game.player1GameOver, disqualified: game.player1Disqualified },
        { id: game.player2Id, name: game.player2Name, score: game.player2Score, board: game.player2Board, currentPiece: game.player2CurrentPiece, nextPiece: game.player2NextPiece, gameOver: game.player2GameOver, disqualified: game.player2Disqualified },
        { id: game.player3Id, name: game.player3Name, score: game.player3Score, board: game.player3Board, currentPiece: game.player3CurrentPiece, nextPiece: game.player3NextPiece, gameOver: game.player3GameOver, disqualified: game.player3Disqualified },
        { id: game.player4Id, name: game.player4Name, score: game.player4Score, board: game.player4Board, currentPiece: game.player4CurrentPiece, nextPiece: game.player4NextPiece, gameOver: game.player4GameOver, disqualified: game.player4Disqualified },
      ];

      const me = playerFields[myNum - 1];
      const opponents = playerFields
        .filter((_, i) => i !== myNum - 1)
        .filter(p => p.id && p.id !== 'bot')
        .map(p => ({
          id: p.id,
          name: p.name,
          score: parseInt(p.score || '0'),
          board: p.board ? JSON.parse(p.board) : createEmptyBoard(),
          currentPiece: p.currentPiece ? JSON.parse(p.currentPiece) : null,
          nextPiece: p.nextPiece,
          gameOver: p.gameOver,
          disqualified: p.disqualified,
        }));

      return {
        id: game.id,
        gameMode: game.gameMode || '1v1',
        myPlayerNum: myNum,
        myScore: parseInt(me.score || '0'),
        myBoard: me.board ? JSON.parse(me.board) : createEmptyBoard(),
        myCurrentPiece: me.currentPiece ? JSON.parse(me.currentPiece) : null,
        myNextPiece: me.nextPiece,
        myGameOver: me.gameOver,
        myDisqualified: me.disqualified,
        opponents,
        startedAt: parseInt(game.startedAt),
        endedAt: game.endedAt,
        winnerId: game.winnerId,
        status: game.status,
        won: game.winnerId === ctx.auth.userId,
        isDraw: game.winnerId === '',
      };
    }),

    // Get game result after it ends
    gameResult: query((ctx, gameId: string) => {
      const games = ctx.db.games.where("id", gameId).all();
      const game = games[0];
      if (!game || game.status !== 'finished') return null;

      let myNum = 0;
      if (game.player1Id === ctx.auth.userId) myNum = 1;
      else if (game.player2Id === ctx.auth.userId) myNum = 2;
      else if (game.player3Id === ctx.auth.userId) myNum = 3;
      else if (game.player4Id === ctx.auth.userId) myNum = 4;

      const playerFields = [
        { id: game.player1Id, score: game.player1Score, name: game.player1Name },
        { id: game.player2Id, score: game.player2Score, name: game.player2Name },
        { id: game.player3Id, score: game.player3Score, name: game.player3Name },
        { id: game.player4Id, score: game.player4Score, name: game.player4Name },
      ];

      const me = playerFields[myNum - 1] || playerFields[0];
      const opponents = playerFields
        .filter((_, i) => i !== myNum - 1)
        .filter(p => p.id && p.id !== 'bot')
        .map(p => ({ score: parseInt(p.score || '0'), name: p.name }));

      return {
        myScore: parseInt(me.score || '0'),
        opponentScore: opponents[0] ? opponents[0].score : 0,
        opponentName: opponents[0] ? opponents[0].name : 'Opponent',
        won: game.winnerId === ctx.auth.userId,
        isDraw: game.winnerId === '',
      };
    }),
  },

  mutations: {
    // Join matchmaking queue
    joinQueue: mutation((ctx) => {
      const players = ctx.db.players.where("userId", ctx.auth.userId).all();
      const existing = players[0];
      
      if (!existing) {
        ctx.db.players.insert({
          userId: ctx.auth.userId,
          displayName: normalizeName(ctx.auth.displayName),
          isGuest: ctx.auth.isGuest,
          status: 'searching',
          currentGameId: '',
          wins: '0',
        });
      } else {
        ctx.db.players.update(existing.id, {
          status: 'searching',
          currentGameId: '',
        });
      }

      // Remove from queue if already there
      const queueExisting = ctx.db.queue.where("userId", ctx.auth.userId).all()[0];
      if (queueExisting) {
        ctx.db.queue.delete(queueExisting.id);
      }
      
      // Add to queue
      ctx.db.queue.insert({
        userId: ctx.auth.userId,
        displayName: normalizeName(ctx.auth.displayName),
        isGuest: ctx.auth.isGuest,
      });

      // Try to match players
      const queue = ctx.db.queue.orderBy("createdAt", "asc").all();
      if (queue.length >= 2) {
        const player1 = queue[0];
        let player2 = null;
        for (let i = 1; i < queue.length; i++) {
          if (queue[i].userId !== player1.userId) {
            player2 = queue[i];
            break;
          }
        }
        if (!player2) return;

        // Remove both from queue
        ctx.db.queue.delete(player1.id);
        ctx.db.queue.delete(player2.id);

        // Create game
        const nextPiece1 = getRandomPieceType();
        const nextPiece2 = getRandomPieceType();
        const currentPiece1 = createPiece(getRandomPieceType());
        const currentPiece2 = createPiece(getRandomPieceType());

        const game = ctx.db.games.insert({
          gameMode: '1v1',
          player1Id: player1.userId,
          player2Id: player2.userId,
          player1Name: player1.displayName,
          player2Name: player2.displayName,
          player1Score: '0',
          player2Score: '0',
          player1Board: JSON.stringify(createEmptyBoard()),
          player2Board: JSON.stringify(createEmptyBoard()),
          player1CurrentPiece: JSON.stringify(currentPiece1),
          player2CurrentPiece: JSON.stringify(currentPiece2),
          player1NextPiece: nextPiece1,
          player2NextPiece: nextPiece2,
          player1GameOver: false,
          player2GameOver: false,
          player1Disqualified: false,
          player2Disqualified: false,
          startedAt: String(Date.now()),
          endedAt: '',
          winnerId: '',
          status: 'active',
        });

        // Update player statuses
        const p1Players = ctx.db.players.where("userId", player1.userId).all();
        const p1 = p1Players[0];
        if (p1) {
          ctx.db.players.update(p1.id, {
            status: 'in_game',
            currentGameId: game.id,
          });
        }
        const p2Players = ctx.db.players.where("userId", player2.userId).all();
        const p2 = p2Players[0];
        if (p2) {
          ctx.db.players.update(p2.id, {
            status: 'in_game',
            currentGameId: game.id,
          });
        }
      }
    }),

    // Leave queue
    leaveQueue: mutation((ctx) => {
      const queueItems = ctx.db.queue.where("userId", ctx.auth.userId).all();
      const queueItem = queueItems[0];
      if (queueItem) {
        ctx.db.queue.delete(queueItem.id);
      }
      const brQueueItems = ctx.db.battleRoyaleQueue.where("userId", ctx.auth.userId).all();
      const brQueueItem = brQueueItems[0];
      if (brQueueItem) {
        ctx.db.battleRoyaleQueue.delete(brQueueItem.id);
      }
      const players = ctx.db.players.where("userId", ctx.auth.userId).all();
      const player = players[0];
      if (player) {
        ctx.db.players.update(player.id, { status: 'idle' });
      }
    }),

    // End game by time limit
    endGame: mutation((ctx, gameId: string) => {
      const games = ctx.db.games.where("id", gameId).all();
      const game = games[0];
      if (!game || game.status !== 'active') return;
      finishGame(ctx, game);
    }),

    // Sync full game state from client (client runs game loop locally)
    syncGameState: mutation((ctx, args: {
      gameId: string;
      boardJson: string;
      currentPieceJson: string;
      nextPiece: string;
      score: string;
      gameOver: boolean;
      disqualified: boolean;
    }) => {
      const games = ctx.db.games.where("id", args.gameId).all();
      const game = games[0];
      if (!game || game.status !== 'active') return;

      let myNum = 0;
      if (game.player1Id === ctx.auth.userId) myNum = 1;
      else if (game.player2Id === ctx.auth.userId) myNum = 2;
      else if (game.player3Id === ctx.auth.userId) myNum = 3;
      else if (game.player4Id === ctx.auth.userId) myNum = 4;

      if (myNum === 0) return;

      const updates: any = {};
      const prefix = `player${myNum}`;
      updates[`${prefix}Board`] = args.boardJson;
      updates[`${prefix}CurrentPiece`] = args.currentPieceJson;
      updates[`${prefix}NextPiece`] = args.nextPiece;
      updates[`${prefix}Score`] = args.score;
      updates[`${prefix}GameOver`] = args.gameOver;
      updates[`${prefix}Disqualified`] = args.disqualified;

      ctx.db.games.update(game.id, updates);

      // Check for game end
      const isBattleRoyale = game.gameMode === 'battleRoyale' || (game.player3Id && game.player3Id !== '' && game.player4Id && game.player4Id !== '');
      if (isBattleRoyale) {
        const playerAlive = [
          { id: game.player1Id, dead: game.player1GameOver || game.player1Disqualified },
          { id: game.player2Id, dead: game.player2GameOver || game.player2Disqualified },
          { id: game.player3Id, dead: game.player3GameOver || game.player3Disqualified },
          { id: game.player4Id, dead: game.player4GameOver || game.player4Disqualified },
        ];
        playerAlive[myNum - 1].dead = args.gameOver || args.disqualified;
        const aliveCount = playerAlive.filter(p => p.id && p.id !== 'bot' && !p.dead).length;
        if (aliveCount <= 1) {
          finishGame(ctx, game);
        }
      } else {
        const opponentGameOver = myNum === 1 ? game.player2GameOver : game.player1GameOver;
        if (args.gameOver || opponentGameOver) {
          finishGame(ctx, game);
        }
      }
    }),

    // Join battle royale queue
    joinBattleRoyaleQueue: mutation((ctx) => {
      const players = ctx.db.players.where("userId", ctx.auth.userId).all();
      const existing = players[0];

      if (!existing) {
        ctx.db.players.insert({
          userId: ctx.auth.userId,
          displayName: normalizeName(ctx.auth.displayName),
          isGuest: ctx.auth.isGuest,
          status: 'searching',
          currentGameId: '',
          wins: '0',
        });
      } else {
        ctx.db.players.update(existing.id, {
          status: 'searching',
          currentGameId: '',
        });
      }

      // Remove from BR queue if already there
      const brQueueExisting = ctx.db.battleRoyaleQueue.where("userId", ctx.auth.userId).all()[0];
      if (brQueueExisting) {
        ctx.db.battleRoyaleQueue.delete(brQueueExisting.id);
      }

      // Add to BR queue
      ctx.db.battleRoyaleQueue.insert({
        userId: ctx.auth.userId,
        displayName: normalizeName(ctx.auth.displayName),
        isGuest: ctx.auth.isGuest,
      });

      // Try to match 4 players
      const queue = ctx.db.battleRoyaleQueue.orderBy("createdAt", "asc").all();
      if (queue.length >= 4) {
        const selected = [queue[0]];
        for (let i = 1; i < queue.length && selected.length < 4; i++) {
          if (!selected.find(s => s.userId === queue[i].userId)) {
            selected.push(queue[i]);
          }
        }
        if (selected.length < 4) return;

        // Remove all 4 from queue
        for (const s of selected) {
          ctx.db.battleRoyaleQueue.delete(s.id);
        }

        // Create game
        const pieces = [];
        for (let i = 0; i < 4; i++) {
          pieces.push({ current: createPiece(getRandomPieceType()), next: getRandomPieceType() });
        }

        const game = ctx.db.games.insert({
          gameMode: 'battleRoyale',
          player1Id: selected[0].userId,
          player2Id: selected[1].userId,
          player3Id: selected[2].userId,
          player4Id: selected[3].userId,
          player1Name: selected[0].displayName,
          player2Name: selected[1].displayName,
          player3Name: selected[2].displayName,
          player4Name: selected[3].displayName,
          player1Score: '0',
          player2Score: '0',
          player3Score: '0',
          player4Score: '0',
          player1Board: JSON.stringify(createEmptyBoard()),
          player2Board: JSON.stringify(createEmptyBoard()),
          player3Board: JSON.stringify(createEmptyBoard()),
          player4Board: JSON.stringify(createEmptyBoard()),
          player1CurrentPiece: JSON.stringify(pieces[0].current),
          player2CurrentPiece: JSON.stringify(pieces[1].current),
          player3CurrentPiece: JSON.stringify(pieces[2].current),
          player4CurrentPiece: JSON.stringify(pieces[3].current),
          player1NextPiece: pieces[0].next,
          player2NextPiece: pieces[1].next,
          player3NextPiece: pieces[2].next,
          player4NextPiece: pieces[3].next,
          player1GameOver: false,
          player2GameOver: false,
          player3GameOver: false,
          player4GameOver: false,
          player1Disqualified: false,
          player2Disqualified: false,
          player3Disqualified: false,
          player4Disqualified: false,
          startedAt: String(Date.now()),
          endedAt: '',
          winnerId: '',
          status: 'active',
        });

        // Update all 4 players
        for (const s of selected) {
          const p = ctx.db.players.where("userId", s.userId).all()[0];
          if (p) {
            ctx.db.players.update(p.id, {
              status: 'in_game',
              currentGameId: game.id,
            });
          }
        }
      }
    }),

    // Return to menu after game
    returnToMenu: mutation((ctx) => {
      const players = ctx.db.players.where("userId", ctx.auth.userId).all();
      const player = players[0];
      if (player) {
        ctx.db.players.update(player.id, {
          status: 'idle',
          currentGameId: '',
        });
      }
    }),
  },
});

function finishGame(ctx: any, game: any) {
  if (game.status === 'finished') return;

  const now = Date.now();
  const startedAt = parseInt(game.startedAt || '0');
  if (now - startedAt < 5000) return; // Minimum 5 second game duration

  let winnerId = '';

  const isBattleRoyale = game.gameMode === 'battleRoyale' || (game.player3Id && game.player3Id !== '' && game.player4Id && game.player4Id !== '');
  if (isBattleRoyale) {
    const players = [
      { id: game.player1Id, dead: game.player1GameOver || game.player1Disqualified, score: parseInt(game.player1Score || '0') },
      { id: game.player2Id, dead: game.player2GameOver || game.player2Disqualified, score: parseInt(game.player2Score || '0') },
      { id: game.player3Id, dead: game.player3GameOver || game.player3Disqualified, score: parseInt(game.player3Score || '0') },
      { id: game.player4Id, dead: game.player4GameOver || game.player4Disqualified, score: parseInt(game.player4Score || '0') },
    ].filter(p => p.id && p.id !== 'bot');

    const alive = players.filter(p => !p.dead);

    if (alive.length === 1) {
      winnerId = alive[0].id;
    } else if (alive.length === 0) {
      winnerId = ''; // Draw
    } else {
      // Timer expired, multiple alive - highest score wins
      alive.sort((a, b) => b.score - a.score);
      winnerId = alive[0].id;
    }
  } else {
    // 1v1 logic
    const p1Disq = game.player1Disqualified;
    const p2Disq = game.player2Disqualified;
    const p1Score = parseInt(game.player1Score || '0');
    const p2Score = parseInt(game.player2Score || '0');

    if (p1Disq && !p2Disq) {
      winnerId = game.player2Id;
    } else if (p2Disq && !p1Disq) {
      winnerId = game.player1Id;
    } else if (p1Disq && p2Disq) {
      winnerId = '';
    } else if (p1Score > p2Score) {
      winnerId = game.player1Id;
    } else if (p2Score > p1Score) {
      winnerId = game.player2Id;
    } else {
      winnerId = '';
    }
  }

  // Update game
  ctx.db.games.update(game.id, {
    winnerId: winnerId,
    endedAt: String(now),
    status: 'finished',
  });

  // Update all player statuses
  const allPlayerIds = [game.player1Id, game.player2Id, game.player3Id, game.player4Id].filter(id => id && id !== 'bot');
  for (const pid of allPlayerIds) {
    const p = ctx.db.players.where("userId", pid).all()[0];
    if (p) {
      ctx.db.players.update(p.id, {
        status: 'idle',
        currentGameId: '',
      });
    }
  }

  // Record win for logged-in players only
  if (winnerId) {
    const winners = ctx.db.players.where("userId", winnerId).all();
    const winner = winners[0];
    if (winner && !winner.isGuest) {
      ctx.db.players.update(winner.id, {
        wins: String(parseInt(winner.wins || '0') + 1),
      });
    }
  }
}

