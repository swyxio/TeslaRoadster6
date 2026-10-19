/** Overflow room identities cannot collide with player-chosen room codes. */
export const MAX_PUBLIC_OVERFLOW = 16;
export const validRoom = (room:string) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(room);
export function publicRoomNumber(room:string):number|null {
  const match=/^public:([1-9]|1[0-6])$/.exec(room);
  return match?Number(match[1]):null;
}
export type RoomEntry = {room:string;automatic:boolean};
export function roomEntry(search:string):RoomEntry|null {
  const params=new URLSearchParams(search),rooms=params.getAll('room'),publicRooms=params.getAll('public');
  if(rooms.length>1||publicRooms.length>1||(rooms.length&&publicRooms.length))return null;
  if(rooms.length)return validRoom(rooms[0])?{room:rooms[0],automatic:false}:null;
  if(publicRooms.length){
    const room=`public:${publicRooms[0]}`;
    return publicRoomNumber(room)!==null?{room,automatic:false}:null;
  }
  return {room:'bay',automatic:true};
}
export function roomPath(room:string):string {
  const n=publicRoomNumber(room);
  return n===null?`/api/room/${encodeURIComponent(room)}`:`/api/public-room/${n}`;
}
export function roomSearch(room:string):string {
  const n=publicRoomNumber(room);
  return n===null?`?room=${encodeURIComponent(room)}`:`?public=${n}`;
}
export function roomLabel(room:string):string {
  const n=publicRoomNumber(room);
  return n===null?(room==='bay'?'Bay':room):`Bay ${n+1}`;
}
