// Portable version of the runner used for the retained sample.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {createWorld,addPlayer,step,NEUTRAL}=await import(pathToFileURL(resolve(process.argv[3]??process.cwd(),'shared/game.ts')).href);
const world=createWorld(0),mode=process.argv[2];
if(mode==='no-jams')world.entities=world.entities.filter(entity=>!entity.id.startsWith('jam-'));
addPlayer(world,'profile-player','Profile');
const input=new Map([['profile-player',{...NEUTRAL}]]);
const initial=world.entities.filter(entity=>entity.id.startsWith('jam-')).length;
for(let i=0;i<100;i++)step(world,input,.05);
const start=performance.now();for(let i=0;i<1000;i++)step(world,input,.05);
console.log(JSON.stringify({mode,initialJamCars:initial,ticks:1000,elapsedMs:performance.now()-start}));
