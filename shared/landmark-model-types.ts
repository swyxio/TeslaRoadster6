/** Local-space parts stay inside the landmark's authored visual bounds. */
export type LandmarkModel = {id:string;w:number;d:number;h:number};
export type LandmarkParts = {
  box:(x:number,y:number,z:number,w:number,h:number,d:number,color:number,structural?:boolean)=>void;
  cyl:(x:number,y:number,z:number,w:number,h:number,d:number,color:number,structural?:boolean)=>void;
  roof:(x:number,y:number,z:number,w:number,h:number,d:number,color:number,structural?:boolean)=>void;
  dome:(x:number,y:number,z:number,w:number,h:number,d:number,color:number,structural?:boolean)=>void;
};
