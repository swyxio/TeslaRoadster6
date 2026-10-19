// Installed only in an explicitly audio-enabled playtest browser. Tee Web Audio
// output into MediaRecorder; HTMLMediaElement streams and the microphone are
// deliberately outside this capture.
(() => {
  const originalConnect = AudioNode.prototype.connect;
  const captures = new Map();
  AudioNode.prototype.connect = function(destination, ...options) {
    const result = originalConnect.call(this, destination, ...options);
    const context = this.context;
    if (context instanceof AudioContext && destination === context.destination) {
      let capture = captures.get(context);
      if (!capture) {
        capture = context.createMediaStreamDestination();
        captures.set(context, capture);
      }
      originalConnect.call(this, capture, ...(options.length ? [options[0]] : []));
    }
    return result;
  };
  let recorder;
  let chunks;
  const running = () => [...captures].filter(([context]) => context.state === 'running');
  const transition = (instance, event, action) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Audio recorder ${event} timed out.`)), 10000);
    const finish = callback => value => { clearTimeout(timer); callback(value); };
    instance[`on${event}`] = finish(resolve);
    instance.onerror = finish(() => reject(new Error(`Audio recorder failed to ${event}.`)));
    try { action(); } catch (error) { clearTimeout(timer); reject(error); }
  });
  window.__teslandAudioCapture = {
    ready() { return running().length === 1; },
    async start() {
      const graphs = running();
      if (graphs.length !== 1) throw new Error('Expected one running game audio graph. Trigger a game input before recording.');
      chunks = [];
      recorder = new MediaRecorder(graphs[0][1].stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      await transition(recorder, 'start', () => recorder.start());
    },
    async cancel() {
      if (!recorder) return;
      const current = recorder;
      current.ondataavailable = null;
      try { if (current.state !== 'inactive') await transition(current, 'stop', () => current.stop()); }
      finally { recorder = undefined; chunks = undefined; }
    },
    async stop() {
      if (!recorder || recorder.state !== 'recording') throw new Error('Audio recorder is not recording.');
      await transition(recorder, 'stop', () => recorder.stop());
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read captured audio.'));
        reader.readAsDataURL(new Blob(chunks, { type: 'audio/webm;codecs=opus' }));
      });
      recorder = undefined;
      return data.split(',')[1];
    },
  };
})();
