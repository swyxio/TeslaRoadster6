import { Controls } from './controls';
import { ACTION_LABELS, KEY_ACTIONS, defaultBindings, keyLabel, saveBindings, validKey, type KeyAction } from './key-bindings';

/** Settings are local to this browser and do not affect touch controls. */
export function setupControlSettings(controls:Controls, open:()=>void, close:()=>void) {
  const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const dialog=$<HTMLDialogElement>('controls-dialog');
  const list=$('bindings-list'),feedback=$('bindings-feedback');
  let capture:{action:KeyAction;slot:0|1}|null=null;
  const label=(action:KeyAction)=>controls.bindings[action].filter(Boolean).map(keyLabel).join(' / ')||'Unbound';
  const render=()=>{
    list.replaceChildren();
    for(const action of KEY_ACTIONS){
      const row=document.createElement('div');row.className='binding-row';
      const name=document.createElement('span');name.textContent=ACTION_LABELS[action];row.append(name);
      for(const slot of [0,1] as const){
        const button=document.createElement('button');button.type='button';button.textContent=capture?.action===action&&capture.slot===slot?'Press key…':keyLabel(controls.bindings[action][slot]);
        button.dataset.binding=`${action}-${slot}`;
        button.setAttribute('aria-label',`${ACTION_LABELS[action]}, ${slot===0?'first':'second'} key: ${keyLabel(controls.bindings[action][slot])}`);
        button.onclick=()=>{capture={action,slot};feedback.textContent=`Press a key for ${ACTION_LABELS[action]}. Backspace clears; Escape cancels.`;render();focusBinding(action,slot);};row.append(button);
      }
      list.append(row);
    }
    const guide=$('keyboard-help');guide.replaceChildren();
    const title=document.createElement('strong');title.textContent='DRIVING CONTROLS';guide.append(title);
    for(const [text,keys] of [
      ['Drive / fly, steer',`${label('forward')} · ${label('reverse')} · ${label('left')} · ${label('right')}`],
      ['Brake / drift; flip in air',label('brake')],['Jump / hold to hover · flip',`${label('jump')} · ${label('flip')}`],
      ['Boost / roll',`${label('boost')} · ${label('rollLeft')} / ${label('rollRight')}`],
      ['Enter / exit · unstuck · camera',`${label('interact')} · ${label('reset')} · ${label('camera')}`],
      ['Autopilot · fleet · shop · scores · awards',`${label('autopilot')} · ${label('fleet')} · ${label('shop')} · ${label('scores')} · ${label('awards')}`],
    ]){const p=document.createElement('p'),kbd=document.createElement('kbd');kbd.textContent=keys;p.append(kbd,` · ${text}`);guide.append(p);}
    const shortcuts=document.createElement('p');shortcuts.textContent='Double-tap Shift to self-drive to a delivery; triple-tap Shift for a charger.';guide.append(shortcuts);
    const note=document.createElement('small');note.textContent='Blue sky lanes add speed and air; golden thermals lift and refill you. Edit bindings in Actions → Controls & gamepad.';guide.append(note);
    for(const [id,action,text] of [['recover','reset','Unstuck'],['fleet','fleet','Fleet'],['shop','shop','Shop'],['scores','scores','Scores'],['awards','awards','Awards']] as const)$(id).textContent=`${label(action)} · ${text}`;
  };
  const focusBinding=(action:KeyAction,slot:0|1)=>list.querySelector<HTMLButtonElement>(`[data-binding="${action}-${slot}"]`)?.focus();
  const persist=()=>{controls.clear();feedback.textContent=saveBindings(controls.bindings)?'Saved on this browser.':'Changed for this session; this browser could not save your bindings.';render();};
  window.addEventListener('keydown',event=>{
    if(!dialog.open||!capture)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();const {action,slot}=capture;capture=null;feedback.textContent='Change canceled.';render();focusBinding(action,slot);return;}
    if(event.ctrlKey||event.metaKey||event.altKey){feedback.textContent='Choose a single key without Ctrl, Alt, or Command.';return;}
    if(event.code==='Backspace'||validKey(event.code)){
      event.preventDefault();event.stopImmediatePropagation();
      const code=event.code==='Backspace'?'':event.code;
      const conflict=code&&KEY_ACTIONS.find(action=>controls.bindings[action].some((key,slot)=>key===code&&(action!==capture!.action||slot!==capture!.slot)));
      if(conflict){feedback.textContent=`${keyLabel(code)} is already assigned to ${ACTION_LABELS[conflict]}. Clear it there first.`;return;}
      const {action,slot}=capture;controls.bindings[action][slot]=code;capture=null;persist();focusBinding(action,slot);
    }else feedback.textContent='Choose a letter, number, arrow, Space, or Shift. Backspace clears; Escape cancels.';
  },true);
  $('bindings-reset').onclick=()=>{capture=null;controls.bindings=defaultBindings();persist();};
  $('controls-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{capture=null;close();});
  for(const id of ['control-settings','control-settings-menu'])$(id).onclick=()=>{open();feedback.textContent='Select a key to change it. Each action can have two keys.';render();dialog.showModal();};
  render();
  return {label,refreshStatus:()=>{const status=controls.gamepadStatus==='connected'?'Controller connected':controls.gamepadStatus==='unsupported'?'Controller connected, but its layout is not supported.':'No controller detected. Connect one and press a button.';if($('gamepad-status').textContent!==status)$('gamepad-status').textContent=status;}};
}
