import type { AudioSettings } from './audio';

export type RadioStation = 'chiptune' | 'latent-space' | 'thursdai';
type PodcastStation = Exclude<RadioStation, 'chiptune'>;
type Episode = { title: string; audio: string; link: string };
const STORAGE_KEY = 'tesland.radio.station';
const CATALOG_TTL_MS = 60 * 60 * 1000;
const isStation = (value: string | null): value is RadioStation => value === 'chiptune' || value === 'latent-space' || value === 'thursdai';

/** Local-only radio. The Worker supplies episode metadata, never the audio bytes. */
export class Radio {
  station: RadioStation = 'chiptune';
  episode: Episode | null = null;
  status = 'The original 8-bit soundtrack plays while driving.';
  loading = false;
  private media = new Audio();
  private catalogs = new Map<PodcastStation, Episode[]>();
  private fetchedAt = new Map<PodcastStation, number>();
  private remaining = new Map<PodcastStation, Episode[]>();
  private generation = 0;
  private resumeOnVisible = false;

  constructor(private changed: () => void) {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (isStation(saved)) this.station = saved; } catch { /* Optional preference. */ }
    if (this.station !== 'chiptune') this.status = 'Choose Play to listen to a random episode.';
    this.media.preload = 'none';
    this.media.addEventListener('playing', () => { this.status = 'Playing'; this.changed(); });
    this.media.addEventListener('pause', () => { if (this.station !== 'chiptune' && this.media.paused && !this.media.ended) this.status = 'Paused'; this.changed(); });
    this.media.addEventListener('ended', () => { void this.next(true); });
    this.media.addEventListener('error', () => { if (this.episode && this.station !== 'chiptune') { this.status = 'Stream unavailable. Try another episode.'; this.changed(); } });
  }
  get playing(): boolean { return !this.media.paused && !this.media.ended; }
  setVolume(settings: AudioSettings): void {
    this.media.muted = settings.muted;
    this.media.volume = settings.master / 100 * settings.music / 100;
  }
  select(station: RadioStation): void {
    if (station === this.station) return;
    this.generation++; this.media.pause(); this.media.removeAttribute('src'); this.episode = null;
    this.station = station; this.loading = false; this.resumeOnVisible = false;
    this.status = station === 'chiptune' ? 'The original 8-bit soundtrack plays while driving.' : 'Loading episodes…';
    try { localStorage.setItem(STORAGE_KEY, station); } catch { /* Optional preference. */ }
    this.changed();
    if (station !== 'chiptune') void this.prepare();
  }
  async prepare(): Promise<void> {
    const station = this.station;
    if (station === 'chiptune' || this.episode || this.loading) return;
    const generation = this.generation;
    this.loading = true; this.status = 'Loading episodes…'; this.changed();
    try {
      let episodes = this.catalogs.get(station);
      if (!episodes || Date.now() - (this.fetchedAt.get(station) ?? 0) >= CATALOG_TTL_MS) {
        const response = await fetch(`/api/radio/${station}`, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error('Feed unavailable');
        const data = await response.json() as { episodes?: Episode[] };
        episodes = data.episodes?.filter(e => typeof e.title === 'string' && typeof e.audio === 'string' && e.audio.startsWith('https://'));
        if (!episodes?.length) throw new Error('No episodes');
        if (generation !== this.generation) return;
        this.catalogs.set(station, episodes);
        this.fetchedAt.set(station, Date.now());
        this.remaining.delete(station);
      }
      if (generation !== this.generation) return;
      this.episode = this.draw(station, episodes);
      this.status = 'Ready — press Play to listen.';
    } catch {
      if (generation === this.generation) this.status = 'Could not load episodes. Press Play to retry.';
    } finally {
      if (generation === this.generation) { this.loading = false; this.changed(); }
    }
  }
  private draw(station: PodcastStation, episodes: Episode[]): Episode {
    let pool = this.remaining.get(station);
    if (!pool?.length) { pool = episodes.slice(); this.remaining.set(station, pool); }
    let index = Math.floor(Math.random() * pool.length);
    if (pool.length > 1 && pool[index] === this.episode) index = (index + 1) % pool.length;
    return pool.splice(index, 1)[0];
  }
  async play(): Promise<void> {
    if (this.station === 'chiptune') return;
    const generation = this.generation;
    if (!this.episode) await this.prepare();
    if (generation !== this.generation || !this.episode) return;
    if (this.media.src !== this.episode.audio) this.media.src = this.episode.audio;
    try { await this.media.play(); }
    catch { if (generation === this.generation) { this.status = 'Playback blocked or unavailable. Press Play to try again.'; this.changed(); } }
  }
  pause(): void { this.resumeOnVisible = false; this.media.pause(); this.status = 'Paused'; this.changed(); }
  async next(autoplay = this.playing): Promise<void> {
    if (this.station === 'chiptune') return;
    const station = this.station, generation = ++this.generation;
    this.media.pause(); this.media.removeAttribute('src');
    const episodes = this.catalogs.get(station);
    if (!episodes || Date.now() - (this.fetchedAt.get(station) ?? 0) >= CATALOG_TTL_MS) { this.episode = null; this.loading = false; await this.prepare(); }
    else { this.episode = this.draw(station, episodes); this.status = 'Ready — press Play to listen.'; this.changed(); }
    if (autoplay && generation === this.generation) await this.play();
  }
  visibility(hidden: boolean): void {
    if (hidden) { this.resumeOnVisible = this.playing; if (this.resumeOnVisible) { this.media.pause(); this.status = 'Paused while this tab is hidden.'; this.changed(); } }
    else if (this.resumeOnVisible) { this.resumeOnVisible = false; void this.play(); }
  }
}
