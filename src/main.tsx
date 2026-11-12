import { render } from 'preact';
import './design/tokens.css';
import './design/app.css';
import { autoConnectMidi } from './midi/midi.ts';
import { installMockMidi } from './midi/mock.ts';
import { App } from './ui/App.tsx';

if (new URLSearchParams(location.search).has('mockmidi')) installMockMidi();
void autoConnectMidi();
render(<App />, document.getElementById('app')!);
