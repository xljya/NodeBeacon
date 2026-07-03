# Legacy Monitor Status Reference

This directory keeps a reference copy of the previous lightweight `monitor.liucf.com` status page that ran on RS1000 k3s.

These files are not the planned NodeBeacon production implementation. They are kept because they contain useful Prometheus query patterns, response shaping, health checks, and the previous k3s Deployment / Service shape.

Files:

- `monitor-status-app.py`: legacy Python status page and Prometheus query adapter
- `monitor-status.yaml`: legacy k3s Deployment and NodePort Service

Use this directory as implementation reference only. New NodeBeacon code should live in the planned application structure, not here.
