/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import {
  Form,
  LabelRow,
  MenuRow,
  Section,
  ToggleRow,
  type FormSectionElement,
} from "@paperback/types";

import { loadReadLists } from "../../discover-section/main";
import { DISCOVER_SECTIONS } from "../../discover-section/sections";
import type { ReadListDto } from "../../shared/models";
import {
  getReadListEnabled,
  getSectionStyle,
  setReadListEnabled,
  setSectionStyle,
  type SectionStyle,
} from "../../shared/state";

const STYLE_ITEMS: { id: SectionStyle; title: string }[] = [
  { id: "simple", title: "Regular" },
  { id: "large", title: "Large" },
  { id: "hero", title: "Hero" },
  { id: "hidden", title: "Hidden" },
];

const isStyle = (value: string | undefined): value is SectionStyle =>
  STYLE_ITEMS.some((item) => item.id === value);

export class KomgaHomepageForm extends Form {
  // Row ids are built by index; this keeps the read list behind each one.
  private readLists: ReadListDto[] = [];

  constructor() {
    super();
    // One handler per section; Selector looks them up by name on this instance.
    for (const { id, fixedStyle } of DISCOVER_SECTIONS) {
      (this as Record<string, unknown>)[`handleSectionStyle_${id}`] = fixedStyle
        ? async (on: boolean): Promise<void> => {
            setSectionStyle(id, on ? "simple" : "hidden");
            this.changed();
          }
        : async (itemId: string): Promise<void> => {
            if (isStyle(itemId)) setSectionStyle(id, itemId);
            this.changed();
          };
    }
  }

  override getSections(): FormSectionElement<unknown>[] {
    return [
      Section(
        { id: "sections", header: "Homepage Sections" },
        DISCOVER_SECTIONS.map(({ id, title, subtitle, fixedStyle }) => {
          const onValueChange = Application.Selector(
            this as KomgaHomepageForm,
            `handleSectionStyle_${id}` as never,
          );
          return fixedStyle
            ? ToggleRow(`section_${id}`, {
                title,
                subtitle,
                value: getSectionStyle(id) !== "hidden",
                onValueChange: onValueChange as never,
              })
            : MenuRow(`section_${id}`, {
                title,
                subtitle,
                value: getSectionStyle(id),
                items: STYLE_ITEMS,
                onSelect: onValueChange as never,
              });
        }),
      ),
      Section(
        { id: "read_lists", header: "Read Lists" },
        this.readLists.length === 0
          ? [LabelRow("read_lists_none", { title: "No read lists" })]
          : this.readLists.map(({ id, name }, index) =>
              ToggleRow(`read_list_${index}`, {
                title: name,
                value: getReadListEnabled(id),
                onValueChange: Application.Selector(
                  this as KomgaHomepageForm,
                  `handleReadList_${index}` as never,
                ) as never,
              }),
            ),
      ),
    ];
  }

  override async formWillAppear(): Promise<void> {
    this.readLists = await loadReadLists();
    this.readLists.forEach(({ id }, index) => {
      (this as Record<string, unknown>)[`handleReadList_${index}`] = async (
        on: boolean,
      ): Promise<void> => {
        setReadListEnabled(id, on);
        this.changed();
      };
    });
    this.reloadForm();
  }

  private changed(): void {
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
}
