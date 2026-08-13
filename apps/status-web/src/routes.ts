import { lazy } from "react";
import type { RouteObject } from "react-router-dom";
import React from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { withAdminBase } from "./lib/adminPaths";

const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/404"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const AdminLayout = lazy(() => import("./pages/admin/_layout"));
const DashboardPage = lazy(() => import("./pages/nb-admin/DashboardPage"));
const ServersPage = lazy(() => import("./pages/nb-admin/ServersPage"));
const SiteSettingsPage = lazy(() => import("./pages/nb-admin/SiteSettingsPage"));
const ThemeSettingsPage = lazy(() => import("./pages/nb-admin/ThemeSettingsPage"));
const SignOnPage = lazy(() => import("./pages/nb-admin/SignOnPage"));
const NotificationChannelsPage = lazy(() => import("./pages/nb-admin/NotificationChannelsPage"));
const GeneralSettingsPage = lazy(() => import("./pages/nb-admin/GeneralSettingsPage"));
const MetricsPage = lazy(() => import("./pages/nb-admin/MetricsPage"));
const NotificationGeneralPage = lazy(() => import("./pages/nb-admin/NotificationGeneralPage"));
const AlertRulesPage = lazy(() => import("./pages/nb-admin/AlertRulesPage"));
const TrafficReportsPage = lazy(() => import("./pages/nb-admin/TrafficReportsPage"));
const PingPage = lazy(() => import("./pages/nb-admin/PingPage"));
const ExecPage = lazy(() => import("./pages/nb-admin/ExecPage"));
const SessionsPage = lazy(() => import("./pages/nb-admin/SessionsPage"));
const AccountPage = lazy(() => import("./pages/nb-admin/AccountPage"));
const LogsPage = lazy(() => import("./pages/nb-admin/LogsPage"));
const AboutPage = lazy(() => import("./pages/nb-admin/AboutPage"));
const ForbiddenPage = lazy(() => import("./pages/nb-admin/ForbiddenPage"));

function AdminRedirect({ to, search }: { to: string; search?: string }) {
  const [params] = useSearchParams();
  const target = withAdminBase(to);
  const query = search ?? (params.toString() ? `?${params.toString()}` : "");
  return React.createElement(Navigate, { to: `${target}${query}`, replace: true });
}

const adminChildren: RouteObject[] = [
  { index: true, element: React.createElement(AdminRedirect, { to: "/admin/dashboard" }) },
  { path: "dashboard", element: React.createElement(DashboardPage) },
  { path: "servers", element: React.createElement(ServersPage) },
  { path: "settings/site", element: React.createElement(SiteSettingsPage) },
  { path: "settings/theme", element: React.createElement(ThemeSettingsPage) },
  { path: "settings/sign-on", element: React.createElement(SignOnPage) },
  { path: "settings/notification", element: React.createElement(NotificationChannelsPage) },
  { path: "settings/general", element: React.createElement(GeneralSettingsPage) },
  { path: "settings/metrics", element: React.createElement(MetricsPage) },
  { path: "notification/general", element: React.createElement(NotificationGeneralPage) },
  { path: "notification/offline", element: React.createElement(AlertRulesPage) },
  { path: "notification/load", element: React.createElement(AlertRulesPage) },
  { path: "notification/traffic-report", element: React.createElement(TrafficReportsPage) },
  { path: "ping", element: React.createElement(PingPage) },
  { path: "exec", element: React.createElement(ExecPage) },
  { path: "sessions", element: React.createElement(SessionsPage) },
  { path: "account", element: React.createElement(AccountPage) },
  { path: "logs", element: React.createElement(LogsPage) },
  { path: "about", element: React.createElement(AboutPage) },
  { path: "forbidden", element: React.createElement(ForbiddenPage) },
  { path: "nodes", element: React.createElement(AdminRedirect, { to: "/admin/servers" }) },
  { path: "overview", element: React.createElement(AdminRedirect, { to: "/admin/dashboard" }) },
  { path: "activity", element: React.createElement(AdminRedirect, { to: "/admin/logs", search: "?tab=audit" }) },
  { path: "users", element: React.createElement(AdminRedirect, { to: "/admin/account", search: "?tab=identity" }) },
  { path: "latency", element: React.createElement(AdminRedirect, { to: "/admin/ping" }) },
  { path: "theme", element: React.createElement(AdminRedirect, { to: "/admin/settings/theme" }) },
  { path: "theme/default", element: React.createElement(AdminRedirect, { to: "/admin/settings/theme" }) },
  { path: "settings", element: React.createElement(AdminRedirect, { to: "/admin/settings/site" }) },
  { path: "notification", element: React.createElement(AdminRedirect, { to: "/admin/notification/general" }) },
];

export const routes: RouteObject[] = [
  {
    path: "/",
    element: React.createElement(lazy(() => import("./pages/_layout"))),
    children: [
      { index: true, element: React.createElement(Index) },
      {
        path: "instance/:uuid",
        element: React.createElement(lazy(() => import("./pages/InstanceRedirect"))),
      },
    ],
  },
  { path: "/login", element: React.createElement(LoginPage) },
  { path: "/login-v2", element: React.createElement(LoginPage) },
  {
    path: "/admin",
    element: React.createElement(AdminLayout),
    children: adminChildren,
  },
  {
    path: "/admin-v2",
    element: React.createElement(AdminLayout),
    children: adminChildren,
  },
  { path: "*", element: React.createElement(NotFound) },
];
