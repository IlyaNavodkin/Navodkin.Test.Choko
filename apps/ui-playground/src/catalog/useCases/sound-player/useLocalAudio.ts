import { useEffect, useRef, useState } from 'react';
export type UseLocalAudioArgs = { simulateError: boolean };
export type UseLocalAudioResult = { track: number; playing: boolean; duration: number; currentTime: number; volume: number; error: boolean; play: () => void; pause: () => void; seek: (seconds:number) => void; setVolume: (volume:number) => void; changeTrack: (direction:number) => void };
export function useLocalAudio({simulateError}:UseLocalAudioArgs):UseLocalAudioResult {
  const [track,setTrack]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [duration,setDuration]=useState(0);
  const [currentTime,setCurrentTime]=useState(0);
  const [volume,setVolumeState]=useState(0.3);
  const [error,setError]=useState(false);
  const audio=useRef<HTMLAudioElement|null>(null);
  useEffect(()=>{
    const element=new Audio(`/fixtures/tone-${track+1}.wav`);
    element.preload='metadata';element.volume=volume;audio.current=element;
    const sync=()=>{setPlaying(!element.paused);setCurrentTime(element.currentTime);setDuration(Number.isFinite(element.duration)?element.duration:0);};
    const fail=()=>{setError(true);setPlaying(false);};
    const events=['loadedmetadata','timeupdate','play','pause','ended'] as const;
    events.forEach(e=>element.addEventListener(e,sync));element.addEventListener('error',fail);
    setCurrentTime(0);setDuration(0);setPlaying(false);setError(false);
    return()=>{audio.current=null;events.forEach(e=>element.removeEventListener(e,sync));element.removeEventListener('error',fail);element.pause();element.removeAttribute('src');element.load();};
  },[track]);
  const pause=()=>{audio.current?.pause();setPlaying(false);};
  return {track,playing,duration,currentTime,volume,error,pause,
    play:()=>{const element=audio.current;if(!element)return;setError(false);if(simulateError){pause();setError(true);return;}void element.play().catch(()=>{if(audio.current===element){setError(true);setPlaying(false);}});},
    seek:seconds=>{if(audio.current){audio.current.currentTime=Math.max(0,Math.min(duration,seconds));setCurrentTime(audio.current.currentTime);}},
    setVolume:value=>{const next=Math.max(0,Math.min(1,value));setVolumeState(next);if(audio.current)audio.current.volume=next;},
    changeTrack:direction=>setTrack(v=>(v+direction+2)%2),
  };
}
