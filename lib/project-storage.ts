import { openDB, type DBSchema } from 'idb';
import { EditorProject } from './types';

const DB_NAME = 'music-video-phase-2';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const ASSET_STORE = 'assets';

interface ProjectDatabase extends DBSchema {
  projects: {
    key: string;
    value: EditorProject;
  };
  assets: {
    key: string;
    value: {
      id: string;
      blob: Blob;
    };
  };
}

const getDatabase = () => openDB<ProjectDatabase>(DB_NAME, DB_VERSION, {
  upgrade(database) {
    if (!database.objectStoreNames.contains(PROJECT_STORE)) {
      database.createObjectStore(PROJECT_STORE);
    }

    if (!database.objectStoreNames.contains(ASSET_STORE)) {
      database.createObjectStore(ASSET_STORE);
    }
  },
});

export const loadPersistedProject = async (projectId: string) => {
  const database = await getDatabase();
  return database.get(PROJECT_STORE, projectId);
};

export const persistProject = async (project: EditorProject) => {
  const database = await getDatabase();
  await database.put(PROJECT_STORE, project, project.id);
};

export const persistAssetBlob = async (assetId: string, blob: Blob) => {
  const database = await getDatabase();
  await database.put(ASSET_STORE, { id: assetId, blob }, assetId);
};

export const loadPersistedAssetBlobs = async (assetIds: string[]) => {
  const database = await getDatabase();
  const entries = await Promise.all(assetIds.map(async (assetId) => {
    const storedAsset = await database.get(ASSET_STORE, assetId);
    return [assetId, storedAsset?.blob ?? null] as const;
  }));

  return Object.fromEntries(entries.filter((entry): entry is [string, Blob] => entry[1] instanceof Blob));
};

export const deletePersistedAssets = async (assetIds: string[]) => {
  if (assetIds.length === 0) {
    return;
  }

  const database = await getDatabase();
  const transaction = database.transaction(ASSET_STORE, 'readwrite');

  await Promise.all(assetIds.map((assetId) => transaction.store.delete(assetId)));
  await transaction.done;
};