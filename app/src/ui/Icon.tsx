import type { SVGAttributes } from 'preact';

/** Inline SVG icons (24x24, stroke = currentColor). No icon font, no network. */
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10M10 19.5v-5h4v5',
  cards: 'M4 7.5h12a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1ZM7 7.5V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v10.5a1 1 0 0 1-1 1h-3',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  chat: 'M4 5h16v11H9l-5 4V5Z',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-1-2 3.5 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  play: 'M5 9v6h4l5 4V5L9 9H5ZM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11',
  mute: 'M5 9v6h4l5 4V5L9 9H5ZM17 9.5l5 5M22 9.5l-5 5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  check: 'M5 12.5 10 17.5 19 7',
  x: 'M6 6l12 12M18 6 6 18',
  pen: 'M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1ZM14 7l3 3',
  ear: 'M7 10a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.5M10 10a2 2 0 0 1 4 0',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4ZM5 17a3 3 0 0 1 3-3h11',
  translate: 'M4 6h9M8.5 4v2M6 6c.5 3 2.5 5.5 6 7M11 6c-.5 3-2.5 5.5-6 7M13 20l4-9 4 9M14.5 17h5',
  quiz: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 16.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.5h.01',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9.5l5-5 5 5M5 20h14',
  keyboard: 'M3 6.5h18v11H3v-11ZM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  star: 'M12 4l2.5 5.2 5.5.8-4 4 1 5.7L12 17l-5 2.7 1-5.7-4-4 5.5-.8L12 4Z',
  grid: 'M4 4h7v7H4V4ZM13 4h7v7h-7V4ZM4 13h7v7H4v-7ZM13 13h7v7h-7v-7Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, flip, ...rest }: { name: IconName; flip?: boolean } & SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={flip ? 'flip-rtl' : undefined}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
