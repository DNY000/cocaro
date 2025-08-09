// caro-core.js
// Board coordinates: 0..N-1

export const EMPTY = 0;
export const P1 = 1;
export const P2 = 2;

export class CaroGame {
  constructor(N = 20, locks = [], options = {}) {
    this.N = N;
    this.board = Array.from({ length: N }, () => Array(N).fill(EMPTY));
    // locks: array of {r,c} centers
    this.locks = locks.slice();
    // options
    // requiredOpenEnds: 0 (no requirement), 1 (>=1 open end), 2 (both ends open)
    this.requiredOpenEnds = options.requiredOpenEnds ?? 1;
    // if true, the first player must play adjacent to a lock when locks exist
    this.firstMoveConstrained = options.firstMoveConstrained ?? true;
    this.currentPlayer = P1;
    this.moveCount = 0;
    this.winner = null;
  }

  // helper: is inside board
  inBounds(r, c) {
    return r >= 0 && r < this.N && c >= 0 && c < this.N;
  }

  // returns array of cells that are considered 'adjacent' to any lock center (Chebyshev dist <=1)
  getAllowedFirstMoveCellsAroundLocks() {
    const set = new Set();
    for (const { r: lr, c: lc } of this.locks) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = lr + dr,
            nc = lc + dc;
          if (!this.inBounds(nr, nc)) continue;
          // optionally skip the center itself if you want to forbid placing on center
          // if (dr === 0 && dc === 0) continue;
          set.add(`${nr},${nc}`);
        }
      }
    }
    return Array.from(set).map((s) => s.split(',').map(Number));
  }

  // check if cell is placeable (not occupied)
  isCellEmpty(r, c) {
    return this.inBounds(r, c) && this.board[r][c] === EMPTY;
  }

  // Attempt to place a stone. Returns {ok: boolean, reason?:string}
  place(r, c) {
    if (!this.inBounds(r, c)) return { ok: false, reason: 'OOB' };
    if (!this.isCellEmpty(r, c)) return { ok: false, reason: 'Not empty' };

    // enforce first-move constraint if needed
    if (this.moveCount === 0 && this.firstMoveConstrained && this.locks.length > 0) {
      const allowed = new Set(this.getAllowedFirstMoveCellsAroundLocks().map((a) => `${a[0]},${a[1]}`));
      if (!allowed.has(`${r},${c}`)) {
        return { ok: false, reason: 'First move must be adjacent to a lock' };
      }
    }

    this.board[r][c] = this.currentPlayer;
    this.moveCount++;
    // check victory
    if (this.checkWinFrom(r, c)) {
      this.winner = this.currentPlayer;
    } else {
      this.currentPlayer = this.currentPlayer === P1 ? P2 : P1;
    }
    return { ok: true };
  }

  // directions: [dr,dc] for 4 axes (count both sides)
  static DIRECTIONS = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  // Check win originating from last placed (r,c)
  checkWinFrom(r, c) {
    const player = this.board[r][c];
    if (player === EMPTY) return false;
    for (const [dr, dc] of CaroGame.DIRECTIONS) {
      // count contiguous including (r,c)
      let count = 1;
      // forward
      let fr = r + dr,
        fc = c + dc;
      while (this.inBounds(fr, fc) && this.board[fr][fc] === player) {
        count++;
        fr += dr;
        fc += dc;
      }
      // back
      let br = r - dr,
        bc = c - dc;
      while (this.inBounds(br, bc) && this.board[br][bc] === player) {
        count++;
        br -= dr;
        bc -= dc;
      }

      if (count >= 5) {
        // find cells just beyond the ends to determine open ends
        const end1_r = fr,
          end1_c = fc; // first empty or blocked in forward direction
        const end2_r = br,
          end2_c = bc; // first empty or blocked in backward direction

        const end1Open = this.inBounds(end1_r, end1_c) && this.board[end1_r][end1_c] === EMPTY;
        const end2Open = this.inBounds(end2_r, end2_c) && this.board[end2_r][end2_c] === EMPTY;
        const openEnds = (end1Open ? 1 : 0) + (end2Open ? 1 : 0);

        // victory decision by requiredOpenEnds param
        if (openEnds >= this.requiredOpenEnds) {
          return true;
        } else {
          // this sequence of >=5 exist but blocked on too many ends -> not win under current rule
          // continue check other directions (rare but safe)
        }
      }
    }
    return false;
  }

  // Utility: randomly place K lock centers (without duplicates)
  static randomLocks(N, K, forbidden = []) {
    const res = [];
    const used = new Set();
    for (const f of forbidden) used.add(`${f.r},${f.c}`);
    while (res.length < K) {
      const r = Math.floor(Math.random() * N);
      const c = Math.floor(Math.random() * N);
      const key = `${r},${c}`;
      if (used.has(key)) continue;
      res.push({ r, c });
      used.add(key);
    }
    return res;
  }

  // debug print board to console
  printBoard() {
    console.log(
      this.board
        .map((row) => row.map((v) => (v === EMPTY ? '.' : v === P1 ? 'X' : 'O')).join(' '))
        .join('\n')
    );
  }
}


