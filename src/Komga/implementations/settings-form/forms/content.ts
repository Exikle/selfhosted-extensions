/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { Form, Section, SelectRow, ToggleRow, type FormSectionElement } from "@paperback/types";

import { komgaFetch } from "../../../services/network";
import type { LibraryDto } from "../../shared/models";
import {
  getAdultGenres,
  getHideAdultContent,
  getIncludeOneshots,
  getSelectedLibraries,
  setAdultGenres,
  setHideAdultContent,
  setIncludeOneshots,
  setSelectedLibraries,
} from "../../shared/state";
import { capitalise, decodeTagId, encodeTagId } from "../../shared/utils";

export class KomgaContentForm extends Form {
  private serverGenres: string[] = [];
  private libraries: LibraryDto[] = [];

  override getSections(): FormSectionElement<unknown>[] {
    const stored = getAdultGenres();
    const genres = [
      ...new Set([...this.serverGenres.map((g) => g.toLowerCase()), ...stored]),
    ].sort();
    return [
      Section({ id: "adult_content", header: "Adult Content" }, [
        ToggleRow("hide_adult", {
          title: "Hide Adult Content",
          value: getHideAdultContent(),
          onValueChange: Application.Selector(this as KomgaContentForm, "handleHideAdult"),
        }),
        SelectRow("adult_genres", {
          title: "Genres To Hide",
          isDisabled: !getHideAdultContent(),
          value: stored.map((g) => encodeTagId("genre", g)),
          minItemCount: 0,
          maxItemCount: Math.max(genres.length, 1),
          layout: "list",
          items: genres.map((g) => ({ id: encodeTagId("genre", g), title: capitalise(g) })),
          onValueChange: Application.Selector(this as KomgaContentForm, "handleAdultGenres"),
        }),
      ]),
      Section(
        {
          id: "library_content",
          header: "Library",
          footer: "Select none to show every library.",
        },
        [
          SelectRow("libraries", {
            title: "Libraries",
            value: getSelectedLibraries(),
            minItemCount: 0,
            maxItemCount: Math.max(this.libraries.length, 1),
            layout: "list",
            items: this.libraries.map((l) => ({ id: l.id, title: l.name })),
            onValueChange: Application.Selector(this as KomgaContentForm, "handleLibraries"),
          }),
          ToggleRow("include_oneshots", {
            title: "Include One-Shots",
            value: getIncludeOneshots(),
            onValueChange: Application.Selector(this as KomgaContentForm, "handleIncludeOneshots"),
          }),
        ],
      ),
    ];
  }

  override async formWillAppear(): Promise<void> {
    // A failed load leaves the lists empty; the form still opens.
    const [genres, libraries] = await Promise.all([
      komgaFetch<string[]>("/api/v1/genres").catch(() => undefined),
      komgaFetch<LibraryDto[]>("/api/v1/libraries").catch(() => undefined),
    ]);
    this.serverGenres = Array.isArray(genres) ? genres.filter((g) => typeof g === "string") : [];
    this.libraries = Array.isArray(libraries)
      ? libraries.filter((l) => typeof l?.id === "string" && typeof l?.name === "string")
      : [];
    this.reloadForm();
  }

  async handleHideAdult(value: boolean): Promise<void> {
    setHideAdultContent(value);
    this.changed();
  }

  async handleAdultGenres(value: string[]): Promise<void> {
    setAdultGenres(
      value.flatMap((id) => {
        const decoded = decodeTagId(id);
        return decoded ? [decoded.value.toLowerCase()] : [];
      }),
    );
    this.changed();
  }

  async handleLibraries(value: string[]): Promise<void> {
    setSelectedLibraries(value);
    this.changed();
  }

  async handleIncludeOneshots(value: boolean): Promise<void> {
    setIncludeOneshots(value);
    this.changed();
  }

  private changed(): void {
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
}
