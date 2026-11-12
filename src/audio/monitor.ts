/** Plays the player's own keys through the computer when the "My keys" setting is on. */
import { effect } from '@preact/signals';
import { onNote, sustainDown } from '../midi/midi.ts';
import { settings } from '../store/settings.ts';
import { synthAllOff, synthOff, synthOn, synthPedal, unlockAudio, VOICE_PLAYER } from './synth.ts';

export function installMonitor(): void {
  // MIDI input is not a "user gesture", so audio is unlocked by the first click or key press
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });
  onNote((e) => {
    if (!settings.peek().monitor) return;
    if (e.on) synthOn(VOICE_PLAYER, e.pitch, e.velocity, e.time);
    else synthOff(VOICE_PLAYER, e.pitch);
  });
  effect(() => synthPedal(sustainDown.value));
  effect(() => {
    if (!settings.value.monitor) synthAllOff(VOICE_PLAYER);
  });
}
