import { Navigate, useSearchParams } from "react-router-dom";
import { NodesPage } from "./NodesPage";

export function ServerPage() {
  const [params] = useSearchParams();
  if (params.get("tab") === "overview") {
    return <Navigate to="/admin/overview" replace />;
  }

  return <NodesPage />;
}
