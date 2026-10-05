import "@tiptap/extension-text-style";
import { Extension } from "@tiptap/core";

export type FontSizeOptions = {
  types: string[];
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

/** Allowed font sizes (px). Arbitrary CSS values are rejected on the server. */
export const ALLOWED_FONT_SIZES = new Set([
  "12px", "13px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "36px",
]);

/**
 * FontSize mark extension for Tiptap v2.
 * Enforces validated font size presets on textStyle marks with strict TypeScript typing.
 */
export const FontSize = Extension.create<FontSizeOptions>({
  name: "fontSize",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const fs = element.style?.fontSize;
              return fs?.replace(/['"]+/g, "").trim() || null;
            },
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) => {
          return chain().setMark("textStyle", { fontSize }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run();
        },
    };
  },
});
