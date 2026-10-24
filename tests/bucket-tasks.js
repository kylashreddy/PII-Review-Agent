// Six test tasks for the L2 issue buckets (left = raw document, right = redacted work).
// All names, numbers and addresses are made up.
//
// Used by:
//   - test.html?set=buckets   (shows each task with its expected result)
//   - tests/buckets.test.js   (checks the expected result automatically)
//
// Each task: { id, bucket, title, left: [lines], right: [lines], expected: [{category, text?, count?}], notes }
(function (g) {
  'use strict';

  // ---------------------------------------------------------------- task 2 data (log export)
  const users = ['ravi_k92', 'meena_s', 'arjun.p', 'kavya_r', 'deepak77'];
  const fakeUsers = ['user_a01', 'user_b02', 'user_c03', 'user_d04', 'user_e05'];
  const ips = ['10.24.8.17', '10.24.8.33', '10.24.9.2', '10.24.9.81', '10.24.10.5'];
  const fakeIps = ['10.0.0.11', '10.0.0.12', '10.0.0.13', '10.0.0.14', '10.0.0.15'];
  const logLines = (u, ip) => Array.from({ length: 24 }, (_, i) => {
    const k = i % 5;
    const ts = `2024-03-15T10:${String(10 + i).padStart(2, '0')}:0${i % 10}Z`;
    return i % 3 === 0
      ? `{"ts":"${ts}","lvl":"INFO","evt":"auth.login","user":"${u[k]}","ip":"${ip[k]}","sid":"9f8a${i}c6b5d4e3f2a1b0c","ok":true}`
      : `${ts} WARN svc=payments rid=7Hq${i}xP2kL9 user=${u[k]} ip=${ip[k]} latency_ms=${120 + i * 7} retry=${i % 2} code=E${4000 + i}`;
  });

  const TASKS = [
    {
      id: 1,
      bucket: 'PI leakage',
      title: 'Support ticket — PII left visible on the right',
      left: [
        'Support Ticket 48213',
        'Customer Name: Priya Sharma',
        'Mobile: +91 99001 23456',
        'Email: priya.sharma@gmail.com',
        'Account No: 60200345678901',
        'Issue: Mrs. Priya Sharma reported that her debit card was blocked after three wrong attempts.',
        'Agent note: Called the customer on +91 99001 23456 and sent the unblock form to priya.sharma@gmail.com.',
      ],
      right: [
        'Support Ticket 48213',
        'Customer Name: Priya Nair',
        'Mobile: +91 99001 23456',
        'Email: anita.nair@gmail.com',
        'Account No: 70300456789012',
        'Issue: Mrs. Priya Nair reported that her debit card was blocked after three wrong attempts.',
        'Agent note: Called the customer on +91 99001 23456 and sent the unblock form to priya.sharma@gmail.com.',
      ],
      expected: [
        { category: 'LEAKAGE', text: 'Priya Sharma', count: 2, why: 'only the surname was replaced — "Priya" is still visible' },
        { category: 'LEAKAGE', text: '+91 99001 23456', count: 2, why: 'mobile number not redacted (both places)' },
        { category: 'LEAKAGE', text: 'priya.sharma@gmail.com', count: 1, why: 'email redacted on line 4 but leaked in the agent note' },
        { category: 'REDACTED_OK', text: 'priya.sharma@gmail.com', count: 1, why: 'email on line 4 replaced correctly' },
        { category: 'REDACTED_OK', text: '60200345678901', count: 1, why: 'account number replaced correctly' },
      ],
      decide: 'Redact (PII) on every leakage item → "Missed redaction".',
    },
    {
      id: 2,
      bucket: 'Unstructured',
      title: 'Application log export — not a normal document',
      left: logLines(users, ips),
      right: logLines(fakeUsers, fakeIps),
      expected: [
        { category: 'TASK', text: 'Unstructured text', count: 1, why: 'log / JSON dump with timestamps, ids and symbols' },
        { category: 'REDACTED_OK', why: 'usernames and IPs replaced consistently' },
      ],
      decide: 'Flag the whole task as unstructured.',
    },
    {
      id: 3,
      bucket: 'Other language',
      title: 'Hinglish chat — sampling imperfection',
      left: [
        'Customer: Hello, mera naam Rohit Verma hai aur mera order abhi tak nahi aaya hai.',
        'Agent: Sorry sir, aap apna registered mobile number bata dijiye.',
        'Customer: Mera number 98860 45123 hai, aur email rohit.verma@gmail.com hai.',
        'Agent: Dhanyavaad. Aapka order kal tak deliver ho jayega, main abhi check karke batata hoon.',
        'Customer: Theek hai, par please jaldi kijiye kyunki mujhe yeh gift ke liye chahiye tha.',
        'Agent: Bilkul sir, aapko SMS par tracking link bhi mil jayega. Aur kuch madad chahiye toh batayiye.',
        'Customer: Nahi, bas itna hi. Shukriya.',
      ],
      right: [
        'Customer: Hello, mera naam Amit Joshi hai aur mera order abhi tak nahi aaya hai.',
        'Agent: Sorry sir, aap apna registered mobile number bata dijiye.',
        'Customer: Mera number 99012 33445 hai, aur email amit.joshi@gmail.com hai.',
        'Agent: Dhanyavaad. Aapka order kal tak deliver ho jayega, main abhi check karke batata hoon.',
        'Customer: Theek hai, par please jaldi kijiye kyunki mujhe yeh gift ke liye chahiye tha.',
        'Agent: Bilkul sir, aapko SMS par tracking link bhi mil jayega. Aur kuch madad chahiye toh batayiye.',
        'Customer: Nahi, bas itna hi. Shukriya.',
      ],
      expected: [
        { category: 'TASK', text: 'Language: Hinglish', count: 1, why: 'romanised Hindi — out of scope (sampling imperfection)' },
        { category: 'REDACTED_OK', text: 'Rohit Verma', count: 1, why: 'name replaced' },
        { category: 'REDACTED_OK', text: '98860 45123', count: 1, why: 'phone replaced' },
        { category: 'REDACTED_OK', text: 'rohit.verma@gmail.com', count: 1, why: 'email replaced' },
      ],
      decide: 'Flag the whole task as other language.',
    },
    {
      id: 4,
      bucket: 'Unknown text between left & right',
      title: 'Bank letter — words added, removed and changed',
      left: [
        'Dear Mr. Karthik Rao,',
        'Thank you for visiting our Jayanagar branch on Monday.',
        'Your loan application is under review and we will update you within five working days.',
        'For any questions, please call 080-4123-5678.',
        'Regards,',
        'Loan Desk',
      ],
      right: [
        'Dear Mr. Suresh Iyer,',
        'Thank you for visiting our branch on Monday.',
        'Your loan application is approved and we will update you within five working days.',
        'For any questions, please call 080-4987-6543.',
        'Please also bring your original documents.',
        'Regards,',
        'Loan Desk',
      ],
      expected: [
        { category: 'UNKNOWN_TEXT', text: 'Jayanagar', count: 1, why: 'original word missing on the right' },
        { category: 'OVER_REDACTED', text: 'under review', count: 1, why: 'non-PII words changed ("under review" → "approved")' },
        { category: 'UNKNOWN_TEXT', text: 'Please also bring your original documents', count: 1, why: 'sentence added on the right' },
        { category: 'REDACTED_OK', text: 'Karthik Rao', count: 1, why: 'name replaced' },
        { category: 'REDACTED_OK', text: '080-4123-5678', count: 1, why: 'phone replaced' },
      ],
      decide: '"under review" → Keep (not PII) → "Over-redaction".',
    },
    {
      id: 5,
      bucket: 'Incoherent',
      title: 'Meeting notes — same people replaced in different ways',
      left: [
        'Meeting notes: Project kickoff',
        'Prepared by: Ram Prasad',
        'Reviewed by: Shyam Verma',
        'Approved by: Neha Kapoor',
        'Mr. Ram Prasad will share the budget and Mr. Shyam Verma will review the vendors.',
        'Ms. Neha Kapoor asked Mr. Ram Prasad to send the final plan by Friday.',
        'Contact Person: Ram Prasad',
      ],
      right: [
        'Meeting notes: Project kickoff',
        'Prepared by: Raj Mehta',
        'Reviewed by: Sunil Rao',
        'Approved by: Pooja Iyer',
        'Mr. Sam Mehta will share the budget and Mr. Sunil Rao will review the vendors.',
        'Ms. Pooja Iyer asked Mr. Raj Mehta to send the final plan by Friday.',
        'Contact Person: Sunil Rao',
      ],
      expected: [
        { category: 'INCOHERENT', text: 'Ram Prasad', count: 2, why: 'Ram Prasad → Raj Mehta (2×) but → Sam Mehta once and → Sunil Rao once' },
        { category: 'REDACTED_OK', text: 'Shyam Verma', count: 2, why: 'Shyam Verma → Sunil Rao everywhere' },
        { category: 'REDACTED_OK', text: 'Neha Kapoor', count: 2, why: 'Neha Kapoor → Pooja Iyer everywhere' },
      ],
      notes: '"Contact Person: Sunil Rao" also gives Ram Prasad the replacement already used for Shyam Verma.',
      decide: 'Redact (PII) → "Correct to redact, but the replacement must be fixed".',
    },
    {
      id: 6,
      bucket: 'Same data type / sensible replacement',
      title: 'KYC form — replacements of the wrong kind',
      left: [
        'KYC Verification Form',
        'Full Name: Arjun Mehta',
        'GSTIN: 27AAPFU0939F1ZV',
        'Mobile: +91 97400 11223',
        'Email: arjun.mehta@gmail.com',
        'PAN: ABCPM1234K',
        'Last login IP: 192.168.4.20',
        'Employer: Infosys',
        'Account No: 50100987654321',
      ],
      right: [
        'KYC Verification Form',
        'Full Name: Vivek Menon',
        'GSTIN: next Tuesday',
        'Mobile: Vivek Menon',
        'Email: [EMAIL]',
        'PAN: XXXXXXXXXX',
        'Last login IP: 999.300.1.1',
        'Employer: Infosys',
        'Account No: N/A',
      ],
      expected: [
        { category: 'REDACTED_OK', text: 'Arjun Mehta', count: 1, why: 'name replaced with a name' },
        { category: 'DATATYPE', text: '27AAPFU0939F1ZV', count: 1, why: 'GSTIN replaced with "next Tuesday"' },
        { category: 'DATATYPE', text: '+91 97400 11223', count: 1, why: 'mobile number replaced with a name' },
        { category: 'NOT_SENSIBLE', text: 'arjun.mehta@gmail.com', count: 1, why: 'email replaced with a placeholder' },
        { category: 'NOT_SENSIBLE', text: 'ABCPM1234K', count: 1, why: 'PAN card number masked with XXXXXXXXXX' },
        { category: 'DATATYPE', text: '192.168.4.20', count: 1, why: '999.300.1.1 is not a valid IP address' },
        { category: 'NOT_SENSIBLE', text: '50100987654321', count: 1, why: 'account number replaced with N/A' },
      ],
      notes: 'Infosys is a top MNC, so keeping it unchanged is correct (no finding).',
      decide: 'Redact (PII) → "Correct to redact, but the replacement must be fixed".',
    },
    {
      id: 7,
      bucket: 'Other language (mixed)',
      title: 'Mostly English letter with Hindi and Tamil lines',
      left: [
        'Dear Mr. Karthik Rao,',
        'Thank you for contacting our support team about your recent order.',
        'आपका ऑर्डर कल तक पहुँच जाएगा, कृपया घर पर रहें।',
        'We have scheduled the delivery for tomorrow morning.',
        'உங்கள் ஆர்டர் நாளை வந்துவிடும், தயவுசெய்து வீட்டில் இருங்கள்.',
        'For any questions, please call 080-4123-5678.',
        'Regards,',
        'Support Team',
      ],
      right: [
        'Dear Mr. Suresh Iyer,',
        'Thank you for contacting our support team about your recent order.',
        'आपका ऑर्डर कल तक पहुँच जाएगा, कृपया घर पर रहें।',
        'We have scheduled the delivery for tomorrow morning.',
        'உங்கள் ஆர்டர் நாளை வந்துவிடும், தயவுசெய்து வீட்டில் இருங்கள்.',
        'For any questions, please call 080-4987-6543.',
        'Regards,',
        'Support Team',
      ],
      expected: [
        { category: 'TASK', count: 1, why: 'Hindi (line 3) and Tamil (line 5) inside an English letter — sampling imperfection' },
        { category: 'REDACTED_OK', text: 'Karthik Rao', count: 1, why: 'name replaced' },
        { category: 'REDACTED_OK', text: '080-4123-5678', count: 1, why: 'phone replaced' },
      ],
      notes: 'The Task check card at the top of the panel shows the languages, their share, lines 3 and 5, and a Copy reason button.',
      decide: 'Flag the whole task as other language and paste the copied reason.',
    },
    {
      id: 8,
      bucket: 'Over-scrubbing (business names list)',
      title: 'Candidate profile — well-known names redacted by mistake',
      left: [
        'Candidate profile',
        'Name: Neha Kapoor',
        'Previous employer: Infosys',
        'Education: IIT Bombay',
        'Salary account with HDFC Bank, Pune branch.',
        'Favourite snack brand: Amul',
        'Current employer: Nimbus Cloud Technologies Pvt Ltd',
      ],
      right: [
        'Candidate profile',
        'Name: Pooja Iyer',
        'Previous employer: Orbit Systems',
        'Education: Lakeview Institute',
        'Salary account with Unity Bank, Pune branch.',
        'Favourite snack brand: Amul',
        'Current employer: Orbit Data Systems Pvt Ltd',
      ],
      expected: [
        { category: 'OVER_REDACTED', text: 'Infosys', count: 1, why: 'Infosys is on the business names list (Top MNCs · Indian IT) — must stay' },
        { category: 'OVER_REDACTED', text: 'IIT Bombay', count: 1, why: 'IIT Bombay is on the list (Institutes · Indian) — must stay' },
        { category: 'OVER_REDACTED', text: 'HDFC Bank', count: 1, why: 'HDFC Bank is on the list (Banks · Private) — must stay' },
        { category: 'REDACTED_OK', text: 'Neha Kapoor', count: 1, why: 'person name replaced' },
        { category: 'REDACTED_OK', text: 'Nimbus Cloud Technologies Pvt Ltd', count: 1, why: 'a company not on the list is real Business Name PII, replaced correctly' },
      ],
      notes: 'Amul was kept, which is correct. Known names are underlined dotted green on the left.',
      decide: 'Keep (not PII) on each over-scrubbing item → "Over-redaction: the right side must keep the original words".',
    },
  ];

  g.PIIRA_BUCKET_TASKS = TASKS;
  if (typeof module !== 'undefined') module.exports = TASKS;
})(globalThis);
