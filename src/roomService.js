import { db } from '@src/firebase';
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  query,
  orderBy,
  limit,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';

export async function createRoom(roomId, settings, creator) {
  const roomRef = doc(db, 'rooms', roomId);
  
  // LOGIC FIX 4: Kiểm tra phòng đã tồn tại
  const existing = await getDoc(roomRef);
  if (existing.exists()) {
    throw new Error('Mã phòng đã tồn tại');
  }
  
  const board2d = Array.from({ length: settings.N }, () => Array(settings.N).fill(0));
  const roomData = {
    createdAt: serverTimestamp(),
    lastActivity: serverTimestamp(), // Thêm timestamp hoạt động cuối
    status: 'lobby', // lobby | playing | finished
    roomId,
    creatorUid: creator.uid, // LOGIC FIX 5: Lưu chủ phòng
    settings: {
      N: settings.N,
      requiredOpenEnds: settings.requiredOpenEnds,
      timePerTurnSec: settings.timePerTurnSec,
      firstMoveConstrained: true,
    },
    locks: settings.locks || [],
    board: encodeBoard(board2d),
    currentPlayer: 1,
    moveCount: 0,
    winner: null,
    players: {
      p1: { uid: creator.uid, name: creator.name, avatar: creator.avatar || '', ready: false },
      p2: { uid: '', name: 'Chờ người chơi', avatar: '', ready: false },
    },
    spectators: [],
    turnDeadline: null,
    isEmpty: false, // Thêm flag để đánh dấu phòng rỗng
  };
  
  console.log('Creating room with data:', roomId, roomData);
  await setDoc(roomRef, roomData);
  console.log('Room created successfully:', roomId);
  return roomId;
}

export async function joinRoom(roomId, user, asSpectator = false) {
  const roomRef = doc(db, 'rooms', roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) throw new Error('Phòng không tồn tại');
  const data = snap.data();
  
  // LOGIC FIX 1: Kiểm tra nếu user đã ở trong phòng (tránh duplicate join)
  if (data.players?.p1?.uid === user.uid) return { role: 'p1' };
  if (data.players?.p2?.uid === user.uid) return { role: 'p2' };
  if ((data.spectators || []).includes(user.uid)) return { role: 'spectator' };
  
  if (asSpectator) {
    const spectators = Array.from(new Set([...(data.spectators || []), user.uid]));
    await updateDoc(roomRef, { 
      spectators,
      lastActivity: serverTimestamp(), // Cập nhật thời gian hoạt động cuối
      isEmpty: false // Đánh dấu phòng không còn rỗng
    });
    return { role: 'spectator' };
  }
  
  const players = { ...data.players };
  let role = null;
  
  // LOGIC FIX 2: Xử lý empty string uid (từ leaveRoom)
  if (!players.p1?.uid || players.p1.uid === '') {
    players.p1 = { uid: user.uid, name: user.name, avatar: user.avatar || '', ready: false };
    role = 'p1';
  } else if (!players.p2?.uid || players.p2.uid === '') {
    players.p2 = { uid: user.uid, name: user.name, avatar: user.avatar || '', ready: false };
    role = 'p2';
  } else {
    // LOGIC FIX 3: Cả 2 slot đã đầy, tự động thành spectator (không ném lỗi)
    const spectators = Array.from(new Set([...(data.spectators || []), user.uid]));
    await updateDoc(roomRef, { spectators });
    return { role: 'spectator' };
  }
  
  await updateDoc(roomRef, { 
    players,
    lastActivity: serverTimestamp(), // Cập nhật thời gian hoạt động cuối
    isEmpty: false // Đánh dấu phòng không còn rỗng
  });
  return { role };
}

export function listenRoom(roomId, onChange) {
  const roomRef = doc(db, 'rooms', roomId);
  return onSnapshot(roomRef, (docSnap) => {
    if (docSnap.exists()) {
      const roomData = { id: docSnap.id, ...docSnap.data() };
      console.log('Room data received:', roomId, roomData.status);
      onChange(roomData);
    } else {
      // Room đã bị xóa, trả về null
      console.log('Room not found or deleted:', roomId);
      onChange(null);
    }
  }, (error) => {
    console.error('Error listening to room:', roomId, error);
    // Không gọi onChange(null) khi có lỗi, để tránh false positive
  });
}

export function listenRoomsList(onChange, max = 50) {
  const q = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((room) => {
        // FIX: Không tự động xóa phòng rỗng trong listenRoomsList
        // Để cleanup function xử lý việc xóa phòng sau thời gian timeout
        
        // Chỉ hiển thị phòng còn người hoặc phòng rỗng gần đây
        const hasP1 = room.players?.p1?.uid && room.players.p1.uid !== '';
        const hasP2 = room.players?.p2?.uid && room.players.p2.uid !== '';
        const hasSpectators = (room.spectators || []).length > 0;
        
        const hasPlayers = hasP1 || hasP2 || hasSpectators;
        
        // Nếu phòng rỗng, kiểm tra thời gian hoạt động cuối
        if (!hasPlayers) {
          const lastActivity = room.lastActivity?.toMillis?.() || room.createdAt?.toMillis?.() || 0;
          const timeSinceLastActivity = Date.now() - lastActivity;
          const EMPTY_ROOM_TIMEOUT = 60 * 60 * 1000; // Tăng lên 60 phút để đồng bộ với cleanup
          
          // Chỉ ẩn phòng rỗng quá cũ, không xóa
          if (timeSinceLastActivity > EMPTY_ROOM_TIMEOUT) {
            return false; // Ẩn khỏi danh sách nhưng không xóa
          }
        }
        
        return true;
      });
    onChange(items);
  });
}

export async function setReady(roomId, role, ready) {
  const roomRef = doc(db, 'rooms', roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();
  
  // Chỉ cho phép sửa ready khi ở lobby
  if (data.status !== 'lobby') return;
  
  const players = { ...data.players };
  if (role && players[role]) {
    players[role].ready = ready;
    await updateDoc(roomRef, { 
      players,
      lastActivity: serverTimestamp() // Cập nhật thời gian hoạt động cuối
    });
  }
}

export async function startGame(roomId) {
  const roomRef = doc(db, 'rooms', roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();
  
  // CRITICAL FIX 1: Chỉ chủ phòng mới được start
  if (data.creatorUid !== data.players?.p1?.uid) {
    throw new Error('Chỉ chủ phòng mới có thể bắt đầu');
  }
  
  // CRITICAL FIX 2: Phải có đủ 2 người chơi
  if (!data.players?.p1?.uid || !data.players?.p2?.uid || data.players.p2.uid === '') {
    throw new Error('Cần đủ 2 người chơi để bắt đầu');
  }
  
  // CRITICAL FIX 3: Cả 2 người phải sẵn sàng (trừ chủ phòng tự động ready)
  if (!data.players.p2.ready) {
    throw new Error('Người chơi 2 chưa sẵn sàng');
  }
  
  const N = data.settings.N;
  const board2d = Array.from({ length: N }, () => Array(N).fill(0));
  const now = Date.now();
  const turnDeadline = now + data.settings.timePerTurnSec * 1000;
  await updateDoc(roomRef, {
    status: 'playing',
    board: encodeBoard(board2d),
    currentPlayer: 1,
    moveCount: 0,
    winner: null,
    turnDeadline,
    // CRITICAL FIX 4: Reset ready state khi bắt đầu
    'players.p1.ready': false,
    'players.p2.ready': false,
    lastActivity: serverTimestamp(), // Cập nhật thời gian hoạt động cuối
  });
}

export async function makeMove(roomId, updater) {
  // updater receives current data and must return updated fields or null to skip
  const roomRef = doc(db, 'rooms', roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();
  const result = await updater(data);
  if (result) {
    // FIX: Luôn cập nhật lastActivity khi có thay đổi trong phòng
    await updateDoc(roomRef, {
      ...result,
      lastActivity: serverTimestamp()
    });
  }
}

// Helpers to encode/decode board to avoid nested arrays (Firestore limitation)
export function encodeBoard(board2d) {
  const obj = {};
  for (let r = 0; r < board2d.length; r++) obj[`r${r}`] = board2d[r];
  return obj;
}

export function decodeBoard(boardObj, N) {
  if (!boardObj) return Array.from({ length: N }, () => Array(N).fill(0));
  if (Array.isArray(boardObj)) return boardObj; // backward compatibility
  const res = [];
  for (let r = 0; r < N; r++) res.push(Array.isArray(boardObj[`r${r}`]) ? boardObj[`r${r}`] : Array(N).fill(0));
  return res;
}

export async function updateRoomLocks(roomId, newLocks, userUid) {
  const roomRef = doc(db, 'rooms', roomId);
  const snap = await getDoc(roomRef);
  if (!snap.exists()) return;
  const data = snap.data();
  
  // Chỉ chủ phòng mới được sửa locks và chỉ khi ở lobby
  if (data.creatorUid !== userUid || data.status !== 'lobby') {
    throw new Error('Chỉ chủ phòng mới có thể chỉnh sửa ô khóa khi ở lobby');
  }
  
  await updateDoc(roomRef, { 
    locks: newLocks,
    lastActivity: serverTimestamp() // Cập nhật thời gian hoạt động cuối
  });
}

export async function leaveRoom(roomId, userId) {
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const data = snap.data();
    const players = { ...data.players };
    
    // Remove user từ players
    if (players.p1?.uid === userId) {
      players.p1 = { uid: '', name: 'Chờ người chơi', avatar: '', ready: false };
    }
    if (players.p2?.uid === userId) {
      players.p2 = { uid: '', name: 'Chờ người chơi', avatar: '', ready: false };
    }
    
    // Remove user từ spectators
    const spectators = (data.spectators || []).filter((s) => s !== userId);
    
    // FIX: Không xóa phòng ngay lập tức khi rỗng
    // Chỉ xóa phòng sau một khoảng thời gian nhất định (ví dụ: 30 phút)
    // hoặc khi có cleanup function chạy
    
    // Update room với players và spectators mới
    await updateDoc(roomRef, { 
      players, 
      spectators,
      lastActivity: serverTimestamp(), // Thêm timestamp hoạt động cuối
      isEmpty: (!players.p1?.uid || players.p1.uid === '') && 
               (!players.p2?.uid || players.p2.uid === '') && 
               spectators.length === 0
    });
    console.log(`User ${userId} left room ${roomId}`);
  } catch (e) {
    console.error('leaveRoom failed', e);
    // Không xóa phòng ngay cả khi có lỗi
    // Để cleanup function xử lý sau
  }
}

// Cleanup function để xóa các phòng rỗng định kỳ
export async function cleanupEmptyRooms() {
  try {
    const q = query(collection(db, 'rooms'));
    const snap = await getDocs(q);
    const now = Date.now();
    const EMPTY_ROOM_TIMEOUT = 60 * 60 * 1000; // Tăng lên 60 phút thay vì 30 phút
    
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const hasP1 = data.players?.p1?.uid && data.players.p1.uid !== '';
      const hasP2 = data.players?.p2?.uid && data.players.p2.uid !== '';
      const hasSpectators = (data.spectators || []).length > 0;
      
      // FIX: Chỉ xóa phòng rỗng sau 60 phút không hoạt động
      if (!hasP1 && !hasP2 && !hasSpectators) {
        const lastActivity = data.lastActivity?.toMillis?.() || data.createdAt?.toMillis?.() || 0;
        const timeSinceLastActivity = now - lastActivity;
        
        if (timeSinceLastActivity > EMPTY_ROOM_TIMEOUT) {
          console.log(`Cleanup: Deleting empty room ${docSnap.id} after ${Math.round(timeSinceLastActivity / 60000)} minutes of inactivity`);
          await deleteDoc(docSnap.ref);
        } else {
          console.log(`Room ${docSnap.id} is empty but will be kept for ${Math.round((EMPTY_ROOM_TIMEOUT - timeSinceLastActivity) / 60000)} more minutes`);
        }
      }
    }
  } catch (e) {
    console.error('Cleanup failed:', e);
  }
}

// Tự động cleanup mỗi 10 phút thay vì 5 phút
if (typeof window !== 'undefined') {
  setInterval(cleanupEmptyRooms, 10 * 60 * 1000);
}


