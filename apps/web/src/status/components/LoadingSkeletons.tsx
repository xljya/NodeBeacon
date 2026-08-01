import { useTranslation } from "react-i18next";
import type { ViewMode } from "./NodeControls";

function Block({ className = "" }: { className?: string }) {
  return <span className={`status-skeleton-block${className ? ` ${className}` : ""}`} />;
}

function LoadingLabel() {
  const { t } = useTranslation();
  return <span className="sr-only">{t("common.loading")}</span>;
}

function SkeletonStatPanel() {
  return (
    <div className="stat-panel status-skeleton-stat-panel" aria-hidden="true">
      <div className="stat-grid">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="stat-item" key={index}>
            <Block className="skeleton-stat-label" />
            <Block className="skeleton-stat-value" />
          </div>
        ))}
      </div>
      <Block className="skeleton-stat-gear" />
    </div>
  );
}

function SkeletonControls() {
  return (
    <div className="status-skeleton-controls" aria-hidden="true">
      <Block className="skeleton-search" />
      <Block className="skeleton-view-toggle" />
      <Block className="skeleton-group-tabs" />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="node-card status-skeleton-card" aria-hidden="true">
      <div className="node-card-head">
        <div className="node-name-wrap">
          <Block className="skeleton-flag" />
          <Block className="skeleton-node-name" />
        </div>
        <Block className="skeleton-pill" />
      </div>
      <Block className="skeleton-line skeleton-line-wide" />
      <Block className="skeleton-line skeleton-line-medium" />
      <div className="skeleton-metric-list">
        <Block className="skeleton-line" />
        <Block className="skeleton-line" />
        <Block className="skeleton-line" />
      </div>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="node-table status-skeleton-table" data-testid="status-skeleton-table" aria-hidden="true">
      <div className="node-table-head">
        {Array.from({ length: 8 }, (_, index) => <Block className="skeleton-table-head" key={index} />)}
      </div>
      {Array.from({ length: 5 }, (_, row) => (
        <div className="node-row status-skeleton-row" data-testid="status-skeleton-row" key={row}>
          <Block className="skeleton-table-name" />
          <Block className="skeleton-table-cell hide-sm" />
          <Block className="skeleton-table-status" />
          <Block className="skeleton-table-metric" />
          <Block className="skeleton-table-metric" />
          <Block className="skeleton-table-metric" />
          <Block className="skeleton-table-cell hide-sm" />
          <Block className="skeleton-table-cell hide-sm" />
        </div>
      ))}
    </div>
  );
}

export function StatusLoadingSkeleton({ view }: { view: ViewMode }) {
  return (
    <div className="status-loading-skeleton" data-testid="status-loading-skeleton" role="status" aria-busy="true">
      <LoadingLabel />
      <SkeletonStatPanel />
      <SkeletonControls />
      {view === "table" ? (
        <SkeletonTable />
      ) : (
        <div className="node-grid status-skeleton-grid" aria-hidden="true">
          {Array.from({ length: 5 }, (_, index) => <SkeletonCard key={index} />)}
        </div>
      )}
    </div>
  );
}

function DetailSkeletonChart() {
  return (
    <article className="detail-chart-card detail-skeleton-chart" aria-hidden="true">
      <div className="detail-chart-head">
        <Block className="skeleton-chart-title" />
        <Block className="skeleton-chart-action" />
      </div>
      <Block className="skeleton-chart-plot" />
      <div className="skeleton-chart-legend">
        <Block className="skeleton-legend-chip" />
        <Block className="skeleton-legend-chip" />
      </div>
    </article>
  );
}

export function NodeDetailLoadingSkeleton() {
  return (
    <div className="node-detail-loading-skeleton" data-testid="node-detail-loading-skeleton" role="status" aria-busy="true">
      <LoadingLabel />
      <div className="detail-main-grid" aria-hidden="true">
        <aside className="detail-node-nav detail-skeleton-nav">
          <div className="detail-nav-title"><Block className="skeleton-nav-title" /></div>
          {Array.from({ length: 5 }, (_, index) => (
            <div className="detail-nav-item detail-skeleton-nav-item" key={index}>
              <Block className="skeleton-nav-dot" />
              <Block className="skeleton-nav-name" />
              <Block className="skeleton-nav-status" />
            </div>
          ))}
        </aside>

        <main className="detail-main-content">
          <div className="detail-mobile-node-select detail-skeleton-mobile-select">
            <Block className="skeleton-mobile-label" />
            <Block className="skeleton-mobile-select" />
          </div>
          <div className="detail-overview-card detail-skeleton-overview">
            <div className="detail-head">
              <Block className="skeleton-detail-title" />
              <Block className="skeleton-detail-pill" />
            </div>
            <div className="detail-profile-card">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index}><Block className="skeleton-profile-label" /><Block className="skeleton-profile-value" /></div>
              ))}
            </div>
            <div className="detail-current">
              {Array.from({ length: 4 }, (_, index) => (
                <div className="metric" key={index}><Block className="skeleton-metric-label" /><Block className="skeleton-metric-value" /><Block className="skeleton-metric-bar" /></div>
              ))}
            </div>
          </div>
          <div className="detail-chart-grid detail-skeleton-chart-grid">
            {Array.from({ length: 5 }, (_, index) => <DetailSkeletonChart key={index} />)}
          </div>
        </main>
      </div>
    </div>
  );
}
