import Link from 'next/link';
import { StatusPage } from '@/components/status-page';

/** The app-level 404 (REM-018), on the entry pages' design. */
export default function NotFound() {
  return (
    <StatusPage code="404" lead="Page not" word="found" message="That page does not exist, or it has moved.">
      <Link className="btn btn-p" href="/">
        Go home
      </Link>
      <Link className="btn btn-o" href="/login">
        Sign in
      </Link>
    </StatusPage>
  );
}
