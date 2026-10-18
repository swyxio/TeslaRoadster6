import type { Input } from '../shared/game';
import { loadBindings, type Bindings, type KeyAction } from './key-bindings';

type Action = 'interact' | 'reset' | 'camera' | 'menu' | 'autopilot' | 'fleet' | 'scores' | 'awards' | 'shop';
const actions:KeyAction[]=['interact','reset','camera','autopilot','fleet','scores','awards','shop'];
const clamp=(n:number)=>Math.max(-1,Math.min(1,n));
const axis=(n:number)=>Math.abs(n)<.15?0:Math.sign(n)*(Math.abs(n)-.15)/.85;
const pads=():readonly (Gamepad|null)[]=>{try{return typeof navigator==='undefined'||!navigator.getGamepads?[]:navigator.getGamepads();}catch{return [];}};

/** Input adapters emit intent; touch controls do not depend on keyboard bindings. */
export class Controls {
  private keys = new Set<string>();
  private pointers = new Map<number, string>();
  private jump = 0;
  private flip = 0;
  private pendingJump:number|null = null;
  private jumpHeldSince:number|null = null;
  private previousButtons:boolean[]=[];
  private armed=false;
  private padIndex:number|null=null;
  private suspended=false;
  private speed=0;
  bindings:Bindings=loadBindings();
  gamepadStatus:'connected'|'unsupported'|'none'='none';
  airborne = false;
  enabled = false;
  onAction: (action: Action) => void = () => {};
  onEdge: (kind:'jump'|'flip',id:number) => void = () => {};
  constructor(private getGamepads:()=>readonly (Gamepad|null)[]=pads, private now:()=>number=()=>performance.now()) {
    window.addEventListener('keydown', e => {
      const target=e.target as HTMLElement;
      if (target.matches('input,textarea,select,[contenteditable="true"]') || (e.code==='Space' && target.matches('button,a'))) return;
      if (!this.enabled || e.ctrlKey || e.metaKey || e.altKey) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) {
        const is=(action:KeyAction)=>this.bindings[action].includes(e.code);
        if(is('jump'))this.queueJump();
        if(is('flip')||(is('brake')&&(this.airborne||this.pendingJump!==null)))this.queueFlip();
        if(e.code==='Escape')this.onAction('menu');
        else {const action=actions.find(is);if(action)this.onAction(action as Action);}
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => {this.suspended=true;this.clear();});
    window.addEventListener('focus', () => {this.suspended=false;});
    document.addEventListener('visibilitychange', () => {this.suspended=document.hidden;if(document.hidden)this.clear();});
    document.querySelectorAll<HTMLElement>('[data-control]').forEach(button => {
      button.addEventListener('pointerdown', e => {
        if(!this.enabled)return;
        if(button.dataset.control==='KeyE')this.queueJump();
        if(button.dataset.control==='KeyX'){this.queueFlip();return;}
        e.preventDefault(); button.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, button.dataset.control!); button.classList.add('pressed');
      });
      button.addEventListener('click',e=>{
        if(!this.enabled)return;
        if(e.detail===0&&button.dataset.control==='KeyE')this.queueJump();
        else if(e.detail===0&&button.dataset.control==='KeyX')this.queueFlip();
      });
      const release = (e: PointerEvent) => { this.pointers.delete(e.pointerId); button.classList.remove('pressed'); };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
  }
  private queueJump(){this.jump=(this.jump+1)%2147483648;this.pendingJump=this.jump;this.jumpHeldSince=null;this.onEdge('jump',this.jump);}
  private queueFlip(){this.flip=(this.flip+1)%2147483648;this.onEdge('flip',this.flip);}
  observeFlight(airborne:boolean,lastJump:number,speed=0){this.airborne=airborne;this.speed=speed;if(this.pendingJump===lastJump)this.pendingJump=null;}
  clear() { this.keys.clear(); this.pointers.clear(); this.pendingJump=null; this.jumpHeldSince=null; this.armed=false; document.querySelectorAll('.pressed').forEach(e => e.classList.remove('pressed')); }
  resetSequences(){this.jump=0;this.flip=0;this.pendingJump=null;}
  edgeCounters():Pick<Input,'jump'|'flip'>{return {jump:this.jump,flip:this.flip};}
  read(): Input {
    let available:readonly (Gamepad|null)[]=[];
    try { available=this.getGamepads(); } catch { /* A browser may block gamepad access. */ }
    const pad=available.find(p=>p?.connected&&p.mapping==='standard');
    this.gamepadStatus=pad?'connected':available.some(p=>p?.connected)?'unsupported':'none';
    if(!pad||pad.index!==this.padIndex){this.armed=false;this.previousButtons=[];this.padIndex=pad?.index??null;}
    const buttons=pad?.buttons.map(b=>b.pressed||b.value>.5)??[];
    const pressed=(i:number)=>!!buttons[i]&&!this.previousButtons[i];
    const value=(i:number)=>Math.max(0,Math.min(1,pad?.buttons[i]?.value??0));
    const x=axis(clamp(pad?.axes[0]??0)), rx=axis(clamp(pad?.axes[2]??0));
    const active=this.enabled&&!this.suspended;
    if(!active)this.armed=false;
    else if(pad&&!this.armed&&!buttons.some(Boolean)&&value(6)<.08&&value(7)<.08&&x===0&&rx===0)this.armed=true;
    const usePad=active&&this.armed&&!!pad;
    if(usePad){
      if(pressed(0))this.queueJump();
      if(pressed(2))this.queueFlip();
      for(const [i,action] of [[12,'interact'],[13,'camera'],[14,'reset'],[15,'autopilot']] as const)if(this.enabled&&pressed(i))this.onAction(action);
      if(this.enabled&&pressed(9))this.onAction('menu');
    }
    this.previousButtons=buttons;
    const stillActive=active&&this.enabled&&!this.suspended;
    const down=(action:KeyAction,touch:string)=>stillActive&&(this.bindings[action].some(code=>code&&this.keys.has(code))||[...this.pointers.values()].includes(touch));
    const usePadNow=usePad&&stillActive;
    const jumpHeld=down('jump','KeyE')||(usePadNow&&!!buttons[0]);
    if(jumpHeld){if(this.jumpHeldSince===null)this.jumpHeldSince=this.now();}else this.jumpHeldSince=null;
    const hovering=jumpHeld&&this.jumpHeldSince!==null&&this.now()-this.jumpHeldSince>=250;
    const rt=usePadNow?value(7):0,lt=usePadNow?value(6):0;
    const padBrake=lt>.08&&!this.airborne&&(this.speed>.5||rt>.08);
    const padThrottle=rt-(padBrake?0:lt);
    return { throttle:clamp(Number(down('forward','KeyW'))-Number(down('reverse','KeyS'))+padThrottle), steer:clamp(Number(down('left','KeyA'))-Number(down('right','KeyD'))-(usePadNow?x:0)), boost:down('boost','ShiftLeft')||(usePadNow&&!!buttons[1]), hover:hovering, jump:this.jump, flip:this.flip, roll:clamp(Number(down('rollLeft','KeyQ'))-Number(down('rollRight','KeyR'))+(usePadNow?(Number(!!buttons[4])-Number(!!buttons[5])-rx):0)), brake:down('brake','Space')||padBrake, cockpit:false };
  }
}
