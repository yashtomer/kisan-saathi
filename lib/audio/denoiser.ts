import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IMicrophoneAudioTrack } from 'agora-rtc-react';
import {
  AIDenoiserExtension,
  type AIDenoiserProcessor,
} from 'agora-extension-ai-denoiser';

/**
 * AI noise suppression on the farmer's microphone.
 *
 * Field calls carry tractors, pumps, wind, cattle and other people. Suppressing
 * that before it reaches the network matters more than it would on a desk call:
 * speech recognition degrades badly in noise, and a misheard symptom becomes a
 * wrong diagnosis further down the chain.
 *
 * This complements — does not replace — the agent-side Selective Attention
 * Lock. This cleans the audio; SAL decides whose voice to listen to.
 */

let extension: AIDenoiserExtension | null = null;

/**
 * Registers the extension once per page. Safe to call repeatedly; the second
 * call returns the same instance rather than registering again.
 */
function getExtension(): AIDenoiserExtension | null {
  if (extension) return extension;

  const candidate = new AIDenoiserExtension({
    // WASM served from /public. Must stay in sync with the copy step in
    // package.json's postinstall.
    assetsPath: '/ai-denoiser',
  });

  // Older browsers and low-power devices cannot run the model. Registering it
  // anyway would break the microphone entirely, which is far worse than noise.
  if (!candidate.checkCompatibility()) {
    console.warn('[denoiser] unsupported browser — continuing without it');
    return null;
  }

  AgoraRTC.registerExtensions([candidate]);
  extension = candidate;
  return extension;
}

export type DenoiserHandle = { processor: AIDenoiserProcessor } | null;

/**
 * Pipes a microphone track through noise suppression. Returns null when the
 * environment cannot support it, in which case the call proceeds with raw
 * audio — degraded, never broken.
 */
export async function enableDenoiser(
  track: IMicrophoneAudioTrack,
): Promise<DenoiserHandle> {
  try {
    const ext = getExtension();
    if (!ext) return null;

    const processor = ext.createProcessor();

    processor.on('overload', () => {
      // The device cannot keep up. Dropping to the cheaper stationary model
      // beats stuttering audio.
      console.warn('[denoiser] overloaded — falling back to stationary mode');
      void processor.setMode('STATIONARY_NS');
    });

    processor.on('pipeerror', (error: Error) => {
      console.error('[denoiser] pipeline error:', error);
    });

    // `agora-rtc-react` bundles its own copy of the RTC types, so the
    // processor's nominal type differs from the one this track's pipe()
    // expects even though they are the same runtime object. One cast here is
    // clearer than reshaping the whole signature around it.
    type TrackProcessor = Parameters<IMicrophoneAudioTrack['pipe']>[0];
    track
      .pipe(processor as unknown as TrackProcessor)
      .pipe(track.processorDestination);

    // NSNG is the neural model: it removes non-stationary noise such as voices
    // and machinery, not just steady hum. AGGRESSIVE because a field is not a
    // quiet room, and LOW latency because this sits in a live conversation.
    await processor.setMode('NSNG');
    await processor.setLevel('AGGRESSIVE');
    await processor.setLatency('LOW');
    await processor.enable();

    console.info('[denoiser] active (NSNG, aggressive, low latency)');
    return { processor };
  } catch (error) {
    console.error('[denoiser] failed to start, continuing without it:', error);
    return null;
  }
}

/** Detaches the processor. The track itself is owned by the RTC hooks. */
export async function disableDenoiser(handle: DenoiserHandle): Promise<void> {
  if (!handle) return;
  try {
    await handle.processor.disable();
    handle.processor.unpipe();
  } catch (error) {
    console.error('[denoiser] cleanup failed:', error);
  }
}
