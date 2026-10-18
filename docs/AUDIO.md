# Audio design and integration contract

Tesland's audio is a locally synthesized, low-key arcade mix. The music is an original 108 BPM, four-chord chiptune loop; soft filtered square and triangle voices leave room for the driving cues. No third-party recordings, music files, remote requests or additional audio dependencies are used. The composition and generated sounds are first-party MIT-licensed project assets.

## Player controls

The always-visible **♫** button opens Sound settings from the menu or drive. Master, Music and Effects each have a separate volume control; Mute all silences the complete mix. Preferences are stored only in this browser's local storage when available, and unavailable storage does not prevent play. Defaults are deliberately conservative. A test cue lets a player check their output. Audio starts from the user's drive or test-button gesture, never on page load; it suspends while the tab is hidden and can resume on the next interaction. Existing visual information remains available when sound is muted.

## Radio stations

The **♫** panel offers the original 8-bit music, [Latent Space](https://www.latent.space/podcast) and [ThursdAI](https://sub.thursdai.news/podcast). Podcast selection loads a shuffled set of public episodes; Play starts the selected episode, and Next picks another. After an episode finishes the next starts when the browser permits it. The current episode title links to its publisher. Selecting the 8-bit station stops the podcast; selecting a podcast silences synthesized music while leaving effects audible. Master and Music / radio govern both music sources, and Mute all silences both. Some mobile browsers control media volume through device controls instead of the page. The chosen station is saved in this browser, but podcast audio never starts automatically on page load. Playback pauses while the tab is hidden and attempts to resume when visible; if the browser blocks this, press Play again.

The fixed public RSS feeds are [Latent Space](https://api.substack.com/feed/podcast/1084089.rss) and [ThursdAI](https://api.substack.com/feed/podcast/1801228.rss), identified by their own podcast feed metadata. The Worker uses a bounded streaming parser and caches only episode titles, page links and stream URLs for an hour; long-lived tabs refresh their catalogs when changing episodes after that interval; it is not a general-purpose proxy. The browser streams the audio directly from the publisher's enclosure URL and redirects, so the audio provider can see the listener's IP and normal request information. Episodes are subject to availability and the provider's delivery rules. We do not copy or store recordings. A feed or stream error is shown in the panel, and the original music remains available.

## Sound map

| Gameplay | Sound | Source of truth / limitation |
|---|---|---|
| Driving | Soft EV motor, increasing with speed | Local controlled vehicle velocity; silent on foot |
| Speed and flight | Filtered wind, increasing with speed and altitude | Local velocity and height |
| Rocket jump and thrusters | Ascending jump chirp, short hiss and continuous thrust | Authoritative jump burst and thruster bitmask; boost, hover and flip share the thrust layer |
| Landing | Low, velocity-scaled thump | Authoritative support transition onto ground, overpass, ramp, roof or loop; based on observed snapshots |
| Crash | Low impact and filtered noise | Local damage or a sudden slowdown near an obstacle at the health floor; small impacts and skipped snapshots can be missed |
| Police | Alert on pursuit; swept siren that fades with distance and pans toward the closest active patrol | Shared police target and car positions; no sound for patrols without a pursuit |
| Citation | Descending warning | Increase in local player's authoritative ticket count |
| Restaurant pickup / customer delivery | Different ascending chimes | Order stage and completed-delivery count, including zero-bonus pickups |
| Repair / compressed-air / Rocket pickup | Distinct chime / hiss / rising rocket chime | A nearby pickup disappearing from the shared world; attribution is approximate when drivers overlap |
| Station refill | Brief soft confirmation | Local car on ground and stopped in a station ring or charging bay while refilling |
| Achievement | Short four-note flourish | Increase in locally observed unlocked achievements |

## Architecture for future contributors

- `src/audio-events.ts` derives one-shot cues from successive authoritative world snapshots. The initial observation, time reset, entity switch and teleport do not manufacture impact sounds. Repeated identical snapshots do not replay a cue. Crash detection is presentation-only and intentionally approximate; it is not a gameplay or anti-cheat signal.
- `src/audio.ts` owns a single lazily created Web Audio context, music and effects buses, a master gain and compressor. It schedules musical notes ahead against the audio clock, uses oscillator envelopes and a reusable filtered-noise buffer, and fades continuous layers. The nearest pursuing police car supplies the siren's attenuation and stereo position. Named `SoundCue` values in `audio-events.ts` are the replaceable presentation contract. Sounds never alter the simulation.
- `src/main.ts` connects the audio adapter to the session, document visibility and controls. Inactive menu, connecting and disconnected states silence driving ambience; no sounds are queued for later. The music fades out outside active play. Settings controls neutralize driving input and leave multiplayer heartbeats intact. Citations take priority over the sound dialog.
- Podcast playback is local to each player: `src/radio.ts` owns the HTML audio element, selection and shuffle; `worker/radio.ts` exposes metadata for two fixed feeds. No podcast state enters the game protocol.
- This is a client presentation layer. It adds no gameplay network messages, authoritative state or room persistence. Do not drive gameplay from sound or add a second simulation. If future assets replace the synthesis, preserve the cue names, volume buses, autoplay handling, visual equivalents and license provenance.

The sound design follows established browser guidance: create or resume audio after a user gesture ([MDN Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)); schedule notes against the audio clock with a short look-ahead ([MDN advanced techniques](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)); provide separate controls for music and effects ([Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/provide-separate-volume-controls-or-mutes-for-effects-speech-and-background-music/)). Gain envelopes and a master compressor limit abrupt clicks and overlapping peaks. Timing, apparent loudness and mix quality still need listening checks across real devices.
