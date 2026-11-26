/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import {
  AdvancedSearchForm,
  closureSelector,
  InputRow,
  Section,
  TriStateSelectRow,
  type FormSectionElement,
  type SearchQuery,
  type TagSection,
} from "@paperback/types";

// Group ids are "genres", "tags", "libraries", "collections", "readStatus", "seriesStatus",
// "publishers", "languages" and "ageRatings"; each maps tag ids to a state.
export type KomgaSearchMetadata = {
  author?: string;
  filters?: Record<string, Record<string, "included" | "excluded">>;
};

export class KomgaSearchForm extends AdvancedSearchForm {
  private metadata: KomgaSearchMetadata;
  private filters: NonNullable<KomgaSearchMetadata["filters"]>;
  private groups: TagSection[];

  constructor(query: SearchQuery<KomgaSearchMetadata>, groups: TagSection[]) {
    super();
    const raw = query.metadata;
    const meta: KomgaSearchMetadata =
      raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const saved: unknown = meta.filters;
    this.filters = meta.filters =
      saved && typeof saved === "object" && !Array.isArray(saved)
        ? (saved as NonNullable<KomgaSearchMetadata["filters"]>)
        : {};
    this.metadata = meta;
    this.groups = groups;
  }

  override getSearchQueryMetadata(): KomgaSearchMetadata {
    return this.metadata;
  }

  override getSections(): FormSectionElement<unknown>[] {
    return [...this.groups.map((group) => this.groupSection(group)), this.authorSection()];
  }

  private authorSection(): FormSectionElement<unknown> {
    return Section({ id: "author_section", header: "Author" }, [
      InputRow("author", {
        title: "Author",
        value: this.metadata.author ?? "",
        onValueChange: closureSelector(this, "author", async (value: string) => {
          this.metadata.author = value;
        }),
      }),
    ]);
  }

  private groupSection(group: TagSection): FormSectionElement<unknown> {
    const rowId = `tags-${group.id}`;
    return Section({ id: `${rowId}_section`, header: group.title }, [
      TriStateSelectRow(rowId, {
        title: group.title,
        layout: "list",
        value: this.filters[group.id] ?? {},
        allowExclusion: group.id !== "readStatus",
        allowEmptySelection: true,
        items: group.tags.map((tag) => ({ id: tag.id, title: tag.title })),
        onValueChange: closureSelector(
          this,
          rowId,
          async (value: Record<string, "included" | "excluded">) => {
            this.filters[group.id] = value;
          },
        ),
      }),
    ]);
  }
}
