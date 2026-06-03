export const metadata = {
  title: "Estate Flow AI — Free AI Growth Audit",
  description: "Find out exactly where your business is losing revenue — and get a personalised AI fix plan in 3 minutes.",
  openGraph: {
    title: "Estate Flow AI — Free AI Growth Audit",
    description: "Answer 25 questions. Get your revenue leak figure + a ranked AI action plan. Free, instant, personalised.",
    type: "website",
  },
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
