import {test} from 'node:test';
import assert from 'node:assert/strict';
import {roomEntry,roomLabel,roomPath,roomSearch} from '../src/room-address';

test('public placement and exact invites have distinct canonical addresses',()=>{
  assert.deepEqual(roomEntry(''),{room:'bay',automatic:true});
  assert.deepEqual(roomEntry('?room=bay'),{room:'bay',automatic:false});
  assert.deepEqual(roomEntry('?room=public-1'),{room:'public-1',automatic:false});
  for(let i=1;i<=16;i++){
    const room=`public:${i}`;
    assert.deepEqual(roomEntry(roomSearch(room)),{room,automatic:false});
    assert.equal(roomPath(room),`/api/public-room/${i}`);
    assert.equal(roomLabel(room),`Bay ${i+1}`);
  }
  assert.equal(roomPath('public-1'),'/api/room/public-1');
  for(const search of ['?public=0','?public=01','?public=17','?public=-1','?public=','?public=a',
    '?public=1&public=2','?room=bay&public=1','?room=bay&room=bay','?room=','?room=../bay'])
    assert.equal(roomEntry(search),null,search);
});
