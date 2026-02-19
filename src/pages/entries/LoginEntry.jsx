import { IS_TV } from "../../app/target.js";
import Login from "../Login.jsx";
import LoginTv from "../tv/LoginTv.jsx";

export default function LoginEntry() {
  return IS_TV ? <LoginTv /> : <Login />;
}
