/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import type {
  ManagedCollection,
  ManagedCollectionChange,
  ManagedCollectionChangeFailure,
  ManagedCollectionItems,
} from "@paperback/types";

import { komgaFetch } from "../../services/network";
import { toSourceManga } from "../manga/parsers";
import type { CollectionDto, Page, SeriesDto, UserDto } from "../shared/models";
import { errorMessage } from "../shared/utils";

const NOT_ADMIN = "Changing Komga collections needs an admin account";
const WOULD_BE_EMPTY = "Komga collections can't be empty";
const MALFORMED = "Komga returned an unexpected collection";
const HIDDEN_SERIES = "This collection has series your account can't see";

// Komga answers an unpaged list as a page; accept a bare array too.
const rowsOf = <T>(response: Page<T> | T[] | undefined): T[] =>
  Array.isArray(response) ? response : (response?.content ?? []);

export async function getManagedCollections(): Promise<ManagedCollection[]> {
  try {
    const response = await komgaFetch<Page<CollectionDto> | CollectionDto[]>(
      "/api/v1/collections",
      { query: { unpaged: true } },
    );
    return rowsOf(response).map((collection) => ({ id: collection.id, title: collection.name }));
  } catch (error) {
    console.log(`[Komga] Could not load collections: ${errorMessage(error)}`);
    return [];
  }
}

export async function getManagedCollectionItems(
  collections: ManagedCollection[],
): Promise<ManagedCollectionItems[]> {
  return Promise.all(
    collections.map(async (collection): Promise<ManagedCollectionItems> => {
      try {
        const response = await komgaFetch<Page<SeriesDto> | SeriesDto[]>(
          `/api/v1/collections/${collection.id}/series`,
          { query: { unpaged: true } },
        );
        return { collectionId: collection.id, items: rowsOf(response).map(toSourceManga) };
      } catch (error) {
        console.log(`[Komga] Could not load collection ${collection.id}: ${errorMessage(error)}`);
        return { collectionId: collection.id, items: [] };
      }
    }),
  );
}

type Edit = {
  changeId: string;
  type: "add" | "remove";
  seriesId: string;
  // The remove half of a move: applied only after its add half succeeded.
  afterAdd?: boolean;
};

const editsFor = (change: ManagedCollectionChange): [string, Edit][] => {
  const seriesId = change.sourceManga.mangaId;
  switch (change.type) {
    case "add":
      return [[change.to.id, { changeId: change.id, type: "add", seriesId }]];
    case "remove":
      return [[change.from.id, { changeId: change.id, type: "remove", seriesId }]];
    case "move":
      // Moving a series onto its own collection changes nothing.
      if (change.from.id === change.to.id) return [];
      return [
        [change.to.id, { changeId: change.id, type: "add", seriesId }],
        [change.from.id, { changeId: change.id, type: "remove", seriesId, afterAdd: true }],
      ];
  }
};

async function isAdmin(): Promise<boolean> {
  const user = await komgaFetch<UserDto>("/api/v2/users/me");
  return user?.roles?.includes("ADMIN") ?? false;
}

export async function applyManagedCollectionChanges(
  changes: ManagedCollectionChange[],
): Promise<ManagedCollectionChangeFailure[]> {
  if (changes.length === 0) return [];

  let admin = false;
  try {
    admin = await isAdmin();
  } catch (error) {
    throw new Error(`Komga collection update failed: ${errorMessage(error)}`);
  }
  if (!admin) throw new Error(`Komga collection update failed: ${NOT_ADMIN}`);

  const failed = new Map<string, string>();
  const fail = (changeId: string, reason: string) => {
    if (!failed.has(changeId)) failed.set(changeId, reason);
  };

  const applyEdits = async (edits: [string, Edit][]) => {
    const byCollection = new Map<string, Edit[]>();
    for (const [collectionId, edit] of edits) {
      byCollection.set(collectionId, [...(byCollection.get(collectionId) ?? []), edit]);
    }

    for (const [collectionId, group] of byCollection) {
      const path = `/api/v1/collections/${collectionId}`;
      let collection: CollectionDto | undefined;
      try {
        collection = await komgaFetch<CollectionDto>(path);
      } catch (error) {
        for (const edit of group) fail(edit.changeId, errorMessage(error));
        continue;
      }
      if (!collection || !Array.isArray(collection.seriesIds)) {
        for (const edit of group) fail(edit.changeId, MALFORMED);
        continue;
      }

      // A filtered list hides series this account can't see, so a PATCH would delete them.
      if (collection.filtered) {
        for (const edit of group) fail(edit.changeId, HIDDEN_SERIES);
        continue;
      }

      const original = collection.seriesIds;
      let seriesIds = [...original];
      const applied: Edit[] = [];
      for (const edit of group) {
        if (edit.type === "add") {
          if (!seriesIds.includes(edit.seriesId)) seriesIds.push(edit.seriesId);
          applied.push(edit);
        } else if (!seriesIds.includes(edit.seriesId)) {
          applied.push(edit);
        } else if (seriesIds.length === 1) {
          fail(edit.changeId, WOULD_BE_EMPTY);
        } else {
          seriesIds = seriesIds.filter((id) => id !== edit.seriesId);
          applied.push(edit);
        }
      }

      if (seriesIds.length === original.length && seriesIds.every((id, i) => id === original[i])) {
        continue;
      }

      try {
        await komgaFetch<undefined>(path, { method: "PATCH", body: { seriesIds } });
      } catch (error) {
        for (const edit of applied) fail(edit.changeId, errorMessage(error));
      }
    }
  };

  // Add first, remove second: a move whose add failed leaves the series where it was.
  const all = changes.flatMap(editsFor);
  await applyEdits(all.filter(([, edit]) => !edit.afterAdd));
  await applyEdits(all.filter(([, edit]) => edit.afterAdd && !failed.has(edit.changeId)));

  const failures = changes.flatMap((change) =>
    failed.has(change.id) ? [{ changeId: change.id, reason: failed.get(change.id)! }] : [],
  );
  if (failures.length === changes.length) {
    throw new Error(`Komga collection update failed: ${failures[0]!.reason}`);
  }
  return failures;
}
