import { useEffect, useState } from 'react';
import * as UI from '@codaa/ui';
import type { DemoId } from '../../registry/inventory';
import { DemoFrame, Flag } from '../inspect-component/DemoControls';
import { useLocalAudio } from './useLocalAudio';
import { t } from '../../../shared/i18n/messages';
export function AudioDemo({demo}:{demo:DemoId}) {
  const [failure,setFailure]=useState(false);
  const [disabled,setDisabled]=useState(false);
  const [navigation,setNavigation]=useState(true);
  const [seekDisabled,setSeekDisabled]=useState(false);
  const [volumeDisabled,setVolumeDisabled]=useState(false);
  const [interactive,setInteractive]=useState(true);
  const [active,setActive]=useState(true);
  const [recordable,setRecordable]=useState(true);
  const [recording,setRecording]=useState(false);
  const [samples,setSamples]=useState(Array.from({length:72},(_,i)=>0.15+Math.abs(Math.sin(i*0.6))*0.7));
  const audio=useLocalAudio({simulateError:failure});
  useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSamples(v=>[...v.slice(1),0.1+Math.abs(Math.sin(Date.now()/200))*0.8]),100);return()=>clearInterval(timer);},[recording]);
  return <DemoFrame output={`${audio.track+1} · ${audio.currentTime.toFixed(1)} / ${audio.duration.toFixed(1)} · ${audio.playing?'Play':'Pause'}`} controls={<><Flag label={t('simulatedError')} value={failure} onChange={setFailure}/><Flag label={t('disabled')} value={disabled} onChange={setDisabled}/>
    {demo==='sound-player'?<><Flag label="showNavigation" value={navigation} onChange={setNavigation}/><Flag label="seekDisabled" value={seekDisabled} onChange={setSeekDisabled}/><Flag label="volumeDisabled" value={volumeDisabled} onChange={setVolumeDisabled}/></>:<><Flag label="interactive" value={interactive} onChange={setInteractive}/><Flag label="active" value={active} onChange={setActive}/><Flag label="recordable" value={recordable} onChange={setRecordable}/></>}
  </>}>
    {demo==='sound-player'?<UI.SoundPlayer title={`Tone ${audio.track+1}`} currentTime={audio.currentTime} duration={audio.duration} volume={audio.volume} playing={audio.playing} disabled={disabled} seekDisabled={seekDisabled} volumeDisabled={volumeDisabled} showNavigation={navigation} onPlay={audio.play} onPause={audio.pause} onSeek={audio.seek} onVolumeChange={audio.setVolume} onPrevious={()=>audio.changeTrack(-1)} onNext={()=>audio.changeTrack(1)}/>:<><UI.AudioWaveform samples={samples} active={active} interactive={interactive} duration={audio.duration} currentTime={audio.currentTime} playing={audio.playing} recordable={recordable} recording={recording} recordDisabled={disabled} onPlay={audio.play} onPause={audio.pause} onSeek={audio.seek} onRecord={()=>{audio.pause();setRecording(true);}} onStopRecording={()=>setRecording(false)}/><p>{t('record')}</p></>}
    {audio.error&&<UI.Alert variant="danger" action={<UI.Button onClick={audio.play}>{t('retry')}</UI.Button>}>{t('audioError')}</UI.Alert>}
  </DemoFrame>;
}
