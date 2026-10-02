/**
 * Typed copy of the privacy policy and terms of use (REM-015).
 *
 * The Markdown in `docs/legal/` (`privacy-policy.md`, `terms-of-use.md`) is the
 * source text. Change both together - this is a hand transcription, not a
 * Markdown parser, so a change to the source does not propagate on its own.
 *
 * `[[…]]` placeholders are copied VERBATIM from the source. They are filled in
 * by the client before publishing (see `docs/legal/README.md`) - do not invent
 * values for them here.
 */

export type Inline = string | { strong: string } | { text: string; href: string };

export type Block =
  | { kind: 'h2' | 'h3'; text: string }
  | { kind: 'p'; content: Inline[] }
  | { kind: 'ul'; items: Inline[][] }
  | { kind: 'table'; head: string[]; rows: Inline[][][] };

export interface LegalDocument {
  title: string;
  updated: string;
  blocks: Block[];
}

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy policy',
  updated: '[[EFFECTIVE DATE]]',
  blocks: [
    { kind: 'h2', text: 'The short version' },
    {
      kind: 'ul',
      items: [
        [
          'We collect what we need to teach you: your name, your email, your work, your marks, your attendance, and which lessons you have watched.',
        ],
        [
          'Your teacher and the teaching assistants responsible for your group can see your work and your marks. Other students can see only your name, and only if they are in the same group.',
        ],
        [
          'We do not sell your data, we do not show advertising, and we do not use tracking or analytics tools.',
        ],
        [
          "Many of our students are under 18. A parent or guardian can contact us about a student's data and exercise the student's rights on their behalf.",
        ],
        [
          'You can ask to see, correct, download or delete your data at any time by emailing [[PRIVACY CONTACT EMAIL]].',
        ],
      ],
    },
    { kind: 'p', content: ['The rest of this policy explains each of these in detail.'] },

    { kind: 'h2', text: '1. Who we are' },
    {
      kind: 'p',
      content: [
        'This website and learning platform (the "Platform") is operated by ',
        { strong: '[[LEGAL NAME OF THE OPERATOR]]' },
        ', [[REGISTERED ADDRESS]], Egypt ("we", "us", "our"). We decide how and why your personal data is used, which makes us the ',
        { strong: 'data controller' },
        " under Egypt's Personal Data Protection Law No. 151 of 2020 and, where it applies to you, the EU and UK General Data Protection Regulation (GDPR).",
      ],
    },
    {
      kind: 'p',
      content: [
        { strong: 'Contact for anything in this policy:' },
        ' [[PRIVACY CONTACT EMAIL]] · [[POSTAL ADDRESS]] [[If a Data Protection Officer is appointed: name and contact.]]',
      ],
    },

    { kind: 'h2', text: '2. Who this policy covers' },
    {
      kind: 'ul',
      items: [
        [{ strong: 'Visitors' }, ' to our public website (home, courses, blog, contact pages).'],
        [
          { strong: 'Students' },
          ' with an account on the Platform, and their ',
          { strong: 'parents or guardians' },
          '.',
        ],
        [
          { strong: 'Teaching staff' },
          ' — the teacher, administrators and teaching assistants who use the Platform.',
        ],
      ],
    },

    { kind: 'h2', text: '3. What we collect, and where it comes from' },

    { kind: 'h3', text: '3.1 Information you give us' },
    {
      kind: 'table',
      head: ['Information', 'When', 'Required?'],
      rows: [
        [['Name, email address, password'], ['When you create an account'], ['Yes']],
        [['Phone number, profile photo'], ['If you add them to your profile'], ['No']],
        [
          [
            'Homework and assignment submissions: uploaded files (PDF and Word documents), links, and typed answers',
          ],
          ['When you hand in work'],
          ['Only to hand in work'],
        ],
        [['Messages you send us by email or WhatsApp'], ['When you contact us'], ['No']],
      ],
    },
    {
      kind: 'p',
      content: [
        'We store your password only in a scrambled, one-way form (a "hash"). Nobody at the Platform can read it.',
      ],
    },

    { kind: 'h3', text: '3.2 Information created while you learn' },
    {
      kind: 'ul',
      items: [
        [
          { strong: 'Marks and feedback' },
          ': scores, written feedback, and annotations your teacher draws on your submitted work, together with the history of any changes.',
        ],
        [{ strong: 'Attendance' }, ' for live sessions (present, late, absent).'],
        [{ strong: 'Lesson progress' }, ': which recorded lessons you have opened and completed.'],
        [{ strong: 'Group and course membership' }, ': which course and group you belong to.'],
        [
          { strong: 'Notifications' },
          ' we show you, whether you have read them, and your notification preferences.',
        ],
        [
          { strong: 'Weekly progress reports' },
          ', when this feature is available: a summary of your attendance, homework completion and marks for the week, prepared automatically, checked by your teacher and then shown to you in the Platform. Reports are not emailed.',
        ],
      ],
    },

    { kind: 'h3', text: '3.3 Information provided by your teaching staff' },
    {
      kind: 'ul',
      items: [
        [
          "The name of your school and a parent or guardian's email address, which staff may record so that they can contact your family about your studies.",
        ],
        [
          'Private teaching notes about your learning, visible only to staff. You can ask to see them (§8).',
        ],
      ],
    },

    { kind: 'h3', text: '3.4 Homework set as a Google Form' },
    {
      kind: 'p',
      content: [
        'Some homework may be set as a Google Form. When you fill one in, ',
        { strong: 'Google' },
        " collects your answers under Google's own privacy policy. After the deadline, your teacher downloads the responses from Google as a spreadsheet and imports them into the Platform. We then store ",
        { strong: 'the email address you used on the form, your answers, your score and the time you submitted' },
        ', and link them to your account to show you and your teacher your results.',
      ],
    },
    {
      kind: 'p',
      content: [
        'If the email you used on the form differs from your account email, staff may match the response to you by hand, and may record that alternative address on your account so future responses match automatically.',
      ],
    },

    { kind: 'h3', text: '3.5 Signing in with Google (optional)' },
    {
      kind: 'p',
      content: [
        'If you choose to link a Google account for sign-in, we receive and store your Google account identifier and the email address on that Google account. We never receive your Google password. You can unlink Google at any time from your account settings.',
      ],
    },

    { kind: 'h3', text: '3.6 Technical information' },
    {
      kind: 'ul',
      items: [
        [
          { strong: 'IP address and request details' },
          ': processed briefly by our servers and our security provider (Cloudflare) to deliver pages and to protect accounts from repeated sign-in attempts. Our application does not store your IP address in its database; our web server keeps standard access logs for up to [[14]] days for security and troubleshooting.',
        ],
        [
          { strong: 'Browser storage' },
          ": while you are signed in, a sign-in token is kept in your browser's session storage and is deleted when you close the tab. We also remember your light/dark theme and how you prefer lessons to be listed, on your device only. ",
          { strong: 'We do not set advertising or analytics cookies.' },
          ' Cloudflare may set a strictly necessary security cookie to tell people and automated traffic apart.',
        ],
      ],
    },

    { kind: 'h3', text: '3.7 Staff activity' },
    {
      kind: 'p',
      content: [
        'For accountability, the Platform keeps a record of actions taken by teaching staff, such as who entered or changed a mark and when. These records may refer to the student the action concerned.',
      ],
    },

    { kind: 'h2', text: '4. Why we use your data, and our legal basis' },
    {
      kind: 'table',
      head: ['Purpose', 'Legal basis'],
      rows: [
        [
          ['Creating and running your account; delivering lessons, homework, marking and attendance'],
          [
            'Performing our agreement with you (or with your parent or guardian, where they arranged your enrolment)',
          ],
        ],
        [
          [
            'Showing you and your teacher your results and progress, including weekly reports and per-question results for Google Form homework',
          ],
          ['Performing our agreement with you'],
        ],
        [
          ["Contacting a parent or guardian about a student's studies"],
          ["Our legitimate interest in keeping families informed about a child's education"],
        ],
        [
          ['Sending service emails: account setup, password resets, announcements from your teacher'],
          ['Performing our agreement with you'],
        ],
        [
          ['Keeping the Platform secure, preventing abuse, and keeping a record of staff actions'],
          ['Our legitimate interest in a secure, accountable service'],
        ],
        [['Answering your questions'], ['Your request; our legitimate interest']],
        [['Keeping records the law requires'], ['Legal obligation']],
      ],
    },
    {
      kind: 'p',
      content: [
        'We do ',
        { strong: 'not' },
        ' use your data for advertising, we do ',
        { strong: 'not' },
        ' sell it, and we do ',
        { strong: 'not' },
        ' make decisions about you by automated means alone. Marks are awarded by your teacher, and scores imported from Google Forms reflect the marking set up by your teacher on that form.',
      ],
    },

    { kind: 'h2', text: '5. Children' },
    {
      kind: 'p',
      content: [
        'Many of our students are under 18. We collect no more about a younger student than about any other student, and nothing in §3 is used for advertising or profiling.',
      ],
    },
    {
      kind: 'ul',
      items: [
        [
          'A ',
          { strong: 'parent or legal guardian' },
          " may contact us at [[PRIVACY CONTACT EMAIL]] about a student's data and may exercise the rights in §8 on the student's behalf. Tell us which student you are writing about; we may need to confirm that you are their parent or guardian.",
        ],
        [
          'If a parent or guardian asks us to stop processing a student\'s data or to delete the account, we will do so, subject to §7 and to anything the law requires us to keep.',
        ],
      ],
    },

    { kind: 'h2', text: '6. Who can see your data' },
    { kind: 'p', content: [{ strong: 'Inside the Platform' }] },
    {
      kind: 'ul',
      items: [
        [{ strong: 'You' }, ' can see your own profile, work, marks, feedback, attendance and progress.'],
        [{ strong: 'Your teacher and administrators' }, ' can see the data of all students.'],
        [
          { strong: 'Teaching assistants' },
          ' can see the data of students in the groups they are assigned to (or of all students, where the teacher has given an assistant access to every group).',
        ],
        [
          { strong: 'Other students' },
          ' can see only your ',
          { strong: 'name' },
          ', and only if they share a group with you. They never see your email, your work or your marks.',
        ],
      ],
    },
    {
      kind: 'p',
      content: [
        { strong: 'Service providers who process data for us.' },
        ' Each works under our instructions and only for the purposes in §4.',
      ],
    },
    {
      kind: 'table',
      head: ['Provider', 'What they do', 'Data involved'],
      rows: [
        [
          ['Hostinger'],
          ['Hosts the servers that run the Platform and its database'],
          ['All Platform data'],
        ],
        [
          ['Cloudflare'],
          [
            'Delivers and protects the website (network, security, caching) and stores uploaded files',
          ],
          ['Request data, IP address; your uploaded files'],
        ],
        [
          ['[[EMAIL PROVIDER]]'],
          ['Sends service emails'],
          ['Your name, email address and the email content'],
        ],
      ],
    },
    {
      kind: 'p',
      content: [
        { strong: 'Services with their own privacy policies.' },
        ' When you use these, the provider acts on its own account, not ours:',
      ],
    },
    {
      kind: 'ul',
      items: [
        [{ strong: 'Google' }, ': Google Forms homework and optional Google sign-in.'],
        [
          { strong: 'YouTube / Vimeo' },
          ': some recorded lessons are hosted there and play inside our page. When you play one, that service may collect data and set cookies under its own policy.',
        ],
        [{ strong: 'WhatsApp (Meta)' }, ': if you choose to message us on WhatsApp.'],
      ],
    },
    {
      kind: 'p',
      content: [
        'We may also disclose data if the law requires it, or to protect the safety of our students or staff.',
      ],
    },

    { kind: 'h2', text: '7. How long we keep your data' },
    {
      kind: 'table',
      head: ['Data', 'Kept for'],
      rows: [
        [
          ['Account and profile'],
          [
            'While your account is active, then [[12 months]] after your last course ends, unless you ask us to delete it sooner',
          ],
        ],
        [
          ['Submissions, marks, feedback, attendance, lesson progress, reports'],
          ['For the course and [[1 academic year]] after it ends, so that results can be reviewed or queried'],
        ],
        [['Imported Google Form responses'], ['As for submissions and marks']],
        [['Staff activity records'], ['[[2 years]]']],
        [['Record of emails sent (recipient and type of email, not the content)'], ['[[12 months]]']],
        [['Password-reset and invitation links'], ['Until used or expired (hours to days)']],
        [['Web server access logs'], ['[[14 days]]']],
        [['Backups'], ['Overwritten on a rolling [[30-day]] cycle']],
      ],
    },
    { kind: 'p', content: ['When a period ends we delete the data or make it anonymous.'] },

    { kind: 'h2', text: '8. Your rights' },
    { kind: 'p', content: ['You have the right to:'] },
    {
      kind: 'ul',
      items: [
        [{ strong: 'be told' }, ' how your data is used (this policy);'],
        [{ strong: 'access' }, ' your data and receive a copy, including staff notes about you;'],
        [{ strong: 'correct' }, ' data that is wrong or incomplete;'],
        [{ strong: 'delete' }, ' your data, unless we must keep something by law or to settle a dispute;'],
        [
          { strong: 'withdraw consent' },
          ' at any time, where we rely on it (for example, linking a Google account for sign-in); this does not affect anything done before you withdrew it;',
        ],
        [{ strong: 'object' }, ' to processing based on our legitimate interests;'],
        [{ strong: 'receive your data in a portable format' }, ', where GDPR applies to you;'],
        [
          { strong: 'complain' },
          " to Egypt's Personal Data Protection Center, or to your local data-protection authority if you live in the EU or UK.",
        ],
      ],
    },
    {
      kind: 'p',
      content: [
        'To use any of these rights, email ',
        { strong: '[[PRIVACY CONTACT EMAIL]]' },
        ' from the address on your account (or, for a parent or guardian, tell us which student you are writing about). We will reply within ',
        { strong: '[[30 days]]' },
        '. We may need to confirm your identity first. There is no charge.',
      ],
    },

    { kind: 'h2', text: '9. How we protect your data' },
    {
      kind: 'ul',
      items: [
        ['All traffic to the Platform is encrypted (HTTPS).'],
        ['Passwords are stored only as one-way hashes; sign-in sessions expire automatically.'],
        ['Access inside the Platform is limited by role and, for teaching assistants, by assigned group.'],
        ['Uploaded files can only be opened through short-lived links issued to people allowed to see them.'],
        ['Staff actions are recorded.'],
        ['The database is backed up regularly, and backups are kept separately with restricted access.'],
      ],
    },
    {
      kind: 'p',
      content: [
        'No system is perfectly secure. If a personal-data breach is likely to put you at risk, we will tell you and the relevant authority as the law requires.',
      ],
    },

    { kind: 'h2', text: '10. International transfers' },
    {
      kind: 'p',
      content: [
        'Our service providers may store or process data outside Egypt, including in [[HOSTING REGION]] and wherever Cloudflare and our email provider operate. We use providers that offer appropriate safeguards and we transfer only what each needs for its task, in line with Egypt\'s Personal Data Protection Law and, where it applies, the GDPR.',
      ],
    },

    { kind: 'h2', text: '11. Changes to this policy' },
    {
      kind: 'p',
      content: [
        'If we change this policy we will update the date at the top. If a change materially affects how we use your data, we will tell you by email or by a notice in the Platform before it takes effect.',
      ],
    },

    { kind: 'h2', text: '12. Contact' },
    {
      kind: 'p',
      content: [
        { strong: '[[LEGAL NAME OF THE OPERATOR]]' },
        ' · [[POSTAL ADDRESS]] · ',
        { strong: '[[PRIVACY CONTACT EMAIL]]' },
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDocument = {
  title: 'Terms of use',
  updated: '[[EFFECTIVE DATE]]',
  blocks: [
    { kind: 'h2', text: 'The short version' },
    {
      kind: 'ul',
      items: [
        ['Use the Platform to learn, and let others do the same. Keep your password to yourself.'],
        [
          'The work you hand in stays yours. You let us store it, mark it and show it to your teaching staff.',
        ],
        [
          "Lessons, recordings and materials belong to us or to the people who made them. Don't share them outside the Platform.",
        ],
        ['We work hard to help you do well, but we cannot promise any exam result.'],
        ['If you break these terms we may suspend or close your account.'],
      ],
    },

    { kind: 'h2', text: '1. Who we are and what these terms cover' },
    {
      kind: 'p',
      content: [
        'This website and learning platform (the "Platform") is operated by ',
        { strong: '[[LEGAL NAME OF THE OPERATOR]]' },
        ', [[REGISTERED ADDRESS]], Egypt ("we", "us", "our"). These terms apply to everyone who visits the public website or uses an account on the Platform: students, and the teacher, administrators and teaching assistants who teach on it.',
      ],
    },
    {
      kind: 'p',
      content: [
        'By creating an account or using the Platform you agree to these terms. If you are under 18, please read them with a parent or guardian; by letting you use the Platform they also agree to them on your behalf. Our ',
        { text: 'Privacy policy', href: '/privacy' },
        ' explains how we handle personal data and forms part of these terms.',
      ],
    },

    { kind: 'h2', text: '2. Accounts and security' },
    {
      kind: 'ul',
      items: [
        ['An account is for ', { strong: 'one person' }, ". Do not share it, and do not use anyone else's."],
        [
          'Give accurate information when you register, and keep your email address up to date: it is how you reset your password and receive messages from your teacher.',
        ],
        [
          'Keep your password secret and choose one you do not use elsewhere. If you think someone else has used your account, change your password and tell us straight away.',
        ],
        [
          'A new student account may need to be accepted by staff before you can use it, and you can only see the courses and groups you have been enrolled in.',
        ],
        [
          'Staff accounts are created by the teacher or an administrator. Staff may see only what their role and assigned groups allow, and must use student data only to teach.',
        ],
      ],
    },

    { kind: 'h2', text: '3. Acceptable use' },
    { kind: 'p', content: ['When using the Platform you must not:'] },
    {
      kind: 'ul',
      items: [
        [
          'hand in work that is not your own, or help someone else to do so, unless your teacher has said the task may be done together;',
        ],
        [
          'upload anything unlawful, offensive, or that you have no right to share, or any file designed to harm a computer or a person;',
        ],
        [
          "try to see another student's work or marks, or any part of the Platform you have not been given access to;",
        ],
        [
          'test, probe, overload or disrupt the Platform, or use automated tools to access it, except where we have agreed in writing;',
        ],
        ['copy, record, download or pass on lessons, recordings or materials, except as §5 allows;'],
        ['harass, threaten or impersonate anyone, including in anything you type or upload.'],
      ],
    },

    { kind: 'h2', text: '4. Your work' },
    {
      kind: 'ul',
      items: [
        ['The homework, answers and files you hand in ', { strong: 'remain yours' }, '.'],
        [
          'You give us a licence, for as long as we keep your work under our ',
          { text: 'Privacy policy', href: '/privacy' },
          ', to store it, to let your teacher and the teaching assistants responsible for your group read, mark, annotate and comment on it, and to show you the results. We do not publish your work or share it with other students.',
        ],
        [
          'Uploads must be in a format the Platform accepts (currently PDF and Word documents) and within the size limit shown when you upload.',
        ],
        [
          'Keep your own copy of anything important. Once a deadline has passed, a submission may no longer be changed.',
        ],
      ],
    },

    { kind: 'h2', text: '5. Our content' },
    {
      kind: 'ul',
      items: [
        [
          'Lessons, recordings, worksheets, tasks, feedback templates and everything else we provide are owned by us or by the people who licensed them to us, and are protected by copyright.',
        ],
        [
          'You may use them for ',
          { strong: 'your own study' },
          ' while you are enrolled. You may not sell, publish, upload elsewhere or share them with people who are not enrolled.',
        ],
        [
          'Some recorded lessons are links to videos hosted by other services (for example YouTube or Vimeo). Those services have their own terms, and we are not responsible for their availability.',
        ],
        ["Some homework is set as a Google Form. Google's own terms apply when you fill one in."],
      ],
    },

    { kind: 'h2', text: '6. No guarantee of results' },
    {
      kind: 'p',
      content: [
        'We teach to help you prepare for IGCSE, IELTS and similar examinations. Your results depend on many things outside our control, including your own work and the examining bodies. ',
        { strong: 'We do not guarantee any grade, band score or exam outcome.' },
        ' Marks and feedback on the Platform are our assessment of your work, not an official result.',
      ],
    },

    { kind: 'h2', text: '7. Fees and refunds' },
    {
      kind: 'p',
      content: [
        '[[Describe how fees are set and paid, what happens if a payment is late, and the refund policy — for example, which part of a course fee is refundable and until when. The Platform itself does not take payments.]]',
      ],
    },

    { kind: 'h2', text: '8. Availability and changes to the Platform' },
    {
      kind: 'p',
      content: [
        'We aim to keep the Platform available but it may sometimes be unavailable for maintenance, updates or reasons outside our control. We may change, add or remove features. If a change removes something you rely on for a course you are enrolled in, we will tell you in advance where we reasonably can.',
      ],
    },

    { kind: 'h2', text: '9. Suspension and closing an account' },
    {
      kind: 'ul',
      items: [
        [
          'You may stop using the Platform at any time and ask us to close your account (see the ',
          { text: 'Privacy policy', href: '/privacy' },
          ' for what happens to your data).',
        ],
        [
          'We may suspend or close an account if these terms are broken, if we need to protect other users or the Platform, or if the law requires it. Where it is reasonable to do so, we will tell you why first and give you a chance to respond.',
        ],
        [
          'When an account is closed, access to lessons and materials ends. We keep data only as our Privacy policy describes.',
        ],
      ],
    },

    { kind: 'h2', text: '10. Our responsibility to you' },
    {
      kind: 'ul',
      items: [
        [
          'Nothing in these terms limits any right you have under Egyptian consumer-protection law that cannot be limited by agreement, or our liability for death or personal injury caused by our negligence, or for fraud.',
        ],
        [
          'Otherwise, we are not responsible for loss that was not reasonably foreseeable, for loss caused by your breach of these terms, for problems with your own device or internet connection, or for services run by others (such as Google, YouTube, Vimeo or WhatsApp).',
        ],
        [
          'Subject to the above, our total liability to you in connection with the Platform is limited to the fees you paid us for the course concerned in the [[12]] months before the claim arose.',
        ],
      ],
    },

    { kind: 'h2', text: '11. Law and disputes' },
    {
      kind: 'p',
      content: [
        'These terms are governed by the laws of the ',
        { strong: 'Arab Republic of Egypt' },
        '. If you have a complaint, please contact us first at [[CONTACT EMAIL]] and we will try to resolve it. If we cannot, the courts of [[CITY, e.g. Cairo]] have jurisdiction.',
      ],
    },

    { kind: 'h2', text: '12. Changes to these terms' },
    {
      kind: 'p',
      content: [
        'We may update these terms. We will change the date at the top and, if a change materially affects you, tell you by email or by a notice in the Platform before it takes effect. If you keep using the Platform after that, the new terms apply.',
      ],
    },

    { kind: 'h2', text: '13. Contact' },
    {
      kind: 'p',
      content: [
        { strong: '[[LEGAL NAME OF THE OPERATOR]]' },
        ' · [[POSTAL ADDRESS]] · ',
        { strong: '[[CONTACT EMAIL]]' },
      ],
    },
  ],
};
