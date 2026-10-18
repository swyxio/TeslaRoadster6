/** Local-space parts must stay inside the shared landmark collision envelope. */
export type LandmarkModel = {id:string;w:number;d:number;h:number};
export type LandmarkParts = {
  box:(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>void;
  cyl:(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>void;
  roof:(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>void;
  dome:(x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>void;
};
