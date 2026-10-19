// Installed only in the disposable browser used for tab recording.  Frames
// come from Chromium's tab media capture, not Playwright's JPEG screencast.
(() => {
  let current;
  const transition = (recorder, event, action) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tab recorder ${event} timed out.`)), 10000);
    recorder[`on${event}`] = () => { clearTimeout(timer); resolve(); };
    try { action(); } catch (error) { clearTimeout(timer); reject(error); }
  });
  window.__teslandTabCapture = {
    async start(fps) {
      if (current) throw new Error('Tab recording already active.');
      let expired = false, timer;
      const selection = navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: fps, max: fps } }, audio: false, preferCurrentTab: true });
      selection.then(stream => { if (expired) stream.getTracks().forEach(track => track.stop()); }, () => {});
      let stream;
      try {
        stream = await Promise.race([selection, new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('Tab capture selection timed out.')); }, 10000); })]);
      } finally { clearTimeout(timer); }
      try {
        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings();
        if (!track || settings.displaySurface !== 'browser') throw new Error('Expected a browser tab capture.');
        const mimeType = 'video/webm;codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) throw new Error('VP8 tab recording is unavailable.');
        const recorder = new MediaRecorder(stream, { mimeType });
        const state = { recorder, stream, settings: { displaySurface: settings.displaySurface, width: settings.width, height: settings.height, frameRate: settings.frameRate },
          queue: Promise.resolve(), queuedBytes: 0, bytes: 0, chunks: 0, error: null, startedAt: 0 };
        recorder.onerror = event => { state.error = event.error || new Error('Tab recorder failed.'); };
        recorder.ondataavailable = event => {
          if (!event.data.size) return;
          state.queuedBytes += event.data.size;
          if (state.queuedBytes > 64 * 1024 * 1024) {
            state.error = new Error('Tab recording could not write chunks fast enough.');
            if (recorder.state !== 'inactive') recorder.stop();
            return;
          }
          state.queue = state.queue.then(async () => {
            const encoded = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = () => reject(new Error('Could not read tab recording chunk.'));
              reader.readAsDataURL(event.data);
            });
            await window.__teslandTabChunk(state.chunks, encoded);
            state.chunks++;
            state.bytes += event.data.size;
            state.queuedBytes -= event.data.size;
          }).catch(error => { state.error = error; });
        };
        current = state;
        await transition(recorder, 'start', () => recorder.start(1000));
        state.startedAt = performance.now();
        return state.settings;
      } catch (error) {
        current = undefined;
        stream.getTracks().forEach(track => track.stop());
        throw error;
      }
    },
    async stop() {
      if (!current) throw new Error('Tab recording is not active.');
      const state = current;
      const stoppedAt = performance.now();
      try {
        if (state.recorder.state !== 'inactive') await transition(state.recorder, 'stop', () => state.recorder.stop());
        await state.queue;
        if (state.error) throw state.error;
        if (!state.chunks || !state.bytes || stoppedAt <= state.startedAt) throw new Error('Tab recording is empty.');
        return { format: 2, mode: 'tab', startedAtBrowserMs: state.startedAt, stoppedAtBrowserMs: stoppedAt,
          chunks: state.chunks, bytes: state.bytes, settings: state.settings };
      } finally {
        state.stream.getTracks().forEach(track => track.stop());
        current = undefined;
      }
    },
  };
})();
