/**
 * Public marketing copy and imagery, in one place so it can move into the CMS
 * (CLAUDE.md §6.1 `BlogPost` / `Testimonial` / `FAQ`) without touching a
 * component. Nothing here is wired to the backend - there is no visitor API
 * yet (§7.1), so the public site renders from this file for now.
 *
 * IMAGES are seeded placeholders. Every `photo()` call below needs replacing
 * with real photography of Dr. Tahir and real classroom shots before launch.
 */

/**
 * PLACEHOLDER contact details. Both values are invented and must be replaced
 * with Dr. Tahir's real WhatsApp number and inbox before launch.
 *
 * They live here rather than inline in the footer and the contact page so
 * there is one place to change and no chance of the two drifting - and so a
 * placeholder cannot go live unmarked, which is how a fake number reaches a
 * printed flyer.
 */
export const CONTACT = {
  whatsappNumber: '201000000000',
  get whatsappUrl() {
    return `https://wa.me/${this.whatsappNumber}`;
  },
  email: 'hello@tahirelshazli.com',
} as const;

export const photo = (seed: string, w: number, h: number) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export interface Track {
  slug: string;
  name: string;
  audience: string;
  summary: string;
  points: string[];
  image: string;
}

export const TRACKS: Track[] = [
  {
    slug: 'igcse',
    name: 'IGCSE English',
    audience: 'Years 10 and 11',
    summary:
      'Paper-by-paper preparation across the reading, writing and coursework components, marked against the board criteria your school actually uses.',
    points: [
      'Directed writing and composition drills',
      'Reading passages worked in class, then set as homework',
      'Every script returned annotated, not just scored',
    ],
    image: photo('igcse-english-classroom-notes', 900, 1100),
  },
  {
    slug: 'ielts',
    name: 'IELTS Preparation',
    audience: 'Academic and General Training',
    summary:
      'Band-targeted work across all four skills, with speaking practice in small groups and writing tasks returned inside 48 hours.',
    points: [
      'Task 1 and Task 2 writing under timed conditions',
      'Speaking parts 1 to 3, recorded and reviewed',
      'Listening and reading with band-score tracking',
    ],
    image: photo('ielts-speaking-practice-desk', 900, 1100),
  },
];

export interface Stage {
  verb: string;
  body: string;
}

/** Named by what the student does, not by "Step 1 / Step 2". */
export const STAGES: Stage[] = [
  {
    verb: 'Attend',
    body: 'Live classes run to a fixed timetable. You get the meeting link and the time in your dashboard, and the recording afterwards if you could not make it.',
  },
  {
    verb: 'Practise',
    body: 'Homework and assignments open on a schedule. Submit a file or type your answer, and revise it as often as you like before the window closes.',
  },
  {
    verb: 'Get marked',
    body: 'Work comes back annotated by hand, with a mark and written feedback. Your averages, strong topics and weak topics update as it lands.',
  },
];

export interface PlatformFeature {
  title: string;
  body: string;
  image?: string;
  tint?: boolean;
}

export const PLATFORM: PlatformFeature[] = [
  {
    title: 'Recorded lessons, kept',
    body: 'Every class is recorded and stays available for the length of the course. Filter by chapter or topic and pick up where you stopped.',
    image: photo('student-watching-recorded-lesson', 1200, 800),
  },
  {
    title: 'Corrections you can read',
    body: 'Scripts come back with the incorrect words marked and notes in the margin, attached to the submission you sent.',
    tint: true,
  },
  {
    title: 'Course notes and past papers',
    body: 'Notes, study material and important files, sorted by category and downloadable.',
  },
  {
    title: 'Progress and performance, apart',
    body: 'How much of the course you have finished is one number. What you are scoring is another. The platform never blends them.',
  },
  {
    title: 'Your timetable',
    body: 'Upcoming sessions, what you attended, and what is due next, on one screen.',
    image: photo('wall-calendar-study-timetable', 800, 800),
  },
];

export interface Testimonial {
  quote: string;
  name: string;
  detail: string;
}

/**
 * PLACEHOLDER testimonials. Names and results are invented and must be
 * replaced with real, consented student quotes before this page goes live.
 */
export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      'The marked scripts were the thing. I could see exactly which sentence lost the mark instead of guessing from a number.',
    name: 'Farida Abdelrahman',
    detail: 'IGCSE English, Cairo',
  },
  {
    quote:
      'I went from a 6 to a 7.5 in writing. The timed tasks every week are what did it.',
    name: 'Youssef Kamal',
    detail: 'IELTS Academic',
  },
  {
    quote:
      'Missing a class stopped being a disaster. The recording was up the same evening with the notes attached.',
    name: 'Habiba Nasr',
    detail: 'IGCSE English, Alexandria',
  },
];

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: 'Are classes live or recorded?',
    a: 'Both, depending on the course. Live courses run to a timetable and you join through a meeting link posted in your dashboard. Recorded courses are yours to work through at your own pace. Some courses combine the two.',
  },
  {
    q: 'What happens if I miss a live class?',
    a: 'The recording is posted to the course and stays there. Your attendance record will show the session as missed, which is visible to you and to your parent if a parent account is linked.',
  },
  {
    q: 'How is homework returned?',
    a: 'Dr. Tahir marks submissions inside the platform. You get the annotated version attached to your original submission, along with a mark and written feedback. Your original is never overwritten.',
  },
  {
    q: 'Can my parents see how I am doing?',
    a: 'A parent account can be linked to a student and gives read-only access to progress, grades and attendance. Parents cannot submit work or message classmates.',
  },
  {
    q: 'What do I need to join a class?',
    a: 'A browser and a stable connection. Live sessions open in Google Meet or Zoom through the link on your dashboard, so there is nothing extra to install.',
  },
  {
    q: 'How do I pay?',
    a: 'Enrollment is arranged directly at the moment. Get in touch through the contact page and we will confirm the course, the timetable and the fee before your first class.',
  },
];
