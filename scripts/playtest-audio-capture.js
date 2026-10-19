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
  window.__teslandAudioCapture = {
    async start() {
      const running = [...captures].filter(([context]) => context.state === 'running');
      if (running.length !== 1) throw new Error('Expected one running game audio graph. Trigger a game input before recording.');
      chunks = [];
      recorder = new MediaRecorder(running[0][1].stream, { mimeType: 'audio/webm;codecs=opus' });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      await new Promise((resolve, reject) => {
        recorder.onstart = resolve;
        recorder.onerror = () => reject(new Error('Audio recorder failed to start.'));
        recorder.start();
      });
    },
    async stop() {
      if (!recorder || recorder.state !== 'recording') throw new Error('Audio recorder is not recording.');
      await new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () => reject(new Error('Audio recorder failed to stop.'));
        recorder.stop();
      });
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
