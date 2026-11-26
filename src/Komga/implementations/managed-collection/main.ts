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

type Edit = { changeId: string; type: "add" | "remove"; seriesId: string };

// A move is a remove from `from` plus an add to `to`.
const editsFor = (change: ManagedCollectionChange): [string, Edit][] => {
  const seriesId = change.sourceManga.mangaId;
  switch (change.type) {
    case "add":
      return [[change.to.id, { changeId: change.id, type: "add", seriesId }]];
    case "remove":
      return [[change.from.id, { changeId: change.id, type: "remove", seriesId }]];
    case "move":
      return [
        [change.from.id, { changeId: change.id, type: "remove", seriesId }],
        [change.to.id, { changeId: change.id, type: "add", seriesId }],
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
  const failed = new Map<string, string>();
  const fail = (changeId: string, reason: string) => {
    if (!failed.has(changeId)) failed.set(changeId, reason);
  };
  const result = (): ManagedCollectionChangeFailure[] =>
    changes.flatMap((change) =>
      failed.has(change.id) ? [{ changeId: change.id, reason: failed.get(change.id)! }] : [],
    );

  if (changes.length === 0) return [];

  let admin = false;
  let adminError = NOT_ADMIN;
  try {
    admin = await isAdmin();
  } catch (error) {
    adminError = errorMessage(error);
  }
  if (!admin) {
    for (const change of changes) fail(change.id, adminError);
    throw new Error(`Komga collection update failed: ${adminError}`);
  }

  const byCollection = new Map<string, Edit[]>();
  for (const change of changes) {
    for (const [collectionId, edit] of editsFor(change)) {
      byCollection.set(collectionId, [...(byCollection.get(collectionId) ?? []), edit]);
    }
  }

  for (const [collectionId, edits] of byCollection) {
    const path = `/api/v1/collections/${collectionId}`;
    let collection: CollectionDto;
    try {
      collection = await komgaFetch<CollectionDto>(path);
    } catch (error) {
      for (const edit of edits) fail(edit.changeId, errorMessage(error));
      continue;
    }

    // A filtered list hides series this account can't see, so a PATCH would delete them.
    if (collection.filtered) {
      for (const edit of edits) fail(edit.changeId, HIDDEN_SERIES);
      continue;
    }

    let seriesIds = [...collection.seriesIds];
    const applied: Edit[] = [];
    for (const edit of edits) {
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

    const unchanged =
      seriesIds.length === collection.seriesIds.length &&
      seriesIds.every((id, i) => id === collection.seriesIds[i]);
    if (unchanged) continue;

    try {
      await komgaFetch<undefined>(path, { method: "PATCH", body: { seriesIds } });
    } catch (error) {
      for (const edit of applied) fail(edit.changeId, errorMessage(error));
    }
  }

  const failures = result();
  if (failures.length === changes.length) {
    throw new Error(`Komga collection update failed: ${failures[0]!.reason}`);
  }
  return failures;
}
