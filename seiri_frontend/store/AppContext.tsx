// Global app state: settings, media list, trash, albums, undo/redo stack.
// Persistence: SQLite (albums, trash, settings), all reactive in-memory.
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import { getDb, kvGet, kvSet } from "@/db";
import {
  loadAlbumMedia,
  MediaItem,
  PermissionState,
  deleteAssetsFromDevice,
  duplicateAssetToLibrary,
  enrichMediaItem,
  computeQuickHash,
} from "@/services/media";

export type TrashItem = { media: MediaItem; deletedAt: number };
export type Album = { id: string; name: string; coverUri?: string; createdAt: number; count: number };
export type AutoDeleteDays = 7 | 30 | 90 | 0; // 0 = never
export type ThemePref = "system" | "light" | "dark";
export type Settings = {
  themePref: ThemePref;
  askOrganizeOnKeep: boolean;
  autoDeleteDays: AutoDeleteDays;
  gesturesEnabled: boolean;
};

type Action =
  | { kind: "delete"; media: MediaItem }
  | { kind: "keep"; media: MediaItem }
  | { kind: "organize"; media: MediaItem; albumId: string }
  | { kind: "restore"; media: MediaItem; deletedAt: number };

type State = {
  ready: boolean;
  permission: PermissionState;
  media: MediaItem[];
  cursor: number;
  trash: TrashItem[];
  albums: Album[];
  albumItems: Record<string, string[]>;
  settings: Settings;
  undoStack: Action[];
  redoStack: Action[];
};

const DEFAULTS: Settings = {
  themePref: "system",
  askOrganizeOnKeep: true,
  autoDeleteDays: 30,
  gesturesEnabled: true,
};

const initial: State = {
  ready: false,
  permission: "undetermined",
  media: [],
  cursor: 0,
  trash: [],
  albums: [],
  albumItems: {},
  settings: DEFAULTS,
  undoStack: [],
  redoStack: [],
};

type Msg =
  | { type: "BOOT"; payload: Partial<State> }
  | { type: "SET_PERMISSION"; payload: PermissionState }
  | { type: "SET_MEDIA"; payload: MediaItem[] }
  | { type: "ADD_MEDIA_ITEM"; item: MediaItem }
  | { type: "PATCH_MEDIA_ITEMS"; items: MediaItem[] }
  | { type: "PATCH_SETTINGS"; payload: Partial<Settings> }
  | { type: "APPLY_ACTION"; action: Action; pushUndo: boolean; clearRedo: boolean }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "PURGE_TRASH"; ids: string[] }
  | { type: "EMPTY_TRASH" }
  | { type: "ADD_ALBUM"; album: Album }
  | { type: "RENAME_ALBUM"; id: string; name: string }
  | { type: "REMOVE_ALBUM"; id: string }
  | { type: "SET_ALBUM_ITEMS"; albumId: string; ids: string[] };

function applyAction(state: State, action: Action): State {
  const currentId = state.media[state.cursor]?.id;
  switch (action.kind) {
    case "delete": {
      const newCursor =
        currentId === action.media.id ? state.cursor + 1 : state.cursor;
      const exists = state.trash.some((t) => t.media.id === action.media.id);
      return {
        ...state,
        cursor: newCursor,
        trash: exists
          ? state.trash
          : [{ media: action.media, deletedAt: Date.now() }, ...state.trash],
      };
    }
    case "keep": {
      const newCursor =
        currentId === action.media.id ? state.cursor + 1 : state.cursor;
      return { ...state, cursor: newCursor };
    }
    case "organize": {
      const newCursor =
        currentId === action.media.id ? state.cursor + 1 : state.cursor;
      const list = state.albumItems[action.albumId] ?? [];
      const nextList = list.includes(action.media.id)
        ? list
        : [...list, action.media.id];
      const albums = state.albums.map((a) =>
        a.id === action.albumId
          ? { ...a, count: nextList.length, coverUri: a.coverUri || action.media.uri }
          : a,
      );
      return {
        ...state,
        cursor: newCursor,
        albumItems: { ...state.albumItems, [action.albumId]: nextList },
        albums,
      };
    }
    case "restore": {
      const alreadyInMedia = state.media.some((x) => x.id === action.media.id);
      return {
        ...state,
        trash: state.trash.filter((t) => t.media.id !== action.media.id),
        media: alreadyInMedia ? state.media : [...state.media, action.media],
      };
    }
  }
}

function reverseOf(action: Action): Action {
  switch (action.kind) {
    case "delete":
      return { kind: "restore", media: action.media, deletedAt: Date.now() };
    case "restore":
      return { kind: "delete", media: action.media };
    case "keep":
      return { kind: "keep", media: action.media };
    case "organize":
      return { kind: "organize", media: action.media, albumId: action.albumId };
  }
}

function reducer(state: State, msg: Msg): State {
  switch (msg.type) {
    case "BOOT":
      return { ...state, ...msg.payload, ready: true };
    case "SET_PERMISSION":
      return { ...state, permission: msg.payload };
    case "SET_MEDIA":
      return { ...state, media: msg.payload, cursor: 0 };
    case "ADD_MEDIA_ITEM":
      return { ...state, media: [...state.media, msg.item] };
    case "PATCH_MEDIA_ITEMS": {
      const map = new Map(msg.items.map((i) => [i.id, i]));
      return {
        ...state,
        media: state.media.map((m) => map.get(m.id) ?? m),
      };
    }
    case "PATCH_SETTINGS":
      return { ...state, settings: { ...state.settings, ...msg.payload } };
    case "APPLY_ACTION": {
      const next = applyAction(state, msg.action);
      return {
        ...next,
        undoStack: msg.pushUndo ? [msg.action, ...state.undoStack].slice(0, 200) : state.undoStack,
        redoStack: msg.clearRedo ? [] : state.redoStack,
      };
    }
    case "UNDO": {
      const [last, ...rest] = state.undoStack;
      if (!last) return state;
      if (last.kind === "keep") {
        const cursor = Math.max(0, state.cursor - 1);
        return {
          ...state,
          cursor,
          undoStack: rest,
          redoStack: [last, ...state.redoStack].slice(0, 200),
        };
      }
      const reversed = reverseOf(last);
      const next = applyAction(state, reversed);
      const cursor =
        last.kind === "delete" || last.kind === "organize"
          ? Math.max(0, state.cursor - 1)
          : state.cursor;
      return {
        ...next,
        cursor,
        undoStack: rest,
        redoStack: [last, ...state.redoStack].slice(0, 200),
      };
    }
    case "REDO": {
      const [last, ...rest] = state.redoStack;
      if (!last) return state;
      const next = applyAction(state, last);
      return {
        ...next,
        redoStack: rest,
        undoStack: [last, ...state.undoStack].slice(0, 200),
      };
    }
    case "PURGE_TRASH":
      return { ...state, trash: state.trash.filter((t) => !msg.ids.includes(t.media.id)) };
    case "EMPTY_TRASH":
      return { ...state, trash: [] };
    case "ADD_ALBUM":
      return { ...state, albums: [msg.album, ...state.albums] };
    case "RENAME_ALBUM":
      return {
        ...state,
        albums: state.albums.map((a) => (a.id === msg.id ? { ...a, name: msg.name } : a)),
      };
    case "REMOVE_ALBUM": {
      const { [msg.id]: _, ...rest } = state.albumItems;
      return {
        ...state,
        albums: state.albums.filter((a) => a.id !== msg.id),
        albumItems: rest,
      };
    }
    case "SET_ALBUM_ITEMS":
      return { ...state, albumItems: { ...state.albumItems, [msg.albumId]: msg.ids } };
    default:
      return state;
  }
}

type Ctx = {
  state: State;
  currentMedia: MediaItem | undefined;
  progress: { index: number; total: number };
  reloadMedia: () => Promise<void>;
  setPermission: (p: PermissionState) => void;
  patchSettings: (p: Partial<Settings>) => Promise<void>;
  swipeDelete: (m: MediaItem) => void;
  swipeKeep: (m: MediaItem) => void;
  organize: (m: MediaItem, albumId: string) => void;
  undo: () => void;
  redo: () => void;
  restoreFromTrash: (ids: string[]) => void;
  /** Actually deletes from the phone (shows the OS confirm dialog). */
  permanentlyDelete: (ids: string[]) => Promise<void>;
  emptyTrash: () => Promise<void>;
  createAlbum: (name: string) => Album;
  renameAlbum: (id: string, name: string) => void;
  removeAlbum: (id: string) => void;
  moveToAlbum: (mediaId: string, albumId: string) => void;
  removeFromAlbum: (mediaId: string, albumId: string) => void;
  setCursor: (idx: number) => void;
  duplicateMedia: (m: MediaItem) => Promise<MediaItem | null>;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Boot: hydrate settings + albums + trash from SQLite, then load media.
  useEffect(() => {
    (async () => {
      try {
        const db = await getDb();
        const settings = await kvGet<Settings>("settings", DEFAULTS);
        const albumsRows = await db.getAllAsync<{
          id: string;
          name: string;
          cover_uri: string | null;
          created_at: number;
        }>("SELECT id, name, cover_uri, created_at FROM albums ORDER BY created_at DESC");
        const itemsRows = await db.getAllAsync<{ album_id: string; media_id: string }>(
          "SELECT album_id, media_id FROM album_items",
        );
        const albumItems: Record<string, string[]> = {};
        itemsRows.forEach((r) => {
          (albumItems[r.album_id] ||= []).push(r.media_id);
        });
        const albums: Album[] = albumsRows.map((r) => ({
          id: r.id,
          name: r.name,
          coverUri: r.cover_uri ?? undefined,
          createdAt: r.created_at,
          count: albumItems[r.id]?.length ?? 0,
        }));
        const trashRows = await db.getAllAsync<{
          media_id: string;
          snapshot: string;
          deleted_at: number;
        }>("SELECT media_id, snapshot, deleted_at FROM trash ORDER BY deleted_at DESC");
        const trash: TrashItem[] = trashRows.map((r) => ({
          media: JSON.parse(r.snapshot),
          deletedAt: r.deleted_at,
        }));
        const media = await loadAlbumMedia("testapp");
        // Auto-purge trash beyond auto-delete window.
        const days = settings.autoDeleteDays;
        const now = Date.now();
        const kept =
          days > 0
            ? trash.filter((t) => now - t.deletedAt < days * 24 * 60 * 60 * 1000)
            : trash;
        const expiredIds = trash
          .filter((t) => !kept.find((k) => k.media.id === t.media.id))
          .map((t) => t.media.id);
        if (expiredIds.length) {
          const placeholders = expiredIds.map(() => "?").join(",");
          await db.runAsync(
            `DELETE FROM trash WHERE media_id IN (${placeholders})`,
            expiredIds,
          );
          deleteAssetsFromDevice(expiredIds);
        }
        dispatch({
          type: "BOOT",
          payload: { settings, albums, albumItems, trash: kept, media },
        });
      } catch (e) {
        dispatch({ type: "BOOT", payload: { media: [] } });
      }
    })();
  }, []);

  // Background enrichment: fill in real file size + hash, a small batch at a
  // time with a yield between items so the UI stays responsive.
  useEffect(() => {
    if (!state.ready) return;
    if (state.media.length === 0) return;
    let cancelled = false;

    (async () => {
      const targets = state.media
        .filter((m) => !m.isDemo && (!m.fileSize || !m.contentHash))
        .slice(0, 40);
      if (targets.length === 0) return;

      for (const m of targets) {
        if (cancelled) return;
        try {
          const withSize = await enrichMediaItem(m);
          const contentHash = await computeQuickHash(withSize);
          if (!cancelled) {
            dispatch({ type: "PATCH_MEDIA_ITEMS", items: [{ ...withSize, contentHash }] });
          }
        } catch {
          // never let one bad item stop the loop
        }
        await new Promise((r) => setTimeout(r, 30));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ready, state.media.length]);

  const reloadMedia = useCallback(async () => {
    const media = await loadAlbumMedia("testapp");
    dispatch({ type: "SET_MEDIA", payload: media });
  }, []);

  const setPermission = useCallback((p: PermissionState) => {
    dispatch({ type: "SET_PERMISSION", payload: p });
  }, []);

  const patchSettings = useCallback(async (p: Partial<Settings>) => {
    const merged = { ...stateRef.current.settings, ...p };
    dispatch({ type: "PATCH_SETTINGS", payload: p });
    await kvSet("settings", merged);
  }, []);

  const persistTrashAdd = async (item: TrashItem) => {
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO trash (media_id, snapshot, deleted_at) VALUES (?, ?, ?)",
      [item.media.id, JSON.stringify(item.media), item.deletedAt],
    );
  };
  const persistTrashRemove = async (ids: string[]) => {
    if (!ids.length) return;
    const db = await getDb();
    const placeholders = ids.map(() => "?").join(",");
    await db.runAsync(`DELETE FROM trash WHERE media_id IN (${placeholders})`, ids);
  };

  // Soft delete ONLY. The file on the device is not touched. It stays in the
  // app's "Recently Deleted" tab until the user explicitly empties it.
  const swipeDelete = useCallback((m: MediaItem) => {
    dispatch({
      type: "APPLY_ACTION",
      action: { kind: "delete", media: m },
      pushUndo: true,
      clearRedo: true,
    });
    persistTrashAdd({ media: m, deletedAt: Date.now() });
  }, []);

  const swipeKeep = useCallback((m: MediaItem) => {
    dispatch({
      type: "APPLY_ACTION",
      action: { kind: "keep", media: m },
      pushUndo: true,
      clearRedo: true,
    });
  }, []);

  const persistAlbumItem = async (albumId: string, mediaId: string) => {
    const db = await getDb();
    await db.runAsync(
      "INSERT OR REPLACE INTO album_items (album_id, media_id, added_at) VALUES (?, ?, ?)",
      [albumId, mediaId, Date.now()],
    );
  };

  const organize = useCallback((m: MediaItem, albumId: string) => {
    dispatch({
      type: "APPLY_ACTION",
      action: { kind: "organize", media: m, albumId },
      pushUndo: true,
      clearRedo: true,
    });
    persistAlbumItem(albumId, m.id);
  }, []);

  const undo = useCallback(() => {
    const last = stateRef.current.undoStack[0];
    if (!last) return;
    // Undo a delete: remove from app trash, put back in swipe queue.
    // Device was never touched, so this is a full restore.
    if (last.kind === "delete") {
      persistTrashRemove([last.media.id]);
    }
    dispatch({ type: "UNDO" });
  }, []);

  const redo = useCallback(() => {
    const last = stateRef.current.redoStack[0];
    if (!last) return;
    dispatch({ type: "REDO" });
    if (last.kind === "delete") {
      persistTrashAdd({ media: last.media, deletedAt: Date.now() });
    }
  }, []);

  const restoreFromTrash = useCallback((ids: string[]) => {
    dispatch({ type: "PURGE_TRASH", ids });
    persistTrashRemove(ids);
  }, []);

  // Called from the Trash screen's "Delete" button. This is the ONLY place
  // that actually removes files from the device.
  const permanentlyDelete = useCallback(async (ids: string[]) => {
    const ok = await deleteAssetsFromDevice(ids);
    if (!ok) return;
    dispatch({ type: "PURGE_TRASH", ids });
    persistTrashRemove(ids);
  }, []);

  // Called from the Trash screen's "Empty" button.
  const emptyTrash = useCallback(async () => {
    const ids = stateRef.current.trash.map((t) => t.media.id);
    if (!ids.length) return;
    const ok = await deleteAssetsFromDevice(ids);
    if (!ok) return;
    dispatch({ type: "EMPTY_TRASH" });
    persistTrashRemove(ids);
  }, []);

  const createAlbum = useCallback((name: string): Album => {
    const album: Album = {
      id: `alb-${Date.now()}`,
      name,
      createdAt: Date.now(),
      count: 0,
    };
    dispatch({ type: "ADD_ALBUM", album });
    (async () => {
      const db = await getDb();
      await db.runAsync(
        "INSERT INTO albums (id, name, cover_uri, created_at) VALUES (?, ?, ?, ?)",
        [album.id, album.name, null, album.createdAt],
      );
    })();
    return album;
  }, []);

  const renameAlbum = useCallback((id: string, name: string) => {
    dispatch({ type: "RENAME_ALBUM", id, name });
    (async () => {
      const db = await getDb();
      await db.runAsync("UPDATE albums SET name = ? WHERE id = ?", [name, id]);
    })();
  }, []);

  const removeAlbum = useCallback((id: string) => {
    dispatch({ type: "REMOVE_ALBUM", id });
    (async () => {
      const db = await getDb();
      await db.runAsync("DELETE FROM albums WHERE id = ?", [id]);
      await db.runAsync("DELETE FROM album_items WHERE album_id = ?", [id]);
    })();
  }, []);

  const moveToAlbum = useCallback((mediaId: string, albumId: string) => {
    const list = stateRef.current.albumItems[albumId] ?? [];
    if (list.includes(mediaId)) return;
    const next = [...list, mediaId];
    dispatch({ type: "SET_ALBUM_ITEMS", albumId, ids: next });
    persistAlbumItem(albumId, mediaId);
  }, []);

  const removeFromAlbum = useCallback((mediaId: string, albumId: string) => {
    const list = stateRef.current.albumItems[albumId] ?? [];
    const next = list.filter((id) => id !== mediaId);
    dispatch({ type: "SET_ALBUM_ITEMS", albumId, ids: next });
    (async () => {
      const db = await getDb();
      await db.runAsync(
        "DELETE FROM album_items WHERE album_id = ? AND media_id = ?",
        [albumId, mediaId],
      );
    })();
  }, []);

  const setCursor = useCallback((idx: number) => {
    dispatch({ type: "BOOT", payload: { cursor: idx } });
  }, []);

  const duplicateMedia = useCallback(async (m: MediaItem): Promise<MediaItem | null> => {
    const copy = await duplicateAssetToLibrary(m);
    if (copy) dispatch({ type: "ADD_MEDIA_ITEM", item: copy });
    return copy;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      state,
      currentMedia: state.media[state.cursor],
      progress: { index: Math.min(state.cursor + 1, state.media.length), total: state.media.length },
      reloadMedia,
      setPermission,
      patchSettings,
      swipeDelete,
      swipeKeep,
      organize,
      undo,
      redo,
      restoreFromTrash,
      permanentlyDelete,
      emptyTrash,
      createAlbum,
      renameAlbum,
      removeAlbum,
      moveToAlbum,
      removeFromAlbum,
      setCursor,
      duplicateMedia,
    }),
    [
      state,
      reloadMedia,
      setPermission,
      patchSettings,
      swipeDelete,
      swipeKeep,
      organize,
      undo,
      redo,
      restoreFromTrash,
      permanentlyDelete,
      emptyTrash,
      createAlbum,
      renameAlbum,
      removeAlbum,
      moveToAlbum,
      removeFromAlbum,
      setCursor,
      duplicateMedia,
    ],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}