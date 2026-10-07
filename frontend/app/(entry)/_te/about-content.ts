/**
 * The About page's achievements and feedback. These are the design's own
 * placeholders - NO real figures or testimonial have been supplied. Replace the
 * bracketed values with real, verifiable ones before launch; nothing else on
 * the page needs to change.
 */
export const STATS = [
  { value: '[Years]', label: 'years teaching' },
  { value: '[Students]', label: 'students' },
  { value: '[Pass rate]%', label: 'top grades' },
  { value: '[Lessons]', label: 'recorded lessons' },
] as const;

export const FEEDBACK = {
  quote: 'I went from failing English to my best grade in one term. He explains things like nobody else.',
  name: '[Student name]',
  detail: 'IGCSE student, 2025',
} as const;
