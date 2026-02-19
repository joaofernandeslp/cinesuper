import { Link } from "react-router-dom";
import PageTitle from "../components/PageTitle.jsx";

export default function NotFound() {
  return (
    <div className="min-h-full grid place-items-center bg-black text-white">
      <div className="text-center">
        <div className="text-2xl font-black">Página não encontrada</div>
        <Link to="/browse" className="mt-4 inline-block text-white/70 hover:text-white">
          Voltar para o início
        </Link>
        <PageTitle title="Página não encontrada" />
      </div>
    </div>
  );
}
