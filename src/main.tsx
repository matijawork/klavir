import { render } from 'preact';
import './design/tokens.css';
import './design/app.css';
import { installMonitor } from './audio/monitor.ts';
import { autoConnectMidi } from './midi/midi.ts';
import { installMockMidi } from './midi/mock.ts';
import { App } from './ui/App.tsx';

if (new URLSearchParams(location.search).has('mockmidi')) installMockMidi();
installMonitor();
void autoConnectMidi();
render(<App />, document.getElementById('app')!);
