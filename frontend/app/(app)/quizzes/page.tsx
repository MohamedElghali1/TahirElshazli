import { redirect } from 'next/navigation';

/** Quizzes now live in the Stream (`/homework`); the old route just forwards. */
export default function QuizzesPage() {
  redirect('/homework');
}
