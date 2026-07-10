import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Standard loading indicator for admin pages: spinner + localized text. */
export function PageLoading() {
  const { t } = useTranslation();
  return (
    <div className="admin-state" role="status">
      <Loader2 className="spin" size={16} aria-hidden="true" />
      {t("common.loading")}
    </div>
  );
}

/** Standard inline error banner for admin pages. */
export function PageError({ message }: { message: string }) {
  return (
    <div className="admin-state error" role="alert">
      <AlertCircle size={16} aria-hidden="true" />
      {message}
    </div>
  );
}
