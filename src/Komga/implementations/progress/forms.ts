/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import {
  ButtonRow,
  Form,
  LabelRow,
  SelectRow,
  Section,
  type Chapter,
  type FormSectionElement,
  type SourceManga,
} from "@paperback/types";

import { komgaFetch } from "../../services/network";
import { chapterLabel } from "../shared/titles";
import { errorMessage } from "../shared/utils";

const UNREAD_ID = "unread";
const UNREAD_LABEL = "No chapters read";

export class KomgaProgressForm extends Form {
  override readonly requiresExplicitSubmission = true;

  private readonly chapters: Chapter[];
  private current: Chapter | undefined;
  private selectedId: string;
  private actionError: string | undefined;

  constructor(
    private readonly sourceManga: SourceManga,
    chapters: Chapter[],
    current: Chapter | undefined,
  ) {
    super();
    this.chapters = [...chapters].sort(
      (a, b) => (a.sortingIndex ?? a.chapNum) - (b.sortingIndex ?? b.chapNum),
    );
    this.current = current;
    this.selectedId = current?.chapterId ?? UNREAD_ID;
  }

  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section(
        {
          id: "progress",
          header: "Reading progress",
          footer:
            "Submit to sync this to Komga. Choosing No chapters read marks the series unread.",
        },
        [
          LabelRow("current_progress", {
            title: "Current progress",
            value: this.current ? chapterLabel(this.current) : UNREAD_LABEL,
          }),
          SelectRow("last_read_chapter", {
            title: "Last Read Chapter",
            value: [this.selectedId],
            minItemCount: 1,
            maxItemCount: 1,
            layout: "list",
            items: [
              { id: UNREAD_ID, title: UNREAD_LABEL },
              ...this.chapters.map((chapter) => ({
                id: chapter.chapterId,
                title: chapterLabel(chapter),
              })),
            ],
            onValueChange: Application.Selector(this as KomgaProgressForm, "handleSelect"),
          }),
        ],
      ),
      Section({ id: "actions", footer: this.actionError }, [
        ButtonRow("mark_unread", {
          title: "Mark Unread",
          onSelect: Application.Selector(this as KomgaProgressForm, "handleMarkUnread"),
        }),
        ButtonRow("mark_read", {
          title: "Mark Read",
          onSelect: Application.Selector(this as KomgaProgressForm, "handleMarkRead"),
        }),
      ]),
    ];
  }

  async handleSelect(value: string[]): Promise<void> {
    this.selectedId = value[0] ?? UNREAD_ID;
    this.reloadForm();
  }

  async handleMarkUnread(): Promise<void> {
    try {
      await this.markUnread();
      this.actionError = undefined;
    } catch (err) {
      this.actionError = `Could not mark unread: ${errorMessage(err)}`;
    }
    this.reloadForm();
  }

  async handleMarkRead(): Promise<void> {
    try {
      await komgaFetch(`/api/v1/series/${this.sourceManga.mangaId}/read-progress`, {
        method: "POST",
      });
      this.current = this.chapters[this.chapters.length - 1];
      this.selectedId = this.current?.chapterId ?? UNREAD_ID;
      this.actionError = undefined;
    } catch (err) {
      this.actionError = `Could not mark read: ${errorMessage(err)}`;
    }
    this.reloadForm();
  }

  override async formDidSubmit(): Promise<void> {
    const chapter = this.chapters.find((c) => c.chapterId === this.selectedId);
    if (!chapter) {
      await this.markUnread();
      return;
    }
    await komgaFetch(`/api/v2/series/${this.sourceManga.mangaId}/read-progress/tachiyomi`, {
      method: "PUT",
      body: { lastBookNumberSortRead: chapter.sortingIndex ?? chapter.chapNum },
    });
    this.current = chapter;
  }

  private async markUnread(): Promise<void> {
    await komgaFetch(`/api/v1/series/${this.sourceManga.mangaId}/read-progress`, {
      method: "DELETE",
    });
    this.current = undefined;
    this.selectedId = UNREAD_ID;
  }
}
