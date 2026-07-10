import { access, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

export async function backupDatabase(sourcePath: string, destinationPath: string): Promise<void> {
  await access(sourcePath);
  await rm(destinationPath, { force: true });

  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    // Uses SQLite's online backup API, producing a transactionally consistent
    // snapshot even while the WAL-backed application database is live.
    await source.backup(destinationPath);
  } finally {
    source.close();
  }

  const backup = new Database(destinationPath, { fileMustExist: true });
  try {
    // Produce a self-contained artifact. Opening a WAL-mode backup can create
    // empty -wal/-shm sidecars; switching the offline destination to DELETE
    // checkpoints it and removes that operational ambiguity.
    backup.pragma("journal_mode = DELETE");
    const integrity = backup.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`Backup integrity check failed: ${String(integrity)}`);
  } finally {
    backup.close();
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  const [, , sourcePath, destinationPath] = process.argv;
  if (!sourcePath || !destinationPath) {
    console.error("Usage: backupDatabase <source.db> <destination.db>");
    process.exitCode = 1;
  } else {
    backupDatabase(sourcePath, destinationPath).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
  }
}
