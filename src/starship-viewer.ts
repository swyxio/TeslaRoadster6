import * as T from 'three';
import { FREMONT_SPACEPORT } from '../shared/map';
import type { StarshipAnimation } from './starship-timeline';
import { buildFremontSpaceport } from './fremont-spaceport';
import './starship-viewer.css';

/** A spectator view uses its own small scene; the player's room never moves. */
export function createStarshipViewer(options:{
  animation:(now:number)=>StarshipAnimation|null;
  stage:()=>number;
  message:(now:number)=>string;
  onOpen:()=>void;
  onClose:()=>void;
}) {
  const dialog=document.createElement('dialog');dialog.className='starship-viewer';dialog.setAttribute('aria-labelledby','starship-viewer-title');
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');
  const overlay=document.createElement('div');overlay.className='starship-viewer-overlay';
  const title=document.createElement('h2');title.id='starship-viewer-title';title.textContent='Fremont launch view';
  const status=document.createElement('p');status.setAttribute('role','status');
  const close=document.createElement('button');close.type='button';close.textContent='Back to driving';close.onclick=()=>dialog.close();
  overlay.append(title,status,close);dialog.append(canvas,overlay);document.body.append(dialog);
  let renderer:T.WebGLRenderer|null=null,scene:T.Scene|null=null,camera:T.PerspectiveCamera|null=null;
  let spaceport:ReturnType<typeof buildFremontSpaceport>|null=null,frame=0;
  function setup(){
    if(renderer)return;
    renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1));renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;
    scene=new T.Scene();scene.background=new T.Color(0x9dbfc7);scene.fog=new T.Fog(0x9dbfc7,450,1200);
    scene.add(new T.HemisphereLight(0xe9f5ff,0x626953,1.4));
    const sun=new T.DirectionalLight(0xffdfb5,2.2);sun.position.set(-100,160,80);scene.add(sun);
    const pad=FREMONT_SPACEPORT.pad;
    const ground=new T.Mesh(new T.PlaneGeometry(800,800),new T.MeshStandardMaterial({color:0x7b9185}));
    ground.rotation.x=-Math.PI/2;ground.position.set(pad.x,-.1,pad.z);scene.add(ground);
    spaceport=buildFremontSpaceport(scene);
    camera=new T.PerspectiveCamera(48,1,.1,1800);camera.position.set(pad.x+180,pad.h+115,pad.z+235);camera.lookAt(pad.x,pad.h+62,pad.z);
  }
  function render(now:number){
    if(!dialog.open||!renderer||!scene||!camera||!spaceport)return;
    const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
    if(canvas.width!==width||canvas.height!==height){renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
    const animation=options.animation(now);
    spaceport.update(animation?.elapsed??0,animation?0:null,options.stage());
    const message=options.message(now);if(status.textContent!==message)status.textContent=message;
    renderer.render(scene,camera);frame=requestAnimationFrame(render);
  }
  dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);options.onClose();});
  return {
    open(){
      if(dialog.open)return true;
      try{setup();}catch{renderer?.dispose();renderer=null;scene=null;camera=null;spaceport=null;return false;}
      try{options.onOpen();dialog.showModal();frame=requestAnimationFrame(render);return true;}
      catch{options.onClose();return false;}
    },
    close(){if(dialog.open)dialog.close();},
    get openState(){return dialog.open;},
  };
}
