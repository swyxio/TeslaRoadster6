export const ACTION_LABELS = {
  forward:'Drive / fly forward', reverse:'Reverse / fly backward', left:'Steer / bank left', right:'Steer / bank right',
  brake:'Brake / drift; air flip', jump:'Jump / hold to hover', flip:'Flip', boost:'Boost', rollLeft:'Roll left', rollRight:'Roll right',
  interact:'Enter / exit', reset:'Unstuck', camera:'Camera', autopilot:'Autopilot', fleet:'Fleet', shop:'Shop', scores:'Scores', awards:'Awards',
} as const;
export type KeyAction = keyof typeof ACTION_LABELS;
export type Bindings = Record<KeyAction, [string, string]>;
export const DEFAULT_BINDINGS: Bindings = {
  forward:['KeyW','ArrowUp'], reverse:['KeyS','ArrowDown'], left:['KeyA','ArrowLeft'], right:['KeyD','ArrowRight'],
  brake:['Space',''], jump:['KeyE','KeyJ'], flip:['KeyX',''], boost:['ShiftLeft','ShiftRight'], rollLeft:['KeyQ',''], rollRight:['KeyR',''],
  interact:['KeyF',''], reset:['KeyK',''], camera:['KeyC',''], autopilot:['KeyV',''], fleet:['KeyG',''], shop:['KeyB',''], scores:['KeyL',''], awards:['KeyT',''],
};
export const KEY_ACTIONS = Object.keys(ACTION_LABELS) as KeyAction[];
const STORAGE_KEY='poly-av-key-bindings';
export const validKey = (key:string) => /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight)$/.test(key);
export function defaultBindings():Bindings { return Object.fromEntries(KEY_ACTIONS.map(key=>[key,[...DEFAULT_BINDINGS[key]]])) as Bindings; }
export function loadBindings():Bindings {
  try {
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Record<string,unknown> | null;
    if(!parsed)return defaultBindings();
    const seen=new Set<string>();
    for(const action of KEY_ACTIONS){
      const keys=parsed[action];
      if(!Array.isArray(keys)||keys.length!==2)return defaultBindings();
      for(const key of keys){
        if(typeof key!=='string'||(key!==''&&(!validKey(key)||seen.has(key))))return defaultBindings();
        if(key)seen.add(key);
      }
    }
    return Object.fromEntries(KEY_ACTIONS.map(key=>[key,[...(parsed[key] as string[])]])) as Bindings;
  } catch { return defaultBindings(); }
}
export function saveBindings(bindings:Bindings):boolean { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(bindings));return true; } catch { return false; } }
export function keyLabel(code:string):string {
  if(!code)return '—';
  if(code.startsWith('Key'))return code.slice(3);
  if(code.startsWith('Digit'))return code.slice(5);
  return ({Space:'Space',ShiftLeft:'L Shift',ShiftRight:'R Shift',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'} as Record<string,string>)[code]||code;
}
