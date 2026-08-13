import type { ReactNode } from "react";
import { Button, Callout, Flex, Text } from "@radix-ui/themes";
import Loading from "@/components/loading";

export function AdminPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Flex direction="column" gap="4" className="km-admin-page">
      <Flex justify="between" align="start" gap="3" wrap="wrap">
        <Flex direction="column" gap="1">
          <Text size="5" weight="bold">
            {title}
          </Text>
          {description ? (
            <Text size="2" color="gray">
              {description}
            </Text>
          ) : null}
        </Flex>
        {actions}
      </Flex>
      {children}
    </Flex>
  );
}

export function AdminLoading() {
  return <Loading text="" />;
}

export function AdminError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Callout.Root color="red">
      <Callout.Text>
        <Flex align="center" justify="between" gap="3" wrap="wrap">
          <Text size="2">{message}</Text>
          {onRetry ? (
            <Button size="1" variant="soft" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </Flex>
      </Callout.Text>
    </Callout.Root>
  );
}
