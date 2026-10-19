// Installed only in the disposable browser used for tab recording. Frames
// come from Chromium's tab media capture, not Playwright's JPEG screencast.
(() => {
  let current, starting = false, unusable = false;
  const transition = (recorder, event, action) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tab recorder ${event} timed out.`)), 10000);
    try {
      recorder[`on${event}`] = () => { clearTimeout(timer); resolve(); };
      action();
    } catch (error) { clearTimeout(timer); reject(error); }
  });
  // A timed-out page-to-Node binding may still be in flight. The caller must
  // close and drain its own file handle before deleting the partial file.
  const drainQueue = state => {
    if (!state.drain) state.drain = new Promise(resolve => {
      const timer = setTimeout(() => {
        state.closed = true;
        unusable = true;
        state.error ||= new Error('Tab recording chunk drain timed out.');
        resolve(false);
      }, 10000);
      state.queue.then(() => { clearTimeout(timer); resolve(true); }, error => {
        clearTimeout(timer);
        state.error ||= error || new Error('Could not drain tab recording chunks.');
        resolve(false);
      });
    });
    return state.drain;
  };
  const stopTracks = (stream, knownTrack) => {
    let ok = true, tracks = [];
    if (stream) {
      try {
        const found = stream.getTracks();
        if (Array.isArray(found)) tracks = found;
        else ok = false;
      } catch { ok = false; }
    }
    if (knownTrack && !tracks.includes(knownTrack)) tracks.push(knownTrack);
    for (const track of tracks) { try { track.stop(); } catch { ok = false; } }
    return ok;
  };
  const stopRecorder = state => {
    let ok = true;
    try { state.recorder.ondataavailable = null; } catch { ok = false; }
    try { if (state.recorder.state !== 'inactive') state.recorder.stop(); } catch { ok = false; }
    return ok;
  };
  const detach = state => {
    let ok = true;
    try { state.track.removeEventListener('capturehandlechange', state.onChange); } catch { ok = false; }
    try { state.track.removeEventListener('ended', state.onEnded); } catch { ok = false; }
    return ok;
  };
  window.__teslandTabCapture = {
    async start(fps, expectedOrigin) {
      if (unusable) throw new Error('Tab recording requires a fresh browser after incomplete cleanup.');
      if (current || starting) throw new Error('Tab recording already active.');
      starting = true;
      const devices = navigator.mediaDevices;
      let configured = false, stream, state, timer, expired = false;
      const clearConfig = () => {
        if (!configured) return true;
        try { devices.setCaptureHandleConfig(); configured = false; return true; } catch { return false; }
      };
      try {
        if (!devices || typeof devices.setCaptureHandleConfig !== 'function' ||
            typeof devices.getDisplayMedia !== 'function' || typeof crypto.randomUUID !== 'function')
          throw new Error('Tab capture identity verification is unavailable.');
        if (typeof expectedOrigin !== 'string' || !location.origin || location.origin === 'null' || location.origin !== expectedOrigin)
          throw new Error('Tab capture origin does not match the requested target.');
        const expectedHandle = crypto.randomUUID();
        configured = true;
        devices.setCaptureHandleConfig({ handle: expectedHandle, exposeOrigin: true, permittedOrigins: [expectedOrigin] });
        const selection = devices.getDisplayMedia({ video: { frameRate: { ideal: fps, max: fps } }, audio: false, preferCurrentTab: true, surfaceSwitching: 'exclude' });
        selection.then(selected => { if (expired && !stopTracks(selected)) unusable = true; }, () => {});
        try {
          stream = await Promise.race([selection, new Promise((_, reject) => { timer = setTimeout(() => { expired = true; unusable = true; reject(new Error('Tab capture selection timed out.')); }, 10000); })]);
        } finally { clearTimeout(timer); }
        const videoTracks = stream.getVideoTracks();
        const track = videoTracks[0];
        if (videoTracks.length !== 1 || !track || typeof track.getCaptureHandle !== 'function')
          throw new Error('Tab capture identity verification is unavailable.');
        const settings = track.getSettings();
        if (settings.displaySurface !== 'browser') throw new Error('Expected a browser tab capture.');
        const mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error('VP8 tab recording is unavailable.');
        const recorder = new MediaRecorder(stream, { mimeType });
        const matches = () => {
          try {
            const handle = track.getCaptureHandle();
            return track.readyState === 'live' && track.getSettings().displaySurface === 'browser' &&
              handle?.handle === expectedHandle && handle?.origin === expectedOrigin;
          } catch { return false; }
        };
        state = { recorder, stream, track, matches, clearConfig, invalid: false, closed: false, cleanupIssues: new Set(),
          settings: { displaySurface: settings.displaySurface, width: settings.width, height: settings.height, frameRate: settings.frameRate },
          queue: Promise.resolve(), queuedBytes: 0, bytes: 0, chunks: 0, error: null, startedAt: 0 };
        const invalidate = () => {
          if (state.invalid) return;
          state.invalid = true;
          state.closed = true;
          state.error ||= new Error('Tab capture identity changed or track ended.');
          if (!stopRecorder(state)) state.cleanupIssues.add('recorder');
          if (!stopTracks(stream, track)) state.cleanupIssues.add('track');
          clearConfig(); // Retried during finalization if this attempt fails.
        };
        state.invalidate = invalidate;
        // Any change permanently taints the segment: reading only the latest
        // value could miss a switch away and back before the event is handled.
        state.onChange = invalidate;
        state.onEnded = invalidate;
        track.addEventListener('capturehandlechange', state.onChange);
        track.addEventListener('ended', state.onEnded);
        if (!matches()) { invalidate(); throw state.error; }
        const guard = () => {
          if (state.invalid || state.closed) return false;
          if (!matches()) { invalidate(); return false; }
          return true;
        };
        recorder.onerror = event => { state.error ||= event.error || new Error('Tab recorder failed.'); };
        recorder.ondataavailable = event => {
          if (!guard() || !event.data.size) return;
          state.queuedBytes += event.data.size;
          if (state.queuedBytes > 64 * 1024 * 1024) {
            state.error ||= new Error('Tab recording could not write chunks fast enough.');
            state.closed = true;
            if (!stopRecorder(state)) state.cleanupIssues.add('recorder');
            if (!stopTracks(stream, track)) state.cleanupIssues.add('track');
            clearConfig(); // Retried during finalization if this attempt fails.
            return;
          }
          state.queue = state.queue.then(async () => {
            if (!guard()) return;
            const encoded = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = () => reject(new Error('Could not read tab recording chunk.'));
              reader.readAsDataURL(event.data);
            });
            if (!guard()) return;
            await window.__teslandTabChunk(state.chunks, encoded);
            state.chunks++;
            state.bytes += event.data.size;
            state.queuedBytes -= event.data.size;
          }).catch(error => { state.error ||= error || new Error('Could not write tab recording chunk.'); });
        };
        current = state;
        await transition(recorder, 'start', () => recorder.start(1000));
        if (state.invalid || !matches()) { invalidate(); throw state.error || new Error('Tab capture identity changed or track ended.'); }
        if (state.error) throw state.error;
        state.startedAt = performance.now();
        return state.settings;
      } catch (error) {
        const issues = state?.cleanupIssues ?? new Set();
        if (state) {
          state.closed = true;
          if (!stopRecorder(state)) issues.add('recorder');
          if (!stopTracks(stream, state.track)) issues.add('track');
          if (!detach(state)) issues.add('listeners');
        } else if (!stopTracks(stream)) {
          issues.add('track');
        }
        if (!clearConfig()) issues.add('handle');
        if (state && !await drainQueue(state)) issues.add('queue');
        current = undefined;
        if (issues.size) {
          unusable = true;
          throw new Error(`Tab capture failed and cleanup was incomplete (${[...issues].join(', ')}).`, { cause: error });
        }
        throw error;
      } finally { starting = false; }
    },
    async stop() {
      if (starting) throw new Error('Tab recording is still starting.');
      if (!current) throw new Error('Tab recording is not active.');
      const state = current;
      if (state.stopping) throw new Error('Tab recording is already stopping.');
      state.stopping = true;
      const stoppedAt = performance.now();
      let failed = false, originalError;
      try {
        if (!state.matches()) state.invalidate();
        if (!state.invalid && state.recorder.state !== 'inactive') await transition(state.recorder, 'stop', () => state.recorder.stop());
        // MediaRecorder dispatches its final data before stop; freeze the
        // queue before draining it so no later callback can extend the wait.
        state.recorder.ondataavailable = null;
        if (!await drainQueue(state)) throw state.error || new Error('Could not drain tab recording chunks.');
        if (!state.matches()) state.invalidate();
        if (state.invalid) throw state.error || new Error('Tab capture identity changed or track ended.');
        if (state.error) throw state.error;
        if (!state.chunks || !state.bytes || stoppedAt <= state.startedAt) throw new Error('Tab recording is empty.');
      } catch (error) {
        failed = true;
        originalError = error;
        throw error;
      } finally {
        // Do not allow late dataavailable callbacks to write after the caller
        // closes its output file, including when finalization fails.
        state.closed = true;
        if (!stopRecorder(state)) state.cleanupIssues.add('recorder');
        if (failed || state.invalid) {
          if (!detach(state)) state.cleanupIssues.add('listeners');
          if (!stopTracks(state.stream, state.track)) state.cleanupIssues.add('track');
          state.clearConfig(); // Retried below if it fails.
        }
        if (!await drainQueue(state)) state.cleanupIssues.add('queue');
        if (!detach(state)) state.cleanupIssues.add('listeners');
        if (!stopTracks(state.stream, state.track)) state.cleanupIssues.add('track');
        if (!state.clearConfig()) state.cleanupIssues.add('handle');
        current = undefined;
        if (state.cleanupIssues.size) {
          unusable = true;
          throw new Error(`Tab recording cleanup was incomplete (${[...state.cleanupIssues].join(', ')}).`, { cause: failed ? originalError : state.error });
        }
        if (!failed && state.invalid) throw state.error || new Error('Tab capture identity changed or track ended.');
        if (!failed && state.error) throw state.error;
      }
      return { format: 3, mode: 'tab', captureHandleCheck: 'matched', startedAtBrowserMs: state.startedAt, stoppedAtBrowserMs: stoppedAt,
        chunks: state.chunks, bytes: state.bytes, settings: state.settings };
    },
  };
})();
