import React, { useEffect, useMemo, useState } from 'react';
import '@src/App.css';
import { EMPTY, P1, P2 } from '@src/caro-core';
import { GoogleSignInButton } from '@src/googleAuth';
import { createRoom, joinRoom, listenRoom, setReady, startGame, makeMove, decodeBoard, encodeBoard, leaveRoom, updateRoomLocks } from '@src/roomService';
import Home from '@src/Home';

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

export default function RoomsApp() {
  const [user, setUser] = useState(null); // {uid,name,avatar}
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState(null); // realtime doc
  const [role, setRole] = useState(null); // 'p1' | 'p2' | 'spectator'
  const [roomClosedMessage, setRoomClosedMessage] = useState(''); // Thông báo phòng đóng
  const [isCreatingRoom, setIsCreatingRoom] = useState(false); // Trạng thái đang tạo phòng

  const [board, setBoard] = useState(Array.from({ length: N }, () => Array(N).fill(EMPTY)));
  const [locks, setLocks] = useState(randomLocks(N, 3));
  const [currentPlayer, setCurrentPlayer] = useState(P1);
  const [moveCount, setMoveCount] = useState(0);
  const [winner, setWinner] = useState(null);
  const [requiredOpenEnds, setRequiredOpenEnds] = useState(1);
  const [timePerTurnSec, setTimePerTurnSec] = useState(20);
  const [selectingLocks, setSelectingLocks] = useState(false);
  const allowedFirstCells = useMemo(() => getAllowedFirstMoveCellsAroundLocks(locks), [locks]);

  useEffect(() => {
    if (room === null && roomId && !isCreatingRoom) {
      // Room đã bị xóa, redirect về trang chủ
      // FIX: Thêm delay để tránh false positive khi tạo phòng
      const timeoutId = setTimeout(() => {
        console.log('Room đã bị đóng vì không còn ai trong phòng');
        setRoomClosedMessage('Phòng đã tự động đóng vì không còn ai trong đó');
        setTimeout(() => {
          setRoomClosedMessage('');
          setRoomId('');
          setRole(null);
          setRoom(null);
        }, 2000);
      }, 1000); // Đợi 1 giây để tránh false positive
      
      return () => clearTimeout(timeoutId);
    }
  }, [room, roomId, isCreatingRoom]);

  useEffect(() => {
    if (!roomId) return;
    const unsub = listenRoom(roomId, setRoom);
    return () => unsub && unsub();
  }, [roomId]);

  useEffect(() => {
    if (!room) return;
    
    // FIX: Cập nhật lastActivity khi vào phòng
    if (room.lastActivity) {
      console.log('Room last activity:', room.lastActivity.toDate());
    }
    
    const Nnow = room?.settings?.N || N;
    setBoard(decodeBoard(room.board, Nnow));
    setCurrentPlayer(room.currentPlayer || P1);
    setMoveCount(room.moveCount || 0);
    setWinner(room.winner || null);
    // CRITICAL FIX 7: Sync locks từ room
    if (room.locks && Array.isArray(room.locks)) {
      setLocks(room.locks);
    }
  }, [room, roomId, isCreatingRoom]);

  const handleGoogleSuccess = (profile) => {
    console.log('Google login successful:', profile);
    setUser(profile);
    // Đảm bảo user được redirect về trang home
    setRoomId('');
    setRoom(null);
    setRole(null);
  };
  const loginGuest = () => setUser({ uid: 'guest_' + Math.random().toString(36).slice(2,9), name: 'Khách', avatar: '' });
  const logout = async () => { 
    if (roomId && user) await leaveRoom(roomId, user.uid);
    setUser(null); 
    setRoomId(''); 
    setRoom(null); 
    setRole(null); 
  };

  // cleanup: rời phòng khi đóng tab/refresh
  useEffect(()=>{
    const handler = async () => { 
      if (roomId && user) {
        try {
          await leaveRoom(roomId, user.uid);
        } catch (e) {
          console.error('Failed to leave room on unload:', e);
        }
      }
    };
    
    const beforeUnloadHandler = (e) => {
      if (roomId && user) {
        // Đảm bảo leaveRoom được gọi trước khi đóng tab
        handler();
        // Hiển thị thông báo để ngăn đóng tab ngay lập tức
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', beforeUnloadHandler);
    
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      // Cleanup khi component unmount
      if (roomId && user) {
        handler();
      }
    };
  }, [roomId, user]);

  const toggleLockAt = async (r, c) => {
    const key = `${r},${c}`;
    const currentLocks = room?.locks || locks;
    const has = currentLocks.some((l) => `${l.r},${l.c}` === key);
    const newLocks = has 
      ? currentLocks.filter((l) => `${l.r},${l.c}` !== key)
      : [...currentLocks, { r, c }];
    
    if (room && roomId) {
      try {
        await updateRoomLocks(roomId, newLocks, user.uid);
      } catch (e) {
        alert(e.message);
      }
    } else {
      setLocks(newLocks);
    }
  };

  const handleClick = (r, c) => {
    if (selectingLocks && (!room || room.status !== 'playing')) {
      toggleLockAt(r, c);
      return;
    }
    if (winner) return;
    if (board[r][c] !== EMPTY) return;
    // không cho đánh vào ô khóa (sử dụng locks từ room để đồng bộ)
    const currentLocks = room?.locks || locks;
    if (currentLocks.some(l => l.r === r && l.c === c)) return;
    
    // CRITICAL FIX 5: Spectator không được đánh
    if (room && role === 'spectator') return;
    
    if (room && role && room.status === 'playing') {
      if ((role === 'p1' && room.currentPlayer !== 1) || (role === 'p2' && room.currentPlayer !== 2)) return;
    }
    
    // CRITICAL FIX 6: Sử dụng locks từ room nếu có  
    if (moveCount === 0 && currentLocks.length > 0) {
      const allowedSet = new Set(getAllowedFirstMoveCellsAroundLocks(currentLocks).map(a => `${a[0]},${a[1]}`));
      if (!allowedSet.has(`${r},${c}`)) return;
    }

    const localPlace = () => {
      const newBoard = board.map(row => [...row]);
      newBoard[r][c] = currentPlayer;
      setBoard(newBoard);
      setMoveCount(moveCount + 1);
      if (checkWin(newBoard, r, c, currentPlayer, requiredOpenEnds)) setWinner(currentPlayer);
      else setCurrentPlayer(currentPlayer === P1 ? P2 : P1);
    };

    if (!room) return localPlace();

    makeMove(roomId, (data) => {
      if (data.status !== 'playing') return null;
      // chặn đặt vào ô khóa ở phía server
      if ((data.locks || []).some(l => l.r === r && l.c === c)) return null;
      // lượt đầu phải nằm cạnh ô khóa nếu có khóa
      if ((data.moveCount || 0) === 0 && (data.locks || []).length > 0) {
        const around = new Set(getAllowedFirstMoveCellsAroundLocks(data.locks).map(a => `${a[0]},${a[1]}`));
        if (!around.has(`${r},${c}`)) return null;
      }
      const nextBoard = decodeBoard(data.board, data.settings.N).map(row => [...row]);
      if (nextBoard[r][c] !== 0) return null;
      nextBoard[r][c] = data.currentPlayer;
      const won = checkWin(nextBoard, r, c, data.currentPlayer, data.settings.requiredOpenEnds);
      const nextPlayer = data.currentPlayer === 1 ? 2 : 1;
      const nextDeadline = Date.now() + data.settings.timePerTurnSec * 1000;
      return {
        board: encodeBoard(nextBoard),
        moveCount: (data.moveCount || 0) + 1,
        currentPlayer: won ? data.currentPlayer : nextPlayer,
        winner: won ? data.currentPlayer : null,
        turnDeadline: won ? null : nextDeadline,
        status: won ? 'finished' : 'playing',
      };
    });
  };

  const resetGame = () => {
    setBoard(Array.from({ length: N }, () => Array(N).fill(EMPTY)));
    setLocks(randomLocks(N, 3));
    setCurrentPlayer(P1);
    setMoveCount(0);
    setWinner(null);
  };

  const onCreateRoom = async () => {
    if (!user) return;
    const id = (Math.random().toString(36).slice(2, 8)).toUpperCase();
    const settings = { N, requiredOpenEnds, timePerTurnSec, locks };
    
    try {
      setIsCreatingRoom(true);
      console.log('Creating room with ID:', id);
      await createRoom(id, settings, user);
      console.log('Room created successfully:', id);
      
      // FIX: Thêm delay nhỏ để đảm bảo Firebase đã xử lý xong
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setRoomId(id);
      console.log('Joining room as creator:', id);
      const joined = await joinRoom(id, user, false);
      console.log('Joined room with role:', joined.role);
      setRole(joined.role);
    } catch (error) {
      console.error('Failed to create room:', error);
      alert('Không thể tạo phòng: ' + error.message);
    } finally {
      setIsCreatingRoom(false);
    }
  };
  const onJoinRoom = async () => {
    if (!user || !roomId) return;
    const joined = await joinRoom(roomId, user, false).catch(async () => ({ role: 'spectator' }));
    setRole(joined.role);
  };

  if (!user) {
    return (
      <div className="login-gate">
        <h1>Cờ Caro — Đăng nhập</h1>
        <div className="login-actions">
          <GoogleSignInButton onProfile={handleGoogleSuccess} />
          <button className="btn" onClick={loginGuest}>Vào ẩn danh</button>
        </div>
      </div>
    );
  }

  // Trang Home khi chưa chọn phòng
  if (!roomId) {
    return (
      <Home
        user={user}
        onCreateClick={async ()=>{
          const id = (Math.random().toString(36).slice(2, 8)).toUpperCase();
          const settings = { N, requiredOpenEnds, timePerTurnSec, locks };
          try {
            setIsCreatingRoom(true);
            await createRoom(id, settings, user);
            
            // FIX: Thêm delay nhỏ để đảm bảo Firebase đã xử lý xong
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const joined = await joinRoom(id, user, false);
            setRoomId(id);
            setRole(joined.role);
          } catch (e) {
            alert('Không thể tạo phòng: ' + e.message);
          } finally {
            setIsCreatingRoom(false);
          }
        }}
        onJoin={async (id)=>{
          if (!id) return;
          try {
            const joined = await joinRoom(id, user, false);
            setRoomId(id);
            setRole(joined.role);
          } catch (e) {
            alert('Không thể vào phòng: ' + e.message);
          }
        }}
        onOpenRoom={async (id)=>{
          try {
            const joined = await joinRoom(id, user, false);
            setRoomId(id);
            setRole(joined.role);
          } catch (e) {
            alert('Không thể mở phòng: ' + e.message);
          }
        }}
      />
    );
  }

  return (
    <div className="game">
      <h1>Cờ Caro — Luật chặn {requiredOpenEnds} đầu</h1>
      
      {roomClosedMessage && (
        <div className="room-closed-message" style={{
          background: '#ff6b6b',
          color: 'white',
          padding: '10px',
          textAlign: 'center',
          marginBottom: '10px',
          borderRadius: '5px'
        }}>
          {roomClosedMessage}
        </div>
      )}
      
      <div className="top-bar">
        {room && (
          <div className="game-phase-indicator">
            <div className="room-header">
              <div className={`phase-badge ${room.status}`}>
                {room.status === 'lobby' ? '🏠 Lobby' : 
                 room.status === 'playing' ? '🎮 Đang chơi' : 
                 '🏁 Kết thúc'}
              </div>
              <div className="room-id-display">
                Mã phòng: <span className="room-code">{roomId}</span>
                <button 
                  className="copy-btn" 
                  onClick={() => {
                    navigator.clipboard.writeText(roomId);
                    // Could add a toast notification here
                  }}
                  title="Copy mã phòng"
                >
                  📋
                </button>
              </div>
            </div>
            {room.status === 'lobby' && (
              <div className="lobby-info">
                Chờ người chơi sẵn sàng để bắt đầu
              </div>
            )}
          </div>
        )}
        


        <div className="controls">
          <label>Luật thắng:</label>
          <select value={requiredOpenEnds} onChange={e => setRequiredOpenEnds(Number(e.target.value))}>
            <option value={0}>Không chặn</option>
            <option value={1}>Chặn 1 đầu</option>
            <option value={2}>Chặn 2 đầu</option>
          </select>
          <label>Thời gian/lượt:</label>
          <input className="time-input" type="number" min="5" max="120" value={timePerTurnSec} onChange={e=>setTimePerTurnSec(Number(e.target.value)||20)} />
          {/* Chỉ cho chỉnh locks khi chưa vào phòng hoặc chưa bắt đầu */}
          {(!room || room.status === 'lobby') && role === 'p1' && (
            <>
              <button className={`btn ${selectingLocks ? 'btn-active' : ''}`} onClick={()=>setSelectingLocks(!selectingLocks)}>{selectingLocks ? 'Đang chọn ô khóa' : 'Chọn ô khóa'}</button>
              <button className="btn" onClick={async ()=>{
                const newLocks = randomLocks(N,3);
                if (room && roomId) {
                  try {
                    await updateRoomLocks(roomId, newLocks, user.uid);
                  } catch (e) {
                    alert(e.message);
                  }
                } else {
                  setLocks(newLocks);
                }
              }}>Random khóa</button>
              <button className="btn" onClick={async ()=>{
                if (room && roomId) {
                  try {
                    await updateRoomLocks(roomId, [], user.uid);
                  } catch (e) {
                    alert(e.message);
                  }
                } else {
                  setLocks([]);
                }
              }}>Xóa khóa</button>
            </>
          )}
          <button className="btn" onClick={resetGame}>Chơi lại cục bộ</button>
        </div>

        <div className="user-panel">
          <div className="current-user">
            <div className="avatar" style={{backgroundImage: user.avatar ? `url(${user.avatar})` : 'none'}}>
              {!user.avatar && <span>{role === 'p2' ? 'P2' : 'P1'}</span>}
            </div>
            <div className="info">
              <div className="name">{user.name}</div>
              <div className="role-badge">
                {role === 'p1' ? '👑 Chủ phòng' : role === 'p2' ? '⚔️ Người chơi' : '👁️ Khán giả'}
              </div>
              <button className="btn" onClick={logout}>Đăng xuất</button>
            </div>
          </div>

          <div className="room-controls">
            <input className="room-input" placeholder="Mã phòng (VD: ABC123)" value={roomId} onChange={e=>setRoomId(e.target.value.toUpperCase())} />
            <button className="btn" onClick={onCreateRoom}>Tạo phòng</button>
            <button className="btn" onClick={onJoinRoom}>Vào phòng</button>
            {room && (
              <>
                <span className="badge">{room.status}</span>
                {role !== 'spectator' && (
                  <>
                    <button className="btn" onClick={()=>setReady(roomId, role, true)} disabled={role==='spectator'}>Sẵn sàng</button>
                    <button className="btn" onClick={()=>setReady(roomId, role, false)} disabled={role==='spectator'}>Hủy</button>
                    {/* chỉ chủ phòng (p1) mới bắt đầu */}
                    <button className="btn" onClick={async ()=>{
                      try {
                        await startGame(roomId);
                      } catch (e) {
                        alert(e.message);
                      }
                    }} disabled={role!=='p1'}>Bắt đầu</button>
                  </>
                )}
                <button className="btn" onClick={async ()=>{
                  await leaveRoom(roomId, user.uid);
                  setRoomId('');
                  setRoom(null);
                  setRole(null);
                }}>Rời phòng</button>
              </>
            )}
          </div>
        </div>
      </div>

      {winner && (
        <div className="modal-backdrop" onClick={()=>setWinner(null)}>
          <div className="modal" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-title">🎉 Chiến thắng!</div>
            <div className="modal-body">Người chơi {winner} thắng!</div>
            <div className="modal-actions">
              {!room && <button className="btn" onClick={()=>{ setWinner(null); resetGame(); }}>Chơi lại</button>}
              <button className="btn" onClick={()=>setWinner(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      <div className="board-wrapper">
        {/* Player 1 (Left side) */}
        <div className={`player-card ${role === 'p1' ? 'current-player' : ''} ${room?.players?.p1?.ready ? 'ready' : ''} ${room?.status === 'playing' && room?.currentPlayer === 1 ? 'active-turn' : ''} ${winner === 1 ? 'winner' : ''} ${!room?.players?.p1?.uid || room?.players?.p1?.uid === '' ? 'empty-slot' : ''}`}>
          <div className="avatar" style={{backgroundImage: room?.players?.p1?.avatar ? `url(${room.players.p1.avatar})` : 'none'}}>
            {!room?.players?.p1?.avatar && <span>{room?.players?.p1?.uid && room?.players?.p1?.uid !== '' ? 'P1' : '?'}</span>}
          </div>
          <div className="player-info">
            <div className="name">{room?.players?.p1?.name || 'Chờ người chơi'}</div>
            <div className="status">
              {winner === 1 ? '🏆 Chiến thắng!' :
                !room?.players?.p1?.uid || room?.players?.p1?.uid === '' ? '⏳ Đang chờ...' :
                room?.status === 'playing' ? 
                  (room?.currentPlayer === 1 ? '🎯 Lượt của bạn' : '⏳ Chờ lượt') :
                  (room?.players?.p1?.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng')
              }
            </div>
          </div>
        </div>

        {/* Game Board */}
        <div className="game-board-container">
          <div className="board white-theme">
            {board.map((row, r) => (
              <div key={r} className="row">
                {row.map((cell, c) => {
                  // FIX: Sử dụng locks từ room để đồng bộ giữa clients
                  const currentLocks = room?.locks || locks;
                  const currentAllowed = room ? getAllowedFirstMoveCellsAroundLocks(currentLocks) : allowedFirstCells;
                  const isLockCenter = currentLocks.some(l => l.r === r && l.c === c);
                  const isLockRadius = currentAllowed.some(([rr, cc]) => rr === r && cc === c);
                  let cellClass = 'cell';
                  if (isLockCenter) cellClass += ' lock-center';
                  // Chỉ hiển thị lock-radius khi chưa đánh con đầu tiên
                  else if (isLockRadius && moveCount === 0) cellClass += ' lock-radius';
                  if (cell === P1) cellClass += ' p1';
                  if (cell === P2) cellClass += ' p2';
                  const idx = r * N + (c + 1);
                  return (
                    <div key={c} className={cellClass} onClick={() => handleClick(r, c)}>
                      <span className="cell-idx center">{idx}</span>
                      <span className="stone center">{cell === P1 ? 'X' : cell === P2 ? 'O' : ''}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          
          {/* VS indicator below board */}
          <div className="vs-indicator">
            <span>VS</span>
            {room?.status === 'playing' && (
              <div className="game-status">
                <div className="turn-indicator">
                  {room?.currentPlayer === 1 ? 'P1' : 'P2'}
                </div>
                <div className="move-count">
                  Lượt {room?.moveCount || 0}
                </div>
              </div>
            )}
            {winner && (
              <div className="game-status">
                <div className="winner-indicator">
                  Kết thúc
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Player 2 (Right side) */}
        <div className={`player-card ${role === 'p2' ? 'current-player' : ''} ${room?.players?.p2?.ready ? 'ready' : ''} ${room?.status === 'playing' && room?.currentPlayer === 2 ? 'active-turn' : ''} ${winner === 2 ? 'winner' : ''} ${!room?.players?.p2?.uid || room?.players?.p2?.uid === '' ? 'empty-slot' : ''}`}>
          <div className="avatar" style={{backgroundImage: room?.players?.p2?.avatar ? `url(${room.players.p2.avatar})` : 'none'}}>
            {!room?.players?.p2?.avatar && <span>{room?.players?.p2?.uid && room?.players?.p2?.uid !== '' ? 'P2' : '?'}</span>}
          </div>
          <div className="player-info">
            <div className="name">{room?.players?.p2?.name || 'Chờ người chơi'}</div>
            <div className="status">
              {winner === 2 ? '🏆 Chiến thắng!' :
                !room?.players?.p2?.uid || room?.players?.p2?.uid === '' ? '⏳ Đang chờ...' :
                room?.status === 'playing' ? 
                  (room?.currentPlayer === 2 ? '🎯 Lượt của bạn' : '⏳ Chờ lượt') :
                  (room?.players?.p2?.ready ? 'Sẵn sàng' : 'Chưa sẵn sàng')
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


