import type { Entity, World } from '../shared/game';
import { refillStationFor } from '../shared/charging';
import { SoundEventTracker, type SoundCue, type SoundEvent } from './audio-events';

export type AudioSettings = { master: number; music: number; effects: number; muted: boolean };
const DEFAULTS:AudioSettings={master:55,music:35,effects:70,muted:false};
const STORAGE_KEY='polyav.audio.v1';
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const midi=(note:number)=>440*Math.pow(2,(note-69)/12);

function settingsFromStorage():AudioSettings {
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)??'null');
    if(!saved||typeof saved!=='object')return {...DEFAULTS};
    const volume=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?clamp(value,0,100):fallback;
    return {master:volume(saved.master,DEFAULTS.master),music:volume(saved.music,DEFAULTS.music),effects:volume(saved.effects,DEFAULTS.effects),muted:saved.muted===true};
  } catch { return {...DEFAULTS}; }
}

// An original, gentle four-chord loop: rests leave room for driving and alert cues.
const MELODY=[
  72,0,76,0,79,76,74,0,72,0,67,0,69,0,71,0,
  72,0,76,0,81,79,76,0,74,0,72,0,69,0,67,0,
  69,0,72,0,77,76,72,0,69,0,72,0,76,0,77,0,
  79,0,74,0,71,74,76,0,72,0,71,0,67,0,0,0,
];
const CHORDS=[[48,52,55,59],[45,48,52,55],[53,57,60,64],[55,59,62,64]];

/** One small Web Audio graph for locally synthesized music, cues and driving ambience. */
export class GameAudio {
  settings:AudioSettings=settingsFromStorage();
  private ctx?:AudioContext;
  private master?:GainNode;
  private music?:GainNode;
  private effects?:GainNode;
  private musicFilter?:BiquadFilterNode;
  private windGain?:GainNode;
  private motorGain?:GainNode;
  private motor?:OscillatorNode;
  private thrustGain?:GainNode;
  private sirenGain?:GainNode;
  private sirenPan?:StereoPannerNode;
  private noise?:AudioBuffer;
  private active=false;
  private musicEnabled=true;
  private nextNote=0;
  private beat=0;
  private tracker=new SoundEventTracker();

  get initialized():boolean{return !!this.ctx;}
  reset():void{this.tracker.reset();}
  setSettings(settings:AudioSettings):void {
    this.settings={master:clamp(settings.master,0,100),music:clamp(settings.music,0,100),effects:clamp(settings.effects,0,100),muted:settings.muted};
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(this.settings));}catch{/* Preferences are optional. */}
    this.applyVolumes();
  }
  setMusicEnabled(enabled:boolean):void {
    this.musicEnabled=enabled; this.applyVolumes();
    if(enabled&&this.ctx)this.nextNote=this.ctx.currentTime+.05;
  }
  private target(param:AudioParam,value:number,seconds=.08):void {
    if(this.ctx)param.setTargetAtTime(value,this.ctx.currentTime,seconds);
  }
  private applyVolumes():void {
    if(!this.ctx||!this.master||!this.music||!this.effects)return;
    const volume=this.settings.muted?0:this.settings.master/100;
    this.target(this.master.gain,volume);
    this.target(this.music.gain,this.active&&this.musicEnabled?this.settings.music/100:0);
    this.target(this.effects.gain,this.settings.effects/100);
  }
  async unlock():Promise<boolean> {
    try {
      if(!this.ctx)this.createGraph();
      if(this.ctx?.state!=='running')await this.ctx?.resume();
      return this.ctx?.state==='running';
    } catch { return false; }
  }
  async visibility(hidden:boolean):Promise<void> {
    if(!this.ctx)return;
    try {
      if(hidden&&this.ctx.state==='running')await this.ctx.suspend();
      else if(!hidden&&this.ctx.state==='suspended')await this.ctx.resume();
    } catch {/* Another user gesture can resume audio. */}
  }
  private createGraph():void {
    const ctx=new AudioContext();this.ctx=ctx;
    const compressor=ctx.createDynamicsCompressor();
    compressor.threshold.value=-15;compressor.knee.value=12;compressor.ratio.value=8;compressor.attack.value=.005;compressor.release.value=.25;
    this.master=ctx.createGain();this.music=ctx.createGain();this.effects=ctx.createGain();
    this.master.gain.value=0;this.music.gain.value=0;this.effects.gain.value=this.settings.effects/100;
    this.music.connect(this.master);this.effects.connect(this.master);this.master.connect(compressor);compressor.connect(ctx.destination);
    this.musicFilter=ctx.createBiquadFilter();this.musicFilter.type='lowpass';this.musicFilter.frequency.value=1900;this.musicFilter.connect(this.music);
    const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
    this.noise=buffer;
    const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
    const windFilter=ctx.createBiquadFilter();windFilter.type='lowpass';windFilter.frequency.value=1050;
    this.windGain=ctx.createGain();this.windGain.gain.value=0;noise.connect(windFilter);windFilter.connect(this.windGain);this.windGain.connect(this.effects);
    const thrustFilter=ctx.createBiquadFilter();thrustFilter.type='lowpass';thrustFilter.frequency.value=530;
    this.thrustGain=ctx.createGain();this.thrustGain.gain.value=0;noise.connect(thrustFilter);thrustFilter.connect(this.thrustGain);this.thrustGain.connect(this.effects);noise.start();
    this.motor=ctx.createOscillator();this.motor.type='triangle';this.motor.frequency.value=70;
    this.motorGain=ctx.createGain();this.motorGain.gain.value=0;this.motor.connect(this.motorGain);this.motorGain.connect(this.effects);this.motor.start();
    const siren=ctx.createOscillator(),lfo=ctx.createOscillator(),sweep=ctx.createGain();
    siren.type='sine';siren.frequency.value=660;lfo.frequency.value=.68;sweep.gain.value=200;lfo.connect(sweep);sweep.connect(siren.frequency);
    this.sirenGain=ctx.createGain();this.sirenGain.gain.value=0;this.sirenPan=ctx.createStereoPanner();
    siren.connect(this.sirenGain);this.sirenGain.connect(this.sirenPan);this.sirenPan.connect(this.effects);siren.start();lfo.start();
    this.applyVolumes();
  }
  private tone(frequency:number,endFrequency:number,duration:number,volume:number,type:OscillatorType,time:number,destination:AudioNode):void {
    const ctx=this.ctx;if(!ctx)return;
    const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type=type;
    oscillator.frequency.setValueAtTime(frequency,time);oscillator.frequency.exponentialRampToValueAtTime(Math.max(1,endFrequency),time+duration);
    gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(Math.max(.00011,volume),time+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,time+Math.max(.025,duration));
    oscillator.connect(gain);gain.connect(destination);oscillator.start(time);oscillator.stop(time+duration+.03);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  private hiss(time:number,duration:number,volume:number,frequency:number):void {
    const ctx=this.ctx;if(!ctx||!this.effects||!this.noise)return;
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=this.noise;
    filter.type='lowpass';filter.frequency.value=frequency;gain.gain.setValueAtTime(Math.max(.0001,volume),time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.effects);source.start(time);source.stop(time+duration+.02);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  play(cue:SoundCue,strength=1):void {
    const ctx=this.ctx,bus=this.effects;if(!ctx||!bus||ctx.state!=='running'||this.settings.muted||!this.settings.effects)return;
    const t=ctx.currentTime+.005,s=clamp(strength,.15,1);
    const tone=(f:number,to:number,d:number,v:number,type:OscillatorType='sine',offset=0)=>this.tone(f,to,d,v*s,type,t+offset,bus);
    switch(cue){
      case 'jump':tone(260,700,.2,.12,'triangle');this.hiss(t,.18,.09*s,1700);break;
      case 'land':tone(115,49,.22,.2,'sine');this.hiss(t,.11,.09*s,500);break;
      case 'boost':tone(140,270,.12,.07,'triangle');this.hiss(t,.18,.10*s,2200);break;
      case 'crash':tone(110,42,.28,.27,'triangle');this.hiss(t,.22,.3*s,2600);break;
      case 'pickup':tone(523,523,.13,.13,'triangle');tone(659,659,.2,.13,'triangle',.10);break;
      case 'delivery':for(const [i,n] of [72,76,79,84].entries())tone(midi(n),midi(n),.24,.14,'triangle',i*.095);break;
      case 'repair':for(const [i,n] of [67,72,76].entries())tone(midi(n),midi(n),.2,.1,'sine',i*.08);break;
      case 'air':tone(480,820,.25,.12,'sine');this.hiss(t,.24,.08*s,2800);break;
      case 'rocket':for(const [i,n] of [72,79,84,88].entries())tone(midi(n),midi(n),.22,.12,'square',i*.07);break;
      case 'refill':tone(620,780,.2,.08,'sine');break;
      case 'pursuit':tone(740,560,.18,.13,'square');tone(740,560,.18,.13,'square',.22);break;
      case 'ticket':tone(440,330,.28,.16,'triangle');tone(330,220,.36,.14,'triangle',.16);break;
      case 'achievement':for(const [i,n] of [76,79,84,88].entries())tone(midi(n),midi(n),.24,.1,'triangle',i*.1);break;
      case 'ferry':tone(115,105,.65,.12,'sine');tone(172,158,.55,.045,'sine');break;
    }
  }
  private scheduleMusic():void {
    const ctx=this.ctx,dest=this.musicFilter;if(!ctx||!dest||!this.active||!this.musicEnabled||this.settings.muted||!this.settings.music)return;
    const now=ctx.currentTime;
    if(this.nextNote<now-.25)this.nextNote=now+.05;
    while(this.nextNote<now+.16){
      const step=this.beat%MELODY.length, chord=CHORDS[Math.floor(step/16)],note=MELODY[step],time=this.nextNote;
      if(note)this.tone(midi(note),midi(note),.19,.065,'square',time,dest);
      if(step%4===0){const bass=chord[step%16===8?2:0]-12;this.tone(midi(bass),midi(bass),.32,.10,'triangle',time,dest);}
      if(step%4===2){const harmony=chord[(Math.floor(step/4)+1)%4];this.tone(midi(harmony),midi(harmony),.17,.045,'triangle',time,dest);}
      this.beat++;this.nextNote+=60/108/2;
    }
  }
  update(world:World,playerId:string,active:boolean):SoundEvent[] {
    if(active!==this.active){this.active=active;this.applyVolumes();if(active&&this.ctx)this.nextNote=this.ctx.currentTime+.05;}
    const player=world.players.find(p=>p.id===playerId),entity=world.entities.find(e=>e.id===player?.entityId);
    if(!active||!entity){this.tracker.reset();this.environment(undefined,world);return [];}
    const atStation=!!refillStationFor(entity);
    const events=this.tracker.update(world,playerId,atStation);
    for(const event of events)this.play(event.cue,event.strength);
    this.environment(entity,world);this.scheduleMusic();return events;
  }
  private environment(e:Entity|undefined,world:World):void {
    if(!this.ctx||!this.windGain||!this.motorGain||!this.motor||!this.thrustGain||!this.sirenGain||!this.sirenPan)return;
    const speed=e?Math.hypot(e.vx,e.vy,e.vz):0;
    const wind=e?clamp((speed-8)/60+Math.max(0,e.y)/180,0,1):0;
    this.target(this.windGain.gain,wind*.085,.18);
    this.target(this.motorGain.gain,e&&e.kind!=='person'?clamp(Math.abs(e.speed)/36,0,1)*.045:0,.12);
    this.target(this.motor.frequency,70+Math.min(speed,55)*3,.1);
    this.target(this.thrustGain.gain,e&&e.thrusters? .18:0,.08);
    const cops=e?world.entities.filter(car=>car.police?.targetId).sort((a,b)=>Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z)):[];
    const cop=cops[0],distance=cop&&e?Math.hypot(cop.x-e.x,cop.y-e.y,cop.z-e.z):Infinity;
    const loudness=clamp(1-distance/160,0,1);
    this.target(this.sirenGain.gain,loudness*loudness*.09,.15);
    const pan=cop&&e?((cop.x-e.x)*Math.cos(e.yaw)-(cop.z-e.z)*Math.sin(e.yaw))/Math.max(distance,1):0;
    this.target(this.sirenPan.pan,clamp(pan,-1,1),.15);
  }
}
