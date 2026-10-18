const KEY='polyav:mobile-hud';
const QUERY='(pointer: coarse), (max-width: 800px)';
type Panel='mission'|'map'|'instruments';
type Preferences=Record<Panel,boolean>;
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
const defaults=():Preferences=>({mission:false,map:false,instruments:false});

export function readMobileHud(storage:StoragePort|null):Preferences {
  const result=defaults();
  try {
    const value:unknown=JSON.parse(storage?.getItem(KEY)??'null');
    if(value&&typeof value==='object')for(const key of Object.keys(result) as Panel[]){
      const saved=(value as Record<string,unknown>)[key];
      if(typeof saved==='boolean')result[key]=saved;
    }
  } catch { /* Preferences are optional. */ }
  return result;
}

export function writeMobileHud(storage:StoragePort|null,value:Preferences):void {
  try { storage?.setItem(KEY,JSON.stringify(value)); } catch { /* Keep this session usable. */ }
}

export function setupMobileHud(storage:StoragePort|null){
  const state=readMobileHud(storage),media=window.matchMedia(QUERY);
  const panels:{id:Panel;panel:HTMLElement;button:HTMLButtonElement;name:string;label:string}[]=[
    {id:'mission',panel:document.getElementById('mission-panel')!,button:document.getElementById('mission-panel-toggle') as HTMLButtonElement,name:'Details',label:'mission details'},
    {id:'map',panel:document.getElementById('map-panel')!,button:document.getElementById('map-panel-toggle') as HTMLButtonElement,name:'Map',label:'map'},
    {id:'instruments',panel:document.getElementById('instrument-panel')!,button:document.getElementById('instrument-panel-toggle') as HTMLButtonElement,name:'Stats',label:'driving stats'},
  ];
  const update=()=>{
    for(const {id,panel,button,name,label} of panels){
      const open=!media.matches||state[id];
      panel.classList.toggle('mobile-hud-enabled',media.matches);
      panel.classList.toggle('mobile-compact',!open);
      button.setAttribute('aria-expanded',String(open));
      button.setAttribute('aria-label',`${open?'Minimize':'Expand'} ${label}`);
      button.textContent=`${name} ${open?'−':'+'}`;
    }
  };
  for(const {id,button} of panels)button.addEventListener('click',()=>{state[id]=!state[id];writeMobileHud(storage,state);update();});
  media.addEventListener('change',update);update();
  return {expanded:(id:Panel)=>!media.matches||state[id]};
}
