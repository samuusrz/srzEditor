import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { DashboardPage } from './pages/DashboardPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { EditorPage } from './pages/EditorPage'
import { TextsPage } from './pages/TextsPage'
import { SongsPage } from './pages/SongsPage'
import { HistoryPage } from './pages/HistoryPage'

type Page = 'dashboard' | 'templates' | 'editor' | 'texts' | 'songs' | 'history'

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  // Editor is full-screen (no sidebar)
  if (page === 'editor') {
    return <EditorPage onBack={() => setPage('dashboard')} />
  }

  const content = {
    dashboard: <DashboardPage onNavigate={setPage} />,
    templates: <TemplatesPage />,
    texts: <TextsPage />,
    songs: <SongsPage />,
    history: <HistoryPage />,
  }[page as Exclude<Page, 'editor'>]

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar current={page} onChange={setPage} />
      <main className="flex-1 overflow-auto">
        {content}
      </main>
    </div>
  )
}
