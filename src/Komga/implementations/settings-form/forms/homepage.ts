/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Copyright © 2026 Exikle */

import { Form, SelectRow, Section, ToggleRow, type FormSectionElement } from "@paperback/types";

import { DISCOVER_SECTIONS } from "../../discover-section/sections";
import { getSectionStyle, setSectionStyle, type SectionStyle } from "../../shared/state";

const STYLE_ITEMS: { id: SectionStyle; title: string }[] = [
  { id: "simple", title: "Regular" },
  { id: "large", title: "Large" },
  { id: "hero", title: "Hero" },
  { id: "hidden", title: "Hidden" },
];

const isStyle = (value: string | undefined): value is SectionStyle =>
  STYLE_ITEMS.some((item) => item.id === value);

export class KomgaHomepageForm extends Form {
  constructor() {
    super();
    // One handler per section; Selector looks them up by name on this instance.
    for (const { id, fixedStyle } of DISCOVER_SECTIONS) {
      (this as Record<string, unknown>)[`handleSectionStyle_${id}`] = fixedStyle
        ? async (on: boolean): Promise<void> => {
            setSectionStyle(id, on ? "simple" : "hidden");
            this.changed();
          }
        : async (value: string[]): Promise<void> => {
            const style = value[0];
            if (isStyle(style)) setSectionStyle(id, style);
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
            : SelectRow(`section_${id}`, {
                title,
                subtitle,
                value: [getSectionStyle(id)],
                minItemCount: 1,
                maxItemCount: 1,
                layout: "list",
                items: STYLE_ITEMS,
                onValueChange: onValueChange as never,
              });
        }),
      ),
    ];
  }

  private changed(): void {
    Application.invalidateDiscoverSections();
    this.reloadForm();
  }
}
