import {detectBeats} from './beat-engine.js';
self.onmessage=({data})=>{try{self.postMessage({result:detectBeats(data.envelope,data.rate,data.duration)})}catch(error){self.postMessage({error:error.message})}};
