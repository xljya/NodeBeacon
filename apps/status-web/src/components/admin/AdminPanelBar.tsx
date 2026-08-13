import { Cross1Icon, ExitIcon } from "@radix-ui/react-icons";
import {
  Callout,
  Flex,
  Grid,
  IconButton,
  Text,
} from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import ColorSwitch from "../ColorSwitch";
import LanguageSwitch from "../Language";
import ThemeSwitch from "../ThemeSwitch";
import { useIsMobile } from "@/hooks/use-mobile";
import menuConfig from "../../config/menuConfig.json";
import type { MenuItem } from "../../types/menu";
import { iconMap } from "../../utils/iconHelper";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { TablerMenu2 } from "../Icones/Tabler";
import { useAccount } from "@/contexts/AccountContext";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import { adminGet, adminPost } from "@/lib/adminGateway";
import { getLoginPath, withAdminBase } from "@/lib/adminPaths";
import type { AdminSummaryResponse } from "@/lib/contracts";

const baseMenuItems = (menuConfig as { menu: MenuItem[] }).menu;

interface AdminPanelBarProps {
  content: ReactNode;
}

const AdminPanelBar = ({ content }: AdminPanelBarProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({});
  const { account } = useAccount();
  const isMobile = useIsMobile();
  const ishttps = window.location.protocol === "https:";
  const [t] = useTranslation();
  const location = useLocation();
  const { publicInfo } = usePublicInfo();
  const [versionLabel, setVersionLabel] = useState("");

  useEffect(() => {
    let ignore = false;
    void adminGet<AdminSummaryResponse>("/api/admin/summary")
      .then((summary) => {
        if (!ignore) setVersionLabel(summary.version);
      })
      .catch(() => {
        if (!ignore) setVersionLabel("");
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setSidebarOpen(!isMobile);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMobile]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    baseMenuItems.forEach((item) => {
      if (!item.children) return;
      next[item.path] = item.children.some((child) => {
        const prefixed = withAdminBase(child.path);
        return (
          location.pathname === prefixed ||
          (prefixed !== "/" && location.pathname.startsWith(`${prefixed}/`))
        );
      });
    });
    setOpenSubMenus(next);
  }, [location.pathname]);

  const sidebarVariants = {
    open: {
      width: isMobile ? "100vw" : "240px",
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 300, damping: 30 },
    },
    closed: {
      width: 0,
      opacity: isMobile ? 0 : 1,
      transition: { type: "spring" as const, stiffness: 300, damping: 30 },
    },
  };

  const contentVariants = {
    open: {
      opacity: isMobile ? 0 : 1,
      x: isMobile ? "100%" : 0,
      transition: { duration: 0.3 },
    },
    closed: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.3 },
    },
  };

  const logout = async () => {
    try {
      await adminPost("/api/auth/logout");
    } catch {
      // Session may already be gone; still leave the owner shell.
    }
    window.location.assign(getLoginPath());
  };

  const renderIcon = (icon: string, active?: boolean) => {
    const Cmp = iconMap[icon];
    if (!Cmp) {
      return (
        <span
          style={{
            width: 16,
            height: 16,
            display: "inline-block",
            borderRadius: 4,
            background: "var(--accent-8)",
          }}
        />
      );
    }
    return (
      <Cmp
        className="flex w-4 h-5 items-center justify-center"
        style={{ color: active ? "var(--accent-10)" : "var(--gray11)" }}
      />
    );
  };

  return (
    <Grid
      className="km-admin-layout km-admin-panel-bar"
      columns={{ initial: "1fr", md: sidebarOpen ? "240px 1fr" : "0px 1fr" }}
      rows={{ initial: "auto 1fr", md: "auto 1fr" }}
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        backgroundColor: "var(--accent-1)",
      }}
    >
      <motion.nav
        className="km-admin-panel-topbar col-span-2"
        aria-label={t("common.menu_sidebar", "Admin console")}
        initial={{ y: 0 }}
        animate={{ y: 0 }}
      >
        <Flex
          gap="3"
          p="2"
          justify="between"
          align="center"
          className="border-b-1"
        >
          <Flex gap="3" align="center">
            <IconButton
              variant="ghost"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={t("common.menu_sidebar", "Menu")}
              aria-label={t("common.menu_sidebar", "Menu")}
              style={{
                display: isMobile && sidebarOpen ? "none" : "flex",
                color: "var(--gray-11)",
              }}
            >
              <TablerMenu2 />
            </IconButton>
            <a href="/" target="_blank" rel="noopener noreferrer">
              <label className="text-xl font-bold">
                {publicInfo?.sitename || "NodeBeacon"}
              </label>
            </a>
            <label
              className="text-sm text-muted-foreground self-end overflow-hidden"
              hidden={isMobile}
            >
              {versionLabel ? `v${versionLabel}` : ""}
            </label>
          </Flex>
          <Flex gap="3" align="center" overflowX="auto" className="km-admin-panel-controls">
            <ThemeSwitch />
            <ColorSwitch />
            <LanguageSwitch />
            <IconButton
              variant="soft"
              color="orange"
              className="km-admin-panel-account"
              onClick={() => void logout()}
              title={t("common.logout", "Logout")}
              aria-label={t("common.logout", "Logout")}
            >
              <ExitIcon />
            </IconButton>
          </Flex>
        </Flex>
      </motion.nav>

      <AnimatePresence>
        <motion.div
          variants={sidebarVariants}
          initial="closed"
          animate={sidebarOpen ? "open" : "closed"}
          exit="closed"
          className="km-admin-panel-nav"
          style={{
            backgroundColor: "var(--accent-1)",
            height: "100%",
            position: isMobile ? "absolute" : "relative",
            zIndex: isMobile ? 10 : 1,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          <Flex
            gap="3"
            className="p-2 border-r-1"
            direction="column"
            justify="start"
            align="start"
            style={{ height: "100%", minWidth: "240px" }}
          >
            <IconButton
              variant="soft"
              title={t("common.close_sidebar", "Close menu")}
              aria-label={t("common.close_sidebar", "Close menu")}
              style={{
                display: isMobile ? "flex" : "none",
                margin: "8px 0px 0px 8px",
              }}
              onClick={() => setSidebarOpen(false)}
            >
              <Cross1Icon />
            </IconButton>
            <Flex
              direction="column"
              gap="1"
              className="h-full md:mt-0 mt-6"
              style={{ width: "100%" }}
            >
              {baseMenuItems.map((item) => {
                const isOpen = openSubMenus[item.path];
                if (item.children && item.children.length) {
                  return (
                    <div key={item.path}>
                      <Flex
                        className="p-2 gap-2 border-l-[4px] border-transparent cursor-pointer hover:bg-accent-3 rounded-md"
                        align="center"
                        onClick={() =>
                          setOpenSubMenus((prev) => ({
                            ...prev,
                            [item.path]: !prev[item.path],
                          }))
                        }
                      >
                        {renderIcon(item.icon)}
                        <Text className="text-base" weight="medium" style={{ flex: 1 }}>
                          {t(item.labelKey)}
                        </Text>
                        <ChevronDownIcon
                          style={{
                            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s",
                          }}
                        />
                      </Flex>
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={
                          isOpen
                            ? { height: "auto", opacity: 1 }
                            : { height: 0, opacity: 0 }
                        }
                        transition={{ duration: 0.2 }}
                        style={{ overflow: "hidden" }}
                      >
                        <Flex direction="column" className="ml-4 gap-1">
                          {item.children.map((child) => (
                            <SidebarItem
                              key={child.path}
                              to={withAdminBase(child.path)}
                              icon={renderIcon(child.icon)}
                              onClick={() => isMobile && setSidebarOpen(false)}
                              newTab={child.newTab}
                            >
                              {t(child.labelKey)}
                            </SidebarItem>
                          ))}
                        </Flex>
                      </motion.div>
                    </div>
                  );
                }
                return (
                  <SidebarItem
                    key={item.path}
                    to={withAdminBase(item.path)}
                    icon={renderIcon(item.icon)}
                    onClick={() => isMobile && setSidebarOpen(false)}
                    newTab={item.newTab}
                  >
                    {t(item.labelKey)}
                  </SidebarItem>
                );
              })}
            </Flex>
          </Flex>
        </motion.div>
      </AnimatePresence>

      <motion.div
        variants={contentVariants}
        animate={sidebarOpen ? "open" : "closed"}
        className="km-admin-panel-content"
        style={{
          backgroundColor: "var(--accent-3)",
          display: isMobile && sidebarOpen ? "none" : "block",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            backgroundColor: "var(--accent-1)",
            height: "100%",
            minHeight: 0,
            padding: isMobile ? "8px" : "16px",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <Callout.Root mb="2" hidden={ishttps} color="red">
            <Callout.Text>
              <Text size="2" weight="medium">
                {t("warn_https")}
              </Text>
            </Callout.Text>
          </Callout.Root>
          {account?.logged_in ? content : null}
        </div>
      </motion.div>
    </Grid>
  );
};

export default AdminPanelBar;

const SidebarItem = ({
  to,
  onClick,
  icon,
  children,
  newTab,
}: {
  to: string;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
  newTab?: boolean;
}) => {
  const location = useLocation();
  const isExternalLink = to.startsWith("http://") || to.startsWith("https://");
  const isActive =
    !isExternalLink &&
    to !== "/" &&
    location.pathname === to.split("?")[0];
  const openInNewTab = newTab === true || (isExternalLink && newTab !== false);

  if (openInNewTab) {
    return (
      <a
        href={to}
        onClick={onClick}
        target="_blank"
        rel="noopener noreferrer"
        className="group transition-colors duration-200 hover:bg-accent-3 rounded-md"
      >
        <Flex className="p-2 gap-2 h-full" align="center">
          <span className="flex w-4 h-5 items-center justify-center" style={{ opacity: 0.7 }}>
            {icon}
          </span>
          <Text className="text-base" weight="medium" style={{ flex: 1 }}>
            {children}
          </Text>
        </Flex>
      </a>
    );
  }

  return (
    <Link
      to={to}
      onClick={onClick}
      className="group transition-colors duration-200 hover:bg-accent-3 rounded-md"
    >
      <Flex
        className="p-2 gap-2"
        align="center"
        style={{
          borderLeft: isActive ? "4px solid var(--accent-8)" : "4px solid transparent",
          borderRadius: "6px",
          backgroundColor: isActive ? "var(--accent-4)" : "transparent",
          color: isActive ? "var(--accent-10)" : "inherit",
        }}
      >
        <span
          className="flex w-4 h-5 items-center justify-center"
          style={{ opacity: isActive ? 1 : 0.7 }}
        >
          {icon}
        </span>
        <Text className="text-base" weight={isActive ? "bold" : "medium"} style={{ flex: 1 }}>
          {children}
        </Text>
      </Flex>
    </Link>
  );
};
