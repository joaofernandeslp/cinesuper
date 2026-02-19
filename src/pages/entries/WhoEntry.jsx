import { IS_TV } from "../../app/target.js";
import WhoIsWatching from "../WhoIsWatching.jsx";
import WhoIsWatchingTv from "../tv/WhoIsWatchingTv.jsx";

export default function WhoEntry() {
  return IS_TV ? <WhoIsWatchingTv /> : <WhoIsWatching />;
}
