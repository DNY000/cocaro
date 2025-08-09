import React, { useState } from "react";
import "@src/App.css";
import { EMPTY, P1, P2 } from "@src/caro-core";
import { GoogleSignInButton } from '@src/googleAuth';

const N = 20;

function randomLocks(N, count) {
  const res = [];
  const used = new Set();
  while (res.length < count) {
    const r = Math.floor(Math.random() * N);
    const c = Math.floor(Math.random() * N);
    const key = `${r},${c}`;
    if (used.has(key)) continue;
    used.add(key);
    res.push({ r, c });
  }
  return res;
}

function inBounds(r, c) {
  return r >= 0 && r < N && c >= 0 && c < N;
}

function getAllowedFirstMoveCellsAroundLocks(locks) {
  const set = new Set();
  for (const { r: lr, c: lc } of locks) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = lr + dr, nc = lc + dc;
        if (!inBounds(nr, nc)) continue;
        set.add(`${nr},${nc}`);
      }
    }
  }
  return Array.from(set).map(s => s.split(",").map(Number));
}

function App() {
  const [board, setBoard] = useState(Array.from({ length: N }, () => Array(N).fill(EMPTY)));
  const [locks, setLocks] = useState(randomLocks(N, 3));
  const [currentPlayer, setCurrentPlayer] = useState(P1);
  const [moveCount, setMoveCount] = useState(0);
  const [winner, setWinner] = useState(null);
  const [requiredOpenEnds, setRequiredOpenEnds] = useState(1); // 1 = chặn 1 đầu
  const [player1, setPlayer1] = useState({ name: 'Người chơi 1', avatar: '', logged: false });
  const [player2, setPlayer2] = useState({ name: 'Người chơi 2', avatar: '', logged: false });
  const allowedFirstCells = getAllowedFirstMoveCellsAroundLocks(locks);

  const handleLogin = (slot) => (profile) => {
    const p = {
      name: profile.name || 'Người chơi',
      avatar: profile.avatar || '',
      logged: true,
    };
    if (slot === 1) setPlayer1(p); else setPlayer2(p);
  };

  const logout = (slot) => {
    if (slot === 1) setPlayer1({ name: 'Người chơi 1', avatar: '', logged: false });
    else setPlayer2({ name: 'Người chơi 2', avatar: '', logged: false });
  };

  const handleClick = (r, c) => {
    if (winner) return;
    if (board[r][c] !== EMPTY) return;

    if (moveCount === 0 && locks.length > 0) {
      const allowedSet = new Set(allowedFirstCells.map(a => `${a[0]},${a[1]}`));
      if (!allowedSet.has(`${r},${c}`)) {
        alert("Nước đầu phải đánh xung quanh ô khóa!");
        return;
      }
    }

    const newBoard = board.map(row => [...row]);
    newBoard[r][c] = currentPlayer;
    setBoard(newBoard);
    setMoveCount(moveCount + 1);

    if (checkWin(newBoard, r, c, currentPlayer, requiredOpenEnds)) {
      setWinner(currentPlayer);
    } else {
      setCurrentPlayer(currentPlayer === P1 ? P2 : P1);
    }
  };

  const resetGame = () => {
    setBoard(Array.from({ length: N }, () => Array(N).fill(EMPTY)));
    setLocks(randomLocks(N, 3));
    setCurrentPlayer(P1);
    setMoveCount(0);
    setWinner(null);
  };

  return (
    <div className="game">
      <h1>Cờ Caro — Luật chặn {requiredOpenEnds} đầu</h1>
      <div className="top-bar">
        <div className="player-panel">
          <div className="avatar" style={{backgroundImage: player1.avatar ? `url(${player1.avatar})` : 'none'}}>
            {!player1.avatar && <span>P1</span>}
          </div>
          <div className="info">
            <div className="name">{player1.name}</div>
            {!player1.logged ? (
              <GoogleSignInButton onProfile={handleLogin(1)} />
            ) : (
              <button className="btn" onClick={() => logout(1)}>Đăng xuất</button>
            )}
          </div>
        </div>

        <div className="controls">
          <label>Luật thắng: </label>
          <select value={requiredOpenEnds} onChange={e => setRequiredOpenEnds(Number(e.target.value))}>
            <option value={0}>Không chặn</option>
            <option value={1}>Chặn 1 đầu</option>
            <option value={2}>Chặn 2 đầu</option>
          </select>
          <button className="btn" onClick={resetGame}>Chơi lại</button>
        </div>

        <div className="player-panel">
          <div className="avatar" style={{backgroundImage: player2.avatar ? `url(${player2.avatar})` : 'none'}}>
            {!player2.avatar && <span>P2</span>}
          </div>
          <div className="info">
            <div className="name">{player2.name}</div>
            {!player2.logged ? (
              <GoogleSignInButton onProfile={handleLogin(2)} />
            ) : (
              <button className="btn" onClick={() => logout(2)}>Đăng xuất</button>
            )}
          </div>
        </div>
      </div>

      {winner && (
        <div className="modal-backdrop" onClick={() => setWinner(null)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-title">🎉 Chiến thắng!</div>
            <div className="modal-body">Người chơi {winner} thắng!</div>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setWinner(null); resetGame(); }}>Chơi lại</button>
              <button className="btn" onClick={() => setWinner(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      <div className="board-wrapper">
        <div className="board">
          {board.map((row, r) => (
            <div key={r} className="row">
              {row.map((cell, c) => {
                const isLockCenter = locks.some(l => l.r === r && l.c === c);
                const isLockRadius = allowedFirstCells.some(([rr, cc]) => rr === r && cc === c);
                let cellClass = "cell";
                if (isLockCenter) cellClass += " lock-center";
                else if (isLockRadius) cellClass += " lock-radius";
                if (cell === P1) cellClass += " p1";
                if (cell === P2) cellClass += " p2";
                const idx = r * N + (c + 1);
                return (
                  <div
                    key={c}
                    className={cellClass}
                    onClick={() => handleClick(r, c)}
                  >
                    <span className="cell-idx">{idx}</span>
                    <span className="stone">{cell === P1 ? "X" : cell === P2 ? "O" : ""}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Kiểm tra thắng
function checkWin(board, r, c, player, requiredOpenEnds) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    let fr = r + dr, fc = c + dc;
    while (inBounds(fr, fc) && board[fr][fc] === player) {
      count++; fr += dr; fc += dc;
    }
    let br = r - dr, bc = c - dc;
    while (inBounds(br, bc) && board[br][bc] === player) {
      count++; br -= dr; bc -= dc;
    }
    if (count >= 5) {
      const end1Open = inBounds(fr, fc) && board[fr][fc] === EMPTY;
      const end2Open = inBounds(br, bc) && board[br][bc] === EMPTY;
      const openEnds = (end1Open ? 1 : 0) + (end2Open ? 1 : 0);
      if (openEnds >= requiredOpenEnds) {
        return true;
      }
    }
  }
  return false;
}

export default App;
