import React, { useEffect, useState } from 'react';
import '@src/App.css';
import { listenRoomsList } from '@src/roomService';
import PracticeMode from './PracticeMode';

export default function Home({ user, onCreateClick, onJoin, onOpenRoom }) {
  const [rooms, setRooms] = useState([]);
  const [joinId, setJoinId] = useState('');
  const [isPracticeMode, setIsPracticeMode] = useState(false);

  useEffect(() => {
    const unsub = listenRoomsList((roomsList) => {
      // Lọc bỏ phòng rỗng một lần nữa ở client để đảm bảo
      const validRooms = roomsList.filter(room => {
        const hasP1 = room.players?.p1?.uid && room.players.p1.uid !== '';
        const hasP2 = room.players?.p2?.uid && room.players.p2.uid !== '';
        const hasSpectators = (room.spectators || []).length > 0;
        return hasP1 || hasP2 || hasSpectators;
      });
      setRooms(validRooms);
    });
    return () => unsub && unsub();
  }, []);

  return (
    <div className="game">
      <h1>Danh sách bàn đang chơi</h1>

      <div className="top-bar">
        <div className="player-panel">
          <div className="avatar" style={{backgroundImage: user?.avatar ? `url(${user.avatar})` : 'none'}}>
            {!user?.avatar && <span>{user?.name?.[0] || 'P'}</span>}
          </div>
          <div className="info">
            <div className="name">{user?.name || 'Khách'}</div>
          </div>
        </div>

        <div className="controls">
          <button
            className={`btn ${isPracticeMode ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => setIsPracticeMode(!isPracticeMode)}
          >
            {isPracticeMode ? 'Chế độ Online' : 'Chế độ Luyện tập'}
          </button>
          {!isPracticeMode && (
            <>
              <button className="btn" onClick={onCreateClick}>Tạo bàn</button>
              <input className="room-input" placeholder="Mã phòng" value={joinId} onChange={e=>setJoinId(e.target.value.toUpperCase())}/>
              <button className="btn" onClick={()=>onJoin(joinId)}>Vào bàn</button>
            </>
          )}
        </div>
      </div>

      {isPracticeMode ? (
        <PracticeMode />
      ) : (
        <div style={{maxWidth: 920, margin: '0 auto', textAlign: 'left'}}>
          {rooms.length === 0 ? (
            <div>Chưa có bàn nào. Hãy tạo bàn mới!</div>
          ) : (
            <ul style={{listStyle: 'none', padding: 0}}>
              {rooms.map((r) => (
                <li key={r.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px',border:'1px solid #263040',borderRadius:'8px',marginBottom:'8px',background:'#0b1220'}}>
                  <div>
                    <div style={{fontWeight:700}}>Phòng: {r.roomId || r.id}</div>
                    <div style={{fontSize:12,opacity:0.75}}>Trạng thái: {r.status} | Luật: {r?.settings?.requiredOpenEnds ?? 1} đầu | N: {r?.settings?.N ?? 20}</div>
                  </div>
                  <button className="btn" onClick={()=>onOpenRoom(r.id)}>Mở</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}


