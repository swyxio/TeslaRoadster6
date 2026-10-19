type ShiftCode = 'ShiftLeft' | 'ShiftRight';
type Options = {
  enabled: () => boolean;
  allowed: (code: ShiftCode) => boolean;
  onDoubleTap: () => void;
  onTripleTap: () => void;
  now?: () => number;
  schedule?: (callback:()=>void,delay:number)=>()=>void;
};

const MAX_HOLD_MS = 300;
const MAX_GAP_MS = 350;
const isShift = (code: string): code is ShiftCode => code === 'ShiftLeft' || code === 'ShiftRight';
const editable = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || !!element.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'));
};

/** Shift still reaches Controls immediately; only the double-tap action waits for a possible third tap. */
export function listenForDoubleShift(options: Options) {
  const now=options.now??(()=>performance.now());
  const schedule=options.schedule??((callback,delay)=>{const timer=setTimeout(callback,delay);return ()=>clearTimeout(timer);});
  let last:{code:ShiftCode;released:number;count:1|2}|null=null;
  let pressed:{code:ShiftCode;started:number;count:1|2|3}|null=null;
  let cancelPending:(()=>void)|null=null;
  const reset=()=>{cancelPending?.();cancelPending=null;last=null;pressed=null;};
  const available=()=>options.enabled()&&!document.hidden&&!document.querySelector('dialog[open]')&&!editable(document.activeElement);
  const keydown=(event:KeyboardEvent)=>{
    if(!available()||editable(event.target)||event.ctrlKey||event.altKey||event.metaKey){reset();return;}
    if(!isShift(event.code)){if(!event.repeat)reset();return;}
    if(!options.allowed(event.code)){reset();return;}
    if(event.repeat)return;
    if(pressed){if(pressed.code!==event.code)reset();return;}
    const time=now(),gap=last?time-last.released:Infinity;
    const count=last&&last.code===event.code&&gap>=0&&gap<=MAX_GAP_MS?(last.count+1) as 2|3:1;
    if(count===3){cancelPending?.();cancelPending=null;}else if(count===1)reset();
    pressed={code:event.code,started:time,count};
  };
  const keyup=(event:KeyboardEvent)=>{
    if(!available()||editable(event.target)||event.ctrlKey||event.altKey||event.metaKey){reset();return;}
    if(!isShift(event.code))return;
    if(!options.allowed(event.code)||!pressed||pressed.code!==event.code){reset();return;}
    const time=now(),held=time-pressed.started,{count,code}=pressed;
    if(held<0||held>MAX_HOLD_MS){reset();return;}
    pressed=null;
    if(count===3){reset();options.onTripleTap();return;}
    last={code,released:time,count};
    if(count===2)cancelPending=schedule(()=>{
      cancelPending=null;last=null;
      if(available()&&options.allowed(code))options.onDoubleTap();
    },MAX_GAP_MS);
  };
  const visibility=()=>{if(document.hidden)reset();};
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',reset);
  document.addEventListener('visibilitychange',visibility);document.addEventListener('focusin',reset);document.addEventListener('pointerdown',reset);
  return {reset,dispose(){reset();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('focusin',reset);document.removeEventListener('pointerdown',reset);}};
}
