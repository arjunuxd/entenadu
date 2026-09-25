import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <main className="hero">
      <span className="badge">Under Development</span>
      <h1 className="title">Ente Nadu</h1>
      <p className="tagline">Report. Connect. Resolve.</p>
      <p className="description">
        Ente Nadu is a civic issue reporting and resolution platform that
        connects citizens, AI-assisted complaint processing, administrators,
        and local authorities in one streamlined workflow.
      </p>
      <p className="status">
        The platform is currently under development. Citizen reporting through
        Telegram is coming soon.
      </p>
      <Link className="link" to="/login">
        Staff login
      </Link>
    </main>
  )
}