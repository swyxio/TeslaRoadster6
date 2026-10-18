// Test-only 10–12 m/s feedback for the local wallet throughput route.
// The latest authoritative speed is updated by snapshots, not predicted locally.
export function walletRouteThrottle(speed:number):number {
  return Math.max(0,Math.min(1,(12-speed)*.15));
}

type Sample={atMs:number;poseRevision:number;vehicle:{id:string;x:number;z:number;speed:number}|null};
export function walletRouteBlocks(snapshots:Sample[][]) {
  return snapshots.map(samples=>Array.from({length:6},(_,block)=>{
    const inBlock=samples.filter(sample=>sample.atMs>=block*10_000&&sample.atMs<(block+1)*10_000);
    const meters=inBlock.reduce((sum,sample,index)=>{
      const previous=inBlock[index-1];
      if(!previous||sample.poseRevision!==previous.poseRevision||!sample.vehicle||!previous.vehicle||sample.vehicle.id!==previous.vehicle.id)return sum;
      const distance=Math.hypot(sample.vehicle.x-previous.vehicle.x,sample.vehicle.z-previous.vehicle.z);
      return distance<=24?sum+distance:sum;
    },0);
    return {meters,samples:inBlock.length,movingFraction:inBlock.length?inBlock.filter(sample=>sample.vehicle&&sample.vehicle.speed>5).length/inBlock.length:0};
  }));
}
export function walletRouteSustained(blocks:ReturnType<typeof walletRouteBlocks>):boolean {
  return blocks.length===5&&blocks.every(driver=>driver.length===6&&driver.every(block=>block.samples>=50&&block.meters>=75&&block.movingFraction>=.8));
}
