// src/components/PageTitle.jsx
import { Helmet } from "@dr.pogodin/react-helmet";

export default function PageTitle({ title }) {
  const full = title ? `${title} • CineSuper` : "CineSuper";
  return (
    <Helmet>
      <title>{full}</title>
    </Helmet>
  );
}
