import React, { useState, useMemo } from 'react';
import { EMPTY, P1, P2 } from './caro-core';

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
  return Array.from(set).map(s => s.split(',').map(Number));
}

function checkWin(board, r, c, player, requiredOpenEnds) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    let fr = r + dr, fc = c + dc;
    while (inBounds(fr, fc) && board[fr][fc] === player) { count++; fr += dr; fc += dc; }
    let br = r - dr, bc = c - dc;
    while (inBounds(br, bc) && board[br][bc] === player) { count++; br -= dr; bc -= dc; }
    if (count >= 5) {
      const end1Open = inBounds(fr, fc) && board[fr][fc] === EMPTY;
      const end2Open = inBounds(br, bc) && board[br][bc] === EMPTY;
      const openEnds = (end1Open ? 1 : 0) + (end2Open ? 1 : 0);
      if (openEnds >= requiredOpenEnds) return true;
    }
  }
  return false;
}

export default function PracticeMode() {
  const [board, setBoard] = useState(Array.from({ length: N }, () => Array(N).fill(EMPTY)));
  const [locks, setLocks] = useState(randomLocks(N, 3));
  const [currentPlayer, setCurrentPlayer] = useState(P1);
  const [moveCount, setMoveCount] = useState(0);
  const [winner, setWinner] = useState(null);
  const [requiredOpenEnds, setRequiredOpenEnds] = useState(1);
  const [moveHistory, setMoveHistory] = useState([]);
  const [selectingLocks, setSelectingLocks] = useState(false);

  const allowedFirstCells = useMemo(() => getAllowedFirstMoveCellsAroundLocks(locks), [locks]);

  const toggleLockAt = (r, c) => {
    if (moveCount > 0) return; // Chỉ cho chọn khóa khi chưa đánh
    
    const existingLockIndex = locks.findIndex(l => l.r === r && l.c === c);
    if (existingLockIndex >= 0) {
      // Xóa khóa
      const newLocks = locks.filter((_, index) => index !== existingLockIndex);
      setLocks(newLocks);
    } else {
      // Thêm khóa mới
      setLocks([...locks, { r, c }]);
    }
  };

  const handleCellClick = (r, c) => {
    if (selectingLocks && moveCount === 0) {
      toggleLockAt(r, c);
      return;
    }
    
    if (winner) return;
    if (board[r][c] !== EMPTY) return;
    
    // Không cho đánh vào ô khóa
    if (locks.some(l => l.r === r && l.c === c)) return;
    
    // Lượt đầu phải nằm cạnh ô khóa nếu có khóa
    if (moveCount === 0 && locks.length > 0) {
      const allowedSet = new Set(allowedFirstCells.map(a => `${a[0]},${a[1]}`));
      if (!allowedSet.has(`${r},${c}`)) return;
    }

    // Thực hiện nước đi
    const newBoard = board.map(row => [...row]);
    newBoard[r][c] = currentPlayer;
    
    // Cập nhật moveHistory
    setMoveHistory([...moveHistory, { row: r, col: c, player: currentPlayer }]);
    
    // Cập nhật board và moveCount
    setBoard(newBoard);
    setMoveCount(moveCount + 1);
    
    // Kiểm tra thắng
    if (checkWin(newBoard, r, c, currentPlayer, requiredOpenEnds)) {
      setWinner(currentPlayer);
    } else {
      // Luân phiên lượt
      setCurrentPlayer(currentPlayer === P1 ? P2 : P1);
    }
  };

  const handleUndo = () => {
    if (moveHistory.length === 0) return;
    
    const lastMove = moveHistory[moveHistory.length - 1];
    
    // Tạo board mới từ đầu
    const newBoard = Array.from({ length: N }, () => Array(N).fill(EMPTY));
    
    // Thực hiện lại tất cả các nước đi trừ nước cuối
    const movesToReplay = moveHistory.slice(0, -1);
    let tempBoard = newBoard;
    let tempCurrentPlayer = P1;
    
    movesToReplay.forEach(move => {
      tempBoard[move.row][move.col] = move.player;
      tempCurrentPlayer = move.player === P1 ? P2 : P1;
    });
    
    setBoard(tempBoard);
    setCurrentPlayer(tempCurrentPlayer);
    setMoveCount(movesToReplay.length);
    setMoveHistory(movesToReplay);
    setWinner(null);
  };

  const handleReset = () => {
    setBoard(Array.from({ length: N }, () => Array(N).fill(EMPTY)));
    setLocks(randomLocks(N, 3));
    setCurrentPlayer(P1);
    setMoveCount(0);
    setWinner(null);
    setMoveHistory([]);
    setSelectingLocks(false);
  };

  const getCellClass = (r, c) => {
    let cellClass = 'cell';
    
    // Kiểm tra ô khóa
    const isLockCenter = locks.some(l => l.r === r && l.c === c);
    const isLockRadius = allowedFirstCells.some(([rr, cc]) => rr === r && cc === c);
    
    if (isLockCenter) {
      cellClass += ' lock-center';
    } else if (isLockRadius && moveCount === 0) {
      cellClass += ' lock-radius';
    }
    
    if (board[r][c] === P1) cellClass += ' p1';
    if (board[r][c] === P2) cellClass += ' p2';
    
    return cellClass;
  };

  return (
    <div className={`practice-mode ${winner ? 'game-over' : ''}`}>
      <div className="practice-header">
        <h2>Chế độ Luyện tập</h2>
        <div className="practice-info">
          <div className="current-player">
            Lượt: <span className={`player-${currentPlayer === P1 ? 'x' : 'o'}`}>
              {currentPlayer === P1 ? 'X' : 'O'}
            </span>
          </div>
          <div className="move-count">Số nước: {moveCount}</div>
        </div>
      </div>

      <div className="practice-controls">
        <button 
          className="btn btn-undo" 
          onClick={handleUndo}
          disabled={moveHistory.length === 0}
        >
          ⬅️ Đi lại
        </button>
        <button className="btn btn-reset" onClick={handleReset}>
          🔄 Chơi lại
        </button>
      </div>

      {/* Controls cho locks - chỉ hiển thị khi chưa đánh */}
      {moveCount === 0 && (
        <div className="controls">
          <label>Luật thắng:</label>
          <select value={requiredOpenEnds} onChange={e => setRequiredOpenEnds(Number(e.target.value))}>
            <option value={0}>Không chặn</option>
            <option value={1}>Chặn 1 đầu</option>
            <option value={2}>Chặn 2 đầu</option>
          </select>
          <button 
            className={`btn ${selectingLocks ? 'btn-active' : ''}`} 
            onClick={() => setSelectingLocks(!selectingLocks)}
          >
            {selectingLocks ? 'Đang chọn ô khóa' : 'Chọn ô khóa'}
          </button>
          <button 
            className="btn" 
            onClick={() => setLocks(randomLocks(N, 3))}
          >
            Random khóa
          </button>
          <button 
            className="btn" 
            onClick={() => setLocks([])}
          >
            Xóa khóa
          </button>
        </div>
      )}

      <div className="board-wrapper">
        <div className="board white-theme">
          {board.map((row, r) => (
            <div key={r} className="row">
              {row.map((cell, c) => {
                const idx = r * N + (c + 1);
                return (
                  <div key={c} className={getCellClass(r, c)} onClick={() => handleCellClick(r, c)}>
                    <span className="cell-idx center">{idx}</span>
                    <span className="stone center">{cell === P1 ? 'X' : cell === P2 ? 'O' : ''}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {winner && (
        <div className="game-over">
          <div className="game-over-dialog">
            <h3>🎉 Kết thúc! 🎉</h3>
            <p>
              Người chơi <span className={`winner-name player-${winner === P1 ? 'x' : 'o'}`}>
                {winner === P1 ? 'X' : 'O'}
              </span> đã thắng!
            </p>
            <button className="btn-reset" onClick={handleReset}>
              🎮 Chơi lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
