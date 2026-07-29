import { NavLink, useSearchParams } from "react-router-dom";
import { NodesPage } from "./NodesPage";
import { OverviewPage } from "./OverviewPage";

export function ServerPage() {
  const [params] = useSearchParams();
  const overview = params.get("tab") === "overview";
  return <div className="page"><div className="settings-action-row server-tabs"><NavLink to="/admin" end className={!overview ? "primary-btn" : "ghost-btn"}>Node list</NavLink><NavLink to="/admin?tab=overview" className={overview ? "primary-btn" : "ghost-btn"}>Overview</NavLink></div>{overview ? <OverviewPage /> : <NodesPage />}</div>;
}
