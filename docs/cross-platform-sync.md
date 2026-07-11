# Cross-platform development and line endings

NodeBeacon is developed on Windows, macOS, and Linux. The repository-level
`.gitattributes` file is the source of truth:

- Unix scripts and project text use LF.
- Windows scripts use CRLF.
- Binary assets are never normalized.

## One-time setup

### Windows

```powershell
git config --global core.autocrlf true
git config --global core.eol crlf
```

### macOS and Linux

```bash
git config --global core.autocrlf input
git config --global core.eol lf
```

These settings belong to each machine's global Git config. Do not commit
`.git/config`; `.gitattributes` travels with the repository and controls the
shared rules.

## First sync

From the repository root:

```bash
git status
git add --renormalize .
git diff --check
git status
```

NodeBeacon was already LF-normalized when `.gitattributes` was added, so a
fresh clone should normally show no normalization diff.

## Daily sync

```bash
git fetch origin
git pull --rebase origin main
git diff --check
git push origin main
```

If two machines both have local work, push one first. On the other machine,
fetch and rebase before editing the same files.

## Diagnose line-ending problems

```bash
git ls-files --eol
git check-attr -a -- scripts/backup.sh
git check-attr -a -- infra/k8s/deployment.yaml
git diff --check
git diff --ignore-space-at-eol
git config --show-origin --get core.autocrlf
git config --show-origin --get core.eol
```

In `git ls-files --eol` output:

- `i/lf` or `i/crlf` is the line ending in the Git index.
- `w/lf` or `w/crlf` is the line ending in the working tree.
- `attr/...` shows the applied attributes.

If only one file is wrong, normalize only that file:

```bash
git add --renormalize -- path/to/file
```

Do not mix a repository-wide line-ending change with a feature commit.

## Common symptoms

| Symptom | Likely cause | Check |
| --- | --- | --- |
| Every line appears changed | `core.autocrlf` or attributes changed | `git diff --ignore-space-at-eol` |
| Shell script fails with `^M` | CRLF shell file | `git ls-files --eol -- scripts/*.sh` |
| YAML behaves differently after checkout | Mixed line endings | `git check-attr -a -- file.yaml` |
| Binary file appears as text | Missing binary attribute | Add a `binary` rule to `.gitattributes` |
