import { IS_TV } from "../../app/target.js";
import Browse from "../Browse.jsx";
import BrowseTv from "../tv/BrowseTv.jsx";

export default function BrowseEntry() {
  return IS_TV ? <BrowseTv /> : <Browse />;
}
