import { useState, type ReactElement } from "react";
import { AlertDialog, Button, Flex } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";

export default function ConfirmDeleteButton({
  children,
  itemName,
  onConfirm,
  actionLabel,
  title,
  description,
}: {
  children: ReactElement;
  itemName: string;
  onConfirm: () => Promise<void>;
  actionLabel?: string;
  title?: string;
  description?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // The admin gateway already reports request failures. Keep the dialog open
      // so the owner can retry or cancel without an unhandled rejection.
    } finally {
      setPending(false);
    }
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <AlertDialog.Trigger>{children}</AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="450px">
        <AlertDialog.Title>
          {title ?? t("nb.confirmDelete.title", {
            item: itemName,
            defaultValue: "Delete {{item}}?",
          })}
        </AlertDialog.Title>
        <AlertDialog.Description size="2">
          {description ?? t("nb.confirmDelete.description", {
            item: itemName,
            defaultValue: "This permanently deletes {{item}}. This action cannot be undone.",
          })}
        </AlertDialog.Description>
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray" disabled={pending}>
              {t("common.cancel")}
            </Button>
          </AlertDialog.Cancel>
          <Button color="red" disabled={pending} onClick={() => void confirm()}>
            {actionLabel ?? t("common.delete")}
          </Button>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
