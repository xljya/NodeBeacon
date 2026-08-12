import { useEffect } from "react";
import { useParams } from "react-router-dom";

export default function InstanceRedirect() {
  const { uuid } = useParams<{ uuid: string }>();

  useEffect(() => {
    window.location.replace(`/nodes/${encodeURIComponent(uuid ?? "")}`);
  }, [uuid]);

  return null;
}
