import { useLayoutEffect } from "react";
import { useParams } from "react-router-dom";
import { getNodeDetailPath } from "@/lib/nodebeacon";

export default function InstanceRedirect() {
  const { uuid } = useParams<{ uuid: string }>();
  const target = getNodeDetailPath(uuid ?? "");

  useLayoutEffect(() => {
    window.location.replace(target);
  }, [target]);

  return null;
}
